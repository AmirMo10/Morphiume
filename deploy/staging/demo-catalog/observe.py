#!/usr/bin/env python3
"""Read-only facts for a separate demo-catalog data operation. Default is inert.

The coordinator supplies the already completed UI release request/journal and
an existing encrypted backup reference through protected stdin. This helper
does not dispatch a release phase, backup, timer, app, DB writer or migration.
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import types
import urllib.parse

CONTROL = 'b86d37a701d2ffb02597cea6386a076d3d4b5a4148a29f2e1a3e852e2c770786'
SOURCE = '32b89e13d31288fe4497f7419e170550baf5b293'
IMAGE = 'sha256:a72b341aaef4dc0006f3073015aac228cba692afca73ebbab49a1da9883b5391'
PROFILE = '65831c6a405bbab67c6f1f20579687d65403c688e78dc6d8b38803c04bed5142'
CAPABILITY = '0b914944e2268e831b5fd7c8376b7ee6f24ed179ee156982b8cb8dcc179a7668'
SITE = 'bb37396699c5774a5a43e7e2858cf4de0f22c99f46e7f516cb99e1dd3b4eed1c'
CONFIG = Path('/etc/morphiume-staging-runtime')
ROOT = Path('/srv/morphiume/staging/runtime')
HASH = re.compile(r'[a-f0-9]{64}')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
CHECKPOINT = 'default-inert'


def need(value, code='demo_catalog_observer_guard'):
    if not value:
        raise ValueError(code)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def checked(path, mode, directory=False, maximum=1024**2, uid=0):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path and not any(p.is_symlink() for p in (path, *path.parents)))
    for parent in path.parents:
        info = parent.stat()
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and not stat.S_IMODE(info.st_mode) & 0o022)
    info = path.stat()
    need(info.st_uid == info.st_gid == uid and stat.S_IMODE(info.st_mode) == mode)
    need(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= maximum)
    return path


def inputs(value):
    need(type(value) is dict and set(value) == {'operationId', 'releaseOperationId', 'request', 'expectedStateSha256', 'backup'})
    need(all(isinstance(value[key], str) and UUID.fullmatch(value[key]) for key in ('operationId', 'releaseOperationId')))
    need(value['operationId'] != value['releaseOperationId'])
    ref = value['request']
    need(type(ref) is dict and set(ref) == {'path', 'sha256'} and isinstance(ref['sha256'], str) and HASH.fullmatch(ref['sha256']))
    path = Path(ref['path'])
    need(path.parent == CONFIG / 'ui-release-requests' and path.suffix == '.json' and UUID.fullmatch(path.stem))
    need(isinstance(value['expectedStateSha256'], str) and HASH.fullmatch(value['expectedStateSha256']))
    backup = value['backup']
    need(type(backup) is dict and set(backup) == {'directory', 'manifestSha256', 'ciphertextSha256'})
    path = Path(backup['directory'])
    need(path.parent == ROOT / 'backups' and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', path.name))
    need(isinstance(backup['manifestSha256'], str) and HASH.fullmatch(backup['manifestSha256']))
    need(type(backup['ciphertextSha256']) is dict and set(backup['ciphertextSha256']) == {'database.dump.age', 'media.tar.gz.age'})
    need(all(isinstance(v, str) and HASH.fullmatch(v) for v in backup['ciphertextSha256'].values()))
    return value


def utc(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(parsed.utcoffset() == dt.timedelta(0))
    return parsed


def verify_backup(value, control, candidate):
    directory = checked(value['directory'], 0o700, True)
    body = control.raw(directory / 'backup-manifest.json', value['manifestSha256'])
    manifest = control.parse(body)
    control.need(manifest['ciphertextSha256'] == value['ciphertextSha256'])
    control.need(manifest['database'] == 'morphiume_staging_runtime')
    control.need(all(manifest[key] == candidate[key] for key in candidate))
    control.need(manifest['backupOpsSha256'] == candidate['opsSha256'])
    created = utc(manifest['backupCompleteUtc'])
    age = (dt.datetime.now(dt.timezone.utc) - created).total_seconds()
    control.need(0 <= age <= 86400)
    for name, expected in value['ciphertextSha256'].items():
        with checked(directory / name, 0o600, maximum=1024**3).open('rb') as stream:
            control.need(hashlib.file_digest(stream, 'sha256').hexdigest() == expected)
    return {'createdUtc': created.isoformat().replace('+00:00', 'Z'),
            'databaseCiphertextSha256': value['ciphertextSha256']['database.dump.age'],
            'mediaCiphertextSha256': value['ciphertextSha256']['media.tar.gz.age']}


def main():
    global CHECKPOINT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--observe', action='store_true')
    args = parser.parse_args()
    if not args.observe:
        return {'mode': 'unexecuted-demo-catalog-observer', 'serverMutation': False, 'credentialsExported': False}
    CHECKPOINT = 'input'
    need(os.name == 'posix' and os.getuid() == 0)
    value = inputs(json.load(sys.stdin))
    CHECKPOINT = 'verified-control-and-cache'
    own = checked(CONFIG / 'ui-release-tools' / CONTROL / 'control.py', 0o644)
    checked(own.parent, 0o700, True)
    body = own.read_bytes()
    need(hashlib.sha256(body).hexdigest() == CONTROL)
    prefix = own.parent / 'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink())
    sys.dont_write_bytecode = True
    sys.pycache_prefix = str(prefix)
    control = types.ModuleType('demo_catalog_observer_verified_control')
    control.__file__ = str(own)
    exec(compile(body, str(own), 'exec'), control.__dict__)
    CHECKPOINT = 'completed-release-observation'
    namespace = types.SimpleNamespace(action='observe', request=value['request']['path'], request_sha256=value['request']['sha256'], self_sha256=CONTROL, expected_state_sha256=value['expectedStateSha256'])
    request, context = control.load(namespace)
    need(request['operationId'] == value['releaseOperationId'] and request['candidate']['sourceCommit'] == SOURCE)
    state = control.state_for(request, value['expectedStateSha256'])
    need(state['phase'] == 'complete-timers-active-enabled')
    observed = control.observe_current(request, state, *context)
    h, c, backup, health, g, p, r = context
    need(observed['candidate']['runtimeImageId'] == IMAGE and observed['candidateProfileSha256'] == PROFILE)
    need(request['capabilitySha256'] == CAPABILITY and request['siteSha256'] == SITE)
    for unit, result in observed['units'].items():
        need(result['LoadState'] == 'loaded' and result['Result'] == 'success')
        need(result['ActiveState'] == 'active' and result['UnitFileState'] == 'enabled' if unit.endswith('.timer') else result['ActiveState'] == 'inactive' and result['ExecMainStatus'] == '0')
    CHECKPOINT = 'stable-protected-state'
    # The completed release owns six stopped pairs. `extra` excludes a pair
    # during its active restore phase, so it must NOT be used at this phase.
    protected = control.protected(request | {'preservedPairCount': request['preservedPairCount'] + 1}, h, c, g, p)
    need(len(protected['pairs']) == 6)
    h.ready()
    app = control.parse(control.raw(CONFIG / 'app.json', uid=1001))
    need('DEPLOYMENT_ENV' not in app and app['APP_BASE_URL'] == 'http://192.168.240.51' and app['PAYMENT_PROVIDER'] == app['SMS_PROVIDER'] == 'mock')
    url = urllib.parse.urlsplit(app['DATABASE_URL'])
    need(url.scheme == 'postgresql' and url.hostname == 'db' and url.port == 5432 and url.path == '/morphiume_staging_runtime' and url.username == 'morphiume_runtime_app' and bool(url.password) and not url.query and not url.fragment)
    capability = control.parse(control.raw(h.CAPABILITY, request['capabilitySha256'], uid=1001))
    need(UUID.fullmatch(capability['userId']) and capability['origin'] == app['APP_BASE_URL'] and capability['email'] == 'private-preview@morphiume.invalid')
    c.db_container()
    database = control.parse(c.run(['docker', 'inspect', c.DB_CONTAINER]))[0]
    expected_port = {'5432/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '5433'}]}
    need(database['HostConfig']['PortBindings'] == expected_port and database['NetworkSettings']['Ports'] == expected_port)
    CHECKPOINT = 'existing-encrypted-checkpoint'
    checkpoint = verify_backup(value['backup'], control, state['candidate'])
    observed_utc = dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    facts = {'formatVersion': 1, 'mode': 'demo-catalog-root-raw-facts', 'operationId': value['operationId'], 'observedUtc': observed_utc,
             'release': observed, 'protected': protected, 'backupReference': value['backup'], 'backupCheckpoint': checkpoint,
             'sharedOperatorId': capability['userId'], 'databaseForward': {'containerId': database['Id'], 'serverBind': '127.0.0.1:5433', 'hostConfigAndNetworkSettingsMatched': True},
             'providerBoundary': {'origin': app['APP_BASE_URL'], 'deploymentEnv': 'staging', 'paymentProvider': app['PAYMENT_PROVIDER'], 'smsProvider': app['SMS_PROVIDER']},
             'serverMutation': False, 'credentialsExported': False}
    raw_facts = encoded(facts)
    result = {'formatVersion': 1, 'mode': 'root-demo-catalog-runtime-observation', 'observedUtc': observed_utc,
              'sourceCommit': SOURCE, 'runtimeImageId': IMAGE, 'profileSha256': PROFILE, 'capabilitySha256': CAPABILITY, 'siteSha256': SITE,
              'sharedOperatorId': capability['userId'], 'origin': app['APP_BASE_URL'], 'deploymentEnv': 'staging', 'paymentProvider': app['PAYMENT_PROVIDER'], 'smsProvider': app['SMS_PROVIDER'],
              'readyStatus': 200, 'appHealthy': True, 'workerHealthy': True, 'restorePairsStopped': len(protected['pairs']), 'timersActiveEnabled': True,
              'protectedStateSha256': hashlib.sha256(encoded(protected)).hexdigest(), 'rawObservationSha256': hashlib.sha256(raw_facts).hexdigest(), 'backupCheckpoint': checkpoint}
    return {'mode': 'demo-catalog-root-observed', 'operationId': value['operationId'], 'observation': result,
            'rawFactsSha256': hashlib.sha256(raw_facts).hexdigest(), 'rawFactsBase64': base64.b64encode(raw_facts).decode(),
            'serverMutation': False, 'credentialsExported': False}


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception as error:
        frames, trace = [], error.__traceback__
        while trace is not None:
            frames.append({'function': trace.tb_frame.f_code.co_name, 'line': trace.tb_lineno})
            trace = trace.tb_next
        print(json.dumps({'mode': 'demo-catalog-observer-gated-or-failed', 'checkpoint': CHECKPOINT, 'failureType': type(error).__name__, 'frames': frames[-6:], 'serverMutation': False, 'credentialsExported': False}))
        raise SystemExit(1) from None
