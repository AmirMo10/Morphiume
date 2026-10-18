"""Offline contract tests. No main(), SSH, Docker, HTTP, DB or private inputs."""
import copy
import datetime
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import stat

BASE=Path(__file__).resolve().parent

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,BASE/file)
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

h=load('control','control.py')
s=load('schedule','schedule.py')

def request():
    candidate=dict(h.PREVIOUS,sourceCommit='1'*40,testedPlatformConfig='sha256:'+'2'*64,candidateManifestDigest='sha256:'+'3'*64,
        runtimeImageId='sha256:'+'4'*64,archiveSha256='5'*64,engineProofSha256='6'*64)
    return {'formatVersion':1,'mode':'private-preview-image-only-transition','operationId':'12345678-1234-4234-8234-123456789abc',
        'candidate':candidate,'candidateProfileSha256':'7'*64,'capabilitySha256':None,
        'oldInventory':{'path':h.ROOT.as_posix()+'/preservation/c7d9bd5c-46b4-4709-bff6-9d0f5c0531f3/old-restore-inventory.json','sha256':h.OLD_INVENTORY},
        'fourthAcceptance':{'path':h.ROOT.as_posix()+'/restore/morphiume-runtime-restore-20000101t000000z-123456/recovery-accepted.json','sha256':h.FOURTH_ACCEPTANCE},
        'baselineSha256':None,'nativeEvidence':{'path':h.CONFIG.as_posix()+'/private-preview-native-'+'1'*40+'.json','sha256':None},
        'restoreEvidence':{'path':None,'sha256':None},'sharedDatabaseWindowReleased':True}


class Preparation(unittest.TestCase):
    def test_fourth_exact_actual_storage_mode_rejects_creation_mode(self):
        mode=0o700
        class FakePath:
            def __init__(self,path): self.path=path
            def __str__(self): return str(self.path)
            def lstat(self):
                uid=999 if self.path.name=='postgres' else 1001
                return SimpleNamespace(st_uid=uid,st_gid=uid,st_mode=stat.S_IFDIR|(0o700 if uid==999 else mode),st_dev=1,st_ino=2)
        with patch.object(h,'exact',side_effect=lambda path:FakePath(path)):
            views=h.fourth_storage(Path('/fourth'))
            self.assertEqual([v['mode'] for v in views],['0o700','0o700'])
            mode=0o750
            with self.assertRaises(ValueError): h.fourth_storage(Path('/fourth'))

    def test_manager_uses_timer_and_service_property_schemas(self):
        calls=[]
        def run(args):
            unit=args[2]; keys=args[3].split('=',1)[1].split(','); calls.append((unit,keys))
            values={'Id':unit,'LoadState':'loaded','ActiveState':'inactive','UnitFileState':'enabled','DropInPaths':'','FragmentPath':'/etc/systemd/system/'+unit}
            if unit.endswith('.service'): values|={'Result':'success','ExecMainStatus':'0','InvocationID':'1'*32}
            return '\n'.join(k+'='+values[k] for k in keys if k in values)
        h.manager(SimpleNamespace(run=run),'morphiume-runtime-health.timer')
        h.manager(SimpleNamespace(run=run),'morphiume-runtime-health.service')
        self.assertNotIn('ExecMainStatus',calls[0][1]); self.assertIn('ExecMainStatus',calls[1][1])

    def test_four_preserved_pairs_exact_aggregate_and_only_named_fifth(self):
        original=[{'id':str(i)*64} for i in range(1,7)]
        fourth={'containers':[{'id':'7'*64},{'id':'8'*64}]}
        base=[{'Id':row['id'],'Config':{'Labels':{'com.docker.compose.project':'preserved'}}} for row in original+fourth['containers']]
        g=SimpleNamespace(inventories_shape=lambda _:None,old_pair=lambda c,record,items:record)
        old={'pairs':[original[:2],original[2:4],original[4:]]}
        c=SimpleNamespace(run=lambda _: '')
        with patch.object(h,'raw',return_value=b'{}'),patch.object(h,'parse',return_value=old),patch.object(h,'fourth_pair',return_value=fourth):
            with patch.object(h,'all_restore_items',return_value=base): self.assertEqual(len(h.four_pairs(c,g,request())['originalThree']),6)
            with patch.object(h,'all_restore_items',return_value=base+[{'Id':'9'*64}]):
                with self.assertRaises(ValueError): h.four_pairs(c,g,request())
            extras=[{'Id':str(i)*64,'Config':{'Labels':{'com.docker.compose.project':'exact-fresh'}}} for i in (9,0)]
            with patch.object(h,'all_restore_items',return_value=base+extras):
                h.four_pairs(c,g,request(),'exact-fresh')
                with self.assertRaises(ValueError): h.four_pairs(c,g,request(),'wrong-project')

    def test_valid_request_without_future_evidence(self):
        self.assertEqual(h.validate_request(request()),request())

    def test_reject_request_mutations(self):
        cases=[]
        for key,value in [('formatVersion',True),('mode','live'),('sharedDatabaseWindowReleased',False),('operationId','old'),('candidateProfileSha256','bad'),('capabilitySha256','bad')]:
            row=request(); row[key]=value; cases.append(row)
        for key,value in [('sourceCommit',h.PREVIOUS['sourceCommit']),('opsSha256','0'*64),('runtimeImageId',h.PREVIOUS['runtimeImageId']),('testedPlatformConfig',h.PREVIOUS['testedPlatformConfig'])]:
            row=request(); row['candidate'][key]=value; cases.append(row)
        for key in ('oldInventory','fourthAcceptance'):
            row=request(); row[key]['sha256']='0'*64; cases.append(row)
            row=request(); row[key]['path']='/tmp/recovery-accepted.json'; cases.append(row)
        row=request(); row['nativeEvidence']['path']='/tmp/fake'; cases.append(row)
        row=request(); row['restoreEvidence']={'path':'/tmp/recovery-accepted.json','sha256':'0'*64}; cases.append(row)
        row=request(); row['unreviewed']=True; cases.append(row)
        for row in cases:
            with self.subTest(row=row):
                with self.assertRaises(ValueError): h.validate_request(row)

    def test_duplicate_and_nonfinite_json_rejected(self):
        for raw in ('{"a":1,"a":2}','{"a":NaN}','{"a":Infinity}'):
            with self.assertRaises(ValueError): h.parse(raw)

    def test_native_marker_requires_new_authless_facts(self):
        r=request(); value=r['candidate']|{'mode':'private-preview-native-accepted','accessProfileSha256':r['candidateProfileSha256'],
            'capabilitySha256':'8'*64,'origin':'http://192.168.240.51','clientCidrs':['192.168.240.46/32'],
            'checks':{key:True for key in h.REVIEW_CHECKS},'commandExitCode':0,'invocationCount':1,'automaticRetry':False,
            'acceptedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        h.validate_native(value,r,'8'*64)
        cases=[value|{'mode':'retained-redesign-T25-accepted'},value|{'commandExitCode':False},value|{'automaticRetry':True},
               value|{'clientCidrs':['192.168.240.0/24']},value|{'capabilitySha256':'9'*64},value|{'acceptedUtc':'2100-01-01T00:00:00Z'}]
        for key in ('basicNotRequired','adminLoginNotRequired','serverOnlyReviewAuthority','reviewRejectedOutsidePrivateStaging'):
            row=copy.deepcopy(value); row['checks'][key]=False; cases.append(row)
        for row in cases:
            with self.subTest(row=row):
                with self.assertRaises(ValueError): h.validate_native(row,r,'8'*64)

    def test_operator_delta_is_separate_and_limited(self):
        names=['user','account','role_membership','session','two_factor','verification','auth_rate_limit','admin_grant']+[f'table_{i}' for i in range(45)]
        before={'identity':{},'history':{},'catalog':{},'sequences':[], 'rows':{n:{'count':3,'sha256':'0'*64} for n in names}}
        after=copy.deepcopy(before)
        for name in ('user','account','role_membership','two_factor'): after['rows'][name]={'count':4,'sha256':'1'*64}
        self.assertTrue(h.compare_operator_delta(before,after)['allOtherTablesUnchanged'])
        for name in ('table_0','table_44'):
            bad=copy.deepcopy(after); bad['rows'][name]['sha256']='2'*64
            with self.assertRaises(ValueError): h.compare_operator_delta(before,bad)
        bad=copy.deepcopy(after); bad['catalog']={'roleChanged':True}
        with self.assertRaises(ValueError): h.compare_operator_delta(before,bad)
        bad=copy.deepcopy(after); bad['rows']['user']['count']=3
        with self.assertRaises(ValueError): h.compare_operator_delta(before,bad)

    def test_existing_identity_queries_are_bounded_and_exclude_only_reserved_user(self):
        calls=[]
        def sql(c,query): calls.append(query); return {'count':0,'sha256':'0'*64}
        result=h.existing_auth(None,SimpleNamespace(sql=sql))
        self.assertEqual(set(result),{'user','account','role_membership','session','two_factor','admin_grant'})
        self.assertTrue(all('LIMIT 100001' in q and 'private-preview@morphiume.invalid' in q and 'sha256' in q for q in calls))
        self.assertTrue(all('UPDATE ' not in q and 'DELETE ' not in q and 'INSERT ' not in q for q in calls))

    def test_scheduler_render_preserves_budgets(self):
        args=SimpleNamespace(script='/srv/example/private-preview-schedule.py',request='/etc/example/request.json',
            self_sha256='1'*64,control_sha256='2'*64,request_sha256='3'*64,approval_sha256='4'*64)
        health=s.dropin(args,'health'); backup=s.dropin(args,'backup')
        self.assertIn('CPUQuota=100%\nMemoryMax=256M\nTimeoutStartSec=50s\nTimeoutStopSec=5s',health)
        self.assertNotIn('TimeoutStartSec=',backup); self.assertNotIn('MemoryMax=',backup)
        self.assertIn('EnvironmentFile=\n',health); self.assertIn(' -I -B -X pycache_prefix=',health)
        self.assertNotIn('git ',health); self.assertNotIn('OnCalendar=',health+backup); self.assertNotIn('systemctl start',health+backup)
        self.assertIn('--unit %n --execute',health)
        for bad in ('/tmp/name with spaces','relative','/tmp/../other'):
            with self.assertRaises(ValueError): s.path_text(bad)

    def test_scheduler_approval_binds_new_source_and_real_measurements(self):
        r=request(); r['capabilitySha256']='8'*64; r['nativeEvidence']['sha256']='9'*64
        r['restoreEvidence']={'path':'/srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20000101t000000z-abcdef/recovery-accepted.json','sha256':'a'*64}
        args=SimpleNamespace(request_sha256='b'*64,control_sha256='c'*64,self_sha256='d'*64)
        value=r['candidate']|{'formatVersion':1,'mode':'private-preview-scheduled-v1','scope':'one-time-service-measurement','sharedDatabaseWindowReleased':True,
            'accessProfileSha256':r['candidateProfileSha256'],'requestSha256':args.request_sha256,'controlSha256':args.control_sha256,'scheduleSha256':args.self_sha256,
            'nativeEvidenceSha256':r['nativeEvidence']['sha256'],'restoreEvidenceSha256':r['restoreEvidence']['sha256'],'capabilitySha256':r['capabilitySha256'],
            'dispatchLock':{'path':s.DISPATCH.as_posix(),'sha256':s.sha(s.LOCK_BYTES),'device':1,'inode':2,'filesystem':'ext4'},'serviceMeasurementSha256':{'health':None,'backup':None}}
        s.validate_approval(value,r,args)
        recurring=value|{'scope':'recurring-timers','serviceMeasurementSha256':{'health':'e'*64,'backup':'f'*64}}
        s.validate_approval(recurring,r,args)
        cases=[value|{'scope':'recurring-timers'},value|{'sourceCommit':h.PREVIOUS['sourceCommit']},value|{'requestSha256':'e'*64},value|{'restoreEvidenceSha256':h.FOURTH_ACCEPTANCE},value|{'capabilitySha256':'0'*64},value|{'sharedDatabaseWindowReleased':False}]
        bad=copy.deepcopy(value); bad['dispatchLock']['inode']=0; cases.append(bad)
        for row in cases:
            with self.assertRaises(ValueError): s.validate_approval(row,r,args)


if __name__=='__main__': unittest.main()
