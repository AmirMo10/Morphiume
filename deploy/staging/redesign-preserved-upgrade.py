#!/usr/bin/env python3
"""Image-only ACF8 cutover with encrypted backup and quiescent 53-table proof.

Default prints an unexecuted plan. No migration, seed, Git change, image pull,
credential replacement, original-database write or automatic rollback occurs.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import types
import urllib.request

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
TOOL_NAME = 'redesign-preserved-upgrade.py'
HASH = re.compile('[a-f0-9]{64}')
COMMIT = re.compile('[a-f0-9]{40}')
UUID = re.compile('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
TABLES = sorted(('account,address,admin_grant,audit_event,auth_rate_limit,bulk_operation,cart,cart_item,checkout_idempotency,collection,collection_product,collection_slug_claim,content_page,coupon,coupon_redemption,inventory_balance,inventory_ledger,inventory_reservation,media,mock_provider_transaction,mock_sms_delivery,notification_message,order_event,order_item,orders,otp_challenge,outbox_job,payment_attempt,payment_event,payment_receipt,product,product_image,product_slug_claim,refund,refund_failure_decision,return_decision,return_request,role_membership,schema_migration,schema_migration_checksum_audit,session,shipment,store_setting,two_factor,user,variant,verification,verification_challenge,wishlist_item,analytics_coverage,analytics_daily,analytics_quota,analytics_seen').split(','))


def need(value):
    if not value:
        raise ValueError('Preserved redesign upgrade guard failed')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def parse(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            need(key not in result); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False))


def cache_guard(parent):
    prefix = parent / 'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink())
    sys.dont_write_bytecode = True; sys.pycache_prefix = str(prefix)


def metadata(path, directory=False):
    path = Path(path); need(path.is_absolute() and path.resolve() == path)
    for parent in path.parents:
        info = parent.lstat()
        need(parent.is_dir() and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o777 == (0o700 if directory else 0o644))
    need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and info.st_size <= 1024**2)
    return path


def bind_reviewed_plan(args):
    for value in (args.tool_sha256, args.plan_sha256, args.plan_companion_sha256, args.restore_guard_sha256):
        need(isinstance(value, str) and HASH.fullmatch(value))
    for value in (args.source, args.tool_source_commit, args.ops_source_commit):
        need(isinstance(value, str) and COMMIT.fullmatch(value))
    parent = ROOT / 'releases' / args.source / 'tools' / args.tool_sha256
    metadata(parent, True)
    tool = metadata(Path(__file__))
    need(tool == parent / TOOL_NAME and sha(tool.read_bytes()) == args.tool_sha256)
    companion = metadata(parent / 'redesign-plan.py'); raw = companion.read_bytes()
    need(sha(raw) == args.plan_companion_sha256)
    cache_guard(parent)
    plan_module = {'__name__': 'redesign_plan', '__file__': str(companion)}
    exec(compile(raw, str(companion), 'exec'), plan_module)
    plan = plan_module['read'](args)
    restore_path = metadata(parent / 'redesign-isolated-restore.py'); raw = restore_path.read_bytes()
    need(sha(raw) == args.restore_guard_sha256)
    restore_module = {'__name__': 'redesign_preservation', '__file__': str(restore_path)}
    exec(compile(raw, str(restore_path), 'exec'), restore_module)
    restore_guard = types.SimpleNamespace(**restore_module)
    validate_restore_storage_policy(restore_guard)
    validate_restore_acceptance_policy(restore_guard)
    bundle = ROOT / 'releases' / args.source / 'ops-bundles' / OPS / 'ops'
    need(Path(args.ops_root) == bundle)
    restore_guard.verify_ops(bundle)
    need(not any(name in sys.modules for name in ('contract', 'backup')))
    result = {}
    for name in ('contract', 'backup'):
        path = bundle / 'runtime' / (name + '.py')
        module = types.ModuleType(name); module.__file__ = str(path); sys.modules[name] = module
        exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
        result[name] = module
    need(result['contract'].ops_digest() == OPS)
    return plan, restore_guard, result['contract'], result['backup']


def validate_restore_storage_policy(guard):
    """Require the revised exact per-release policy before importing Ops."""
    validator = getattr(guard, 'old_storage_policy', None)
    need(callable(validator))
    need(validator() == {'version': 2, 'mediaModes': {
        'morphiume-runtime-restore-20261012t212729z-d03c35': '0o750',
        'morphiume-runtime-restore-20261013t090118z-504a38': '0o700',
        'morphiume-runtime-restore-20261014t071244z-30668c': '0o700',
    }})


def validate_restore_acceptance_policy(guard):
    validator = getattr(guard, 'old_acceptance_policy', None)
    need(callable(validator))
    need(validator() == {'version': 1, 'schemas': {
        'morphiume-runtime-restore-20261012t212729z-d03c35': '613-legacy',
        'morphiume-runtime-restore-20261013t090118z-504a38': 'e4-legacy',
        'morphiume-runtime-restore-20261014t071244z-30668c': 'acf8-expanded',
    }})


def sql(c, expression):
    # Only the runtime DML role observes data, inside an explicit read-only tx.
    prefix = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL ROLE morphiume_runtime_app; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='1s'; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO, YMD'; SET LOCAL extra_float_digits=3; "
    return parse(c.psql(c.DATABASE, prefix + expression + '; COMMIT;'))


def validate_rows(rows):
    need(type(rows) is dict and set(rows) == {'count', 'bytes', 'maxRowBytes', 'sha256'})
    need(type(rows['count']) is int and 0 <= rows['count'] <= 100000)
    need(type(rows['bytes']) is int and 0 <= rows['bytes'] <= 256 * 1024**2)
    need(type(rows['maxRowBytes']) is int and 0 <= rows['maxRowBytes'] <= 2 * 1024**2)
    need(isinstance(rows['sha256'], str) and HASH.fullmatch(rows['sha256']))
    return rows


CATALOG_SQL = """SELECT jsonb_build_object(
 'schema',(SELECT jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) FROM pg_namespace n WHERE n.nspname='public'),
 'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'),
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind::text,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'select',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'SELECT') ELSE NULL END,'insert',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'INSERT') ELSE NULL END,'update',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'UPDATE') ELSE NULL END,'delete',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'DELETE') ELSE NULL END,'truncate',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'TRUNCATE') ELSE NULL END,'references',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'REFERENCES') ELSE NULL END,'trigger',CASE WHEN c.relkind='r' THEN has_table_privilege(current_user,c.oid,'TRIGGER') ELSE NULL END,'publicGrant',CASE WHEN c.relkind='r' THEN EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) ELSE NULL END) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('table',t.relname,'name',i.relname,'valid',x.indisvalid,'ready',x.indisready,'definition',pg_get_indexdef(i.oid)) ORDER BY t.relname,i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',t.relname,'name',c.conname,'validated',c.convalidated,'deferred',c.condeferred,'deferrable',c.condeferrable,'definition',pg_get_constraintdef(c.oid)) ORDER BY t.relname,c.conname) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'createDb',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication,'bypassRls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('morphiume_runtime_app','morphiume_runtime_owner')),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m WHERE m.member IN (SELECT oid FROM pg_roles WHERE rolname IN ('morphiume_runtime_app','morphiume_runtime_owner'))))"""


def validate_catalog(value):
    need(type(value) is dict and value.get('schema', {}).get('owner') == 'morphiume_runtime_owner')
    roles = value.get('roles'); need(type(roles) is list and len(roles) == 2)
    need({role.get('name') for role in roles} == {'morphiume_runtime_app', 'morphiume_runtime_owner'})
    for role in roles:
        for key in ('superuser', 'createDb', 'createRole', 'replication', 'bypassRls'): need(role.get(key) is False)
    need(value.get('memberships') == [])
    relations = value.get('relations'); need(type(relations) is list)
    tables = [relation for relation in relations if relation.get('kind') == 'r']
    need(sorted(t['name'] for t in tables) == TABLES)
    for table in tables:
        need(table.get('owner') == 'morphiume_runtime_owner' and table.get('rls') is False and table.get('forceRls') is False)
        for key in ('select', 'insert', 'update', 'delete'): need(table.get(key) is True)
        for key in ('truncate', 'references', 'trigger', 'publicGrant'): need(table.get(key) is False)
    return value


def capture_database(c, restore_guard):
    identity = sql(c, "SELECT jsonb_build_object('database',current_database(),'role',current_user,'readOnly',current_setting('transaction_read_only'))")
    need(identity == {'database': 'morphiume_staging_runtime', 'role': 'morphiume_runtime_app', 'readOnly': 'on'})
    names = sql(c, "SELECT jsonb_agg(table_name ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
    need(names == TABLES and len(names) == 53)
    history = sql(c, "SELECT jsonb_build_object('database',current_database(),'migrations',(SELECT jsonb_agg(jsonb_build_object('name',name,'checksum',checksum) ORDER BY name) FROM schema_migration))")
    restore_guard.exact_history(history)
    rows = {}
    for table in TABLES:
        need(re.fullmatch('[a-z][a-z0-9_]*', table))
        query = 'SELECT jsonb_build_object(\'count\',count(*),\'bytes\',coalesce(sum(octet_length(v)),0),\'maxRowBytes\',coalesce(max(octet_length(v)),0),\'sha256\',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(v,\'UTF8\')),\'hex\'),\'\' ORDER BY encode(sha256(convert_to(v,\'UTF8\')),\'hex\')),\'\'),\'UTF8\')),\'hex\')) FROM (SELECT to_jsonb(t)::text AS v FROM public."' + table + '" t LIMIT 100001) bounded'
        rows[table] = validate_rows(sql(c, query))
    catalog = validate_catalog(sql(c, CATALOG_SQL))
    sequences = sql(c, "SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'definition',to_jsonb(s)) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname='public'")
    for item in sequences:
        name = item['name']; need(re.fullmatch('[a-z][a-z0-9_]*', name))
        item['state'] = sql(c, 'SELECT jsonb_build_object(\'lastValue\',last_value,\'isCalled\',is_called) FROM public."' + name + '"')
    return {'identity': identity, 'history': history, 'rows': rows, 'catalog': catalog, 'sequences': sequences}


def compare_database(before, after):
    keys = {'identity', 'history', 'rows', 'catalog', 'sequences'}
    need(type(before) is dict and type(after) is dict and set(before) == keys and set(after) == keys)
    need(before == after and set(before['rows']) == set(TABLES) and len(TABLES) == 53)
    need(before['identity'] == {'database': 'morphiume_staging_runtime', 'role': 'morphiume_runtime_app', 'readOnly': 'on'})
    history = before['history']; need(type(history) is dict and history.get('database') == 'morphiume_staging_runtime')
    migrations = history.get('migrations')
    need(type(migrations) is list and len(migrations) == 13)
    need(all(type(row) is dict and set(row) == {'name', 'checksum'} for row in migrations))
    manifest = {row['name']: row['checksum'] for row in migrations}
    need(len(manifest) == 13 and sha(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()) == '4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119')
    validate_catalog(before['catalog']); need(type(before['sequences']) is list)
    for row in before['rows'].values(): validate_rows(row)
    return {'accepted': True, 'tableCount': 53, 'migrationCount': 13,
            'rowEvidenceSha256': sha(json.dumps(before['rows'], sort_keys=True, separators=(',', ':')).encode())}


MIGRATION_PROBE_JS = """const fs=require('node:fs'),crypto=require('node:crypto');const dir='/app/db/migrations';const names=fs.readdirSync(dir).sort();if(names.length!==13||names.some(n=>!/^\\d{4}_[a-z_]+\\.sql$/.test(n)))throw Error('Migration set rejected');const m={};for(const n of names)m[n]=crypto.createHash('sha256').update(fs.readFileSync(dir+'/'+n)).digest('hex');console.log(JSON.stringify({count:names.length,sha256:crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex')}));"""


def candidate_migrations(c, plan):
    image = plan['candidate']['runtimeImageId']
    command = ['docker', 'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only',
        '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
        '--memory', '128m', '--cpus', '0.5', '--pids-limit', '32', '--entrypoint', 'node', image, '-e', MIGRATION_PROBE_JS]
    value = parse(c.run(command, timeout=30))
    need(value == {'count': 13, 'sha256': plan['migrationManifestSha256']})


def footprints(c):
    names = ('app.json', 'worker.json', 'migration.json', 'db_owner_password', 'db_app_password', 'backup-recipients.txt')
    return {name: sha(c.private_file(CONFIG / name, uid=1001 if name.endswith('.json') else 0).read_bytes()) for name in names}


def containers(c):
    ids = c.run(['docker', 'ps', '--all', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
    return parse(c.run(['docker', 'inspect', *ids])) if ids else []


def journal(c, state, phase):
    state['phase'] = phase; state['stages'].append({'phase': phase, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    directory = Path(state['evidenceRoot'])
    c.write_private(directory / ('%02d-' % len(state['stages']) + phase + '.json'), json.dumps(state, sort_keys=True) + '\n')
    file = CONFIG / 'redesign-upgrade.json'; pending = file.with_name(file.name + '.new')
    need(not pending.exists())
    c.write_private(pending, json.dumps(state, sort_keys=True) + '\n')
    if file.exists(): c.private_file(file)
    os.replace(pending, file)


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-redesign-image-only-plan', 'serverMutation': False,
                'seedInvoked': False, 'migrationInvoked': False, 'automaticRollback': False}
    need(os.name == 'posix' and os.getuid() == 0 and args.quiescent_window_released)
    need(UUID.fullmatch(args.operation_id))
    plan, guard, c, backup = bind_reviewed_plan(args)
    previous = plan['previous']; candidate = plan['candidate']
    need(args.ops_sha256 == OPS)
    for name, key in (('config_id', 'testedPlatformConfig'), ('manifest_digest', 'candidateManifestDigest'), ('archive_sha256', 'archiveSha256')):
        need(getattr(args, name) == candidate[key])
    report = c.verify_release(args); need(all(report[key] == candidate[key] for key in candidate))
    evidence = ROOT / 'preservation' / args.operation_id
    need(not evidence.exists())
    with c.lock():
        for name in ('upgrading.json', 'upgrading.json.new', 'deployed-release.json.new', 'active-profile.json.new', 'deploy.candidate.env', 'preserved-upgrade.json.new', 'redesign-upgrade.json', 'redesign-upgrade.json.new'):
            need(not (CONFIG / name).exists())
        if (CONFIG / 'preserved-upgrade.json').exists():
            need(parse(c.private_file(CONFIG / 'preserved-upgrade.json').read_bytes()).get('phase') == 'committed')
        if (CONFIG / 'preview-transition.json').exists():
            need(parse(c.private_file(CONFIG / 'preview-transition.json').read_bytes()).get('phase') in ('accepted', 'rolled-back'))
        units = ['morphiume-runtime-' + action + '.' + kind for action in ('health', 'backup') for kind in ('timer', 'service')]
        need(c.run(['systemctl', 'show', '--property=ActiveState', '--value', *units]).split() == ['inactive'] * 4)
        deployed = parse(c.private_file(CONFIG / 'deployed-release.json').read_bytes())
        need(all(deployed[key] == previous[key] for key in previous) and deployed.get('nativeFixtureAcceptance') == 'accepted')
        previous_report = c.archived_image(previous)
        profile = c.active_profile(required=True)
        need(c.canonical_hash(profile) == plan['previousAccessProfileSha256'])
        need(deployed['accessProfileSha256'] == plan['previousAccessProfileSha256'])
        c.match_mapping(profile, previous_report); configs = c.load_configs(); c.db_container()
        old_bundle = c.resolve_ops_bundle(previous['sourceCommit'], OPS)
        old_env = c.compose_environment(previous['runtimeImageId'], old_bundle, profile)
        need(c.private_file(CONFIG / 'deploy.env').read_text() == old_env)
        c.validate_app_containers(containers(c), previous_report)
        old_inventory = guard.capture_old_inventory(c); original_configs = footprints(c)
        candidate_migrations(c, plan)
        next_profile = c.make_profile(report, 'private-ip', configs); c.preserve_profile(next_profile)
        evidence.mkdir(mode=0o700)
        state = {'operationId': args.operation_id, 'evidenceRoot': str(evidence), 'previous': previous,
            'candidate': candidate, 'reviewedPlanSha256': args.plan_sha256, 'toolSha256': args.tool_sha256,
            'toolSourceCommit': args.tool_source_commit, 'opsSourceCommit': args.ops_source_commit,
            'seedInvoked': False, 'migrationInvoked': False, 'nativeFixtureAcceptance': 'pending', 'stages': []}
        c.write_private(evidence / 'old-restore-inventory.json', json.dumps(old_inventory, sort_keys=True) + '\n')
        journal(c, state, 'prepared')
        c.write_private(CONFIG / 'deploy.candidate.env', c.compose_environment(candidate['runtimeImageId'], c.OPS_ROOT, next_profile))
        old_command = c.compose(previous['runtimeImageId'], ops_root=old_bundle)
        next_command = c.compose(candidate['runtimeImageId'], env_file=CONFIG / 'deploy.candidate.env', ops_root=c.OPS_ROOT)
        try:
            c.run(old_command + ['config', '--quiet']); c.run(next_command + ['config', '--quiet'])
            c.run(old_command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            c.validate_app_containers(containers(c), previous_report, running=False)
            journal(c, state, 'writers-stopped')
            result = backup.create_backup(previous_report)
            manifest_path = Path(result['directory']) / 'backup-manifest.json'
            manifest = parse(c.private_file(manifest_path).read_bytes()); c.match_mapping(manifest, previous_report)
            for name, expected in manifest['ciphertextSha256'].items():
                need(name in ('database.dump.age', 'media.tar.gz.age'))
                with c.private_file(manifest_path.parent / name).open('rb') as stream:
                    need(hashlib.file_digest(stream, 'sha256').hexdigest() == expected)
            need(set(manifest['ciphertextSha256']) == {'database.dump.age', 'media.tar.gz.age'})
            state['preUpgradeBackup'] = result['directory']; state['backupManifestSha256'] = sha(manifest_path.read_bytes())
            journal(c, state, 'backup-verified')
            before = capture_database(c, guard)
            c.write_private(evidence / 'before.json', json.dumps(before, sort_keys=True) + '\n')
            for service in ('check-owner', 'check-app'):
                c.run(next_command + ['run', '--rm', '--pull', 'never', '--no-deps', service], timeout=60)
            after = capture_database(c, guard); comparison = compare_database(before, after)
            need(footprints(c) == original_configs); guard.old_pairs(c, old_inventory); c.assert_boundaries(); c.db_container()
            c.write_private(evidence / 'after.json', json.dumps(after, sort_keys=True) + '\n')
            state['preservation'] = comparison; journal(c, state, 'data-preserved')
            c.select_profile(next_profile)
            c.run(next_command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app', 'worker'], timeout=210)
            c.validate_app_containers(containers(c), report)
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=10) as response:
                need(response.status == 200)
            need(footprints(c) == original_configs); guard.old_pairs(c, old_inventory); c.assert_boundaries(); c.db_container()
            history = CONFIG / 'history'; history.mkdir(mode=0o700, exist_ok=True); c.private_directory(history)
            saved = history / (previous['sourceCommit'] + '.json')
            if saved.exists(): need(parse(c.private_file(saved).read_bytes()) == deployed)
            else: c.write_private(saved, json.dumps(deployed, sort_keys=True) + '\n')
            output = candidate | {'project': c.PROJECT, 'database': c.DATABASE,
                'deployedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'previousSourceCommit': previous['sourceCommit'], 'preMigrationBackup': result['directory'],
                'accessProfileSha256': c.canonical_hash(next_profile), 'nativeFixtureAcceptance': 'pending',
                'migrationBefore': before['history'], 'migrationAfter': after['history']}
            c.write_private(CONFIG / 'deployed-release.json.new', json.dumps(output, sort_keys=True) + '\n')
            c.private_file(CONFIG / 'deploy.candidate.env'); os.replace(CONFIG / 'deploy.candidate.env', CONFIG / 'deploy.env')
            c.private_file(CONFIG / 'deployed-release.json'); os.replace(CONFIG / 'deployed-release.json.new', CONFIG / 'deployed-release.json')
            state['accessProfileSha256'] = output['accessProfileSha256']; journal(c, state, 'committed')
            c.write_private(ROOT / 'releases' / args.source / 'redesign-upgrade-result.json', json.dumps(state, sort_keys=True) + '\n')
            return {'mode': 'redesign-ready-native-acceptance-pending', 'sourceCommit': args.source,
                'accessProfileSha256': output['accessProfileSha256'], 'tableCount': 53, 'migrationCount': 13,
                'seedInvoked': False, 'migrationInvoked': False, 'oldRestorePairsPreserved': 3,
                'preUpgradeBackup': result['directory'], 'evidenceRoot': str(evidence)}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            try: c.run(next_command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            except (OSError, ValueError, subprocess.SubprocessError): pass
            state['failedAfterPhase'] = state['phase']
            try: journal(c, state, 'failed-preserved')
            except (OSError, ValueError): pass
            raise ValueError('Redesign cutover failed; preserve state and backup, no replay or automatic rollback') from None


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'config-id', 'manifest-digest', 'archive-sha256', 'ops-sha256', 'ops-root',
                 'ops-source-commit', 'tool-source-commit', 'tool-sha256', 'plan', 'plan-sha256',
                 'plan-companion-sha256', 'restore-guard-sha256', 'operation-id'):
        p.add_argument('--' + name, required=True)
    p.add_argument('--quiescent-window-released', action='store_true')
    p.add_argument('--apply', action='store_true')
    return p


if __name__ == '__main__':
    try: print(json.dumps(main(parser().parse_args())))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print(json.dumps({'mode': 'redesign-upgrade-gated-or-failed', 'replayAttempted': False}))
        raise SystemExit(1) from None
