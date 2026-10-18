#!/usr/bin/env python3
"""One pristine redesign restore, preserving all three explicitly proven old pairs.

Default is a static plan. This separately published tool never changes Ops68,
starts old consumers, rewrites acceptance, resumes writers or retries a phase.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
TOOL_NAME = 'redesign-isolated-restore.py'
SOURCE = None  # Bound only by a byte-verified reviewed private plan.
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
OLD_STORAGE_POLICY_VERSION = 2
OLD_ACCEPTANCE_POLICY_VERSION = 1
OLD_RELEASES = {
 'morphiume-runtime-restore-20261012t212729z-d03c35': {
  'source': '6130f4ed7ec090344a5a4a1937a65ef04572975b',
  'ops': '591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db',
  'root': ROOT / 'restore/morphiume-runtime-restore-20261012T212729Z-d03c35',
  'extraFiles': {'restore.recovery.env': 0}, 'profile': 'ssh-localhost', 'phase': 'ready-business-acceptance-pending', 'mediaMode': 0o750,
  'acceptanceSchema': '613-legacy'},
 'morphiume-runtime-restore-20261013t090118z-504a38': {
  'source': 'e4bed691dc938a9c0f79022696d24f063ad97724',
  'ops': OPS, 'root': ROOT / 'restore/morphiume-runtime-restore-20261013t090118z-504a38',
  'extraFiles': {}, 'profile': 'ssh-localhost', 'phase': 'ready', 'mediaMode': 0o700, 'acceptanceSchema': 'e4-legacy'},
 'morphiume-runtime-restore-20261014t071244z-30668c': {
  'source': 'acf8e96ee348c487df0fcefe89d568f2bf93367a',
  'ops': OPS, 'root': ROOT / 'restore/morphiume-runtime-restore-20261014t071244z-30668c',
  'extraFiles': {}, 'profile': 'private-ip', 'phase': 'ready', 'mediaMode': 0o700, 'acceptanceSchema': 'acf8-expanded'},
}
MIGRATIONS_SHA256 = '4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119'
EXPECTED = {}  # No forthcoming image identity is guessed here.
OPS_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py',
 'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py',
 'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py', 'runtime/monitor.py',
 'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py', 'runtime/operator-config.mjs',
 'runtime/engine_image.py', 'runtime/systemd/morphiume-runtime-backup.service',
 'runtime/systemd/morphiume-runtime-backup.timer', 'runtime/systemd/morphiume-runtime-health.service',
 'runtime/systemd/morphiume-runtime-health.timer')
IDENTITY = ('sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256',
            'opsSha256', 'runtimeImageId', 'engineProofSha256', 'accessProfileSha256')
OLD_FILES = {'app.json': 1001, 'restore.env': 0,
 'db_bootstrap_password': 999, 'db_owner_password': 999, 'db_app_password': 999,
 'recovery-start.json': 0, 'recovery-journal.json': 0, 'recovery-ready.json': 0,
 'recovery-accepted.json': 0, 'business-acceptance-result.json': 0}
HASH = re.compile('[a-f0-9]{64}')
COMMIT = re.compile('[a-f0-9]{40}')
UUID = re.compile('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
PROJECT = re.compile('morphiume-runtime-restore-[0-9]{8}t[0-9]{6}z-[a-f0-9]{6}')
CHECKS = {'nativeLogin', 'ownedOrder', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}
NATIVE_CHECKS = {'nativeLogin', 'adminMfa', 'csrf', 'cookies', 'ownedOrder', 'paymentReceiptDedup',
 'newT25', 'mediaHashes', 'perimeter', 'headers', 'productCreateUi', 'productPublishUi',
 'checkoutCreated', 'mockPaymentVerified', 'inventorySingleCommit', 'shipmentRecorded',
 'trackingOwned', 'foreignOrderDenied', 'callbackReplayStable', 'uiImageGalleryLink'}



def bind_reviewed_plan(args):
    """Verify self and the companion bytes before evaluating a private plan."""
    for value in (args.tool_sha256, args.plan_sha256, args.plan_companion_sha256):
        need(isinstance(value, str) and HASH.fullmatch(value))
    need(isinstance(args.source, str) and COMMIT.fullmatch(args.source))
    need(isinstance(args.tool_source_commit, str) and COMMIT.fullmatch(args.tool_source_commit))
    parent = ROOT / 'releases' / args.source / 'tools' / args.tool_sha256
    tool = Path(__file__)
    need(tool == parent / TOOL_NAME and tool.resolve() == tool)
    for path, mode, directory in ((parent, 0o700, True), (tool, 0o644, False),
                                 (parent / 'redesign-plan.py', 0o644, False)):
        for ancestor in path.parents:
            info = ancestor.lstat()
            need(ancestor.is_dir() and not ancestor.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
        info = path.lstat()
        need(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o777 == mode)
        need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and info.st_size <= 1024**2)
    need(sha(tool.read_bytes()) == args.tool_sha256)
    companion = parent / 'redesign-plan.py'
    raw = companion.read_bytes(); need(sha(raw) == args.plan_companion_sha256)
    cache_guard(parent)
    namespace = {'__name__': 'redesign_plan', '__file__': str(companion)}
    exec(compile(raw, str(companion), 'exec'), namespace)
    plan = namespace['read'](args)
    global SOURCE, EXPECTED, BUNDLE
    SOURCE = plan['candidate']['sourceCommit']; EXPECTED = plan['candidate'].copy()
    BUNDLE = ROOT / 'releases' / SOURCE / 'ops-bundles' / OPS / 'ops'
    return plan


def need(value):
    if not value:
        raise ValueError('redesign isolated restore guard failed')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def parse(value):
    def pairs(items):
        result = {}
        for key, item in items:
            need(key not in result)
            result[key] = item
        return result
    return json.loads(value, object_pairs_hook=pairs, parse_constant=lambda _: need(False))


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def timestamp(value):
    need(isinstance(value, str))
    result = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(result.tzinfo is not None and result.utcoffset() == datetime.timedelta(0))
    return result


def metadata(path, uid=0, mode=0o600, directory=False):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path)
    for parent in path.parents:
        info = parent.lstat()
        need(parent.is_dir() and not parent.is_symlink() and info.st_uid == 0)
        need(not info.st_mode & 0o022 or parent == Path('/dev/shm') and info.st_mode & 0o7777 == 0o1777)
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == uid and info.st_mode & 0o777 == mode)
    need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and info.st_size <= 4 * 1024**2)
    return path


def private_json(path, expected, uid=0):
    need(isinstance(expected, str) and HASH.fullmatch(expected))
    raw = metadata(path, uid).read_bytes()
    need(sha(raw) == expected)
    return parse(raw)


def verify_ops(bundle):
    metadata(bundle, mode=0o700, directory=True)
    manifest = parse(metadata(bundle / 'ops-manifest.json').read_bytes())
    need(type(manifest) is dict and set(manifest) == set(OPS_FILES))
    for name in OPS_FILES:
        need(isinstance(manifest[name], str) and HASH.fullmatch(manifest[name]))
        file = bundle / name
        # Public files are 0644, private parents stay 0700. Reject stale sources.
        need(sha(metadata(file, mode=0o644).read_bytes().replace(b'\r\n', b'\n')) == manifest[name])
    need(sha(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()) == OPS)


def cache_guard(parent):
    prefix = parent / 'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink())
    sys.dont_write_bytecode = True
    sys.pycache_prefix = str(prefix)
    return prefix


def import_ops(args):
    need(os.name == 'posix' and os.getuid() == 0 and args.quiescent_window_released)
    need(args.source == SOURCE and args.ops_sha256 == OPS)
    need(args.config_id == EXPECTED['testedPlatformConfig'] and args.manifest_digest == EXPECTED['candidateManifestDigest']
         and args.archive_sha256 == EXPECTED['archiveSha256'])
    need(args.runtime_image_id == EXPECTED['runtimeImageId'] and args.engine_proof_sha256 == EXPECTED['engineProofSha256'])
    need(COMMIT.fullmatch(args.tool_source_commit) and COMMIT.fullmatch(args.ops_source_commit))
    need(HASH.fullmatch(args.tool_sha256))
    parent = ROOT / 'releases' / SOURCE / 'tools' / args.tool_sha256
    tool = metadata(Path(__file__), mode=0o644)
    need(tool == parent / 'redesign-isolated-restore.py' and sha(tool.read_bytes()) == args.tool_sha256)
    metadata(parent, mode=0o700, directory=True)
    cache_guard(parent)  # Before every old SourceFileLoader, including dynamic helpers.
    bundle = ROOT / 'releases' / SOURCE / 'ops-bundles' / OPS / 'ops'
    need(Path(args.ops_root) == bundle)
    verify_ops(bundle)
    need(not any(name in sys.modules for name in ('contract', 'restore')))
    result = []
    for name in ('contract', 'restore'):
        spec = importlib.util.spec_from_file_location(name, bundle / 'runtime' / (name + '.py'))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        result.append(module)
    need(result[0].ops_digest() == OPS)
    return *result, parent


def inventory_shape(record):
    keys = {'observedAt', 'mutation', 'sql', 'project', 'root', 'rootMetadata',
            'storageMetadata', 'files', 'containers', 'tcp3002ListenerAbsent', 'mediaSnapshot'}
    need(type(record) is dict and set(record) == keys and record['project'] in OLD_RELEASES)
    expected = OLD_RELEASES[record['project']]; root = expected['root']
    need(record['mutation'] is False and record['sql'] is False and record['tcp3002ListenerAbsent'] is True)
    need(timestamp(record['observedAt']) <= datetime.datetime.now(datetime.timezone.utc))
    need(record['root'] == str(root))
    files = OLD_FILES | expected['extraFiles']
    need(type(record['files']) is list and len(record['files']) == len(files))
    need({item['path'] for item in record['files']} == {str(root / name) for name in files})
    need(set(record['rootMetadata']) == {'path', 'uid', 'gid', 'mode', 'device', 'inode'})
    need(record['rootMetadata']['path'] == str(root))
    need(type(record['storageMetadata']) is list and len(record['storageMetadata']) == 2)
    need({item['path'] for item in record['storageMetadata']} == {str(root / name) for name in ('postgres', 'media')})
    for item in record['storageMetadata']:
        need(set(item) == {'path', 'uid', 'gid', 'mode', 'device', 'inode'})
        media = item['path'] == str(root / 'media')
        need(item['uid'] == item['gid'] == (1001 if media else 999))
        need(item['mode'] == oct(old_media_mode(record['project']) if media else 0o700))
    for item in record['files']:
        need(set(item) == {'path', 'uid', 'gid', 'mode', 'device', 'inode', 'bytes', 'sha256'})
        need(isinstance(item['sha256'], str) and HASH.fullmatch(item['sha256']))
        need(item['uid'] == files[Path(item['path']).name] and item['mode'] == '0o600')
    need(type(record['containers']) is list and len(record['containers']) == 2)
    need({item['service'] for item in record['containers']} == {'app', 'db'})
    need(len({item['id'] for item in record['containers']}) == 2)
    for item in record['containers']:
        need(set(item) == {'id', 'name', 'service', 'project', 'restoreScope', 'imageId', 'configuredImage',
                          'sourceCommit', 'user', 'state', 'mounts', 'networks', 'portBindings'})
        need(HASH.fullmatch(item['id']) and item['name'] == '/' + record['project'] + '-' + item['service'] + '-1')
        need(item['project'] == record['project'] and item['restoreScope'] == 'runtime')
        need(set(item['state']) == {'Status', 'Running', 'Paused', 'Restarting', 'ExitCode', 'StartedAt', 'FinishedAt'})
        need(item['state']['Running'] is False and item['state']['Paused'] is False and item['state']['Restarting'] is False
             and item['state']['Status'] == 'exited')
        need(item['state']['ExitCode'] in ((0, 143) if item['service'] == 'app' else (0,)))
        need(isinstance(item['mounts'], list) and isinstance(item['networks'], list))
    need(type(record['mediaSnapshot']) is dict)
    return record


def inventories_shape(value):
    need(type(value) is dict and set(value) == {'version', 'pairs'} and type(value['version']) is int and value['version'] == 1)
    need(type(value['pairs']) is list and len(value['pairs']) == 3)
    need({record.get('project') for record in value['pairs']} == set(OLD_RELEASES))
    for record in value['pairs']: inventory_shape(record)
    return value


def container_view(item):
    labels = item['Config']['Labels']
    return {'id': item['Id'], 'name': item['Name'], 'service': labels.get('com.docker.compose.service'),
        'project': labels.get('com.docker.compose.project'), 'restoreScope': labels.get('morphiume.restore.scope'),
        'imageId': item['Image'], 'configuredImage': item['Config']['Image'], 'sourceCommit': labels.get('org.opencontainers.image.revision'),
        'user': item['Config']['User'], 'state': {key: item['State'].get(key) for key in
        ('Status', 'Running', 'Paused', 'Restarting', 'ExitCode', 'StartedAt', 'FinishedAt')},
        'mounts': [{key: mount.get(key) for key in ('Type', 'Source', 'Destination', 'Mode', 'RW', 'Propagation')} for mount in item['Mounts']],
        'networks': sorted(item['NetworkSettings']['Networks']), 'portBindings': item['HostConfig']['PortBindings']}


def validate_old_actual(record, items, pg_image, old_identity):
    inventory_shape(record)
    expected = OLD_RELEASES[record['project']]; root = expected['root']; project = record['project']
    actual = sorted([container_view(item) for item in items], key=lambda x: x['id'])
    need(actual == sorted(record['containers'], key=lambda x: x['id']))
    services = {item['service']: item for item in actual}
    need(services['app']['imageId'] == old_identity['runtimeImageId'])
    need(services['app']['sourceCommit'] == expected['source'] and services['app']['user'] == '1001:1001')
    need(services['db']['user'] == '999:999')
    db = next(item for item in items if item['Id'] == services['db']['id']); need(db['Config']['Image'] == pg_image)
    need(services['app']['portBindings'] == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3002'}]})
    need(not services['db']['portBindings'])
    need(any(m['Type'] == 'bind' and m['Source'] == str(root / 'media') and m['Destination'] == '/app/media'
             and m['RW'] is True for m in services['app']['mounts']))
    need(any(m['Type'] == 'bind' and m['Source'] == str(root / 'postgres') and m['Destination'] == '/var/lib/postgresql'
             and m['RW'] is True for m in services['db']['mounts']))
    for item in actual:
        for mount in item['mounts']:
            if mount['Type'] == 'bind':
                need(Path(mount['Source']).is_relative_to(root) or
                     Path(mount['Source']).is_relative_to(ROOT / 'releases' / expected['source']))
        need(item['networks'] == sorted([project + '_restore'] + ([project + '_edge'] if item['service'] == 'app' else [])))
    need(all(item['State'].get('OOMKilled') is False for item in items))
    return actual


def old_files(record):
    expected = OLD_RELEASES[record['project']]; root = expected['root']; files = OLD_FILES | expected['extraFiles']
    need({path.name for path in root.iterdir()} == set(files) | {'postgres', 'media'})
    for item in [record['rootMetadata'], *record['storageMetadata'], *record['files']]:
        path = Path(item['path']); info = path.lstat()
        need(not path.is_symlink() and path.resolve() == path)
        need((info.st_uid, info.st_gid, oct(info.st_mode & 0o777), info.st_dev, info.st_ino) ==
             (item['uid'], item['gid'], item['mode'], item['device'], item['inode']))
        if 'sha256' in item:
            metadata(path, item['uid']); need(info.st_size == item['bytes'] and sha(path.read_bytes()) == item['sha256'])


def old_acceptance_policy():
    expected = {
        'morphiume-runtime-restore-20261012t212729z-d03c35': '613-legacy',
        'morphiume-runtime-restore-20261013t090118z-504a38': 'e4-legacy',
        'morphiume-runtime-restore-20261014t071244z-30668c': 'acf8-expanded',
    }
    need(type(OLD_ACCEPTANCE_POLICY_VERSION) is int and OLD_ACCEPTANCE_POLICY_VERSION == 1)
    need(set(OLD_RELEASES) == set(expected))
    need(all(OLD_RELEASES[project].get('acceptanceSchema') == schema for project, schema in expected.items()))
    return {'version': 1, 'schemas': expected}


def old_acceptance_hashes(accepted, file_hashes, config_sha256, project):
    """Select one exact historical contract; renamed fields are not aliases."""
    policy = old_acceptance_policy()
    need(isinstance(project, str) and project in policy['schemas'])
    need(isinstance(config_sha256, str) and HASH.fullmatch(config_sha256))
    legacy = {'readyRecordSha256', 'journalSha256', 'restoreConfigSha256'}
    expanded = {'restoreReadySha256', 'restoreJournalSha256', 'restoreConfigCanonicalSha256',
                'restoreStartSha256', 'rawResultSha256'}
    schema = policy['schemas'][project]
    if schema == 'acf8-expanded':
        need(not (legacy | {'resultSha256'}) & set(accepted))
        expected = {'restoreReadySha256': file_hashes['recovery-ready.json'],
            'restoreJournalSha256': file_hashes['recovery-journal.json'],
            'restoreConfigCanonicalSha256': config_sha256,
            'restoreConfigRawSha256': file_hashes['app.json'],
            'restoreStartSha256': file_hashes['recovery-start.json'],
            'rawResultSha256': file_hashes['business-acceptance-result.json']}
    else:
        need(not expanded & set(accepted))
        expected = {'readyRecordSha256': file_hashes['recovery-ready.json'],
            'journalSha256': file_hashes['recovery-journal.json'], 'restoreConfigSha256': config_sha256}
        if schema == 'e4-legacy': expected['restoreConfigRawSha256'] = file_hashes['app.json']
        else: need('restoreConfigRawSha256' not in accepted)
    need(all(isinstance(accepted.get(key), str) and HASH.fullmatch(accepted[key]) and accepted[key] == value
             for key, value in expected.items()))


def old_pair(c, record, items):
    inventory_shape(record)
    expected = OLD_RELEASES[record['project']]; root = expected['root']
    metadata(root, mode=0o700, directory=True); old_files(record)
    accepted = parse(metadata(root / 'recovery-accepted.json').read_bytes())
    need(accepted.get('mode') == 'native-business-restore-accepted' and accepted['sourceCommit'] == expected['source']
         and accepted['opsSha256'] == expected['ops'])
    old = c.archived_image(accepted); c.match_mapping(accepted, old)
    profile_hash = accepted['accessProfileSha256']; need(HASH.fullmatch(profile_hash))
    profile = c.read_profile(ROOT / 'releases' / expected['source'] / 'profiles' / expected['profile'] / profile_hash / 'profile.json', profile_hash)
    c.match_mapping(profile, old)
    need(set(accepted.get('checks', {})) == CHECKS and all(value is True for value in accepted['checks'].values()))
    need(accepted.get('workerStarted') is False and accepted.get('restoreProject') == record['project'])
    hashes = {Path(item['path']).name: item['sha256'] for item in record['files']}
    config = parse(metadata(root / 'app.json', uid=1001).read_bytes())
    old_acceptance_hashes(accepted, hashes, sha(json.dumps(config, sort_keys=True, separators=(',', ':')).encode()), record['project'])
    timestamp(accepted['acceptedUtc'])
    ready = parse(metadata(root / 'recovery-ready.json').read_bytes())
    journal_value = parse(metadata(root / 'recovery-journal.json').read_bytes())
    for value in (ready, journal_value):
        if expected['phase'] == 'ready':
            if value is journal_value: c.match_mapping(value['release'], old)
            else: need(all(value.get(key) == old[key] for key in ('sourceCommit', 'testedPlatformConfig', 'runtimeImageId', 'engineProofSha256')))
        else: c.match_mapping(value, old)
        need(value['root'] == str(root) and value['project'] == record['project'] and value['workerStarted'] is False)
    need(journal_value['phase'] == expected['phase'] and journal_value['readyRecordSha256'] == hashes['recovery-ready.json'])
    need(media_snapshot(c, None, root / 'media') == record['mediaSnapshot'])
    selected = [item for item in items if item['Config']['Labels'].get('com.docker.compose.project') == record['project']]
    return validate_old_actual(record, selected, c.PG_IMAGE, accepted)


def old_pairs(c, value, fresh_project=None):
    inventories_shape(value)
    ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=morphiume.restore.scope=runtime', '--format', '{{.ID}}']).splitlines()
    items = parse(c.run(['docker', 'inspect', *ids])) if ids else []
    old_ids = {item['id'] for record in value['pairs'] for item in record['containers']}
    need(len(old_ids) == 6 and old_ids <= set(ids))
    need(len(ids) == (8 if fresh_project else 6))
    need(all(item['Config']['Labels'].get('com.docker.compose.project') == fresh_project for item in items if item['Id'] not in old_ids))
    return sorted([item for record in value['pairs'] for item in old_pair(c, record, items)], key=lambda x: x['id'])


def old_storage_policy():
    """Exact accepted legacy modes; never chmod preserved recovery data."""
    expected = {
        'morphiume-runtime-restore-20261012t212729z-d03c35': 0o750,
        'morphiume-runtime-restore-20261013t090118z-504a38': 0o700,
        'morphiume-runtime-restore-20261014t071244z-30668c': 0o700,
    }
    need(type(OLD_STORAGE_POLICY_VERSION) is int and OLD_STORAGE_POLICY_VERSION == 2)
    need(set(OLD_RELEASES) == set(expected))
    for project, mode in expected.items():
        need(type(OLD_RELEASES[project].get('mediaMode')) is int and OLD_RELEASES[project]['mediaMode'] == mode)
    return {'version': 2, 'mediaModes': {project: oct(mode) for project, mode in expected.items()}}


def old_media_mode(project):
    policy = old_storage_policy()
    need(isinstance(project, str) and project in policy['mediaModes'])
    return int(policy['mediaModes'][project], 8)


def capture_old_inventory(c):
    """Read-only capture for the exact three stopped pairs; includes no SQL."""
    ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=morphiume.restore.scope=runtime', '--format', '{{.ID}}']).splitlines()
    items = parse(c.run(['docker', 'inspect', *ids])) if ids else []
    need(len(ids) == 6 and not c.run(['ss', '-H', '-ltn', 'sport = :3002']))
    def view(path, uid, mode):
        info = metadata(path, uid, mode, directory=True).lstat()
        return {'path': str(path), 'uid': info.st_uid, 'gid': info.st_gid,
                'mode': oct(info.st_mode & 0o777), 'device': info.st_dev, 'inode': info.st_ino}
    pairs = []
    for project, previous in OLD_RELEASES.items():
        root = previous['root']; files = OLD_FILES | previous['extraFiles']
        need({p.name for p in root.iterdir() if p.is_file()} == set(files))
        entries = []
        for name, uid in files.items():
            file = metadata(root / name, uid); info = file.lstat()
            entries.append({'path': str(file), 'uid': info.st_uid, 'gid': info.st_gid,
                'mode': oct(info.st_mode & 0o777), 'device': info.st_dev, 'inode': info.st_ino,
                'bytes': info.st_size, 'sha256': sha(file.read_bytes())})
        pairs.append({'observedAt': utc(), 'mutation': False, 'sql': False,
            'project': project, 'root': str(root), 'rootMetadata': view(root, 0, 0o700),
            'storageMetadata': [view(root / 'postgres', 999, 0o700), view(root / 'media', 1001, old_media_mode(project))],
            'files': entries, 'containers': [container_view(t) for t in items
                if t['Config']['Labels'].get('com.docker.compose.project') == project],
            'tcp3002ListenerAbsent': True, 'mediaSnapshot': media_snapshot(c, None, root / 'media')})
    result = {'version': 1, 'pairs': pairs}
    old_pairs(c, result)  # Independently verify acceptance, proofs and all six IDs.
    return result


def exact_history(value):
    need(type(value) is dict and value.get('database') in ('morphiume_staging_runtime', 'morphiume_staging_restore'))
    rows = value.get('migrations')
    need(type(rows) is list and len(rows) == 13 and all(type(row) is dict and set(row) == {'name', 'checksum'} for row in rows))
    manifest = {row['name']: row['checksum'] for row in rows}
    need(len(manifest) == 13 and sha(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()) == MIGRATIONS_SHA256)


HISTORY_SQL = "BEGIN READ ONLY; SET LOCAL statement_timeout='3s'; SELECT jsonb_build_object('database',current_database(),'migrations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'checksum',checksum) ORDER BY name) FROM schema_migration),'[]'::jsonb)); COMMIT;"


def restored_history(c, command):
    shell = 'PGPASSWORD="$(cat /run/secrets/db_owner_password)"; export PGPASSWORD; exec psql -h 127.0.0.1 -U morphiume_restore_owner -d morphiume_staging_restore -X -qAt --set ON_ERROR_STOP=1 -c "' + HISTORY_SQL + '"'
    value = parse(c.run(command + ['exec', '-T', 'db', 'sh', '-c', shell]))
    exact_history(value); need(value['database'] == 'morphiume_staging_restore')
    return value


def media_snapshot(c, r, root):
    result = {}; total = 0
    c.exact_path(root)
    for path in root.rglob('*'):
        c.exact_path(path)
        if path.is_dir():
            continue
        stat = path.stat()
        need(path.is_file() and stat.st_nlink == 1 and 0 <= stat.st_size <= 64 * 1024**2 and len(result) < 65536)
        total += stat.st_size
        need(total <= 16 * 1024**3)
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        result[path.relative_to(root).as_posix()] = {'sha256': digest, 'bytes': stat.st_size}
    return result


def fixture_media(fixture, snapshot):
    media = fixture.get('media')
    need(type(media) is list and 1 <= len(media) <= 64)
    seen = set()
    for item in media:
        need(type(item) is dict and set(item) == {'url', 'sha256'})
        need(isinstance(item['url'], str) and re.fullmatch(r'/media/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp', item['url']))
        need(isinstance(item['sha256'], str) and HASH.fullmatch(item['sha256']))
        path = 'public/' + item['url'].removeprefix('/media/')
        need(path not in seen and path in snapshot and snapshot[path]['sha256'] == item['sha256'])
        seen.add(path)


def preflight(args, c, r, release, tool_parent):
    need(UUID.fullmatch(args.operation_id) and PROJECT.fullmatch(args.restore_project))
    need(args.restore_project[-6:] == args.operation_id[:6])
    root = ROOT / 'restore' / args.restore_project
    journal_root = ROOT / 'releases' / SOURCE / ('isolated-restore-' + args.operation_id)
    c.exact_path(root); c.exact_path(journal_root)
    metadata(ROOT / 'restore', mode=0o700, directory=True)
    need({p.name for p in (ROOT / 'restore').iterdir()} == {value['root'].name for value in OLD_RELEASES.values()})
    need(not root.exists() and not journal_root.exists())
    need(Path(args.old_inventory) == tool_parent / 'old-restore-inventory.json')
    old = private_json(args.old_inventory, args.old_inventory_sha256)
    inventories_shape(old); before_old = old_pairs(c, old)
    need(not c.run(['ss', '-H', '-ltn', 'sport = :3002']))
    need(not c.run(['docker', 'network', 'ls', '--filter', 'label=com.docker.compose.project=' + args.restore_project, '--format', '{{.ID}}']))
    units = ['morphiume-runtime-backup.timer', 'morphiume-runtime-health.timer', 'morphiume-runtime-backup.service', 'morphiume-runtime-health.service']
    need(c.run(['systemctl', 'show', '--property=ActiveState', '--value', *units]).split() == ['inactive'] * 4)
    profile = c.active_profile(required=True)
    need(c.canonical_hash(profile) == args.profile_sha256 and profile['profile'] == 'private-ip' and profile['origin'] == 'http://192.168.240.51')
    c.match_mapping(profile, release)
    deployed = parse(c.private_file(CONFIG / 'deployed-release.json').read_text())
    c.match_mapping(deployed, release)
    need(deployed.get('accessProfileSha256') == args.profile_sha256)
    configs = c.load_configs(); c.db_container()
    source_history = parse(c.psql(c.DATABASE, HISTORY_SQL)); exact_history(source_history)
    need(source_history['database'] == c.DATABASE)
    need(c.private_file(CONFIG / 'deploy.env').read_text() == c.compose_environment(c.runtime_image(release), c.OPS_ROOT, profile))
    for name in ('upgrading.json', 'upgrading.json.new', 'deployed-release.json.new', 'active-profile.json.new', 'preserved-upgrade.json.new', 'redesign-upgrade.json.new', 'deploy.candidate.env'):
        need(not (CONFIG / name).exists())
    if (CONFIG / 'redesign-upgrade.json').exists():
        cutover = parse(c.private_file(CONFIG / 'redesign-upgrade.json').read_bytes())
        need(cutover.get('phase') == 'committed' and cutover.get('candidate') == EXPECTED
             and cutover.get('accessProfileSha256') == args.profile_sha256)
    if (CONFIG / 'preserved-upgrade.json').exists():
        need(parse(c.private_file(CONFIG / 'preserved-upgrade.json').read_text()).get('phase') == 'committed')
    if (CONFIG / 'preview-transition.json').exists():
        need(parse(c.private_file(CONFIG / 'preview-transition.json').read_text()).get('phase') in ('accepted', 'rolled-back'))
    ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
    c.validate_app_containers(parse(c.run(['docker', 'inspect', *ids])) if ids else [], release, running=False)
    need(not c.run(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']))
    backup = r.validate_backup_path(Path(args.backup_directory)); metadata(backup, mode=0o700, directory=True)
    need({p.name for p in backup.iterdir()} == {'backup-manifest.json', 'database.dump.age', 'media.tar.gz.age'})
    manifest = private_json(backup / 'backup-manifest.json', args.backup_manifest_sha256)
    r.validate_backup_identity(manifest, release)
    need(manifest['backupOpsSha256'] == OPS and manifest['businessBaseline']['migrationCount'] == 13)
    need(timestamp(manifest['backupStartUtc']) <= timestamp(manifest['backupCompleteUtc']) <= datetime.datetime.now(datetime.timezone.utc))
    for name in ('database.dump.age', 'media.tar.gz.age'):
        with c.private_file(backup / name).open('rb') as stream:
            need(hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['ciphertextSha256'][name])
    need(Path(args.fixture) == CONFIG / ('retained-fixture-redesign-' + SOURCE + '.json'))
    fixture = private_json(args.fixture, args.fixture_sha256)
    need(Path(args.fixture_marker) == CONFIG / ('retained-t25-redesign-' + SOURCE + '.json'))
    marker = private_json(args.fixture_marker, args.fixture_marker_sha256)
    need(set(marker) == set(IDENTITY) | {'mode', 'fixtureSha256', 'fixtureCreatedUtc', 'acceptedUtc',
         'nativeT25Accepted', 'checks', 'engine', 'testCaseCount', 'unexpected', 'skipped', 'testRetries'})
    c.match_mapping(marker, release)
    need(marker['mode'] == 'retained-redesign-T25-accepted' and marker['nativeT25Accepted'] is True)
    need(type(marker['checks']) is dict and set(marker['checks']) == NATIVE_CHECKS and all(value is True for value in marker['checks'].values()))
    need(marker['engine'] == 'chromium' and type(marker['testCaseCount']) is int and marker['testCaseCount'] == 1)
    need(all(type(marker[key]) is int and marker[key] == 0 for key in ('unexpected', 'skipped', 'testRetries')))
    need(marker['accessProfileSha256'] == args.profile_sha256 and marker['fixtureSha256'] == args.fixture_sha256)
    need(timestamp(marker['fixtureCreatedUtc']) <= timestamp(marker['acceptedUtc']) <= timestamp(manifest['backupStartUtc']))
    identity = Path(args.identity)
    need(identity.name == 'identity' and identity.parent.parent == Path('/dev/shm') and re.fullmatch('morphiume-runtime-restore-[a-f0-9]{12}', identity.parent.name))
    metadata(identity.parent, mode=0o700, directory=True)
    need(sha(metadata(identity).read_bytes()) == args.identity_sha256)
    need(type(manifest['databaseBytesEstimate']) is int and manifest['databaseBytesEstimate'] > 0)
    need(type(manifest['mediaBytes']) is int and 0 <= manifest['mediaBytes'] <= r.MAX_MEDIA)
    free = os.statvfs(ROOT)
    need(free.f_bavail * free.f_frsize >= 3 * manifest['databaseBytesEstimate'] + 2 * manifest['mediaBytes'] + 1024**3)
    media = media_snapshot(c, r, ROOT / 'media')
    need(sum(x['bytes'] for x in media.values()) == manifest['mediaBytes'])
    fixture_media(fixture, media)
    return {'root': root, 'journalRoot': journal_root, 'old': old, 'oldBefore': before_old,
        'manifest': manifest, 'backup': backup, 'fixture': fixture, 'media': media, 'configs': configs,
        'runtimeProfile': profile, 'deployed': deployed, 'identity': identity, 'sourceHistory': source_history}


def journal(c, state, phase):
    state['phase'] = phase
    state['stages'].append({'phase': phase, 'utc': utc()})
    body = json.dumps(state, sort_keys=True) + '\n'
    c.write_private(Path(state['journalRoot']) / f"{len(state['stages']):02d}-{phase}.json", body)
    root = Path(state['root'])
    if not root.exists():
        return  # Namespace-started precedes even the fresh restore directory.
    if (root / 'recovery-journal.json').exists():
        need(not (root / 'recovery-journal.json.new').exists())
        c.write_private(root / 'recovery-journal.json.new', body)
        os.replace(root / 'recovery-journal.json.new', root / 'recovery-journal.json')
    else:
        c.write_private(root / 'recovery-journal.json', body)


def restored_media(c, r, context):
    process = subprocess.Popen(['age', '--decrypt', '--identity', str(context['identity']), str(context['backup'] / 'media.tar.gz.age')], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        result = r.extract_media(process.stdout, context['root'] / 'media')
        process.communicate(timeout=30)
        need(process.returncode == 0 and result['bytes'] == context['manifest']['mediaBytes'])
        need(media_snapshot(c, r, context['root'] / 'media') == context['media'])
        fixture_media(context['fixture'], context['media'])
        return result
    finally:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait()


def fresh_owned(c, r, items, release, project, root):
    need(len(items) <= 2)
    seen = set()
    for item in items:
        labels = item['Config']['Labels']; service = labels.get('com.docker.compose.service')
        need(service in ('app', 'db') and service not in seen and labels.get('com.docker.compose.project') == project and labels.get('morphiume.restore.scope') == 'runtime')
        seen.add(service)
        need(item['Config']['User'] == ('1001:1001' if service == 'app' else '999:999'))
        need(item['Image'] == c.runtime_image(release) if service == 'app' else item['Config']['Image'] == c.PG_IMAGE)
        host = item['HostConfig']
        need(host['ReadonlyRootfs'] is True and host['CapDrop'] == ['ALL'] and 'no-new-privileges:true' in host['SecurityOpt'])
        need(host['Memory'] == (1280 * 1024**2 if service == 'app' else 768 * 1024**2))
        need(host['NanoCpus'] == (1500000000 if service == 'app' else 1000000000) and host['PidsLimit'] == 128)
        need(host['PortBindings'] == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3002'}]} if service == 'app' else not host['PortBindings'])
        if service == 'app': need(labels.get('org.opencontainers.image.revision') == SOURCE)
        target = '/app/media' if service == 'app' else '/var/lib/postgresql'
        source = str(root / ('media' if service == 'app' else 'postgres'))
        need(any(m['Type'] == 'bind' and m['Source'] == source and m['Destination'] == target for m in item['Mounts']))


def execute(args, c, r, release, context):
    root = context['root']; start = utc()
    context['journalRoot'].mkdir(mode=0o700)
    state = {'version': 1, 'mode': 'fresh-redesign-isolated-restore', 'operationId': args.operation_id,
        'root': str(root), 'project': args.restore_project, 'journalRoot': str(context['journalRoot']),
        'release': {key: release[key] for key in IDENTITY if key != 'accessProfileSha256'},
        'accessProfileSha256': args.profile_sha256, 'toolSha256': args.tool_sha256,
        'toolSourceCommit': args.tool_source_commit, 'opsSourceCommit': args.ops_source_commit,
        'oldInventorySha256': args.old_inventory_sha256, 'oldPairBefore': context['oldBefore'],
        'fixtureSha256': args.fixture_sha256, 'fixtureMarkerSha256': args.fixture_marker_sha256,
        'backupDirectory': str(context['backup']), 'backupManifestSha256': args.backup_manifest_sha256,
        'ciphertextSha256': context['manifest']['ciphertextSha256'], 'identitySha256': args.identity_sha256,
        'recoveryStartUtc': start, 'sourceMediaSha256': context['media'],
        'workerStarted': False, 'automaticResume': False, 'businessAcceptance': 'pending', 'stages': []}
    command = ['docker', 'compose', '--project-name', args.restore_project, '--env-file', str(root / 'restore.env'), '-f', str(c.OPS_ROOT / 'runtime/compose.restore.yaml')]
    started = False
    try:
        journal(c, state, 'namespace-started')
        root.mkdir(mode=0o700)
        journal(c, state, 'prepared')
        journal(c, state, 'config-started')
        (root / 'postgres').mkdir(mode=0o700); os.chown(root / 'postgres', 999, 999)
        (root / 'media').mkdir(mode=0o750); os.chown(root / 'media', 1001, 1001)
        passwords = {name: secrets.token_hex(32) for name in ('db_bootstrap_password', 'db_owner_password', 'db_app_password')}
        for name, value in passwords.items(): c.write_private(root / name, value, uid=999, gid=999)
        app = r.restore_config(context['configs']['app.json'], passwords['db_app_password'], profile='private-ip')
        c.write_private(root / 'app.json', json.dumps(app) + '\n', uid=1001, gid=1001)
        c.write_private(root / 'restore.env', f'MORPHIUME_RESTORE_PROJECT={args.restore_project}\nMORPHIUME_RESTORE_ROOT={root}\nMORPHIUME_IMAGE={c.runtime_image(release)}\nMORPHIUME_OPS_ROOT={c.OPS_ROOT}\n')
        c.write_private(root / 'recovery-start.json', json.dumps({'recoveryStartUtc': start, 'backup': str(context['backup']), 'sourceCommit': SOURCE}) + '\n')
        state['configSha256'] = {name: sha((root / name).read_bytes()) for name in ('app.json', 'restore.env', 'db_bootstrap_password', 'db_owner_password', 'db_app_password', 'recovery-start.json')}
        c.run(command + ['config', '--quiet'])
        journal(c, state, 'config-completed')
        journal(c, state, 'dbinit-started'); started = True
        c.run(command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'db'], timeout=210)
        check = 'PGPASSWORD="$(cat /run/secrets/db_owner_password)"; export PGPASSWORD; exec psql -h 127.0.0.1 -U morphiume_restore_owner -d morphiume_staging_restore -X -qAt --set ON_ERROR_STOP=1 -c "SELECT current_database() || \'|\' || current_user"'
        need(c.run(command + ['exec', '-T', 'db', 'sh', '-c', check]) == r.RESTORE_DB + '|' + r.RESTORE_OWNER)
        journal(c, state, 'dbinit-completed')
        journal(c, state, 'dbrestore-started')
        r.decrypt_database(context['backup'] / 'database.dump.age', context['identity'], command)
        state['restoredHistory'] = restored_history(c, command)
        need(state['restoredHistory']['migrations'] == context['sourceHistory']['migrations'])
        journal(c, state, 'dbrestore-completed')
        journal(c, state, 'media-started')
        media = restored_media(c, r, context)
        journal(c, state, 'media-completed')
        journal(c, state, 'appstart-started')
        c.run(command + ['--profile', 'application', 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app'], timeout=210)
        with urllib.request.urlopen('http://127.0.0.1:3002/api/health/ready', timeout=10) as response: need(response.status == 200)
        ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + args.restore_project, '--format', '{{.ID}}']).splitlines()
        actual = parse(c.run(['docker', 'inspect', *ids])) if ids else []
        fresh_owned(c, r, actual, release, args.restore_project, root)
        r.validate_restored_containers(actual, release)
        # Preserve runtime profile/config/deployment and the exact old pair/files.
        need(c.active_profile(required=True) == context['runtimeProfile'] and c.load_configs() == context['configs'])
        need(parse(c.private_file(CONFIG / 'deployed-release.json').read_text()) == context['deployed'])
        need(c.private_file(CONFIG / 'deploy.env').read_text() == c.compose_environment(c.runtime_image(release), c.OPS_ROOT, context['runtimeProfile']))
        c.db_container()
        writer_ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
        c.validate_app_containers(parse(c.run(['docker', 'inspect', *writer_ids])) if writer_ids else [], release, running=False)
        need(sha(metadata(context['identity']).read_bytes()) == args.identity_sha256)
        need(old_pairs(c, context['old'], args.restore_project) == context['oldBefore'])
        report = {'mode': 'restored-ready-business-acceptance-pending', 'project': args.restore_project, 'root': str(root),
            'browserOrigin': 'http://localhost:3101', 'sourceCommit': SOURCE,
            'testedPlatformConfig': release['testedPlatformConfig'], 'runtimeImageId': c.runtime_image(release),
            'engineProofSha256': release['engineProofSha256'], 'accessProfileSha256': args.profile_sha256,
            'recoveryStartUtc': start, 'applicationReadyUtc': utc(), 'backupStartUtc': context['manifest']['backupStartUtc'],
            'backupCompleteUtc': context['manifest']['backupCompleteUtc'], 'mediaSummary': media,
            'workerStarted': False, 'oldPairsPreserved': True, 'operationId': args.operation_id,
            'toolSha256': args.tool_sha256, 'toolSourceCommit': args.tool_source_commit,
            'fixtureSha256': args.fixture_sha256, 'backupManifestSha256': args.backup_manifest_sha256}
        c.write_private(root / 'recovery-ready.json', json.dumps(report, sort_keys=True) + '\n')
        state['readyRecordSha256'] = sha((root / 'recovery-ready.json').read_bytes())
        journal(c, state, 'ready')
        return {'mode': report['mode'], 'project': args.restore_project, 'root': str(root), 'browserOrigin': report['browserOrigin'],
            'workerStarted': False, 'oldPairsPreserved': True, 'businessAcceptance': 'pending'}
    except (OSError, ValueError, KeyError, TypeError, EOFError, tarfile.TarError, subprocess.SubprocessError):
        state['failedAfterPhase'] = state.get('phase', 'unknown')
        state['freshStopAttempted'] = False
        if started:
            try:
                ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + args.restore_project, '--format', '{{.ID}}']).splitlines()
                actual = parse(c.run(['docker', 'inspect', *ids])) if ids else []
                fresh_owned(c, r, actual, release, args.restore_project, root)
                state['freshStopAttempted'] = True
                c.run(command + ['stop', '--timeout', '60', 'app', 'db'], timeout=100)
            except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
                state['freshStopResult'] = 'unproved'
        try: journal(c, state, 'failed-preserved')
        except (OSError, ValueError, KeyError, TypeError): pass
        raise ValueError('redesign restore failed; retain partial state, no replay or old consumer resume') from None


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'sourceCommit': SOURCE, 'opsSha256': OPS, 'browserOrigin': 'http://localhost:3101', 'workerStarted': False, 'serverMutation': False}
    bind_reviewed_plan(args)
    c, r, parent = import_ops(args)
    release = c.verify_release(args)
    need(release['runtimeImageId'] == args.runtime_image_id and release['engineProofSha256'] == args.engine_proof_sha256)
    if args.cleanup_identity:
        return cleanup_identity(args, c, release)
    with c.lock():
        context = preflight(args, c, r, release, parent)
        return execute(args, c, r, release, context)


def cleanup_identity(args, c, release):
    need(UUID.fullmatch(args.operation_id) and PROJECT.fullmatch(args.restore_project))
    root = c.exact_path(ROOT / 'restore' / args.restore_project)
    accepted = private_json(root / 'recovery-accepted.json', args.acceptance_sha256)
    c.match_mapping(accepted, release)
    need(accepted.get('mode') == 'native-business-restore-accepted' and accepted.get('workerStarted') is False)
    need(accepted.get('restoreProject') == args.restore_project and accepted.get('accessProfileSha256') == args.profile_sha256)
    need(accepted.get('origin') == 'http://localhost:3101' and accepted.get('fixtureManifestSha256') == args.fixture_sha256)
    need(set(accepted.get('checks', {})) == CHECKS and all(value is True for value in accepted['checks'].values()))
    timestamp(accepted.get('acceptedUtc'))
    identity = Path(args.identity)
    need(identity.name == 'identity' and identity.parent.parent == Path('/dev/shm') and
         re.fullmatch('morphiume-runtime-restore-[a-f0-9]{12}', identity.parent.name))
    metadata(identity.parent, mode=0o700, directory=True)
    need({path.name for path in identity.parent.iterdir()} == {'identity'})
    need(sha(metadata(identity).read_bytes()) == args.identity_sha256)
    identity.unlink(); identity.parent.rmdir()
    return {'mode': 'accepted-restore-temporary-identity-removed', 'identityRemoved': True,
            'persistentIdentityChanged': False, 'restoreDataRemoved': False}


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'config-id', 'manifest-digest', 'archive-sha256', 'ops-sha256', 'ops-root', 'ops-source-commit',
                 'runtime-image-id', 'engine-proof-sha256',
                 'tool-source-commit', 'tool-sha256', 'profile-sha256', 'operation-id', 'restore-project', 'old-inventory',
                 'old-inventory-sha256', 'backup-directory', 'backup-manifest-sha256', 'fixture', 'fixture-sha256',
                 'fixture-marker', 'fixture-marker-sha256', 'identity', 'identity-sha256'):
        p.add_argument('--' + name, required=True)
    for name in ('plan', 'plan-sha256', 'plan-companion-sha256'):
        p.add_argument('--' + name, required=True)
    p.add_argument('--quiescent-window-released', action='store_true')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--cleanup-identity', action='store_true')
    p.add_argument('--acceptance-sha256')
    return p


if __name__ == '__main__':
    try: print(json.dumps(main(parser().parse_args())))
    except (OSError, ValueError, KeyError, TypeError, EOFError, tarfile.TarError, subprocess.SubprocessError):
        print('redesign isolated restore stopped; preserve exact private state/key and existing restore, no retry or reset.')
        raise SystemExit(1) from None
