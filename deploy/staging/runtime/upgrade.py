"""Upgrade an existing fresh runtime using two explicit immutable identities.

No seed, source checkout mutation, image pull, role change or automatic rollback.
"""
import argparse
import datetime
import importlib.util
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

import backup
import contract as c

IDENTITY_KEYS = ('sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256', 'opsSha256')


def previous_identity(args):
    values = {'sourceCommit': args.previous_source, 'testedPlatformConfig': args.previous_config_id,
              'candidateManifestDigest': args.previous_manifest_digest, 'archiveSha256': args.previous_archive_sha256,
              'opsSha256': args.previous_ops_sha256}
    if not re.fullmatch('[a-f0-9]{40}', values['sourceCommit']) or not all(re.fullmatch('sha256:[a-f0-9]{64}', values[key]) for key in ('testedPlatformConfig', 'candidateManifestDigest')) or not all(re.fullmatch('[a-f0-9]{64}', values[key]) for key in ('archiveSha256', 'opsSha256')):
        raise ValueError('Explicit trusted previous release identities are required')
    return values


def validate_transition(deployed, previous, candidate, partial=False):
    if partial:
        raise ValueError('Partial upgrade requires explicit recovery, not replay')
    if not isinstance(deployed, dict) or deployed.get('database') != c.DATABASE or deployed.get('project') != c.PROJECT:
        raise ValueError('Only the previously deployed fresh runtime is an upgrade target')
    if any(deployed.get(key) != previous[key] for key in IDENTITY_KEYS):
        raise ValueError('Recorded runtime differs from the explicit previous release')
    if candidate['sourceCommit'] == previous['sourceCommit'] or candidate['testedPlatformConfig'] == previous['testedPlatformConfig']:
        raise ValueError('Candidate must be a distinct accepted source/config')


def verify_previous(previous):
    directory = c.exact_path(c.ROOT / 'releases' / previous['sourceCommit'])
    for name in ('accepted-image.tar.gz', 'accepted-image.sha256', 'image-identity.json', 'loaded-release.json'):
        c.private_file(directory / name)
    specification = importlib.util.spec_from_file_location('upgrade_previous_release', c.OPS_ROOT / 'verify-release.py')
    verifier = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(verifier)
    report = verifier.verify(directory / 'accepted-image.tar.gz', directory / 'image-identity.json',
                             previous['sourceCommit'], previous['testedPlatformConfig'], previous['candidateManifestDigest'], previous['archiveSha256'])
    loaded = json.loads((directory / 'loaded-release.json').read_text())
    if loaded.get('namespace') != 'runtime' or loaded.get('mode') != 'loaded-and-identity-verified' or any(loaded.get(key) != previous[key] for key in IDENTITY_KEYS[:4]):
        raise ValueError('Previous archive load identity changed')
    image = json.loads(c.run(['docker', 'image', 'inspect', previous['testedPlatformConfig']]))[0]
    if (image['Id'], image['Os'], image['Architecture'], image['Config']['User'], image['Config']['Labels'].get('org.opencontainers.image.revision')) != (previous['testedPlatformConfig'], 'linux', 'amd64', '1001:1001', previous['sourceCommit']):
        raise ValueError('Retained previous image identity changed')
    frozen_ops = c.resolve_ops_bundle(previous['sourceCommit'], previous['opsSha256'])
    return report | {'opsSha256': previous['opsSha256']}, frozen_ops


def runtime_containers():
    ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
    return json.loads(c.run(['docker', 'inspect', *ids])) if ids else []


def validate_writers(items, identity):
    if len(items) != 2 or {item['Config']['Labels'].get('com.docker.compose.service') for item in items} != {'app', 'worker'}:
        raise ValueError('Expected exactly the fresh runtime app/worker pair')
    if any(item['Image'] != identity['testedPlatformConfig'] or item['Config']['User'] != '1001:1001' or
           item['Config']['Labels'].get('org.opencontainers.image.revision') != identity['sourceCommit'] or
           not item['State']['Running'] or item['State'].get('Health', {}).get('Status') != 'healthy' for item in items):
        raise ValueError('Runtime writer image, source, user or health changed')


def validate_backup_manifest(manifest, previous):
    if not isinstance(manifest, dict) or manifest.get('database') != c.DATABASE or any(manifest.get(key) != previous[key] for key in IDENTITY_KEYS):
        raise ValueError('Pre-migration backup does not identify the explicit previous runtime')
    if not isinstance(manifest.get('ciphertextSha256'), dict) or set(manifest['ciphertextSha256']) != {'database.dump.age', 'media.tar.gz.age'} or any(not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value) for value in manifest['ciphertextSha256'].values()):
        raise ValueError('Pre-migration encrypted backup manifest is incomplete')
    if not manifest.get('backupStartUtc') or not manifest.get('backupCompleteUtc'):
        raise ValueError('Pre-migration backup has not completed')


def verified_backup(directory, previous):
    directory = c.exact_path(Path(directory))
    if directory.parent != c.ROOT / 'backups' or not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', directory.name):
        raise ValueError('Pre-migration backup must use the exact runtime namespace')
    manifest = json.loads(c.private_file(directory / 'backup-manifest.json').read_text())
    validate_backup_manifest(manifest, previous)
    for name, expected in manifest['ciphertextSha256'].items():
        with c.private_file(directory / name).open('rb') as stream:
            if __import__('hashlib').file_digest(stream, 'sha256').hexdigest() != expected:
                raise ValueError('Pre-migration backup ciphertext differs from its verified manifest')
    return manifest


def migrations_snapshot():
    value = json.loads(c.psql(c.DATABASE, """SELECT jsonb_build_object('database',current_database(),
      'migrations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'checksum',checksum) ORDER BY name) FROM schema_migration),'[]'::jsonb));"""))
    if value.get('database') != c.DATABASE:
        raise ValueError('Actual migration history came from an unexpected database')
    return value


def validate_migrations(before, after):
    if before.get('database') != c.DATABASE or after.get('database') != c.DATABASE:
        raise ValueError('Unexpected database in migration evidence')
    current = {item['name']: item['checksum'] for item in after['migrations']}
    if len(current) != len(after['migrations']) or any(current.get(item['name']) != item['checksum'] for item in before['migrations']):
        raise ValueError('Applied migration history changed; preserve state for Backend review')


def state_update(state):
    temporary = c.CONFIG / 'upgrading.json.new'
    c.write_private(temporary, json.dumps(state, indent=2) + '\n')
    os.replace(temporary, c.CONFIG / 'upgrading.json')


def atomic_replace_json(path, value):
    temporary = path.with_name(path.name + '.new')
    c.write_private(temporary, json.dumps(value, indent=2) + '\n')
    c.private_file(path)
    os.replace(temporary, path)


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'project': c.PROJECT, 'database': c.DATABASE, 'seedInvoked': False, 'automaticRollback': False}
    if not args.migration_reviewed:
        raise ValueError('Backend migration/schema compatibility review must precede an upgrade')
    # The coordinator already fast-forwarded specifically to the accepted new
    # source and loaded it. This command does neither Git nor image publication.
    candidate = c.verify_release(args)
    previous = previous_identity(args)
    with c.lock():
        if (c.CONFIG / 'preview-transition.json').exists():
            preview = json.loads(c.private_file(c.CONFIG / 'preview-transition.json').read_text())
            if preview.get('phase') not in ('accepted', 'rolled-back'):
                raise ValueError('Pending/failed preview transition must finish before image upgrade')
        deployed = json.loads(c.private_file(c.CONFIG / 'deployed-release.json').read_text())
        partial = any((c.CONFIG / name).exists() for name in ('upgrading.json', 'upgrading.json.new', 'deploy.candidate.env', 'deployed-release.json.new'))
        validate_transition(deployed, previous, candidate, partial)
        previous_report, previous_ops = verify_previous(previous)
        c.db_container(); c.load_configs()
        validate_writers(runtime_containers(), previous)
        current_profile = c.active_profile()
        if current_profile and (current_profile['opsSha256'] != previous['opsSha256'] or any(current_profile[key] != previous[key] for key in c.RELEASE_KEYS)):
            raise ValueError('Upgrade target active profile differs from previous immutable release')
        expected_env = c.compose_environment(previous['testedPlatformConfig'], previous_ops, current_profile)
        if c.private_file(c.CONFIG / 'deploy.env').read_text() != expected_env:
            raise ValueError('Current runtime Compose env differs from the retained previous release')
        next_ops = c.preserve_ops_bundle(candidate['sourceCommit'])
        next_profile = c.make_profile(candidate, current_profile['profile'], c.load_configs()) if current_profile else None
        if next_profile: c.preserve_profile(next_profile)
        old_command = c.compose(previous['testedPlatformConfig'], ops_root=previous_ops)
        next_command = c.compose(candidate['testedPlatformConfig'], env_file=c.CONFIG / 'deploy.candidate.env', ops_root=next_ops)
        before = migrations_snapshot()
        state = {'phase': 'prepared', 'startedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 'previous': previous, 'candidate': candidate, 'migrationBefore': before, 'seedInvoked': False,
                 'backendMigrationReviewed': True, 'automaticRollback': False}
        c.write_private(c.CONFIG / 'upgrading.json', json.dumps(state, indent=2) + '\n')
        c.write_private(c.CONFIG / 'deploy.candidate.env', c.compose_environment(candidate['testedPlatformConfig'], next_ops, next_profile))
        try:
            c.run(old_command + ['config', '--quiet'])
            c.run(next_command + ['config', '--quiet'])
            c.run(old_command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            state['phase'] = 'writers-stopped'; state_update(state)
            result = backup.create_backup(previous_report)
            manifest = verified_backup(result['directory'], previous)
            state |= {'phase': 'backup-verified', 'backupDirectory': result['directory'], 'backupCompleteUtc': manifest['backupCompleteUtc']}
            state_update(state)
            # Commands always use the accepted candidate's guarded CLI bundle;
            # no seed, working-tree SQL or original integration DB is selected.
            for service in ('check-owner', 'check-app'):
                c.run(next_command + ['run', '--rm', '--pull', 'never', '--no-deps', service], timeout=60)
            state['phase'] = 'migration-started'; state_update(state)
            c.run(next_command + ['run', '--rm', '--pull', 'never', '--no-deps', 'migrate'], timeout=180)
            after = migrations_snapshot(); validate_migrations(before, after)
            state |= {'phase': 'migration-applied', 'migrationAfter': after}; state_update(state)
            if next_profile:
                # Persist canonical release/profile before recreating writers.
                c.select_profile(next_profile)
                state['accessProfileSha256'] = c.canonical_hash(next_profile); state_update(state)
            c.run(next_command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app', 'worker'], timeout=210)
            validate_writers(runtime_containers(), candidate)
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=10) as response:
                if response.status != 200: raise ValueError('Candidate runtime readiness failed')
            # Preserve protected prior metadata before atomically promoting the
            # candidate env/record. Scheduling stays gated on NEW acceptance.
            history = c.exact_path(c.CONFIG / 'history')
            history.mkdir(mode=0o700, exist_ok=True)
            if history.stat().st_uid != 0 or history.stat().st_mode & 0o077:
                raise ValueError('Runtime release history ownership changed')
            saved = history / (previous['sourceCommit'] + '.json')
            if saved.exists():
                if json.loads(c.private_file(saved).read_text()) != deployed: raise ValueError('Prior runtime history mismatch')
            else: c.write_private(saved, json.dumps(deployed, indent=2) + '\n')
            c.private_file(c.CONFIG / 'deploy.candidate.env')
            os.replace(c.CONFIG / 'deploy.candidate.env', c.CONFIG / 'deploy.env')
            output = candidate | {'deployedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'project': c.PROJECT, 'database': c.DATABASE,
                                  'previousSourceCommit': previous['sourceCommit'], 'preMigrationBackup': result['directory'],
                                  'migrationBefore': before, 'migrationAfter': after, 'nativeFixtureAcceptance': 'pending'}
            if next_profile: output['accessProfileSha256'] = c.canonical_hash(next_profile)
            atomic_replace_json(c.CONFIG / 'deployed-release.json', output)
            state |= {'phase': 'committed', 'completedUtc': output['deployedUtc'], 'nativeFixtureAcceptance': 'pending'}
            state_update(state)
            c.write_private(c.ROOT / 'releases' / args.source / 'upgrade-result.json', json.dumps(state, indent=2) + '\n')
            c.private_file(c.CONFIG / 'upgrading.json').unlink()
            return {'mode': 'upgraded-ready-native-acceptance-pending', 'sourceCommit': args.source, 'testedPlatformConfig': args.config_id,
                    'database': c.DATABASE, 'preMigrationBackup': result['directory'], 'seedInvoked': False, 'automaticRollback': False}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            # Stop any partially created candidate writers. Never restart the
            # old image automatically after a possibly applied schema change.
            try: c.run(next_command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            except (OSError, ValueError, subprocess.SubprocessError): pass
            state['failedAfterPhase'] = state['phase']; state['phase'] = 'failed-preserved'
            try: state_update(state)
            except (OSError, ValueError): pass
            raise ValueError('Runtime upgrade failed; writers/state/backup require explicit recovery') from None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    c.release_arguments(parser)
    parser.add_argument('--previous-source', required=True)
    parser.add_argument('--previous-config-id', required=True)
    parser.add_argument('--previous-manifest-digest', required=True)
    parser.add_argument('--previous-archive-sha256', required=True)
    parser.add_argument('--previous-ops-sha256', required=True)
    parser.add_argument('--migration-reviewed', action='store_true')
    args = parser.parse_args()
    try: print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('Runtime upgrade stopped. Preserve partial state and reviewed backup; no seed or automatic rollback is attempted.')
        raise SystemExit(1) from None
