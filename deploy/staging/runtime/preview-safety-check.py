"""Pure profile/preview/rollback tests; every server operation mocked.

Synthetic credentials are fixed strings, never deployment credentials.
"""
import copy
import configparser
import datetime
import json
import subprocess
import tempfile
import unittest
from contextlib import ExitStack, nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import contract as c
import preview as p
import restore


def report(ops='e'):
    return {'sourceCommit': 'a' * 40, 'testedPlatformConfig': 'sha256:' + 'b' * 64,
            'candidateManifestDigest': 'sha256:' + 'c' * 64, 'archiveSha256': 'd' * 64, 'opsSha256': ops * 64}


def configs():
    common = {'DATABASE_URL': f'postgresql://{c.APP}:' + '1' * 64 + '@db:5432/' + c.DATABASE,
              'PAYMENT_PROVIDER': 'mock', 'SMS_PROVIDER': 'mock', 'APP_BASE_URL': c.ORIGINS['ssh-localhost'], 'MEDIA_ROOT': '/app/media'}
    return {'app.json': common | dict(zip(('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET'), ('2' * 64, '3' * 64, '4' * 64))),
            'worker.json': common | dict(zip(('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET'), ('5' * 64, '6' * 64, '7' * 64))),
            'migration.json': {'DATABASE_URL': f'postgresql://{c.OWNER}:' + '8' * 64 + '@db:5432/' + c.DATABASE, 'PAYMENT_PROVIDER': 'mock', 'SMS_PROVIDER': 'mock'}}


def inventory():
    return {'version': 1, 'targetOrigin': c.ORIGINS['private-ip'], 'ipv6Policy': 'deny-all', 'basicAuth': True,
            'clientCidrs': ['192.168.240.2/32'], 'checks': dict.fromkeys(p.INVENTORY_CHECKS, True), 'observedUtc': p.utc().isoformat(),
            **dict.fromkeys(('nginxConfigSha256', 'siteSha256', 'addressesSha256', 'routesSha256', 'listenersSha256', 'firewallSha256'), '9' * 64)}


def evidence(old):
    baseline = {key: old[key] for key in c.RELEASE_KEYS} | {'origin': c.ORIGINS['ssh-localhost'], 'database': c.DATABASE,
        'accessProfileSha256': c.canonical_hash(old), 'checks': dict.fromkeys(p.BASELINE_CHECKS, True), 'acceptedUtc': p.utc().isoformat(), 'fixtureManifestSha256': 'f' * 64}
    restored = {key: old[key] for key in c.RELEASE_KEYS} | {'origin': 'http://localhost:3101', 'workerStarted': False,
        'checks': dict.fromkeys(p.RESTORE_CHECKS, True), 'acceptedUtc': p.utc().isoformat(), 'fixtureManifestSha256': 'f' * 64,
        'observedRtoSeconds': 30, 'observedRecoveryPointGapSeconds': 1}
    return baseline, restored


class PreviewSafety(unittest.TestCase):
    def test_default_plans_do_not_read_private_inputs_or_generate_credentials(self):
        with patch.object(c, 'verify_release', side_effect=AssertionError('Server call')), patch.object(p.secrets, 'token_hex', side_effect=AssertionError('Credential generation')):
            for action in ('activate', 'accept', 'rollback', 'expire'):
                value = p.main(SimpleNamespace(apply=False, action=action))
                self.assertFalse(value['credentialsGenerated']); self.assertFalse(value['serverMutation'])

    def test_closed_profiles_and_origin_shape(self):
        value = configs()['app.json']; c.validate_config(value, c.APP)
        private = value | {'APP_BASE_URL': c.ORIGINS['private-ip']}
        c.validate_config(private, c.APP, profile='private-ip')
        for origin in ('http://192.168.240.51:80', 'http://192.168.240.51/', 'https://192.168.240.51', 'http://user@192.168.240.51', 'http://192.168.240.51?', 'http://localhost:3100'):
            with self.assertRaises(ValueError): c.validate_config(private | {'APP_BASE_URL': origin}, c.APP, profile='private-ip')
        with self.assertRaises(ValueError): c.validate_config(private, c.APP)
        with self.assertRaises(ValueError): c.validate_config(value, c.APP, profile='unreviewed')

    def test_transition_changes_only_app_worker_origin_preserves_all_keys_and_owner(self):
        before = configs(); after = p.transition_configs(before)
        self.assertEqual(after['migration.json'], before['migration.json'])
        for name in ('app.json', 'worker.json'):
            self.assertEqual(after[name] | {'APP_BASE_URL': before[name]['APP_BASE_URL']}, before[name])
        self.assertEqual(before['app.json']['APP_BASE_URL'], c.ORIGINS['ssh-localhost'])

    def test_source_and_ops_paths_are_immutable_and_precise(self):
        first = c.bundle_path('a' * 40, 'e' * 64); second = c.bundle_path('a' * 40, 'f' * 64)
        self.assertNotEqual(first, second); c.validate_bundle_path(first)
        c.validate_bundle_path(c.ROOT / 'releases' / ('a' * 40) / 'ops')
        for path in (c.ROOT / 'ops', c.ROOT / 'releases' / ('a' * 40) / 'other' / 'ops', c.ROOT / 'releases' / ('a' * 40) / 'ops-bundles' / 'arbitrary' / 'ops'):
            with self.assertRaises(ValueError): c.validate_bundle_path(path)

    def test_immutable_profile_roundtrip_tamper_and_target_hash_guard(self):
        local = c.OPS_ROOT / '.local'; local.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='profile-roundtrip-', dir=local) as location, ExitStack() as stack:
            root = Path(location).resolve(); (root / 'releases' / ('a' * 40)).mkdir(parents=True)
            stack.enter_context(patch.object(c, 'ROOT', root))
            stack.enter_context(patch.object(c, 'private_directory', side_effect=lambda path: Path(path)))
            stack.enter_context(patch.object(c, 'private_file', side_effect=lambda path, **kwargs: Path(path)))
            stack.enter_context(patch.object(c.os, 'chown', create=True))
            stack.enter_context(patch.object(c.os, 'O_NOFOLLOW', getattr(c.os, 'O_NOFOLLOW', 0), create=True))
            stack.enter_context(patch.object(c, 'verify_ops_bundle', side_effect=lambda path, expected: Path(path)))
            value = c.make_profile(report(), 'ssh-localhost', configs()); path = c.preserve_profile(value)
            self.assertEqual(c.read_profile(path, c.canonical_hash(value)), value)
            self.assertEqual(c.preserve_profile(value), path)
            with self.assertRaises(ValueError): c.read_profile(path, '0' * 64)
            path.write_text(json.dumps(value | {'archiveSha256': '0' * 64}))
            with self.assertRaises(ValueError): c.read_profile(path, c.canonical_hash(value))
            with self.assertRaises(ValueError): c.preserve_profile(value)

    def test_loader_binds_both_writers_to_the_active_config_hash(self):
        local = c.OPS_ROOT / '.local'; local.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='profile-loader-', dir=local) as location, ExitStack() as stack:
            config = Path(location).resolve(); after = p.transition_configs(configs())
            record = c.make_profile(report(), 'private-ip', after)
            for name, value in after.items(): (config / name).write_text(json.dumps(value))
            original_stat = Path.stat
            stack.enter_context(patch.object(c, 'CONFIG', config))
            stack.enter_context(patch.object(c, 'active_profile', return_value=record))
            stack.enter_context(patch.object(c, 'private_file', side_effect=lambda path, **kwargs: Path(path)))
            stack.enter_context(patch.object(Path, 'stat', lambda path, *args, **kwargs: SimpleNamespace(st_uid=0, st_mode=0o700) if path == config else original_stat(path, *args, **kwargs)))
            self.assertEqual(c.load_configs(), after)
            (config / 'worker.json').write_text(json.dumps(after['worker.json'] | {'APP_BASE_URL': c.ORIGINS['ssh-localhost']}))
            with self.assertRaises(ValueError): c.load_configs()

    def test_profile_hash_binds_release_origin_and_every_config(self):
        old = c.make_profile(report(), 'ssh-localhost', configs())
        new = c.make_profile(report(), 'private-ip', p.transition_configs(configs()))
        self.assertNotEqual(c.profile_path(old), c.profile_path(new))
        self.assertEqual(old['configSha256']['migration.json'], new['configSha256']['migration.json'])
        for change in ({'origin': 'http://evil.invalid'}, {'opsRoot': str(c.ROOT / 'ops')}, {'profile': 'other'}, {'configSha256': {}}):
            with self.assertRaises(ValueError): c.validate_profile(old | change)

    def test_existing_or_wrong_release_profile_stops_before_mutation(self):
        old = c.make_profile(report(), 'ssh-localhost', configs())
        p.validate_transition(old, report('f'), 'e' * 64, c.canonical_hash(old), False)
        for previous, fingerprint, partial in (('f' * 64, c.canonical_hash(old), False), ('e' * 64, '0' * 64, False), ('e' * 64, c.canonical_hash(old), True)):
            with self.assertRaises(ValueError): p.validate_transition(old, report('f'), previous, fingerprint, partial)

    def test_actual_purchase_and_independent_restore_required(self):
        old = c.make_profile(report(), 'ssh-localhost', configs()); baseline, restored = evidence(old)
        p.validate_baselines(baseline, restored, report(), old)
        for change in ({'origin': 'http://localhost:3000'}, {'database': 'morphiume_staging'}, {'checks': {}}, {'fixtureManifestSha256': None}):
            with self.assertRaises(ValueError): p.validate_baselines(baseline | change, restored, report(), old)
        for change in ({'origin': 'http://localhost:3200'}, {'workerStarted': True}, {'checks': {}}, {'observedRtoSeconds': float('nan')}, {'observedRecoveryPointGapSeconds': True}):
            with self.assertRaises(ValueError): p.validate_baselines(baseline, restored | change, report(), old)

    def test_inventory_rejects_public_broad_ipv6_unobserved_or_auth_bypass(self):
        p.validate_inventory(inventory())
        for change in ({'clientCidrs': ['0.0.0.0/0']}, {'clientCidrs': ['192.168.0.0/16']}, {'clientCidrs': ['::/0']}, {'clientCidrs': ['192.168.240.2/24']}, {'clientCidrs': ['192.168.240.2/32;return 200']}, {'basicAuth': False}, {'ipv6Policy': 'allow-all'}, {'checks': {}}, {'observedUtc': '2026-01-01T00:00:00Z'}):
            with self.assertRaises(ValueError): p.validate_inventory(inventory() | change)

    def test_dispatch_requires_exact_profile_inventory_identity_and_finite_window(self):
        old = c.make_profile(report(), 'ssh-localhost', configs())
        value = report() | {'action': 'activate-private-ip', 'oldProfileSha256': c.canonical_hash(old), 'inventorySha256': '9' * 64,
            'sharedDatabaseWindowReleased': True, 'expiresUtc': (p.utc() + datetime.timedelta(minutes=30)).isoformat()}
        p.validate_dispatch(value, report(), old, '9' * 64)
        for change in ({'sharedDatabaseWindowReleased': False}, {'action': 'live'}, {'inventorySha256': '0' * 64}, {'opsSha256': '0' * 64}, {'expiresUtc': '2026-01-01T00:00:00Z'}, {'expiresUtc': (p.utc() + datetime.timedelta(days=1)).isoformat()}):
            with self.assertRaises(ValueError): p.validate_dispatch(value | change, report(), old, '9' * 64)

    def test_rendered_proxy_has_one_all_route_gate_no_origin_or_cookie_rewrite(self):
        value = p.nginx_site(inventory(), 'abcdefabcdef.htpasswd')
        for expected in ('satisfy all;', 'deny all;', 'auth_basic_user_file /etc/nginx/morphiume-staging-preview/abcdefabcdef.htpasswd;', 'proxy_pass http://127.0.0.1:3001;', 'listen [::]:80 default_server;', 'proxy_set_header Authorization "";'):
            self.assertIn(expected, value)
        for forbidden in ('proxy_set_header Origin', 'satisfy any', 'location = /healthz', 'proxy_cookie_domain', 'alias ', 'root ', 'proxy_cache'):
            self.assertNotIn(forbidden, value)
        self.assertEqual(value.count('location /'), 1)
        self.assertNotIn('proxy_pass', p.maintenance_site())
        with self.assertRaises(ValueError): p.nginx_site(inventory(), '../../password')

    def test_native_acceptance_requires_three_engines_no_skips_and_real_deadline(self):
        candidate = c.make_profile(report(), 'private-ip', p.transition_configs(configs()))
        state = {'candidate': candidate, 'startedUtc': (p.utc() - datetime.timedelta(seconds=5)).isoformat(), 'acceptanceDeadlineUtc': (p.utc() + datetime.timedelta(minutes=20)).isoformat()}
        value = {key: candidate[key] for key in c.RELEASE_KEYS} | {'origin': candidate['origin'], 'accessProfileSha256': c.canonical_hash(candidate),
            'noUnexpectedBusinessMutation': True, 'acceptedUtc': p.utc().isoformat(),
            'engines': [{'engine': engine, 'checks': dict.fromkeys(p.NATIVE_CHECKS, True), 'unexpected': 0, 'skipped': 0, 'testRetries': 0} for engine in ('chromium', 'firefox', 'webkit')]}
        p.validate_native(value, state)
        for change in ({'engines': value['engines'][:2]}, {'origin': c.ORIGINS['ssh-localhost']}, {'noUnexpectedBusinessMutation': False}):
            with self.assertRaises(ValueError): p.validate_native(value | change, state)
        failed = copy.deepcopy(value); failed['engines'][1]['checks']['newT25'] = False
        with self.assertRaises(ValueError): p.validate_native(failed, state)
        with self.assertRaises(ValueError): p.validate_native(value, state | {'acceptanceDeadlineUtc': state['startedUtc']})

    def test_failure_attempts_proxy_close_and_writer_stop_independently(self):
        events = []; state = {'phase': 'canonical-profile-selected'}
        with patch.object(p, 'replace_site', side_effect=ValueError('Syntax failure')), patch.object(c, 'run', side_effect=lambda *args, **kwargs: events.append('stop')), patch.object(p, 'save_state'):
            p.close_failed(state, ['mock-compose'])
        self.assertEqual(events, ['stop']); self.assertEqual(state['recoveryFailures'], ['proxy-close-failed'])
        self.assertEqual(state['phase'], 'failed-closed-recovery-required')

    def test_restore_origin_stays3101_with_private_runtime_origin(self):
        value = p.transition_configs(configs())['app.json']
        result = restore.restore_config(value, '9' * 64, profile='private-ip')
        self.assertEqual(result['APP_BASE_URL'], 'http://localhost:3101')
        for name in ('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET'): self.assertEqual(result[name], value[name])

    def test_persistent_lease_contains_only_frozen_identities_no_secrets_or_checkout(self):
        candidate = c.make_profile(report(), 'private-ip', p.transition_configs(configs()))
        state = {'candidate': candidate, 'transaction': str(c.ROOT / 'metrics' / 'preview-20261012T010000Z-abcdefabcdef'), 'acceptanceDeadlineUtc': '2026-10-12T01:20:00Z'}
        name, service, timer = p.lease_units(state)
        unit = configparser.ConfigParser(interpolation=None); unit.read_string(service)
        schedule = configparser.ConfigParser(interpolation=None); schedule.read_string(timer)
        self.assertEqual(schedule['Timer']['Persistent'], 'true'); self.assertEqual(schedule['Timer']['OnCalendar'], '2026-10-12 01:20:00 UTC')
        self.assertIn(candidate['opsRoot'], unit['Service']['ExecStart']); self.assertNotIn('/opt/morphiume', service)
        self.assertNotIn('AUTH_SECRET', service); self.assertNotIn(configs()['app.json']['AUTH_SECRET'], service)
        self.assertEqual(name, 'morphiume-runtime-preview-abcdefabcdef')

    def test_expired_lease_closes_pending_profile_without_pg_or_newer_checkout(self):
        candidate = c.make_profile(report(), 'private-ip', p.transition_configs(configs()))
        args = SimpleNamespace(source=report()['sourceCommit'], config_id=report()['testedPlatformConfig'], manifest_digest=report()['candidateManifestDigest'], archive_sha256=report()['archiveSha256'], ops_sha256=report()['opsSha256'])
        state = {'candidate': candidate, 'phase': 'native-acceptance-pending', 'acceptanceDeadlineUtc': '2026-10-12T00:00:00Z'}
        with ExitStack() as stack:
            stack.enter_context(patch.object(c, 'assert_boundaries'))
            stack.enter_context(patch.object(c, 'ops_digest', return_value=args.ops_sha256))
            stack.enter_context(patch.object(c, 'OPS_ROOT', c.bundle_path(args.source, args.ops_sha256)))
            stack.enter_context(patch.object(c, 'lock', return_value=nullcontext()))
            stack.enter_context(patch.object(p, 'read_state', return_value=state))
            stack.enter_context(patch.object(c, 'active_profile', return_value=candidate))
            stack.enter_context(patch.object(c, 'compose', return_value=['mock-compose']))
            stack.enter_context(patch.object(c, 'psql', side_effect=AssertionError('PG forbidden')))
            stack.enter_context(patch.object(c, 'verify_release', side_effect=AssertionError('New checkout forbidden')))
            stop = stack.enter_context(patch.object(c, 'run'))
            close = stack.enter_context(patch.object(p, 'replace_site'))
            stack.enter_context(patch.object(p, 'save_state'))
            value = p.expire(args)
            self.assertEqual(value['mode'], 'expired-preview-withdrawn'); close.assert_called_once_with(p.maintenance_site())
            self.assertIn('stop', stop.call_args.args[0])
            state['phase'] = 'accepted'
            self.assertEqual(p.expire(args)['mode'], 'lease-completed-no-op')
            self.assertEqual(stop.call_count, 1)

    def test_operator_node_contract_matches_python_hash_and_rejects_target_overrides(self):
        app = configs()['app.json']; profile = c.make_profile(report(), 'ssh-localhost', configs())
        trusted = report() | {'accessProfileSha256': c.canonical_hash(profile)}
        connections = {'databaseUrl': app['DATABASE_URL'].replace('@db:5432/', '@127.0.0.1:15434/'),
            'migrationDatabaseUrl': configs()['migration.json']['DATABASE_URL'].replace('@db:5432/', '@127.0.0.1:15434/')}
        module = (c.OPS_ROOT / 'runtime/operator-config.mjs').as_uri()
        script = """const {validateOperatorConfigs,canonicalHash}=await import(process.argv[1]);
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=JSON.parse(Buffer.concat(chunks));
const valid=validateOperatorConfigs(input.app,input.connections,input.profile,input.trusted);
if(valid.MIGRATION_DATABASE_URL||valid.APP_BASE_URL!==input.profile.origin||valid.DATABASE_URL!==input.connections.databaseUrl)throw Error('Bad operator scope');
let rejected=0;for(const replacement of [input.connections.databaseUrl+'?',input.connections.databaseUrl+'#',input.connections.databaseUrl+'?host=evil',input.connections.databaseUrl.replace('15434','15433'),input.connections.migrationDatabaseUrl]){
 try{validateOperatorConfigs(input.app,{...input.connections,databaseUrl:replacement},input.profile,input.trusted);}catch{rejected++;}}
if(rejected!==5||canonicalHash(input.profile)!==input.trusted.accessProfileSha256)throw Error('Override accepted/hash mismatch');
process.stdout.write(JSON.stringify({operatorValid:1,rejectedOverrides:rejected,hashMatches:true}));"""
        result = subprocess.run(['node', '--input-type=module', '-e', script, module], input=json.dumps({'app': app, 'connections': connections, 'profile': profile, 'trusted': trusted}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, 'Pure Node operator contract failed (private inputs withheld)')
        self.assertEqual(json.loads(result.stdout), {'operatorValid': 1, 'rejectedOverrides': 5, 'hashMatches': True})

    def mock_transition(self, fail=None, rollback=False):
        local = c.OPS_ROOT / '.local'; local.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='preview-safety-', dir=local) as location, ExitStack() as stack:
            base = Path(location).resolve(); root = base / 'runtime'; config = base / 'config'
            (root / 'metrics').mkdir(parents=True); config.mkdir(); site = base / 'nginx-site'
            site.write_text('old infrastructure-only site\n'); events = []
            stack.enter_context(patch.object(c, 'ROOT', root)); stack.enter_context(patch.object(c, 'CONFIG', config)); stack.enter_context(patch.object(p, 'SITE', site))
            old = c.make_profile(report(), 'ssh-localhost', configs()); candidate_report = report('f'); holder = {'profile': old}
            deployed = report() | {'database': c.DATABASE, 'project': c.PROJECT, 'accessProfileSha256': c.canonical_hash(old)}
            for name, value in configs().items(): (config / name).write_text(json.dumps(value))
            (config / 'deploy.env').write_text(c.compose_environment(old['testedPlatformConfig'], old['opsRoot'], old))
            (config / 'deployed-release.json').write_text(json.dumps(deployed))
            pointer = {'profilePath': str(c.profile_path(old)), 'profileSha256': c.canonical_hash(old)}
            (config / 'active-profile.json').write_text(json.dumps(pointer))
            original_files = {name: (config / name).read_text() for name in p.SNAPSHOTS}
            baseline, restored = evidence(old); network = inventory()
            dispatch = candidate_report | {'action': 'activate-private-ip', 'oldProfileSha256': c.canonical_hash(old), 'inventorySha256': '9' * 64,
                'sharedDatabaseWindowReleased': True, 'expiresUtc': (p.utc() + datetime.timedelta(minutes=30)).isoformat()}
            args = SimpleNamespace(apply=True, action='activate', previous_ops_sha256=old['opsSha256'], previous_profile_sha256=c.canonical_hash(old),
                baseline='mock', baseline_sha256='mock', restore_evidence='mock', restore_sha256='mock', inventory_sha256='9' * 64, dispatch_sha256='a' * 64)
            def private_write(path, value, **kwargs):
                with Path(path).open('x', encoding='utf-8', newline='\n') as file: file.write(value)
            def command(arguments, **kwargs):
                if 'stop' in arguments: events.append('stop')
                elif 'up' in arguments:
                    events.append('start')
                    expected = 'ssh-localhost' if rollback and events.count('start') == 2 else 'private-ip'
                    self.assertEqual(json.loads((config / 'app.json').read_text())['APP_BASE_URL'], c.ORIGINS[expected])
                    if fail == 'start': raise ValueError('Synthetic startup failure')
                elif arguments == ['nginx', '-T']: return 'mock protected site'
                elif 'config' not in arguments: raise AssertionError('Unexpected server call')
                self.assertNotIn('seed', arguments); self.assertNotIn('migrate', arguments)
                return ''
            def select(value):
                events.append('select'); holder['profile'] = value
                (config / 'active-profile.json').write_text(json.dumps({'profilePath': str(c.profile_path(value)), 'profileSha256': c.canonical_hash(value)}))
            def route(value): events.append('closed' if value == p.maintenance_site() else 'protected'); site.write_text(value)
            def backup_result(value): events.append('backup'); return {'directory': 'mock-backup'}
            def verify_backup(*args):
                events.append('backup-verified')
                if fail == 'backup': raise ValueError('Wrong backup identity')
            for name, value in (('verify_release', lambda *args: candidate_report), ('lock', lambda: nullcontext()), ('active_profile', lambda **kwargs: holder['profile']),
                ('private_file', lambda path, **kwargs: Path(path)), ('private_directory', lambda path: Path(path)), ('write_private', private_write),
                ('db_container', lambda: None), ('load_configs', lambda: configs()), ('run', command), ('preserve_ops_bundle', lambda *args: Path(c.bundle_path('a' * 40, 'f' * 64))),
                ('preserve_profile', lambda value: c.profile_path(value)), ('select_profile', select), ('read_profile', lambda *args: old)):
                stack.enter_context(patch.object(c, name, side_effect=value))
            stack.enter_context(patch.object(c, 'psql', side_effect=AssertionError('SQL forbidden')))
            stack.enter_context(patch.object(p, 'evidence_file', side_effect=lambda path, fingerprint, kind: {'baseline': baseline, 'restore': restored, 'inventory': network, 'dispatch': dispatch}[kind]))
            stack.enter_context(patch.object(p, 'observe_inventory')); stack.enter_context(patch.object(p, 'replace_site', side_effect=route))
            stack.enter_context(patch.object(p, 'readiness')); stack.enter_context(patch.object(p, 'install_lease', side_effect=lambda state: events.append('lease')))
            stack.enter_context(patch.object(p, 'credentials', side_effect=lambda path: events.append('credentials') or 'abcdefabcdef.htpasswd'))
            stack.enter_context(patch.object(p.secrets, 'token_hex', return_value='abcdefabcdef'))
            stack.enter_context(patch.object(p.backup, 'create_backup', side_effect=backup_result)); stack.enter_context(patch.object(p.upgrade, 'verified_backup', side_effect=verify_backup))
            stack.enter_context(patch.object(p.upgrade, 'runtime_containers', return_value=[])); stack.enter_context(patch.object(p.upgrade, 'validate_writers'))
            if fail:
                with self.assertRaises(ValueError): p.activate(args)
                state = json.loads((config / p.STATE_NAME).read_text())
                self.assertEqual(state['phase'], 'failed-closed-recovery-required'); self.assertEqual(site.read_text(), p.maintenance_site())
                if fail == 'backup': self.assertNotIn('credentials', events); self.assertNotIn('start', events)
            else:
                value = p.activate(args); self.assertIn('pending', value['mode'])
                self.assertLess(events.index('backup-verified'), events.index('credentials')); self.assertLess(events.index('select'), events.index('start')); self.assertLess(events.index('lease'), events.index('protected'))
                if rollback:
                    value = p.rollback(args); self.assertFalse(value['dataRollback']); self.assertTrue(value['previewClosed'])
                    for name in p.SNAPSHOTS: self.assertEqual((config / name).read_text(), original_files[name])
                    self.assertEqual(site.read_text(), p.maintenance_site())
            return events

    def test_mocked_activation_orders_verified_backup_profile_and_lease_before_exposure(self): self.mock_transition()
    def test_mocked_backup_failure_never_generates_credentials_or_starts_candidate(self): self.mock_transition(fail='backup')
    def test_mocked_writer_failure_stops_and_leaves_closed_proxy(self): self.mock_transition(fail='start')
    def test_mocked_rollback_restores_only_configs_and_closes_preview_no_sql(self): self.mock_transition(rollback=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
