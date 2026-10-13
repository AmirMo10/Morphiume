import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { accepted, checkNames, prepared, validateTarget, validateFixture, validateObservation, ownedOrder, paymentDedup, stockReservation, shipmentTracking, observedNative, safeFailure, sha256, utc } from './e4-restore-business-contract.mjs';
import { runChecks, runAndRecord, transportEnvironment, remoteProgram } from './e4-restore-business-acceptance.mjs';

// Every identity, phone, hash and response below is synthetic. These tests make
// no SSH, PG, browser, fetch, auth or payment request and emit no private fixture.
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const mediaBytes = Buffer.from('synthetic media bytes, never an uploaded image');
const clone = value => structuredClone(value);
function target() {
  const hashes = Object.fromEntries(['fixtureSha256','backupManifestSha256','databaseCiphertextSha256','mediaCiphertextSha256','restoreReadySha256','restoreStartSha256','restoreConfigSha256','acceptanceToolSha256','contractToolSha256'].map(k => [k,'a'.repeat(64)]));
  return {schemaVersion:1,kind:'E4-restore-business-handoff',baseURL:'http://localhost:3101',sourceOrigin:'http://localhost:3100',identity:{...accepted},restoreProject:'morphiume-runtime-restore-20261013t090000z-abcdef',restoreRoot:'/srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261013t090000z-abcdef',backupDirectory:'/srv/morphiume/staging/runtime/backups/20261013T083000Z-abcdef12',fixturePath:'/var/tmp/synthetic-e4-copy/.local/restore-acceptance.json',hashes,toolSourceCommit:'b'.repeat(40),attestations:{approved:true,windowReleased:true,fixtureChromiumPassed:true,fixtureCleanupVerified:true,freshE4BackupVerified:true,restoreReadyVerified:true,workerNeverStarted:true}};
}
function fixture() {return {fixtureId:ids[0],createdAt:'2026-10-13T08:00:00.000Z',baseURL:'http://localhost:3100',phone:'+989000000001',orderId:ids[1],productId:ids[2],media:[{url:`/media/${ids[3]}.webp`,sha256:sha256(mediaBytes)}],expected:{paymentStatus:'paid',stockOnHand:2,stockReserved:0,receipts:1,shipments:1,trackingCode:'QA-TRACK-11111111',unitPriceIrr:'1234560'}};}
function observation() {const t=target();return {mode:'E4-restore-readonly-observation',binding:{identity:{...accepted},project:t.restoreProject,root:t.restoreRoot,backup:t.backupDirectory,schemaCount:13,serverVersionNum:180006,workerStarted:false,backupStartUtc:'2026-10-13T08:30:00+00:00',backupCompleteUtc:'2026-10-13T08:31:00.123456+00:00',recoveryStartUtc:'2026-10-13T09:00:00Z',applicationReadyUtc:'2026-10-13T09:01:00Z',hashes:Object.fromEntries(['backupManifestSha256','restoreReadySha256','restoreStartSha256','restoreConfigSha256'].map(k=>[k,t.hashes[k]]))},snapshot:{database:'morphiume_staging_restore',role:'morphiume_restore_app',readOnly:true,roleSafe:true,ddlDenied:true,customerId:'synthetic-customer',order:{paymentStatus:'paid',subtotal:'1234560',discount:'0',shipping:'0',tax:'0',total:'1234560',committed:true},items:[{quantity:1,price:'1234560',lineTotal:'1234560',productMatches:true}],attempts:[{authority:`MOCK-${ids[4]}`,status:'succeeded',provider:'mock'}],receipts:[{id:ids[4],disposition:'primary',amountIrr:'1234560'}],commitments:1,commitDelta:-1,commitReservedDelta:-1,reservationCount:1,activeReservations:0,consumedReservations:1,consumedQuantity:1,balances:[{onHand:2,reserved:0}],shipments:1,shipment:{status:'shipped',trackingMatches:true,carrierPresent:true}}};}
function orderBody() {const s=observation().snapshot;return {data:{id:fixture().orderId,paymentStatus:'paid',...Object.fromEntries(['subtotal','discount','shipping','tax','total'].map(k=>[k,{currency:'IRR',amountIrr:s.order[k]}])),items:[{quantity:1,unitPrice:{currency:'IRR',amountIrr:'1234560'},lineTotal:{currency:'IRR',amountIrr:'1234560'}}],shipment:{status:'shipped',trackingCode:fixture().expected.trackingCode,carrier:'synthetic carrier'}}};}
function rejectsSafe(action, code) {assert.throws(action,error=>error.safeCode===code&&!error.message.includes(fixture().phone));}
const response = (status,body={},headers={}) => ({status:()=>status,headers:()=>headers,body:async()=>Buffer.from(JSON.stringify(body))});

test('default record is blocked and all pending actual bindings remain null',()=>{const p=prepared();assert.equal(p.actionAuthorized,false);assert.equal(p.suiteRetry,0);for(const k of ['fixtureSha256','backupManifestSha256','ciphertextSha256','restoreProject','restoreRoot','restoreReadySha256'])assert.equal(p[k],null);rejectsSafe(()=>validateTarget(p),'target');});
test('default CLI only prints the blocked plan without private configuration',()=>{const result=execFileSync(process.execPath,['tests/ops/e4-restore-business-acceptance.mjs'],{cwd:new URL('../..',import.meta.url),encoding:'utf8',env:transportEnvironment(process.env)});assert.equal(JSON.parse(result).actionAuthorized,false);});
test('exact E4 eight identities and fresh namespaces satisfy the pure contract',()=>{assert.deepEqual(validateTarget(target()),target());assert.equal(Object.keys(accepted).length,8);assert.equal(validateFixture(fixture()).expected.paymentStatus,'paid');assert.equal(validateObservation(observation(),target(),fixture()).binding.schemaCount,13);});
for(const k of Object.keys(accepted)) test(`wrong E4 identity ${k} is rejected`,()=>{const t=target();t.identity[k]='0'.repeat(k==='sourceCommit'?40:64);rejectsSafe(()=>validateTarget(t),'identity');});
for(const [label,change,code] of [
  ['old613 source',t=>t.identity.sourceCommit='6130f4ed7ec090344a5a4a1937a65ef04572975b','identity'],
  ['old613 project',t=>{t.restoreProject='morphiume-runtime-restore-20261012t212729z-d03c35';t.restoreRoot=`/srv/morphiume/staging/runtime/restore/${t.restoreProject}`;},'project'],
  ['uppercase restore project',t=>t.restoreProject=t.restoreProject.replace('t090000z','T090000Z'),'project'],
  ['legacy uppercase root',t=>t.restoreRoot=t.restoreRoot.replace('t090000z','T090000Z'),'project'],
  ['different root project',t=>t.restoreRoot+='/extra','project'],
  ['old613 backup',t=>t.backupDirectory='/srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce','backup-path'],
  ['backup traversal',t=>t.backupDirectory+='/../elsewhere','backup-path'],
  ['runtime origin',t=>t.baseURL='http://localhost:3100','target'],
  ['external origin',t=>t.baseURL='https://example.invalid','target'],
  ['old fixture path',t=>t.fixturePath='S:/Morphiume-runtime-613/.local/restore-acceptance.json','fixture-path'],
  ['relative fixture path',t=>t.fixturePath='.local/restore-acceptance.json','fixture-path'],
  ['fixture traversal',t=>t.fixturePath='/var/tmp/../copy/.local/restore-acceptance.json','fixture-path'],
  ['null actual fixture hash',t=>t.hashes.fixtureSha256=null,'handoff'],
  ['zero ciphertext hash',t=>t.hashes.databaseCiphertextSha256='0'.repeat(64),'handoff'],
  ['missing approval',t=>t.attestations.approved=false,'handoff'],
  ['unverified final cleanup',t=>t.attestations.fixtureCleanupVerified=false,'handoff'],
  ['missing published tool commit',t=>t.toolSourceCommit=null,'handoff'],
]) test(`target rejects ${label}`,()=>{const t=target();change(t);rejectsSafe(()=>validateTarget(t),code);});
for(const [label,change,code] of [
  ['pre-activation timestamp',f=>f.createdAt='2026-10-13T07:44:06.999Z','fixture'],
  ['wrong source origin',f=>f.baseURL='http://localhost:3101','fixture'],
  ['non-v4 owned order',f=>f.orderId=ids[1].replace('4222','1222'),'fixture'],
  ['fractional price',f=>f.expected.unitPriceIrr='1234560.0','fixture-expectation'],
  ['pending payment',f=>f.expected.paymentStatus='pending','fixture-expectation'],
  ['changed tracking key',f=>f.expected.trackingCode='wrong','fixture-expectation'],
  ['non-UUID media path',f=>f.media[0].url='/media/../image.webp','media-target'],
  ['additional unbounded media',f=>f.media.push(clone(f.media[0])),'media-target'],
  ['fixture containing raw token',f=>f.authToken='unaccepted-private-token','fixture'],
]) test(`fixture rejects ${label}`,()=>{const f=fixture();change(f);rejectsSafe(()=>validateFixture(f),code);});
test('UTC syntax rejects nonexistent calendar date rather than normalizing it',()=>rejectsSafe(()=>utc('2026-02-30T00:00:00Z'),'time'));
test('identity member order does not change a legitimate observation',()=>{const o=observation();o.binding.identity=Object.fromEntries(Object.entries(accepted).reverse());assert.equal(validateObservation(o,target(),fixture()).snapshot.role,'morphiume_restore_app');});
for(const [label,change,code] of [
  ['schema11',o=>o.binding.schemaCount=11,'identity'],
  ['wrong PG patch',o=>o.binding.serverVersionNum=180005,'identity'],
  ['worker started',o=>o.binding.workerStarted=true,'identity'],
  ['runtime database',o=>o.snapshot.database='morphiume_staging_runtime','identity'],
  ['original database',o=>o.snapshot.database='morphiume_staging','identity'],
  ['restore migration owner',o=>o.snapshot.role='morphiume_restore_owner','identity'],
  ['superuser runtime',o=>o.snapshot.roleSafe=false,'identity'],
  ['DDL permitted runtime',o=>o.snapshot.ddlDenied=false,'identity'],
  ['read-write SQL transaction',o=>o.snapshot.readOnly=false,'identity'],
  ['mismatched ready hash',o=>o.binding.hashes.restoreReadySha256='c'.repeat(64),'handoff'],
  ['unbound extra hash',o=>o.binding.hashes.extra='c'.repeat(64),'handoff'],
  ['backup older than fixture',o=>o.binding.backupStartUtc='2026-10-13T07:59:59Z','time'],
  ['ready before recovery',o=>o.binding.applicationReadyUtc='2026-10-13T08:59:59Z','time'],
  ['unvalidated control value',o=>o.mockControlSecret='not-a-control-secret','response-shape'],
]) test(`observation rejects ${label}`,()=>{const o=observation();change(o);rejectsSafe(()=>validateObservation(o,target(),fixture()),code);});
test('owned order requires exact server amounts and immutable selected line',()=>{ownedOrder(orderBody(),observation().snapshot,fixture());const body=orderBody();body.data.total.amountIrr='1234561';rejectsSafe(()=>ownedOrder(body,observation().snapshot,fixture()),'business-mismatch');});
for(const [label,change] of [
  ['second receipt',s=>s.receipts.push({...s.receipts[0],id:ids[0]})],
  ['same count different receipt id',s=>s.receipts[0].id=ids[0]],
  ['receipt amount mismatch',s=>s.receipts[0].amountIrr='1234561'],
  ['extra disposition',s=>s.receipts[0].disposition='extra'],
  ['different callback authority',s=>s.attempts[0].authority=`MOCK-${ids[0]}`],
  ['malformed authority UUID',s=>s.attempts[0].authority='MOCK-'+ '-'.repeat(36)],
  ['unknown attempt status',s=>s.attempts[0].status='unknown'],
  ['second payment attempt',s=>s.attempts.push(clone(s.attempts[0]))],
  ['uncommitted order',s=>s.order.committed=false],
  ['arithmetic mismatch',s=>{s.order.tax='1';}],
  ['fractional money',s=>s.order.shipping='0.1'],
  ['money overflow',s=>s.order.total='1000000001'],
  ['line quantity altered',s=>s.items[0].quantity=2],
  ['another product line',s=>s.items[0].productMatches=false],
]) test(`payment replay rejects ${label}`,()=>{const before=observation().snapshot,after=clone(before);change(after);rejectsSafe(()=>paymentDedup(before,after,fixture()),'business-mismatch');});
test('valid primary receipt callback preserves exact receipt/order/attempt evidence',()=>{const s=observation().snapshot;paymentDedup(s,clone(s),fixture());});
for(const [label,change] of [
  ['double commitment',s=>s.commitments=2],['double decrement',s=>s.commitDelta=-2],['reservation release mismatch',s=>s.commitReservedDelta=0],
  ['extra expired reservation',s=>s.reservationCount=2],['active reservation',s=>s.activeReservations=1],['consumed twice',s=>s.consumedReservations=2],
  ['wrong quantity',s=>s.consumedQuantity=2],['lost stock',s=>s.balances[0].onHand=1],['remaining reserved stock',s=>s.balances[0].reserved=1],['duplicate shipment',s=>s.shipments=2],
]) test(`stock check rejects ${label}`,()=>{const before=observation().snapshot,after=clone(before);change(after);rejectsSafe(()=>stockReservation(before,after,fixture()),'business-mismatch');});
test('stock check proves one commitment and exact reservation quantity',()=>{const s=observation().snapshot;stockReservation(s,clone(s),fixture());});
test('shipment needs both persisted and owned API tracking evidence',()=>{shipmentTracking(orderBody(),observation().snapshot,fixture());const body=orderBody();body.data.shipment.trackingCode='another-code';rejectsSafe(()=>shipmentTracking(body,observation().snapshot,fixture()),'business-mismatch');const s=observation().snapshot;s.shipment.trackingMatches=false;rejectsSafe(()=>shipmentTracking(orderBody(),s,fixture()),'business-mismatch');});
test('native 200 is one recorded action and never invokes wait',async()=>{const records=[];let calls=0;await observedNative(async()=>{calls++;return response(200);},{stage:'customer-otp-send',deadline:1000,clock:()=>0,sleep:()=>assert.fail('unexpected wait'),record:r=>records.push(r)});assert.equal(calls,1);assert.deepEqual(records,[{stage:'customer-otp-send',attempt:1,status:200,retryAfterSeconds:null,waitMs:0}]);});
test('one real numeric-X 429 allows only one second native action and records observed wait',async()=>{const records=[],waits=[];let calls=0,elapsed=0;await observedNative(async()=>{calls++;return calls===1?response(429,{}, {'x-retry-after':'1.2'}):response(200);},{stage:'customer-otp-verify',deadline:10000,clock:()=>elapsed,sleep:async ms=>{waits.push(ms);elapsed+=ms;},record:r=>records.push(r)});assert.equal(calls,2);assert.deepEqual(waits,[2250]);assert.equal(records[0].retryAfterSeconds,1.2);assert.equal(records[0].waitMs,2250);assert.deepEqual(records.map(r=>[r.attempt,r.status]),[[1,429],[2,200]]);});
test('60-second header is bounded in two wait segments and preserves actual elapsed time',async()=>{const waits=[];let n=0,elapsed=0;await observedNative(async()=>++n===1?response(429,{}, {'x-retry-after':'60'}):response(200),{stage:'customer-otp-send',deadline:70000,clock:()=>elapsed,sleep:async ms=>{waits.push(ms);elapsed+=ms;}});assert.deepEqual(waits,[60000,250]);assert.equal(n,2);});
for(const [label,headers] of [['missing',{}],['other retry header',{'retry-after':'1'}],['date',{'x-retry-after':'Tue, 13 Oct 2026 10:00:00 GMT'}],['negative',{'x-retry-after':'-1'}],['overflow',{'x-retry-after':'60.01'}],['nonfinite',{'x-retry-after':'Infinity'}]]) test(`native 429 rejects ${label} header without a retry`,async()=>{let calls=0;const records=[];await assert.rejects(observedNative(async()=>{calls++;return response(429,{},headers);},{stage:'customer-otp-send',deadline:100000,clock:()=>0,sleep:()=>assert.fail('unexpected wait'),record:r=>records.push(r)}),e=>e.safeCode==='retry-header');assert.equal(calls,1);assert.equal(records[0].status,429);assert.equal(records[0].waitMs,0);});
test('second429 has no third attempt or second wait',async()=>{let calls=0,elapsed=0;const records=[];await assert.rejects(observedNative(async()=>{calls++;return response(429,{}, {'x-retry-after':'0'});},{stage:'customer-otp-verify',deadline:1000,clock:()=>elapsed,sleep:async ms=>{elapsed+=ms;},record:r=>records.push(r)}),e=>e.safeCode==='native-status');assert.equal(calls,2);assert.deepEqual(records.map(r=>r.waitMs),[250,0]);});
test('deadline denies a native wait without falsely recording it as elapsed',async()=>{const records=[];await assert.rejects(observedNative(async()=>response(429,{}, {'x-retry-after':'2'}),{stage:'customer-otp-send',deadline:1000,clock:()=>0,sleep:()=>assert.fail('unexpected wait'),record:r=>records.push(r)}),e=>e.safeCode==='deadline');assert.equal(records[0].status,429);assert.equal(records[0].waitMs,0);});
test('unexpected native500 is recorded and cannot become an auth retry',async()=>{let calls=0;const records=[];await assert.rejects(observedNative(async()=>{calls++;return response(500);},{stage:'customer-otp-send',deadline:1000,clock:()=>0,sleep:()=>assert.fail('unexpected wait'),record:r=>records.push(r)}),e=>e.safeCode==='native-status');assert.equal(calls,1);assert.equal(records[0].status,500);});
test('transport environment retains ProgramData case and drops all app/owner/auth credentials',()=>{const e=transportEnvironment({ProgramData:'synthetic-os-path',PATH:'synthetic-path',DATABASE_URL:'must-drop',MIGRATION_DATABASE_URL:'must-drop',AUTH_SECRET:'must-drop',MOCK_CONTROL_SECRET:'must-drop',GITHUB_TOKEN:'must-drop',PGPASSWORD:'must-drop',USER_PROVIDED_SID:'must-drop'});assert.deepEqual(e,{ProgramData:'synthetic-os-path',PATH:'synthetic-path'});});

function injectedRun({badMedia=false,failedCallback=false}={}) {
  const calls=[],disposed=[],t=target(),f=fixture();
  const context={get:async(url,options)=>{calls.push(['GET',url,options]);if(url==='/api/health/ready')return response(200);if(url.startsWith('/api/test/otp'))return response(200,{data:{code:'123456'}});if(url==='/api/auth/get-session')return response(200,{user:{id:'synthetic-customer',phoneNumber:f.phone,phoneNumberVerified:true}});if(url.startsWith('/api/orders/'))return response(200,orderBody(),{'cache-control':'private, no-store'});if(url.startsWith('/api/payments/mock/callback'))return response(failedCallback?500:303,{}, {location:`http://localhost:3101/orders/${f.orderId}`});assert.fail('unexpected synthetic request');},post:async(url,options)=>{calls.push(['POST',url,options]);assert.ok(['/api/auth/phone-number/send-otp','/api/auth/phone-number/verify'].includes(url));return response(200);},storageState:async()=>({cookies:[{httpOnly:true,name:'morphiume-customer.session_token',domain:'localhost',path:'/'}]}),dispose:async()=>disposed.push(true)};
  const run=()=>runChecks({target:t,fixture:f,observe:async action=>{calls.push(['OBSERVE',action]);const o=observation();if(action==='inspect')o.mockControlSecret='f'.repeat(64);return o;},createContext:async()=>context,readMedia:async()=>badMedia?Buffer.from('wrong'):mediaBytes});
  return {run,calls,disposed,t,f};
}
test('injected six-check flow verifies callback exactly once and never resets mock provider outcome',async()=>{const x=injectedRun(),r=await x.run();assert.deepEqual(r.checks.map(c=>c.name),checkNames);assert.ok(r.checks.every(c=>c.retry===false));assert.equal(r.suiteRetry,0);assert.equal(r.browserUiProved,false);assert.equal(x.calls.filter(c=>c[1]?.startsWith('/api/payments/mock/callback')).length,1);assert.equal(x.calls.filter(c=>c[0]==='POST').length,2);assert.equal(x.calls.filter(c=>c[0]==='OBSERVE').length,2);assert.equal(x.disposed.length,1);assert.equal(JSON.stringify(r).includes('f'.repeat(64)),false);assert.equal(JSON.stringify(r).includes('123456"'),false);for(const c of x.calls.filter(c=>['GET','POST'].includes(c[0]))){assert.equal(c[2].maxRetries,0);assert.equal(c[2].maxRedirects,0);assert.ok(c[2].timeout>0&&c[2].timeout<=10000);}});
test('a spent observation deadline stops before context creation or native actions',async()=>{let elapsed=0,created=0;await assert.rejects(runChecks({target:target(),fixture:fixture(),clock:()=>elapsed,observe:async()=>{elapsed=600001;return {...observation(),mockControlSecret:'f'.repeat(64)};},createContext:async()=>{created++;assert.fail('unexpected native context');},readMedia:async()=>assert.fail('unexpected media read')}),e=>e.safeCode==='deadline'&&e.safeStage==='handoff');assert.equal(created,0);});
test('invalid retained receipt baseline cannot trigger a callback replay',async()=>{let callbacks=0;await assert.rejects(runChecks({target:target(),fixture:fixture(),observe:async()=>{const o=observation();o.mockControlSecret='f'.repeat(64);o.snapshot.receipts.push({...o.snapshot.receipts[0],id:ids[0]});return o;},createContext:async()=>({get:async url=>{if(url==='/api/health/ready')return response(200);if(url.startsWith('/api/test/otp'))return response(200,{data:{code:'123456'}});if(url==='/api/auth/get-session')return response(200,{user:{id:'synthetic-customer',phoneNumber:fixture().phone,phoneNumberVerified:true}});if(url.startsWith('/api/orders/'))return response(200,orderBody(),{'cache-control':'private, no-store'});callbacks++;assert.fail('unexpected callback');},post:async()=>response(200),storageState:async()=>({cookies:[{httpOnly:true,name:'morphiume-customer.session_token',domain:'localhost',path:'/'}]}),dispose:async()=>{}}),readMedia:async()=>mediaBytes}),e=>e.safeCode==='business-mismatch'&&e.safeStage==='payment-dedup');assert.equal(callbacks,0);});
test('failed media check preserves prior five independent checks and never reruns payment',async()=>{const x=injectedRun({badMedia:true});await assert.rejects(x.run(),e=>{assert.equal(e.safeStage,'media-sha256');assert.equal(e.completedChecks.length,5);assert.ok(e.privateEvidence.after);assert.equal(JSON.stringify(e.privateEvidence).includes('f'.repeat(64)),false);return e.safeCode==='business-mismatch';});assert.equal(x.calls.filter(c=>c[1]?.startsWith('/api/payments/mock/callback')).length,1);assert.equal(x.disposed.length,1);});
test('unexpected callback fails at payment stage with no payment or suite retry',async()=>{const x=injectedRun({failedCallback:true});await assert.rejects(x.run(),e=>e.safeStage==='payment-dedup'&&e.completedChecks.length===2&&e.safeCode==='http-status');assert.equal(x.calls.filter(c=>c[1]?.startsWith('/api/payments/mock/callback')).length,1);});
test('failure evidence is persisted privately with safe category and no raw exception or auth code',async()=>{const x=injectedRun({badMedia:true}),records=[];await assert.rejects(runAndRecord({target:x.t,fixture:x.f,handoffSha256:'d'.repeat(64),run:x.run,persist:r=>records.push(clone(r)),now:()=> '2026-10-13T09:02:00Z'}));assert.equal(records.length,2);assert.equal(records[0].mode,'E4-restore-business-started');assert.equal(records[1].mode,'E4-restore-business-failed');assert.equal(records[1].completedChecks.length,5);assert.equal(records[1].suiteRetry,0);assert.equal(JSON.stringify(records).includes('f'.repeat(64)),false);assert.equal(JSON.stringify(records).includes('123456"'),false);});
test('successful injected record distinguishes full RTO from retained-fixture gap and unknown RPO',async()=>{const x=injectedRun(),records=[];const r=await runAndRecord({target:x.t,fixture:x.f,handoffSha256:'d'.repeat(64),run:x.run,persist:r=>records.push(clone(r)),now:()=> '2026-10-13T09:02:00Z'});assert.equal(r.rtoSeconds,120);assert.equal(r.retainedFixtureToBackupSeconds,1800);assert.equal(r.rpoEstablished,false);assert.equal(records.length,2);});
test('safe failure never surfaces arbitrary exception, stack, token or contact',()=>{const r=safeFailure(new Error('synthetic-password '+fixture().phone),'unknown');assert.deepEqual(r,{mode:'E4-restore-business-failed',stage:'handoff',code:'operation',suiteRetry:0});});
test('fixed observer query is RR read-only and rolls back, with exact DML role and owned predicate',()=>{const sql=remoteProgram.slice(remoteProgram.indexOf('sql=f"""'),remoteProgram.indexOf('compose='));assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(sql,/ROLLBACK;/);assert.doesNotMatch(sql,/(?:^|;)\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|COMMIT)\b/);assert.match(sql,/WHERE order_id='\{order\}'::uuid/);assert.match(remoteProgram,/-U morphiume_restore_app -d morphiume_staging_restore/);assert.doesNotMatch(remoteProgram,/pg_restore|db_owner_password|db_bootstrap_password|--profile.*worker/);});
test('frozen observer requires fresh ready/start and source bytes before importing code',()=>{assert.ok(remoteProgram.indexOf('contract.read_bytes()')<remoteProgram.indexOf('spec.loader.exec_module(c)'));assert.match(remoteProgram,/sys\.pycache_prefix/);assert.match(remoteProgram,/not Path\(sys.pycache_prefix\)\.exists\(\)/);assert.match(remoteProgram,/EXPECTED_MIGRATIONS/);assert.match(remoteProgram,/workerStarted.*is False/);assert.match(remoteProgram,/schemaCount':13/);});
test('only the new source pair has an apply guard; imported modules have no default actions',()=>{const source=readFileSync(new URL('./e4-restore-business-acceptance.mjs',import.meta.url),'utf8');assert.match(source,/args\.length===0/);assert.match(source,/--handoff-sha256/);assert.match(source,/O_EXCL\|constants\.O_NOFOLLOW/);assert.match(source,/protectNewEvidence\(path\)/);assert.match(source,/toolSourceCommit/);assert.match(source,/StrictHostKeyChecking=yes/);assert.doesNotMatch(source,/dotenv|readFileSync\([^)]*\.env|process\.env\.DATABASE_URL/);});
