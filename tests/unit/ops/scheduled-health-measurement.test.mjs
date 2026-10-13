import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { SOURCE, OPS, DROPINS, plan, validateRequest, validateSummary, sshArguments, remoteBootstrap, hash, sourceHash, osEnvironment } from "../../../deploy/staging/post-restore/measure-591-health.mjs";

const sha = "a".repeat(64), commit = "b".repeat(40), uuid = "12345678-abcd-4abc-8abc-123456789abc";
function request() {
  return { schemaVersion: 1, action: "measure-old591-scheduled-health", measurementId: uuid, rootDispatch: true, sharedDatabaseWindowReleased: true, approvalAction: "create-if-absent", identity: { sourceCommit: SOURCE, testedPlatformConfig: "sha256:" + sha, candidateManifestDigest: "sha256:" + sha, archiveSha256: sha, opsSha256: OPS, runtimeImageId: "sha256:" + sha, engineProofSha256: sha, accessProfileSha256: sha }, publication: { toolSourceCommit: commit, configurationSourceCommit: commit, localToolSha256: sha, remoteToolSha256: sha, dropinSha256: { ...DROPINS } }, evidence: Object.fromEntries(["acceptanceSha256", "remoteResultRawSha256", "resultSemanticSha256", "fixtureSha256", "readyRecordSha256", "journalSha256", "restoreConfigSha256", "backupManifestSha256"].map(key => [key, sha]).concat([["localResultRawSha256", "139f916c48f32308894025d002d91f287ff175d3e33549560c29344141aa3498"], ["recoveryToolSourceCommit", commit]])) };
}
function summary(r = request()) {
  return { schemaVersion: 1, mode: "scheduled-health-measured", accepted: true, identity: r.identity, privateEvidenceSha256: sha, measurementId: r.measurementId, systemctlStartCount: 1, unitResult: "success", wallSeconds: 38, executionSeconds: 37, unitCycleSeconds: null, timingSource: "exec-main-monotonic", sampleCount: 100, sampledMemoryPeakBytes: 60_000_000, sampledCpuMicroseconds: 32_000_000, alertsCount: 0, appReadiness: 200, timersStarted: false, backupExecuted: false, writerStopExecuted: false, sqlMutationExecuted: false, originalTableEqualityMeasured: false };
}
test("default plan executes no remote and makes no measurement/approval claims", () => {
  const child = spawnSync(process.execPath, [resolve("deploy/staging/post-restore/measure-591-health.mjs")], { encoding: "utf8", timeout: 5000 });
  assert.equal(child.status, 0); assert.deepEqual(JSON.parse(child.stdout), plan()); assert.equal(child.stderr, ""); assert.equal(plan().actualScheduledCostMeasured, false); assert.equal(plan().approvalWritten, false);
});
test("without --execute even supplied options reject before SSH/config/file operations", () => {
  const marker = "private-marker-never-printed";
  const child = spawnSync(process.execPath, [resolve("deploy/staging/post-restore/measure-591-health.mjs"), "--request", marker], { encoding: "utf8", timeout: 5000 });
  assert.equal(child.status, 1); assert.equal(child.stdout, ""); assert.ok(!child.stderr.includes(marker)); assert.match(child.stderr, /No retry is authorized/u);
});
test("exact source/identity/Root publication request accepted purely", () => { assert.equal(validateRequest(request()).identity.sourceCommit, SOURCE); });
for (const [name, mutate] of Object.entries({ window: r => r.sharedDatabaseWindowReleased = false, dispatch: r => r.rootDispatch = false, oldOps: r => r.identity.opsSha256 = sha, newApp: r => r.identity.sourceCommit = commit, action: r => r.action = "backup", approvalOverwrite: r => r.approvalAction = "overwrite", traversal: r => r.measurementId = "../../system", extra: r => r.password = "private-marker", extraIdentity: r => r.identity.ownerUrl = "secret", unreviewedBudget: r => r.publication.dropinSha256["591-health-budget.conf"] = sha, missingRecovery: r => delete r.evidence.journalSha256, missingRemoteResultBinding: r => delete r.evidence.remoteResultRawSha256, wrongOriginalResult: r => r.evidence.localResultRawSha256 = sha })) {
  test(`Root request refuses ${name}`, () => { const r = request(); mutate(r); assert.throws(() => validateRequest(r)); });
}
test("SSH has strict known alias/batch host guard and data only on private stdin", () => {
  assert.deepEqual(sshArguments().slice(-2), ["morphiume-deploy", "python3 -E -B -"]); assert.ok(sshArguments().includes("StrictHostKeyChecking=yes"));
  const source = remoteBootstrap(request()); assert.match(source, /compile\(data,str\(path\),'exec'\)/u); assert.match(source, /Scheduled health bootstrap stopped/u); assert.ok(!sshArguments().join(" ").includes(sha));
});
test("narrow OS environment preserves Windows ProgramData and excludes all service/token secrets", () => {
  const safe = osEnvironment({ PATH: "os-path", SystemRoot: "os-root", PROGRAMDATA: "os-programdata", USERPROFILE: "os-profile", GH_TOKEN: "sensitive", OPENAI_API_KEY: "sensitive", DATABASE_URL: "owner-sensitive", MORPHIUME_IMAGE: "override", DOCKER_HOST: "override", PYTHONPATH: "override" });
  assert.deepEqual(safe, { PATH: "os-path", SystemRoot: "os-root", USERPROFILE: "os-profile", ProgramData: "os-programdata" });
});
test("safe summary admits no raw journal/environment/URLs or extra keys", () => {
  validateSummary(summary(), request());
  for (const key of ["journal", "Environment", "DATABASE_URL"]) { const value = summary(); value[key] = "secret"; assert.throws(() => validateSummary(value, request())); }
  const value = summary(); value.unitResult = "secret-sensitive-url"; assert.throws(() => validateSummary(value, request()));
});
for (const [name, mutate] of Object.entries({ secondStart: s => s.systemctlStartCount = 2, backup: s => s.backupExecuted = true, timer: s => s.timersStarted = true, writerStop: s => s.writerStopExecuted = true, ddl: s => s.sqlMutationExecuted = true, falseEquality: s => s.originalTableEqualityMeasured = true, startupOnly: s => s.executionSeconds = 0, timeout: s => s.unitResult = "timeout", alert: s => s.alertsCount = 1, ready: s => s.appReadiness = "unavailable", overBudget: s => s.executionSeconds = 51, forgedProfile: s => s.identity = { ...s.identity, accessProfileSha256: "c".repeat(64) } })) {
  test(`accepted summary refuses ${name}`, () => { const r = request(), s = summary(r); mutate(s); assert.throws(() => validateSummary(s, r)); });
}
test("public config drop-ins retain exact canonical hashes", () => { for (const [name, expected] of Object.entries(DROPINS)) assert.equal(sourceHash(readFileSync(resolve("deploy/staging/post-restore", name))), expected); assert.equal(hash(Buffer.from("x")), hash("x")); });

test("Python unit/gate/measurement failures are mocked with no real commands", () => {
  const script = String.raw`
import importlib.util,json,sys,unittest,copy
from unittest.mock import patch
from pathlib import Path,PurePosixPath
spec=importlib.util.spec_from_file_location('probe_test',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for name in ('ROOT','CONFIG','OPS_ROOT','CACHE','RESTORE','BACKUP'):setattr(m,name,PurePosixPath(getattr(m,name).as_posix()))
m.TARGETS={name:PurePosixPath(path.as_posix()) for name,path in m.TARGETS.items()}
REQUEST=json.loads(sys.stdin.read())
IDENTITY={'runtimeImageId':'sha256:'+'a'*64,'testedPlatformConfig':'sha256:'+'a'*64}
def props(final=False):
 p={'LoadState':'loaded','FragmentPath':'/etc/systemd/system/'+m.UNIT,'Type':'oneshot','User':'root','UMask':'0077','WorkingDirectory':str(m.CONFIG),'NoNewPrivileges':'yes','PrivateTmp':'yes','ProtectHome':'yes','ProtectSystem':'strict','MemoryMax':'268435456','CPUAccounting':'yes','MemoryAccounting':'yes','Restart':'no','RemainAfterExit':'no','StandardOutput':'journal','StandardError':'journal','UnitFileState':'static','CPUQuotaPerSecUSec':'1s','TimeoutStartUSec':'50s','TimeoutStopUSec':'5s','DropInPaths':' '.join(map(str,m.TARGETS.values())),'EnvironmentFiles':str(m.CONFIG/'deploy.env')+' (ignore_errors=no)','Environment':'PYTHONDONTWRITEBYTECODE=1 PYTHONPYCACHEPREFIX='+str(m.CACHE),'UnsetEnvironment':'PYTHONPATH PYTHONHOME PYTHONSTARTUP PYTHONCASEOK','ExecStart':'{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 '+str(m.OPS_ROOT/'runtime/scheduled.py')+' health --apply ; ignore_errors=no ; }','ExecStartPre':'{ argv[]=/usr/bin/test ! -e '+str(m.CACHE)+' ; } { argv[]=/usr/bin/test ! -L '+str(m.CACHE)+' ; }','ActiveState':'inactive','InvocationID':'a'*32 if final else '', 'ExecMainStartTimestampMonotonic':'1000000' if final else '0','ExecMainExitTimestampMonotonic':'38000000' if final else '0','ConditionResult':'yes','AssertResult':'yes','Result':'success','ExecMainCode':'1','ExecMainStatus':'0'}
 return p
def health():
 return {'scope':'morphiume-staging-runtime','expectedServiceMode':'running','expectLogicalBackups':True,'status':'healthy','alerts':[],'appReadiness':200,'runtimeImageId':IDENTITY['runtimeImageId'],'testedPlatformConfig':IDENTITY['testedPlatformConfig'],'accessProfile':'ssh-localhost','canonicalOrigin':'http://localhost:3100','databaseHealthy':True,'database':{'database':'morphiume_staging_runtime'},'containers':[{'service':s,'status':'running','health':'healthy','oomKilled':False,'engineIdentityMatches':True,'restarts':0} for s in ('app','worker')]}
class FakeRunner:
 def __init__(self,change=None,body=None): self.calls=[];self.started=False;self.change=change or {};self.body=body
 def properties(self): p=props(self.started);p.update(self.change if self.started else {});return p
 def start_once(self):
  assert not self.started;self.started=True;self.calls.append(['systemctl','start',m.UNIT]);return {'clientExit':0,'observerDeadlineExceeded':False,'observerFailed':False,'observedInvocationId':'a'*32,'wallSeconds':38,'clientStdout':'','clientStderr':'','samples':[{'memoryPeakBytes':60000000,'cpuMicroseconds':32000000,'oom':0,'oomKill':0}]}
 def run(self,args):self.calls.append(args);return json.dumps({'MESSAGE':json.dumps(health() if self.body is None else self.body)})
class Pure(unittest.TestCase):
 def test_effective_positive(self):m.validate_effective(props())
 def test_budget_falsification(self):
  for key,value in [('MemoryMax','536870912'),('CPUQuotaPerSecUSec','2s'),('TimeoutStartUSec','120s'),('TimeoutStopUSec','90s')]:
   with self.subTest(key=key),self.assertRaises(ValueError):p=props();p[key]=value;m.validate_effective(p)
 def test_hardening_and_env(self):
  for key,value in [('NoNewPrivileges','no'),('ProtectHome','no'),('ProtectSystem','full'),('PrivateTmp','no'),('User','1001'),('Environment','DATABASE_URL=secret'),('EnvironmentFiles','/etc/other'),('UnsetEnvironment',''),('DropInPaths',props()['DropInPaths']+' /evil.conf')]:
   with self.subTest(key=key),self.assertRaises(ValueError):p=props();p[key]=value;m.validate_effective(p)
 def test_exec_cannot_backup_or_skip_guards(self):
  for key,value in [('ExecStart',props()['ExecStart'].replace(' health ',' backup ')),('ExecStartPre',''),('ExecStart',props()['ExecStart'].replace('ignore_errors=no','ignore_errors=yes'))]:
   with self.subTest(key=key),self.assertRaises(ValueError):p=props();p[key]=value;m.validate_effective(p)
 def test_one_complete_start(self):
  r=FakeRunner();v=m.measure_once(r,IDENTITY);self.assertTrue(v['accepted']);self.assertEqual(v['executionSeconds'],37);self.assertEqual(sum(x[:2]==['systemctl','start'] for x in r.calls),1);self.assertTrue(all('timer' not in ' '.join(x) and 'backup' not in ' '.join(x) for x in r.calls))
 def test_failed_unit_preserves_without_retry(self):
  for change in ({'Result':'timeout'},{'ConditionResult':'no'},{'AssertResult':'no'},{'ExecMainStatus':'2'},{'ExecMainStartTimestampMonotonic':'0'}):
   with self.subTest(change=change):
    r=FakeRunner(change);v=m.measure_once(r,IDENTITY);self.assertFalse(v['accepted']);self.assertIn('journal',v);self.assertIn('samples',v);self.assertIn('health',v);self.assertEqual(sum(x[:2]==['systemctl','start'] for x in r.calls),1)
 def test_incomplete_or_critical_json(self):
  for body in ({'scope':'morphiume-staging-runtime','status':'healthy'},health()|{'alerts':[{'secret':'not printed'}]},health()|{'appReadiness':503}):
   r=FakeRunner(body=body);self.assertFalse(m.measure_once(r,IDENTITY)['accepted']);self.assertEqual(len([x for x in r.calls if x[:2]==['systemctl','start']]),1)
 def test_no_second_start_on_prior_invocation(self):
  r=FakeRunner();r.started=True
  with self.assertRaises(ValueError):m.measure_once(r,IDENTITY)
  self.assertEqual(r.calls,[])
 def test_no_sample_is_not_memory_measurement(self):
  r=FakeRunner();old=r.start_once
  def start():v=old();v['samples']=[];return v
  r.start_once=start;self.assertFalse(m.measure_once(r,IDENTITY)['accepted'])
 def test_oom_preserved(self):
  r=FakeRunner();old=r.start_once
  def start():v=old();v['samples'][0]['oomKill']=1;return v
  r.start_once=start;v=m.measure_once(r,IDENTITY);self.assertFalse(v['accepted']);self.assertEqual(v['samples'][0]['oomKill'],1)
 def test_cleared_final_invocation_uses_observed_same_cycle(self):self.assertTrue(m.measure_once(FakeRunner({'InvocationID':''}),IDENTITY)['accepted'])
 def test_command_allowlist_no_enable_backup_stop_reset(self):
  with patch.object(m.subprocess,'run') as command:
   r=m.Runner()
   for args in (['systemctl','enable',m.UNIT],['systemctl','start','morphiume-runtime-backup.service'],['systemctl','reset-failed'],['docker','stop','worker'],['psql','UPDATE']):
    with self.assertRaises(ValueError):r.run(args)
   command.assert_not_called()
  with patch.object(m.subprocess,'run',return_value=type('Result',(),{'stdout':'LoadState=loaded\nActiveState=active\nUnitFileState=enabled\n','stderr':'','returncode':0})()) as command:
   m.Runner().properties('docker.service');self.assertEqual(command.call_args.args[0][-1],'--property=LoadState,ActiveState,UnitFileState');self.assertNotIn('Environment',command.call_args.args[0][-1])
 def test_duplicate_and_primitive_journal_rejected(self):
  for raw in ('{"MESSAGE":"a","MESSAGE":"b"}','null','[]'):
   with self.assertRaises(ValueError):m.journal_health(raw)
 def test_all21_files_hashed_before_import(self):
  root=Path('/synthetic');manifest={name:m.sha(('original '+name).encode()) for name in m.OPS_FILES};values={str(root/name):('original '+name).encode() for name in m.OPS_FILES}
  with patch.object(m,'protected_path'),patch.object(m,'read_protected',return_value=json.dumps(manifest).encode()),patch.object(Path,'read_bytes',lambda p:values[str(p)]):
   self.assertEqual(len(m.verify_bundle(root,m.canonical(manifest))),21);values[str(root/m.OPS_FILES[-1])]=b'tampered'
   with self.assertRaises(ValueError):m.verify_bundle(root,m.canonical(manifest))
 def test_failed_bundle_or_existing_prefix_prevents_old_import(self):
  with patch.object(m,'verify_bundle',side_effect=ValueError()),patch.object(m.importlib.util,'spec_from_file_location') as imported:
   with self.assertRaises(ValueError):m.bootstrap_old()
   imported.assert_not_called()
 def test_prefix_set_before_any_old_loader_executes(self):
  class Cache:
   parent=Path('/synthetic-protected')
   def exists(self):return False
   def is_symlink(self):return False
   def resolve(self):return self
   def __str__(self):return '/synthetic-protected/unused-bytecode-cache'
  class C:
   def assert_boundaries(self):pass
   def verify_ops_bundle(self,*args):pass
  class Loader:
   def exec_module(self,module):
    assert sys.dont_write_bytecode is True and sys.pycache_prefix=='/synthetic-protected/unused-bytecode-cache'
  previous=sys.pycache_prefix
  try:
   with patch.object(m,'verify_bundle'),patch.object(m,'protected_path'),patch.object(m,'CACHE',Cache()),patch.object(m.importlib.util,'spec_from_file_location',return_value=type('Spec',(),{'loader':Loader()})()),patch.object(m.importlib.util,'module_from_spec',return_value=C()):m.bootstrap_old()
  finally:sys.pycache_prefix=previous;sys.modules.pop('contract',None)
 def test_approval_no_overwrite_or_case_alias(self):
  approved=m.approval_record(REQUEST);m.validate_existing_approval(approved,REQUEST)
  for value in (approved|{'sharedDatabaseWindowReleased':False},approved|{'restoreEvidence':str(m.RESTORE).lower()+'/recovery-accepted.json'},approved|{'extra':'unreviewed'}):
   with self.assertRaises(ValueError):m.validate_existing_approval(value,REQUEST)
 def test_restore_result_serialization_timing_and_exact_booleans(self):
  r=copy.deepcopy(REQUEST);e=r['evidence'];identity=r['identity'];recovery={'toolSourceCommit':e['recoveryToolSourceCommit'],'toolSha256':m.RECOVERY_TOOL,'fixtureSha256':e['fixtureSha256'],'backupManifestSha256':e['backupManifestSha256']}
  result={'formatVersion':1,'mode':'six-business-checks-passed','startedAt':'2026-10-12T22:22:29.174Z','completedAt':'2026-10-12T22:23:03.008Z','durationMs':33833.6788,'target':{'identity':identity,'restoreProject':m.RESTORE_PROJECT,'restoreRoot':str(m.RESTORE),'backupDirectory':str(m.BACKUP),'baseURL':'http://localhost:3101','recovery':recovery},'workerStarted':False,'recoveryMarkerWritten':False,'checks':['native-login','owned-order','payment-dedup','stock-reservation','shipment-tracking','media-sha256']}
  result.update({key:e[key] for key in ('fixtureSha256','readyRecordSha256','journalSha256','restoreConfigSha256')});e['resultSemanticSha256']=m.canonical(result)
  marker=identity|{'mode':'native-business-restore-accepted','checks':dict.fromkeys(m.CHECKS,True),'workerStarted':False,'offsiteProtectionEstablished':False,'pitrEstablished':False,'restoreProject':m.RESTORE_PROJECT,'recoveryPointScope':'retained-business-fixture-to-writer-free-backup-capture','recoveryToolSha256':m.RECOVERY_TOOL,'recoveryToolSourceCommit':e['recoveryToolSourceCommit'],'resultSha256':e['localResultRawSha256'],'lastRetainedBusinessMutationUtc':'2026-10-12T21:24:42.542062+00:00','backupCaptureUtc':'2026-10-12T21:26:44.545224+00:00','backupCompleteUtc':'2026-10-12T21:26:45+00:00','recoveryStartUtc':'2026-10-12T21:27:29.611539+00:00','businessCheckStartedUtc':'2026-10-12T22:22:29.174000+00:00','acceptedUtc':'2026-10-12T22:23:03.008000+00:00','observedRtoSeconds':3333.396461,'observedRecoveryPointGapSeconds':122.003162,'businessCheckDurationMs':33833.6788}
  marker.update({key:e[key] for key in ('fixtureSha256','readyRecordSha256','journalSha256','restoreConfigSha256')})
  journal={k:v for k,v in identity.items() if k!='accessProfileSha256'}|{'profileSha256':identity['accessProfileSha256'],'toolSha256':m.RECOVERY_TOOL,'toolSourceCommit':e['recoveryToolSourceCommit'],'root':str(m.RESTORE),'project':m.RESTORE_PROJECT,'backup':str(m.BACKUP),'fixtureSha256':e['fixtureSha256'],'backupManifestSha256':e['backupManifestSha256'],'workerStarted':False,'automaticResume':False,'phase':'ready-business-acceptance-pending','readyRecordSha256':e['readyRecordSha256'],'originalRecoveryStartUtc':marker['recoveryStartUtc']}
  ready=journal|{'phase':'ready-record-started','browserOrigin':'http://localhost:3101','recoveryStartUtc':marker['recoveryStartUtc']};manifest={k:v for k,v in identity.items() if k!='accessProfileSha256'}|{'database':'morphiume_staging_runtime','backupOpsSha256':m.OPS,'businessBaseline':{'capturedUtc':marker['backupCaptureUtc']},'backupCompleteUtc':marker['backupCompleteUtc']}
  m.validate_marker(marker,result,journal,ready,manifest,r)
  for key,value in (('observedRtoSeconds',0),('observedRecoveryPointGapSeconds',float('nan')),('recoveryStartUtc','2026-10-12T22:20:00Z'),('resultSha256',e['remoteResultRawSha256'])):
   with self.subTest(key=key),self.assertRaises(ValueError):m.validate_marker(marker|{key:value},result,journal,ready,manifest,r)
  malformed=copy.deepcopy(marker);malformed['checks']['nativeLogin']=1
  with self.assertRaises(ValueError):m.validate_marker(malformed,result,journal,ready,manifest,r)
  with patch.object(m,'verify_bundle'),patch.object(m,'protected_path'),patch.object(m,'CACHE',Path('/synthetic-cache')),patch.object(Path,'exists',return_value=True),patch.object(m.importlib.util,'spec_from_file_location') as imported:
   with self.assertRaises(ValueError):m.bootstrap_old()
   imported.assert_not_called()
suite=unittest.defaultTestLoader.loadTestsFromTestCase(Pure);result=unittest.TextTestRunner(verbosity=0).run(suite)
print(json.dumps({'pythonPureCases':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'realCommands':0,'oldImports':0}))
raise SystemExit(0 if result.wasSuccessful() else 1)
`;
  const child = spawnSync("python", ["-B", "-c", script, resolve("deploy/staging/post-restore/measure-591-health-remote.py")], { encoding: "utf8", input: JSON.stringify(request()), timeout: 15000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr); const result = JSON.parse(child.stdout.trim()); assert.equal(result.pythonPureCases, 18); assert.equal(result.failures, 0); assert.equal(result.errors, 0); assert.equal(result.realCommands, 0);
});

test("actual Linux repeated ExecStartPre formatting passes while scalar and execution guards stay strict", () => {
  const script = String.raw`
import importlib.util,json,sys,unittest
from pathlib import PurePosixPath
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('parser_test',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for name in ('ROOT','CONFIG','OPS_ROOT','CACHE','RESTORE','BACKUP'):setattr(m,name,PurePosixPath(getattr(m,name).as_posix()))
m.TARGETS={name:PurePosixPath(path.as_posix()) for name,path in m.TARGETS.items()}
# Exact old properties body from published52/79e; actual bytes were preserved
# and separately tested before integration. This fixture needs no Git/remote.
class Published79Runner(m.Runner):
 def properties(self,unit=m.UNIT):
  selected=m.PROPERTIES if unit==m.UNIT else ('LoadState','ActiveState','UnitFileState')
  raw=self.run(['systemctl','show',unit,'--property='+','.join(selected)])
  pairs=[line.split('=',1) for line in raw.splitlines() if '=' in line];m.require(len(pairs)==len({p[0] for p in pairs}))
  return dict(pairs)
def pre(flag):return '{ path=/usr/bin/test ; argv[]=/usr/bin/test ! '+flag+' '+str(m.CACHE)+' ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }'
def props():
 return {'LoadState':'loaded','FragmentPath':'/etc/systemd/system/'+m.UNIT,'Type':'oneshot','User':'root','UMask':'0077','WorkingDirectory':str(m.CONFIG),'NoNewPrivileges':'yes','PrivateTmp':'yes','ProtectHome':'yes','ProtectSystem':'strict','MemoryMax':'268435456','CPUAccounting':'yes','MemoryAccounting':'yes','Restart':'no','RemainAfterExit':'no','StandardOutput':'journal','StandardError':'journal','UnitFileState':'static','CPUQuotaPerSecUSec':'1s','TimeoutStartUSec':'50s','TimeoutStopUSec':'5s','DropInPaths':' '.join(map(str,m.TARGETS.values())),'EnvironmentFiles':str(m.CONFIG/'deploy.env')+' (ignore_errors=no)','Environment':'PYTHONDONTWRITEBYTECODE=1 PYTHONPYCACHEPREFIX='+str(m.CACHE),'UnsetEnvironment':'PYTHONPATH PYTHONHOME PYTHONSTARTUP PYTHONCASEOK','ExecStart':'{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 '+str(m.OPS_ROOT/'runtime/scheduled.py')+' health --apply ; ignore_errors=no ; }','ActiveState':'inactive','InvocationID':'','ExecMainStartTimestampMonotonic':'0'}
def raw():return ''.join(key+'='+value+'\n' for key,value in props().items())+'ExecStartPre='+pre('-e')+'\nExecStartPre='+pre('-L')+'\n'
def response(value):return type('Result',(),{'stdout':value,'stderr':'','returncode':0})()
class Parser(unittest.TestCase):
 def test_published79_rejects_actual_collection_before_start(self):
  with patch.object(m.subprocess,'run',return_value=response(raw())) as command:
   runner=Published79Runner()
   with self.assertRaises(ValueError):runner.properties()
   self.assertEqual(runner.starts,0);self.assertEqual(command.call_count,1);self.assertEqual(command.call_args.args[0][:2],['systemctl','show'])
 def test_fixed_same_collection_all_effective_guards_pass(self):
  with patch.object(m.subprocess,'run',return_value=response(raw())) as command:
   runner=m.Runner();value=runner.properties();m.validate_effective(value)
   self.assertEqual(m.argv_vectors(value['ExecStartPre']),[['/usr/bin/test','!','-e',str(m.CACHE)],['/usr/bin/test','!','-L',str(m.CACHE)]])
   self.assertEqual(runner.starts,0);self.assertEqual(command.call_count,1)
 def test_prior_joined_mock_form_still_passes(self):
  value=raw().replace('ExecStartPre='+pre('-e')+'\nExecStartPre='+pre('-L'),'ExecStartPre='+pre('-e')+' '+pre('-L'));m.validate_effective(m.parse_properties(value))
 def test_every_duplicate_scalar_rejected(self):
  for key in m.PROPERTIES:
   if key=='ExecStartPre':continue
   with self.subTest(key=key),self.assertRaises(ValueError):m.parse_properties(key+'=synthetic\n'+key+'=synthetic\n')
 def test_unknown_property_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw()+'UnknownField=ignored\n')
 def test_unstructured_stdout_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw()+'unstructured line\n')
 def test_third_precheck_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw()+'ExecStartPre='+pre('-e')+'\n')
 def test_repeated_identical_precheck_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw().replace(pre('-L'),pre('-e')))
 def test_wrong_order_rejected(self):
  value=''.join(key+'='+value+'\n' for key,value in props().items())+'ExecStartPre='+pre('-L')+'\nExecStartPre='+pre('-e')+'\n'
  with self.assertRaises(ValueError):m.parse_properties(value)
 def test_wrong_prefix_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw().replace(str(m.CACHE),'/unreviewed-cache'))
 def test_extra_hidden_vector_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw().replace(pre('-L'),pre('-L')+' '+pre('-e')))
 def test_missing_guard_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw().replace('ExecStartPre='+pre('-L')+'\n',''))
 def test_ignore_errors_true_rejected(self):
  with self.assertRaises(ValueError):m.parse_properties(raw().replace('ignore_errors=no','ignore_errors=yes'))
 def test_empty_not_found_collection_only_once(self):
  self.assertEqual(m.parse_properties('LoadState=not-found\nExecStartPre=\n')['ExecStartPre'],'')
  with self.assertRaises(ValueError):m.parse_properties('ExecStartPre=\nExecStartPre=\n')
  with self.assertRaises(ValueError):m.validate_effective(props()|{'ExecStartPre':''})
 def test_health_budgets_still_exact(self):
  for key,value in (('CPUQuotaPerSecUSec','2s'),('MemoryMax','536870912'),('TimeoutStartUSec','120s'),('TimeoutStopUSec','60s')):
   parsed=m.parse_properties(raw());parsed[key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):m.validate_effective(parsed)
 def test_selected_daemon_scope_rejects_health_collection(self):
  self.assertEqual(m.parse_properties('LoadState=loaded\nActiveState=active\nUnitFileState=enabled\n',('LoadState','ActiveState','UnitFileState'))['ActiveState'],'active')
  with self.assertRaises(ValueError):m.parse_properties(raw(),('LoadState','ActiveState','UnitFileState'))
suite=unittest.defaultTestLoader.loadTestsFromTestCase(Parser);result=unittest.TextTestRunner(verbosity=0).run(suite)
print(json.dumps({'pythonParserCases':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'realCommands':0,'oldOpsImports':0}))
raise SystemExit(0 if result.wasSuccessful() else 1)
`;
  const child = spawnSync("python", ["-B", "-c", script, resolve("deploy/staging/post-restore/measure-591-health-remote.py")], { encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr); const result = JSON.parse(child.stdout.trim()); assert.equal(result.pythonParserCases, 16); assert.equal(result.failures, 0); assert.equal(result.errors, 0); assert.equal(result.realCommands, 0); assert.equal(result.oldOpsImports, 0);
});

test("GC-only completion uses authenticated lifecycle timing and never invents execution time or repeats a start", () => {
  const cycle = { ...summary(), executionSeconds: null, unitCycleSeconds: 37, timingSource: "unit-lifecycle-journal" };
  validateSummary(cycle, request());
  for (const mutate of [s => s.unitCycleSeconds = 0, s => s.unitCycleSeconds = 51, s => s.unitCycleSeconds = NaN, s => s.executionSeconds = 37, s => s.timingSource = "wall-clock", s => s.unitCycleSeconds = null, s => s.timingSource = "exec-main-monotonic"]) {
    const value = { ...cycle }; mutate(value); assert.throws(() => validateSummary(value, request()));
  }
  const script = String.raw`
import importlib.util,json,sys,unittest,copy
from pathlib import PurePosixPath
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('gc_test',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from contextlib import ExitStack
for name in ('ROOT','CONFIG','OPS_ROOT','CACHE','RESTORE','BACKUP'):setattr(m,name,PurePosixPath(getattr(m,name).as_posix()))
m.TARGETS={name:PurePosixPath(path.as_posix()) for name,path in m.TARGETS.items()}
INV='a'*32;BOOT='b'*32;IDENTITY={'runtimeImageId':'sha256:'+'a'*64,'testedPlatformConfig':'sha256:'+'a'*64}
def props():
 return {'LoadState':'loaded','FragmentPath':'/etc/systemd/system/'+m.UNIT,'Type':'oneshot','User':'root','UMask':'0077','WorkingDirectory':str(m.CONFIG),'NoNewPrivileges':'yes','PrivateTmp':'yes','ProtectHome':'yes','ProtectSystem':'strict','MemoryMax':'268435456','CPUAccounting':'yes','MemoryAccounting':'yes','Restart':'no','RemainAfterExit':'no','StandardOutput':'journal','StandardError':'journal','UnitFileState':'static','CPUQuotaPerSecUSec':'1s','TimeoutStartUSec':'50s','TimeoutStopUSec':'5s','DropInPaths':' '.join(map(str,m.TARGETS.values())),'EnvironmentFiles':str(m.CONFIG/'deploy.env')+' (ignore_errors=no)','Environment':'PYTHONDONTWRITEBYTECODE=1 PYTHONPYCACHEPREFIX='+str(m.CACHE),'UnsetEnvironment':'PYTHONPATH PYTHONHOME PYTHONSTARTUP PYTHONCASEOK','ExecStart':'{ argv[]=/usr/bin/python3 '+str(m.OPS_ROOT/'runtime/scheduled.py')+' health --apply ; ignore_errors=no ; }','ExecStartPre':'{ argv[]=/usr/bin/test ! -e '+str(m.CACHE)+' ; } { argv[]=/usr/bin/test ! -L '+str(m.CACHE)+' ; }','ActiveState':'inactive','InvocationID':'','ConditionResult':'no','AssertResult':'no','Result':'success','ExecMainCode':'0','ExecMainStatus':'0','ExecMainStartTimestampMonotonic':'0','ExecMainExitTimestampMonotonic':'0','CPUUsageNSec':'[not set]','MemoryPeak':'[not set]'}
def health():
 return {'scope':'morphiume-staging-runtime','expectedServiceMode':'running','expectLogicalBackups':True,'status':'healthy','alerts':[],'appReadiness':200,'runtimeImageId':IDENTITY['runtimeImageId'],'testedPlatformConfig':IDENTITY['testedPlatformConfig'],'accessProfile':'ssh-localhost','canonicalOrigin':'http://localhost:3100','databaseHealthy':True,'database':{'database':'morphiume_staging_runtime'},'containers':[{'service':s,'status':'running','health':'healthy','oomKilled':False,'engineIdentityMatches':True,'restarts':0} for s in ('app','worker')]}
def healthy_entry():
 return {'MESSAGE':json.dumps(health()),'_SYSTEMD_INVOCATION_ID':INV,'_SYSTEMD_UNIT':m.UNIT,'_UID':'0','_PID':'1234','_TRANSPORT':'stdout','_EXE':'/usr/bin/python3.12','_CMDLINE':'/usr/bin/python3 '+str(m.OPS_ROOT/'runtime/scheduled.py')+' health --apply','_BOOT_ID':BOOT,'__MONOTONIC_TIMESTAMP':'36000000'}
def entries():
 base={'_PID':'1','_UID':'0','_TRANSPORT':'journal','UNIT':m.UNIT,'_BOOT_ID':BOOT,'INVOCATION_ID':INV}
 return [base|{'MESSAGE_ID':'7d4958e842da4a758f6c1cdc7b36dcc5','__MONOTONIC_TIMESTAMP':'1000000','JOB_TYPE':'start','JOB_ID':'42'},base|{'MESSAGE_ID':'7ad2d189f7e94e70a38c781354912448','__MONOTONIC_TIMESTAMP':'37000000'},base|{'MESSAGE_ID':'39f53479d3a045ac8e11786248231fbf','__MONOTONIC_TIMESTAMP':'38000000','JOB_TYPE':'start','JOB_ID':'42','JOB_RESULT':'done'},base|{'MESSAGE_ID':'ae8f7b866b0347b9af31fe1c80b127c0','__MONOTONIC_TIMESTAMP':'39000000'}]
def lines(value):return ''.join(json.dumps(entry)+'\n' for entry in value)
def retained():
 return {'accepted':False,'properties':props(),'clientExit':0,'observerDeadlineExceeded':False,'observerFailed':False,'observedInvocationId':INV,'invocationId':INV,'journal':lines([healthy_entry()]),'health':health(),'samples':[{'memoryPeakBytes':60000000,'cpuMicroseconds':32000000,'oom':0,'oomKill':0}],'wallSeconds':38}
class FakeRunner:
 def __init__(self,changes=None):self.started=False;self.calls=[];self.changes=changes or {}
 def properties(self):return props()|(self.changes if self.started else {})
 def start_once(self):
  assert not self.started;self.started=True;self.calls.append(['systemctl','start',m.UNIT]);return retained()
 def run(self,args):self.calls.append(args);return lines(entries()) if len(args)==7 else lines([healthy_entry()])
class GC(unittest.TestCase):
 def test_same_gc_shape_complete_one_start_and_cycle_only(self):
  r=FakeRunner();result=m.measure_once(r,IDENTITY);self.assertTrue(result['accepted']);self.assertIsNone(result['executionSeconds']);self.assertEqual(result['unitCycleSeconds'],37);self.assertEqual(result['timingSource'],'unit-lifecycle-journal');self.assertEqual(sum(args[:2]==['systemctl','start'] for args in r.calls),1)
 def test_pure_retained_reconciliation_never_mutates_or_commands(self):
  value=retained();before=copy.deepcopy(value)
  with patch.object(m.subprocess,'run') as run,patch.object(m.subprocess,'Popen') as start:
   result=m.reconcile_gc_measurement(value,IDENTITY,lines(entries()));self.assertTrue(result['measurementReconciled']);self.assertIsNone(result['executionSeconds']);self.assertEqual(value,before);run.assert_not_called();start.assert_not_called()
 def test_boot_and_invocation_mismatch(self):
  for key in ('_BOOT_ID','INVOCATION_ID'):
   value=entries();value[1][key]='c'*32
   with self.subTest(key=key),self.assertRaises(ValueError):m.gc_journal_timing(lines(value),lines([healthy_entry()]),INV)
 def test_manager_metadata_cannot_be_forged(self):
  for key,value in (('_PID','1234'),('_UID','1001'),('_TRANSPORT','stdout'),('UNIT','other.service')):
   rows=entries();rows[0][key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):m.gc_journal_timing(lines(rows),lines([healthy_entry()]),INV)
 def test_each_missing_lifecycle_event_fails(self):
  for index in range(3):
   rows=entries();rows.pop(index)
   with self.subTest(index=index),self.assertRaises(ValueError):m.gc_journal_timing(lines(rows),lines([healthy_entry()]),INV)
 def test_duplicates_unknown_messages_and_primitive_rows_fail(self):
  for rows in (entries()+[entries()[0]],entries()+[entries()[0]|{'MESSAGE_ID':'unknown'}],[None]):
   with self.assertRaises(ValueError):m.gc_journal_timing(lines(rows),lines([healthy_entry()]),INV)
 def test_start_job_must_complete_same_id_successfully(self):
  for key,value in (('JOB_RESULT','failed'),('JOB_TYPE','stop'),('JOB_ID','43')):
   rows=entries();rows[2][key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):m.gc_journal_timing(lines(rows),lines([healthy_entry()]),INV)
 def test_actual_order_and_deadline_not_wall_or_fake_execution(self):
  for index,value in ((0,'0'),(1,'1000000'),(2,'51000001'),(2,'NaN'),(3,'1')):
   rows=entries();rows[index]['__MONOTONIC_TIMESTAMP']=value
   with self.subTest(index=index,value=value),self.assertRaises(ValueError):m.gc_journal_timing(lines(rows),lines([healthy_entry()]),INV)
 def test_health_requires_trusted_python_main_unit_context(self):
  with self.assertRaises(ValueError):m.gc_journal_timing(lines(entries()),None,INV)
  for key,value in (('_UID','1001'),('_PID','1'),('_EXE','/usr/bin/node'),('_CMDLINE','/usr/bin/python3 untrusted.py'),('_TRANSPORT','journal'),('_SYSTEMD_UNIT','other.service'),('_SYSTEMD_INVOCATION_ID','c'*32),('_BOOT_ID','bad'),('__MONOTONIC_TIMESTAMP','0')):
   row=healthy_entry();row[key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):m.gc_journal_timing(lines(entries()),lines([row]),INV)
 def test_partial_real_failure_must_not_take_gc_fallback(self):
  r=FakeRunner({'ExecMainCode':'1','ExecMainStartTimestampMonotonic':'1000000','ExecMainExitTimestampMonotonic':'38000000'});result=m.measure_once(r,IDENTITY);self.assertFalse(result['accepted']);self.assertFalse(any(len(args)==7 for args in r.calls))
 def test_observer_samples_oom_health_and_identity_stay_required(self):
  for value in (retained()|{'clientExit':1},retained()|{'observerFailed':True},retained()|{'samples':[]},retained()|{'samples':[{'memoryPeakBytes':1,'cpuMicroseconds':1,'oom':0,'oomKill':1}]},retained()|{'observedInvocationId':'c'*32}):
   with self.assertRaises(ValueError):m.reconcile_gc_measurement(value,IDENTITY,lines(entries()))
  for body in (health()|{'alerts':[{}]},health()|{'appReadiness':503},health()|{'runtimeImageId':'sha256:'+'c'*64}):
   value=retained();row=healthy_entry();row['MESSAGE']=json.dumps(body);value.update({'journal':lines([row]),'health':body})
   with self.assertRaises(ValueError):m.reconcile_gc_measurement(value,IDENTITY,lines(entries()))
 def test_journal_command_allowlist_is_exact_and_readonly(self):
  args=['journalctl','--no-pager','--output=json','_PID=1','_BOOT_ID='+BOOT,'UNIT='+m.UNIT,'INVOCATION_ID='+INV]
  with patch.object(m.subprocess,'run',return_value=type('Result',(),{'stdout':'','stderr':'','returncode':0})()) as run:
   m.Runner().run(args);self.assertEqual(run.call_count,1)
   for index,value in ((3,'_PID=1234'),(4,'_BOOT_ID=bad'),(5,'UNIT=other.service'),(6,'INVOCATION_ID=bad')):
    changed=args.copy();changed[index]=value
    with self.assertRaises(ValueError):m.Runner().run(changed)
   self.assertEqual(run.call_count,1)
 def test_real_failure_path_retains_observed_before_without_acceptance(self):
  class MockPath(PurePosixPath):
   def exists(self):return False
   def is_symlink(self):return False
  class FailureRunner:
   def __init__(self):self.commands=[];self.starts=0
   def properties(self,unit=m.UNIT):return {'ActiveState':'active'} if unit in ('docker.service','containerd.service') else {'LoadState':'not-found','ActiveState':'inactive','UnitFileState':'not-found'}
   def run(self,args):self.commands.append(args);return ''
  fixed='d'*64
  identity={key:fixed for key in m.IDENTITY_KEYS};identity.update({'sourceCommit':m.SOURCE,'opsSha256':m.OPS,'runtimeImageId':'sha256:'+fixed})
  publication={'remoteToolSha256':fixed}
  evidence={key:fixed for key in m.HASH_KEYS};evidence['recoveryToolSourceCommit']='e'*40
  request={'identity':identity,'publication':publication,'evidence':evidence,'measurementId':'12345678-abcd-4abc-8abc-123456789abc'}
  observed={'original':{'id':'observed-before-original'},'runtime':[{'id':'observed-before-runtime'}],'restoreStoppedCount':2}
  contract=type('Contract',(),{})();contract.deployed_image=lambda:identity;contract.active_profile=lambda required:{'profile':'ssh-localhost','origin':'http://localhost:3100'};contract.canonical_hash=lambda value:fixed;contract.load_configs=lambda:None
  def read(path,*args,**kwargs):
   if path.name=='operator-tool.json':return json.dumps(publication|{'applicationSourceCommit':m.SOURCE,'opsSha256':m.OPS}).encode()
   if path.name=='tool-identity.json':return json.dumps({'sourceCommit':evidence['recoveryToolSourceCommit'],'toolSha256':fixed,'applicationSourceCommit':m.SOURCE,'opsSha256':m.OPS}).encode()
   if path.name=='deploy.env':return ('MORPHIUME_IMAGE='+identity['runtimeImageId']+'\nMORPHIUME_OPS_ROOT='+str(m.OPS_ROOT)+'\nMORPHIUME_APP_BASE_URL=http://localhost:3100\n').encode()
   return b'{}'
  constants={name:MockPath(getattr(m,name).as_posix()) for name in ('ROOT','CONFIG','OPS_ROOT','CACHE','RESTORE','BACKUP')}
  for phase in ('measured-failure','postproof-failure'):
   written=[]
   def measure(runner,*args):runner.starts+=1;return {'accepted':phase=='postproof-failure'}
   with self.subTest(phase=phase),ExitStack() as stack:
    stack.enter_context(patch.multiple(m,**constants,Path=MockPath,BASE_SHA=fixed,RECOVERY_TOOL=fixed,DROPINS={name:fixed for name in m.DROPINS}))
    stack.enter_context(patch.object(m.sys,'platform','linux'))
    stack.enter_context(patch.object(m.os,'getuid',return_value=0,create=True))
    stack.enter_context(patch.object(m,'validate_request'))
    stack.enter_context(patch.object(m,'protected_path'))
    stack.enter_context(patch.object(m,'read_protected',side_effect=read))
    stack.enter_context(patch.object(m,'sha',return_value=fixed))
    stack.enter_context(patch.object(m,'bootstrap_old',return_value=contract))
    stack.enter_context(patch.object(m,'validate_marker'))
    stack.enter_context(patch.object(m,'Runner',FailureRunner))
    captured=stack.enter_context(patch.object(m,'runtime_state',return_value=observed))
    mkdir=stack.enter_context(patch.object(m.os,'mkdir'))
    stack.enter_context(patch.object(m,'write_exclusive',side_effect=lambda path,body,*args,**kwargs:written.append((path,json.loads(body)))))
    stack.enter_context(patch.object(m,'install_public'))
    stack.enter_context(patch.object(m,'validate_effective'))
    stack.enter_context(patch.object(m,'measure_once',side_effect=measure))
    stack.enter_context(patch.object(m,'verify_bundle',side_effect=ValueError('mock postproof rejection')))
    command=stack.enter_context(patch.object(m.subprocess,'run'))
    start=stack.enter_context(patch.object(m.subprocess,'Popen'))
    summary=m.run_locked(request)
    private=[body for path,body in written if path.name=='private-evidence.json'];self.assertEqual(len(private),1)
    self.assertEqual(private[0]['before'],observed);self.assertFalse(private[0]['accepted']);self.assertFalse(private[0]['originalTableEqualityMeasured']);self.assertFalse(private[0]['automaticRetry'])
    self.assertFalse(summary['accepted']);self.assertFalse(summary['originalTableEqualityMeasured']);self.assertNotIn('before',summary);self.assertEqual(summary['systemctlStartCount'],1)
    self.assertEqual(private[0]['measurement']['accepted'],phase=='postproof-failure');self.assertEqual(private[0]['mode'],'scheduled-health-failed')
    captured.assert_called_once();mkdir.assert_called_once();command.assert_not_called();start.assert_not_called()
suite=unittest.defaultTestLoader.loadTestsFromTestCase(GC);result=unittest.TextTestRunner(verbosity=0).run(suite)
print(json.dumps({'pythonGcCases':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'realCommands':0,'oldOpsImports':0}))
raise SystemExit(0 if result.wasSuccessful() else 1)
`;
  const child = spawnSync("python", ["-B", "-c", script, resolve("deploy/staging/post-restore/measure-591-health-remote.py")], { encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr); const result = JSON.parse(child.stdout.trim()); assert.equal(result.pythonGcCases, 13); assert.equal(result.failures, 0); assert.equal(result.errors, 0); assert.equal(result.realCommands, 0); assert.equal(result.oldOpsImports, 0);
});
