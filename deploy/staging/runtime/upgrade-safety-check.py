"""Synthetic upgrade contract/order/failure tests; all server commands mocked."""
import hashlib
import json
import tempfile
import unittest
from contextlib import ExitStack, nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import contract as c
import upgrade as u


def identity(letter):
    return {'sourceCommit': letter * 40, 'testedPlatformConfig': 'sha256:' + letter * 64,
            'candidateManifestDigest': 'sha256:' + 'c' * 64, 'archiveSha256': 'd' * 64, 'opsSha256': 'e' * 64}


def writers(release):
    return [{'Image': release['testedPlatformConfig'], 'Config': {'User': '1001:1001', 'Labels': {
        'com.docker.compose.service': name, 'org.opencontainers.image.revision': release['sourceCommit']}},
        'State': {'Running': True, 'Health': {'Status': 'healthy'}}} for name in ('app', 'worker')]


class UpgradeSafety(unittest.TestCase):
    def setUp(self):
        self.old, self.new = identity('a'), identity('b')
        self.deployed = self.old | {'database': c.DATABASE, 'project': c.PROJECT}
        checksum = hashlib.sha256(b'synthetic-ciphertext').hexdigest()
        self.manifest = self.old | {'database': c.DATABASE, 'backupStartUtc': '2026-10-12T00:00:00Z',
            'backupCompleteUtc': '2026-10-12T00:00:01Z', 'ciphertextSha256': {name: checksum for name in ('database.dump.age', 'media.tar.gz.age')}}

    def test_default_and_unreviewed_modes_make_no_server_calls(self):
        with patch.object(c, 'run', side_effect=AssertionError('Server command')), patch.object(c, 'verify_release', side_effect=AssertionError('Release command')):
            self.assertFalse(u.main(SimpleNamespace(apply=False))['seedInvoked'])
            with self.assertRaises(ValueError): u.main(SimpleNamespace(apply=True, migration_reviewed=False))

    def test_previous_identity_and_partial_state_guards(self):
        u.validate_transition(self.deployed, self.old, self.new)
        for bad in ({}, self.deployed | {'database': 'morphiume_staging'}, self.deployed | {'testedPlatformConfig': self.new['testedPlatformConfig']}):
            with self.assertRaises(ValueError): u.validate_transition(bad, self.old, self.new)
        with self.assertRaises(ValueError): u.validate_transition(self.deployed, self.old, self.new, partial=True)
        with self.assertRaises(ValueError): u.validate_transition(self.deployed, self.old, self.old)

    def test_writer_identity_and_admin_privilege_boundary(self):
        u.validate_writers(writers(self.old), self.old)
        for change in (writers(self.new), writers(self.old)[:1]):
            with self.assertRaises(ValueError): u.validate_writers(change, self.old)
        wrong = writers(self.old); wrong[0]['Config']['User'] = '0:0'
        with self.assertRaises(ValueError): u.validate_writers(wrong, self.old)

    def test_backup_identity_completion_and_ciphertext_guards(self):
        u.validate_backup_manifest(self.manifest, self.old)
        for value in (None, {}, self.manifest | {'database': 'morphiume_staging'}, self.manifest | {'sourceCommit': self.new['sourceCommit']},
                      self.manifest | {'backupCompleteUtc': None}, self.manifest | {'ciphertextSha256': {}}, self.manifest | {'ciphertextSha256': {'database.dump.age': True}}):
            with self.assertRaises(ValueError): u.validate_backup_manifest(value, self.old)

    def test_old_migration_checksums_cannot_change_or_disappear(self):
        before = {'database': c.DATABASE, 'migrations': [{'name': '0001.sql', 'checksum': 'a' * 64}]}
        u.validate_migrations(before, before | {'migrations': before['migrations'] + [{'name': '0002.sql', 'checksum': 'b' * 64}]})
        for after in (before | {'database': 'morphiume_staging'}, before | {'migrations': []}, before | {'migrations': [{'name': '0001.sql', 'checksum': 'c' * 64}]}):
            with self.assertRaises(ValueError): u.validate_migrations(before, after)

    def run_mocked_upgrade(self, backup_failure=False, partial=False):
        local = c.OPS_ROOT / '.local'; local.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='upgrade-safety-', dir=local) as location:
            base = Path(location).resolve(); data = base / 'runtime'; config = base / 'config'
            data.mkdir(); config.mkdir()
            old_ops, new_ops = (data / 'releases' / source['sourceCommit'] / 'ops' for source in (self.old, self.new))
            old_ops.mkdir(parents=True); new_ops.mkdir(parents=True)
            (config / 'deployed-release.json').write_text(json.dumps(self.deployed))
            (config / 'deploy.env').write_text(f"MORPHIUME_IMAGE={self.old['testedPlatformConfig']}\nMORPHIUME_OPS_ROOT={old_ops}\n")
            if partial: (config / 'upgrading.json').write_text('{}')
            directory = data / 'backups' / '20261012T000000Z-abcdef12'; directory.mkdir(parents=True)
            manifest = self.manifest | ({'sourceCommit': self.new['sourceCommit']} if backup_failure else {})
            (directory / 'backup-manifest.json').write_text(json.dumps(manifest))
            for name in ('database.dump.age', 'media.tar.gz.age'): (directory / name).write_bytes(b'synthetic-ciphertext')
            args = SimpleNamespace(apply=True, migration_reviewed=True, source=self.new['sourceCommit'], config_id=self.new['testedPlatformConfig'],
                previous_source=self.old['sourceCommit'], previous_config_id=self.old['testedPlatformConfig'],
                previous_manifest_digest=self.old['candidateManifestDigest'], previous_archive_sha256=self.old['archiveSha256'], previous_ops_sha256=self.old['opsSha256'])
            events = []
            state = {'candidateStarted': False}
            def command(arguments, **kwargs):
                if arguments[:3] == ['docker', 'ps', '--all']: return 'synthetic-app\nsynthetic-worker'
                if arguments[:2] == ['docker', 'inspect']: return json.dumps(writers(self.new if state['candidateStarted'] else self.old))
                environment = Path(arguments[arguments.index('--env-file') + 1]) if '--env-file' in arguments else None
                if 'stop' in arguments: events.append('stop-new' if environment.name == 'deploy.candidate.env' else 'stop-old')
                if arguments[-1] in ('check-owner', 'check-app', 'migrate'):
                    self.assertEqual(environment.name, 'deploy.candidate.env')
                    self.assertIn(self.new['testedPlatformConfig'], environment.read_text())
                    events.append(arguments[-1])
                if 'up' in arguments:
                    state['candidateStarted'] = True; events.append('start-new')
                self.assertNotEqual(arguments[-1], 'seed')
                return ''
            def private_write(path, value, **kwargs):
                with Path(path).open('x', encoding='utf-8') as file: file.write(value)
            def create_backup(report):
                self.assertEqual(report['sourceCommit'], self.old['sourceCommit']); events.append('backup-old')
                return {'directory': str(directory)}
            original_stat = Path.stat
            def stat(path, *args, **kwargs):
                if path == config / 'history': return SimpleNamespace(st_uid=0, st_mode=0o700)
                return original_stat(path, *args, **kwargs)
            history = {'database': c.DATABASE, 'migrations': [{'name': '0001.sql', 'checksum': 'f' * 64}]}
            with ExitStack() as stack:
                for name, value in (('ROOT', data), ('CONFIG', config)):
                    stack.enter_context(patch.object(c, name, value))
                stack.enter_context(patch.object(c, 'verify_release', return_value=self.new))
                stack.enter_context(patch.object(c, 'lock', return_value=nullcontext()))
                stack.enter_context(patch.object(c, 'private_file', side_effect=lambda path, **kwargs: Path(path)))
                stack.enter_context(patch.object(c, 'write_private', side_effect=private_write))
                stack.enter_context(patch.object(c, 'db_container', return_value='synthetic-network'))
                stack.enter_context(patch.object(c, 'load_configs', return_value={}))
                stack.enter_context(patch.object(c, 'preserve_ops_bundle', return_value=new_ops))
                stack.enter_context(patch.object(c, 'run', side_effect=command))
                stack.enter_context(patch.object(u, 'verify_previous', return_value=(self.old, old_ops)))
                stack.enter_context(patch.object(u, 'migrations_snapshot', return_value=history))
                stack.enter_context(patch.object(u.backup, 'create_backup', side_effect=create_backup))
                stack.enter_context(patch.object(u.urllib.request, 'urlopen', return_value=nullcontext(SimpleNamespace(status=200))))
                stack.enter_context(patch.object(Path, 'stat', stat))
                if backup_failure or partial:
                    with self.assertRaises(ValueError): u.main(args)
                    self.assertNotIn('migrate', events); self.assertNotIn('start-new', events)
                    self.assertEqual(json.loads((config / 'deployed-release.json').read_text())['sourceCommit'], self.old['sourceCommit'])
                    if partial: self.assertEqual(events, [])
                    else: self.assertEqual(json.loads((config / 'upgrading.json').read_text())['phase'], 'failed-preserved')
                else:
                    result = u.main(args)
                    self.assertFalse(result['seedInvoked'])
                    self.assertEqual(events, ['stop-old', 'backup-old', 'check-owner', 'check-app', 'migrate', 'start-new'])
                    self.assertEqual(json.loads((config / 'deployed-release.json').read_text())['sourceCommit'], self.new['sourceCommit'])
                    self.assertFalse((config / 'upgrading.json').exists())
                    self.assertTrue((config / 'history' / (self.old['sourceCommit'] + '.json')).is_file())
                    self.assertTrue((data / 'releases' / self.new['sourceCommit'] / 'upgrade-result.json').is_file())
            return events

    def test_mocked_upgrade_orders_backup_before_candidate_migration_no_seed(self):
        self.run_mocked_upgrade()

    def test_mocked_backup_identity_failure_preserves_state_without_migration(self):
        self.run_mocked_upgrade(backup_failure=True)

    def test_mocked_partial_state_stops_before_writer_actions(self):
        self.run_mocked_upgrade(partial=True)

    def test_imported_backup_uses_report_identity_without_cli_globals(self):
        self.assertFalse(hasattr(u.backup, 'args'))
        with tempfile.TemporaryDirectory(prefix='imported-backup-', dir=c.OPS_ROOT / '.local') as location:
            base = Path(location).resolve(); root = base / 'runtime'; config = base / 'config'
            (root / 'backups').mkdir(parents=True); (root / 'media').mkdir(); config.mkdir()
            (root / 'media' / 'media.webp').write_bytes(b'abc')
            (config / 'deployed-release.json').write_text(json.dumps(self.deployed))
            (config / 'db_owner_password').write_text('e' * 64)
            stopped = writers(self.old)
            for item in stopped: item['State']['Running'] = False
            def command(arguments, **kwargs):
                if arguments[:3] == ['docker', 'ps', '--all']: return 'synthetic-app\nsynthetic-worker'
                if arguments[:2] == ['docker', 'inspect']: return json.dumps(stopped)
                if arguments == ['age', '--version']: return '1.1.1'
                raise AssertionError('Unexpected real command')
            def sql(database, query):
                self.assertEqual(database, c.DATABASE)
                return '12345' if 'pg_database_size' in query else json.dumps({'orders': 1, 'receipts': 1})
            encrypted = []
            def encryption(arguments, output, password=None):
                encrypted.append(Path(output).name)
                Path(output).write_bytes(b'synthetic-ciphertext')
            def private_write(path, value, **kwargs): Path(path).write_text(value)
            with ExitStack() as stack:
                stack.enter_context(patch.object(c, 'ROOT', root)); stack.enter_context(patch.object(c, 'CONFIG', config))
                stack.enter_context(patch.object(c, 'db_container')); stack.enter_context(patch.object(c, 'load_configs'))
                stack.enter_context(patch.object(c, 'private_file', side_effect=lambda path, **kwargs: Path(path)))
                stack.enter_context(patch.object(c, 'run', side_effect=command)); stack.enter_context(patch.object(c, 'psql', side_effect=sql))
                stack.enter_context(patch.object(c, 'write_private', side_effect=private_write)); stack.enter_context(patch.object(c, 'ops_digest', return_value=self.new['opsSha256']))
                stack.enter_context(patch.object(u.backup, 'encrypt_stream', side_effect=encryption))
                result = u.backup.create_backup(self.old)
                actual = json.loads((Path(result['directory']) / 'backup-manifest.json').read_text())
                self.assertEqual(actual['testedPlatformConfig'], self.old['testedPlatformConfig'])
                self.assertEqual(actual['sourceCommit'], self.old['sourceCommit'])
                self.assertEqual(actual['mediaBytes'], 3)
                self.assertEqual(actual['databaseBytesEstimate'], 12345)
                self.assertEqual(encrypted, ['database.dump.age.partial', 'media.tar.gz.age.partial'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
