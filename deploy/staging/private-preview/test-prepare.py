"""Portable preparation contract tests; no main, SSH, Docker, DB or Git calls."""
import copy
import ast
from contextlib import contextmanager
import datetime
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('prepare',BASE/'prepare.py')
p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

def request():
    return {'formatVersion':1,'mode':'private-preview-prepare-candidate','operationId':'12345678-1234-4234-8234-123456789abc',
        'sourceCommit':'1'*40,'controlSha256':'2'*64,'publicAcceptedSha256':'3'*64,'expectedProtectedStateSha256':None,
        'oldInventory':{'path':p.ROOT.as_posix()+'/preservation/id/old-restore-inventory.json','sha256':'4'*64},
        'fourthAcceptance':{'path':p.ROOT.as_posix()+'/restore/id/recovery-accepted.json','sha256':'5'*64},'sharedDatabaseWindowReleased':True}

def ci():
    return {'formatVersion':1,'mode':'root-observed-accepted-github-ci','repository':'AmirMo10/Morphiume','sourceCommit':'1'*40,
        'runId':'39110000000','runAttempt':1,'verifyJob':{'id':'117000000001','conclusion':'success'},
        'imageJob':{'id':'117000000002','conclusion':'success'},'artifact':{'id':'7000000000','zipSha256':'2'*64,
        'testedPlatformConfig':'sha256:'+'3'*64,'candidateManifestDigest':'sha256:'+'4'*64,'archiveSha256':'5'*64},
        'observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}


class Prepare(unittest.TestCase):
    def test_actual_nested_postcheck_mutates_outer_state_and_completes_journal(self):
        tree=ast.parse((BASE/'prepare.py').read_bytes())
        apply=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='apply')
        record=next(n for n in apply.body if isinstance(n,ast.FunctionDef) and n.name=='record')
        post=next(n for n in ast.walk(apply) if isinstance(n,ast.FunctionDef) and n.name=='postcheck')
        names=('state','request','h','c','g','preservation','basic','sources','before','a','evidence')
        # Compile the unmodified actual nested bodies inside a real closure.
        factory=ast.FunctionDef(name='factory',args=ast.arguments(posonlyargs=[],args=[ast.arg(arg=n) for n in names],
            kwonlyargs=[],kw_defaults=[],defaults=[]),body=[copy.deepcopy(record),copy.deepcopy(post),ast.Return(ast.Name('postcheck',ast.Load()))],decorator_list=[])
        candidate={key:'test-'+key for key in ('sourceCommit','testedPlatformConfig','candidateManifestDigest','archiveSha256','opsSha256','runtimeImageId','engineProofSha256')}
        evidence=Path('/test-evidence'); proof=Path('/test-proof.json'); files={proof:b'actual-proof-record'}; calls=[]
        state={'stages':[],'loaderChild':{'exitCode':0,'invocationCount':1}}
        before={'checkoutHead':'old','units':{'active':True},'protected':'unchanged'}
        after=before|{'checkoutHead':'candidate','units':{'active':False}}
        encode=lambda value:(__import__('json').dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
        def write(path,body): self.assertNotIn(path,files); files[path]=body; calls.append(str(path))
        h=SimpleNamespace(PREVIOUS=candidate,OPS=candidate['opsSha256'],raw=lambda path:files[path],
            write_new=write,encode=encode,utc=lambda:'2026-10-18T00:00:00+00:00')
        c=SimpleNamespace(archived_image=lambda _:candidate,engine_record_path=lambda *_:proof)
        namespace=dict(p.__dict__); namespace['protected_state']=lambda *args,**kwargs:after
        exec(compile(ast.fix_missing_locations(ast.Module([factory],type_ignores=[])),'actual-nested-postcheck','exec'),namespace)
        fn=namespace['factory'](state,{'sourceCommit':candidate['sourceCommit']},h,c,None,None,None,None,before,
            {key:candidate[key] for key in ('testedPlatformConfig','candidateManifestDigest','archiveSha256')},evidence)
        result=fn({'exitCode':0})
        self.assertEqual(state['candidate'],candidate); self.assertEqual(state['phase'],'candidate-loaded-previous-runtime-preserved')
        self.assertEqual(result['candidate'],candidate); self.assertTrue(result['allFourOldPairsPreserved'])
        self.assertEqual(len(calls),2); self.assertIn(str(evidence/'protected-after.json'),calls)
        self.assertEqual(result['finalEvidenceSha256'],p.sha(files[evidence/'01-candidate-loaded-previous-runtime-preserved.json']))

    def test_loader_runs_outside_parent_lock_and_postcheck_inside(self):
        held=[False]; order=[]
        @contextmanager
        def lock():
            self.assertFalse(held[0]); held[0]=True; order.append('lock')
            try: yield
            finally: held[0]=False; order.append('unlock')
        def child(): self.assertFalse(held[0]); order.append('child'); return {'exitCode':0}
        def post(result): self.assertTrue(held[0]); order.append('post'); return result
        self.assertEqual(p.child_then_locked_postcheck(SimpleNamespace(lock=lock),child,post),{'exitCode':0})
        self.assertEqual(order,['child','lock','post','unlock'])
        tree=ast.parse((BASE/'prepare.py').read_bytes())
        apply=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='apply')
        calls=[n for n in ast.walk(apply) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='child_then_locked_postcheck']
        self.assertEqual(len(calls),1)
        for block in (n for n in ast.walk(apply) if isinstance(n,ast.With)):
            if any(isinstance(i.context_expr,ast.Call) and isinstance(i.context_expr.func,ast.Attribute) and i.context_expr.func.attr=='lock' for i in block.items):
                self.assertNotIn(calls[0],list(ast.walk(block)))

    def test_exact_metadata_accepts_two_distinct_successful_jobs(self): p.validate_ci(ci(),'1'*40)

    def test_metadata_rejects_unverified_or_wrong_source_artifacts(self):
        cases=[]
        for name,value in [('formatVersion',True),('repository','other/project'),('sourceCommit','2'*40),('runId',39110000000),('runAttempt',True),('observedUtc','2000-01-01T00:00:00Z'),('observedUtc','2100-01-01T00:00:00Z'),('observedUtc','2026-01-01T00:00:00')]:
            row=ci(); row[name]=value; cases.append(row)
        for name in ('verifyJob','imageJob'):
            row=ci(); row[name]['conclusion']='failure'; cases.append(row)
            row=ci(); row[name]['id']=117000000000; cases.append(row)
        row=ci(); row['imageJob']['id']=row['verifyJob']['id']; cases.append(row)
        for name in ('zipSha256','archiveSha256','testedPlatformConfig','candidateManifestDigest'):
            row=ci(); row['artifact'][name]='unverified'; cases.append(row)
        row=ci(); row['extra']=True; cases.append(row)
        for row in cases:
            with self.subTest(row=row):
                with self.assertRaises(ValueError): p.validate_ci(row,'1'*40)

    def test_request_requires_explicit_quiet_window_and_new_source(self):
        p.validate_request(request())
        for name,value in [('formatVersion',True),('sharedDatabaseWindowReleased',False),('sourceCommit','7feb4fe8e8254e917c53f9654b315ee7ef3fada1'),('controlSha256','bad'),('expectedProtectedStateSha256','bad')]:
            row=request(); row[name]=value
            with self.assertRaises(ValueError): p.validate_request(row)
        for path in ('/tmp/other','/srv/morphiume/staging/runtime/../other'):
            row=request(); row['fourthAcceptance']['path']=path
            with self.assertRaises(ValueError): p.validate_request(row)

    def test_duplicate_and_nonfinite_metadata_rejected(self):
        for raw in ('{"a":1,"a":2}','{"a":NaN}','{"a":Infinity}'):
            with self.assertRaises(ValueError): p.parse(raw)

    def test_archive_failure_happens_before_timer_or_git_dispatch(self):
        calls=[]; c=SimpleNamespace(run=lambda command:calls.append(command))
        with patch.object(p,'incoming',side_effect=ValueError('archive rejected')):
            with self.assertRaises(ValueError): p.apply(request(),None,c,None,None,None,None,None,None)
        self.assertEqual(calls,[])

    def test_baseline_mismatch_happens_before_timer_or_git_dispatch(self):
        calls=[]; c=SimpleNamespace(run=lambda command:calls.append(command)); row=request(); row['expectedProtectedStateSha256']='0'*64
        h=SimpleNamespace(PREVIOUS={'sourceCommit':'7'*40},encode=lambda value:repr(value).encode())
        with patch.object(p,'incoming',return_value=(None,ci(),{})),patch.object(p,'headroom',return_value={}),patch.object(p,'protected_state',return_value={'actual':'state'}):
            with self.assertRaises(ValueError): p.apply(row,h,c,None,None,None,None,None,None)
        self.assertEqual(calls,[])

    def test_wait_allows_natural_completion_without_service_commands(self):
        units=('health.timer','health.service','backup.timer','backup.service'); phase=[0]
        before={name:{'UnitFileState':'enabled','InvocationID':'1'*32} for name in units}
        def manager(c,name):
            return {'ActiveState':'inactive' if name.endswith('.timer') or phase[0] else 'active','UnitFileState':'enabled',
                    'Result':'success','ExecMainStatus':'0','InvocationID':'1'*32}
        h=SimpleNamespace(UNITS=units,manager=manager)
        with patch.object(p.time,'sleep',side_effect=lambda _:phase.__setitem__(0,1)):
            value=p.wait_inactive(h,None,before)
        self.assertTrue(all(v['ActiveState']=='inactive' for v in value.values()))

    def test_wait_rejects_new_job_invocation(self):
        units=('health.timer','health.service'); before={name:{'UnitFileState':'enabled','InvocationID':'1'*32} for name in units}
        h=SimpleNamespace(UNITS=units,manager=lambda c,name:{'ActiveState':'inactive','UnitFileState':'enabled','InvocationID':'2'*32,'Result':'success','ExecMainStatus':'0'})
        with self.assertRaises(ValueError): p.wait_inactive(h,None,before)

    def test_wait_times_out_without_killing_service(self):
        units=('health.timer','health.service'); before={name:{'UnitFileState':'enabled','InvocationID':'1'*32} for name in units}
        h=SimpleNamespace(UNITS=units,manager=lambda c,name:{'ActiveState':'inactive' if name.endswith('.timer') else 'active','UnitFileState':'enabled','InvocationID':'1'*32})
        with patch.object(p.time,'monotonic',side_effect=(0,76)):
            with self.assertRaises(ValueError): p.wait_inactive(h,None,before)

    def test_preservation_excludes_only_intended_head_and_unit_state(self):
        before={'checkoutHead':'old','units':{'ActiveState':'active'},'config':'same','appIds':['same'],'owner':'same','pairs':8}
        after=before|{'checkoutHead':'candidate','units':{'ActiveState':'inactive'}}
        self.assertEqual(p.core(before),p.core(after))
        for key in ('config','appIds','owner','pairs'):
            self.assertNotEqual(p.core(before),p.core(after|{key:'changed'}))

    def test_headroom_reserves_copy_and_double_layers_before_pause(self):
        report={'archiveBytes':100,'uncompressedLayerBytes':200}
        minimum=100+2*200+1024**3
        with patch.object(p.os,'statvfs',create=True,return_value=SimpleNamespace(f_bavail=minimum,f_frsize=1)):
            self.assertEqual(p.headroom(report)['requiredBytes'],minimum)
        with patch.object(p.os,'statvfs',create=True,return_value=SimpleNamespace(f_bavail=minimum-1,f_frsize=1)):
            with self.assertRaises(ValueError): p.headroom(report)


if __name__=='__main__': unittest.main()
