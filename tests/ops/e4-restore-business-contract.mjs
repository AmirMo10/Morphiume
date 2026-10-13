import { createHash } from 'node:crypto';
import { checkNames } from './restore-business-contract.mjs';
export { checkNames };
export const accepted = Object.freeze({ sourceCommit:'e4bed691dc938a9c0f79022696d24f063ad97724', testedPlatformConfig:'sha256:246b9226db86bf63b37499c2b4a80c2e5e8f62265b3546674de48c480f524665', candidateManifestDigest:'sha256:dea7a91aa15b8ea653f92d68aee16a168a204f8c0da79a2459e5f748df659c47', archiveSha256:'aed2f8a7b868d32410c55708042dcf945a0491a1f747632df16689e3d072432c', opsSha256:'68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3', runtimeImageId:'sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d', engineProofSha256:'3f1b15a278706ac09be6f644b2042728b1a5ae3cacf3dfb5315181c51de03810', accessProfileSha256:'67f77b1636d0ae2b9b81df9e46f4a3c93087b01e0d4e6fdaa730b2604e60dd96' });
export const origin='http://localhost:3101', activationUtc='2026-10-13T07:44:07.000Z';
export const opsRoot=`/srv/morphiume/staging/runtime/releases/${accepted.sourceCommit}/ops-bundles/${accepted.opsSha256}/ops`;
export const wholeBudgetMs=600000;
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hex=/^[a-f0-9]{64}$/u, project=/^morphiume-runtime-restore-\d{8}t\d{6}z-[a-f0-9]{6}$/u;
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function fail(code='contract'){const error=new Error('E4 restore acceptance stopped; private details withheld.');error.safeCode=code;throw error;}
export function assure(value,code='business-mismatch'){if(!value)fail(code);}
export function keys(value,expected){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',');}
export function utc(value){assure(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(value),'time');const parsed=Date.parse(value);assure(Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,19)===value.slice(0,19),'time');return parsed;}
export function validateTarget(value){
  assure(keys(value,['schemaVersion','kind','baseURL','sourceOrigin','identity','restoreProject','restoreRoot','backupDirectory','fixturePath','hashes','toolSourceCommit','attestations']),'target');
  assure(value.schemaVersion===1&&value.kind==='E4-restore-business-handoff'&&value.baseURL===origin&&value.sourceOrigin==='http://localhost:3100','target');
  assure(keys(value.identity,Object.keys(accepted))&&Object.entries(accepted).every(([k,v])=>value.identity[k]===v),'identity');
  assure(typeof value.restoreProject==='string'&&project.test(value.restoreProject)&&value.restoreProject!=='morphiume-runtime-restore-20261012t212729z-d03c35','project');
  assure(value.restoreRoot===`/srv/morphiume/staging/runtime/restore/${value.restoreProject}`,'project');
  assure(typeof value.backupDirectory==='string'&&/^\/srv\/morphiume\/staging\/runtime\/backups\/\d{8}T\d{6}Z-[a-f0-9]{8}$/u.test(value.backupDirectory)&&value.backupDirectory!=='/srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce','backup-path');
  // An actual fresh Linux QA copy or a protected raw copy is supplied later;
  // no default fixture filename, old613 directory or source pointer is inferred.
  assure(typeof value.fixturePath==='string'&&value.fixturePath.length<=1024&&!/[\0\r\n%]/u.test(value.fixturePath)&&!/(?:^|[\\/])\.\.(?:[\\/]|$)|6130f4|runtime-613/iu.test(value.fixturePath)&&(/^[A-Z]:[\\/]/u.test(value.fixturePath)||value.fixturePath.startsWith('/'))&&/[\\/]\.local[\\/].+\.json$/u.test(value.fixturePath),'fixture-path');
  assure(keys(value.hashes,['fixtureSha256','backupManifestSha256','databaseCiphertextSha256','mediaCiphertextSha256','restoreReadySha256','restoreStartSha256','restoreConfigSha256','acceptanceToolSha256','contractToolSha256'])&&Object.values(value.hashes).every(v=>typeof v==='string'&&hex.test(v)&&v!=='0'.repeat(64)),'handoff');
  assure(typeof value.toolSourceCommit==='string'&&/^[a-f0-9]{40}$/u.test(value.toolSourceCommit)&&value.toolSourceCommit!=='0'.repeat(40),'handoff');
  assure(keys(value.attestations,['approved','windowReleased','fixtureChromiumPassed','fixtureCleanupVerified','freshE4BackupVerified','restoreReadyVerified','workerNeverStarted'])&&Object.values(value.attestations).every(v=>v===true),'handoff');
  return value;
}
export function prepared(){return{schemaVersion:1,kind:'blocked-prepared-E4-restore-business',identity:accepted,baseURL:origin,fixtureSha256:null,backupManifestSha256:null,ciphertextSha256:null,restoreProject:null,restoreRoot:null,restoreReadySha256:null,checks:checkNames,suiteRetry:0,actionAuthorized:false};}
export function validateFixture(value){
  assure(keys(value,['fixtureId','createdAt','baseURL','phone','orderId','productId','media','expected'])&&['fixtureId','orderId','productId'].every(k=>typeof value[k]==='string'&&uuid.test(value[k])),'fixture');
  assure(value.baseURL==='http://localhost:3100'&&utc(value.createdAt)>=utc(activationUtc)&&typeof value.phone==='string'&&/^\+989\d{9}$/u.test(value.phone),'fixture');
  assure(keys(value.expected,['paymentStatus','stockOnHand','stockReserved','receipts','shipments','trackingCode','unitPriceIrr'])&&value.expected.paymentStatus==='paid'&&value.expected.stockOnHand===2&&value.expected.stockReserved===0&&value.expected.receipts===1&&value.expected.shipments===1&&value.expected.unitPriceIrr==='1234560'&&value.expected.trackingCode===`QA-TRACK-${value.fixtureId.slice(0,8)}`,'fixture-expectation');
  assure(Array.isArray(value.media)&&value.media.length===1&&value.media.every(m=>keys(m,['url','sha256'])&&typeof m.url==='string'&&/^\/media\/[a-f0-9-]{36}\.webp$/u.test(m.url)&&uuid.test(m.url.slice(7,-5))&&hex.test(m.sha256)),'media-target');
  return value;
}
export function validateObservation(value,target,fixture){
  assure(keys(value,['mode','binding','snapshot',...(Object.hasOwn(value,'mockControlSecret')?['mockControlSecret']:[])])&&value.mode==='E4-restore-readonly-observation','response-shape');
  assure(keys(value.binding,['identity','project','root','backup','schemaCount','serverVersionNum','workerStarted','backupStartUtc','backupCompleteUtc','recoveryStartUtc','applicationReadyUtc','hashes'])&&keys(value.binding.identity,Object.keys(accepted))&&Object.entries(accepted).every(([k,v])=>value.binding.identity[k]===v)&&value.binding.project===target.restoreProject&&value.binding.root===target.restoreRoot&&value.binding.backup===target.backupDirectory&&value.binding.schemaCount===13&&value.binding.serverVersionNum===180006&&value.binding.workerStarted===false,'identity');
  assure(keys(value.binding.hashes,['backupManifestSha256','restoreReadySha256','restoreStartSha256','restoreConfigSha256']),'handoff');
  for(const k of ['backupManifestSha256','restoreReadySha256','restoreStartSha256','restoreConfigSha256'])assure(value.binding.hashes?.[k]===target.hashes[k],'handoff');
  const times=[fixture.createdAt,value.binding.backupStartUtc,value.binding.backupCompleteUtc,value.binding.recoveryStartUtc,value.binding.applicationReadyUtc].map(utc);assure(times.every((v,i)=>i===0||v>=times[i-1]),'time');
  const s=value.snapshot;assure(s?.database==='morphiume_staging_restore'&&s.role==='morphiume_restore_app'&&s.readOnly===true&&s.roleSafe===true&&s.ddlDenied===true&&typeof s.customerId==='string'&&s.customerId.length>0&&s.customerId.length<=100,'identity');
  if(Object.hasOwn(value,'mockControlSecret'))assure(typeof value.mockControlSecret==='string'&&hex.test(value.mockControlSecret),'response-shape');
  return value;
}
export function ownedOrder(body,snapshot,fixture){const o=body?.data;assure(o?.id===fixture.orderId&&o.paymentStatus==='paid'&&snapshot.order?.committed===true);
  for(const key of ['subtotal','discount','shipping','tax','total'])assure(o[key]?.currency==='IRR'&&o[key].amountIrr===snapshot.order[key]&&/^\d{1,10}$/u.test(snapshot.order[key]));
  assure(Array.isArray(o.items)&&o.items.length===1&&o.items[0].quantity===1&&o.items[0].unitPrice?.amountIrr===fixture.expected.unitPriceIrr&&o.items[0].lineTotal?.amountIrr===fixture.expected.unitPriceIrr);
}
export function paymentDedup(before,after,fixture){for(const s of [before,after]){assure(s.order?.paymentStatus==='paid'&&s.order.committed===true&&Array.isArray(s.attempts)&&s.attempts.length===1&&s.attempts[0].provider==='mock'&&s.attempts[0].status==='succeeded'&&typeof s.attempts[0].authority==='string'&&s.attempts[0].authority.startsWith('MOCK-')&&uuid.test(s.attempts[0].authority.slice(5)));assure(Array.isArray(s.receipts)&&s.receipts.length===1&&s.receipts[0].disposition==='primary'&&s.receipts[0].amountIrr===s.order.total&&uuid.test(s.receipts[0].id));
    for(const k of ['subtotal','discount','shipping','tax','total'])assure(typeof s.order[k]==='string'&&/^(?:0|[1-9]\d{0,9})$/u.test(s.order[k])&&BigInt(s.order[k])<=1000000000n);
    assure(BigInt(s.order.total)===BigInt(s.order.subtotal)-BigInt(s.order.discount)+BigInt(s.order.shipping)+BigInt(s.order.tax));}
  assure(JSON.stringify(before.receipts)===JSON.stringify(after.receipts)&&JSON.stringify(before.attempts)===JSON.stringify(after.attempts)&&JSON.stringify(before.order)===JSON.stringify(after.order));
  assure(before.items?.length===1&&before.items[0].productMatches===true&&before.items[0].quantity===1&&before.items[0].price===fixture.expected.unitPriceIrr&&before.items[0].lineTotal===fixture.expected.unitPriceIrr&&before.order.subtotal===fixture.expected.unitPriceIrr&&JSON.stringify(before.items)===JSON.stringify(after.items));
}
export function stockReservation(before,after,fixture){for(const s of [before,after])assure(s.commitments===1&&s.commitDelta===-1&&s.commitReservedDelta===-1&&s.reservationCount===1&&s.activeReservations===0&&s.consumedReservations===1&&s.consumedQuantity===1&&s.shipments===fixture.expected.shipments&&Array.isArray(s.balances)&&s.balances.length===1&&s.balances[0].onHand===fixture.expected.stockOnHand&&s.balances[0].reserved===fixture.expected.stockReserved);}
export function shipmentTracking(body,snapshot,fixture){const shipment=body?.data?.shipment;assure(snapshot.shipments===1&&snapshot.shipment?.status==='shipped'&&snapshot.shipment.trackingMatches===true&&snapshot.shipment.carrierPresent===true&&shipment?.status==='shipped'&&shipment.trackingCode===fixture.expected.trackingCode&&typeof shipment.carrier==='string'&&shipment.carrier.length>0);}
export async function observedNative(action,{stage,deadline,clock=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),record=()=>{}}){
  assure(['customer-otp-send','customer-otp-verify'].includes(stage)&&Number.isFinite(deadline),'contract');
  for(let attempt=1;attempt<=2;attempt++){assure(clock()<deadline,'deadline');const r=await action(),status=r.status();assure(Number.isInteger(status),'native-status');
    if(status===429){const raw=r.headers()['x-retry-after'];if(!(typeof raw==='string'&&/^\d+(?:\.\d+)?$/u.test(raw)&&Number.isFinite(Number(raw))&&Number(raw)<=60)){record({stage,attempt,status,retryAfterSeconds:null,waitMs:0});fail('retry-header');}const seconds=Number(raw),waitMs=Math.ceil(seconds)*1000+250,observed={stage,attempt,status,retryAfterSeconds:seconds,waitMs:0};record(observed);assure(attempt===1,'native-status');assure(clock()+waitMs<deadline,'deadline');let waiting=waitMs;const waitStarted=clock();try{while(waiting>0){const part=Math.min(waiting,60000);await sleep(part);waiting-=part;}}finally{observed.waitMs=Math.max(0,clock()-waitStarted);}continue;}
    record({stage,attempt,status,retryAfterSeconds:null,waitMs:0});assure(status===200,'native-status');return r;
  }fail('native-status');
}
export function safeFailure(error,stage){return{mode:'E4-restore-business-failed',stage:checkNames.includes(stage)?stage:'handoff',code:['contract','target','identity','project','backup-path','fixture-path','fixture','fixture-expectation','media-target','handoff','time','response-shape','business-mismatch','retry-header','native-status','deadline','private-file','private-acl','transport','result-exists','http-status'].includes(error?.safeCode)?error.safeCode:'operation',suiteRetry:0};}
