"""Synthetic safety tests only: no Docker daemon, SSH, database or /srv writes."""
import copy
import configparser
import importlib.util
import json
import io
import os
import shutil
import subprocess
import tempfile
import tarfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import contract as c
import prepare
import deploy
import backup
import restore
import health
import scheduled


class Safety(unittest.TestCase):
    def test_generated_configs_and_tunnel_are_scoped(self):
        passwords, configs, connections, bootstrap = c.generate_configs()
        self.assertEqual(set(passwords), {'db_owner_password', 'db_app_password'})
        self.assertNotEqual(passwords['db_owner_password'], passwords['db_app_password'])
        self.assertEqual(len({configs[n][k] for n in ('app.json', 'worker.json') for k in ('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET')}), 6)
        c.validate_url(connections['databaseUrl'], c.APP, '127.0.0.1', 15434)
        c.validate_url(connections['migrationDatabaseUrl'], c.OWNER, '127.0.0.1', 15434)
        self.assertIn('owner-runtime@morphiume.test', bootstrap)

    def test_config_rejects_old_live_wrong_role_and_bypass_shape(self):
        _, configs, _, _ = c.generate_configs()
        for replacement in ('morphiume_staging', 'morphiume_live'):
            value = copy.deepcopy(configs['app.json'])
            value['DATABASE_URL'] = value['DATABASE_URL'].replace(c.DATABASE, replacement)
            with self.assertRaises(ValueError): c.validate_config(value, c.APP)
        for mutation in ({'PAYMENT_PROVIDER': 'zarinpal'}, {'APP_BASE_URL': 'http://192.168.240.51'},
                         {'MEDIA_ROOT': '/srv/morphiume/postgres'}, {'MIGRATION_DATABASE_URL': 'unexpected'},
                         {'DATABASE_URL': configs['migration.json']['DATABASE_URL']}):
            with self.assertRaises(ValueError): c.validate_config(configs['app.json'] | mutation, c.APP)
        same = configs['app.json'] | {'ADMIN_AUTH_SECRET': configs['app.json']['AUTH_SECRET']}
        with self.assertRaises(ValueError): c.validate_config(same, c.APP)

    def test_analytics_legacy_default_and_explicit_values_preserve_input(self):
        _, configs, _, _ = c.generate_configs()
        original = copy.deepcopy(configs)
        with patch.dict(os.environ, {'ANONYMOUS_ANALYTICS_ENABLED': 'true'}):
            for name in ('app.json', 'worker.json'):
                c.validate_config(configs[name], c.APP)
                self.assertEqual(c.analytics_flag(configs[name]), 'false')
                for flag in ('true', 'false'):
                    explicit = configs[name] | {'ANONYMOUS_ANALYTICS_ENABLED': flag}
                    c.validate_config(explicit, c.APP)
                    self.assertEqual(c.analytics_flag(explicit), flag)
            self.assertEqual(configs, original)
        for flag in (True, False, 1, None, 'TRUE', ' false', '1', 'true\0'):
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                c.validate_config(configs['app.json'] | {'ANONYMOUS_ANALYTICS_ENABLED': flag}, c.APP)
        with self.assertRaises(ValueError):
            c.validate_config(configs['app.json'] | {'ANONYMOUS_ANALYTICS_OPT_IN': 'true'}, c.APP)
        with self.assertRaises(ValueError):
            c.validate_config(configs['migration.json'] | {'ANONYMOUS_ANALYTICS_ENABLED': 'false'}, c.OWNER, migration=True)

    def test_analytics_pair_is_enforced_before_profile_and_on_private_load(self):
        _, base, _, _ = c.generate_configs()
        report = {'sourceCommit': 'a' * 40, 'testedPlatformConfig': 'sha256:' + 'b' * 64,
                  'candidateManifestDigest': 'sha256:' + 'c' * 64, 'archiveSha256': 'd' * 64,
                  'opsSha256': 'e' * 64, 'runtimeImageId': 'sha256:' + '9' * 64, 'engineProofSha256': '8' * 64}
        private_root = c.OPS_ROOT / '.local'; private_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='runtime-analytics-pair-', dir=private_root) as location:
            root = Path(location).resolve()
            self.assertTrue(root.is_relative_to(private_root.resolve()))
            class ConfigDirectory:
                def stat(self): return SimpleNamespace(st_uid=0, st_mode=0o700)
                def __truediv__(self, name): return root / name
            for app_flag, worker_flag in ((None, None), ('false', None), (None, 'false'), ('true', 'true'), ('false', 'false'),
                                          (None, 'true'), ('true', None), ('true', 'false'), ('false', 'true')):
                values = copy.deepcopy(base)
                for name, flag in (('app.json', app_flag), ('worker.json', worker_flag)):
                    if flag is not None: values[name]['ANONYMOUS_ANALYTICS_ENABLED'] = flag
                for name, value in values.items(): (root / name).write_text(json.dumps(value), encoding='utf-8')
                equal = (app_flag or 'false') == (worker_flag or 'false')
                with self.subTest(app=app_flag, worker=worker_flag), patch.object(c, 'CONFIG', ConfigDirectory()), \
                     patch.object(c, 'active_profile', return_value=None), patch.object(c, 'private_file', side_effect=lambda path, uid=0: path):
                    if equal:
                        profile = c.make_profile(report, 'ssh-localhost', values)
                        self.assertEqual(profile['configSha256']['app.json'], c.canonical_hash(values['app.json']))
                        self.assertEqual(c.load_configs(), values)
                    else:
                        with self.assertRaises(ValueError): c.make_profile(report, 'ssh-localhost', values)
                        with self.assertRaises(ValueError): c.load_configs()

    def test_every_partial_state_stops(self):
        prepare.initial_state(False, 0, False, False)
        for state in ((True, 0, False, False), (False, 1, False, False), (False, 2, True, False), (False, 0, False, True)):
            with self.assertRaises(ValueError): prepare.initial_state(*state)

    def test_default_plans_never_invoke_server_operations(self):
        with patch.object(c, 'run', side_effect=AssertionError('Server operation')), patch.object(c, 'verify_release', side_effect=AssertionError('Release operation')):
            for module in (prepare, deploy, backup, restore):
                self.assertEqual(module.main(SimpleNamespace(apply=False))['mode'], 'unexecuted-plan')
            self.assertEqual(scheduled.main('backup')['mode'], 'unexecuted-plan')

    def test_quiet_window_blocks_before_release_or_db_access(self):
        with patch.object(c, 'assert_boundaries'), patch.object(c, 'run', side_effect=AssertionError('Server operation')):
            with self.assertRaises(ValueError): c.verify_release(SimpleNamespace(quiescent_window_released=False))

    def test_reserved_mount_identity_blocks_before_filesystem_writes(self):
        with patch.object(c.os, 'name', 'posix'), patch.object(c.os, 'getuid', return_value=0, create=True), patch.object(c, 'run', return_value='/wrong-device'):
            with self.assertRaises(ValueError): c.assert_boundaries()

    def test_exact_path_rejects_relative_and_symlink(self):
        with self.assertRaises(ValueError): c.exact_path(Path('relative/runtime'))
        private_root = c.OPS_ROOT / '.local'
        private_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='runtime-safety-', dir=private_root) as location:
            root = Path(location).resolve()
            self.assertEqual(c.exact_path(root), root)
            target = root / 'target'; target.mkdir()
            link = root / 'link'
            try: link.symlink_to(target, target_is_directory=True)
            except OSError: self.skipTest('Host does not permit synthetic symlink creation')
            with self.assertRaises(ValueError): c.exact_path(link / 'private.json')

    def test_ops_fingerprint_detects_tamper(self):
        actual = c.ops_digest()
        self.assertEqual(len(actual), 64)
        with tempfile.TemporaryDirectory(prefix='runtime-fingerprint-', dir=c.OPS_ROOT / '.local') as location:
            root = Path(location)
            for name in c.OPS_FILES:
                destination = root / name; destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(c.OPS_ROOT / name, destination)
            with patch.object(c, 'OPS_ROOT', root):
                self.assertEqual(c.ops_digest(), actual)
                with (root / 'runtime/compose.yaml').open('a') as file: file.write('\n# altered\n')
                self.assertNotEqual(c.ops_digest(), actual)

    def test_node_target_and_identity_guard(self):
        helper = (c.OPS_ROOT / 'runtime/db-target.mjs').as_uri()
        script = f"""import {{validateTarget,validateIdentity}} from {json.dumps(helper)};
          let count=0;
          const good='postgresql://morphiume_runtime_app:synthetic-only@db:5432/morphiume_staging_runtime';
          if(validateTarget(good,'seed')!=='morphiume_runtime_app')throw Error('Expected role'); count++;
          for(const value of [good.replace('staging_runtime','staging'),good.replace('db:5432','db:5433'),good+'?options=x',good+'?',good+'#',good.replace('runtime_app','runtime_owner')]){{
            let denied=false;try{{validateTarget(value,'seed')}}catch{{denied=true}}if(!denied)throw Error('Wrong target accepted');count++;
          }}
          const row={{database:'morphiume_staging_runtime',role:'morphiume_runtime_app',schema_create:false}};
          validateIdentity(row,'morphiume_runtime_app');count++;
          for(const change of [{{database:'morphiume_staging'}},{{role:'postgres'}},{{schema_create:true}},{{superuser:true}},{{old_owner_member:true}},{{bypassrls:true}}]){{
            let denied=false;try{{validateIdentity({{...row,...change}},'morphiume_runtime_app')}}catch{{denied=true}}if(!denied)throw Error('Privilege boundary accepted');count++;
          }}console.log(JSON.stringify({{syntheticGuardCases:count}}));"""
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, 'Node target synthetic guard failed')
        self.assertEqual(json.loads(result.stdout)['syntheticGuardCases'], 14)

    def test_host_environment_cannot_override_reviewed_compose(self):
        with patch.dict(os.environ, {'MORPHIUME_IMAGE': 'wrong-image', 'MORPHIUME_RESTORE_ROOT': '/srv/morphiume/postgres',
                                   'COMPOSE_FILE': 'wrong.yaml', 'DOCKER_CONTEXT': 'wrong-host'}):
            result = c.command_environment(['docker', 'compose'])
            for key in ('MORPHIUME_IMAGE', 'MORPHIUME_RESTORE_ROOT', 'COMPOSE_FILE', 'DOCKER_CONTEXT'):
                self.assertNotIn(key, result)

    def test_restore_config_clones_only_current_runtime_keys(self):
        _, configs, _, _ = c.generate_configs()
        value = restore.restore_config(configs['app.json'], 'f' * 64)
        self.assertEqual(value['APP_BASE_URL'], 'http://localhost:3101')
        self.assertTrue(value['DATABASE_URL'].endswith('/morphiume_staging_restore'))
        self.assertIn('morphiume_restore_app:', value['DATABASE_URL'])
        for key in ('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET'):
            self.assertEqual(value[key], configs['app.json'][key])
        self.assertEqual(set(value), set(configs['app.json']))

    def test_restore_paths_reject_original_namespace(self):
        with tempfile.TemporaryDirectory(prefix='runtime-restore-path-', dir=c.OPS_ROOT / '.local') as location:
            root = Path(location).resolve()
            with patch.object(c, 'ROOT', root):
                expected = root / 'restore' / 'morphiume-runtime-restore-20261012t000000z-abcdef'
                self.assertEqual(restore.validate_restore_path(expected), expected)
                valid_backup = root / 'backups' / '20261012T000000Z-abcdef12'
                self.assertEqual(restore.validate_backup_path(valid_backup), valid_backup)
                for path in (root / 'postgres', root.parent / 'postgres', root / 'restore' / '../original'):
                    with self.assertRaises(ValueError): restore.validate_restore_path(path)

    def test_media_archive_rejects_escape_links_duplicate_and_size(self):
        for name in ('../postgres/data', '/absolute', 'x\\private'):
            item = tarfile.TarInfo(name); item.size = 1
            with self.assertRaises(ValueError): restore.media_member(item, set(), 0)
        item = tarfile.TarInfo('image.webp'); item.type = tarfile.SYMTYPE; item.linkname = '../postgres'
        with self.assertRaises(ValueError): restore.media_member(item, set(), 0)
        item = tarfile.TarInfo('image.webp'); item.size = 1
        with self.assertRaises(ValueError): restore.media_member(item, {'image.webp'}, 0)
        item.size = 64 * 1024 ** 2 + 1
        with self.assertRaises(ValueError): restore.media_member(item, set(), 0)
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:gz') as package:
            item = tarfile.TarInfo('./image.webp'); item.size = 3
            package.addfile(item, io.BytesIO(b'abc'))
        buffer.seek(0)
        with tempfile.TemporaryDirectory(prefix='runtime-media-', dir=c.OPS_ROOT / '.local') as location:
            root = Path(location).resolve()
            # This is an archive/path test, not a privileged ownership change;
            # Linux CI runs without the deployment root account.
            with patch.object(restore.os, 'chown', create=True):
                self.assertEqual(restore.extract_media(buffer, root), {'files': 1, 'bytes': 3})
            self.assertEqual((root / 'image.webp').read_bytes(), b'abc')

    def test_health_expected_mode_and_alert_recovery(self):
        facts = {'databaseHealthy': True, 'availableMemoryPercent': 50, 'diskUsedPercent': {'/': 40},
                 'containers': [{'service': name, 'status': 'running', 'health': 'healthy', 'oomKilled': False, 'restarts': 0} for name in ('app', 'worker')],
                 'database': {'database': c.DATABASE, 'pending': 0, 'dead': 0, 'oldestPendingSeconds': 0},
                 'appReadiness': 200, 'lastLogicalBackupAgeSeconds': 10}
        self.assertEqual(health.evaluate(facts, 'running', True)['status'], 'healthy')
        missing = facts | {'containers': facts['containers'][:1]}
        self.assertEqual(health.evaluate(missing, 'running')['status'], 'critical')
        stale = facts | {'database': facts['database'] | {'oldestPendingSeconds': 601}}
        self.assertEqual(health.evaluate(stale, 'running')['status'], 'warning')
        self.assertEqual(health.evaluate(facts | {'lastLogicalBackupAgeSeconds': None}, 'running', True)['status'], 'critical')
        self.assertEqual(health.evaluate(facts, 'maintenance')['status'], 'critical')
        stopped = facts | {'containers': [item | {'status': 'exited'} for item in facts['containers']]}
        self.assertEqual(health.evaluate(stopped, 'maintenance')['status'], 'healthy')
        self.assertEqual(health.evaluate(facts, 'running')['status'], 'healthy')

    def test_timer_requires_actual_restore_checks_and_finite_observations(self):
        release = {'sourceCommit': 'a' * 40, 'testedPlatformConfig': 'sha256:' + 'b' * 64, 'opsSha256': 'c' * 64,
                   'candidateManifestDigest': 'sha256:' + 'd' * 64, 'archiveSha256': 'e' * 64,
                   'runtimeImageId': 'sha256:' + 'f' * 64, 'engineProofSha256': '0' * 64}
        approval = release | {'mode': 'quiesce-runtime-only', 'sharedDatabaseWindowReleased': True}
        evidence = release | {'acceptedUtc': '2026-10-12T00:00:00Z', 'checks': {key: True for key in scheduled.CHECKS},
                              'observedRtoSeconds': 60, 'observedRecoveryPointGapSeconds': 3}
        scheduled.validate_acceptance(approval, evidence, release)
        with self.assertRaises(ValueError): scheduled.validate_acceptance({}, evidence, release)
        for field in scheduled.CHECKS:
            changed = evidence | {'checks': evidence['checks'] | {field: False}}
            with self.assertRaises(ValueError): scheduled.validate_acceptance(approval, changed, release)
        for value in (-1, float('nan'), float('inf'), True, 'proposed-60'):
            with self.assertRaises(ValueError): scheduled.validate_acceptance(approval, evidence | {'observedRtoSeconds': value}, release)

    def test_timer_templates_are_scoped_and_approval_gated(self):
        for action in ('health', 'backup'):
            unit = configparser.ConfigParser(interpolation=None)
            unit.read(c.OPS_ROOT / f'runtime/systemd/morphiume-runtime-{action}.service')
            self.assertEqual(unit['Unit']['ConditionPathExists'], '/etc/morphiume-staging-runtime/schedule-approved.json')
            self.assertEqual(unit['Service']['EnvironmentFile'], '/etc/morphiume-staging-runtime/deploy.env')
            self.assertIn(f'/runtime/scheduled.py {action} --apply', unit['Service']['ExecStart'])
            self.assertEqual(unit['Service']['ProtectSystem'], 'strict')
        self.assertEqual(unit['Service']['ReadWritePaths'], '/srv/morphiume/staging/runtime/backups /srv/morphiume/staging/deploy.lock')
        timer = configparser.ConfigParser(interpolation=None)
        timer.read(c.OPS_ROOT / 'runtime/systemd/morphiume-runtime-backup.timer')
        self.assertEqual(timer['Timer']['OnCalendar'], '*-*-* 03:00:00 UTC')


if __name__ == '__main__':
    unittest.main(verbosity=2)
