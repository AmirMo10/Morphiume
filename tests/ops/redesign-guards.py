#!/usr/bin/env python3
"""Portable offline counterexamples; no SSH, daemon, database or credential use."""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import re
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]
DEPLOY = REPO / 'deploy/staging'


def load(name):
    path = DEPLOY / ('redesign-' + name + '.py')
    spec = importlib.util.spec_from_file_location('redesign_' + name.replace('-', '_'), path)
    module = importlib.util.module_from_spec(spec)
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


p = load('plan'); r = load('isolated-restore'); s = load('scheduled-bootstrap'); u = load('preserved-upgrade')
SOURCE = 'b' * 40  # Synthetic offline candidate; never an accepted release.
CANDIDATE = p.PREVIOUS | {'sourceCommit': SOURCE, 'testedPlatformConfig': 'sha256:' + 'c' * 64,
    'candidateManifestDigest': 'sha256:' + 'd' * 64, 'archiveSha256': 'e' * 64,
    'runtimeImageId': 'sha256:' + 'f' * 64, 'engineProofSha256': 'a' * 64}
for module in (r, s):
    module.SOURCE = SOURCE; module.EXPECTED = CANDIDATE.copy()
    module.BUNDLE = module.ROOT / 'releases' / SOURCE / 'ops-bundles' / module.OPS / 'ops'


def plan():
    return {'formatVersion': 1, 'mode': 'reviewed-redesign-image-only-release', 'candidate': CANDIDATE.copy(),
        'previous': p.PREVIOUS.copy(), 'previousAccessProfileSha256': p.PREVIOUS_PROFILE,
        'canonicalOrigin': 'http://192.168.240.51', 'migrationManifestSha256': p.MIGRATIONS,
        'migrationCount': 13, 'tableCount': 53}


def history():
    text = (DEPLOY / 'upgrade-original-observation.mjs').read_text()
    pairs = re.findall(r'"([0-9]{4}_[a-z_]+\.sql)": "([a-f0-9]{64})"', text)
    return {'database': 'morphiume_staging_runtime', 'migrations': [{'name': name, 'checksum': checksum} for name, checksum in pairs]}


def snapshot():
    catalog = {'schema': {'owner': 'morphiume_runtime_owner'}, 'memberships': [],
        'roles': [{'name': name, **dict.fromkeys(('superuser', 'createDb', 'createRole', 'replication', 'bypassRls'), False)}
                  for name in ('morphiume_runtime_app', 'morphiume_runtime_owner')],
        'relations': [{'name': name, 'kind': 'r', 'owner': 'morphiume_runtime_owner',
                       **dict.fromkeys(('rls', 'forceRls', 'truncate', 'references', 'trigger', 'publicGrant'), False),
                       **dict.fromkeys(('select', 'insert', 'update', 'delete'), True)} for name in u.TABLES]}
    return {'identity': {'database': 'morphiume_staging_runtime', 'role': 'morphiume_runtime_app', 'readOnly': 'on'},
        'history': history(), 'rows': {name: {'count': 1, 'bytes': 32, 'maxRowBytes': 32, 'sha256': '1' * 64} for name in u.TABLES},
        'catalog': catalog, 'sequences': [{'name': 'retained', 'state': {'lastValue': 7, 'isCalled': True}}]}


def args(action='health'):
    return SimpleNamespace(action=action, source=SOURCE, tool_source_commit='c' * 40, tool_sha256='1' * 64,
        plan=str(p.ROOT / 'releases' / SOURCE / 'plans' / ('2' * 64) / 'plan.json'), plan_sha256='2' * 64,
        plan_companion_sha256='3' * 64, ops_root=str(s.BUNDLE), approval_sha256='4' * 64,
        profile_sha256='5' * 64, runtime_image_id=CANDIDATE['runtimeImageId'], engine_proof_sha256=CANDIDATE['engineProofSha256'],
        restore_evidence=str(p.ROOT / 'restore/morphiume-runtime-restore-20201014t060000z-012345/recovery-accepted.json'),
        restore_sha256='6' * 64, fixture_sha256='7' * 64,
        native_evidence=str(s.CONFIG / ('retained-t25-redesign-' + SOURCE + '.json')), native_sha256='8' * 64,
        unit=s.unit(action), execute=False, render_dropin=False, render_health_timer=False)


def approval(a=None):
    a = a or args()
    return CANDIDATE | {'formatVersion': 1, 'mode': 'quiesce-runtime-only', 'sharedDatabaseWindowReleased': True,
        'accessProfileSha256': a.profile_sha256, 'restoreEvidence': a.restore_evidence, 'restoreEvidenceSha256': a.restore_sha256,
        'bootstrapSourceCommit': a.tool_source_commit, 'bootstrapSha256': a.tool_sha256,
        'nativeEvidence': a.native_evidence, 'nativeEvidenceSha256': a.native_sha256, 'fixtureSha256': a.fixture_sha256,
        'reviewedPlanSha256': a.plan_sha256, 'planCompanionSha256': a.plan_companion_sha256,
        'scope': 'one-time-service-measurement', 'backupTimeoutStopSeconds': 90,
        'serviceMeasurementSha256': {'health': None, 'backup': None}, 'healthTimerIntervalSeconds': 300,
        'dispatchLock': {'path': str(s.DISPATCH_LOCK), 'sha256': s.sha(s.LOCK_BYTES), 'device': 1, 'inode': 2, 'filesystem': 'ext4'}}


def native():
    a = args()
    return CANDIDATE | {'accessProfileSha256': a.profile_sha256, 'mode': 'retained-redesign-T25-accepted',
        'fixtureSha256': a.fixture_sha256, 'fixtureCreatedUtc': '2020-10-14T05:00:00Z', 'acceptedUtc': '2020-10-14T05:01:00Z',
        'nativeT25Accepted': True, 'checks': dict.fromkeys(s.NATIVE_CHECKS, True), 'engine': 'chromium', 'testCaseCount': 1,
        'unexpected': 0, 'skipped': 0, 'testRetries': 0}


def restored():
    a = args()
    return CANDIDATE | {'mode': 'native-business-restore-accepted', 'accessProfileSha256': a.profile_sha256,
        'checks': dict.fromkeys(s.CHECKS, True), 'workerStarted': False, 'origin': 'http://localhost:3101',
        'restoreProject': Path(a.restore_evidence).parent.name, 'fixtureManifestSha256': a.fixture_sha256,
        'acceptedUtc': '2020-10-14T06:00:00Z', 'observedRtoSeconds': 50.0, 'observedRecoveryPointGapSeconds': 10.0}


def docker(service, project):
    previous = r.OLD_RELEASES[project]; root = previous['root']
    index = list(r.OLD_RELEASES).index(project) * 2 + (1 if service == 'db' else 0)
    return {'Id': format(index + 1, '064x'), 'Name': '/' + project + '-' + service + '-1',
        'Image': 'sha256:' + '9' * 64,
        'Config': {'Labels': {'com.docker.compose.service': service, 'com.docker.compose.project': project,
            'morphiume.restore.scope': 'runtime', **({'org.opencontainers.image.revision': previous['source']} if service == 'app' else {})},
            'User': '1001:1001' if service == 'app' else '999:999', 'Image': 'postgres:pinned' if service == 'db' else 'sha256:' + '9' * 64},
        'State': {'Status': 'exited', 'Running': False, 'Paused': False, 'Restarting': False, 'ExitCode': 143 if service == 'app' else 0,
            'StartedAt': '2020-01-01T00:00:00Z', 'FinishedAt': '2020-01-01T00:01:00Z', 'OOMKilled': False},
        'Mounts': [{'Type': 'bind', 'Source': str(root / ('media' if service == 'app' else 'postgres')),
            'Destination': '/app/media' if service == 'app' else '/var/lib/postgresql', 'Mode': 'rw', 'RW': True, 'Propagation': 'rprivate'}],
        'NetworkSettings': {'Networks': {project + '_restore': {}, **({project + '_edge': {}} if service == 'app' else {})}},
        'HostConfig': {'PortBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3002'}]} if service == 'app' else {}}}


def inventory(project):
    previous = r.OLD_RELEASES[project]; root = previous['root']
    def meta(path, uid=0, mode='0o700'):
        return {'path': str(path), 'uid': uid, 'gid': uid, 'mode': mode, 'device': 1, 'inode': 2}
    return {'observedAt': '2020-01-01T00:00:00Z', 'mutation': False, 'sql': False, 'project': project, 'root': str(root),
        'rootMetadata': meta(root), 'storageMetadata': [meta(root / 'postgres', 999), meta(root / 'media', 1001, '0o750')],
        'files': [meta(root / name, uid, '0o600') | {'bytes': 1, 'sha256': 'a' * 64} for name, uid in (r.OLD_FILES | previous['extraFiles']).items()],
        'containers': [r.container_view(docker(service, project)) for service in ('app', 'db')],
        'tcp3002ListenerAbsent': True, 'mediaSnapshot': {}}


def effective(a):
    health = a.action == 'health'
    return {'Id': s.unit(a.action), 'Names': s.unit(a.action), 'LoadState': 'loaded',
        'FragmentPath': '/etc/systemd/system/' + s.unit(a.action), 'DropInPaths': str(s.dropin_path(a.action)),
        'Type': 'oneshot', 'User': 'root', 'UMask': '0077', 'Restart': 'no', 'EnvironmentFiles': '', 'InvocationID': 'a' * 32,
        'ActiveState': 'activating', 'WorkingDirectory': str(s.CONFIG), 'NoNewPrivileges': 'yes', 'PrivateTmp': 'yes',
        'ProtectHome': 'yes', 'ProtectSystem': 'strict', 'CPUAccounting': 'yes', 'MemoryAccounting': 'yes',
        'TimeoutStartUSec': '50s' if health else '20min', 'TimeoutStopUSec': '5s' if health else '1min 30s',
        'MemoryMax': str((256 if health else 512) * 1024**2), 'CPUQuotaPerSecUSec': '1s' if health else '500ms',
        'ReadWritePaths': '' if health else str(s.ROOT / 'backups') + ' /srv/morphiume/staging/deploy.lock',
        'ExecStart': '{ path=/usr/bin/python3 ; argv[]=' + ' '.join(s.command(a, s.unit(a.action))) +
            ' ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0 }'}


class ReviewedPlanChecks(unittest.TestCase):
    def test_complete_explicit_candidate_plan(self): p.validate(plan(), SOURCE)

    def test_missing_extra_keys_or_bool_version_rejected(self):
        for bad in (plan() | {'extra': True}, plan() | {'formatVersion': True}, {k: v for k, v in plan().items() if k != 'previous'}):
            with self.assertRaises(ValueError): p.validate(bad, SOURCE)

    def test_old_source_and_unreviewed_source_rejected(self):
        for source in (p.PREVIOUS['sourceCommit'], 'c' * 40, '../main'):
            with self.assertRaises(ValueError): p.validate(plan(), source)

    def test_previous_image_profile_schema_origin_cannot_change(self):
        for key, bad in (('previous', CANDIDATE), ('previousAccessProfileSha256', 'a' * 64), ('canonicalOrigin', 'http://localhost:3100'),
                         ('migrationCount', True), ('migrationCount', 14), ('tableCount', 49), ('migrationManifestSha256', '0' * 64)):
            with self.subTest(key=key), self.assertRaises(ValueError): p.validate(plan() | {key: bad}, SOURCE)

    def test_candidate_ops_moving_tag_missing_mapping_rejected(self):
        for key, bad in (('opsSha256', 'f' * 64), ('runtimeImageId', 'morphiume:main'), ('testedPlatformConfig', p.PREVIOUS['testedPlatformConfig']),
                         ('engineProofSha256', None), ('sourceCommit', 'a' * 40)):
            value = plan(); value['candidate'][key] = bad
            with self.subTest(key=key), self.assertRaises(ValueError): p.validate(value, SOURCE)

    def test_duplicate_json_and_nonfinite_values_rejected(self):
        for value in ('{"source":1,"source":2}', '{"value":NaN}', '{"value":Infinity}'):
            with self.assertRaises(ValueError): p.parse(value)


class UpgradeChecks(unittest.TestCase):
    def test_default_cannot_import_or_mutate(self):
        with patch.object(u, 'bind_reviewed_plan', side_effect=AssertionError('unexpected import')):
            value = u.main(SimpleNamespace(apply=False))
        self.assertFalse(value['serverMutation']); self.assertFalse(value['seedInvoked']); self.assertFalse(value['migrationInvoked'])

    def test_all53_rows_and13_exact_migrations_preserved(self):
        result = u.compare_database(snapshot(), snapshot()); self.assertEqual((result['tableCount'], result['migrationCount']), (53, 13))

    def test_changed_existing_auth_or_financial_row_rejected(self):
        for table in ('account', 'two_factor', 'user', 'payment_receipt', 'inventory_balance'):
            after = snapshot(); after['rows'][table]['sha256'] = '2' * 64
            with self.subTest(table=table), self.assertRaises(ValueError): u.compare_database(snapshot(), after)

    def test_missing_or_extra_table_rejected_even_if_both_equal(self):
        for name, add in (('user', False), ('unknown', True)):
            before = snapshot()
            if add: before['rows'][name] = before['rows']['account']
            else: before['rows'].pop(name)
            with self.assertRaises(ValueError): u.compare_database(before, before)

    def test_schema_acl_catalog_and_sequence_changes_rejected(self):
        for key in ('catalog', 'sequences'):
            after = snapshot(); after[key] = {} if key == 'catalog' else []
            with self.assertRaises(ValueError): u.compare_database(snapshot(), after)

    def test_foreign_db_role_or_writable_snapshot_rejected(self):
        for key, bad in (('database', 'morphiume_staging'), ('role', 'postgres'), ('readOnly', 'off')):
            before = snapshot(); before['identity'][key] = bad
            with self.assertRaises(ValueError): u.compare_database(before, before)

    def test_filtered_or_privileged_table_cannot_prove_all_row_equality(self):
        for key, bad in (('rls', True), ('forceRls', True), ('select', False), ('truncate', True), ('publicGrant', True)):
            value = snapshot(); value['catalog']['relations'][0][key] = bad
            with self.subTest(key=key), self.assertRaises(ValueError): u.compare_database(value, value)

    def test_role_escalation_or_unexpected_membership_rejected(self):
        for membership in (False, True):
            value = snapshot()
            if membership: value['catalog']['memberships'] = [{'member': 'unexpected'}]
            else: value['catalog']['roles'][0]['superuser'] = True
            with self.assertRaises(ValueError): u.compare_database(value, value)

    def test_changed_or_duplicate_migration_rejected(self):
        for duplicate in (False, True):
            before = snapshot()
            if duplicate: before['history']['migrations'][-1] = before['history']['migrations'][0]
            else: before['history']['migrations'][-1]['checksum'] = '0' * 64
            with self.assertRaises(ValueError): u.compare_database(before, before)

    def test_unbounded_or_invalid_row_summary_rejected(self):
        valid = snapshot()['rows']['user']
        for key, bad in (('count', True), ('count', 100001), ('bytes', 256 * 1024**2 + 1), ('maxRowBytes', 2 * 1024**2 + 1), ('sha256', 'bad')):
            with self.assertRaises(ValueError): u.validate_rows(valid | {key: bad})

    def test_candidate_migration_probe_has_no_network_or_secrets(self):
        c = Mock(); c.run.return_value = json.dumps({'count': 13, 'sha256': p.MIGRATIONS})
        u.candidate_migrations(c, plan()); command = c.run.call_args.args[0]
        self.assertIn('none', command); self.assertIn('--read-only', command); self.assertIn('--pull', command)
        self.assertIn(CANDIDATE['runtimeImageId'], command)
        for forbidden in ('DATABASE_URL', '/etc', '--volume', 'migrate.mjs', 'seed.mjs'): self.assertNotIn(forbidden, ' '.join(command))

    def test_candidate_migrations_must_match_exact_manifest(self):
        for value in ({'count': 12, 'sha256': p.MIGRATIONS}, {'count': 13, 'sha256': '0' * 64}):
            c = Mock(); c.run.return_value = json.dumps(value)
            with self.assertRaises(ValueError): u.candidate_migrations(c, plan())

    def test_sql_role_target_read_only_and_bounded(self):
        c = Mock(DATABASE='morphiume_staging_runtime'); c.psql.return_value = '{}'; u.sql(c, 'SELECT jsonb_build_object()')
        database, query = c.psql.call_args.args
        self.assertEqual(database, 'morphiume_staging_runtime')
        for part in ('READ ONLY', 'SET LOCAL ROLE morphiume_runtime_app', "statement_timeout='15s'", "lock_timeout='1s'", 'COMMIT'): self.assertIn(part, query)


class RestoreChecks(unittest.TestCase):
    def test_default_cannot_bind_import_or_execute(self):
        with patch.object(r, 'bind_reviewed_plan', side_effect=AssertionError('binding')):
            value = r.main(SimpleNamespace(apply=False))
        self.assertFalse(value['serverMutation']); self.assertFalse(value['workerStarted'])

    def test_all_three_pairs_six_distinct_ids_required(self):
        value = {'version': 1, 'pairs': [inventory(project) for project in r.OLD_RELEASES]}; r.inventories_shape(value)
        self.assertEqual(len({v['id'] for record in value['pairs'] for v in record['containers']}), 6)
        for bad in (value['pairs'][:2], value['pairs'] + [value['pairs'][0]], [value['pairs'][0]] * 3):
            with self.assertRaises(ValueError): r.inventories_shape({'version': 1, 'pairs': bad})

    def test_acf8_pair_keeps_its_private_ip_profile(self):
        profiles = [entry['profile'] for entry in r.OLD_RELEASES.values()]
        self.assertEqual(profiles.count('ssh-localhost'), 2); self.assertEqual(profiles.count('private-ip'), 1)
        entry = r.OLD_RELEASES['morphiume-runtime-restore-20261014t071244z-30668c']; self.assertEqual(entry['source'], p.PREVIOUS['sourceCommit'])

    def test_old_pairs_cannot_run_or_point_to_reserved_storage(self):
        for project in r.OLD_RELEASES:
            items = [docker(service, project) for service in ('app', 'db')]; record = inventory(project)
            r.validate_old_actual(record, items, 'postgres:pinned', {'runtimeImageId': 'sha256:' + '9' * 64})
            items[0]['State']['Running'] = True; record['containers'] = [r.container_view(t) for t in items]
            with self.assertRaises(ValueError): r.inventory_shape(record)
            items = [docker(service, project) for service in ('app', 'db')]; items[1]['Mounts'][0]['Source'] = '/srv/morphiume/postgres'
            record = inventory(project); record['containers'] = [r.container_view(t) for t in items]
            with self.assertRaises(ValueError): r.validate_old_actual(record, items, 'postgres:pinned', {'runtimeImageId': 'sha256:' + '9' * 64})

    def test_six_old_containers_and_no_unknown_scope(self):
        records = {'version': 1, 'pairs': [inventory(project) for project in r.OLD_RELEASES]}
        items = [docker(service, project) for project in r.OLD_RELEASES for service in ('app', 'db')]
        ids = '\n'.join(t['Id'] for t in items); c = Mock(); c.run.side_effect = lambda command: ids if command[1] == 'ps' else json.dumps(items)
        with patch.object(r, 'old_pair', side_effect=lambda _c, record, actual: [r.container_view(t) for t in actual if t['Config']['Labels']['com.docker.compose.project'] == record['project']]):
            self.assertEqual(len(r.old_pairs(c, records)), 6)
            c.run.side_effect = lambda command: ids + '\n' + 'f' * 64 if command[1] == 'ps' else json.dumps(items)
            with self.assertRaises(ValueError): r.old_pairs(c, records)

    def test_preserved_source_history_is_exact13(self):
        r.exact_history(history())
        value = history(); value['migrations'].pop()
        with self.assertRaises(ValueError): r.exact_history(value)


class ScheduleChecks(unittest.TestCase):
    def test_default_cannot_bind_or_execute(self):
        with patch.object(s, 'bind_reviewed_plan', side_effect=AssertionError('binding')):
            self.assertFalse(s.main(args())['serverMutation'])

    def test_only_exact_source_bound_evidence_path(self):
        s.validate_arguments(args())
        for name in ('/etc/morphiume-staging-runtime/retained-t25-acf8.json', '/etc/morphiume-staging-runtime/retained-t25-redesign-' + 'c' * 40 + '.json'):
            a = args(); a.native_evidence = name
            with self.assertRaises(ValueError): s.validate_arguments(a)

    def test_guard_command_binds_private_plan_and_companion(self):
        command = s.command(args()); self.assertIn('--plan-sha256', command); self.assertIn('--plan-companion-sha256', command)
        self.assertIn('--source', command); self.assertIn(SOURCE, command)

    def test_same_health_budget_and_inherited_backup_budget(self):
        health = s.dropin(args()); backup = s.dropin(args('backup'))
        self.assertIn('CPUQuota=100%\nMemoryMax=256M\nTimeoutStartSec=50s\nTimeoutStopSec=5s', health)
        for name in ('CPUQuota=', 'MemoryMax=', 'TimeoutStartSec=', 'TimeoutStopSec='): self.assertNotIn(name, backup)
        for value in (health, backup):
            for forbidden in ('[Timer]', 'ReadWritePaths=', 'Restart=', 'DATABASE_URL'): self.assertNotIn(forbidden, value)

    def test_five_minute_cadence_preserved(self):
        self.assertEqual(s.health_timer_dropin(), '[Timer]\nOnUnitActiveSec=\nOnBootSec=5min\nOnUnitActiveSec=5min\n')

    def test_approval_binds_reviewed_plan_and_companion(self):
        s.validate_approval(approval(), args())
        for key, value in (('reviewedPlanSha256', '0' * 64), ('planCompanionSha256', '0' * 64), ('backupTimeoutStopSeconds', 120), ('healthTimerIntervalSeconds', 60)):
            with self.assertRaises(ValueError): s.validate_approval(approval() | {key: value}, args())

    def test_old_approval_or_restore_cannot_be_relabelled(self):
        for function, value in ((s.validate_approval, approval()), (s.validate_restore, restored()), (s.validate_native, native())):
            with self.assertRaises(ValueError): function(value | p.PREVIOUS, args())

    def test_recurring_requires_both_real_measurement_hashes(self):
        value = approval() | {'scope': 'recurring-timers'}
        with self.assertRaises(ValueError): s.validate_approval(value, args())
        value['serviceMeasurementSha256'] = {'health': 'a' * 64, 'backup': 'b' * 64}; s.validate_approval(value, args())

    def test_native20_checks_no_skip_retry_and_restore6_checks(self):
        s.validate_native(native(), args()); s.validate_restore(restored(), args())
        self.assertEqual((len(native()['checks']), len(restored()['checks'])), (20, 6))
        for key in ('skipped', 'testRetries', 'unexpected'):
            with self.assertRaises(ValueError): s.validate_native(native() | {key: 1}, args())
        value = restored(); value['checks']['mediaHashes'] = False
        with self.assertRaises(ValueError): s.validate_restore(value, args())

    def test_effective_budgets_exact_and_shadow_unit_rejected(self):
        for action in ('health', 'backup'):
            a = args(action); value = effective(a); s.validate_effective(value, a, 'a' * 32, 90)
            for key, bad in (('MemoryMax', '1073741824'), ('CPUQuotaPerSecUSec', '2s'), ('TimeoutStartUSec', '30min'),
                             ('TimeoutStopUSec', '120s'), ('EnvironmentFiles', '/private/env'), ('DropInPaths', '/run/shadow.conf')):
                with self.subTest(action=action, key=key), self.assertRaises(ValueError): s.validate_effective(value | {key: bad}, a, 'a' * 32, 90)

    def test_frozen_all21_sources_and_changed_byte_rejection(self):
        sources = {name: (DEPLOY / name).read_bytes().replace(b'\r\n', b'\n') for name in s.OPS_FILES}
        manifest = {name: s.sha(raw) for name, raw in sources.items()}; s.verify_manifest(manifest, sources)
        wrong = sources.copy(); wrong['runtime/backup.py'] += b'changed'
        with self.assertRaises(ValueError): s.verify_manifest(manifest, wrong)


class SourceChecks(unittest.TestCase):
    def test_new_tools_parse_and_frozen_helpers_unchanged_by_design(self):
        for path in DEPLOY.glob('redesign-*.py'):
            ast.parse(path.read_text())
        source = (DEPLOY / 'redesign-preserved-upgrade.py').read_text()
        for forbidden in ('shutil.rmtree', 'down --volumes', "['seed']", "['migrate']", 'git pull', 'systemctl enable'):
            self.assertNotIn(forbidden, source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
