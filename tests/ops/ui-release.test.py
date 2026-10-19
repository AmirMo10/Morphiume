"""Portable stdlib guards. No server, database, Docker or network is used."""
import ast
from contextlib import contextmanager
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]


def load(name,file):
    p=ROOT/file; body=p.read_bytes(); ast.parse(body)
    m=types.ModuleType(name); m.__file__=str(p); sys.modules[name]=m
    exec(compile(body,str(p),'exec'),m.__dict__); return m


c=load('ui_release_control_test','deploy/staging/ui-release/control.py')
s=load('ui_release_schedule_test','deploy/staging/ui-release/schedule.py')


def release(loaded=True,letter='a'):
    value={'sourceCommit':letter*40,'testedPlatformConfig':'sha256:'+letter*64,'candidateManifestDigest':'sha256:'+'c'*64,'archiveSha256':'d'*64,'opsSha256':c.OPS}
    if loaded: value|={'runtimeImageId':'sha256:'+'e'*64,'engineProofSha256':'f'*64}
    return value


def request():
    op='12345678-1234-4234-9234-123456789012'
    return {'formatVersion':1,'mode':'private-preview-ui-release-v1','operationId':op,'previous':release(),'candidate':release(False,'b'),
        'previousProfileSha256':'1'*64,'capabilitySha256':'2'*64,'siteSha256':'3'*64,'preservedPairCount':5,'baselineSha256':None,
        'incoming':{'directory':str(c.ROOT/'incoming'/('ui-release-'+op)),'publicAcceptedSha256':'4'*64},
        'frontendReview':{'reviewed':True,'changedPaths':['src/styles/admin-redesign.css']},'callbackSha256':'5'*64,
        'nativeEvidence':None,'recovery':None,'approved':False,'sharedDatabaseWindowReleased':True}


class Guards(unittest.TestCase):
    def test_request_exact_and_unknown_fields_rejected(self):
        self.assertEqual(c.validate_request(request())['preservedPairCount'],5)
        for change in ({'approved':1},{'preservedPairCount':True},{'extra':1},{'sharedDatabaseWindowReleased':False}):
            q=request(); q.update(change)
            with self.subTest(change=change),self.assertRaises(ValueError): c.validate_request(q)

    def test_identity_separates_engine_from_raw_record_and_config(self):
        q=release(); q['runtimeImageId']='sha256:'+'9'*64
        self.assertIs(c.identity(q,True),q)
        for key in ('engineProofSha256','runtimeImageId','opsSha256'):
            bad=copy.deepcopy(q); bad.pop(key)
            with self.subTest(key=key),self.assertRaises(ValueError): c.identity(bad,True)
        bad=release(False); bad['engineProofSha256']='1'*64
        with self.assertRaises(ValueError): c.identity(bad,False)

    def test_frontend_diff_rejects_finance_schema_auth_and_dependencies(self):
        for p in ('db/migrations/0014_new.sql','src/server/admin.ts','src/app/api/admin/route.ts','package.json','pnpm-lock.yaml','deploy/staging/runtime/contract.py','src/auth/private-preview.ts','../src/styles/x.css'):
            with self.subTest(path=p),self.assertRaises(ValueError): c.frontend_paths([p])
        c.frontend_paths(sorted(['docs/STATUS.md','src/components/admin-shell.tsx','src/styles/globals.css','deploy/staging/private-preview/schedule.py']))
        c.frontend_paths(['.github/workflows/verify.yml'])

    def test_legacy_project_uses_exact_uppercase_physical_path(self):
        project='morphiume-runtime-restore-20261012t212729z-d03c35'
        root=c.ROOT/'restore/morphiume-runtime-restore-20261012T212729Z-d03c35'
        guard=types.SimpleNamespace(OLD_RELEASES={project:{'root':root}})
        with patch.object(c,'exact',side_effect=lambda x:Path(x)):
            self.assertEqual(c.pair_root(project,guard),root)
            fresh='morphiume-runtime-restore-20261019t010203z-123456'
            self.assertEqual(c.pair_root(fresh,guard),c.ROOT/'restore'/fresh)
        with self.assertRaises(ValueError): c.pair_root(project,None)

    def test_pair_snapshot_actually_captures_legacy_physical_root(self):
        project='morphiume-runtime-restore-20261012t212729z-d03c35'
        root=c.ROOT/'restore/morphiume-runtime-restore-20261012T212729Z-d03c35'
        guard=types.SimpleNamespace(OLD_RELEASES={project:{'root':root}})
        state={'Status':'exited','Running':False,'Paused':False,'Restarting':False,'OOMKilled':False,'ExitCode':0}
        items=[{'Id':letter*64,'Config':{'Labels':{'com.docker.compose.project':project,'com.docker.compose.service':service}},'State':state,'Image':'sha256:'+letter*64,'HostConfig':{},'Mounts':[]} for service,letter in (('app','a'),('db','b'))]
        with patch.object(c,'restore_items',return_value=items),patch.object(c,'exact',side_effect=lambda x:Path(x)),patch.object(Path,'lstat',return_value=types.SimpleNamespace(st_uid=0,st_mode=0o40700)),patch.object(c,'tree_view',return_value={'actual-proof':'digest'}) as tree:
            actual=c.pair_snapshot(None,1,guard=guard)
            self.assertEqual(str(tree.call_args.args[0]),str(root))
            self.assertEqual(actual[project]['storage'],{'actual-proof':'digest'})
            self.assertEqual(set(actual[project]['containers']),{'a'*64,'b'*64})

    def test_off_main_candidate_is_rejected_before_merge(self):
        events=[]
        def run(args):
            events.append(args)
            if args[-1]=='FETCH_HEAD': raise ValueError('candidate off main')
        with self.assertRaisesRegex(ValueError,'off main'): c.verify_ancestry(types.SimpleNamespace(run=run),'a'*40,'b'*40)
        self.assertEqual([e[-2:] for e in events],[['a'*40,'b'*40],['b'*40,'FETCH_HEAD']])
        self.assertFalse(any('merge' in e for e in events))

    def test_bytecode_prefix_rejects_stale_and_dangling_cache(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(sys,'pycache_prefix',sys.pycache_prefix),patch.object(sys,'dont_write_bytecode',sys.dont_write_bytecode):
            parent=Path(directory); prefix=c.cache_guard(parent)
            self.assertEqual(sys.pycache_prefix,str(prefix)); self.assertTrue(sys.dont_write_bytecode); self.assertFalse(prefix.exists())
            prefix.mkdir(); (prefix/'stale.pyc').write_bytes(b'stale executable cache')
            with self.assertRaisesRegex(ValueError,'bytecode'): c.cache_guard(parent)
        with patch.object(Path,'exists',return_value=False),patch.object(Path,'is_symlink',return_value=True):
            with self.assertRaisesRegex(ValueError,'bytecode'): c.cache_guard(Path('/protected'))

    def test_duplicate_and_nonfinite_json_rejected(self):
        for raw in ('{"a":1,"a":2}','{"a":NaN}','{"a":Infinity}'):
            with self.subTest(raw=raw),self.assertRaises(ValueError): c.parse(raw)

    def test_loader_runs_outside_release_lock_and_postcheck_inside(self):
        events=[]; held=False
        @contextmanager
        def lock():
            nonlocal held
            self.assertFalse(held); held=True; events.append('lock')
            try: yield
            finally: held=False; events.append('unlock')
        def child(): self.assertFalse(held); events.append('child'); return {'exitCode':0,'invocationCount':1}
        def post(record):
            self.assertTrue(held); self.assertEqual(record['invocationCount'],1); events.append('post'); return 'accepted'
        self.assertEqual(c.child_then_postcheck(types.SimpleNamespace(lock=lock),child,post),'accepted')
        self.assertEqual(events,['child','lock','post','unlock'])

    def test_failed_loader_never_runs_postcheck(self):
        def child(): raise ValueError('actual failure')
        with self.assertRaises(ValueError): c.child_then_postcheck(None,child,lambda _:self.fail('postcheck after failure'))

    def test_phase_replay_and_core_drift_rejected(self):
        q=request(); state={'operationId':q['operationId'],'previous':q['previous'],'candidateBase':q['candidate'],'requestCore':c.request_core(q),'phase':'image-ready-native-pending'}
        with patch.object(c,'raw',return_value=c.encode(state)),patch.object(c,'active_operation'):
            self.assertEqual(c.state_for(q,'1'*64,'image-ready-native-pending')['phase'],state['phase'])
            with self.assertRaises(ValueError): c.state_for(q,'1'*64,'candidate-loaded-previous-runtime-preserved')
            bad=copy.deepcopy(q); bad['capabilitySha256']='6'*64
            with self.assertRaises(ValueError): c.state_for(bad,'1'*64)

    def test_missing_predecessor_hash_rejects_before_any_file_or_action(self):
        for digest in (None,'','wrong','a'*63,'z'*64,123):
            with self.subTest(digest=digest),patch.object(c,'raw') as read,patch.object(c,'active_operation') as active:
                with self.assertRaisesRegex(ValueError,'predecessor'): c.state_for(request(),digest,'native-accepted')
                read.assert_not_called(); active.assert_not_called()

    def test_exact_frozen_restore_ast_changes_only_prior_pair_guard(self):
        body=(ROOT/'deploy/staging/runtime/restore.py').read_bytes().replace(b'\r\n',b'\n')
        code=c.adapted_restore(body,lambda:None)
        calls=[x.func.id for x in ast.walk(code) if isinstance(x,ast.Call) and isinstance(x.func,ast.Name)]
        self.assertEqual(calls.count('_preserved_pairs'),1)
        self.assertIn('validate_backup_identity',calls); self.assertIn('decrypt_database',calls); self.assertIn('validate_restored_containers',calls)
        for changed in (body.replace(b'--exit-on-error',b'--wrong'),body.replace(b'180',b'181',1)):
            with self.assertRaises(ValueError): c.adapted_restore(changed,lambda:None)

    def test_protected_snapshots_reject_changed_capability_pairs_owner_and_locks(self):
        before={'capability':{'sha256':'a'},'owners':{'sha256':'b'},'pairs':{'id':'c'},'dispatchLock':{'inode':1}}
        c.assert_protected(before,copy.deepcopy(before))
        for key in before:
            after=copy.deepcopy(before); after[key]={}
            with self.subTest(key=key),self.assertRaises(ValueError): c.assert_protected(before,after)

    def apply_path(self,fail_compare=False):
        events=[]; q=request(); candidate=release(True,'b')
        state={'candidate':candidate,'baseline':{'sourceMedia':{}},'evidenceRoot':'/unused','stages':[]}
        @contextmanager
        def lock(): events.append('lock'); yield; events.append('unlock')
        class C:
            OPS_ROOT=Path('/candidate/ops'); PROJECT='runtime'; DATABASE='db'
            def lock(self): return lock()
            def match_mapping(self,*a): pass
            def archived_image(self,x): return x
            def load_configs(self): return {}
            def make_profile(self,*a): return {'profile':'private-ip'}
            def preserve_profile(self,*a): events.append('preserve-profile')
            def select_profile(self,*a): events.append('select-profile')
            def compose_environment(self,*a): return 'ENV\n'
            def canonical_hash(self,*a): return '8'*64
            def compose(self,*a,**k): return ['compose']
            def validate_app_containers(self,*a,**k): events.append('validate-app')
            def run(self,args,**k):
                if 'up' in args: events.append('start-'+args[-1])
        h=types.SimpleNamespace(backup_verified=lambda *a:events.append('backup') or {'directory':'/backup'},write_new=lambda *a:None,
            replace_private=lambda *a:events.append('replace'),ready=lambda:events.append('ready'),writers=lambda *a:[{'Config':{'Labels':{'com.docker.compose.service':'app'}}}])
        def compare(a,b):
            events.append('compare')
            if fail_compare: raise ValueError('real preservation failure')
            return {'accepted':a==b}
        p=types.SimpleNamespace(capture_database=lambda *a:events.append('capture') or {'same':1},compare_database=compare,candidate_migrations=lambda *a:events.append('probe'))
        g=types.SimpleNamespace(media_snapshot=lambda *a:{})
        with patch.object(c,'common'),patch.object(c,'runtime'),patch.object(c,'stop_writers',side_effect=lambda *a:events.append('stop') or {'app':143,'worker':0}),patch.object(c,'save',side_effect=lambda h,s,phase:events.append(phase)):
            if fail_compare:
                with self.assertRaisesRegex(ValueError,'real preservation failure'): c.apply_image(q,state,h,C(),None,None,g,p,None)
                return events,None
            result=c.apply_image(q,state,h,C(),None,None,g,p,None)
        return events,result

    def test_actual_apply_order_and_nested_state_update_with_injected_services(self):
        events,result=self.apply_path()
        self.assertEqual(result['candidateProfileSha256'],'8'*64)
        for first,second in (('stop','backup'),('backup','select-profile'),('start-app','compare'),('compare','start-worker'),('start-worker','image-ready-native-pending')):
            self.assertLess(events.index(first),events.index(second))
        self.assertNotIn('operator-enable',events)

    def test_failed_preservation_does_not_start_worker_or_claim_ready(self):
        events,_=self.apply_path(fail_compare=True)
        self.assertIn('start-app',events); self.assertIn('compare',events)
        self.assertNotIn('start-worker',events); self.assertNotIn('image-ready-native-pending',events)

    def test_unfinished_other_operation_blocks_without_relabeling_it(self):
        q=request(); pointer={'formatVersion':1,'mode':'ui-release-active','operationId':'99999999-1234-4234-9234-123456789012','evidenceRoot':str(c.ROOT/'metrics'/'ui-release-99999999-1234-4234-9234-123456789012'),'requestCoreSha256':'1'*64}
        with patch.object(Path,'exists',return_value=True),patch.object(c,'raw',side_effect=[c.encode(pointer),c.encode({'phase':'loader-dispatching','candidate':q['previous']})]):
            with self.assertRaisesRegex(ValueError,'unfinished_prior'): c.active_operation(q,allow_previous=True)

    def test_recovery_external_process_exit_and_result_links_are_required(self):
        q=request(); q['recovery']={'businessResult':{'sha256':'6'*64}}
        state={'candidate':release(True,'b'),'candidateProfileSha256':'7'*64,'restoreProject':'p','fixture':{'sha256':'8'*64},'recoveryBackup':{'manifestSha256':'9'*64},'restoreReadySha256':'a'*64,'restoreConfigSha256':'b'*64,'restoreReady':{'applicationReadyUtc':'2026-10-19T00:00:00Z'}}
        result={'mode':'ui-release-recovery-result','candidate':state['candidate'],'accessProfileSha256':'7'*64,'capabilitySha256':q['capabilitySha256'],
            'restoreProject':'p','fixtureSha256':'8'*64,'backupManifestSha256':'9'*64,'readySha256':'a'*64,'appConfigSha256':'b'*64,'origin':'http://localhost:3101',
            'reviewCapabilityIgnored':True,'anonymousAdminStatus':401,'checks':dict.fromkeys(('nativeLogin','ownedOrder','paymentReceiptDedup','stockReservation','shipmentTracking','mediaHashes'),True),
            'financialRowsPreserved':True,'noFinancialRowsAdded':True,'noNewOrder':True,'directSqlMutations':0,'startedUtc':'2026-10-19T00:00:02Z','completedUtc':'2026-10-19T00:00:03Z'}
        process={'mode':'root-observed-ui-release-recovery-process','candidate':state['candidate'],'operationId':q['operationId'],'restoreProject':'p','rawResultSha256':'6'*64,'exitCode':0,'timedOut':False,'invocationCount':1,'automaticRetry':False,'startedUtc':'2026-10-19T00:00:01Z','completedUtc':'2026-10-19T00:00:04Z'}
        with patch.object(c,'utc',return_value='2026-10-19T00:00:05Z'):
            c.validate_recovery(result,process,state,q)
            for change in ({'exitCode':1},{'exitCode':False},{'invocationCount':2},{'rawResultSha256':'0'*64},{'timedOut':True},{'automaticRetry':True}):
                bad=process|change
                with self.subTest(change=change),self.assertRaises(ValueError): c.validate_recovery(result,bad,state,q)
            with self.assertRaises(ValueError): c.validate_recovery(result|{'anonymousAdminStatus':200},process,state,q)
            with self.assertRaises(ValueError): c.validate_recovery(result|{'noFinancialRowsAdded':False},process,state,q)

    def test_unlinked_recovery_fixture_fails_before_stopping_source(self):
        q=request(); q['recovery']={'fixture':{'path':'/fixture','sha256':'1'*64},'temporaryIdentity':{'path':'/key','sha256':'2'*64},'businessResult':None,'processRecord':None}
        state={'candidate':release(True,'b'),'nativeEvidence':{'path':'/native','sha256':'3'*64}}
        with patch.object(c,'reference',side_effect=[{'sourceCommit':'b'*40},{'retainPrimary':True,'restoreFixtureSha256':'9'*64}]),patch.object(c,'stop_writers') as stop:
            with self.assertRaisesRegex(ValueError,'fixture_not_from'): c.recovery_start(q,state,None,None,None,None,None,None,None)
            stop.assert_not_called()

    def test_recurring_approval_cannot_invent_measurements(self):
        q=request(); state={'candidate':release(True,'b'),'candidateProfileSha256':'1'*64,'nativeEvidence':{'path':'/native','sha256':'2'*64},'restoreEvidence':{'path':'/restore','sha256':'3'*64},'measurements':{'health':'8'*64,'backup':'9'*64}}
        args=types.SimpleNamespace(request_sha256='4'*64,control_sha256='5'*64,self_sha256='6'*64)
        value={'formatVersion':1,'mode':'ui-release-scheduled-v1','scope':'recurring-timers','candidate':state['candidate'],'accessProfileSha256':'1'*64,'capabilitySha256':q['capabilitySha256'],
            'nativeEvidence':state['nativeEvidence'],'restoreEvidence':state['restoreEvidence'],'acceptanceSha256':'7'*64,'requestSha256':'4'*64,'controlSha256':'5'*64,'callbackSha256':'6'*64,
            'dispatchLock':{'path':str(c.CONFIG/'schedule-dispatch.lock'),'sha256':c.sha(b'Morphiume E4 scheduled dispatch lock v1\n'),'device':1,'inode':2,'filesystem':'ext4'},'serviceMeasurementSha256':state['measurements']}
        s.validate_approval(value,q,state,args,c)
        for changed in ({'serviceMeasurementSha256':{'health':'0'*64,'backup':'9'*64}},{'controlSha256':'0'*64},{'capabilitySha256':'0'*64}):
            with self.subTest(changed=changed),self.assertRaises(ValueError): s.validate_approval(value|changed,q,state,args,c)

    def test_plan_paths_do_not_require_request_files_or_permissions(self):
        for file in ('control.py','schedule.py'):
            proc=subprocess.run([sys.executable,'-I','-B',str(ROOT/'deploy/staging/ui-release'/file)],capture_output=True,text=True,timeout=5)
            self.assertEqual(proc.returncode,0,proc.stdout+proc.stderr)
            self.assertFalse(json.loads(proc.stdout)['serverMutation'])

    def test_output_reports_actual_completed_timer_phase(self):
        q=request()
        with patch.object(c,'raw',return_value=b'actual journal'):
            self.assertTrue(c.result_summary(q,{'phase':'complete-timers-active-enabled'})['timersResumed'])
            self.assertFalse(c.result_summary(q,{'phase':'image-ready-native-pending'})['timersResumed'])


if __name__=='__main__': unittest.main(verbosity=2)
