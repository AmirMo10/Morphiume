"""One-shot recovery for the exact untouched pre-service591 restore root.

Independent operator tool, outside OPS_FILES. Default is a public static plan.
Apply requires published tool bytes/source, immutable old Ops, accepted image,
explicit released window and all private state hashes. No restart/resume/reset.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

APP_SOURCE = '6130f4ed7ec090344a5a4a1937a65ef04572975b'
OLD_OPS = '591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db'
ROOT = Path('/srv/morphiume/staging/runtime')
LEGACY_NAME = 'morphiume-runtime-restore-20261012T212729Z-d03c35'
PROJECT = LEGACY_NAME.lower()
BACKUP_NAME = '20261012T212644Z-fe6ca5ce'
IDENTITY = Path('/dev/shm/morphiume-runtime-restore-bb5ee620fd72/identity')
OLD_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py',
    'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py',
    'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py', 'runtime/monitor.py',
    'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py', 'runtime/operator-config.mjs', 'runtime/engine_image.py',
    'runtime/systemd/morphiume-runtime-backup.service', 'runtime/systemd/morphiume-runtime-backup.timer',
    'runtime/systemd/morphiume-runtime-health.service', 'runtime/systemd/morphiume-runtime-health.timer')
PREPARED = {'app.json': 1001, 'restore.env': 0, 'recovery-start.json': 0,
            'db_bootstrap_password': 999, 'db_owner_password': 999, 'db_app_password': 999}
STAGES = ('compose-validation', 'db-initialization', 'db-identity', 'database-restore', 'media-restore', 'app-start', 'readiness', 'ready-record')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def exact(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path or any(item.is_symlink() for item in (path, *path.parents)):
        raise ValueError('Exact nonsymlink path is required')
    return path


def metadata(path, uid, mode, directory=False):
    path = exact(path); stat = path.stat()
    if stat.st_uid != uid or stat.st_gid != uid or stat.st_mode & 0o777 != mode or (not path.is_dir() if directory else not path.is_file()) or not directory and stat.st_nlink != 1:
        raise ValueError('Protected state ownership/type/mode/link changed')
    return path


def trusted_hash(value):
    if not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value): raise ValueError('Explicit trusted SHA256 is required')
    return value


def validate_tool_binding(record, args, actual_hash):
    expected = {'sourceCommit': args.tool_source, 'toolSha256': args.tool_sha256, 'applicationSourceCommit': APP_SOURCE, 'opsSha256': OLD_OPS}
    if not re.fullmatch('[a-f0-9]{40}', args.tool_source) or not isinstance(record, dict) or record != expected or actual_hash != trusted_hash(args.tool_sha256):
        raise ValueError('Published tool/source identity mismatch')


def validate_case(args):
    if args.source != APP_SOURCE or args.ops_sha256 != OLD_OPS or args.project != PROJECT or Path(args.restore_root).as_posix() != (ROOT / 'restore' / LEGACY_NAME).as_posix() or Path(args.backup_directory).as_posix() != (ROOT / 'backups' / BACKUP_NAME).as_posix() or Path(args.identity).as_posix() != IDENTITY.as_posix():
        raise ValueError('Only the explicitly reviewed pre-service case is recoverable')
    for value in (args.profile_sha256, args.fixture_sha256, args.backup_manifest_sha256): trusted_hash(value)
    if not args.quiescent_window_released: raise ValueError('Coordinator shared-window release is required')


def verify_tool(args):
    file = exact(Path(__file__))
    parent = ROOT / 'releases' / APP_SOURCE / 'tools' / trusted_hash(args.tool_sha256)
    if file != parent / 'recover-pre-service-restore.py': raise ValueError('Use the immutable published tool path')
    metadata(parent, 0, 0o700, True); metadata(file, 0, 0o644)
    for directory in parent.parents:
        if directory == ROOT: break
        metadata(directory, 0, 0o700, True)
    record = json.loads(metadata(parent / 'tool-identity.json', 0, 0o600).read_text())
    validate_tool_binding(record, args, sha(file.read_bytes().replace(b'\r\n', b'\n')))


def load_old_ops():
    """Verify every old file BEFORE executing imports; never import working Ops."""
    bundle = ROOT / 'releases' / APP_SOURCE / 'ops-bundles' / OLD_OPS / 'ops'
    metadata(bundle, 0, 0o700, True)
    for directory in bundle.parents:
        if directory == ROOT: break
        metadata(directory, 0, 0o700, True)
    manifest = json.loads(metadata(bundle / 'ops-manifest.json', 0, 0o600).read_text())
    if not isinstance(manifest, dict) or set(manifest) != set(OLD_FILES): raise ValueError('Immutable old Ops file set changed')
    actual = {}
    for name in OLD_FILES:
        file = metadata(bundle / name, 0, 0o644)
        actual[name] = sha(file.read_bytes().replace(b'\r\n', b'\n'))
    if actual != manifest or sha(canonical(actual).encode()) != OLD_OPS: raise ValueError('Immutable old Ops bytes changed')
    sys.dont_write_bytecode = True
    directory = bundle / 'runtime'
    for name in ('contract', 'restore'):
        if name in sys.modules: raise ValueError('Unexpected preloaded Ops module')
        specification = importlib.util.spec_from_file_location(name, directory / (name + '.py'))
        module = importlib.util.module_from_spec(specification); sys.modules[name] = module
        specification.loader.exec_module(module)
    c, r = sys.modules['contract'], sys.modules['restore']
    if c.OPS_ROOT != bundle or c.ops_digest() != OLD_OPS: raise ValueError('Imported Ops source identity changed')
    return c, r


def disable_old_ops_caches(prefix):
    """Redirect ALL SourceFileLoader caches without deleting/writing any cache."""
    prefix = exact(prefix)
    if prefix.name != 'unused-bytecode-cache' or prefix.exists() or prefix.is_symlink():
        raise ValueError('Old Ops cache prefix must be exact and entirely nonexistent')
    sys.pycache_prefix = str(prefix)
    sys.dont_write_bytecode = True
    return prefix


def hashed_private(c, path, expected, uid=0):
    value = c.private_file(path, uid=uid).read_bytes()
    if len(value) > 1024 ** 2 or sha(value) != trusted_hash(expected): raise ValueError('Explicit protected state hash differs')
    return value


def validate_partial(root):
    metadata(root, 0, 0o700, True)
    if {item.name for item in root.iterdir()} != set(PREPARED) | {'postgres', 'media'}:
        raise ValueError('Unknown/partial/replayed recovery state is retained for review')
    for name, uid in PREPARED.items(): metadata(root / name, uid, 0o600)
    for name, uid, mode in (('postgres', 999, 0o700), ('media', 1001, 0o750)):
        directory = metadata(root / name, uid, mode, True)
        if any(directory.iterdir()): raise ValueError('Recovery requires entirely untouched PG/media directories')


def environment(project, root, image, bundle):
    if project != PROJECT or root.as_posix() != (ROOT / 'restore' / LEGACY_NAME).as_posix() or not re.fullmatch('sha256:[a-f0-9]{64}', image): raise ValueError('Unexpected forward-recovery environment identity')
    return f'MORPHIUME_RESTORE_PROJECT={project}\nMORPHIUME_RESTORE_ROOT={root}\nMORPHIUME_IMAGE={image}\nMORPHIUME_OPS_ROOT={bundle}\n'


def snapshot_media(c, r, directory):
    """Private bounded full-file snapshot; paths/bytes never enter shared output."""
    c.exact_path(directory)
    result = {}; total = 0
    for path in directory.rglob('*'):
        c.exact_path(path)
        if path.is_dir(): continue
        stat = path.stat()
        if not path.is_file() or stat.st_nlink != 1 or stat.st_size > 64 * 1024 ** 2 or len(result) >= 65536:
            raise ValueError('Unsafe or excessive media source/restoration')
        total += stat.st_size
        if total > r.MAX_MEDIA: raise ValueError('Total media exceeds the reviewed size boundary')
        with path.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        result[path.relative_to(directory).as_posix()] = {'sha256': digest, 'bytes': stat.st_size}
    return result


def validate_fixture_media(fixture, snapshot):
    media = fixture.get('media')
    if not isinstance(media, list) or not 1 <= len(media) <= 64: raise ValueError('Retained public media evidence is incomplete')
    seen = set()
    for item in media:
        if not isinstance(item, dict) or not re.fullmatch('[a-f0-9]{64}', str(item.get('sha256', ''))): raise ValueError('Invalid retained media digest')
        url = item.get('url')
        if not isinstance(url, str) or not re.fullmatch(r'/media/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp', url): raise ValueError('Only the exact public UUID media route is accepted')
        path = 'public/' + url.removeprefix('/media/')
        if path in seen or path not in snapshot or snapshot[path]['sha256'] != item['sha256']: raise ValueError('Retained public media does not match physical source/restoration')
        seen.add(path)


def validate_media_snapshot(actual, expected):
    if actual != expected: raise ValueError('Full restored private/public media differs from the paused source')


def preflight(args, c, r, release):
    validate_case(args)
    root = c.exact_path(Path(args.restore_root)); validate_partial(root)
    if c.canonical_hash(c.active_profile(required=True)) != args.profile_sha256: raise ValueError('Active retained profile changed')
    profile = c.active_profile(required=True); c.match_mapping(profile, release)
    configs = c.load_configs(); c.db_container()
    if profile['profile'] != 'ssh-localhost': raise ValueError('Only the retained SSH3100 profile is eligible')
    if c.run(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']): raise ValueError('Runtime writers must remain paused')
    if c.run(['docker', 'ps', '--all', '--filter', 'label=morphiume.restore.scope=runtime', '--format', '{{.ID}}']): raise ValueError('An existing restore container forbids pre-service recovery')
    if c.run(['docker', 'network', 'ls', '--filter', 'label=com.docker.compose.project=' + PROJECT, '--format', '{{.ID}}']): raise ValueError('Unexpected pre-existing recovery network')
    backup = r.validate_backup_path(Path(args.backup_directory)); c.private_directory(backup)
    manifest = json.loads(hashed_private(c, backup / 'backup-manifest.json', args.backup_manifest_sha256))
    r.validate_backup_identity(manifest, release)
    for name in ('database.dump.age', 'media.tar.gz.age'):
        with c.private_file(backup / name).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != manifest['ciphertextSha256'][name]: raise ValueError('Completed backup ciphertext changed')
    fixture_file = c.CONFIG / 'retained-fixture.json'
    fixture = json.loads(hashed_private(c, fixture_file, args.fixture_sha256))
    metadata(IDENTITY.parent, 0, 0o700, True); metadata(IDENTITY, 0, 0o600)
    hashes = {name: sha((root / name).read_bytes()) for name in PREPARED}
    passwords = {name: (root / name).read_text() for name in ('db_bootstrap_password', 'db_owner_password', 'db_app_password')}
    if len(set(passwords.values())) != 3 or any(not re.fullmatch('[a-f0-9]{64}', item) for item in passwords.values()): raise ValueError('Existing independent restore secrets are invalid')
    app = json.loads((root / 'app.json').read_text())
    if app != r.restore_config(configs['app.json'], passwords['db_app_password'], profile='ssh-localhost'): raise ValueError('Retained restore app configuration changed')
    old_env = environment(PROJECT, root, c.runtime_image(release), c.OPS_ROOT).replace('MORPHIUME_RESTORE_PROJECT=' + PROJECT, 'MORPHIUME_RESTORE_PROJECT=' + LEGACY_NAME)
    if (root / 'restore.env').read_text() != old_env: raise ValueError('Old prepared environment changed')
    start = json.loads((root / 'recovery-start.json').read_text())
    if set(start) != {'recoveryStartUtc', 'backup', 'sourceCommit'} or start['backup'] != str(backup) or start['sourceCommit'] != APP_SOURCE or not isinstance(start['recoveryStartUtc'], str): raise ValueError('Original recovery start provenance changed')
    parsed = datetime.datetime.fromisoformat(start['recoveryStartUtc'])
    if parsed.tzinfo is None or parsed.utcoffset() != datetime.timedelta(0): raise ValueError('Original recovery start must remain actual UTC')
    if type(manifest.get('databaseBytesEstimate')) is not int or manifest['databaseBytesEstimate'] <= 0 or type(manifest.get('mediaBytes')) is not int or not 0 <= manifest['mediaBytes'] <= r.MAX_MEDIA: raise ValueError('Actual source size bounds are required')
    source_media = snapshot_media(c, r, c.ROOT / 'media')
    validate_fixture_media(fixture, source_media)
    if sum(item['bytes'] for item in source_media.values()) != manifest['mediaBytes']: raise ValueError('Paused source media size differs from completed backup')
    free = os.statvfs(ROOT)
    if free.f_bavail * free.f_frsize < 3 * manifest['databaseBytesEstimate'] + 2 * manifest['mediaBytes'] + 1024 ** 3: raise ValueError('Conservative restore headroom is insufficient')
    return {'root': root, 'manifest': manifest, 'fixture': fixture, 'hashes': hashes, 'start': start, 'identitySha256': sha(IDENTITY.read_bytes()), 'sourceMediaSha256': source_media}


def update(c, root, state, phase):
    state['phase'] = phase
    state['events'].append({'phase': phase, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    temporary = root / 'recovery-journal.json.new'
    c.write_private(temporary, json.dumps(state, indent=2) + '\n')
    c.private_file(root / 'recovery-journal.json')
    os.replace(temporary, root / 'recovery-journal.json')


def media_restore(c, r, context):
    root = context['root']
    process = subprocess.Popen(['age', '--decrypt', '--identity', str(IDENTITY), str(Path(context['start']['backup']) / 'media.tar.gz.age')], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        result = r.extract_media(process.stdout, root / 'media')
        process.communicate(timeout=30)
        if process.returncode or result['bytes'] != context['manifest']['mediaBytes']: raise ValueError('Encrypted media restore size/status differs')
        actual = snapshot_media(c, r, root / 'media')
        validate_media_snapshot(actual, context['sourceMediaSha256'])
        validate_fixture_media(context['fixture'], actual)
        return result
    finally:
        if process.poll() is None: process.terminate(); process.wait(timeout=10)


def forward(args, c, r, release, context):
    root = context['root']
    state = {key: release[key] for key in c.RELEASE_KEYS + ('opsSha256', 'runtimeImageId', 'engineProofSha256')}
    state |= {'version': 1, 'toolSha256': args.tool_sha256, 'toolSourceCommit': args.tool_source, 'profileSha256': args.profile_sha256,
        'fixtureSha256': args.fixture_sha256, 'backupManifestSha256': args.backup_manifest_sha256, 'root': str(root), 'project': PROJECT,
        'backup': str(args.backup_directory), 'originalRecoveryStartUtc': context['start']['recoveryStartUtc'],
        'preparedFileSha256': context['hashes'], 'ciphertextSha256': context['manifest']['ciphertextSha256'], 'identitySha256': context['identitySha256'],
        'sourceMediaSha256': context['sourceMediaSha256'],
        'workerStarted': False, 'automaticResume': False, 'events': [], 'phase': 'preflight-verified'}
    # Exclusive files make this one-shot; an existing journal/env forbids replay.
    c.write_private(root / 'recovery-journal.json', json.dumps(state, indent=2) + '\n')
    try:
        c.write_private(root / 'restore.recovery.env', environment(PROJECT, root, c.runtime_image(release), c.OPS_ROOT))
        command = ['docker', 'compose', '--project-name', PROJECT, '--env-file', str(root / 'restore.recovery.env'), '-f', str(c.OPS_ROOT / 'runtime/compose.restore.yaml')]
        update(c, root, state, 'compose-validation-started'); c.run(command + ['config', '--quiet'])
        update(c, root, state, 'db-initialization-started')
        c.run(command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'db'], timeout=210)
        update(c, root, state, 'db-identity-started')
        check = 'PGPASSWORD="$(cat /run/secrets/db_owner_password)"; export PGPASSWORD; exec psql -h 127.0.0.1 -U morphiume_restore_owner -d morphiume_staging_restore -X -qAt --set ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT current_database() || \'|\' || current_user; COMMIT;"'
        if c.run(command + ['exec', '-T', 'db', 'sh', '-c', check]) != r.RESTORE_DB + '|' + r.RESTORE_OWNER: raise ValueError('Actual isolated DB/owner identity changed')
        update(c, root, state, 'database-restore-started')
        r.decrypt_database(Path(args.backup_directory) / 'database.dump.age', IDENTITY, command)
        update(c, root, state, 'media-restore-started'); media = media_restore(c, r, context)
        update(c, root, state, 'app-start-started')
        c.run(command + ['--profile', 'application', 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app'], timeout=210)
        update(c, root, state, 'readiness-started')
        with urllib.request.urlopen('http://127.0.0.1:3002/api/health/ready', timeout=10) as response:
            if response.status != 200: raise ValueError('Isolated restore readiness failed')
        ids = c.run(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + PROJECT, '--format', '{{.ID}}']).splitlines()
        r.validate_restored_containers(json.loads(c.run(['docker', 'inspect', *ids])) if ids else [], release)
        # All prepared files remain byte-identical, including old env/start/secrets.
        if any(sha((root / name).read_bytes()) != expected for name, expected in context['hashes'].items()) or sha(IDENTITY.read_bytes()) != context['identitySha256']:
            raise ValueError('Prepared state/temporary identity changed during forward recovery')
        update(c, root, state, 'ready-record-started')
        ready = state | {'mode': 'restored-ready-business-acceptance-pending', 'browserOrigin': 'http://localhost:3101',
            'recoveryStartUtc': context['start']['recoveryStartUtc'], 'applicationReadyUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'backupStartUtc': context['manifest']['backupStartUtc'], 'backupCompleteUtc': context['manifest']['backupCompleteUtc'], 'mediaSummary': media}
        c.write_private(root / 'recovery-ready.json', json.dumps(ready, indent=2) + '\n')
        state['readyRecordSha256'] = sha((root / 'recovery-ready.json').read_bytes())
        update(c, root, state, 'ready-business-acceptance-pending')
        return {'mode': 'restored-ready-business-acceptance-pending', 'project': PROJECT, 'root': str(root), 'workerStarted': False, 'automaticResume': False}
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError, EOFError, subprocess.SubprocessError):
        failed = state['phase']
        # Only a possibly started RESTORE app is withdrawn; DB/state stay intact.
        if failed in ('app-start-started', 'readiness-started', 'ready-record-started'):
            try: c.run(command + ['stop', '--timeout', '30', 'app'], timeout=60)
            except (OSError, ValueError, subprocess.SubprocessError): state['appWithdrawalFailed'] = True
        state['failedAfterPhase'] = failed
        try: update(c, root, state, 'failed-preserved-no-resume')
        except (OSError, ValueError): pass
        raise ValueError('Forward recovery failed; retain journal/state, no automatic resume or reset') from None


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'legacyPhysicalRoot': str(ROOT / 'restore' / LEGACY_NAME), 'project': PROJECT, 'oldOpsSha256': OLD_OPS, 'workerStarted': False, 'serverMutation': False}
    if os.name != 'posix' or os.getuid() != 0: raise ValueError('Explicit apply needs the authorized Linux root session')
    validate_case(args); verify_tool(args)
    cache_prefix = disable_old_ops_caches(Path(__file__).parent / 'unused-bytecode-cache')
    c, r = load_old_ops()
    release = c.verify_release(args)  # Five trusted old bindings remain unchanged.
    if cache_prefix.exists(): raise ValueError('Unexpected bytecode prefix appeared; no apply is allowed')
    with c.lock():
        context = preflight(args, c, r, release)
        return forward(args, c, r, release, context)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('source', 'config-id', 'manifest-digest', 'archive-sha256', 'ops-sha256', 'profile-sha256', 'tool-sha256', 'tool-source', 'fixture-sha256', 'backup-manifest-sha256', 'project'):
        parser.add_argument('--' + flag, required=True)
    for flag in ('restore-root', 'backup-directory', 'identity'): parser.add_argument('--' + flag, required=True, type=Path)
    parser.add_argument('--quiescent-window-released', action='store_true'); parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try: print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError, EOFError, subprocess.SubprocessError):
        print('Pre-service recovery stopped. Preserve exact state/key and journal; no replay, rotation or reset is authorized.')
        raise SystemExit(1) from None
