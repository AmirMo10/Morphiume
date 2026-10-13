"""Root-dispatched one-shot old591 health service measurement, never a timer."""
import datetime
import hashlib
import importlib.util
import json
import math
import os
import re
import shlex
import stat
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

SOURCE = '6130f4ed7ec090344a5a4a1937a65ef04572975b'
OPS = '591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db'
RECOVERY_TOOL = '9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d'
ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
OPS_ROOT = ROOT / 'releases' / SOURCE / 'ops-bundles' / OPS / 'ops'
CACHE = ROOT / 'releases' / SOURCE / 'tools' / RECOVERY_TOOL / 'unused-bytecode-cache'
RESTORE = ROOT / 'restore/morphiume-runtime-restore-20261012T212729Z-d03c35'
RESTORE_PROJECT = 'morphiume-runtime-restore-20261012t212729z-d03c35'
BACKUP = ROOT / 'backups/20261012T212644Z-fe6ca5ce'
UNIT = 'morphiume-runtime-health.service'
BASE_SHA = '4433c82ded1f43f18c896b4e38c68e9aa640b719d95c58ee5c089cfeb86bfb5d'
DROPINS = {'591-python-cache-guard.conf': '672e07d612751b0ce919d7900ad9c32528256ff7e9c82cfce36374dd67f113f7',
           '591-health-budget.conf': 'ff3857c5919d36c7b12716d30c72613a6de8b2f580133b378b11fc2a4c1d2234',
           '591-health-probe-accounting.conf': '33c359ca12b9b50f00b6198e01573fc977385a37750f8949681f9531cb798998'}
TARGETS = { '591-python-cache-guard.conf': Path('/etc/systemd/system/' + UNIT + '.d/10-verified-python-source.conf'),
            '591-health-budget.conf': Path('/etc/systemd/system/' + UNIT + '.d/20-reviewed-operator-budget.conf'),
            '591-health-probe-accounting.conf': Path('/run/systemd/system/' + UNIT + '.d/30-one-shot-probe.conf') }
IDENTITY_KEYS = {'sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256', 'opsSha256', 'runtimeImageId', 'engineProofSha256', 'accessProfileSha256'}
OPS_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py', 'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py', 'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py', 'runtime/monitor.py', 'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py', 'runtime/operator-config.mjs', 'runtime/engine_image.py', 'runtime/systemd/morphiume-runtime-backup.service', 'runtime/systemd/morphiume-runtime-backup.timer', 'runtime/systemd/morphiume-runtime-health.service', 'runtime/systemd/morphiume-runtime-health.timer')
CHECKS = {'nativeLogin', 'ownedOrder', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}
HASH_KEYS = {'acceptanceSha256', 'remoteResultRawSha256', 'resultSemanticSha256', 'localResultRawSha256', 'fixtureSha256', 'readyRecordSha256', 'journalSha256', 'restoreConfigSha256', 'backupManifestSha256'}
PROPERTIES = ('LoadState', 'FragmentPath', 'DropInPaths', 'UnitFileState', 'ActiveState', 'SubState', 'Type', 'User', 'UMask', 'WorkingDirectory', 'EnvironmentFiles', 'Environment', 'UnsetEnvironment', 'ExecStart', 'ExecStartPre', 'NoNewPrivileges', 'PrivateTmp', 'ProtectHome', 'ProtectSystem', 'MemoryMax', 'CPUQuotaPerSecUSec', 'TimeoutStartUSec', 'TimeoutStopUSec', 'CPUAccounting', 'MemoryAccounting', 'Restart', 'RemainAfterExit', 'StandardOutput', 'StandardError', 'ControlGroup', 'InvocationID', 'ConditionResult', 'AssertResult', 'Result', 'ExecMainCode', 'ExecMainStatus', 'ExecMainStartTimestampMonotonic', 'ExecMainExitTimestampMonotonic', 'CPUUsageNSec', 'MemoryPeak')


def require(condition):
    if not condition: raise ValueError('Scheduled health contract rejected')


def sha(value): return hashlib.sha256(value).hexdigest()
def canonical(value): return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode())
def hex64(value): return isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value) is not None
def commit(value): return isinstance(value, str) and re.fullmatch('[a-f0-9]{40}', value) is not None
def utc(): return datetime.datetime.now(datetime.timezone.utc).isoformat()


def unique_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs)


def validate_request(request):
    require(isinstance(request, dict) and set(request) == {'schemaVersion', 'action', 'measurementId', 'rootDispatch', 'sharedDatabaseWindowReleased', 'approvalAction', 'identity', 'publication', 'evidence'})
    require(type(request['schemaVersion']) is int and request['schemaVersion'] == 1 and request['action'] == 'measure-old591-scheduled-health' and request['rootDispatch'] is True and request['sharedDatabaseWindowReleased'] is True and request['approvalAction'] == 'create-if-absent')
    require(isinstance(request['measurementId'], str) and re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', request['measurementId']))
    identity = request['identity']; require(isinstance(identity, dict) and set(identity) == IDENTITY_KEYS and identity['sourceCommit'] == SOURCE and identity['opsSha256'] == OPS)
    for key in IDENTITY_KEYS - {'sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'runtimeImageId'}: require(hex64(identity[key]))
    for key in ('testedPlatformConfig', 'candidateManifestDigest', 'runtimeImageId'): require(isinstance(identity[key], str) and re.fullmatch('sha256:[a-f0-9]{64}', identity[key]))
    pub = request['publication']; require(isinstance(pub, dict) and set(pub) == {'toolSourceCommit', 'configurationSourceCommit', 'localToolSha256', 'remoteToolSha256', 'dropinSha256'})
    require(commit(pub['toolSourceCommit']) and commit(pub['configurationSourceCommit']) and hex64(pub['localToolSha256']) and hex64(pub['remoteToolSha256']) and pub['dropinSha256'] == DROPINS)
    evidence = request['evidence']; require(isinstance(evidence, dict) and set(evidence) == HASH_KEYS | {'recoveryToolSourceCommit'})
    require(all(hex64(evidence[key]) for key in HASH_KEYS) and commit(evidence['recoveryToolSourceCommit']))
    require(evidence['localResultRawSha256'] == '139f916c48f32308894025d002d91f287ff175d3e33549560c29344141aa3498')
    return request


def protected_path(path, directory=False, uid=0, mode=None, maximum=8 * 1024 ** 2):
    require(path.is_absolute() and path == Path(os.path.normpath(path)))
    for ancestor in path.parents:
        info = ancestor.lstat(); require(stat.S_ISDIR(info.st_mode) and not ancestor.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    info = path.lstat(); require(not path.is_symlink() and info.st_uid == uid and info.st_gid == uid and path.resolve() == path)
    if directory: require(stat.S_ISDIR(info.st_mode))
    else: require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= maximum)
    require(mode is None or stat.S_IMODE(info.st_mode) == mode)
    return path


def read_protected(path, uid=0, mode=0o600, maximum=8 * 1024 ** 2):
    protected_path(path, uid=uid, mode=mode, maximum=maximum)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno()); require(info.st_uid == uid and info.st_gid == uid and stat.S_IMODE(info.st_mode) == mode and info.st_nlink == 1 and 0 < info.st_size <= maximum)
        return stream.read(maximum + 1)


def verify_bundle(root=OPS_ROOT, expected=OPS, files=OPS_FILES):
    # No old executable module has been imported at this point.
    protected_path(root, directory=True, mode=0o700)
    manifest = unique_json(read_protected(root / 'ops-manifest.json', maximum=65536))
    require(isinstance(manifest, dict) and set(manifest) == set(files) and canonical(manifest) == expected)
    for name in files:
        require(hex64(manifest[name]))
        path = root / name; protected_path(path, mode=0o644, maximum=1024 ** 2)
        require(sha(path.read_bytes().replace(b'\r\n', b'\n')) == manifest[name])
    return manifest


def bootstrap_old():
    verify_bundle()
    protected_path(CACHE.parent, directory=True, mode=0o700)
    require(not CACHE.exists() and not CACHE.is_symlink() and CACHE.resolve() == CACHE)
    sys.pycache_prefix = str(CACHE); sys.dont_write_bytecode = True
    # Old dynamic verify-release/engine imports share this verified nonexistent
    # cache namespace. Existing __pycache__ directories are not read or deleted.
    sys.path.insert(0, str(OPS_ROOT / 'runtime'))
    specification = importlib.util.spec_from_file_location('contract', OPS_ROOT / 'runtime/contract.py')
    c = importlib.util.module_from_spec(specification); sys.modules['contract'] = c; specification.loader.exec_module(c)
    c.assert_boundaries(); c.verify_ops_bundle(OPS_ROOT, OPS)
    return c


def validate_marker(marker, result, journal, ready, manifest, request):
    require(all(isinstance(record, dict) for record in (marker, result, journal, ready, manifest)))
    identity, evidence = request['identity'], request['evidence']
    require(marker.get('mode') == 'native-business-restore-accepted' and all(marker.get(k) == v for k, v in identity.items()))
    require(isinstance(marker.get('checks'), dict) and set(marker['checks']) == CHECKS and all(value is True for value in marker['checks'].values()) and marker.get('workerStarted') is False and marker.get('offsiteProtectionEstablished') is False and marker.get('pitrEstablished') is False and marker.get('restoreProject') == RESTORE_PROJECT)
    require(marker.get('recoveryPointScope') == 'retained-business-fixture-to-writer-free-backup-capture' and marker.get('recoveryToolSha256') == RECOVERY_TOOL and marker.get('recoveryToolSourceCommit') == evidence['recoveryToolSourceCommit'])
    for key in ('fixtureSha256', 'readyRecordSha256', 'journalSha256', 'restoreConfigSha256'): require(marker.get(key) == evidence[key])
    require(marker.get('resultSha256') == evidence['localResultRawSha256'] and canonical(result) == evidence['resultSemanticSha256'])
    require(type(result.get('formatVersion')) is int and result.get('formatVersion') == 1 and result.get('mode') == 'six-business-checks-passed' and result.get('workerStarted') is False and result.get('recoveryMarkerWritten') is False and result.get('checks') == ['native-login', 'owned-order', 'payment-dedup', 'stock-reservation', 'shipment-tracking', 'media-sha256'])
    for key in ('fixtureSha256', 'readyRecordSha256', 'journalSha256', 'restoreConfigSha256'): require(result.get(key) == evidence[key])
    target = result.get('target', {}); require(target.get('identity') == identity and target.get('restoreProject') == RESTORE_PROJECT and target.get('restoreRoot') == str(RESTORE) and target.get('backupDirectory') == str(BACKUP) and target.get('baseURL') == 'http://localhost:3101')
    require(target.get('recovery') == {'toolSourceCommit': evidence['recoveryToolSourceCommit'], 'toolSha256': RECOVERY_TOOL, 'fixtureSha256': evidence['fixtureSha256'], 'backupManifestSha256': evidence['backupManifestSha256']})
    for record in (journal, ready):
        require(all(record.get(k) == v for k, v in identity.items() if k != 'accessProfileSha256'))
        require(record.get('profileSha256') == identity['accessProfileSha256'] and record.get('toolSha256') == RECOVERY_TOOL and record.get('toolSourceCommit') == evidence['recoveryToolSourceCommit'] and record.get('root') == str(RESTORE) and record.get('project') == RESTORE_PROJECT and record.get('backup') == str(BACKUP) and record.get('fixtureSha256') == evidence['fixtureSha256'] and record.get('backupManifestSha256') == evidence['backupManifestSha256'] and record.get('workerStarted') is False and record.get('automaticResume') is False)
    require(journal.get('phase') == 'ready-business-acceptance-pending' and journal.get('readyRecordSha256') == evidence['readyRecordSha256'] and ready.get('phase') == 'ready-record-started' and ready.get('browserOrigin') == 'http://localhost:3101')
    require(all(manifest.get(k) == v for k, v in identity.items() if k != 'accessProfileSha256') and manifest.get('database') == 'morphiume_staging_runtime' and manifest.get('backupOpsSha256') == OPS)
    times = [marker.get(k) for k in ('lastRetainedBusinessMutationUtc', 'backupCaptureUtc', 'backupCompleteUtc', 'recoveryStartUtc', 'businessCheckStartedUtc', 'acceptedUtc')]
    require(all(isinstance(value, str) for value in times))
    parsed = [datetime.datetime.fromisoformat(value.replace('Z', '+00:00')) for value in times]
    require(all(t.tzinfo is not None and t.utcoffset() == datetime.timedelta(0) for t in parsed) and parsed == sorted(parsed))
    rto = (parsed[-1] - parsed[3]).total_seconds(); gap = (parsed[1] - parsed[0]).total_seconds()
    require(rto == marker.get('observedRtoSeconds') == 3333.396461 and gap == marker.get('observedRecoveryPointGapSeconds') == 122.003162)
    def parse(value):
        require(isinstance(value, str)); return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parse(ready.get('recoveryStartUtc')) == parsed[3] == parse(journal.get('originalRecoveryStartUtc')) and parse(manifest.get('businessBaseline', {}).get('capturedUtc')) == parsed[1] and parse(manifest.get('backupCompleteUtc')) == parsed[2])
    require(parse(result.get('completedAt')) == parsed[-1] and parse(result.get('startedAt')) == parsed[-2] and result.get('durationMs') == marker.get('businessCheckDurationMs'))


def seconds(value):
    require(isinstance(value, str) and value not in ('infinity', '[not set]'))
    units = {'us': 0.000001, 'ms': 0.001, 's': 1, 'min': 60}
    parts = re.findall(r'([0-9]+(?:\.[0-9]+)?)(us|ms|s|min)', value)
    require(parts and ''.join(n + u for n, u in parts) == value.replace(' ', ''))
    return sum(float(n) * units[u] for n, u in parts)


def argv_vectors(value):
    require(isinstance(value, str) and 'ignore_errors=yes' not in value)
    return [shlex.split(item.strip()) for item in re.findall(r'argv\[\]=([^;]+);', value)]


def validate_effective(properties):
    expected = {'LoadState': 'loaded', 'FragmentPath': '/etc/systemd/system/' + UNIT, 'Type': 'oneshot', 'User': 'root', 'UMask': '0077', 'WorkingDirectory': str(CONFIG), 'NoNewPrivileges': 'yes', 'PrivateTmp': 'yes', 'ProtectHome': 'yes', 'ProtectSystem': 'strict', 'MemoryMax': '268435456', 'CPUAccounting': 'yes', 'MemoryAccounting': 'yes', 'Restart': 'no', 'RemainAfterExit': 'no', 'StandardOutput': 'journal', 'StandardError': 'journal'}
    require(all(properties.get(k) == v for k, v in expected.items()) and properties.get('UnitFileState') in ('static', 'disabled'))
    require(seconds(properties.get('CPUQuotaPerSecUSec')) == 1 and seconds(properties.get('TimeoutStartUSec')) == 50 and seconds(properties.get('TimeoutStopUSec')) == 5)
    require(sorted(shlex.split(properties.get('DropInPaths', ''))) == sorted(map(str, TARGETS.values())))
    require(properties.get('EnvironmentFiles') == str(CONFIG / 'deploy.env') + ' (ignore_errors=no)')
    require(sorted(shlex.split(properties.get('Environment', ''))) == sorted(['PYTHONDONTWRITEBYTECODE=1', 'PYTHONPYCACHEPREFIX=' + str(CACHE)]))
    require(set(shlex.split(properties.get('UnsetEnvironment', ''))) == {'PYTHONPATH', 'PYTHONHOME', 'PYTHONSTARTUP', 'PYTHONCASEOK'})
    vectors = argv_vectors(properties.get('ExecStart'))
    allowed = [['/usr/bin/python3', str(OPS_ROOT / 'runtime/scheduled.py'), 'health', '--apply'], ['/usr/bin/python3', '${MORPHIUME_OPS_ROOT}/runtime/scheduled.py', 'health', '--apply']]
    require(vectors in [[item] for item in allowed])
    require(argv_vectors(properties.get('ExecStartPre')) == [['/usr/bin/test', '!', '-e', str(CACHE)], ['/usr/bin/test', '!', '-L', str(CACHE)]])


def validate_health(health, identity):
    require(isinstance(health, dict) and health.get('scope') == 'morphiume-staging-runtime' and health.get('expectedServiceMode') == 'running' and health.get('expectLogicalBackups') is True and health.get('status') == 'healthy' and health.get('alerts') == [] and health.get('appReadiness') == 200)
    require(health.get('runtimeImageId') == identity['runtimeImageId'] and health.get('testedPlatformConfig') == identity['testedPlatformConfig'] and health.get('accessProfile') == 'ssh-localhost' and health.get('canonicalOrigin') == 'http://localhost:3100' and health.get('databaseHealthy') is True and health.get('database', {}).get('database') == 'morphiume_staging_runtime')
    containers = health.get('containers'); require(isinstance(containers, list) and len(containers) == 2 and all(isinstance(c, dict) for c in containers) and {c.get('service') for c in containers} == {'app', 'worker'})
    require(all(c.get('status') == 'running' and c.get('health') == 'healthy' and c.get('oomKilled') is False and c.get('engineIdentityMatches') is True and type(c.get('restarts')) is int and c['restarts'] == 0 for c in containers))


def journal_health(raw):
    require(len(raw.encode()) <= 4 * 1024 ** 2)
    candidates = []
    for line in raw.splitlines():
        entry = unique_json(line); require(isinstance(entry, dict)); message = entry.get('MESSAGE')
        if not isinstance(message, str) or not message.startswith('{'): continue
        try: value = unique_json(message)
        except (ValueError, json.JSONDecodeError): continue
        if isinstance(value, dict) and value.get('scope') == 'morphiume-staging-runtime': candidates.append(value)
    require(len(candidates) == 1)
    return candidates[0]


def parse_properties(raw, allowed=PROPERTIES):
    """Only ExecStartPre is a collection; never collapse duplicate scalars."""
    require(isinstance(raw, str) and len(raw.encode()) <= 4 * 1024 ** 2)
    values = {}; prechecks = []; pre_lines = 0; pre_empty = False
    expected = [['/usr/bin/test', '!', '-e', str(CACHE)], ['/usr/bin/test', '!', '-L', str(CACHE)]]
    for line in raw.splitlines():
        require('=' in line)
        key, value = line.split('=', 1); require(key in allowed)
        if key == 'ExecStartPre':
            pre_lines += 1; require(pre_lines <= 2)
            if not value:
                require(pre_lines == 1); pre_empty = True
            else:
                require(not pre_empty)
                vectors = argv_vectors(value); require(1 <= len(vectors) <= 2)
                for vector in vectors:
                    require(vector in expected and vector not in prechecks); prechecks.append(vector)
                require(len(prechecks) <= 2)
            values[key] = values[key] + ' ' + value if key in values else value
        else:
            require(key not in values); values[key] = value
    if pre_lines:
        require((pre_empty and pre_lines == 1 and not prechecks) or prechecks == expected)
    return values


def gc_final_defaults(properties):
    expected = {'ConditionResult': 'no', 'AssertResult': 'no', 'ExecMainCode': '0', 'ExecMainStatus': '0',
                'ExecMainStartTimestampMonotonic': '0', 'ExecMainExitTimestampMonotonic': '0',
                'CPUUsageNSec': '[not set]', 'MemoryPeak': '[not set]'}
    return all(properties.get(key) == value for key, value in expected.items()) and properties.get('InvocationID') in ('', '0' * 32)


def trusted_health_entry(raw, invocation):
    require(isinstance(raw, str) and len(raw.encode()) <= 4 * 1024 ** 2)
    require(isinstance(invocation, str) and re.fullmatch('[a-f0-9]{32}', invocation) and invocation != '0' * 32)
    entries = []
    for line in raw.splitlines():
        entry = unique_json(line); require(isinstance(entry, dict))
        message = entry.get('MESSAGE')
        if not isinstance(message, str) or not message.startswith('{'): continue
        try: body = unique_json(message)
        except (ValueError, json.JSONDecodeError): continue
        if isinstance(body, dict) and body.get('scope') == 'morphiume-staging-runtime': entries.append(entry)
    require(len(entries) == 1); entry = entries[0]
    require(entry.get('_SYSTEMD_INVOCATION_ID') == invocation and entry.get('_SYSTEMD_UNIT') == UNIT and entry.get('_UID') == '0' and entry.get('_TRANSPORT') == 'stdout')
    require(isinstance(entry.get('_PID'), str) and re.fullmatch('[1-9][0-9]*', entry['_PID']) and int(entry['_PID']) > 1)
    require(isinstance(entry.get('_EXE'), str) and re.fullmatch(r'/usr/bin/python3(?:\.[0-9]{1,2})?', entry['_EXE']))
    require(shlex.split(entry.get('_CMDLINE', '')) == ['/usr/bin/python3', str(OPS_ROOT / 'runtime/scheduled.py'), 'health', '--apply'])
    require(isinstance(entry.get('_BOOT_ID'), str) and re.fullmatch('[a-f0-9]{32}', entry['_BOOT_ID']))
    require(isinstance(entry.get('__MONOTONIC_TIMESTAMP'), str) and re.fullmatch('[1-9][0-9]*', entry['__MONOTONIC_TIMESTAMP']))
    return entry


def gc_journal_timing(raw, health_raw, invocation):
    """Prove a complete unit lifecycle, without inventing ExecMain timestamps."""
    require(isinstance(raw, str) and len(raw.encode()) <= 4 * 1024 ** 2)
    health = trusted_health_entry(health_raw, invocation); records = {}
    allowed = {'7d4958e842da4a758f6c1cdc7b36dcc5': 'starting', '7ad2d189f7e94e70a38c781354912448': 'success',
               '39f53479d3a045ac8e11786248231fbf': 'done', 'ae8f7b866b0347b9af31fe1c80b127c0': 'resources'}
    for line in raw.splitlines():
        entry = unique_json(line); require(isinstance(entry, dict))
        require(entry.get('_PID') == '1' and entry.get('_UID') == '0' and entry.get('_TRANSPORT') == 'journal' and entry.get('UNIT') == UNIT)
        require(entry.get('_BOOT_ID') == health['_BOOT_ID'] and entry.get('INVOCATION_ID') == invocation)
        kind = allowed.get(entry.get('MESSAGE_ID')); require(kind is not None and kind not in records)
        require(isinstance(entry.get('__MONOTONIC_TIMESTAMP'), str) and re.fullmatch('[1-9][0-9]*', entry['__MONOTONIC_TIMESTAMP']))
        records[kind] = entry
    require({'starting', 'success', 'done'} <= set(records))
    starting, success, done = (records[key] for key in ('starting', 'success', 'done'))
    require(starting.get('JOB_TYPE') == done.get('JOB_TYPE') == 'start' and done.get('JOB_RESULT') == 'done')
    require(isinstance(starting.get('JOB_ID'), str) and re.fullmatch('[1-9][0-9]*', starting['JOB_ID']) and starting['JOB_ID'] == done.get('JOB_ID'))
    begin, finished, completed, emitted = (int(entry['__MONOTONIC_TIMESTAMP']) for entry in (starting, success, done, health))
    require(0 < begin < emitted <= finished <= completed and 0 < completed - begin <= 50_000_000)
    if 'resources' in records: require(int(records['resources']['__MONOTONIC_TIMESTAMP']) >= completed)
    return {'timingSource': 'unit-lifecycle-journal', 'unitCycleSeconds': (completed - begin) / 1_000_000,
            'executionSeconds': None, 'startingMonotonicUsec': begin, 'completedMonotonicUsec': completed,
            'managerJournalSha256': sha(raw.encode()), 'execMainTimingProved': False}


def reconcile_gc_measurement(measurement, identity, manager_raw):
    """Pure check of retained data; never start a service or promote its record."""
    require(isinstance(measurement, dict) and measurement.get('accepted') is False)
    final = measurement.get('properties'); require(isinstance(final, dict)); validate_effective(final)
    require(gc_final_defaults(final) and final.get('Result') == 'success' and final.get('ActiveState') == 'inactive')
    require(measurement.get('clientExit') == 0 and measurement.get('observerDeadlineExceeded') is False and measurement.get('observerFailed') is False)
    invocation = measurement.get('observedInvocationId'); require(invocation == measurement.get('invocationId'))
    health = journal_health(measurement.get('journal')); require(health == measurement.get('health')); validate_health(health, identity)
    timing = gc_journal_timing(manager_raw, measurement['journal'], invocation)
    samples = measurement.get('samples'); require(isinstance(samples, list) and samples and max(sample['memoryPeakBytes'] for sample in samples) > 0 and max(sample['cpuMicroseconds'] for sample in samples) > 0 and not any(sample['oom'] or sample['oomKill'] for sample in samples))
    return timing | {'measurementReconciled': True, 'alertsCount': 0, 'appReadiness': 200}


class Runner:
    def __init__(self): self.commands = []; self.starts = 0

    def run(self, args, timeout=15):
        allowed_show = args[:2] == ['systemctl', 'show'] and len(args) == 4 and args[2] in (UNIT, 'morphiume-runtime-backup.service', 'morphiume-runtime-health.timer', 'morphiume-runtime-backup.timer', 'docker.service', 'containerd.service') and args[3].startswith('--property=')
        health_journal = args[:3] == ['journalctl', '--no-pager', '--output=json'] and len(args) == 4 and re.fullmatch('_SYSTEMD_INVOCATION_ID=[a-f0-9]{32}', args[3])
        manager_journal = args[:3] == ['journalctl', '--no-pager', '--output=json'] and len(args) == 7 and args[3] == '_PID=1' and re.fullmatch('_BOOT_ID=[a-f0-9]{32}', args[4]) and args[5] == 'UNIT=' + UNIT and re.fullmatch('INVOCATION_ID=[a-f0-9]{32}', args[6])
        allowed = allowed_show or args == ['systemctl', 'daemon-reload'] or args == ['systemd-analyze', 'verify', '/etc/systemd/system/' + UNIT] or health_journal or manager_journal
        require(allowed); self.commands.append(args)
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
        require(len(result.stdout.encode()) <= 4 * 1024 ** 2 and len(result.stderr.encode()) <= 65536 and result.returncode == 0)
        return result.stdout

    def properties(self, unit=UNIT):
        selected = PROPERTIES if unit == UNIT else ('LoadState', 'ActiveState', 'UnitFileState')
        raw = self.run(['systemctl', 'show', unit, '--property=' + ','.join(selected)])
        return parse_properties(raw, selected)

    def start_once(self):
        require(self.starts == 0); self.starts += 1
        args = ['systemctl', 'start', UNIT]; self.commands.append(args)
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
        started = time.monotonic(); samples = []; timed_out = False; invocation = None
        observer_failed = False
        try:
            while process.poll() is None:
                if time.monotonic() - started > 65:
                    timed_out = True; process.terminate(); break  # client only; never stop/retry a service
                properties = self.properties(); group = properties.get('ControlGroup'); observed = properties.get('InvocationID')
                if observed and observed != '0' * 32:
                    require(re.fullmatch('[a-f0-9]{32}', observed) and invocation in (None, observed)); invocation = observed
                if group:
                    require(group == '/system.slice/' + UNIT)
                    base = Path('/sys/fs/cgroup') / group.lstrip('/')
                    try:
                        peak = int((base / 'memory.peak').read_text().strip())
                        cpu = dict(line.split() for line in (base / 'cpu.stat').read_text().splitlines())
                        events = dict(line.split() for line in (base / 'memory.events').read_text().splitlines())
                        samples.append({'elapsedSeconds': time.monotonic() - started, 'memoryPeakBytes': peak, 'cpuMicroseconds': int(cpu['usage_usec']), 'oom': int(events.get('oom', 0)), 'oomKill': int(events.get('oom_kill', 0))})
                        require(len(samples) <= 260 and peak >= 0)
                    except FileNotFoundError: pass  # oneshot cgroup can disappear on exit
                time.sleep(0.25)
        except (OSError, ValueError, KeyError, subprocess.SubprocessError): observer_failed = True
        try: stdout, stderr = process.communicate(timeout=max(1, 65 - (time.monotonic() - started)))
        except subprocess.TimeoutExpired:
            timed_out = True
            process.kill(); stdout, stderr = process.communicate(timeout=5)
        require(len(stdout.encode()) <= 65536 and len(stderr.encode()) <= 65536)
        return {'clientExit': process.returncode, 'observerDeadlineExceeded': timed_out, 'observerFailed': observer_failed, 'observedInvocationId': invocation, 'wallSeconds': time.monotonic() - started, 'clientStdout': stdout, 'clientStderr': stderr, 'samples': samples}


def measure_once(runner, identity):
    properties = runner.properties(); validate_effective(properties)
    require(properties.get('ActiveState') == 'inactive' and properties.get('InvocationID') in ('', '0' * 32) and properties.get('ExecMainStartTimestampMonotonic') in ('', '0'))
    result = runner.start_once(); result['accepted'] = False
    try:
        final = runner.properties(); result['properties'] = final; validate_effective(final)
        invocation = result.get('observedInvocationId') or final.get('InvocationID'); require(isinstance(invocation, str) and re.fullmatch('[a-f0-9]{32}', invocation) and invocation != '0' * 32)
        require(final.get('InvocationID') in ('', '0' * 32, invocation))
        raw = runner.run(['journalctl', '--no-pager', '--output=json', '_SYSTEMD_INVOCATION_ID=' + invocation]); result.update({'journal': raw, 'invocationId': invocation})
        health = journal_health(raw); result['health'] = health
        require(result['clientExit'] == 0 and result['observerDeadlineExceeded'] is False and result['observerFailed'] is False and final.get('Result') == 'success' and final.get('ActiveState') == 'inactive')
        if gc_final_defaults(final):
            entry = trusted_health_entry(raw, invocation)
            manager = runner.run(['journalctl', '--no-pager', '--output=json', '_PID=1', '_BOOT_ID=' + entry['_BOOT_ID'], 'UNIT=' + UNIT, 'INVOCATION_ID=' + invocation])
            result['managerJournal'] = manager
            timing = reconcile_gc_measurement(result, identity, manager); result['timingEvidence'] = timing
        else:
            require(final.get('ConditionResult') == 'yes' and final.get('AssertResult') == 'yes' and final.get('ExecMainCode') == '1' and final.get('ExecMainStatus') == '0')
            start = int(final.get('ExecMainStartTimestampMonotonic')); end = int(final.get('ExecMainExitTimestampMonotonic')); require(0 < start < end and (end - start) <= 50_000_000)
            timing = {'executionSeconds': (end - start) / 1_000_000, 'unitCycleSeconds': None, 'timingSource': 'exec-main-monotonic'}
        require(result['samples'] and max(sample['memoryPeakBytes'] for sample in result['samples']) > 0 and max(sample['cpuMicroseconds'] for sample in result['samples']) > 0 and not any(sample['oom'] or sample['oomKill'] for sample in result['samples']))
        validate_health(health, identity)
        result.update({'accepted': True, 'health': health, **{key: timing[key] for key in ('executionSeconds', 'unitCycleSeconds', 'timingSource')}})
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError): result['failureClass'] = 'complete-unit-or-health-evidence-rejected'
    return result


def write_exclusive(path, content, mode=0o600):
    require(not path.exists() and not path.is_symlink()); protected_path(path.parent, directory=True, mode=0o700 if str(path.parent).startswith(str(ROOT)) or path.parent == CONFIG else 0o755)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream: stream.write(content); stream.flush(); os.fsync(stream.fileno())


def approval_record(request):
    validate_request(request)
    return request['identity'] | {'mode': 'quiesce-runtime-only', 'sharedDatabaseWindowReleased': True, 'restoreEvidence': str(RESTORE / 'recovery-accepted.json')}


def validate_existing_approval(value, request):
    require(value == approval_record(request) and value.get('sharedDatabaseWindowReleased') is True)


def install_public(path, content):
    protected_path(path.parent.parent, directory=True)
    if not path.parent.exists(): os.mkdir(path.parent, 0o755)
    protected_path(path.parent, directory=True, mode=0o755)
    if path.exists() or path.is_symlink(): require(read_protected(path, mode=0o644) == content)
    else: write_exclusive(path, content, mode=0o644)


def runtime_state(c, release):
    c.db_container()
    original = unique_json(c.run(['docker', 'inspect', c.DB_CONTAINER]))[0]
    originals = {'id': original['Id'], 'image': original['Image'], 'status': original['State']['Status'], 'health': original['State'].get('Health', {}).get('Status'), 'oom': original['State']['OOMKilled'], 'restarts': original['RestartCount'], 'mountsDigest': canonical(original['Mounts'])}
    require(originals['status'] == 'running' and originals['health'] == 'healthy' and originals['oom'] is False)
    runtime_ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
    require(len(runtime_ids) == 2); runtime = unique_json(c.run(['docker', 'inspect', *runtime_ids])); c.validate_app_containers(runtime, release)
    require(all(x['State']['OOMKilled'] is False and x['RestartCount'] == 0 for x in runtime))
    restore_ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + RESTORE_PROJECT, '--format', '{{.ID}}']).splitlines()
    require(len(restore_ids) == 2); restored = unique_json(c.run(['docker', 'inspect', *restore_ids])); require({x['Config']['Labels'].get('com.docker.compose.service') for x in restored} == {'app', 'db'})
    for item in restored:
        require(item['State']['Running'] is False and item['State']['OOMKilled'] is False)
        service = item['Config']['Labels']['com.docker.compose.service']
        require(item['Config']['Labels'].get('com.docker.compose.project') == RESTORE_PROJECT)
        if service == 'app': c.validate_app_containers([item], release, services=('app',), running=False)
        else: require(item['Config']['Image'] == c.PG_IMAGE and item['Config']['User'] == '999:999')
        require(any(m.get('Type') == 'bind' and m.get('Source') == str(RESTORE / ('media' if service == 'app' else 'postgres')) for m in item['Mounts']))
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=5) as response: require(response.status == 200)
    return {'original': originals, 'runtime': [{'id': x['Id'], 'image': x['Image'], 'service': x['Config']['Labels']['com.docker.compose.service'], 'oom': x['State']['OOMKilled'], 'restarts': x['RestartCount']} for x in runtime], 'restoreStoppedCount': 2}


def run_locked(request):
    validate_request(request); require(sys.platform == 'linux' and os.getuid() == 0)
    pub, evidence, identity = request['publication'], request['evidence'], request['identity']
    tool_root = ROOT / 'releases' / SOURCE / 'tools' / pub['remoteToolSha256']
    protected_path(tool_root, directory=True, mode=0o700)
    binding = unique_json(read_protected(tool_root / 'operator-tool.json', maximum=65536))
    require(binding == pub | {'applicationSourceCommit': SOURCE, 'opsSha256': OPS})
    remote = read_protected(tool_root / 'measure-591-health-remote.py', mode=0o644, maximum=1024 ** 2); require(sha(remote.replace(b'\r\n', b'\n')) == pub['remoteToolSha256'])
    sources = {}
    for name, expected in DROPINS.items():
        content = read_protected(tool_root / 'configuration' / name, mode=0o644, maximum=65536); require(sha(content.replace(b'\r\n', b'\n')) == expected); sources[name] = content
    c = bootstrap_old(); release = c.deployed_image(); profile = c.active_profile(required=True)
    recovery_identity = unique_json(read_protected(CACHE.parent / 'tool-identity.json', maximum=65536))
    require(recovery_identity == {'sourceCommit': evidence['recoveryToolSourceCommit'], 'toolSha256': RECOVERY_TOOL, 'applicationSourceCommit': SOURCE, 'opsSha256': OPS})
    require(sha(read_protected(CACHE.parent / 'recover-pre-service-restore.py', mode=0o644, maximum=1024 ** 2).replace(b'\r\n', b'\n')) == RECOVERY_TOOL)
    require(all((c.canonical_hash(profile) if key == 'accessProfileSha256' else release.get(key)) == value for key, value in identity.items()))
    require(profile['profile'] == 'ssh-localhost' and profile['origin'] == 'http://localhost:3100'); c.load_configs()
    require(read_protected(CONFIG / 'deploy.env').decode() == 'MORPHIUME_IMAGE=' + identity['runtimeImageId'] + '\nMORPHIUME_OPS_ROOT=' + str(OPS_ROOT) + '\nMORPHIUME_APP_BASE_URL=http://localhost:3100\n')
    protected_path(RESTORE, directory=True, mode=0o700); protected_path(BACKUP, directory=True, mode=0o700)
    records = {}
    for name, key, root in [('recovery-accepted.json', 'acceptanceSha256', RESTORE), ('business-acceptance-result.json', 'remoteResultRawSha256', RESTORE), ('recovery-ready.json', 'readyRecordSha256', RESTORE), ('recovery-journal.json', 'journalSha256', RESTORE), ('backup-manifest.json', 'backupManifestSha256', BACKUP)]:
        content = read_protected(root / name); require(sha(content) == evidence[key]); records[name] = unique_json(content)
    fixture = read_protected(CONFIG / 'retained-fixture.json'); require(sha(fixture) == evidence['fixtureSha256'])
    require(c.canonical_hash(unique_json(read_protected(RESTORE / 'app.json', uid=1001))) == evidence['restoreConfigSha256'])
    validate_marker(records['recovery-accepted.json'], records['business-acceptance-result.json'], records['recovery-journal.json'], records['recovery-ready.json'], records['backup-manifest.json'], request)
    runner = Runner()
    for unit in ('morphiume-runtime-health.timer', 'morphiume-runtime-backup.timer', 'morphiume-runtime-backup.service'):
        value = runner.properties(unit); require(value.get('LoadState') == 'not-found' and value.get('ActiveState') == 'inactive')
    for unit in ('docker.service', 'containerd.service'): require(runner.properties(unit).get('ActiveState') == 'active')
    old_unit = runner.properties(); require(old_unit.get('LoadState') == 'not-found' or old_unit.get('ActiveState') == 'inactive' and old_unit.get('InvocationID') in ('', '0' * 32) and old_unit.get('ExecMainStartTimestampMonotonic') in ('', '0'))
    require(old_unit.get('UnitFileState') in ('', 'not-found', 'static', 'disabled'))
    if old_unit.get('LoadState') != 'not-found':
        require(old_unit.get('FragmentPath') == '/etc/systemd/system/' + UNIT and set(shlex.split(old_unit.get('DropInPaths', ''))) <= set(map(str, TARGETS.values())))
    for parent in (Path('/etc/systemd/system/' + UNIT + '.d'), Path('/run/systemd/system/' + UNIT + '.d')):
        if parent.exists() or parent.is_symlink():
            protected_path(parent, directory=True, mode=0o755); require(set(x.name for x in parent.iterdir()) <= {p.name for p in TARGETS.values() if p.parent == parent})
    before = runtime_state(c, release)
    destination = ROOT / 'metrics' / ('scheduled-health-' + request['measurementId'])
    protected_path(destination.parent, directory=True, mode=0o700); require(not destination.exists() and not destination.is_symlink()); os.mkdir(destination, 0o700)
    step = 0
    def journal(stage):
        nonlocal step
        write_exclusive(destination / ('stage-%02d.json' % step), (json.dumps({'stage': stage, 'utc': utc(), 'requestSha256': canonical(request)}, sort_keys=True) + '\n').encode()); step += 1
    journal('preflight-passed')
    result = None
    try:
        approval = approval_record(request)
        journal('approval-started')
        approved = CONFIG / 'schedule-approved.json'
        if approved.exists() or approved.is_symlink(): validate_existing_approval(unique_json(read_protected(approved)), request)
        else: write_exclusive(approved, (json.dumps(approval, sort_keys=True) + '\n').encode())
        base = read_protected(OPS_ROOT / 'runtime/systemd' / UNIT, mode=0o644); require(sha(base.replace(b'\r\n', b'\n')) == BASE_SHA)
        journal('health-only-install-started')
        install_public(Path('/etc/systemd/system/' + UNIT), base)
        for name, target in TARGETS.items(): install_public(target, sources[name])
        runner.run(['systemd-analyze', 'verify', '/etc/systemd/system/' + UNIT]); runner.run(['systemctl', 'daemon-reload'])
        validate_effective(runner.properties()); journal('one-start-started')
        result = measure_once(runner, identity); require(result['accepted'] is True)
        journal('post-identity-check-started')
        verify_bundle(); require(not CACHE.exists() and not CACHE.is_symlink())
        actual = c.deployed_image(); actual_profile = c.active_profile(required=True)
        require(all((c.canonical_hash(actual_profile) if key == 'accessProfileSha256' else actual.get(key)) == value for key, value in identity.items()))
        require(runtime_state(c, actual) == before)
        for root, name, key in ((RESTORE, 'recovery-accepted.json', 'acceptanceSha256'), (RESTORE, 'business-acceptance-result.json', 'remoteResultRawSha256'), (RESTORE, 'recovery-ready.json', 'readyRecordSha256'), (RESTORE, 'recovery-journal.json', 'journalSha256')): require(sha(read_protected(root / name)) == evidence[key])
        journal('accepted')
        record = {'schemaVersion': 1, 'mode': 'scheduled-health-measured', 'accepted': True, 'identity': identity, 'requestSha256': canonical(request), 'before': before, 'measurement': result, 'commands': runner.commands, 'notificationDelivery': 'local-only-not-configured', 'timersStarted': False, 'backupExecuted': False, 'writerStopExecuted': False, 'sqlMutationExecuted': False, 'originalTableEqualityMeasured': False}
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        journal('failed-no-retry')
        record = {'schemaVersion': 1, 'mode': 'scheduled-health-failed', 'accepted': False, 'identity': identity, 'requestSha256': canonical(request), 'before': before, 'measurement': result, 'commands': runner.commands, 'privateContextWithheld': True, 'automaticRetry': False, 'originalTableEqualityMeasured': False}
    content = (json.dumps(record, sort_keys=True) + '\n').encode(); write_exclusive(destination / 'private-evidence.json', content)
    measurement = record.get('measurement') or {}; final = measurement.get('properties') or {}; samples = measurement.get('samples') or []
    health = measurement.get('health') or {}
    summary = {'schemaVersion': 1, 'mode': record['mode'], 'accepted': record['accepted'], 'identity': identity, 'privateEvidenceSha256': sha(content), 'measurementId': request['measurementId'], 'systemctlStartCount': runner.starts, 'unitResult': final.get('Result', 'unavailable'), 'wallSeconds': measurement.get('wallSeconds'), 'executionSeconds': measurement.get('executionSeconds'), 'unitCycleSeconds': measurement.get('unitCycleSeconds'), 'timingSource': measurement.get('timingSource'), 'sampleCount': len(samples), 'sampledMemoryPeakBytes': max((x['memoryPeakBytes'] for x in samples), default=None), 'sampledCpuMicroseconds': max((x['cpuMicroseconds'] for x in samples), default=None), 'alertsCount': len(health['alerts']) if isinstance(health.get('alerts'), list) else None, 'appReadiness': health.get('appReadiness'), 'timersStarted': False, 'backupExecuted': False, 'writerStopExecuted': False, 'sqlMutationExecuted': False, 'originalTableEqualityMeasured': False}
    return summary


def run(request):
    validate_request(request); require(sys.platform == 'linux' and os.getuid() == 0)
    import fcntl
    # Existing release lock is opened read-only: no lockfile creation/truncation.
    lock = Path('/srv/morphiume/staging/deploy.lock'); protected_path(lock.parent, directory=True)
    info = lock.lstat(); require(stat.S_ISREG(info.st_mode) and not lock.is_symlink() and lock.resolve() == lock and info.st_uid == 0 and info.st_gid == 0 and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1 and info.st_size <= 65536)
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return run_locked(request)
    finally: os.close(fd)


if __name__ == '__main__':
    try:
        summary = run(globals().get('REQUEST'))
        print(json.dumps(summary, separators=(',', ':')))
        raise SystemExit(0 if summary['accepted'] else 1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('{"mode":"scheduled-health-stopped","accepted":false,"privateContextWithheld":true,"automaticRetry":false}')
        raise SystemExit(1) from None
