"""Encrypted runtime-only logical backup; requires actually stopped writers."""
import argparse
import datetime
import hashlib
import json
import subprocess
from contextlib import nullcontext

import contract as c


def encrypt_stream(command, output, password=None):
    first = subprocess.Popen(command, stdin=subprocess.PIPE if password else subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=c.command_environment(command))
    second = subprocess.Popen(['age', '--encrypt', '--recipients-file', str(c.CONFIG / 'backup-recipients.txt'), '--output', str(output)], stdin=first.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    first.stdout.close()
    try:
        if password:
            first.stdin.write((password + '\n').encode())
            first.stdin.close()
        # No plaintext dump/media file is created. Stderr remains private in memory.
        second.communicate(timeout=180)
        first.stderr.read()
        dump_code = first.wait(timeout=30)
        if second.returncode or dump_code:
            raise ValueError('Encrypted stream failed; partial ciphertext is retained for investigation')
    finally:
        for process in (second, first):
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=10)
                except subprocess.TimeoutExpired: process.kill(); process.wait()


def create_backup(report):
    """Caller holds the release lock and verified release identity; writers are checked here."""
    proven = c.archived_image(report)
    c.match_mapping(report, proven)
    c.db_container()
    c.load_configs()
    deployed = json.loads(c.private_file(c.CONFIG / 'deployed-release.json').read_text())
    c.match_mapping(deployed, proven)
    profile = c.active_profile(required=True)
    c.match_mapping(profile, proven)
    if deployed.get('accessProfileSha256') != c.canonical_hash(profile):
        raise ValueError('Backup active profile differs from the deployed record')
    ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
    containers = json.loads(c.run(['docker', 'inspect', *ids])) if ids else []
    c.validate_app_containers(containers, proven, running=False)
    recipient = c.private_file(c.CONFIG / 'backup-recipients.txt')
    c.run(['age', '--version'])
    password = c.private_file(c.CONFIG / 'db_owner_password').read_text()
    if len(password) != 64 or any(ch not in '0123456789abcdef' for ch in password):
        raise ValueError('Runtime migration-owner password file is invalid')
    name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + __import__('secrets').token_hex(4)
    destination = c.exact_path(c.ROOT / 'backups' / name)
    destination.mkdir(mode=0o700)
    start = datetime.datetime.now(datetime.timezone.utc).isoformat()
    media_bytes = sum(c.exact_path(file).stat().st_size for file in (c.ROOT / 'media').rglob('*') if file.is_file())
    database_bytes = int(c.psql(c.DATABASE, 'SELECT pg_database_size(current_database());'))
    shell = 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec pg_dump -h 127.0.0.1 -U morphiume_runtime_owner -d morphiume_staging_runtime --format custom --no-owner --no-acl'
    encrypt_stream(['docker', 'exec', '-i', c.DB_CONTAINER, 'sh', '-c', shell], destination / 'database.dump.age.partial', password)
    (destination / 'database.dump.age.partial').rename(destination / 'database.dump.age')
    encrypt_stream(['tar', '--directory', str(c.ROOT / 'media'), '--create', '--gzip', '--file', '-', '.'], destination / 'media.tar.gz.age.partial')
    (destination / 'media.tar.gz.age.partial').rename(destination / 'media.tar.gz.age')
    baseline = json.loads(c.psql(c.DATABASE, """SELECT jsonb_build_object('capturedUtc',clock_timestamp(),
      'migrationCount',(SELECT count(*) FROM schema_migration),'customers',(SELECT count(*) FROM "user"),
      'orders',(SELECT count(*) FROM orders),'receipts',(SELECT count(*) FROM payment_receipt),
      'shipments',(SELECT count(*) FROM shipment),'reserved',(SELECT coalesce(sum(reserved),0) FROM inventory_balance),
      'onHand',(SELECT coalesce(sum(on_hand),0) FROM inventory_balance));"""))
    files = {}
    for item in ('database.dump.age', 'media.tar.gz.age'):
        with (destination / item).open('rb') as stream:
            files[item] = hashlib.file_digest(stream, 'sha256').hexdigest()
    manifest = report | {'database': c.DATABASE, 'backupStartUtc': start,
        'backupCompleteUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'businessBaseline': baseline, 'ciphertextSha256': files,
        'databaseBytesEstimate': database_bytes, 'mediaBytes': media_bytes, 'backupOpsSha256': c.ops_digest()}
    c.write_private(destination / 'backup-manifest.json', json.dumps(manifest, indent=2) + '\n')
    for file in destination.iterdir():
        file.chmod(0o600)
    return {'mode': 'encrypted-backup-completed', 'directory': str(destination), 'offsiteEstablished': False, 'restoreAcceptance': 'pending'}


def main(args, locked=False):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'backupRoot': str(c.ROOT / 'backups'), 'offsiteEstablished': False}
    report = c.verify_release(args)
    with nullcontext() if locked else c.lock():
        return create_backup(report)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    c.release_arguments(parser)
    args = parser.parse_args()
    try:
        print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, TypeError, TimeoutError, subprocess.SubprocessError):
        print('Runtime-only encrypted backup stopped; partial state is retained and no original data is modified.')
        raise SystemExit(1) from None
