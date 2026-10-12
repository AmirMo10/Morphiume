"""Restore-only private companion. No worker, general DB target or DML SQL."""
import datetime
import hashlib
import importlib.util
import json
import os
import re
import stat
import sys
from pathlib import Path, PurePosixPath

SOURCE = '6130f4ed7ec090344a5a4a1937a65ef04572975b'
OPS = '591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db'
IDENTITY = {
    'sourceCommit': SOURCE,
    'testedPlatformConfig': 'sha256:8a5600eeaafa7de6293aadc2807843f13b269244bb583e4d04e90295adbc1968',
    'candidateManifestDigest': 'sha256:d5bb24a403247f4d42345bef6c9b7b9788a84962c6f44336167af832e3d5f9be',
    'archiveSha256': 'd6df8cd57720187fddbc47c279d9df306cc41620d304b270716a87ab196b6cb9',
    'opsSha256': OPS,
    'runtimeImageId': 'sha256:ad5c0e3d9537e3380051d32528d2f07b9b804b5c9b73f1df7c2a69cc733a24c0',
    'engineProofSha256': 'c6f83e325dcae50f2f84bfac08b874850946f454325ba729bcc38953060bdad7',
    'accessProfileSha256': '3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c',
}
ROOT = Path('/srv/morphiume/staging/runtime')
OPS_ROOT = ROOT / 'releases' / SOURCE / 'ops-bundles' / OPS / 'ops'
PROJECT = 'morphiume-runtime-restore-20261012t212729z-d03c35'
LEGACY_ROOT = ROOT / 'restore/morphiume-runtime-restore-20261012T212729Z-d03c35'
BACKUP = ROOT / 'backups/20261012T212644Z-fe6ca5ce'
TOOL_SHA = '9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d'
PREPARED = {'app.json': 1001, 'restore.env': 0, 'recovery-start.json': 0, 'db_bootstrap_password': 999, 'db_owner_password': 999, 'db_app_password': 999}
PHASES = ('compose-validation-started', 'db-initialization-started', 'db-identity-started', 'database-restore-started', 'media-restore-started', 'app-start-started', 'readiness-started', 'ready-record-started', 'ready-business-acceptance-pending')
DB, ROLE = 'morphiume_staging_restore', 'morphiume_restore_app'
UUID = r'[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'


def validate_request(value):
    if not isinstance(value, dict) or set(value) != {'action', 'target', 'fixture'} or value['action'] not in ('inspect', 'snapshot'):
        raise ValueError('Restore request shape')
    target = value['target']
    if not isinstance(target, dict) or set(target) != {'restoreProject', 'backupDirectory', 'baseURL', 'identity', 'restoreRoot', 'opsRoot', 'recovery'} or target['identity'] != IDENTITY or target['baseURL'] != 'http://localhost:3101':
        raise ValueError('Restore identity')
    if target['restoreProject'] != PROJECT:
        raise ValueError('Restore project')
    if target['restoreRoot'] != LEGACY_ROOT.as_posix() or target['opsRoot'] != OPS_ROOT.as_posix() or target['backupDirectory'] != BACKUP.as_posix():
        raise ValueError('Restore path')
    recovery = target['recovery']
    if not isinstance(recovery, dict) or set(recovery) != {'toolSourceCommit', 'toolSha256', 'fixtureSha256', 'backupManifestSha256'} or recovery.get('toolSha256') != TOOL_SHA or not re.fullmatch('[a-f0-9]{40}', str(recovery.get('toolSourceCommit', ''))) or any(not re.fullmatch('[a-f0-9]{64}', str(recovery.get(k, ''))) for k in ('fixtureSha256', 'backupManifestSha256')):
        raise ValueError('Explicit published tool/fixture/manifest binding')
    fixture = value['fixture']
    if not isinstance(fixture, dict) or set(fixture) != {'fixtureId', 'createdAt', 'baseURL', 'phone', 'orderId', 'productId', 'media', 'expected'} or any(not isinstance(fixture[k], str) or not re.fullmatch(UUID, fixture[k]) for k in ('fixtureId', 'orderId', 'productId')) or not isinstance(fixture['phone'], str) or not re.fullmatch(r'\+989[0-9]{9}', fixture['phone']) or fixture['baseURL'] != 'http://localhost:3100':
        raise ValueError('Fixture identity')
    if fixture['expected'] != {'paymentStatus': 'paid', 'stockOnHand': 2, 'stockReserved': 0, 'receipts': 1, 'shipments': 1, 'trackingCode': 'QA-TRACK-' + fixture['fixtureId'][:8], 'unitPriceIrr': '1234560'}:
        raise ValueError('Fixture expectation')
    if not isinstance(fixture['media'], list) or len(fixture['media']) != 1 or any(not isinstance(m, dict) or set(m) != {'url', 'sha256'} or not re.fullmatch('/media/' + UUID + r'\.webp', str(m['url'])) or not re.fullmatch('[a-f0-9]{64}', str(m['sha256'])) for m in fixture['media']):
        raise ValueError('Fixture media')
    return target, fixture


def bounded_json(c, path, uid=0, maximum=65536):
    path = c.private_file(path, uid=uid)
    if path.stat().st_size <= 0 or path.stat().st_size > maximum:
        raise ValueError('Private evidence bound')
    def unique(pairs):
        result = {}
        for key, item in pairs:
            if key in result: raise ValueError('Duplicate evidence key')
            result[key] = item
        return result
    return json.loads(path.read_text(), object_pairs_hook=unique)


def bootstrap_contract_path():
    """Verify the imported contract bytes before executing its top-level source."""
    path = OPS_ROOT / 'runtime/contract.py'
    for item in (path, *path.parents):
        if item.is_symlink() or item.resolve() != item:
            raise ValueError('Linked immutable contract path')
    metadata = path.stat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022 or not 0 < metadata.st_size <= 1024 ** 2:
        raise ValueError('Immutable contract ownership/bound')
    manifest_path = OPS_ROOT / 'ops-manifest.json'
    manifest_stat = manifest_path.lstat()
    if manifest_path.is_symlink() or not stat.S_ISREG(manifest_stat.st_mode) or manifest_stat.st_uid != 0 or manifest_stat.st_mode & 0o077 or not 0 < manifest_stat.st_size <= 65536:
        raise ValueError('Private immutable manifest')
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, dict) or hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest() != OPS or manifest.get('runtime/contract.py') != hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest():
        raise ValueError('Imported immutable contract bytes mismatch')
    return path


def validate_ready(ready, start, manifest, target, fixture):
    if not isinstance(ready, dict) or ready.get('mode') != 'restored-ready-business-acceptance-pending' or ready.get('project') != target['restoreProject'] or ready.get('root') != target['restoreRoot'] or ready.get('browserOrigin') != 'http://localhost:3101' or ready.get('workerStarted') is not False:
        raise ValueError('Restore is partial or has unreviewed writers')
    for key in ('sourceCommit', 'testedPlatformConfig', 'runtimeImageId', 'engineProofSha256'):
        if ready.get(key) != IDENTITY[key]: raise ValueError('Ready identity mismatch')
    if not isinstance(start, dict) or start.get('backup') != target['backupDirectory'] or start.get('sourceCommit') != SOURCE or start.get('recoveryStartUtc') != ready.get('recoveryStartUtc'):
        raise ValueError('Restore start/backup mismatch')
    if not isinstance(manifest, dict) or any(manifest.get(k) != v for k, v in IDENTITY.items() if k != 'accessProfileSha256') or manifest.get('database') != 'morphiume_staging_runtime' or manifest.get('backupOpsSha256') != OPS:
        raise ValueError('Backup identity mismatch')
    for key in ('backupStartUtc', 'backupCompleteUtc'):
        if ready.get(key) != manifest.get(key): raise ValueError('Backup readiness mismatch')
    times = [fixture['createdAt'], manifest['backupStartUtc'], manifest['backupCompleteUtc'], ready['recoveryStartUtc'], ready['applicationReadyUtc']]
    parsed = [datetime.datetime.fromisoformat(t.replace('Z', '+00:00')) for t in times]
    if any(t.tzinfo is None for t in parsed) or parsed != sorted(parsed):
        raise ValueError('Fixture/backup/restore time ordering')


def validate_recovery_records(journal, ready, target):
    base = (set(IDENTITY) - {'accessProfileSha256'}) | {'version', 'toolSha256', 'toolSourceCommit', 'profileSha256', 'fixtureSha256', 'backupManifestSha256', 'root', 'project', 'backup', 'originalRecoveryStartUtc', 'preparedFileSha256', 'ciphertextSha256', 'identitySha256', 'sourceMediaSha256', 'workerStarted', 'automaticResume', 'events', 'phase'}
    if not isinstance(journal, dict) or set(journal) != base | {'readyRecordSha256'} or not isinstance(ready, dict) or set(ready) != base | {'mode', 'browserOrigin', 'recoveryStartUtc', 'applicationReadyUtc', 'backupStartUtc', 'backupCompleteUtc', 'mediaSummary'}:
        raise ValueError('Exact completed forward-recovery shape')
    recovery = target['recovery']
    expected = {k: v for k, v in IDENTITY.items() if k != 'accessProfileSha256'} | {'version': 1, 'toolSha256': TOOL_SHA, 'toolSourceCommit': recovery['toolSourceCommit'], 'profileSha256': IDENTITY['accessProfileSha256'], 'fixtureSha256': recovery['fixtureSha256'], 'backupManifestSha256': recovery['backupManifestSha256'], 'root': target['restoreRoot'], 'project': PROJECT, 'backup': target['backupDirectory'], 'workerStarted': False, 'automaticResume': False}
    if type(journal['version']) is not int or type(ready['version']) is not int or any(x is not False for x in (journal['workerStarted'], journal['automaticResume'], ready['workerStarted'], ready['automaticResume'])) or any(journal.get(k) != v or ready.get(k) != v for k, v in expected.items()) or journal['phase'] != PHASES[-1] or ready['phase'] != PHASES[-2]:
        raise ValueError('Forward-recovery identity/phase changed')
    events = journal['events']
    if not isinstance(events, list) or len(events) != len(PHASES) or any(not isinstance(e, dict) or set(e) != {'phase', 'utc'} or e['phase'] != phase for e, phase in zip(events, PHASES)) or ready['events'] != events[:-1]:
        raise ValueError('Missing/reordered/failed recovery event')
    times = [datetime.datetime.fromisoformat(e['utc'].replace('Z', '+00:00')) for e in events]
    if any(t.tzinfo is None for t in times) or times != sorted(times): raise ValueError('Recovery event time ordering')
    for key in ('preparedFileSha256', 'ciphertextSha256', 'identitySha256', 'sourceMediaSha256', 'originalRecoveryStartUtc'):
        if ready[key] != journal[key]: raise ValueError('Ready/journal binding differs')
    if not isinstance(journal['preparedFileSha256'], dict) or set(journal['preparedFileSha256']) != set(PREPARED) or any(not re.fullmatch('[a-f0-9]{64}', str(v)) for v in journal['preparedFileSha256'].values()) or not isinstance(journal['ciphertextSha256'], dict) or set(journal['ciphertextSha256']) != {'database.dump.age', 'media.tar.gz.age'} or any(not re.fullmatch('[a-f0-9]{64}', str(v)) for v in journal['ciphertextSha256'].values()) or any(not re.fullmatch('[a-f0-9]{64}', str(journal[k])) for k in ('identitySha256', 'readyRecordSha256')):
        raise ValueError('Recovery protected-file hashes')
    media = journal['sourceMediaSha256']
    if not isinstance(media, dict) or not 1 <= len(media) <= 65536: raise ValueError('Captured full media map')
    total = 0
    for relative, item in media.items():
        if not isinstance(relative, str): raise ValueError('Captured full media member')
        path = PurePosixPath(relative)
        if path.is_absolute() or '..' in path.parts or '\\' in relative or '\0' in relative or str(path) != relative or len(relative) > 1024 or not isinstance(item, dict) or set(item) != {'sha256', 'bytes'} or not re.fullmatch('[a-f0-9]{64}', str(item['sha256'])) or type(item['bytes']) is not int or not 0 <= item['bytes'] <= 64 * 1024 ** 2:
            raise ValueError('Captured full media member')
        total += item['bytes']
    if total > 16 * 1024 ** 3 or ready['mediaSummary'] != {'files': len(media), 'bytes': total}:
        raise ValueError('Restored full media size/file evidence')


def validate_business_baseline(actual, manifest):
    """Old591 records a historical capture time alongside seven business counts."""
    counters = {'migrationCount', 'customers', 'orders', 'receipts', 'shipments', 'reserved', 'onHand'}
    expected = manifest.get('businessBaseline') if isinstance(manifest, dict) else None
    if not isinstance(actual, dict) or set(actual) != counters or not isinstance(expected, dict) or set(expected) != counters | {'capturedUtc'}:
        raise ValueError('Exact backup/restore business baseline shape')
    for key in counters:
        if type(actual[key]) is not int or type(expected[key]) is not int or actual[key] < 0 or expected[key] < 0 or actual[key] != expected[key]:
            raise ValueError('Restored business counter differs')
    try:
        times = [datetime.datetime.fromisoformat(manifest[k].replace('Z', '+00:00')) for k in ('backupStartUtc', 'backupCompleteUtc')]
        captured = datetime.datetime.fromisoformat(expected['capturedUtc'].replace('Z', '+00:00'))
    except (AttributeError, TypeError, KeyError, ValueError):
        raise ValueError('Historical backup capture timestamp shape') from None
    if any(t.tzinfo is None or t.utcoffset() != datetime.timedelta(0) for t in (*times, captured)) or not times[0] <= captured <= times[1]:
        raise ValueError('Historical backup capture timestamp bound')


def validate_containers(actual, target, c, release):
    if not isinstance(actual, list) or len(actual) != 2:
        raise ValueError('Expected only restore app and db; never a worker')
    services = {x['Config']['Labels'].get('com.docker.compose.service'): x for x in actual}
    if set(services) != {'app', 'db'}:
        raise ValueError('Unexpected restore services')
    for service, item in services.items():
        labels = item['Config']['Labels']
        if labels.get('com.docker.compose.project') != target['restoreProject'] or labels.get('morphiume.restore.scope') != 'runtime' or item['State']['Running'] is not True or item['State'].get('Health', {}).get('Status') != 'healthy':
            raise ValueError('Restore project/scope/health')
        mounts = {m['Destination']: m for m in item['Mounts']}
        required = {'/run/secrets/runtime_config': ('app.json', False), '/app/media': ('media', True)} if service == 'app' else {'/var/lib/postgresql': ('postgres', True), '/run/secrets/db_app_password': ('db_app_password', False)}
        for dest, (name, writable) in required.items():
            mount = mounts.get(dest)
            if not mount or mount.get('Type') != 'bind' or mount.get('Source') != target['restoreRoot'] + '/' + name or mount.get('RW') is not writable:
                raise ValueError('Restore mount identity')
    db, app = services['db'], services['app']
    if db['Config']['Image'] != c.PG_IMAGE or db['Config']['User'] != '999:999' or db['HostConfig'].get('PortBindings') not in (None, {}):
        raise ValueError('Restore DB image/user or exposed DB port')
    if app['HostConfig'].get('PortBindings') != {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3002'}]}:
        raise ValueError('Restore app must use only the approved SSH target port')
    env = dict(x.split('=', 1) for x in app['Config']['Env'] if '=' in x)
    if any(env.get(k) != v for k, v in {'NODE_ENV': 'production', 'DEPLOYMENT_ENV': 'staging', 'PAYMENT_PROVIDER': 'mock', 'SMS_PROVIDER': 'mock', 'MORPHIUME_RUNTIME_CONFIG': '/run/secrets/runtime_config'}.items()):
        raise ValueError('Restore process environment')
    c.validate_app_containers([app], release, services=('app',))


def sql_snapshot(fixture):
    # Every interpolated value was strict UUID/phone validated. No arbitrary SQL,
    # connection credentials, table name or identifier is accepted from input.
    order, product, phone = fixture['orderId'], fixture['productId'], fixture['phone']
    return f"""BEGIN READ ONLY;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SELECT jsonb_build_object(
 'database',current_database(),'role',current_user,
 'roleSafe',(SELECT NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) FROM pg_roles WHERE rolname=current_user),
 'ddlDenied',NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT pg_has_role(current_user,'morphiume_restore_owner','MEMBER'),
 'baseline',jsonb_build_object('migrationCount',(SELECT count(*) FROM schema_migration),'customers',(SELECT count(*) FROM "user"),'orders',(SELECT count(*) FROM orders),'receipts',(SELECT count(*) FROM payment_receipt),'shipments',(SELECT count(*) FROM shipment),'reserved',(SELECT coalesce(sum(reserved),0) FROM inventory_balance),'onHand',(SELECT coalesce(sum(on_hand),0) FROM inventory_balance)),
 'customerId',(SELECT o.user_id FROM orders o JOIN "user" u ON u.id=o.user_id WHERE o.id='{order}'::uuid AND u.phone_number='{phone}' AND NOT u.disabled),
 'order',(SELECT jsonb_build_object('paymentStatus',payment_status,'status',status,'subtotal',subtotal_irr::text,'discount',discount_irr::text,'shipping',shipping_irr::text,'tax',tax_irr::text,'total',total_irr::text,'committed',committed_at IS NOT NULL) FROM orders WHERE id='{order}'::uuid),
 'items',(SELECT jsonb_agg(jsonb_build_object('quantity',i.quantity,'price',i.unit_price_irr::text,'lineTotal',i.line_total_irr::text,'productMatches',v.product_id='{product}'::uuid) ORDER BY i.id) FROM order_item i JOIN variant v ON v.id=i.variant_id WHERE i.order_id='{order}'::uuid),
 'attempts',(SELECT jsonb_agg(jsonb_build_object('authority',authority,'status',status,'provider',provider) ORDER BY id) FROM payment_attempt WHERE order_id='{order}'::uuid),
 'receipts',(SELECT count(*) FROM payment_receipt WHERE order_id='{order}'::uuid),'primaryReceipts',(SELECT count(*) FROM payment_receipt WHERE order_id='{order}'::uuid AND disposition='primary'),
 'receiptAmount',(SELECT coalesce(sum(amount_irr),0)::text FROM payment_receipt WHERE order_id='{order}'::uuid),
 'commitments',(SELECT count(*) FROM inventory_ledger WHERE order_id='{order}'::uuid AND reason='payment_commit'),
 'commitDelta',(SELECT coalesce(sum(on_hand_delta),0) FROM inventory_ledger WHERE order_id='{order}'::uuid AND reason='payment_commit'),
 'activeReservations',(SELECT count(*) FROM inventory_reservation WHERE order_id='{order}'::uuid AND status='active'),
 'consumedReservations',(SELECT count(*) FROM inventory_reservation WHERE order_id='{order}'::uuid AND status='consumed'),
 'balances',(SELECT jsonb_agg(jsonb_build_object('onHand',b.on_hand,'reserved',b.reserved) ORDER BY b.variant_id) FROM inventory_balance b JOIN variant v ON v.id=b.variant_id WHERE v.product_id='{product}'::uuid),
 'shipments',(SELECT count(*) FROM shipment WHERE order_id='{order}'::uuid),
 'shipment',(SELECT jsonb_build_object('status',status,'trackingMatches',tracking_code='QA-TRACK-{fixture['fixtureId'][:8]}','carrierPresent',carrier IS NOT NULL AND length(carrier)>0) FROM shipment WHERE order_id='{order}'::uuid));
COMMIT;
"""


def run(request):
    target, fixture = validate_request(request)
    tool_root = ROOT / 'releases' / SOURCE / 'tools' / TOOL_SHA
    # Reading stale .pyc is unsafe even when .py bytes were verified. Redirect
    # all source loaders to an exact nonexistent protected prefix; never write it.
    prefix = tool_root / 'unused-bytecode-cache'
    if prefix.exists() or prefix.is_symlink() or prefix.resolve() != prefix or any(p.is_symlink() for p in prefix.parents):
        raise ValueError('Unverified bytecode cache path')
    sys.pycache_prefix = str(prefix); sys.dont_write_bytecode = True
    specification = importlib.util.spec_from_file_location('restore_acceptance_contract', bootstrap_contract_path())
    c = importlib.util.module_from_spec(specification); specification.loader.exec_module(c)
    c.assert_boundaries(); c.verify_ops_bundle(OPS_ROOT, OPS)
    c.private_directory(tool_root)
    tool_file = c.exact_path(tool_root / 'recover-pre-service-restore.py')
    tool_stat = tool_file.stat()
    if not tool_file.is_file() or tool_stat.st_uid != 0 or tool_stat.st_gid != 0 or tool_stat.st_mode & 0o777 != 0o644 or not 0 < tool_stat.st_size <= 1024 ** 2 or hashlib.sha256(tool_file.read_bytes().replace(b'\r\n', b'\n')).hexdigest() != TOOL_SHA:
        raise ValueError('Published recovery tool byte identity')
    binding = bounded_json(c, tool_root / 'tool-identity.json')
    if binding != {'sourceCommit': target['recovery']['toolSourceCommit'], 'toolSha256': TOOL_SHA, 'applicationSourceCommit': SOURCE, 'opsSha256': OPS}:
        raise ValueError('Published recovery source binding')
    release = c.archived_image(IDENTITY)
    if any(release.get(k) != v for k, v in IDENTITY.items() if k != 'accessProfileSha256'):
        raise ValueError('Live accepted archive/engine identity changed')
    profile_path = ROOT / 'releases' / SOURCE / 'profiles/ssh-localhost' / IDENTITY['accessProfileSha256'] / 'profile.json'
    profile = c.read_profile(profile_path, IDENTITY['accessProfileSha256'])
    c.match_mapping(profile, release)
    root = c.exact_path(Path(target['restoreRoot'])); c.private_directory(root)
    backup = c.exact_path(Path(target['backupDirectory'])); c.private_directory(backup)
    manifest = bounded_json(c, backup / 'backup-manifest.json')
    if hashlib.sha256(c.private_file(backup / 'backup-manifest.json').read_bytes()).hexdigest() != target['recovery']['backupManifestSha256'] or hashlib.sha256(c.private_file(c.CONFIG / 'retained-fixture.json').read_bytes()).hexdigest() != target['recovery']['fixtureSha256']:
        raise ValueError('Captured backup/retained-fixture hash changed')
    start = bounded_json(c, root / 'recovery-start.json')
    journal = bounded_json(c, root / 'recovery-journal.json', maximum=8 * 1024 ** 2)
    ready = bounded_json(c, root / 'recovery-ready.json', maximum=8 * 1024 ** 2)
    for name in ('recovery-journal.json.new', 'recovery-ready.json.new', 'restore.recovery.env.new'):
        if (root / name).exists() or (root / name).is_symlink(): raise ValueError('Partial recovery write retained')
    validate_recovery_records(journal, ready, target)
    if hashlib.sha256(c.private_file(root / 'recovery-ready.json').read_bytes()).hexdigest() != journal['readyRecordSha256']:
        raise ValueError('Completed journal ready-byte binding')
    for name, uid in PREPARED.items():
        file = c.private_file(root / name, uid=uid)
        if file.stat().st_gid != uid or file.stat().st_nlink != 1 or hashlib.sha256(file.read_bytes()).hexdigest() != journal['preparedFileSha256'][name]:
            raise ValueError('Preserved prepared config/env/credential changed')
    actual_media = {}
    for file in (root / 'media').rglob('*'):
        c.exact_path(file)
        if file.is_file():
            info = file.stat()
            if info.st_uid != 1001 or info.st_gid != 1001 or info.st_nlink != 1 or info.st_mode & 0o027 or info.st_size > 64 * 1024 ** 2 or len(actual_media) >= 65536:
                raise ValueError('Restored media ownership/bounds')
            with file.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            actual_media[file.relative_to(root / 'media').as_posix()] = {'sha256': digest, 'bytes': info.st_size}
    if actual_media != journal['sourceMediaSha256']: raise ValueError('Restored full media differs from paused source')
    validate_ready(ready, start, manifest, target, fixture)
    if not isinstance(manifest.get('ciphertextSha256'), dict) or set(manifest['ciphertextSha256']) != {'database.dump.age', 'media.tar.gz.age'}:
        raise ValueError('Backup ciphertext manifest')
    for name, expected in manifest['ciphertextSha256'].items():
        if not re.fullmatch('[a-f0-9]{64}', str(expected)): raise ValueError('Backup checksum shape')
        with c.private_file(backup / name).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected: raise ValueError('Backup ciphertext mismatch')
    app = bounded_json(c, root / 'app.json', uid=1001)
    original = bounded_json(c, c.CONFIG / 'app.json', uid=1001)
    c.validate_config(original, c.APP, profile='ssh-localhost')
    if c.canonical_hash(original) != profile['configSha256']['app.json'] or set(app) != set(original) or any(app[k] != v for k, v in original.items() if k not in ('DATABASE_URL', 'APP_BASE_URL')) or app.get('APP_BASE_URL') != 'http://localhost:3101' or not re.fullmatch(r'postgresql://morphiume_restore_app:[a-f0-9]{64}@db:5432/morphiume_staging_restore', str(app.get('DATABASE_URL', ''))):
        raise ValueError('Restored origin/role/auth/config clone differs')
    expected_env = f"MORPHIUME_RESTORE_PROJECT={target['restoreProject']}\nMORPHIUME_RESTORE_ROOT={root}\nMORPHIUME_IMAGE={IDENTITY['runtimeImageId']}\nMORPHIUME_OPS_ROOT={OPS_ROOT}\n"
    original_env = expected_env.replace('MORPHIUME_RESTORE_PROJECT=' + PROJECT, 'MORPHIUME_RESTORE_PROJECT=' + LEGACY_ROOT.name)
    if c.private_file(root / 'restore.env').read_text() != original_env or c.private_file(root / 'restore.recovery.env').read_text() != expected_env:
        raise ValueError('Preserved/new recovery Compose environment differs')
    ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + target['restoreProject'], '--format', '{{.ID}}']).splitlines()
    actual = json.loads(c.run(['docker', 'inspect', *ids])) if ids else []
    validate_containers(actual, target, c, release)
    compose = ['docker', 'compose', '--project-name', target['restoreProject'], '--env-file', str(root / 'restore.recovery.env'), '-f', str(OPS_ROOT / 'runtime/compose.restore.yaml')]
    command = compose + ['exec', '-T', 'db', 'sh', '-c', 'PGPASSWORD="$(cat /run/secrets/db_app_password)"; export PGPASSWORD; exec psql -h 127.0.0.1 -U morphiume_restore_app -d morphiume_staging_restore -X -qAt --set ON_ERROR_STOP=1']
    raw = c.run(command, input_text=sql_snapshot(fixture), timeout=15)
    if len(raw) > 16384: raise ValueError('SQL snapshot bound')
    snapshot = json.loads(raw)
    if snapshot.get('database') != DB or snapshot.get('role') != ROLE or snapshot.get('roleSafe') is not True or snapshot.get('ddlDenied') is not True or not snapshot.get('customerId'):
        raise ValueError('Restore DB role/customer identity mismatch')
    validate_business_baseline(snapshot.get('baseline'), manifest)
    result = {'mode': 'restore-identity-and-readonly-snapshot', 'restoreConfigSha256': c.canonical_hash(app), 'readyRecordSha256': journal['readyRecordSha256'], 'journalSha256': hashlib.sha256(c.private_file(root / 'recovery-journal.json').read_bytes()).hexdigest(), 'snapshot': snapshot}
    if request['action'] == 'inspect': result['mockControlSecret'] = app['MOCK_CONTROL_SECRET']
    return result


if __name__ == '__main__':
    try:
        # REQUEST is supplied over private SSH stdin, never shell arguments.
        print(json.dumps(run(REQUEST), separators=(',', ':')))
    except Exception:
        print('{"mode":"restore-acceptance-stopped"}')
        raise SystemExit(1) from None
