"""Portable observer guards; no SSH, service, credential or database access."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / 'deploy/staging/demo-catalog/observe.py'


class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SOURCE), run_name='portable_observer_test')

    def value(self):
        return {'operationId': '922f56af-c7f8-4da9-bd17-d79d31730777', 'releaseOperationId': '70b288a4-2a77-43a3-9f76-1566aa2deb22',
                'request': {'path': '/etc/morphiume-staging-runtime/ui-release-requests/812eadbf-45b5-4627-ad4d-9e8422efee89.json', 'sha256': '9' * 64},
                'expectedStateSha256': 'c' * 64, 'backup': {'directory': '/srv/morphiume/staging/runtime/backups/20261019T122615Z-5d25d037', 'manifestSha256': 'a' * 64,
                'ciphertextSha256': {'database.dump.age': 'b' * 64, 'media.tar.gz.age': 'd' * 64}}}

    def test_default_does_not_read_stdin_or_check_server_files(self):
        with patch('sys.argv', [str(SOURCE)]), patch('sys.stdin', None):
            actual = self.module['main']()
        self.assertEqual(actual, {'mode': 'unexecuted-demo-catalog-observer', 'serverMutation': False, 'credentialsExported': False})

    def test_exact_input_paths_and_distinct_catalog_operation(self):
        value = self.value()
        self.assertEqual(self.module['inputs'](value), value)
        changes = [lambda v: v.update(operationId=v['releaseOperationId']),
                   lambda v: v['request'].update(path='/etc/passwd'),
                   lambda v: v['request'].update(path='/etc/morphiume-staging-runtime/ui-release-requests/../app.json'),
                   lambda v: v['request'].update(sha256='invalid'),
                   lambda v: v['backup'].update(directory='/srv/morphiume/postgres'),
                   lambda v: v['backup']['ciphertextSha256'].update(unexpected='a' * 64),
                   lambda v: v.update(expectedStateSha256='a' * 63)]
        for change in changes:
            candidate = self.value()
            change(candidate)
            with self.assertRaises(ValueError):
                self.module['inputs'](candidate)

    def test_python_and_node_capability_and_source_pins_are_identical(self):
        contract = SOURCE.with_name('contract.mjs').read_text(encoding='utf8')
        for key in ('SOURCE', 'PROFILE', 'CAPABILITY', 'IMAGE', 'SITE'):
            self.assertIn(f"export const {key} = '{self.module[key]}';", contract)

    def test_backup_rehashes_actual_ciphertext_and_rejects_changed_bytes(self):
        # Metadata guards need Linux root and are exercised only by the actual
        # root observer. This portable test replaces only that metadata layer.
        function = self.module['verify_backup']
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ('database.dump.age', 'media.tar.gz.age'):
                (directory / name).write_bytes((name + ' encrypted fixture').encode())
            hashes = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in ('database.dump.age', 'media.tar.gz.age')}
            now = self.module['dt'].datetime.now(self.module['dt'].timezone.utc)
            candidate = {'sourceCommit': self.module['SOURCE'], 'opsSha256': '6' * 64}
            manifest = candidate | {'database': 'morphiume_staging_runtime', 'backupOpsSha256': candidate['opsSha256'], 'backupCompleteUtc': now.isoformat(), 'ciphertextSha256': hashes}
            body = json.dumps(manifest).encode()
            (directory / 'backup-manifest.json').write_bytes(body)
            value = {'directory': str(directory), 'manifestSha256': hashlib.sha256(body).hexdigest(), 'ciphertextSha256': hashes}
            def raw(path, expected):
                result = Path(path).read_bytes()
                self.assertEqual(hashlib.sha256(result).hexdigest(), expected)
                return result
            control = types.SimpleNamespace(raw=raw, parse=json.loads, need=self.module['need'])
            with patch.dict(function.__globals__, checked=lambda path, *args, **kwargs: Path(path)):
                observed = function(value, control, candidate)
                self.assertEqual(observed['databaseCiphertextSha256'], hashes['database.dump.age'])
                (directory / 'media.tar.gz.age').write_bytes(b'changed')
                with self.assertRaises(ValueError):
                    function(value, control, candidate)

    def test_observer_uses_completed_six_pair_guard_and_no_phase_dispatch(self):
        source = SOURCE.read_text(encoding='utf8')
        self.assertIn("state['phase'] == 'complete-timers-active-enabled'", source)
        self.assertIn("request | {'preservedPairCount': request['preservedPairCount'] + 1}", source)
        self.assertNotIn('extra=state', source)
        self.assertNotIn("['systemctl', 'start'", source)
        self.assertNotIn('create_backup(', source)
        self.assertNotIn('backup.main(', source)
        self.assertNotIn('save(h,', source)
        self.assertNotIn('control.main(', source)


if __name__ == '__main__':
    unittest.main()
