"""Fresh isolated runtime-only restore; health is not business acceptance."""
import argparse
import datetime
import hashlib
import json
import os
import re
import secrets
import subprocess
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath

import contract as c

RESTORE_DB = 'morphiume_staging_restore'
RESTORE_OWNER = 'morphiume_restore_owner'
RESTORE_APP = 'morphiume_restore_app'
BACKUP_PATTERN = r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}'
PROJECT_PATTERN = r'morphiume-runtime-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{6}'
MAX_MEDIA = 16 * 1024 ** 3


def validate_backup_path(path):
    path = c.exact_path(path)
    if path.parent != c.ROOT / 'backups' or not re.fullmatch(BACKUP_PATTERN, path.name):
        raise ValueError('Only an exact runtime backup directory is accepted')
    return path


def validate_restore_path(path):
    path = c.exact_path(path)
    if path.parent != c.ROOT / 'restore' or not re.fullmatch(PROJECT_PATTERN, path.name):
        raise ValueError('Only an exact fresh runtime restore directory is accepted')
    return path


def media_member(member, seen, total):
    path = PurePosixPath(member.name)
    if path.is_absolute() or '..' in path.parts or '\\' in member.name or '\0' in member.name or len(member.name) > 1024 or not (member.isdir() or member.isfile()):
        raise ValueError('Unsafe restored media member')
    normalized = str(path)
    if normalized in seen or len(seen) >= 65536 or member.size < 0 or member.size > 64 * 1024 ** 2 or total + member.size > MAX_MEDIA:
        raise ValueError('Duplicate or excessive restored media member')
    seen.add(normalized)
    return path, total + member.size


def extract_media(stream, root):
    seen, total = set(), 0
    with tarfile.open(fileobj=stream, mode='r|gz') as archive:
        for member in archive:
            relative, total = media_member(member, seen, total)
            target = c.exact_path(root.joinpath(*relative.parts))
            if not target.is_relative_to(root):
                raise ValueError('Restored media escapes its fresh root')
            if member.isdir():
                target.mkdir(mode=0o750, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | (os.O_NOFOLLOW if hasattr(os, 'O_NOFOLLOW') else 0), 0o640)
                source = archive.extractfile(member)
                with os.fdopen(fd, 'wb') as output:
                    while data := source.read(1024 * 1024):
                        output.write(data)
            if os.name == 'posix':
                os.chown(target, 1001, 1001)
    return {'files': sum(1 for file in root.rglob('*') if file.is_file()), 'bytes': total}


def restore_config(app, password):
    c.validate_config(app, c.APP)
    value = dict(app, DATABASE_URL=f'postgresql://{RESTORE_APP}:{password}@db:5432/{RESTORE_DB}', APP_BASE_URL='http://localhost:3101')
    # Only the runtime auth/control keys are cloned; never old integration keys.
    return value


def decrypt_database(ciphertext, identity, compose):
    first = subprocess.Popen(['age', '--decrypt', '--identity', str(identity), str(ciphertext)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    command = compose + ['exec', '-T', 'db', 'sh', '-c', 'PGPASSWORD="$(cat /run/secrets/db_owner_password)"; export PGPASSWORD; exec pg_restore -h 127.0.0.1 -U morphiume_restore_owner -d morphiume_staging_restore --no-owner --no-acl --exit-on-error --single-transaction']
    second = subprocess.Popen(command, stdin=first.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=c.command_environment(command))
    first.stdout.close()
    try:
        second.communicate(timeout=300)
        first.communicate(timeout=30)
        if first.returncode or second.returncode:
            raise ValueError('Encrypted database restore failed')
    finally:
        for process in (second, first):
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=10)
                except subprocess.TimeoutExpired: process.kill(); process.wait()


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'restoreRoot': str(c.ROOT / 'restore'), 'browserOrigin': 'http://localhost:3101', 'workerStarted': False}
    release = c.verify_release(args)
    with c.lock():
        c.db_container()
        configs = c.load_configs()
        backup = validate_backup_path(args.backup_directory)
        if backup.stat().st_uid != 0 or backup.stat().st_mode & 0o077:
            raise ValueError('Runtime backup directory must be private and root-owned')
        manifest = json.loads(c.private_file(backup / 'backup-manifest.json').read_text())
        if manifest.get('database') != c.DATABASE or any(manifest.get(key) != release[key] for key in ('sourceCommit', 'testedPlatformConfig', 'archiveSha256', 'candidateManifestDigest')):
            raise ValueError('Backup identity differs from accepted runtime release')
        for name in ('database.dump.age', 'media.tar.gz.age'):
            with c.private_file(backup / name).open('rb') as file:
                if hashlib.file_digest(file, 'sha256').hexdigest() != manifest.get('ciphertextSha256', {}).get(name):
                    raise ValueError('Backup ciphertext checksum mismatch')
        identity = c.private_file(args.identity)
        if not (identity.parent.parent == Path('/dev/shm') and re.fullmatch(r'morphiume-runtime-restore-[a-f0-9]{12}', identity.parent.name) and identity.name == 'identity'):
            raise ValueError('Use only the exact protected temporary memory identity directory')
        if identity.parent.stat().st_uid != 0 or identity.parent.stat().st_mode & 0o077:
            raise ValueError('Temporary restore identity directory must be private and root-owned')
        # Keep the initial resource budget bounded: no running runtime writers
        # alongside the temporary DB/app on the 4.8GiB shared staging host.
        if c.run(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']):
            raise ValueError('Stop runtime app/worker before the resource-bounded restore rehearsal')
        if c.run(['docker', 'ps', '--all', '--filter', 'label=morphiume.restore.scope=runtime', '--format', '{{.ID}}']):
            raise ValueError('An existing runtime restore requires explicit recovery; no duplicate or cleanup is attempted')
        free = os.statvfs(c.ROOT)
        if type(manifest.get('databaseBytesEstimate')) is not int or manifest['databaseBytesEstimate'] <= 0 or type(manifest.get('mediaBytes')) is not int or not 0 <= manifest['mediaBytes'] <= MAX_MEDIA:
            raise ValueError('Measured source database/media sizes are required for restore headroom')
        required = 3 * manifest['databaseBytesEstimate'] + 2 * manifest['mediaBytes'] + 1024 ** 3
        if free.f_bavail * free.f_frsize < required:
            raise ValueError('Runtime filesystem lacks conservative restore headroom')
        project = 'morphiume-runtime-restore-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
        root = validate_restore_path(c.ROOT / 'restore' / project)
        root.mkdir(mode=0o700)
        (root / 'postgres').mkdir(mode=0o700); os.chown(root / 'postgres', 999, 999)
        (root / 'media').mkdir(mode=0o750); os.chown(root / 'media', 1001, 1001)
        start = datetime.datetime.now(datetime.timezone.utc).isoformat()
        passwords = {name: secrets.token_hex(32) for name in ('db_bootstrap_password', 'db_owner_password', 'db_app_password')}
        for name, value in passwords.items(): c.write_private(root / name, value, uid=999, gid=999)
        app = restore_config(configs['app.json'], passwords['db_app_password'])
        c.write_private(root / 'app.json', json.dumps(app) + '\n', uid=1001, gid=1001)
        c.write_private(root / 'restore.env', f'MORPHIUME_RESTORE_PROJECT={project}\nMORPHIUME_RESTORE_ROOT={root}\nMORPHIUME_IMAGE={args.config_id}\nMORPHIUME_OPS_ROOT={c.OPS_ROOT}\n')
        c.write_private(root / 'recovery-start.json', json.dumps({'recoveryStartUtc': start, 'backup': str(backup), 'sourceCommit': args.source}) + '\n')
        compose = ['docker', 'compose', '--project-name', project, '--env-file', str(root / 'restore.env'), '-f', str(c.OPS_ROOT / 'runtime/compose.restore.yaml')]
        c.run(compose + ['config', '--quiet'])
        c.run(compose + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'db'], timeout=210)
        check = "PGPASSWORD=\"$(cat /run/secrets/db_owner_password)\"; export PGPASSWORD; exec psql -h 127.0.0.1 -U morphiume_restore_owner -d morphiume_staging_restore -X -qAt --set ON_ERROR_STOP=1 -c \"SELECT current_database() || '|' || current_user\""
        if c.run(compose + ['exec', '-T', 'db', 'sh', '-c', check]) != RESTORE_DB + '|' + RESTORE_OWNER:
            raise ValueError('Actual restore DB/owner identity mismatch')
        decrypt_database(backup / 'database.dump.age', identity, compose)
        process = subprocess.Popen(['age', '--decrypt', '--identity', str(identity), str(backup / 'media.tar.gz.age')], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            media = extract_media(process.stdout, root / 'media')
            process.communicate(timeout=30)
            if process.returncode: raise ValueError('Encrypted media restore failed')
            if media['bytes'] != manifest['mediaBytes']: raise ValueError('Restored media size differs from the captured writer-free baseline')
        finally:
            if process.poll() is None: process.terminate(); process.wait(timeout=10)
        # The copied auth keys support native fresh login at the separate origin.
        # No worker service exists; restoring readiness alone is not acceptance.
        c.run(compose + ['--profile', 'application', 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app'], timeout=210)
        with urllib.request.urlopen('http://127.0.0.1:3002/api/health/ready', timeout=10) as response:
            if response.status != 200: raise ValueError('Restore readiness failed')
        ids = c.run(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + project, '--format', '{{.ID}}']).splitlines()
        actual = json.loads(c.run(['docker', 'inspect', *ids])) if ids else []
        services = {item['Config']['Labels'].get('com.docker.compose.service'): item for item in actual}
        if set(services) != {'app', 'db'} or services['app']['Image'] != args.config_id or services['app']['Config']['User'] != '1001:1001' or any(item['State'].get('Health', {}).get('Status') != 'healthy' for item in actual):
            raise ValueError('Actual restored app/database image, user or health differs from the reviewed contract')
        report = {'mode': 'restored-ready-business-acceptance-pending', 'project': project, 'root': str(root), 'browserOrigin': 'http://localhost:3101',
                  'sourceCommit': args.source, 'testedPlatformConfig': args.config_id, 'recoveryStartUtc': start,
                  'applicationReadyUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'backupStartUtc': manifest['backupStartUtc'],
                  'backupCompleteUtc': manifest['backupCompleteUtc'], 'mediaSummary': media, 'workerStarted': False}
        c.write_private(root / 'recovery-ready.json', json.dumps(report, indent=2) + '\n')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    c.release_arguments(parser)
    parser.add_argument('--backup-directory', required=True, type=Path)
    parser.add_argument('--identity', required=True, type=Path)
    args = parser.parse_args()
    try: print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError, subprocess.SubprocessError):
        print('Runtime restore stopped. Fresh partial state is retained; no source database, original data or key is reset.')
        raise SystemExit(1) from None
