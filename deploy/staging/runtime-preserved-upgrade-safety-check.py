"""Mocked commands/disposable files only; no SSH, Docker, PG or HTTP call."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
import py_compile
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('preserved_upgrade', Path(__file__).with_name('runtime-preserved-upgrade.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
REAL_PROOF = m.proof


def release(source, ops, letter):
    return dict(sourceCommit=source, testedPlatformConfig='sha256:' + letter * 64,
                candidateManifestDigest='sha256:' + 'd' * 64, archiveSha256='e' * 64, opsSha256=ops,
                runtimeImageId='sha256:' + letter * 64, engineProofSha256='f' * 64)


class Harness:
    def __init__(self, root):
        self.root = Path(root)
        self.config = self.root / 'config'
        self.config.mkdir()
        self.new = release('a' * 40, m.OPS_HASH, '1')
        self.old = release(m.PREVIOUS_SOURCE, m.PREVIOUS_OPS, '2')
        self.old_profile = self.old | {'profile': 'ssh-localhost'}
        self.profile = self.old_profile
        self.selected = []
        self.calls = []
        self.backup_reports = []
        self.running = True
        self.image = self.old
        self.history_count = 11
        self.fail_service = None
        self.args = SimpleNamespace(phase='prepare', source=self.new['sourceCommit'], ops_sha256=m.OPS_HASH,
            previous_source=m.PREVIOUS_SOURCE, previous_config_id=self.old['testedPlatformConfig'],
            previous_manifest_digest=self.old['candidateManifestDigest'], previous_archive_sha256=self.old['archiveSha256'],
            previous_ops_sha256=m.PREVIOUS_OPS, previous_runtime_image_id=self.old['runtimeImageId'],
            previous_engine_proof_sha256=self.old['engineProofSha256'], previous_access_profile_sha256='b' * 64,
            tool_sha256='c' * 64, tool_source_commit='3' * 40, ops_source_commit='4' * 40,
            observer_source_commit='5' * 40, observer_sha256='6' * 64, shared_helper_sha256='7' * 64,
            operation_id='00112233-4455-4677-8899-aabbccddeeff', state_sha256=None,
            gate_sha256='8' * 64, catalog_sha256='9' * 64, before_sha256='a' * 64, after_sha256='b' * 64)
        self.args.evidence_dir = str(self.root / 'preservation' / self.args.operation_id)
        (self.root / 'releases' / self.new['sourceCommit']).mkdir(parents=True)
        self.deployed = self.old | {'database': 'morphiume_staging_runtime', 'project': 'morphiume-staging-runtime'}
        (self.config / 'deployed-release.json').write_text(json.dumps(self.deployed))
        (self.config / 'deploy.env').write_text('old-env')
        self.c = SimpleNamespace(CONFIG=self.config, ROOT=self.root, DATABASE='morphiume_staging_runtime', PROJECT='morphiume-staging-runtime',
            verify_release=lambda args: self.new, lock=lambda: contextlib.nullcontext(),
            db_container=lambda: None, resolve_ops_bundle=lambda source, ops: self.root / ops,
            runtime_image=lambda value: value['runtimeImageId'], compose=lambda image, **kwargs: ['compose', image],
            match_mapping=self.match, validate_app_containers=self.containers, active_profile=lambda **kw: self.profile,
            canonical_hash=lambda value: 'b' * 64 if value == self.old_profile else 'c' * 64,
            load_configs=lambda: {}, make_profile=lambda report, origin, configs: report | {'profile': origin},
            private_file=lambda path: Path(path), private_directory=lambda path: Path(path), exact_path=lambda path: Path(path),
            archived_image=lambda value: self.old, compose_environment=lambda image, ops, profile: 'old-env' if image == self.old['runtimeImageId'] else 'new-env',
            write_private=self.write, run=self.run, select_profile=self.select)
        self.u = SimpleNamespace(previous_identity=lambda args: {key: self.old[key] for key in ('sourceCommit','testedPlatformConfig','candidateManifestDigest','archiveSha256','opsSha256')},
            verify_previous=lambda previous: (self.old, self.root / m.PREVIOUS_OPS),
            validate_transition=self.transition, runtime_containers=lambda: [{'running': self.running, 'identity': self.image}],
            verified_backup=self.backup_manifest, migrations_snapshot=lambda: {'database': self.c.DATABASE, 'migrations': [dict(name=str(i), checksum='f' * 64) for i in range(self.history_count)]},
            atomic_replace_json=lambda path, value: Path(path).write_text(json.dumps(value)))
        self.b = SimpleNamespace(create_backup=self.backup)
        self.proof_result = {'schemaVersion': 1, 'databaseName': 'morphiume_staging_runtime', 'accepted': True, 'kind': 'runtime-preservation', 'preservedTableCount': 49, 'newTableCount': 4, 'migrationBeforeCount': 11, 'migrationAfterCount': 13,
                             **{key:'f'*64 for key in ('preservedRowsDigest','migrationPrefixDigest','oldCatalogDigest','newCatalogDigest','bindingDigest')}}

    def match(self, left, right):
        if any(left.get(key) != right[key] for key in m.RELEASE_KEYS):
            raise ValueError('identity mismatch')

    def transition(self, deployed, old, candidate):
        if any(deployed.get(key) != value for key, value in old.items()) or candidate['sourceCommit'] == old['sourceCommit']:
            raise ValueError('transition mismatch')

    def containers(self, items, report, running=True):
        if self.running is not running or self.image != report:
            raise ValueError('writer identity mismatch')

    def write(self, path, value):
        with Path(path).open('x') as file:
            file.write(value)

    def select(self, value):
        self.selected.append(value)
        self.profile = value

    def run(self, args, **kwargs):
        self.calls.append(args)
        if self.fail_service and self.fail_service in args:
            raise ValueError('protected failure')
        if args[0] == 'docker':
            if '-i' not in args and '--interactive' not in args:
                raise ValueError('Docker stdin detached')
            self.node_command = args
            self.node_input = json.loads(kwargs['input_text'])
            return json.dumps(self.proof_result)
        if 'stop' in args:
            self.running = False
        if args[-1] == 'migrate':
            self.history_count = 13
        if 'up' in args:
            self.running, self.image = True, self.new
        return ''

    def backup(self, report):
        self.backup_reports.append(report)
        if self.running:
            raise ValueError('writers running')
        destination = self.root / 'backups' / '20261013T070000Z-11223344'
        destination.mkdir(parents=True)
        manifest = self.backup_manifest(destination, report)
        (destination / 'backup-manifest.json').write_text(json.dumps(manifest))
        return {'directory': str(destination)}

    def backup_manifest(self, directory, report):
        self.match(report, self.old)
        return self.old | {'businessBaseline': {'migrationCount': 11}, 'ciphertextSha256': {'database.dump.age': '1' * 64, 'media.tar.gz.age': '2' * 64}}

    def read(self, path, expected=None):
        content = Path(path).read_bytes()
        if expected and hashlib.sha256(content).hexdigest() != expected:
            raise ValueError('raw record hash mismatch')
        return json.loads(content)

    def state(self):
        return self.read(m.record_path(self.c))

    def phase(self, phase):
        self.args.phase = phase
        if phase != 'prepare':
            self.args.state_sha256 = hashlib.sha256(m.record_path(self.c).read_bytes()).hexdigest()
        return m.execute(self.c, self.b, self.u, self.args, self.root / 'tool')


class Safety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='morphiume-preserved-pure-')
        self.h = Harness(self.temp.name)
        self.patches = [patch.object(m, 'ROOT', self.h.root), patch.object(m, 'read_json', side_effect=self.h.read),
                        patch.object(m, 'proof', return_value=self.h.proof_result)]
        self.mocks = [item.start() for item in self.patches]

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def test_prepare_stops_and_backs_up_old_identity_without_start_or_seed(self):
        result = self.h.phase('prepare')
        self.assertEqual(result['phase'], 'backup-completed')
        self.assertFalse(self.h.running)
        self.assertEqual(self.h.backup_reports, [self.h.old])
        self.assertNotEqual(self.h.state()['previous']['opsSha256'], m.OPS_HASH)
        self.assertEqual(self.h.selected, [])
        self.assertFalse(any('up' in command or 'seed' in command for command in self.h.calls))

    def test_activation_before_migration_rejects_without_overwriting_or_command(self):
        self.h.phase('prepare')
        record = m.record_path(self.h.c).read_bytes()
        count = len(self.h.calls)
        with self.assertRaises(ValueError):
            self.h.phase('activate')
        self.assertEqual(m.record_path(self.h.c).read_bytes(), record)
        self.assertEqual(len(self.h.calls), count)
        self.assertEqual(self.h.selected, [])

    def test_migrate_requires_before_proof_and_never_promotes_profile(self):
        self.h.phase('prepare')
        self.h.phase('migrate')
        self.assertEqual(self.h.state()['phase'], 'migration-completed')
        self.assertEqual(self.h.history_count, 13)
        self.assertEqual(self.h.selected, [])
        self.assertFalse(self.h.running)
        self.assertEqual(sum(command[-1] == 'migrate' for command in self.h.calls), 1)

    def test_failed_before_proof_stops_cutover_before_owner_or_ddl(self):
        self.h.phase('prepare')
        self.mocks[2].side_effect = ValueError('bad row/catalog evidence')
        with self.assertRaises(ValueError):
            self.h.phase('migrate')
        self.assertEqual(self.h.state()['phase'], 'failed-preserved')
        self.assertFalse(any(command[-1] in ('migrate','check-owner') for command in self.h.calls))
        self.assertEqual(self.h.selected, [])

    def test_failed_after_comparison_keeps_pair_stopped_and_profile_old(self):
        self.h.phase('prepare'); self.h.phase('migrate')
        self.mocks[2].side_effect = ValueError('history/pristine addon/row/catalog mismatch')
        with self.assertRaises(ValueError):
            self.h.phase('activate')
        self.assertFalse(self.h.running)
        self.assertEqual(self.h.profile, self.h.old_profile)
        self.assertEqual(self.h.selected, [])
        self.assertFalse(any('up' in command for command in self.h.calls))

    def test_successful_activation_requires_proof_before_profile_and_uses_candidate_only(self):
        self.h.phase('prepare'); self.h.phase('migrate')
        response = SimpleNamespace(status=200, __enter__=lambda self: self, __exit__=lambda *args: None)
        with patch.object(m.urllib.request, 'urlopen', return_value=contextlib.nullcontext(response)):
            result = self.h.phase('activate')
        self.assertEqual(result['phase'], 'committed')
        self.assertEqual(self.h.image, self.h.new)
        self.assertEqual(self.h.selected, [self.h.state()['candidateProfile']])
        self.assertTrue(result['old613ConsumerResumeForbidden'])
        phases = [event['phase'] for event in self.h.state()['stages']]
        self.assertLess(phases.index('preservation-accepted'), phases.index('profile-promotion-started'))
        self.assertLess(phases.index('profile-promotion-started'), phases.index('compatible-writer-started'))
        self.assertTrue(all(command[1] == self.h.new['runtimeImageId'] for command in self.h.calls if 'up' in command))
        self.assertFalse(any('seed' in command or 'pull' == command[0] for command in self.h.calls))

    def test_replayed_prepare_preserves_prior_files_without_commands(self):
        self.h.phase('prepare')
        before = m.record_path(self.h.c).read_bytes()
        count = len(self.h.calls)
        with self.assertRaises(ValueError):
            self.h.phase('prepare')
        self.assertEqual(m.record_path(self.h.c).read_bytes(), before)
        self.assertEqual(len(self.h.calls), count)

    def test_partial_upgrade_or_preview_stops_before_dispatch(self):
        for name, content in (('upgrading.json','{}'), ('preview-transition.json','{"phase":"failed"}')):
            path = self.h.config / name
            path.write_text(content)
            with self.assertRaises(ValueError):
                self.h.phase('prepare')
            self.assertEqual(self.h.calls, [])
            path.unlink()

    def test_state_identity_path_and_tool_mismatch_cannot_write_or_stop(self):
        self.h.phase('prepare')
        original = self.h.state()
        for key, value in (('toolSha256','f'*64), ('journalRoot','/outside'), ('seedInvoked',True), ('phase','failed-preserved')):
            changed = copy.deepcopy(original)
            changed[key] = value
            m.record_path(self.h.c).write_text(json.dumps(changed))
            count = len(self.h.calls)
            with self.assertRaises(ValueError):
                self.h.phase('migrate')
            self.assertEqual(self.h.state(), changed)
            self.assertEqual(len(self.h.calls), count)

    def test_wrong_state_hash_prevents_side_effects(self):
        self.h.phase('prepare')
        self.h.args.phase, self.h.args.state_sha256 = 'migrate', '0'*64
        count = len(self.h.calls)
        with self.assertRaises(ValueError):
            m.execute(self.h.c,self.h.b,self.h.u,self.h.args,self.h.root/'tool')
        self.assertEqual(len(self.h.calls),count)

    def test_actual_migration_failure_is_not_replayed_or_rolled_back(self):
        self.h.phase('prepare')
        self.h.fail_service = 'migrate'
        with self.assertRaises(ValueError):
            self.h.phase('migrate')
        self.assertEqual(self.h.state()['failedAfterPhase'], 'migration-started')
        self.assertFalse(self.h.running)
        self.assertEqual(sum(command[-1]=='migrate' for command in self.h.calls),1)
        self.assertFalse(any('up' in command for command in self.h.calls))

    def test_candidate_start_failure_preserves_promoted_profile_without_old_restart(self):
        self.h.phase('prepare'); self.h.phase('migrate')
        self.h.fail_service = 'up'
        with self.assertRaises(ValueError):
            self.h.phase('activate')
        self.assertEqual(self.h.profile['sourceCommit'], self.h.new['sourceCommit'])
        self.assertEqual(self.h.state()['phase'], 'failed-preserved')
        self.assertFalse(self.h.running)
        self.assertTrue(all(command[1]==self.h.new['runtimeImageId'] for command in self.h.calls if 'up' in command))

    def test_duplicate_json_rejected(self):
        with self.assertRaises(ValueError):
            m.parse_json('{"accepted":false,"accepted":true}')

    def test_unknown_action_rejected_before_release_or_commands(self):
        self.h.args.phase='unexpected-action'
        with patch.object(self.h.c,'verify_release') as verify, self.assertRaises(ValueError):
            m.execute(self.h.c,self.h.b,self.h.u,self.h.args,self.h.root/'tool')
        verify.assert_not_called()
        self.assertEqual(self.h.calls,[])

    def test_ops_bytes_verified_before_any_module_exec(self):
        # A wrong source byte cannot cause execution, even if a manifest exists.
        directory=self.h.root/'fake-ops'; directory.mkdir()
        manifest={}
        for name in m.OPS_FILES:
            target=directory/name; target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(b'public-source\n'); manifest[name]=m.digest_bytes(target.read_bytes())
        (directory/'ops-manifest.json').write_text(json.dumps(manifest))
        expected=m.digest_bytes(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode())
        with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)), patch.object(m,'OPS_HASH',expected):
            m.verify_ops(directory,expected)
            (directory/'runtime/contract.py').write_bytes(b'changed-source\n')
            with self.assertRaises(ValueError): m.verify_ops(directory,expected)
        manifest.pop('runtime/backup.py')
        (directory/'ops-manifest.json').write_text(json.dumps(manifest))
        with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)), self.assertRaises(ValueError):
            m.verify_ops(directory,expected)

    def proof_fixture(self):
        self.h.phase('prepare')
        state=self.h.state()
        evidence=Path(self.h.args.evidence_dir); evidence.mkdir(parents=True)
        gate={'acceptedImage':state['candidate'],'previousImage':state['previous'],'backupManifestSha256':state['backupManifestSha256'],'backupCiphertextSha256':state['backupCiphertextSha256']}
        for name,value,arg in (('cutover-gates.json',gate,'gate_sha256'),('addition-catalog.json',{'source':self.h.args.source},'catalog_sha256'),
                               ('before.json',{'kind':'runtime-preservation','phase':'before'},'before_sha256'),('after.json',{'kind':'runtime-preservation','phase':'after'},'after_sha256')):
            data=json.dumps(value).encode(); (evidence/name).write_bytes(data)
            setattr(self.h.args,arg,m.digest_bytes(data))
        state.update(beforeSha256=self.h.args.before_sha256,gateSha256=self.h.args.gate_sha256,catalogRawSha256=self.h.args.catalog_sha256)
        tools=self.h.root/'tool'; observer=tools/'observation'; observer.mkdir(parents=True)
        for name,arg in (('observe-runtime-preservation.mjs','observer_sha256'),('upgrade-original-observation.mjs','shared_helper_sha256')):
            data=b'public-synthetic-helper'; (observer/name).write_bytes(data); setattr(self.h.args,arg,m.digest_bytes(data))
        return state,tools,evidence

    def test_proof_forwards_exact_hash_bound_inputs_and_sandbox_to_existing_comparator(self):
        real=REAL_PROOF
        state,tools,evidence=self.proof_fixture()
        self.h.history_count=13
        with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)):
            result=real(self.h.c,self.h.u,self.h.args,state,tools,'after')
        self.assertTrue(result['accepted'])
        command=self.h.node_command
        self.assertIn('-i',command)
        self.assertEqual(command[command.index('--network')+1],'none')
        self.assertIn('--read-only',command)
        self.assertIn(self.h.new['runtimeImageId'],command)
        self.assertEqual(command.count('--mount'),3)
        self.assertTrue(any('dst=/app/deploy/staging/observe-runtime-preservation.mjs,readonly' in item for item in command))
        self.assertEqual(self.h.node_input['previous'],self.h.old)
        self.assertEqual(self.h.node_input['candidate'],self.h.new)
        self.assertEqual(len(self.h.node_input['history']['migrations']),13)
        # Counterexample: this same command loses the JSON payload if Docker's
        # stdin attach option is removed, even though the host supplies input.
        with self.assertRaisesRegex(ValueError,'stdin detached'):
            self.h.run([item for item in command if item!='-i'],input_text=json.dumps(self.h.node_input))

    def test_old_backup_relabel_and_changed_before_gate_rejected_before_compare_container(self):
        real=REAL_PROOF
        state,tools,evidence=self.proof_fixture()
        gate=self.h.read(evidence/'cutover-gates.json')
        gate['previousImage']=state['candidate']
        data=json.dumps(gate).encode(); (evidence/'cutover-gates.json').write_bytes(data); self.h.args.gate_sha256=m.digest_bytes(data)
        count=len(self.h.calls)
        with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)), self.assertRaises(ValueError):
            real(self.h.c,self.h.u,self.h.args,state,tools,'after')
        self.assertEqual(len(self.h.calls),count)

    def test_recomputed_after_proof_closed_fields_counts_and_digests_required(self):
        real=REAL_PROOF
        state,tools,evidence=self.proof_fixture()
        original=copy.deepcopy(self.h.proof_result)
        for change in ({'accepted':False},{'migrationBeforeCount':10},{'migrationAfterCount':12},{'preservedTableCount':48},
                       {'newTableCount':5},{'oldCatalogDigest':'bad'},{'extra':'PRIVATE-CANARY'}):
            self.h.proof_result=original|change
            with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)), self.assertRaises(ValueError):
                real(self.h.c,self.h.u,self.h.args,state,tools,'after')

    def test_failed_comparator_row_catalog_or_pristine_addons_never_returns_acceptance(self):
        real=REAL_PROOF
        state,tools,evidence=self.proof_fixture()
        with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)), patch.object(self.h.c,'run',side_effect=ValueError('private SQL/catalog mismatch')), self.assertRaises(ValueError):
            real(self.h.c,self.h.u,self.h.args,state,tools,'after')

    def test_helper_source_byte_mismatch_blocks_container(self):
        real=REAL_PROOF
        state,tools,evidence=self.proof_fixture()
        (tools/'observation/observe-runtime-preservation.mjs').write_bytes(b'changed')
        count=len(self.h.calls)
        with patch.object(m,'exact',side_effect=lambda path,**kw: Path(path)), self.assertRaises(ValueError):
            real(self.h.c,self.h.u,self.h.args,state,tools,'after')
        self.assertEqual(len(self.h.calls),count)

    def test_unknown_journal_member_rejects_without_stop_or_start(self):
        self.h.phase('prepare')
        state=self.h.state(); before=m.record_path(self.h.c).read_bytes()
        (Path(state['journalRoot'])/'unknown.json').write_text('{}')
        count=len(self.h.calls)
        with self.assertRaises(ValueError): self.h.phase('migrate')
        self.assertEqual(len(self.h.calls),count)
        self.assertEqual(m.record_path(self.h.c).read_bytes(),before)

    def test_stop_failure_never_claims_stopped_or_takes_backup(self):
        self.h.fail_service='stop'
        with self.assertRaises(ValueError): self.h.phase('prepare')
        state=self.h.state()
        self.assertEqual(state['failedAfterPhase'],'writer-stop-started')
        self.assertNotIn('backupDirectory',state)
        self.assertTrue(self.h.running)
        self.assertEqual(self.h.backup_reports,[])
        self.assertNotIn('backup-started',[event['phase'] for event in state['stages']])
        self.assertEqual(self.h.selected,[])

    def test_verified_source_runs_instead_of_timestamp_valid_stale_pyc(self):
        previous_prefix=sys.pycache_prefix
        previous_write=sys.dont_write_bytecode
        try:
            sys.pycache_prefix=None
            folder=self.h.root/'bytecode-case'; folder.mkdir()
            source=folder/'verified.py'
            source.write_text("value = 'stale'\n")
            metadata=source.stat()
            py_compile.compile(str(source),doraise=True)
            source.write_text("value = 'fresh'\n")
            os.utime(source,ns=(metadata.st_atime_ns,metadata.st_mtime_ns))
            def load(name):
                spec=importlib.util.spec_from_file_location(name,source)
                module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
                return module.value
            self.assertEqual(load('unsafe_control'),'stale')
            m.set_cache_guard(folder)
            self.assertEqual(load('guarded_verified'),'fresh')
            self.assertFalse((folder/'unused-bytecode-cache').exists())
            self.assertTrue((folder/'__pycache__').is_dir())
        finally:
            sys.pycache_prefix=previous_prefix
            sys.dont_write_bytecode=previous_write

    def test_existing_or_dangling_cache_prefix_fails_without_deleting(self):
        folder=self.h.root/'guard-case'; folder.mkdir()
        prefix=folder/'unused-bytecode-cache'; prefix.mkdir()
        with self.assertRaises(ValueError): m.set_cache_guard(folder)
        self.assertTrue(prefix.exists())
        prefix.rmdir()
        if os.name=='posix':
            prefix.symlink_to(folder/'absent')
            with self.assertRaises(ValueError): m.set_cache_guard(folder)
            self.assertTrue(prefix.is_symlink())


if __name__=='__main__':
    unittest.main(verbosity=2)
