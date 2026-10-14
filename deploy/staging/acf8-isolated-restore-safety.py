#!/usr/bin/env python3
"""Pure acf8 restore counterexamples; disposable files and mocked commands only."""
import ast
import copy
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import py_compile
import re
import subprocess
import sys
import tempfile
import tarfile
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('acf8_restore_checks', Path(__file__).with_name('acf8-isolated-restore.py'))
m = importlib.util.module_from_spec(SPEC)
exec(compile(Path(SPEC.origin).read_bytes(), SPEC.origin, 'exec'), m.__dict__)
PG = 'postgres:18.6-bookworm@sha256:' + 'a' * 64
IMAGE = m.EXPECTED['runtimeImageId']
MEDIA_URL = '/media/01234567-1234-1234-1234-0123456789ab.webp'


def history(database='morphiume_staging_runtime'):
    source = Path(__file__).with_name('upgrade-original-observation.mjs').read_text()
    pairs = re.findall(r'"([0-9]{4}_[a-z_]+\.sql)": "([a-f0-9]{64})"', source)
    return {'database': database, 'migrations': [{'name': name, 'checksum': checksum} for name, checksum in pairs]}


def docker(service, project=None, root=None, fresh=False):
    project = project or next(iter(m.OLD_RELEASES)); previous = m.OLD_RELEASES.get(project)
    root = root or previous['root']; source = m.SOURCE if fresh else previous['source']
    identity = ('a' if service == 'app' else 'd') * 64
    if previous and previous['source'].startswith('e4'): identity = ('b' if service == 'app' else 'e') * 64
    return {'Id': identity, 'Name': '/' + project + '-' + service + '-1',
      'Image': IMAGE if service == 'app' else 'sha256:' + 'c' * 64,
      'Config': {'Labels': {'com.docker.compose.service': service, 'com.docker.compose.project': project,
         'morphiume.restore.scope': 'runtime', **({'org.opencontainers.image.revision': source} if service == 'app' else {})},
         'User': '1001:1001' if service == 'app' else '999:999', 'Image': IMAGE if service == 'app' else PG},
      'State': {'Status': 'running' if fresh else 'exited', 'Running': fresh, 'Paused': False, 'Restarting': False,
         'ExitCode': 0 if fresh or service == 'db' else 143, 'StartedAt': '2020-01-01T00:00:00Z',
         'FinishedAt': '2020-01-01T00:01:00Z', 'OOMKilled': False},
      'Mounts': [{'Type': 'bind', 'Source': str(root / ('media' if service == 'app' else 'postgres')),
         'Destination': '/app/media' if service == 'app' else '/var/lib/postgresql', 'Mode': 'rw', 'RW': True, 'Propagation': 'rprivate'}],
      'NetworkSettings': {'Networks': {project + '_restore': {}, **({project + '_edge': {}} if service == 'app' else {})}},
      'HostConfig': {'PortBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3002'}]} if service == 'app' else {},
         'ReadonlyRootfs': True, 'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges:true'],
         'Memory': (1280 if service == 'app' else 768) * 1024**2,
         'NanoCpus': 1500000000 if service == 'app' else 1000000000, 'PidsLimit': 128}}


def inventory(project):
    previous = m.OLD_RELEASES[project]; root = previous['root']
    def meta(path, uid=0, mode='0o700'):
        return {'path': str(path), 'uid': uid, 'gid': uid, 'mode': mode, 'device': 1, 'inode': 2}
    files = m.OLD_FILES | previous['extraFiles']
    return {'observedAt': '2020-01-01T00:00:00Z', 'mutation': False, 'sql': False, 'project': project, 'root': str(root),
       'rootMetadata': meta(root), 'storageMetadata': [meta(root/'postgres',999), meta(root/'media',1001)],
       'files': [meta(root/name, uid, '0o600') | {'bytes': 1, 'sha256': 'a'*64} for name,uid in files.items()],
       'containers': [m.container_view(docker(service, project)) for service in ('app', 'db')],
       'tcp3002ListenerAbsent': True, 'mediaSnapshot': {}}


class RestoreChecks(unittest.TestCase):
    def test_default_plan_has_no_import_or_command(self):
        with patch.object(m, 'import_ops', side_effect=AssertionError('import')):
            result = m.main(types.SimpleNamespace(apply=False))
        self.assertFalse(result['serverMutation']); self.assertFalse(result['workerStarted'])

    def test_source_matches_exact_accepted_release_and_no_seed(self):
        self.assertEqual(m.SOURCE, 'acf8e96ee348c487df0fcefe89d568f2bf93367a')
        source = Path(m.__file__).read_text(); ast.parse(source)
        for forbidden in ('r.main(', 'restore.main(', 'down --volumes', "['seed']", 'shutil.rmtree'):
            self.assertNotIn(forbidden, source)

    def test_exact13_source_history(self):
        value = history(); m.exact_history(value)
        m.exact_history(history('morphiume_staging_restore'))
        for wrong in (value|{'database':'morphiume_staging'}, value|{'migrations':value['migrations'][:-1]},
                      value|{'migrations':value['migrations']+[{'name':'0014_new.sql','checksum':'0'*64}]}):
            with self.assertRaises(ValueError): m.exact_history(wrong)

    def test_history_duplicate_or_modified_checksum_rejected(self):
        value = history(); value['migrations'][-1] = value['migrations'][0]
        with self.assertRaises(ValueError): m.exact_history(value)
        value = history(); value['migrations'][-1]['checksum'] = '0'*64
        with self.assertRaises(ValueError): m.exact_history(value)

    def test_both_exact_stopped_pair_inventory_shapes(self):
        pairs = [inventory(project) for project in m.OLD_RELEASES]
        m.inventories_shape({'version':1,'pairs':pairs})
        self.assertEqual(len({v['id'] for p in pairs for v in p['containers']}), 4)

    def test_missing_duplicate_extra_pair_or_unknown_source_namespace_rejected(self):
        pairs = [inventory(project) for project in m.OLD_RELEASES]
        for wrong in (pairs[:1], [pairs[0],pairs[0]], pairs+[pairs[0]]):
            with self.assertRaises(ValueError): m.inventories_shape({'version':1,'pairs':wrong})
        wrong = copy.deepcopy(pairs[0]); wrong['project']='morphiume';
        with self.assertRaises(ValueError): m.inventory_shape(wrong)

    def test_old_stopped_container_metadata_preserved(self):
        for project in m.OLD_RELEASES:
            items = [docker(service, project) for service in ('app','db')]
            record = inventory(project)
            self.assertEqual(len(m.validate_old_actual(record, items, PG, {'runtimeImageId': IMAGE})), 2)

    def test_old_running_paused_restarted_or_changed_container_rejected(self):
        project = next(iter(m.OLD_RELEASES)); record = inventory(project)
        for key,value in (('Running',True),('Paused',True),('Restarting',True),('ExitCode',1)):
            wrong = copy.deepcopy(record); wrong['containers'][0]['state'][key]=value
            with self.assertRaises(ValueError): m.inventory_shape(wrong)
        items=[docker('app'),docker('db')]; items[0]['Id']='f'*64
        with self.assertRaises(ValueError): m.validate_old_actual(record,items,PG,{'runtimeImageId':IMAGE})

    def test_even_matching_inventory_cannot_allow_old_original_storage_or_public_port(self):
        for kind in ('mount','network','port','source','user'):
            items=[docker('app'),docker('db')]
            if kind=='mount': items[1]['Mounts'][0]['Source']='/srv/morphiume/postgres'
            if kind=='network': items[0]['NetworkSettings']['Networks']={'morphiume-staging_database':{}}
            if kind=='port': items[0]['HostConfig']['PortBindings']['3000/tcp'][0]['HostIp']='0.0.0.0'
            if kind=='source': items[0]['Config']['Labels']['org.opencontainers.image.revision']=m.SOURCE
            if kind=='user': items[0]['Config']['User']='root'
            record=inventory(next(iter(m.OLD_RELEASES))); record['containers']=[m.container_view(item) for item in items]
            with self.subTest(kind=kind),self.assertRaises(ValueError): m.validate_old_actual(record,items,PG,{'runtimeImageId':IMAGE})

    def test_all_old_scope_four_containers_are_required_and_unknown_scope_rejected(self):
        pairs=[inventory(project) for project in m.OLD_RELEASES]
        items=[docker(service,project) for project in m.OLD_RELEASES for service in ('app','db')]
        ids='\n'.join(item['Id'] for item in items)
        c=types.SimpleNamespace(run=lambda command: ids if command[1]=='ps' else json.dumps(items))
        with patch.object(m,'old_pair',side_effect=lambda _c,r,a: [m.container_view(x) for x in a if x['Config']['Labels']['com.docker.compose.project']==r['project']]):
            self.assertEqual(len(m.old_pairs(c,{'version':1,'pairs':pairs})),4)
            c.run=lambda command: ids+'\n'+'f'*64 if command[1]=='ps' else json.dumps(items)
            with self.assertRaises(ValueError):m.old_pairs(c,{'version':1,'pairs':pairs})

    def test_fixture_media_requires_physical_matching_hashes(self):
        item={'url':MEDIA_URL,'sha256':'2'*64}; files={'public/'+MEDIA_URL[7:]:{'sha256':'2'*64,'bytes':10}}
        m.fixture_media({'media':[item]},files)
        for raw in ([item,item],[item|{'url':'/media/../x.webp'}],[item|{'sha256':'3'*64}]):
            with self.assertRaises(ValueError):m.fixture_media({'media':raw},files)

    def test_cache_source_not_timestamp_valid_stale_pyc(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(sys,'pycache_prefix',None):
            root=Path(directory); source=root/'cached.py'; source.write_text("VALUE='old'\n"); stamp=source.stat().st_mtime
            py_compile.compile(str(source),doraise=True); source.write_text("VALUE='new'\n"); os.utime(source,(stamp,stamp))
            def load(name):
                spec=importlib.util.spec_from_file_location(name,source); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module.VALUE
            self.assertEqual(load('stale_control'),'old');m.cache_guard(root);self.assertEqual(load('guarded_source'),'new')
            self.assertFalse((root/'unused-bytecode-cache').exists())

    def test_cache_existing_or_dangling_prefix_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);prefix=root/'unused-bytecode-cache';prefix.mkdir()
            with self.assertRaises(ValueError):m.cache_guard(root)
            prefix.rmdir();prefix.symlink_to(root/'absent')
            with self.assertRaises(ValueError):m.cache_guard(root)

    def test_fresh_pair_has_bounded_immutable_resources_and_private_ports(self):
        root=Path('/fresh');project='fresh-test'
        c=types.SimpleNamespace(PG_IMAGE=PG,runtime_image=lambda _: IMAGE)
        items=[docker(service,project,root,True) for service in ('app','db')]
        m.fresh_owned(c,None,items,{},project,root)
        for key,value in (('Memory',0),('ReadonlyRootfs',False),('CapDrop',[]),('NanoCpus',0),('PidsLimit',0)):
            bad=copy.deepcopy(items);bad[0]['HostConfig'][key]=value
            with self.assertRaises(ValueError):m.fresh_owned(c,None,bad,{},project,root)

    def test_temp_key_cleanup_only_after_real_new_acceptance_and_exact_ram_namespace(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);ram=base/'key';ram.mkdir();key=ram/'identity';key.write_bytes(b'test-only-key')
            args=types.SimpleNamespace(operation_id='01234567-1234-4567-8567-0123456789ab',
                restore_project='morphiume-runtime-restore-20201013t090000z-012345',acceptance_sha256='a'*64,
                profile_sha256='b'*64,fixture_sha256='c'*64,
                identity='/dev/shm/morphiume-runtime-restore-012345abcdef/identity',identity_sha256=m.sha(key.read_bytes()))
            accepted=m.EXPECTED|{'mode':'native-business-restore-accepted','workerStarted':False,'restoreProject':args.restore_project,
                'accessProfileSha256':args.profile_sha256,'origin':'http://localhost:3101','fixtureManifestSha256':args.fixture_sha256,
                'checks':dict.fromkeys(m.CHECKS,True),'acceptedUtc':'2020-01-01T00:00:00Z'}
            c=types.SimpleNamespace(exact_path=lambda p:p,match_mapping=lambda value,_release: m.need(all(value[k]==m.EXPECTED[k] for k in m.EXPECTED)))
            with patch.object(m,'private_json',return_value=accepted),patch.object(m,'metadata',side_effect=lambda p,*_args,**_kwargs:key if Path(p).name=='identity' else ram), \
                 patch.object(Path,'iterdir',return_value=iter([Path(args.identity)])),patch.object(Path,'unlink') as unlink,patch.object(Path,'rmdir') as remove:
                result=m.cleanup_identity(args,c,m.EXPECTED)
            self.assertTrue(result['identityRemoved']);unlink.assert_called_once();remove.assert_called_once()
            accepted['checks']['mediaHashes']=False
            with patch.object(m,'private_json',return_value=accepted),patch.object(Path,'unlink',side_effect=AssertionError('unsafe delete')):
                with self.assertRaises(ValueError):m.cleanup_identity(args,c,m.EXPECTED)
            accepted['checks']['mediaHashes']=True;args.identity='/srv/morphiume/postgres/identity'
            with patch.object(m,'private_json',return_value=accepted),patch.object(Path,'unlink',side_effect=AssertionError('unsafe delete')):
                with self.assertRaises(ValueError):m.cleanup_identity(args,c,m.EXPECTED)

    def test_duplicates_and_nonfinite_private_record_rejected(self):
        for value in ('{"a":1,"a":2}','{"a":Infinity}','{"a":NaN}'):
            with self.assertRaises(ValueError):m.parse(value)


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
            context = {'root': root, 'journalRoot': jroot, 'configs': configs, 'runtimeProfile': {'profile': 'private-ip'},
                'deployed': deployed, 'oldBefore': ['retained'], 'old': {}, 'identity': identity, 'media': {}, 'fixture': {},
                'sourceHistory': history(), 'backup': base / 'backup', 'manifest': {'ciphertextSha256': {}, 'backupStartUtc': '2026-10-13T08:00:00Z', 'backupCompleteUtc': '2026-10-13T08:01:00Z'}}
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
                    if command[:2] == ['docker', 'inspect']: return json.dumps([docker('app', args.restore_project, root, True), docker('db', args.restore_project, root, True)])
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
                 patch.object(m, 'old_pairs', return_value=['changed'] if failure == 'old-drift' else ['retained']), \
                 patch.object(m, 'restored_history', return_value=history('morphiume_staging_restore')), \
                 patch.object(m.urllib.request, 'urlopen', return_value=Response()):
                if failure:
                    with self.assertRaisesRegex(ValueError, '^acf8 restore failed; retain partial state, no replay or old consumer resume$'):
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
            self.assertFalse(any(next(iter(m.OLD_RELEASES)) in command for command in calls))
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
            (root / 'restore').mkdir()
            oldreleases = {project: value | {'root': root / 'restore' / value['root'].name} for project,value in m.OLD_RELEASES.items()}
            for value in oldreleases.values(): value['root'].mkdir()
            if failure == 'unknown-partial': (root / 'restore' / 'unknown-partial').mkdir()
            release = dict.fromkeys(m.IDENTITY, 'a' * 64)
            release.update(sourceCommit=m.SOURCE, opsSha256=m.OPS, runtimeImageId=IMAGE)
            profile = release | {'profile': 'private-ip','origin':'http://192.168.240.51'}
            deployed = release | {'accessProfileSha256': 'a' * 64}
            (config / 'deployed-release.json').write_text(json.dumps(deployed)); (config / 'deploy.env').write_text('exact env')
            if failure == 'pending': (config / 'active-profile.json.new').write_text('partial')
            if failure == 'transition': (config / 'preview-transition.json').write_text('{"phase":"running"}')
            backup = root / 'backups' / '20201013T084014Z-8e5fa45e'; backup.mkdir(parents=True)
            for name in ('backup-manifest.json', 'database.dump.age', 'media.tar.gz.age'): (backup / name).write_bytes(b'cipher')
            if failure == 'partial-backup': (backup / 'database.dump.age.partial').write_bytes(b'partial')
            snapshot = {'private/original': {'sha256': '1' * 64, 'bytes': 12}, 'public/' + MEDIA_URL[7:]: {'sha256': '2' * 64, 'bytes': 10}}
            manifest = release | {'database': 'morphiume_staging_runtime', 'backupOpsSha256': m.OPS,
                'businessBaseline': {'migrationCount': 13}, 'databaseBytesEstimate': 1000, 'mediaBytes': 22,
                'backupStartUtc': '2020-10-13T08:40:14Z', 'backupCompleteUtc': '2020-10-13T08:40:21Z',
                'ciphertextSha256': {'database.dump.age': m.sha(b'cipher'), 'media.tar.gz.age': m.sha(b'cipher')}}
            fixture = {'media': [{'url': MEDIA_URL, 'sha256': '2' * 64}]}
            marker = release | {'mode': 'retained-acf8-T25-accepted', 'fixtureSha256': 'f' * 64,
                'fixtureCreatedUtc': '2020-10-13T08:12:37.704Z', 'acceptedUtc': '2020-10-13T08:38:22Z', 'nativeT25Accepted': True, 'checks':dict.fromkeys(m.NATIVE_CHECKS,True),
                'engine':'chromium','testCaseCount':1,'unexpected':0,'skipped':0,'testRetries':0}
            if failure == 'old-backup': manifest['sourceCommit'] = next(iter(m.OLD_RELEASES.values()))['source']
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
                fixture=str(config / 'retained-fixture-acf8.json'), fixture_sha256='f' * 64,
                fixture_marker=str(config / 'retained-t25-acf8.json'), fixture_marker_sha256='c' * 64,
                identity='/dev/shm/morphiume-runtime-restore-012345abcdef/identity', identity_sha256=m.sha(b'test-identity'))
            calls = []
            class C:
                PROJECT = 'morphiume-staging-runtime'; DATABASE='morphiume_staging_runtime'; OPS_ROOT = Path('/reviewed-ops')
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
                def psql(self,_database,_sql): return json.dumps(history())
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
                if str(path).endswith('retained-fixture-acf8.json'): return fixture
                if str(path).endswith('retained-t25-acf8.json'): return marker
                return {'version':1,'pairs':[inventory(project) for project in m.OLD_RELEASES]}
            def fake_meta(path, *_args, **_kwargs):
                return key if str(path) == args.identity else Path(path)
            with patch.object(m, 'ROOT', root), patch.object(m, 'CONFIG', config), patch.object(m, 'OLD_RELEASES', oldreleases), \
                 patch.object(m, 'metadata', side_effect=fake_meta), patch.object(m, 'private_json', side_effect=protected), \
                 patch.object(m, 'old_pairs', return_value=['retained']), patch.object(m, 'media_snapshot', return_value=snapshot), \
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


if __name__=='__main__':unittest.main(verbosity=2)
