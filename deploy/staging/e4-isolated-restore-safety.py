#!/usr/bin/env python3
"""Pure disposable-file/command-mock tests; never invoke a daemon or database."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
import py_compile
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('e4_isolated_restore', Path(__file__).with_name('e4-isolated-restore.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
PG = 'postgres:18.6-bookworm@sha256:' + 'a' * 64
IMAGE = 'sha256:' + 'b' * 64
FIXTURE_URL = '/media/01234567-1234-1234-1234-0123456789ab.webp'


def docker_item(service, old=True, root=None, project=None):
    root = root or m.OLD_ROOT
    project = project or m.OLD_PROJECT
    labels = {'com.docker.compose.service': service, 'com.docker.compose.project': project,
              'morphiume.restore.scope': 'runtime'}
    if service == 'app': labels['org.opencontainers.image.revision'] = m.OLD_SOURCE if old else m.SOURCE
    return {'Id': ('a' if service == 'app' else 'd') * 64, 'Name': '/' + project + '-' + service + '-1',
      'Image': IMAGE if service == 'app' else 'sha256:' + 'c' * 64,
      'Config': {'Labels': labels, 'User': '1001:1001' if service == 'app' else '999:999', 'Image': IMAGE if service == 'app' else PG},
      'State': {'Status': 'exited' if old else 'running', 'Running': not old, 'Paused': False, 'Restarting': False,
                'ExitCode': 143 if old and service == 'app' else 0, 'StartedAt': '2026-10-12T21:00:00Z', 'FinishedAt': '2026-10-12T22:30:00Z', 'OOMKilled': False},
      'Mounts': [{'Type': 'bind', 'Source': str(root / ('media' if service == 'app' else 'postgres')),
                  'Destination': '/app/media' if service == 'app' else '/var/lib/postgresql', 'Mode': '', 'RW': True, 'Propagation': 'rprivate'}],
      'NetworkSettings': {'Networks': {project + '_restore': {}, **({project + '_edge': {}} if service == 'app' else {})}},
      'HostConfig': {'PortBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3002'}]} if service == 'app' else {},
        'ReadonlyRootfs': True, 'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges:true'], 'PidsLimit': 128,
        'Memory': (1280 if service == 'app' else 768) * 1024**2, 'NanoCpus': 1500000000 if service == 'app' else 1000000000}}


def inventory():
    def meta(path, uid=0, mode='0o700'):
        return {'path': str(path), 'uid': uid, 'gid': uid, 'mode': mode, 'device': 1, 'inode': 2}
    files = [meta(m.OLD_ROOT / name, uid, '0o600') | {'bytes': 1, 'sha256': 'e' * 64} for name, uid in m.OLD_FILES.items()]
    return {'observedAt': '2026-10-13T08:34:47.455683Z', 'mutation': False, 'sql': False,
        'root': str(m.OLD_ROOT), 'project': m.OLD_PROJECT, 'tcp3002ListenerAbsent': True,
        'rootMetadata': meta(m.OLD_ROOT), 'storageMetadata': [meta(m.OLD_ROOT / 'postgres', 999), meta(m.OLD_ROOT / 'media', 1001, '0o750')],
        'files': files, 'containers': [m.container_view(docker_item('app')), m.container_view(docker_item('db'))]}


class Safety(unittest.TestCase):
    def test_default_plan_never_imports_or_runs(self):
        with patch.object(m, 'import_ops', side_effect=AssertionError('import forbidden')):
            result = m.main(types.SimpleNamespace(apply=False))
        self.assertFalse(result['serverMutation'])
        self.assertFalse(result['workerStarted'])

    def test_duplicate_and_nonfinite_json_rejected(self):
        for text in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}'):
            with self.subTest(text=text), self.assertRaises(ValueError): m.parse(text)

    def test_actual_inventory_schema_positive(self):
        x = inventory()
        self.assertEqual(m.inventory_shape(x), x)
        self.assertEqual(len(m.validate_old_actual(x, [docker_item('app'), docker_item('db')], PG, {'runtimeImageId': IMAGE})), 2)

    def test_inventory_unknown_field_rejected(self):
        x = inventory(); x['approved'] = True
        with self.assertRaises(ValueError): m.inventory_shape(x)

    def test_inventory_root_case_alias_rejected(self):
        x = inventory(); x['root'] = str(m.OLD_ROOT).lower()
        with self.assertRaises(ValueError): m.inventory_shape(x)

    def test_missing_additional_duplicate_container_rejected(self):
        x = inventory()
        for items in ([docker_item('app')], [docker_item('app'), docker_item('db'), docker_item('app')], [docker_item('app'), docker_item('app')]):
            with self.subTest(count=len(items)), self.assertRaises(ValueError): m.validate_old_actual(x, items, PG, {'runtimeImageId': IMAGE})

    def test_running_paused_restarting_exit_oom_rejected(self):
        for key, value in [('Running', True), ('Paused', True), ('Restarting', True), ('ExitCode', 137), ('OOMKilled', True)]:
            items = [docker_item('app'), docker_item('db')]; items[0]['State'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): m.validate_old_actual(inventory(), items, PG, {'runtimeImageId': IMAGE})

    def test_wrong_image_source_user_and_project_rejected(self):
        for key in ('image', 'source', 'user', 'project'):
            items = [docker_item('app'), docker_item('db')]
            if key == 'image': items[0]['Image'] = 'sha256:' + 'f' * 64
            if key == 'source': items[0]['Config']['Labels']['org.opencontainers.image.revision'] = m.SOURCE
            if key == 'user': items[0]['Config']['User'] = '0:0'
            if key == 'project': items[0]['Config']['Labels']['com.docker.compose.project'] = 'other'
            with self.subTest(key=key), self.assertRaises(ValueError): m.validate_old_actual(inventory(), items, PG, {'runtimeImageId': IMAGE})

    def test_configured_pg_digest_rejected_even_if_inventory_matches(self):
        items = [docker_item('app'), docker_item('db')]; items[1]['Config']['Image'] = 'postgres:latest'
        x = inventory(); x['containers'] = [m.container_view(i) for i in items]
        with self.assertRaises(ValueError): m.validate_old_actual(x, items, PG, {'runtimeImageId': IMAGE})

    def test_public_port_and_host_db_port_rejected_even_if_trusted_record_matches(self):
        for service in ('app', 'db'):
            items = [docker_item('app'), docker_item('db')]
            item = items[0 if service == 'app' else 1]
            item['HostConfig']['PortBindings'] = {'3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '3002'}]}
            x = inventory(); x['containers'] = [m.container_view(i) for i in items]
            with self.subTest(service=service), self.assertRaises(ValueError): m.validate_old_actual(x, items, PG, {'runtimeImageId': IMAGE})

    def test_wrong_old_mount_and_network_rejected_even_if_record_matches(self):
        for key in ('mount', 'network'):
            items = [docker_item('app'), docker_item('db')]
            if key == 'mount': items[1]['Mounts'][0]['Source'] = '/srv/morphiume/postgres'
            else: items[1]['NetworkSettings']['Networks'] = {'morphiume-staging_database': {}}
            x = inventory(); x['containers'] = [m.container_view(i) for i in items]
            with self.subTest(key=key), self.assertRaises(ValueError): m.validate_old_actual(x, items, PG, {'runtimeImageId': IMAGE})

    def test_original_and_derived_media_positive(self):
        snapshot = {'private/original': {'sha256': '1' * 64, 'bytes': 12}, 'public/' + FIXTURE_URL[7:]: {'sha256': '2' * 64, 'bytes': 10}}
        m.fixture_media({'media': [{'url': FIXTURE_URL, 'sha256': '2' * 64}]}, snapshot)
        self.assertEqual(sum(x['bytes'] for x in snapshot.values()), 22)

    def test_missing_tampered_duplicate_or_traversal_fixture_rejected(self):
        base = {'url': FIXTURE_URL, 'sha256': '2' * 64}
        snapshot = {'public/' + FIXTURE_URL[7:]: {'sha256': '2' * 64, 'bytes': 10}}
        cases = [([base], {}), ([dict(base, sha256='3' * 64)], snapshot), ([base, base], snapshot), ([dict(base, url='/media/../x.webp')], snapshot)]
        for fixture, files in cases:
            with self.subTest(case=len(fixture)), self.assertRaises(ValueError): m.fixture_media({'media': fixture}, files)

    def test_cache_prefix_blocks_existing_and_dangling_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); prefix = root / 'unused-bytecode-cache'
            prefix.mkdir()
            with self.assertRaises(ValueError): m.cache_guard(root)
            prefix.rmdir(); prefix.symlink_to(root / 'absent')
            with self.assertRaises(ValueError): m.cache_guard(root)

    def test_cache_guard_executes_source_not_timestamp_valid_stale_pyc(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(sys, 'pycache_prefix', None):
            root = Path(directory); source = root / 'cached.py'
            source.write_text("VALUE='old'\n"); stamp = source.stat().st_mtime
            py_compile.compile(str(source), doraise=True)
            source.write_text("VALUE='new'\n"); os.utime(source, (stamp, stamp))
            def load(name):
                spec = importlib.util.spec_from_file_location(name, source)
                module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
                return module.VALUE
            self.assertEqual(load('baseline_stale'), 'old')
            m.cache_guard(root)
            self.assertEqual(load('verified_source'), 'new')
            self.assertFalse((root / 'unused-bytecode-cache').exists())

    def test_fresh_immutable_resource_and_no_host_db_boundary(self):
        root = Path('/fresh'); project = 'new-restore'
        class C:
            PG_IMAGE = PG
            def runtime_image(self, _): return IMAGE
        items = [docker_item('app', False, root, project), docker_item('db', False, root, project)]
        m.fresh_owned(C(), None, items, {}, project, root)
        for key, value in [('ReadonlyRootfs', False), ('Memory', 0), ('NanoCpus', 0), ('PidsLimit', 0), ('CapDrop', [])]:
            bad = copy.deepcopy(items); bad[0]['HostConfig'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): m.fresh_owned(C(), None, bad, {}, project, root)

    def test_fresh_worker_or_original_storage_rejected(self):
        class C:
            PG_IMAGE = PG
            def runtime_image(self, _): return IMAGE
        root = Path('/fresh'); project = 'new'
        for key in ('service', 'mount'):
            items = [docker_item('app', False, root, project)]
            if key == 'service': items[0]['Config']['Labels']['com.docker.compose.service'] = 'worker'
            else: items[0]['Mounts'][0]['Source'] = '/srv/morphiume/staging/runtime/media'
            with self.subTest(key=key), self.assertRaises(ValueError): m.fresh_owned(C(), None, items, {}, project, root)

    def exercise(self, failure=None):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); config = base / 'config'; config.mkdir()
            root = base / 'new'; jroot = base / 'journal'
            deployed = {'sourceCommit': m.SOURCE}; (config / 'deployed-release.json').write_text(json.dumps(deployed))
            (config / 'deploy.env').write_text('reviewed env')
            identity = base / 'identity'; identity.write_bytes(b'test-identity')
            args = types.SimpleNamespace(operation_id='01234567-1234-4567-8567-0123456789ab', restore_project='morphiume-runtime-restore-20261013t090000z-012345',
                profile_sha256='1' * 64, tool_sha256='2' * 64, tool_source_commit='3' * 40, ops_source_commit='4' * 40,
                old_inventory_sha256='5' * 64, fixture_sha256='6' * 64, fixture_marker_sha256='7' * 64,
                backup_manifest_sha256='8' * 64, identity_sha256=m.sha(identity.read_bytes()))
            configs = {'app.json': {'AUTH_SECRET': 'same-auth', 'ADMIN_AUTH_SECRET': 'same-admin', 'MOCK_CONTROL_SECRET': 'same-control'}}
            context = {'root': root, 'journalRoot': jroot, 'configs': configs, 'runtimeProfile': {'profile': 'ssh-localhost'},
                'deployed': deployed, 'oldBefore': ['retained'], 'old': {}, 'identity': identity, 'media': {}, 'fixture': {},
                'backup': base / 'backup', 'manifest': {'ciphertextSha256': {}, 'backupStartUtc': '2026-10-13T08:00:00Z', 'backupCompleteUtc': '2026-10-13T08:01:00Z'}}
            release = dict.fromkeys(m.IDENTITY, 'a' * 64); release['sourceCommit'] = m.SOURCE
            calls = []; decrypt = []
            class C:
                PROJECT = 'morphiume-staging-runtime'; OPS_ROOT = base / 'ops'; PG_IMAGE = PG
                def runtime_image(self, _): return IMAGE
                def write_private(self, path, body, **_):
                    with Path(path).open('x') as stream: stream.write(body)
                def run(self, command, **_):
                    calls.append(command)
                    if command[-2:] == ['config', '--quiet'] and failure == 'config': raise ValueError('private secret should never escape')
                    if 'up' in command and command[-1] == 'db' and failure == 'dbinit': raise subprocess.TimeoutExpired('private', 1)
                    if 'exec' in command: return 'morphiume_staging_restore|morphiume_restore_owner'
                    if command[:2] == ['docker', 'ps']: return 'a' * 64 + '\n' + 'd' * 64
                    if command[:2] == ['docker', 'inspect']: return json.dumps([docker_item('app', False, root, args.restore_project), docker_item('db', False, root, args.restore_project)])
                    return ''
                def active_profile(self, **_): return context['runtimeProfile']
                def load_configs(self): return configs
                def private_file(self, path): return Path(path)
                def compose_environment(self, *_): return 'reviewed env'
                def db_container(self): return 'unchanged-original-metadata'
                def validate_app_containers(self, *_args, **kwargs): self_stopped.append(kwargs.get('running'))
            class R:
                RESTORE_DB = 'morphiume_staging_restore'; RESTORE_OWNER = 'morphiume_restore_owner'
                def restore_config(self, app, password, **_): return dict(app, DATABASE_URL='new-restored-role', APP_BASE_URL='http://localhost:3101')
                def decrypt_database(self, *values):
                    decrypt.append(values)
                    if failure == 'database': raise ValueError('private database failure')
                def validate_restored_containers(self, *_): pass
            self_stopped = []
            class Response:
                status = 200
                def __enter__(self): return self
                def __exit__(self, *_): return False
            media_error = tarfile.ReadError('private archive path') if failure == 'media' else None
            with patch.object(m, 'CONFIG', config), patch.object(m, 'metadata', side_effect=lambda path, *_: Path(path)), patch.object(m.os, 'chown'), \
                 patch.object(m, 'restored_media', side_effect=media_error, return_value={'files': 2, 'bytes': 20}), \
                 patch.object(m, 'old_pair_after', return_value=['changed'] if failure == 'old-drift' else ['retained']), \
                 patch.object(m.urllib.request, 'urlopen', return_value=Response()):
                if failure:
                    with self.assertRaisesRegex(ValueError, '^E4 restore failed; retain partial state, no replay or old consumer resume$'):
                        m.execute(args, C(), R(), release, context)
                else:
                    result = m.execute(args, C(), R(), release, context)
                    self.assertFalse(result['workerStarted']); self.assertEqual(result['businessAcceptance'], 'pending')
            state = json.loads((root / 'recovery-journal.json').read_text())
            self.assertFalse(state['automaticResume']); self.assertFalse(state['workerStarted'])
            self.assertEqual(state['phase'], 'failed-preserved' if failure else 'ready')
            self.assertEqual(json.loads((root / 'app.json').read_text())['AUTH_SECRET'], 'same-auth')
            self.assertEqual(len(decrypt), 0 if failure in ('config', 'dbinit') else 1)
            self.assertTrue((jroot / '01-namespace-started.json').exists())
            forbidden = {'down', 'rm', 'restart', 'seed', 'migrate', 'build', 'pull'}
            self.assertFalse(any(forbidden.intersection(command) for command in calls))
            self.assertFalse(any(m.OLD_PROJECT in command for command in calls))
            self.assertLessEqual(sum('stop' in command for command in calls), 1)
            if not failure:
                self.assertEqual(self_stopped, [False])
                self.assertTrue((root / 'recovery-ready.json').exists())
                self.assertFalse((root / 'recovery-accepted.json').exists())
            else: self.assertFalse((root / 'recovery-ready.json').exists())
            return state

    def test_success_has_finite_stage_journal_and_no_acceptance_or_old_start(self): self.exercise()
    def test_config_failure_starts_no_container_and_preserves_journal(self): self.exercise('config')
    def test_dbinit_timeout_never_restores_and_never_retries(self): self.exercise('dbinit')
    def test_database_restore_failure_does_not_start_app(self): self.exercise('database')
    def test_tar_error_is_redacted_and_failed_journal_retained(self): self.exercise('media')
    def test_old_pair_drift_prevents_ready_and_stops_only_new_pair(self): self.exercise('old-drift')

    def test_replay_exclusive_namespace_fails_before_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'same'; root.mkdir()
            # Exclusive mkdir is the namespace primitive; no exist_ok/reset.
            with self.assertRaises(FileExistsError): root.mkdir(mode=0o700)
        source = Path(m.__file__).read_text()
        self.assertNotIn('r.main(', source)
        self.assertNotIn('restore.main(', source)
        self.assertIn("root.mkdir(mode=0o700)", source)

    def preflight_case(self, failure=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'runtime'; config = Path(directory) / 'config'; config.mkdir(); root.mkdir()
            (root / 'restore').mkdir(); oldroot = root / 'restore' / m.OLD_ROOT.name; oldroot.mkdir()
            if failure == 'unknown-partial': (root / 'restore' / 'unknown-partial').mkdir()
            release = dict.fromkeys(m.IDENTITY, 'a' * 64)
            release.update(sourceCommit=m.SOURCE, opsSha256=m.OPS, runtimeImageId=IMAGE)
            profile = release | {'profile': 'ssh-localhost'}
            deployed = release | {'accessProfileSha256': 'a' * 64}
            (config / 'deployed-release.json').write_text(json.dumps(deployed)); (config / 'deploy.env').write_text('exact env')
            if failure == 'pending': (config / 'active-profile.json.new').write_text('partial')
            if failure == 'transition': (config / 'preview-transition.json').write_text('{"phase":"running"}')
            backup = root / 'backups' / '20201013T084014Z-8e5fa45e'; backup.mkdir(parents=True)
            for name in ('backup-manifest.json', 'database.dump.age', 'media.tar.gz.age'): (backup / name).write_bytes(b'cipher')
            if failure == 'partial-backup': (backup / 'database.dump.age.partial').write_bytes(b'partial')
            snapshot = {'private/original': {'sha256': '1' * 64, 'bytes': 12}, 'public/' + FIXTURE_URL[7:]: {'sha256': '2' * 64, 'bytes': 10}}
            manifest = release | {'database': 'morphiume_staging_runtime', 'backupOpsSha256': m.OPS,
                'businessBaseline': {'migrationCount': 13}, 'databaseBytesEstimate': 1000, 'mediaBytes': 22,
                'backupStartUtc': '2020-10-13T08:40:14Z', 'backupCompleteUtc': '2020-10-13T08:40:21Z',
                'ciphertextSha256': {'database.dump.age': m.sha(b'cipher'), 'media.tar.gz.age': m.sha(b'cipher')}}
            fixture = {'media': [{'url': FIXTURE_URL, 'sha256': '2' * 64}]}
            marker = release | {'mode': 'retained-E4-T25-accepted', 'fixtureSha256': 'f' * 64,
                'fixtureCreatedUtc': '2020-10-13T08:12:37.704Z', 'acceptedUtc': '2020-10-13T08:38:22Z', 'nativeT25Accepted': True}
            if failure == 'old-backup': manifest['sourceCommit'] = m.OLD_SOURCE
            if failure == 'history': manifest['businessBaseline']['migrationCount'] = 11
            if failure == 'marker': marker['accessProfileSha256'] = 'c' * 64
            if failure == 'backup-before-acceptance': marker['acceptedUtc'] = '2020-10-13T09:00:00Z'
            if failure == 'ciphertext': manifest['ciphertextSha256']['database.dump.age'] = '0' * 64
            if failure == 'media': manifest['mediaBytes'] = 10
            tool = root / 'tools'; tool.mkdir()
            key = tool / 'test-only-key'; key.write_bytes(b'test-identity')
            args = types.SimpleNamespace(operation_id='01234567-1234-4567-8567-0123456789ab', restore_project='morphiume-runtime-restore-20201013t090000z-012345',
                old_inventory=str(tool / 'old-restore-inventory.json'), old_inventory_sha256='e' * 64,
                profile_sha256='a' * 64, backup_directory=str(backup), backup_manifest_sha256='b' * 64,
                fixture=str(config / 'retained-fixture-e4.json'), fixture_sha256='f' * 64,
                fixture_marker=str(config / 'retained-t25-e4.json'), fixture_marker_sha256='c' * 64,
                identity='/dev/shm/morphiume-runtime-restore-012345abcdef/identity', identity_sha256=m.sha(b'test-identity'))
            calls = []
            class C:
                PROJECT = 'morphiume-staging-runtime'; OPS_ROOT = Path('/reviewed-ops')
                def exact_path(self, path): return Path(path)
                def run(self, command, **_):
                    calls.append(command)
                    if command[0] == 'ss': return 'occupied' if failure == 'port' else ''
                    if command[0] == 'systemctl': return 'active\n\ninactive\n\ninactive\n\ninactive\n' if failure == 'timer' else '\n\n'.join(['inactive'] * 4) + '\n'
                    if command[:3] == ['docker', 'network', 'ls']: return 'existing' if failure == 'network' else ''
                    if command[:2] == ['docker', 'ps']: return 'a\nb' if '--all' in command else ('writer' if failure == 'writers' else '')
                    if command[:2] == ['docker', 'inspect']: return '[{},{}]'
                    return ''
                def active_profile(self, **_): return profile
                def canonical_hash(self, _): return 'a' * 64
                def match_mapping(self, value, expected): m.need(all(value[k] == expected[k] for k in m.IDENTITY if k != 'accessProfileSha256'))
                def load_configs(self): return {'app.json': {}}
                def db_container(self): return 'read-only metadata'
                def private_file(self, path): return Path(path)
                def compose_environment(self, *_): return 'exact env'
                def runtime_image(self, _): return IMAGE
                def validate_app_containers(self, _items, _release, running): m.need(running is False)
            class R:
                MAX_MEDIA = 16 * 1024**3
                def validate_backup_path(self, path): return Path(path)
                def validate_backup_identity(self, value, expected): C().match_mapping(value, expected)
            def protected(path, _expected):
                if str(path).endswith('backup-manifest.json'): return manifest
                if str(path).endswith('retained-fixture-e4.json'): return fixture
                if str(path).endswith('retained-t25-e4.json'): return marker
                return {'private-inventory': True}
            def fake_meta(path, *_args, **_kwargs):
                return key if str(path) == args.identity else Path(path)
            with patch.object(m, 'ROOT', root), patch.object(m, 'CONFIG', config), patch.object(m, 'OLD_ROOT', oldroot), \
                 patch.object(m, 'metadata', side_effect=fake_meta), patch.object(m, 'private_json', side_effect=protected), \
                 patch.object(m, 'old_pair', return_value=['retained']), patch.object(m, 'media_snapshot', return_value=snapshot), \
                 patch.object(m.os, 'statvfs', return_value=types.SimpleNamespace(f_bavail=0 if failure == 'disk' else 9999999, f_frsize=4096)):
                if failure:
                    with self.assertRaises(ValueError): m.preflight(args, C(), R(), release, tool)
                else:
                    result = m.preflight(args, C(), R(), release, tool)
                    self.assertEqual(result['manifest']['businessBaseline']['migrationCount'], 13)
            self.assertFalse(any({'up', 'stop', 'down', 'run', 'exec', 'rm'}.intersection(command) for command in calls))
            self.assertFalse((root / 'restore' / args.restore_project).exists())

    def test_preflight_positive_no_mutations(self): self.preflight_case()
    def test_preflight_unknown_partial_namespace_rejected(self): self.preflight_case('unknown-partial')
    def test_preflight_occupied_port_rejected(self): self.preflight_case('port')
    def test_preflight_existing_network_rejected(self): self.preflight_case('network')
    def test_preflight_active_timer_rejected(self): self.preflight_case('timer')
    def test_preflight_running_writers_rejected(self): self.preflight_case('writers')
    def test_preflight_old_backup_not_relabeled(self): self.preflight_case('old-backup')
    def test_preflight_wrong_history_rejected(self): self.preflight_case('history')
    def test_preflight_wrong_profile_marker_rejected(self): self.preflight_case('marker')
    def test_preflight_backup_predates_acceptance_rejected(self): self.preflight_case('backup-before-acceptance')
    def test_preflight_tampered_ciphertext_rejected(self): self.preflight_case('ciphertext')
    def test_preflight_partial_ciphertext_rejected(self): self.preflight_case('partial-backup')
    def test_preflight_insufficient_disk_rejected(self): self.preflight_case('disk')
    def test_preflight_media_size_mismatch_rejected(self): self.preflight_case('media')


if __name__ == '__main__':
    unittest.main(verbosity=2)
