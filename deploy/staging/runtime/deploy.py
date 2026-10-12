"""First deployment only; a partial or existing runtime needs explicit recovery."""
import argparse
import datetime
import json
import os
import subprocess
import urllib.request

import contract as c


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'project': c.PROJECT, 'browserOrigin': 'http://localhost:3100', 'applicationStarted': False}
    report = c.verify_release(args)
    with c.lock():
        network_id = c.db_container()
        c.load_configs()
        state = json.loads(c.private_file(c.CONFIG / 'setup-state.json').read_text())
        ready = json.loads(c.private_file(c.ROOT / 'database-ready.json').read_text())
        if state.get('phase') != 'ready' or ready.get('databaseNetworkId') != network_id or any(ready.get(key) != report[key] for key in ('sourceCommit', 'testedPlatformConfig', 'opsSha256')):
            raise ValueError('Prepared namespace does not match the accepted release/network')
        if (c.CONFIG / 'deployed-release.json').exists() or c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']):
            raise ValueError('Existing or partial runtime deployment requires recovery')
        table_count = int(c.psql(c.DATABASE, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');"))
        if table_count:
            raise ValueError('First deployment requires a pristine runtime schema; never repeat seed/migration blindly')
        profile = c.active_profile(required=True)
        if profile['profile'] != 'ssh-localhost' or any(profile[key] != report[key] for key in c.RELEASE_KEYS + ('opsSha256',)):
            raise ValueError('First deployment requires the accepted SSH-only profile')
        frozen_ops = c.resolve_ops_bundle(args.source, args.ops_sha256)
        expected_env = c.compose_environment(args.config_id, frozen_ops, profile)
        if c.private_file(c.CONFIG / 'deploy.env').read_text() != expected_env:
            raise ValueError('Private Compose identity or ops path changed')
        c.private_file(c.CONFIG / 'bootstrap.env')
        command = c.compose(args.config_id)
        c.run(command + ['config', '--quiet'])
        c.run(command + ['run', '--rm', '--pull', 'never', '--no-deps', 'check-owner'], timeout=60)
        c.run(command + ['run', '--rm', '--pull', 'never', '--no-deps', 'check-app'], timeout=60)
        c.run(command + ['run', '--rm', '--pull', 'never', '--no-deps', 'migrate'], timeout=180)
        c.run(command + ['run', '--rm', '--pull', 'never', '--no-deps', 'seed'], timeout=90)
        # A pristine DB has no business state to back up before this first
        # synthetic seed. Subsequent release operations are intentionally refused.
        c.run(command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app', 'worker'], timeout=210)
        with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=10) as response:
            if response.status != 200:
                raise ValueError('Fresh runtime readiness failed')
        containers = c.run(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
        actual = json.loads(c.run(['docker', 'inspect', *containers]))
        if {item['Config']['Labels'].get('com.docker.compose.service') for item in actual} != {'app', 'worker'} or any(item['Image'] != args.config_id or item['Config']['User'] != '1001:1001' or item['State'].get('Health', {}).get('Status') != 'healthy' for item in actual):
            raise ValueError('Running fresh runtime identity, user or health mismatch')
        output = report | {'deployedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'project': c.PROJECT, 'database': c.DATABASE,
                           'accessProfileSha256': c.canonical_hash(profile)}
        c.write_private(c.CONFIG / 'deployed-release.json', json.dumps(output, indent=2) + '\n')
        return {'mode': 'deployed', 'project': c.PROJECT, 'database': c.DATABASE, 'browserOrigin': 'http://localhost:3100',
                'applicationStarted': True, 'nativeFixtureRestoreAcceptance': 'pending'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    c.release_arguments(parser)
    args = parser.parse_args()
    try:
        print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('Fresh runtime deployment stopped. Keep partial state and investigate; no original services or data were reset.')
        raise SystemExit(1) from None
