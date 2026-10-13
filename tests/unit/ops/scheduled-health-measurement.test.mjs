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
  return { schemaVersion: 1, mode: "scheduled-health-measured", accepted: true, identity: r.identity, privateEvidenceSha256: sha, measurementId: r.measurementId, systemctlStartCount: 1, unitResult: "success", wallSeconds: 38, executionSeconds: 37, sampleCount: 100, sampledMemoryPeakBytes: 60_000_000, sampledCpuMicroseconds: 32_000_000, alertsCount: 0, appReadiness: 200, timersStarted: false, backupExecuted: false, writerStopExecuted: false, sqlMutationExecuted: false, originalTableEqualityMeasured: false };
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
