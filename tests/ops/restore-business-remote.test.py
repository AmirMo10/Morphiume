"""Pure restore boundary/readiness/SQL canaries; never imports the remote Ops."""
import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('restore_business_remote', Path(__file__).with_name('restore-business-remote.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def request():
    return {'action': 'inspect', 'target': {'restoreProject': m.PROJECT, 'restoreRoot': m.LEGACY_ROOT.as_posix(), 'backupDirectory': m.BACKUP.as_posix(), 'baseURL': 'http://localhost:3101', 'identity': dict(m.IDENTITY), 'opsRoot': m.OPS_ROOT.as_posix(), 'recovery': {'toolSourceCommit': 'f' * 40, 'toolSha256': m.TOOL_SHA, 'fixtureSha256': 'a' * 64, 'backupManifestSha256': 'b' * 64}},
            'fixture': {'fixtureId': '12345678-1234-4123-8123-123456789abc', 'orderId': '22345678-1234-4123-8123-123456789abc', 'productId': '32345678-1234-4123-8123-123456789abc', 'phone': '+989000000001', 'baseURL': 'http://localhost:3100', 'createdAt': '2026-10-12T21:24:28.796Z',
                        'media': [{'url': '/media/42345678-1234-4123-8123-123456789abc.webp', 'sha256': 'a' * 64}],
                        'expected': {'paymentStatus': 'paid', 'stockOnHand': 2, 'stockReserved': 0, 'receipts': 1, 'shipments': 1, 'trackingCode': 'QA-TRACK-12345678', 'unitPriceIrr': '1234560'}}}


def readiness():
    req = request(); target = req['target']
    manifest = dict(m.IDENTITY); manifest.pop('accessProfileSha256')
    manifest.update(database='morphiume_staging_runtime', backupOpsSha256=m.OPS, backupStartUtc='2026-10-12T21:26:44+00:00', backupCompleteUtc='2026-10-12T21:27:00+00:00')
    ready = {k: m.IDENTITY[k] for k in ('sourceCommit', 'testedPlatformConfig', 'runtimeImageId', 'engineProofSha256')}
    ready.update(mode='restored-ready-business-acceptance-pending', project=target['restoreProject'], root=target['restoreRoot'], browserOrigin='http://localhost:3101', workerStarted=False, recoveryStartUtc='2026-10-12T21:30:00+00:00', applicationReadyUtc='2026-10-12T21:31:00+00:00', backupStartUtc=manifest['backupStartUtc'], backupCompleteUtc=manifest['backupCompleteUtc'])
    start = {'backup': target['backupDirectory'], 'sourceCommit': m.SOURCE, 'recoveryStartUtc': ready['recoveryStartUtc']}
    return ready, start, manifest, target, req['fixture']


class Contract(unittest.TestCase):
    def test_pinned_request_and_fixed_readonly_sql(self):
        target, fixture = m.validate_request(request())
        self.assertEqual(target['baseURL'], 'http://localhost:3101')
        sql = m.sql_snapshot(fixture)
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertIn("SET LOCAL statement_timeout='3s';", sql)
        self.assertIn("SET LOCAL lock_timeout='1s';", sql)
        for keyword in ('INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE ', 'CREATE ', 'DROP ', 'ALTER '):
            self.assertNotIn(keyword, sql)
        self.assertNotIn('AUTH_SECRET', sql)
        self.assertNotIn('provider_ref', sql)

    def test_runtime_database_not_restore(self):
        self.assertEqual(m.DB, 'morphiume_staging_restore')
        self.assertEqual(m.ROLE, 'morphiume_restore_app')
        self.assertNotEqual(m.DB, 'morphiume_staging_runtime')

    def test_invalid_request_canaries(self):
        changes = [('action', 'cleanup'), ('action', 'worker'), ('action', 'seed')]
        for key, value in changes:
            with self.subTest(value=value):
                req = request(); req[key] = value
                with self.assertRaises(ValueError): m.validate_request(req)
        for key, value in [('baseURL', 'http://localhost:3100'), ('opsRoot', '/opt/morphiume'), ('restoreRoot', '/srv/morphiume/postgres'), ('restoreProject', 'morphiume-staging-runtime')]:
            with self.subTest(key=key):
                req = request(); req['target'][key] = value
                with self.assertRaises(ValueError): m.validate_request(req)
        for key in m.IDENTITY:
            with self.subTest(identity=key):
                req = request(); req['target']['identity'][key] = '0' * 64
                with self.assertRaises(ValueError): m.validate_request(req)

    def test_sql_fixture_contact_and_media_injection_rejected(self):
        for key, value in [('orderId', "x';DROP TABLE orders;--"), ('phone', '+989000000001\ncanary')]:
            with self.subTest(key=key):
                req = request(); req['fixture'][key] = value
                with self.assertRaises(ValueError): m.validate_request(req)
        req = request(); req['fixture']['media'][0]['url'] = '/media/../private.key'
        with self.assertRaises(ValueError): m.validate_request(req)

    def test_ready_binds_backup_and_ordered_times(self):
        m.validate_ready(*readiness())
        for key, value in [('mode', 'partial'), ('workerStarted', True), ('root', '/srv/morphiume/postgres'), ('sourceCommit', '0' * 40), ('runtimeImageId', 'sha256:' + '0' * 64), ('applicationReadyUtc', '2026-10-12T21:20:00+00:00')]:
            with self.subTest(key=key):
                args = list(readiness()); args[0][key] = value
                with self.assertRaises(ValueError): m.validate_ready(*args)
        args = list(readiness()); args[1]['backup'] += '/extra'
        with self.assertRaises(ValueError): m.validate_ready(*args)
        args = list(readiness()); args[2]['database'] = 'morphiume_staging_restore'
        with self.assertRaises(ValueError): m.validate_ready(*args)

    def test_partial_or_missing_ready_cannot_pass(self):
        for candidate in (None, {}, {'mode': 'restored-ready-business-acceptance-pending'}, ['canary']):
            with self.subTest(shape=type(candidate).__name__):
                args = list(readiness()); args[0] = candidate
                with self.assertRaises(ValueError): m.validate_ready(*args)

    def test_lowercase_project_cannot_silently_alias_legacy_root(self):
        req = request(); req['target'].pop('recovery')
        with self.assertRaises(ValueError): m.validate_request(req)

    def test_exact_completed_mapping_and_full_media_inventory(self):
        target = request()['target']
        base = {k: v for k, v in m.IDENTITY.items() if k != 'accessProfileSha256'}
        base.update(version=1, toolSha256=m.TOOL_SHA, toolSourceCommit='f' * 40, profileSha256=m.IDENTITY['accessProfileSha256'], fixtureSha256='a' * 64, backupManifestSha256='b' * 64, root=target['restoreRoot'], project=m.PROJECT, backup=target['backupDirectory'], originalRecoveryStartUtc='2026-10-12T21:27:29+00:00', preparedFileSha256={k: 'c' * 64 for k in m.PREPARED}, ciphertextSha256={'database.dump.age': 'd' * 64, 'media.tar.gz.age': 'e' * 64}, identitySha256='0' * 64, sourceMediaSha256={'private/original.png': {'sha256': '1' * 64, 'bytes': 24}, 'public/42345678-1234-4123-8123-123456789abc.webp': {'sha256': 'a' * 64, 'bytes': 74}}, workerStarted=False, automaticResume=False)
        events = [{'phase': phase, 'utc': f'2026-10-12T21:33:0{i}+00:00'} for i, phase in enumerate(m.PHASES)]
        journal = base | {'events': events, 'phase': m.PHASES[-1], 'readyRecordSha256': '2' * 64}
        ready = copy.deepcopy(base) | {'events': copy.deepcopy(events[:-1]), 'phase': m.PHASES[-2], 'mode': 'restored-ready-business-acceptance-pending', 'browserOrigin': 'http://localhost:3101', 'recoveryStartUtc': base['originalRecoveryStartUtc'], 'applicationReadyUtc': '2026-10-12T21:33:07.500+00:00', 'backupStartUtc': '2026-10-12T21:26:44+00:00', 'backupCompleteUtc': '2026-10-12T21:27:00+00:00', 'mediaSummary': {'files': 2, 'bytes': 98}}
        m.validate_recovery_records(journal, ready, target)
        for key, value in [('phase', 'failed-preserved-no-resume'), ('automaticResume', True), ('toolSourceCommit', '0' * 40), ('root', target['restoreRoot'].lower()), ('workerStarted', 0), ('version', True)]:
            with self.subTest(key=key):
                changed = copy.deepcopy(journal); changed[key] = value
                with self.assertRaises(ValueError): m.validate_recovery_records(changed, ready, target)
        changed = copy.deepcopy(journal); changed['events'] = changed['events'][1:]
        with self.assertRaises(ValueError): m.validate_recovery_records(changed, ready, target)
        changed = copy.deepcopy(journal); changed['preparedFileSha256'].pop('restore.env')
        with self.assertRaises(ValueError): m.validate_recovery_records(changed, ready, target)
        changed = copy.deepcopy(ready); changed['sourceMediaSha256']['../private.key'] = {'sha256': 'a' * 64, 'bytes': 1}
        changed_journal = copy.deepcopy(journal); changed_journal['sourceMediaSha256'] = changed['sourceMediaSha256']
        with self.assertRaises(ValueError): m.validate_recovery_records(changed_journal, changed, target)

    def test_capture_time_is_validated_separately_and_every_counter_preserved(self):
        counters = {'migrationCount': 11, 'customers': 3, 'orders': 1, 'receipts': 1, 'shipments': 1, 'reserved': 0, 'onHand': 2}
        manifest = {'businessBaseline': counters | {'capturedUtc': '2026-10-12T21:26:45.123+00:00'}, 'backupStartUtc': '2026-10-12T21:26:44+00:00', 'backupCompleteUtc': '2026-10-12T21:26:48+00:00'}
        m.validate_business_baseline(counters, manifest)
        for key in counters:
            with self.subTest(counter=key):
                changed = dict(counters); changed[key] += 1
                with self.assertRaises(ValueError): m.validate_business_baseline(changed, manifest)
        for captured in ('2026-10-12T21:26:43+00:00', '2026-10-12T21:26:49+00:00', '2026-10-12T22:26:45+01:00', '2026-10-12T21:26:45', 'invalid', None):
            with self.subTest(timestamp=captured):
                changed = copy.deepcopy(manifest); changed['businessBaseline']['capturedUtc'] = captured
                with self.assertRaises(ValueError): m.validate_business_baseline(counters, changed)
        for changed in (counters | {'queue': 0}, counters | {'reserved': False}, {k: v for k, v in counters.items() if k != 'customers'}):
            with self.assertRaises(ValueError): m.validate_business_baseline(changed, manifest)
        changed = copy.deepcopy(manifest); changed['businessBaseline']['unknown'] = 0
        with self.assertRaises(ValueError): m.validate_business_baseline(counters, changed)


if __name__ == '__main__':
    unittest.main()
