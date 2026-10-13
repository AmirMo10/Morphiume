#!/usr/bin/env python3
"""E4-only source/cache/approval guard for unchanged Ops68 scheduled actions.

Default plan and render modes are pure. Installation, approval replacement,
service measurement and timer enablement are separate Root operations.
"""
import argparse
from contextlib import contextmanager
import datetime
import errno
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import subprocess
import stat
import sys

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
DISPATCH_LOCK = CONFIG / 'schedule-dispatch.lock'
LOCK_BYTES = b'Morphiume E4 scheduled dispatch lock v1\n'
HEALTH_TIMER_DROPIN = Path('/etc/systemd/system/morphiume-runtime-health.timer.d/10-e4-five-minute.conf')
SOURCE = 'e4bed691dc938a9c0f79022696d24f063ad97724'
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
BUNDLE = ROOT / 'releases' / SOURCE / 'ops-bundles' / OPS / 'ops'
RESTORE = ROOT / 'restore/morphiume-runtime-restore-20261013t090118z-504a38/recovery-accepted.json'
RESTORE_SHA = '74d77bef8e420532fd384880f7f049c86e747d04da58270a1e929b304c8f26e6'
FIXTURE_SHA = 'cea16d8896babf6303e1f29c287dcd4a433f5a6668cda489594e4bf64e27395d'
SSH_PROFILE = '67f77b1636d0ae2b9b81df9e46f4a3c93087b01e0d4e6fdaa730b2604e60dd96'
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
CHECKS = {'nativeLogin', 'ownedOrder', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}
NATIVE_CHECKS = {'nativeLogin', 'adminMfa', 'csrf', 'cookies', 'ownedOrder', 'paymentReceiptDedup',
                'newT25', 'mediaHashes', 'perimeter', 'headers'}
APPROVAL_KEYS = set(EXPECTED) | {'formatVersion', 'mode', 'sharedDatabaseWindowReleased',
 'accessProfileSha256', 'restoreEvidence', 'restoreEvidenceSha256', 'bootstrapSourceCommit',
 'bootstrapSha256', 'scope', 'backupTimeoutStopSeconds', 'serviceMeasurementSha256',
 'dispatchLock', 'healthTimerIntervalSeconds'}
PROPERTIES = ('Id', 'Names', 'LoadState', 'FragmentPath', 'DropInPaths', 'Type', 'User', 'UMask',
 'TimeoutStartUSec', 'TimeoutStopUSec', 'Restart', 'EnvironmentFiles', 'ExecStart', 'InvocationID',
 'ActiveState', 'WorkingDirectory', 'NoNewPrivileges', 'PrivateTmp', 'ProtectHome', 'ProtectSystem',
 'MemoryMax', 'CPUQuotaPerSecUSec', 'CPUAccounting', 'MemoryAccounting', 'ReadWritePaths')
TIMER_PROPERTIES = ('Id', 'LoadState', 'ActiveState', 'UnitFileState', 'FragmentPath', 'DropInPaths', 'Triggers')


def need(value):
    if not value: raise ValueError('Verified E4 scheduling guard failed')


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
    for value in (args.tool_sha256, args.approval_sha256, args.profile_sha256):
        need(isinstance(value, str) and HASH.fullmatch(value))
    need(isinstance(args.tool_source_commit, str) and COMMIT.fullmatch(args.tool_source_commit))
    need(Path(args.ops_root) == BUNDLE and args.action in ('health', 'backup'))
    return ROOT / 'releases' / SOURCE / 'tools' / args.tool_sha256


def unit(action):
    need(action in ('health', 'backup'))
    return 'morphiume-runtime-' + action + '.service'


def dropin_path(action):
    return Path('/etc/systemd/system') / (unit(action) + '.d') / '10-e4-verified-schedule.conf'


def command(args, name='%n'):
    parent = validate_arguments(args)
    need(name in ('%n', unit(args.action)))
    return ['/usr/bin/python3', '-I', '-B', '-X', 'pycache_prefix=' + str(parent / 'unused-bytecode-cache'),
        str(parent / 'e4-scheduled-bootstrap.py'), args.action,
        '--tool-source-commit', args.tool_source_commit, '--tool-sha256', args.tool_sha256,
        '--ops-root', str(BUNDLE), '--approval-sha256', args.approval_sha256,
        '--profile-sha256', args.profile_sha256, '--unit', name, '--execute']


def dropin(args):
    parent = validate_arguments(args); prefix = parent / 'unused-bytecode-cache'
    budget = ('CPUQuota=100%\nMemoryMax=256M\nTimeoutStartSec=50s\nTimeoutStopSec=5s\n'
              if args.action == 'health' else '')
    # One exact per-service drop-in; no install/restart/timer directives.
    return ('[Service]\nEnvironmentFile=\nEnvironment=PYTHONDONTWRITEBYTECODE=1\n'
        'ExecStartPre=\nExecStartPre=/usr/bin/test ! -e ' + str(prefix) + '\n'
        'ExecStartPre=/usr/bin/test ! -L ' + str(prefix) + '\nExecStart=\nExecStart=' +
        ' '.join(command(args)) + '\nCPUAccounting=yes\nMemoryAccounting=yes\n' + budget)


def health_timer_dropin():
    # Empty assignment clears ALL monotonic/calendar expressions. Restore
    # boot5min explicitly; preserve the frozen jitter5s/accuracy1s/target.
    return '[Timer]\nOnUnitActiveSec=\nOnBootSec=5min\nOnUnitActiveSec=5min\n'


def cache_guard(parent):
    prefix = parent / 'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink())
    sys.dont_write_bytecode = True; sys.pycache_prefix = str(prefix)


def verify_manifest(manifest, sources):
    need(type(manifest) is dict and set(manifest) == set(OPS_FILES) and set(sources) == set(OPS_FILES))
    for name in OPS_FILES:
        need(isinstance(manifest[name], str) and HASH.fullmatch(manifest[name]) and sha(sources[name]) == manifest[name])
    need(sha(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()) == OPS)


def verified_sources(args):
    need(os.name == 'posix' and os.getuid() == 0)
    parent = validate_arguments(args)
    metadata(parent, 0o700, True)
    tool = metadata(Path(__file__), 0o644)
    need(tool == parent / 'e4-scheduled-bootstrap.py' and sha(tool.read_bytes()) == args.tool_sha256)
    cache_guard(parent)  # BEFORE all frozen/dynamic imports; no cache deletion.
    metadata(BUNDLE, 0o700, True)
    manifest = parse(metadata(BUNDLE / 'ops-manifest.json', 0o600).read_bytes())
    sources = {name: metadata(BUNDLE / name, 0o644).read_bytes().replace(b'\r\n', b'\n') for name in OPS_FILES}
    verify_manifest(manifest, sources)
    for action in ('health', 'backup'):
        installed = Path('/etc/systemd/system') / unit(action)
        need(metadata(installed, 0o644).read_bytes() == sources['runtime/systemd/' + unit(action)])
        selected = argparse.Namespace(**vars(args)); selected.action = action
        target = dropin_path(action)
        metadata(target.parent, 0o700, True)
        need(metadata(target, 0o644).read_text() == dropin(selected))
        timer = Path('/etc/systemd/system') / ('morphiume-runtime-' + action + '.timer')
        if timer.exists() or timer.is_symlink():
            need(metadata(timer, 0o644).read_bytes() == sources['runtime/systemd/' + timer.name])
    if HEALTH_TIMER_DROPIN.exists() or HEALTH_TIMER_DROPIN.is_symlink():
        metadata(HEALTH_TIMER_DROPIN.parent, 0o700, True)
        need(metadata(HEALTH_TIMER_DROPIN, 0o644).read_text() == health_timer_dropin())
    return sources


def import_verified(sources):
    names = ('contract', 'backup', 'health', 'restore', 'scheduled')
    need(not any(name in sys.modules for name in names))
    modules = {}
    for name in names:
        path = BUNDLE / 'runtime' / (name + '.py')
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec); sys.modules[name] = module
        exec(compile(sources['runtime/' + name + '.py'], str(path), 'exec'), module.__dict__)
        modules[name] = module
    need(modules['contract'].ops_digest() == OPS)
    return modules['contract'], modules['scheduled']


def clean_environment(invocation):
    need(isinstance(invocation, str) and re.fullmatch('[a-f0-9]{32}', invocation))
    os.environ.clear()
    os.environ.update(PATH='/usr/sbin:/usr/bin:/sbin:/bin', LANG='C.UTF-8', INVOCATION_ID=invocation)


def properties(text):
    result = {}
    for line in text.splitlines():
        if not line: continue
        need('=' in line)
        key, value = line.split('=', 1); need(key not in result); result[key] = value
    return result


def validate_effective(value, args, invocation, stop_seconds):
    need(set(value) == set(PROPERTIES))
    name = unit(args.action)
    expected = {'Id': name, 'Names': name, 'LoadState': 'loaded',
        'FragmentPath': '/etc/systemd/system/' + name, 'DropInPaths': str(dropin_path(args.action)),
        'Type': 'oneshot', 'User': 'root', 'UMask': '0077', 'Restart': 'no', 'EnvironmentFiles': '',
        'InvocationID': invocation, 'WorkingDirectory': str(CONFIG), 'NoNewPrivileges': 'yes',
        'PrivateTmp': 'yes', 'ProtectHome': 'yes', 'ProtectSystem': 'strict',
        'CPUAccounting': 'yes', 'MemoryAccounting': 'yes',
        'TimeoutStartUSec': '50s' if args.action == 'health' else '20min',
        'TimeoutStopUSec': '5s' if args.action == 'health' else str(stop_seconds) + 's',
        'MemoryMax': str((256 if args.action == 'health' else 512) * 1024**2),
        'CPUQuotaPerSecUSec': '1s' if args.action == 'health' else '500ms',
        'ReadWritePaths': '' if args.action == 'health' else str(ROOT / 'backups') + ' /srv/morphiume/staging/deploy.lock'}
    # systemctl represents the unchanged default90 seconds as1min30s.
    if args.action == 'backup' and stop_seconds == 90: expected['TimeoutStopUSec'] = '1min 30s'
    need(all(value[key] == text for key, text in expected.items()) and value['ActiveState'] in ('activating', 'active'))
    entry = value['ExecStart']
    need(entry.startswith('{ ') and entry.endswith(' }') and entry.count('argv[]=') == 1)
    fields = {}
    for item in entry[2:-2].split(' ; '):
        need('=' in item)
        key, text = item.split('=', 1); need(key not in fields); fields[key] = text
    need(set(fields) <= {'path', 'argv[]', 'ignore_errors', 'start_time', 'stop_time', 'pid', 'code', 'status'})
    need(fields.get('path') == '/usr/bin/python3' and fields.get('argv[]') == ' '.join(command(args, name)) and fields.get('ignore_errors') == 'no')


def validate_peer_effective(value, args, stop_seconds):
    # A stale PID1 peer still running the old unguarded command could bypass
    # the shared lock even when its on-disk drop-in had just been replaced.
    need(value.get('ActiveState') in ('inactive', 'activating', 'active', 'deactivating', 'failed'))
    invocation = value.get('InvocationID')
    need(isinstance(invocation, str) and (invocation == '' or re.fullmatch('[a-f0-9]{32}', invocation)))
    normalized = value | {'ActiveState': 'active'}
    validate_effective(normalized, args, invocation, stop_seconds)


def mapping(value):
    need(type(value) is dict and all(value.get(key) == expected for key, expected in EXPECTED.items()))


def validate_approval(value, args):
    need(type(value) is dict and set(value) == APPROVAL_KEYS)
    mapping(value)
    need(type(value['formatVersion']) is int and value['formatVersion'] == 1)
    need(value['mode'] == 'quiesce-runtime-only' and value['sharedDatabaseWindowReleased'] is True)
    need(value['accessProfileSha256'] == args.profile_sha256 and value['bootstrapSha256'] == args.tool_sha256
         and value['bootstrapSourceCommit'] == args.tool_source_commit)
    need(value['restoreEvidence'] == str(RESTORE) and value['restoreEvidenceSha256'] == RESTORE_SHA)
    need(value['scope'] in ('one-time-service-measurement', 'recurring-timers'))
    # Preserve the observed manager default; never change it in a backup override.
    need(type(value['backupTimeoutStopSeconds']) is int and value['backupTimeoutStopSeconds'] == 90)
    need(type(value['healthTimerIntervalSeconds']) is int and value['healthTimerIntervalSeconds'] == 300)
    lock = value['dispatchLock']
    need(type(lock) is dict and set(lock) == {'path', 'sha256', 'device', 'inode', 'filesystem'})
    need(lock['path'] == str(DISPATCH_LOCK) and lock['sha256'] == sha(LOCK_BYTES) and lock['filesystem'] == 'ext4')
    need(all(type(lock[key]) is int and lock[key] > 0 for key in ('device', 'inode')))
    measurements = value['serviceMeasurementSha256']
    need(type(measurements) is dict and set(measurements) == {'health', 'backup'})
    if value['scope'] == 'one-time-service-measurement': need(all(item is None for item in measurements.values()))
    else: need(all(isinstance(item, str) and HASH.fullmatch(item) for item in measurements.values()))


def validate_restore(value):
    mapping(value)
    need(type(value.get('checks')) is dict and set(value['checks']) == CHECKS and all(item is True for item in value['checks'].values()))
    need(value.get('mode') == 'native-business-restore-accepted' and value.get('workerStarted') is False)
    need(value.get('origin') == 'http://localhost:3101' and value.get('fixtureManifestSha256') == FIXTURE_SHA)
    need(value.get('accessProfileSha256') == SSH_PROFILE)
    timestamp(value.get('acceptedUtc'))
    for key in ('observedRtoSeconds', 'observedRecoveryPointGapSeconds'):
        need(type(value.get(key)) in (int, float) and math.isfinite(value[key]) and value[key] >= 0)


def validate_profile(c, profile, deployed, transition, args):
    c.validate_profile(profile); mapping(profile); mapping(deployed)
    need(c.canonical_hash(profile) == args.profile_sha256 and deployed.get('accessProfileSha256') == args.profile_sha256)
    need(profile['opsRoot'] == str(BUNDLE))
    if profile['profile'] == 'ssh-localhost':
        need(args.profile_sha256 == SSH_PROFILE and profile['origin'] == 'http://localhost:3100')
        if transition is not None:
            need(transition.get('phase') == 'rolled-back' and transition.get('nativeRollbackAcceptance') == 'accepted')
    else:
        need(profile['profile'] == 'private-ip' and profile['origin'] == 'http://192.168.240.51')
        need(type(transition) is dict and transition.get('phase') == 'accepted'
             and transition.get('nativeAcceptance') == 'accepted' and transition.get('dataRollback') is False)
        need(transition.get('candidate') == profile and deployed.get('nativePreviewAcceptance') == 'accepted')
        old = transition.get('previous'); c.validate_profile(old); mapping(old)
        need(old['profile'] == 'ssh-localhost' and c.canonical_hash(old) == SSH_PROFILE)
        need(isinstance(transition.get('acceptanceSha256'), str) and HASH.fullmatch(transition['acceptanceSha256']))
        start = timestamp(transition.get('startedUtc')); accepted = timestamp(transition.get('acceptedUtc'))
        need(start <= accepted <= timestamp(transition.get('acceptanceDeadlineUtc')))


def validate_native(value, state, args):
    mapping(value)
    need(value.get('origin') == 'http://192.168.240.51' and value.get('accessProfileSha256') == args.profile_sha256
         and value.get('noUnexpectedBusinessMutation') is True and value.get('acceptedUtc') == state['acceptedUtc'])
    engines = value.get('engines')
    need(type(engines) is list and len(engines) == 3 and all(type(item) is dict for item in engines)
         and {item.get('engine') for item in engines} == {'chromium', 'firefox', 'webkit'})
    for item in engines:
        need(type(item.get('checks')) is dict and set(item['checks']) == NATIVE_CHECKS
             and all(check is True for check in item['checks'].values()))
        need(all(type(item.get(key)) is int and item[key] == 0 for key in ('unexpected', 'skipped', 'testRetries')))


def validate_timer_state(value, scope):
    need(set(value) == set(TIMER_PROPERTIES))
    need(value['Id'] in ('morphiume-runtime-health.timer', 'morphiume-runtime-backup.timer'))
    need(value['LoadState'] in ('loaded', 'not-found'))
    health = value['Id'] == 'morphiume-runtime-health.timer'
    allowed = ('', str(HEALTH_TIMER_DROPIN)) if health and scope == 'one-time-service-measurement' else (str(HEALTH_TIMER_DROPIN),) if health else ('',)
    need(value['DropInPaths'] in allowed)
    need(value['FragmentPath'] == ('/etc/systemd/system/' + value['Id'] if value['LoadState'] == 'loaded' else ''))
    need(value['Triggers'] == (value['Id'].replace('.timer', '.service') if value['LoadState'] == 'loaded' else ''))
    need(value['ActiveState'] == 'inactive' and value['UnitFileState'] in ('disabled', '')
         if scope == 'one-time-service-measurement' else value['ActiveState'] in ('active', 'inactive') and value['UnitFileState'] in ('enabled', 'disabled'))


@contextmanager
def dispatch_lock(approval):
    import fcntl
    expected = approval['dispatchLock']
    path = metadata(DISPATCH_LOCK, 0o600)
    fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o777 == 0o600 and info.st_nlink == 1)
        need((info.st_dev, info.st_ino) == (expected['device'], expected['inode']) and info.st_size == len(LOCK_BYTES))
        need(os.read(fd, len(LOCK_BYTES) + 1) == LOCK_BYTES and expected['sha256'] == sha(LOCK_BYTES))
        acquired = False
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); acquired = True
        except OSError as error:
            if error.errno not in (errno.EAGAIN, errno.EWOULDBLOCK): raise
        current = path.lstat()
        need((current.st_dev, current.st_ino) == (info.st_dev, info.st_ino) and current.st_nlink == 1)
        yield acquired
    finally:
        os.close(fd)  # Releases only this descriptor's lock, even on failure.


def guarded_records(args, c):
    approval_data = metadata(CONFIG / 'schedule-approved.json', 0o600).read_bytes()
    need(sha(approval_data) == args.approval_sha256)
    approval = parse(approval_data); validate_approval(approval, args)
    evidence_data = metadata(RESTORE, 0o600).read_bytes(); need(sha(evidence_data) == RESTORE_SHA)
    evidence = parse(evidence_data); validate_restore(evidence)
    profile = c.active_profile(required=True)
    deployed = parse(metadata(CONFIG / 'deployed-release.json', 0o600).read_bytes())
    state_path = CONFIG / 'preview-transition.json'
    state = parse(metadata(state_path, 0o600).read_bytes()) if state_path.exists() or state_path.is_symlink() else None
    validate_profile(c, profile, deployed, state, args)
    if profile['profile'] == 'private-ip':
        native = metadata(ROOT / 'metrics/preview-acceptance.json', 0o600).read_bytes()
        need(sha(native) == state['acceptanceSha256'])
        validate_native(parse(native), state, args)
    c.load_configs()  # Protected bytes must match the immutable active profile.
    return approval, deployed


def safe_result(action, value, args):
    need(type(value) is dict)
    if action == 'backup':
        need(value.get('mode') == 'encrypted-backup-completed' and value.get('runtimeWritersResumed') is True)
        path = Path(value.get('directory', ''))
        need(path.parent == ROOT / 'backups' and re.fullmatch('[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', path.name))
        return {'mode': value['mode'], 'runtimeWritersResumed': True, 'restoreAcceptance': 'pending', 'offsiteEstablished': False}
    need(value.get('scope') == 'morphiume-staging-runtime' and value.get('expectedServiceMode') == 'running'
         and value.get('expectLogicalBackups') is True and value.get('status') in ('healthy', 'warning', 'critical'))
    need(type(value.get('alerts')) is list and value.get('runtimeImageId') == EXPECTED['runtimeImageId']
         and value.get('testedPlatformConfig') == EXPECTED['testedPlatformConfig'])
    need(value.get('accessProfile') in ('ssh-localhost', 'private-ip'))
    need(value['accessProfile'] == ('ssh-localhost' if args.profile_sha256 == SSH_PROFILE else 'private-ip'))
    need(value.get('canonicalOrigin') == ('http://localhost:3100' if value['accessProfile'] == 'ssh-localhost' else 'http://192.168.240.51'))
    if value['status'] == 'healthy':
        need(value['alerts'] == [] and value.get('appReadiness') == 200 and value.get('databaseHealthy') is True)
        items = value.get('containers')
        need(type(items) is list and len(items) == 2 and all(type(item) is dict for item in items)
             and {item.get('service') for item in items} == {'app', 'worker'})
        need(all(item.get('status') == 'running' and item.get('health') == 'healthy' and item.get('engineIdentityMatches') is True
                 and item.get('oomKilled') is False and item.get('restarts') == 0 for item in items))
    return {'mode': 'verified-E4-scheduled-health', 'status': value['status'], 'alertCount': len(value['alerts']),
        'appReadiness': value.get('appReadiness'), 'expectedServiceMode': 'running', 'expectLogicalBackups': True,
        'runtimeImageId': EXPECTED['runtimeImageId'], 'accessProfileSha256': args.profile_sha256}


def dispatch(args, c, scheduled, invocation):
    need(args.unit == unit(args.action) and os.getppid() == 1 and Path('/proc/1/comm').read_text().strip() == 'systemd')
    approval, before = guarded_records(args, c)
    values = c.run(['systemctl', 'show', args.unit, *['--property=' + name for name in PROPERTIES]])
    validate_effective(properties(values), args, invocation, approval['backupTimeoutStopSeconds'])
    peer = argparse.Namespace(**vars(args)); peer.action = 'backup' if args.action == 'health' else 'health'
    peer.unit = unit(peer.action)
    values = c.run(['systemctl', 'show', peer.unit, *['--property=' + name for name in PROPERTIES]])
    validate_peer_effective(properties(values), peer, approval['backupTimeoutStopSeconds'])
    for name in ('morphiume-runtime-health.timer', 'morphiume-runtime-backup.timer'):
        text = c.run(['systemctl', 'show', name, *['--property=' + key for key in TIMER_PROPERTIES]])
        timer = properties(text); need(timer.get('Id') == name); validate_timer_state(timer, approval['scope'])
    need(c.run(['findmnt', '--target', str(CONFIG), '--noheadings', '--output', 'FSTYPE']).strip() == approval['dispatchLock']['filesystem'])
    with dispatch_lock(approval) as acquired:
        if not acquired:
            need(approval['scope'] == 'recurring-timers')  # One-time cost probes MUST run.
            return {'mode': 'recurring-dispatch-busy-skipped', 'action': args.action, 'actionCount': 0,
                'lockBusyObserved': True, 'healthEvaluated': False, 'backupCreated': False,
                'invocationId': invocation, 'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'sourceVerifiedBeforeImports': True}
        # Recheck protected approval/profile after acquiring the shared lock.
        locked_approval, locked_before = guarded_records(args, c)
        need(locked_approval == approval and locked_before == before)
        # Unchanged Ops68 performs both health crypto proofs, or its separate
        # deploy.lock + exact-writer stop/finally resume. Never double-lock it.
        result = scheduled.main(args.action, apply=True)  # Exactly ONE attempt.
        after_approval, after = guarded_records(args, c)
        need(after_approval == approval and after == before)
        return safe_result(args.action, result, args) | {'sourceVerifiedBeforeImports': True, 'actionCount': 1}


def main(args):
    validate_arguments(args)
    if not args.execute:
        need(not (args.render_dropin and args.render_health_timer))
        if args.render_dropin: return dropin(args)
        if args.render_health_timer: return health_timer_dropin()
        return {'mode': 'unexecuted-plan', 'action': args.action, 'dropIn': str(dropin_path(args.action)),
                'serverMutation': False, 'approvalCreated': False, 'timersEnabled': False}
    need(not args.render_dropin and not args.render_health_timer and args.unit == unit(args.action))
    invocation = os.environ.get('INVOCATION_ID')
    sources = verified_sources(args)
    clean_environment(invocation)
    c, scheduled = import_verified(sources)
    return dispatch(args, c, scheduled, invocation)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('health', 'backup'))
    for key in ('tool-source-commit', 'tool-sha256', 'ops-root', 'approval-sha256', 'profile-sha256'):
        parser.add_argument('--' + key, required=True)
    parser.add_argument('--unit'); parser.add_argument('--render-dropin', action='store_true')
    parser.add_argument('--render-health-timer', action='store_true'); parser.add_argument('--execute', action='store_true')
    try:
        result = main(parser.parse_args())
        if isinstance(result, str): sys.stdout.write(result)
        else:
            print(json.dumps(result))
            raise SystemExit({'healthy': 0, 'warning': 1, 'critical': 2}.get(result.get('status'), 0))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print(json.dumps({'mode': 'E4-schedule-gated-or-failed', 'actionCount': 'unproved', 'retryAttempted': False}))
        raise SystemExit(2) from None
