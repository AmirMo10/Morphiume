#!/usr/bin/env python3
"""Source-only E4 lease dispatcher; no installation, default is a plan.

A separately reviewed prefix drop-in routes the frozen generated service here.
Only a verified systemd invocation may execute the unchanged Ops68 expire action.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from types import SimpleNamespace

ROOT = Path('/srv/morphiume/staging/runtime')
SOURCE = 'e4bed691dc938a9c0f79022696d24f063ad97724'
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
BUNDLE = ROOT / 'releases' / SOURCE / 'ops-bundles' / OPS / 'ops'
DROPIN = Path('/etc/systemd/system/morphiume-runtime-preview-.service.d/10-e4-verified-lease.conf')
UNIT = re.compile(r'morphiume-runtime-preview-[a-f0-9]{12}\.service')
HASH = re.compile('[a-f0-9]{64}')
COMMIT = re.compile('[a-f0-9]{40}')
EXPECTED = {'sourceCommit': SOURCE, 'opsSha256': OPS,
 'testedPlatformConfig': 'sha256:246b9226db86bf63b37499c2b4a80c2e5e8f62265b3546674de48c480f524665',
 'candidateManifestDigest': 'sha256:dea7a91aa15b8ea653f92d68aee16a168a204f8c0da79a2459e5f748df659c47',
 'archiveSha256': 'aed2f8a7b868d32410c55708042dcf945a0491a1f747632df16689e3d072432c',
 'runtimeImageId': 'sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d',
 'engineProofSha256': '3f1b15a278706ac09be6f644b2042728b1a5ae3cacf3dfb5315181c51de03810'}
OPS_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py',
 'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py',
 'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py', 'runtime/monitor.py',
 'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py', 'runtime/operator-config.mjs',
 'runtime/engine_image.py', 'runtime/systemd/morphiume-runtime-backup.service',
 'runtime/systemd/morphiume-runtime-backup.timer', 'runtime/systemd/morphiume-runtime-health.service',
 'runtime/systemd/morphiume-runtime-health.timer')


def need(value):
    if not value: raise ValueError('Verified E4 preview lease guard failed')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def parse(value):
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result); result[key] = value
        return result
    return json.loads(value, object_pairs_hook=pairs, parse_constant=lambda _: need(False))


def timestamp(value):
    need(isinstance(value, str))
    result = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(result.tzinfo is not None and result.utcoffset() == datetime.timedelta(0))
    return result


def metadata(path, mode, directory=False):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path)
    for parent in path.parents:
        info = parent.lstat()
        need(parent.is_dir() and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o777 == mode)
    need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and info.st_size <= 1024**2)
    return path


def validate_arguments(args):
    need(isinstance(args.tool_sha256, str) and HASH.fullmatch(args.tool_sha256))
    need(isinstance(args.tool_source_commit, str) and COMMIT.fullmatch(args.tool_source_commit))
    need(Path(args.ops_root) == BUNDLE)
    return ROOT / 'releases' / SOURCE / 'tools' / args.tool_sha256


def command(args, unit='%n'):
    parent = validate_arguments(args)
    need(unit == '%n' or UNIT.fullmatch(unit))
    return ['/usr/bin/python3', '-I', '-B', '-X', 'pycache_prefix=' + str(parent / 'unused-bytecode-cache'),
        str(parent / 'e4-preview-lease-bootstrap.py'), '--tool-source-commit', args.tool_source_commit,
        '--tool-sha256', args.tool_sha256, '--ops-root', str(BUNDLE), '--unit', unit, '--execute']


def dropin(args):
    parent = validate_arguments(args); prefix = parent / 'unused-bytecode-cache'
    # Prefix applies before frozen install_lease() reloads/enables any new timer.
    # No environment-file, credentials, restart, timer or budget override.
    return ('[Service]\nEnvironmentFile=\nEnvironment=PYTHONDONTWRITEBYTECODE=1\n'
        'ExecStartPre=\nExecStartPre=/usr/bin/test ! -e ' + str(prefix) + '\n'
        'ExecStartPre=/usr/bin/test ! -L ' + str(prefix) + '\nExecStart=\nExecStart=' + ' '.join(command(args)) + '\n')


def verified_sources(args):
    need(os.name == 'posix' and os.getuid() == 0)
    parent = validate_arguments(args)
    metadata(parent, 0o700, True)
    tool = metadata(Path(__file__), 0o644)
    need(tool == parent / 'e4-preview-lease-bootstrap.py' and sha(tool.read_bytes()) == args.tool_sha256)
    cache_guard(parent)
    metadata(BUNDLE, 0o700, True)
    manifest = parse(metadata(BUNDLE / 'ops-manifest.json', 0o600).read_bytes())
    need(type(manifest) is dict and set(manifest) == set(OPS_FILES))
    sources = {}
    for name in OPS_FILES:
        data = metadata(BUNDLE / name, 0o644).read_bytes().replace(b'\r\n', b'\n')
        sources[name] = data
    verify_manifest(manifest, sources)
    need(metadata(DROPIN.parent, 0o700, True) == DROPIN.parent)
    need(metadata(DROPIN, 0o644).read_text() == dropin(args))
    return parent, sources


def cache_guard(parent):
    prefix = parent / 'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink())
    # Before all Ops imports and all dynamic helper SourceFileLoader reads.
    sys.dont_write_bytecode = True; sys.pycache_prefix = str(prefix)


def verify_manifest(manifest, sources):
    need(type(manifest) is dict and set(manifest) == set(OPS_FILES) and set(sources) == set(OPS_FILES))
    for name in OPS_FILES:
        need(isinstance(manifest[name], str) and HASH.fullmatch(manifest[name]) and sha(sources[name]) == manifest[name])
    need(sha(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()) == OPS)


def import_verified(sources):
    names = ('contract', 'backup', 'upgrade', 'preview')
    need(not any(name in sys.modules for name in names))
    modules = {}
    for name in names:
        path = BUNDLE / 'runtime' / (name + '.py')
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec); sys.modules[name] = module
        # Execute the bytes that were verified, never cached bytecode.
        exec(compile(sources['runtime/' + name + '.py'], str(path), 'exec'), module.__dict__)
        modules[name] = module
    need(modules['contract'].ops_digest() == OPS)
    return modules['contract'], modules['preview']


def clean_environment(invocation):
    need(isinstance(invocation, str) and re.fullmatch('[a-f0-9]{32}', invocation))
    os.environ.clear()
    os.environ.update(PATH='/usr/sbin:/usr/bin:/sbin:/bin', LANG='C.UTF-8', INVOCATION_ID=invocation)


def properties(text):
    result = {}
    for line in text.splitlines():
        if not line: continue
        need('=' in line)
        key, value = line.split('=', 1)
        need(key not in result); result[key] = value
    return result


PROPERTIES = ('Id', 'Names', 'LoadState', 'FragmentPath', 'DropInPaths', 'Type', 'User',
              'UMask', 'TimeoutStartUSec', 'Restart', 'EnvironmentFiles', 'ExecStart', 'InvocationID', 'ActiveState')


def validate_effective(value, args, invocation):
    need(set(value) == set(PROPERTIES))
    need(value['Id'] == args.unit and value['Names'] == args.unit and value['LoadState'] == 'loaded')
    need(value['FragmentPath'] == '/etc/systemd/system/' + args.unit and value['DropInPaths'] == str(DROPIN))
    need(value['Type'] == 'oneshot' and value['User'] == 'root' and value['UMask'] == '0077')
    need(value['TimeoutStartUSec'] == '2min' and value['Restart'] == 'no' and value['EnvironmentFiles'] == '')
    need(value['InvocationID'] == invocation and value['ActiveState'] in ('activating', 'active'))
    # Runtime counters are intentionally not used as execution timestamps.
    entry = value['ExecStart']
    need(entry.startswith('{ ') and entry.endswith(' }') and entry.count('argv[]=') == 1)
    fields = {}
    for item in entry[2:-2].split(' ; '):
        need('=' in item)
        key, text = item.split('=', 1); need(key not in fields); fields[key] = text
    need(set(fields) <= {'path', 'argv[]', 'ignore_errors', 'start_time', 'stop_time', 'pid', 'code', 'status'})
    need(fields.get('path') == '/usr/bin/python3' and fields.get('argv[]') == ' '.join(command(args, args.unit)) and fields.get('ignore_errors') == 'no')


def validate_state(c, state, unit, now):
    need(UNIT.fullmatch(unit) and isinstance(state, dict))
    transaction = Path(state['transaction'])
    need(transaction.parent == ROOT / 'metrics' and re.fullmatch('preview-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}', transaction.name))
    need(unit == 'morphiume-runtime-preview-' + transaction.name.rsplit('-', 1)[1] + '.service')
    metadata(transaction, 0o700, True)
    need(state['phase'] in ('native-acceptance-pending', 'accepted', 'rolled-back') and state.get('dataRollback') is False)
    c.validate_profile(state['candidate']); c.validate_profile(state['previous'])
    for key, value in EXPECTED.items():
        need(state['candidate'][key] == value and state['previous'][key] == value)
    need(state['candidate']['profile'] == 'private-ip' and state['candidate']['origin'] == 'http://192.168.240.51')
    need(state['previous']['profile'] == 'ssh-localhost' and state['previous']['origin'] == 'http://localhost:3100')
    need(state['candidate']['opsRoot'] == str(BUNDLE) and state['previous']['opsRoot'] == str(BUNDLE))
    deadline = timestamp(state['acceptanceDeadlineUtc'])
    need(timestamp(state['startedUtc']) < deadline)
    # Frozen OnCalendar intentionally formats seconds, dropping microseconds.
    # Match that actual timer schedule; do not reject a legitimate fractional tick.
    if state['phase'] == 'native-acceptance-pending':
        need(now >= deadline.replace(microsecond=0))
        need(c.active_profile(required=True) == state['candidate'])
        c.load_configs()
        need(c.private_file(c.CONFIG / 'deploy.env').read_text() == c.compose_environment(EXPECTED['runtimeImageId'], BUNDLE, state['candidate']))
    return transaction


def dispatch(args, c, p, invocation, now):
    need(UNIT.fullmatch(args.unit))
    need(os.getppid() == 1 and Path('/proc/1/comm').read_text().strip() == 'systemd')
    text = c.run(['systemctl', 'show', args.unit, '--all', *['--property=' + name for name in PROPERTIES]])
    validate_effective(properties(text), args, invocation)
    print(json.dumps({'event': 'E4-lease-manager-source-verified', 'unit': args.unit,
        'sourceVerifiedBeforeImports': True}), flush=True)
    path = metadata(c.CONFIG / 'preview-transition.json', 0o600)
    state = parse(path.read_bytes())
    transaction = validate_state(c, state, args.unit, now)
    name, service, timer = p.lease_units(state)
    need(name + '.service' == args.unit)
    need(metadata(Path('/etc/systemd/system') / args.unit, 0o644).read_text() == service)
    need(metadata(Path('/etc/systemd/system') / (name + '.timer'), 0o644).read_text() == timer)
    audit = transaction / ('lease-callback-' + invocation + '.json')
    record = {'mode': 'verified-E4-lease-callback', 'unit': args.unit, 'invocationId': invocation,
        'toolSourceCommit': args.tool_source_commit, 'toolSha256': args.tool_sha256, 'opsSha256': OPS,
        'initialPhase': state['phase'], 'sourceVerifiedBeforeImports': True,
        'callbackStartedUtc': now.isoformat(), 'deadlineUtc': state['acceptanceDeadlineUtc'], 'dataRollback': False}
    # Exclusive evidence means no automatic replay of the same invocation.
    c.write_private(audit, json.dumps(record, sort_keys=True) + '\n')
    expire_args = SimpleNamespace(source=SOURCE, config_id=EXPECTED['testedPlatformConfig'],
        manifest_digest=EXPECTED['candidateManifestDigest'], archive_sha256=EXPECTED['archiveSha256'], ops_sha256=OPS, apply=True)
    withdrawal_failures = []
    try:
        result = p.expire(expire_args)  # Unmodified source, reproof/lock/withdraw semantics.
        need(result.get('mode') in ('lease-completed-no-op', 'expired-preview-withdrawn'))
        if result['mode'] == 'expired-preview-withdrawn':
            failures = result.get('recoveryFailures')
            if isinstance(failures, list) and all(item in ('proxy-close-failed', 'writer-stop-failed') for item in failures):
                withdrawal_failures = failures
            need(type(failures) is list and failures == [])
        completed = record | {'completedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'result': result}
        c.write_private(audit.with_name(audit.stem + '-completed.json'), json.dumps(completed, sort_keys=True) + '\n')
        return {'mode': result['mode'], 'sourceVerifiedBeforeImports': True, 'dataRollback': False, 'auditRetained': True}
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        c.write_private(audit.with_name(audit.stem + '-failed.json'), json.dumps(record | {'result': 'failed-preserved', 'recoveryFailures': withdrawal_failures}, sort_keys=True) + '\n')
        raise ValueError('Lease callback failed; private evidence retained, no retry or data rollback') from None


def main(args):
    if not args.execute:
        if args.render_dropin: return dropin(args)
        return {'mode': 'unexecuted-plan', 'prefixDropIn': str(DROPIN), 'serverMutation': False, 'opsSha256': OPS}
    need(not args.render_dropin and isinstance(args.unit, str) and UNIT.fullmatch(args.unit))
    invocation = os.environ.get('INVOCATION_ID')
    _, sources = verified_sources(args)
    clean_environment(invocation)
    c, p = import_verified(sources)
    return dispatch(args, c, p, invocation, datetime.datetime.now(datetime.timezone.utc))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tool-source-commit', required=True)
    parser.add_argument('--tool-sha256', required=True)
    parser.add_argument('--ops-root', required=True)
    parser.add_argument('--unit')
    parser.add_argument('--render-dropin', action='store_true')
    parser.add_argument('--execute', action='store_true')
    try:
        result = main(parser.parse_args())
        if isinstance(result, str): sys.stdout.write(result)
        else: print(json.dumps(result))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('E4 lease callback guard/action failed; preserve private state, no retry or data rollback.')
        raise SystemExit(1) from None
