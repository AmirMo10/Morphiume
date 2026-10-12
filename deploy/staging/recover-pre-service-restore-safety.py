"""Pure recovery/identity/stage guards plus actual daemon-free Compose names."""
import copy
import hashlib
import importlib.util
import json
import os
import py_compile
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import ExitStack, nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BASE = Path(__file__).resolve().parent
specification = importlib.util.spec_from_file_location('pre_service_recovery', BASE / 'recover-pre-service-restore.py')
t = importlib.util.module_from_spec(specification); specification.loader.exec_module(t)
sys.path.insert(0, str(BASE / 'runtime'))
import contract as future
import restore as future_restore


def args():
    return SimpleNamespace(apply=False, source=t.APP_SOURCE, ops_sha256=t.OLD_OPS, project=t.PROJECT,
        restore_root=t.ROOT / 'restore' / t.LEGACY_NAME, backup_directory=t.ROOT / 'backups' / t.BACKUP_NAME,
        identity=t.IDENTITY, quiescent_window_released=True, profile_sha256='a' * 64, fixture_sha256='b' * 64,
        backup_manifest_sha256='c' * 64, tool_sha256='d' * 64, tool_source='e' * 40)


class RecoverySafety(unittest.TestCase):
    def setUp(self):
        local = BASE / '.local'; local.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='recovery-safety-', dir=local)
        self.addCleanup(self.temporary.cleanup); self.base = Path(self.temporary.name).resolve()

    def test_default_plan_never_reads_secret_imports_or_server(self):
        with patch.object(t, 'load_old_ops', side_effect=AssertionError('Import')), patch.object(t, 'verify_tool', side_effect=AssertionError('State')):
            result = t.main(args())
        self.assertFalse(result['serverMutation']); self.assertFalse(result['workerStarted'])

    def test_case_is_exact_legacy_root_lowercase_project_and_old_binding(self):
        value = args(); t.validate_case(value)
        for field, replacement in (('source', 'f' * 40), ('ops_sha256', 'f' * 64), ('project', t.LEGACY_NAME),
             ('restore_root', t.ROOT / 'restore' / t.PROJECT), ('backup_directory', t.ROOT / 'backups' / 'other'),
             ('identity', Path('/tmp/identity')), ('quiescent_window_released', False), ('fixture_sha256', 'bad')):
            invalid = copy.copy(value); setattr(invalid, field, replacement)
            with self.subTest(field=field), self.assertRaises(ValueError): t.validate_case(invalid)

    def test_published_tool_source_hash_and_exact_record_are_required(self):
        value = args(); record = {'sourceCommit': value.tool_source, 'toolSha256': value.tool_sha256, 'applicationSourceCommit': t.APP_SOURCE, 'opsSha256': t.OLD_OPS}
        t.validate_tool_binding(record, value, value.tool_sha256)
        for invalid in ({}, record | {'extra': True}, record | {'sourceCommit': 'f' * 40}, record | {'opsSha256': 'f' * 64}):
            with self.assertRaises(ValueError): t.validate_tool_binding(invalid, value, value.tool_sha256)
        with self.assertRaises(ValueError): t.validate_tool_binding(record, value, 'f' * 64)

    def prepared(self):
        root = self.base / 'runtime' / 'restore' / t.LEGACY_NAME
        root.mkdir(parents=True); (root / 'postgres').mkdir(); (root / 'media').mkdir()
        for name in t.PREPARED: (root / name).write_text('synthetic')
        return root

    def test_entire_empty_directories_and_exact_prepared_set_not_merely_pgversion(self):
        root = self.prepared()
        with patch.object(t, 'metadata', side_effect=lambda path, *a, **k: Path(path)):
            t.validate_partial(root)
            for name in ('recovery-journal.json', 'restore.recovery.env', 'recovery-ready.json', 'unknown'):
                extra = root / name; extra.write_text('retained')
                with self.assertRaises(ValueError): t.validate_partial(root)
                extra.unlink()
            for directory in ('postgres', 'media'):
                file = root / directory / 'partial-without-PG_VERSION'; file.write_text('partial')
                with self.assertRaises(ValueError): t.validate_partial(root)
                file.unlink()

    def test_existing_metadata_rejects_link_owner_group_mode_and_type(self):
        file = self.base / 'file'; file.write_text('public synthetic')
        with self.assertRaises(ValueError): t.exact(Path('relative'))
        metadata = SimpleNamespace(st_uid=0, st_gid=0, st_mode=stat.S_IFREG | 0o600, st_nlink=1)
        with patch.object(Path, 'stat', return_value=metadata): t.metadata(file, 0, 0o600)
        for change in ({'st_uid': 1}, {'st_gid': 1}, {'st_mode': 0o644}, {'st_nlink': 2}):
            with patch.object(Path, 'stat', return_value=SimpleNamespace(**(vars(metadata) | change))), self.assertRaises(ValueError): t.metadata(file, 0, 0o600)

    def test_new_env_lowercases_project_only_and_preserves_physical_root(self):
        root = t.ROOT / 'restore' / t.LEGACY_NAME; image = 'sha256:' + '1' * 64
        result = t.environment(t.PROJECT, root, image, Path('/reviewed-old-ops'))
        self.assertIn('MORPHIUME_RESTORE_PROJECT=' + t.PROJECT, result)
        self.assertIn('MORPHIUME_RESTORE_ROOT=' + str(root), result)
        self.assertNotIn('PASSWORD', result)
        with self.assertRaises(ValueError): t.environment(t.LEGACY_NAME, root, image, Path('/reviewed-old-ops'))

    def test_future_guard_rejects_uppercase_and_accepts_lowercase_namespace(self):
        root = self.base / 'runtime'
        with patch.object(future, 'ROOT', root):
            future_restore.validate_restore_path(root / 'restore' / t.PROJECT)
            with self.assertRaises(ValueError): future_restore.validate_restore_path(root / 'restore' / t.LEGACY_NAME)
        source = (BASE / 'runtime/restore.py').read_text()
        self.assertIn("strftime('%Y%m%dt%H%M%Sz')", source)

    def test_actual_explicit_compose_project_name_counterexample_without_daemon(self):
        if not shutil.which('docker'): self.skipTest('Compose CLI unavailable; no actual name validation claimed')
        environment = future.command_environment(['docker']) | {'MORPHIUME_IMAGE': 'sha256:' + '1' * 64,
            'MORPHIUME_OPS_ROOT': BASE.as_posix(), 'MORPHIUME_RESTORE_PROJECT': t.PROJECT,
            'MORPHIUME_RESTORE_ROOT': str(t.ROOT / 'restore' / t.LEGACY_NAME)}
        for name, expected in ((t.LEGACY_NAME, 1), (t.PROJECT, 0)):
            command = ['docker', 'compose', '--project-name', name, '-f', str(BASE / 'runtime/compose.restore.yaml'), 'config', '--quiet', '--no-env-resolution']
            result = subprocess.run(command, capture_output=True, env=environment, timeout=30)
            self.assertEqual(result.returncode, expected, 'Quiet synthetic project-name validation differs')
            if expected: self.assertIn('invalid project name', result.stderr.decode().lower())

    def test_old_ops_bytes_and_exact_members_verified_before_any_import(self):
        root = self.base / 'runtime'; values = {name: hashlib.sha256(b'public synthetic\n').hexdigest() for name in t.OLD_FILES}
        digest = hashlib.sha256(t.canonical(values).encode()).hexdigest()
        bundle = root / 'releases' / t.APP_SOURCE / 'ops-bundles' / digest / 'ops'
        for name in t.OLD_FILES:
            path = bundle / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('public synthetic\n')
        (bundle / 'ops-manifest.json').write_text(json.dumps(values))
        (bundle / t.OLD_FILES[0]).write_text('tampered\n')
        with patch.object(t, 'ROOT', root), patch.object(t, 'OLD_OPS', digest), patch.object(t, 'metadata', side_effect=lambda path, *a, **k: Path(path)), patch.object(t.importlib.util, 'spec_from_file_location', side_effect=AssertionError('No code import before hashes')):
            with self.assertRaises(ValueError): t.load_old_ops()

    def test_stale_valid_pyc_is_not_read_and_old_cache_is_not_deleted(self):
        source = self.base / 'source.py'; source.write_bytes(b"VALUE = 'cachebad'\n")
        with patch.object(sys, 'pycache_prefix', None), patch.object(sys, 'dont_write_bytecode', False):
            cache = Path(py_compile.compile(str(source), doraise=True)); before = cache.read_bytes()
            stamp = source.stat(); source.write_bytes(b"VALUE = 'verified'\n"); os.utime(source, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
            def execute(name):
                specification = importlib.util.spec_from_file_location(name, source)
                module = importlib.util.module_from_spec(specification); specification.loader.exec_module(module)
                return module.VALUE
            self.assertEqual(execute('synthetic_cached'), 'cachebad')
            prefix = self.base / 'unused-bytecode-cache'; t.disable_old_ops_caches(prefix)
            self.assertEqual(execute('synthetic_verified'), 'verified')
            self.assertFalse(prefix.exists()); self.assertEqual(cache.read_bytes(), before)

    def test_existing_or_unknown_cache_prefix_rejected(self):
        with self.assertRaises(ValueError): t.disable_old_ops_caches(self.base / 'other')
        prefix = self.base / 'unused-bytecode-cache'; prefix.mkdir()
        with self.assertRaises(ValueError): t.disable_old_ops_caches(prefix)

    def run_forward(self, fail=None, failure_exception=ValueError):
        root = self.prepared(); data = root.parent.parent
        report = {'sourceCommit': t.APP_SOURCE, 'testedPlatformConfig': 'sha256:' + '1' * 64,
            'candidateManifestDigest': 'sha256:' + '2' * 64, 'archiveSha256': '3' * 64, 'opsSha256': t.OLD_OPS,
            'runtimeImageId': 'sha256:' + '4' * 64, 'engineProofSha256': '5' * 64}
        value = args(); value.restore_root = root
        hashes = {name: t.sha((root / name).read_bytes()) for name in t.PREPARED}
        context = {'root': root, 'hashes': hashes, 'sourceMediaSha256': {}, 'start': {'recoveryStartUtc': '2026-10-12T21:27:29+00:00', 'backup': str(value.backup_directory)},
            'manifest': {'backupStartUtc': '2026-10-12T21:26:44+00:00', 'backupCompleteUtc': '2026-10-12T21:26:45+00:00', 'ciphertextSha256': {'database.dump.age': 'a'*64, 'media.tar.gz.age':'b'*64}}}
        identity = self.base / 'identity'; identity.write_bytes(b'synthetic-identity'); context['identitySha256'] = t.sha(identity.read_bytes())
        events = []; write_events = []
        def write(path, content):
            with Path(path).open('x') as file: file.write(content)
            write_events.append(Path(path).name)
        def command(arguments, **kwargs):
            if 'stop' in arguments: events.append('withdraw-app'); return ''
            state = json.loads((root / 'recovery-journal.json').read_text())
            phase = state['phase']; events.append(phase)
            if fail == phase: raise ValueError('Synthetic operation failure')
            self.assertNotIn('seed', arguments); self.assertNotIn('pull', arguments)
            if 'ps' in arguments: return 'synthetic-app\nsynthetic-db'
            if 'inspect' in arguments: return '[]'
            if 'exec' in arguments: return 'morphiume_staging_restore|morphiume_restore_owner'
            return ''
        c = SimpleNamespace(RELEASE_KEYS=future.RELEASE_KEYS, OPS_ROOT=self.base / 'old-ops', runtime_image=lambda report: report['runtimeImageId'],
            write_private=write, private_file=lambda path: Path(path), run=command)
        def decrypt(*a):
            phase = json.loads((root / 'recovery-journal.json').read_text())['phase']; events.append(phase)
            if fail == phase: raise ValueError('Synthetic decrypt failure')
        r = SimpleNamespace(RESTORE_DB='morphiume_staging_restore', RESTORE_OWNER='morphiume_restore_owner',
            decrypt_database=decrypt, validate_restored_containers=lambda *a: None)
        def media(*a):
            phase = json.loads((root / 'recovery-journal.json').read_text())['phase']; events.append(phase)
            if fail == phase: raise failure_exception('Synthetic private archive failure')
            return {'files': 1, 'bytes': 10}
        with patch.object(t, 'ROOT', data), patch.object(t, 'IDENTITY', identity), patch.object(t, 'media_restore', side_effect=media), patch.object(t.urllib.request, 'urlopen', return_value=nullcontext(SimpleNamespace(status=200))):
            if fail:
                with self.assertRaises(ValueError): t.forward(value, c, r, report, context)
                state = json.loads((root / 'recovery-journal.json').read_text())
                self.assertEqual(state['phase'], 'failed-preserved-no-resume'); self.assertEqual(state['failedAfterPhase'], fail)
                self.assertFalse((root / 'recovery-ready.json').exists())
                if fail in ('app-start-started', 'readiness-started'): self.assertIn('withdraw-app', events)
            else:
                result = t.forward(value, c, r, report, context)
                self.assertFalse(result['workerStarted']); self.assertFalse(result['automaticResume'])
                state = json.loads((root / 'recovery-journal.json').read_text())
                self.assertEqual(state['phase'], 'ready-business-acceptance-pending')
                self.assertEqual(state['readyRecordSha256'], t.sha((root / 'recovery-ready.json').read_bytes()))
                self.assertEqual(json.loads((root / 'recovery-ready.json').read_text())['recoveryStartUtc'], context['start']['recoveryStartUtc'])
                with self.assertRaises(FileExistsError): t.forward(value, c, r, report, context)
            self.assertEqual(hashes, {name: t.sha((root / name).read_bytes()) for name in t.PREPARED})
            self.assertEqual(report['opsSha256'], t.OLD_OPS)
            self.assertEqual(write_events[0], 'recovery-journal.json')
            self.assertEqual(write_events[1], 'restore.recovery.env')
        return events

    def test_forward_stage_journal_precedes_every_operation_and_preserves_old_bytes(self):
        events = self.run_forward()
        first = [events.index(stage + '-started') for stage in t.STAGES[:-1]]
        self.assertEqual(first, sorted(first))

    def test_database_failure_retains_state_never_starts_media_or_app(self):
        events = self.run_forward('database-restore-started')
        self.assertNotIn('media-restore-started', events); self.assertNotIn('app-start-started', events)

    def test_app_failure_withdraws_only_restore_app_no_auto_resume(self):
        events = self.run_forward('app-start-started')
        self.assertEqual(events[-1], 'withdraw-app')

    def test_tar_extract_failure_records_stage_and_never_starts_app(self):
        events = self.run_forward('media-restore-started', tarfile.ReadError)
        self.assertNotIn('app-start-started', events)

    def test_eof_extract_failure_records_stage_and_never_starts_app(self):
        events = self.run_forward('media-restore-started', EOFError)
        self.assertNotIn('app-start-started', events)

    def test_hash_guard_refuses_changed_private_backup_fixture_without_values(self):
        path = self.base / 'protected.json'; path.write_bytes(b'synthetic-private-input')
        c = SimpleNamespace(private_file=lambda path, **k: Path(path))
        self.assertEqual(t.hashed_private(c, path, t.sha(path.read_bytes())), path.read_bytes())
        with self.assertRaises(ValueError): t.hashed_private(c, path, 'f' * 64)

    def preflight_case(self, failure=None):
        base = self.base / ('preflight-' + (failure or 'valid')); data = base / 'runtime'; config = base / 'config'
        root = data / 'restore' / t.LEGACY_NAME; root.mkdir(parents=True); config.mkdir()
        (root / 'postgres').mkdir(); (root / 'media').mkdir()
        identity = base / 'identity'; identity.write_bytes(b'synthetic-identity')
        report = {'sourceCommit': t.APP_SOURCE, 'testedPlatformConfig': 'sha256:'+'1'*64, 'candidateManifestDigest': 'sha256:'+'2'*64,
            'archiveSha256':'3'*64, 'opsSha256':t.OLD_OPS, 'runtimeImageId':'sha256:'+'4'*64, 'engineProofSha256':'5'*64}
        profile = report | {'profile':'ssh-localhost'}
        runtime_app = {'DATABASE_URL':'postgresql://morphiume_runtime_app:'+'1'*64+'@db:5432/morphiume_staging_runtime',
            'PAYMENT_PROVIDER':'mock','SMS_PROVIDER':'mock','APP_BASE_URL':'http://localhost:3100','MEDIA_ROOT':'/app/media',
            'AUTH_SECRET':'2'*64,'ADMIN_AUTH_SECRET':'3'*64,'MOCK_CONTROL_SECRET':'4'*64}
        for name, value in (('db_bootstrap_password','7'*64), ('db_owner_password','8'*64), ('db_app_password','9'*64)): (root/name).write_text(value)
        (root/'app.json').write_text(json.dumps(future_restore.restore_config(runtime_app,'9'*64)))
        backup = data/'backups'/t.BACKUP_NAME; backup.mkdir(parents=True)
        ciphertext = {'database.dump.age':b'fake database ciphertext','media.tar.gz.age':b'fake media ciphertext'}
        for name, value in ciphertext.items(): (backup/name).write_bytes(value)
        manifest = report | {'database':future.DATABASE,'databaseBytesEstimate':1000,'mediaBytes':10,
            'ciphertextSha256':{name:t.sha(value) for name,value in ciphertext.items()}}
        (backup/'backup-manifest.json').write_text(json.dumps(manifest))
        identifier='11111111-1111-4111-8111-111111111111'
        (data/'media'/'private').mkdir(parents=True); (data/'media'/'public').mkdir()
        (data/'media'/'private'/identifier).write_bytes(b'orig'); (data/'media'/'public'/(identifier+'.webp')).write_bytes(b'webp')
        manifest['mediaBytes']=8; (backup/'backup-manifest.json').write_text(json.dumps(manifest))
        fixture_file = config/'retained-fixture.json'; fixture_file.write_text(json.dumps({'media':[{'url':'/media/'+identifier+'.webp','sha256':t.sha(b'webp')}]}))
        (root/'recovery-start.json').write_text(json.dumps({'sourceCommit':t.APP_SOURCE,'backup':str(backup),'recoveryStartUtc':'2026-10-12T21:27:29+00:00'}))
        commands = []
        def command(arguments):
            commands.append(arguments)
            if failure=='writers' and 'label=com.docker.compose.project='+future.PROJECT in arguments:return 'unexpected-writer'
            if failure=='containers' and 'label=morphiume.restore.scope=runtime' in arguments:return 'unexpected-restore'
            if failure=='network' and 'network' in arguments:return 'unexpected-network'
            return ''
        bundle = base/'old-ops'
        c = SimpleNamespace(ROOT=data, CONFIG=config, PROJECT=future.PROJECT, OPS_ROOT=bundle, exact_path=t.exact,
            private_file=lambda path,**k:Path(path),private_directory=lambda path:Path(path),
            canonical_hash=future.canonical_hash,active_profile=lambda **k:profile,match_mapping=future.match_mapping,
            load_configs=lambda:{'app.json':runtime_app},db_container=lambda:None,run=command,runtime_image=lambda release:release['runtimeImageId'])
        r = SimpleNamespace(validate_backup_path=lambda path:path,validate_backup_identity=future_restore.validate_backup_identity,
            restore_config=future_restore.restore_config,MAX_MEDIA=future_restore.MAX_MEDIA)
        with patch.object(t,'ROOT',data),patch.object(t,'IDENTITY',identity),patch.object(t,'metadata',side_effect=lambda path,*a,**k:Path(path)),patch.object(t.os,'statvfs',create=True,return_value=SimpleNamespace(f_bavail=2**35,f_frsize=1)):
            value = args(); value.restore_root=root;value.backup_directory=backup;value.identity=identity
            value.profile_sha256=future.canonical_hash(profile);value.fixture_sha256=t.sha(fixture_file.read_bytes());value.backup_manifest_sha256=t.sha((backup/'backup-manifest.json').read_bytes())
            (root/'restore.env').write_text(t.environment(t.PROJECT,root,report['runtimeImageId'],bundle).replace('MORPHIUME_RESTORE_PROJECT='+t.PROJECT,'MORPHIUME_RESTORE_PROJECT='+t.LEGACY_NAME))
            if failure=='fixture':value.fixture_sha256='f'*64
            if failure=='backup':(backup/'database.dump.age').write_bytes(b'tampered ciphertext')
            if failure=='profile':value.profile_sha256='f'*64
            if failure=='config':(root/'app.json').write_text(json.dumps(future_restore.restore_config(runtime_app,'a'*64)))
            if failure:
                with self.assertRaises(ValueError):t.preflight(value,c,r,report)
                self.assertFalse((root/'recovery-journal.json').exists())
            else:
                context=t.preflight(value,c,r,report)
                self.assertEqual(context['hashes'],{name:t.sha((root/name).read_bytes()) for name in t.PREPARED})
                self.assertEqual(context['identitySha256'],t.sha(identity.read_bytes()))
        self.assertTrue(all(arguments[:2] in (['docker','ps'],['docker','network']) for arguments in commands))

    def test_full_preflight_is_readonly_and_binds_preserved_state(self):
        self.preflight_case()

    def test_preflight_rejects_writers_containers_network_and_tampered_evidence(self):
        for failure in ('writers','containers','network','fixture','backup','profile','config'):
            with self.subTest(failure=failure):self.preflight_case(failure)

    def test_private_original_and_public_derived_inventory_and_fixture_are_distinct(self):
        source=self.base/'media';(source/'private').mkdir(parents=True);(source/'public').mkdir()
        identifier='11111111-1111-4111-8111-111111111111'
        original=source/'private'/identifier;derived=source/'public'/(identifier+'.webp')
        original.write_bytes(b'original');derived.write_bytes(b'webp')
        c=SimpleNamespace(exact_path=t.exact);r=SimpleNamespace(MAX_MEDIA=2**34)
        snapshot=t.snapshot_media(c,r,source)
        fixture={'media':[{'url':'/media/'+identifier+'.webp','sha256':t.sha(b'webp')}]}
        self.assertEqual(len(snapshot),2);t.validate_fixture_media(fixture,snapshot);t.validate_media_snapshot(snapshot,snapshot)
        for path in (original,derived):
            before=path.read_bytes();path.write_bytes(b'tampered')
            with self.assertRaises(ValueError):t.validate_media_snapshot(t.snapshot_media(c,r,source),snapshot)
            if path==derived:
                with self.assertRaises(ValueError):t.validate_fixture_media(fixture,t.snapshot_media(c,r,source))
            path.write_bytes(before);path.unlink()
            with self.assertRaises(ValueError):t.validate_media_snapshot(t.snapshot_media(c,r,source),snapshot)
            path.write_bytes(before)
        for url in ('/media/../private/'+identifier,'/media/%2e%2e/x','http://localhost:3100/media/'+identifier+'.webp','/media/'+identifier+'.webp?x=1','/media/'+identifier+'.webp#x'):
            with self.assertRaises(ValueError):t.validate_fixture_media({'media':[{'url':url,'sha256':t.sha(b'webp')}]},snapshot)


if __name__ == '__main__':
    unittest.main(verbosity=2)
