import { spawn, execFileSync } from 'node:child_process';
import { constants, lstatSync, realpathSync, readFileSync, openSync, closeSync, writeSync, ftruncateSync, fsyncSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS } from '../../deploy/staging/upgrade-original-observation.mjs';
import { accepted, origin, opsRoot, wholeBudgetMs, checkNames, sha256, assure, fail, validateTarget, validateFixture, validateObservation, ownedOrder, paymentDedup, stockReservation, shipmentTracking, observedNative, prepared, safeFailure, utc } from './e4-restore-business-contract.mjs';

// Fixed E4/restore-only Python observer, sent through private SSH stdin only.
// No owner credential, DB creation, seed, worker action or source-guard override.
export const remoteProgram=String.raw`
import sys,json,re,hashlib,stat,importlib.util
from pathlib import Path
I=REQUEST['target']['identity']; T=REQUEST['target']; F=REQUEST['fixture']
SOURCE='e4bed691dc938a9c0f79022696d24f063ad97724'
OPS='68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
OPS_ROOT=Path('/srv/morphiume/staging/runtime/releases')/SOURCE/'ops-bundles'/OPS/'ops'
def need(x):
 if not x: raise ValueError('Private E4 restore observation rejected')
need(REQUEST['action'] in ('inspect','snapshot') and I==EXPECTED and T['baseURL']=='http://localhost:3101')
need(re.fullmatch('morphiume-runtime-restore-[0-9]{8}t[0-9]{6}z-[a-f0-9]{6}',T['restoreProject']))
need(T['restoreRoot']=='/srv/morphiume/staging/runtime/restore/'+T['restoreProject'])
need(re.fullmatch('/srv/morphiume/staging/runtime/backups/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}',T['backupDirectory']))
uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'
need(all(re.fullmatch(uuid,F[k]) for k in ('fixtureId','orderId','productId')) and re.fullmatch(r'\+989[0-9]{9}',F['phone']))
need(F['baseURL']=='http://localhost:3100' and F['expected']['trackingCode']=='QA-TRACK-'+F['fixtureId'][:8])
def protected(path,uid=0,maximum=1048576):
 path=Path(path)
 for part in (path,*path.parents): need(not part.is_symlink() and part.resolve()==part)
 s=path.lstat(); need(stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and not s.st_mode & 0o077 and 0<s.st_size<=maximum)
 return path.read_bytes()
def canonical(x): return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def checked(path,hashname,uid=0):
 raw=protected(path,uid);need(hashlib.sha256(raw).hexdigest()==T['hashes'][hashname]);return json.loads(raw)
# Verify the frozen Ops manifest and imported contract source BEFORE importing.
manifest=json.loads(protected(OPS_ROOT/'ops-manifest.json'))
need(canonical(manifest)==OPS)
contract=OPS_ROOT/'runtime/contract.py'
for part in (contract,*contract.parents): need(not part.is_symlink() and part.resolve()==part)
s=contract.stat();need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and not s.st_mode & 0o022 and s.st_size<=1048576)
need(hashlib.sha256(contract.read_bytes().replace(b'\r\n',b'\n')).hexdigest()==manifest['runtime/contract.py'])
sys.dont_write_bytecode=True
sys.pycache_prefix=str(Path(T['restoreRoot'])/'e4-readonly-no-pycache')
need(not Path(sys.pycache_prefix).exists())
spec=importlib.util.spec_from_file_location('e4_readonly_restore_contract',contract);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
c.assert_boundaries();c.verify_ops_bundle(OPS_ROOT,OPS)
release=c.archived_image(I);need(all(release.get(k)==v for k,v in I.items() if k!='accessProfileSha256'))
profile=c.read_profile(c.ROOT/'releases'/SOURCE/'profiles/ssh-localhost'/I['accessProfileSha256']/'profile.json',I['accessProfileSha256']);c.match_mapping(profile,release)
root=c.exact_path(Path(T['restoreRoot']));c.private_directory(root)
backup=c.exact_path(Path(T['backupDirectory']));c.private_directory(backup)
b=checked(backup/'backup-manifest.json','backupManifestSha256')
need(b['database']=='morphiume_staging_runtime' and all(b.get(k)==v for k,v in I.items() if k!='accessProfileSha256') and b['backupOpsSha256']==OPS)
need(b['businessBaseline']['migrationCount']==13)
for name,key in (('database.dump.age','databaseCiphertextSha256'),('media.tar.gz.age','mediaCiphertextSha256')):
 need(b['ciphertextSha256'][name]==T['hashes'][key]);p=c.private_file(backup/name)
 with p.open('rb') as stream: need(hashlib.file_digest(stream,'sha256').hexdigest()==T['hashes'][key])
need(set(p.name for p in backup.iterdir())=={'backup-manifest.json','database.dump.age','media.tar.gz.age'})
start=checked(root/'recovery-start.json','restoreStartSha256');ready=checked(root/'recovery-ready.json','restoreReadySha256')
need(ready.get('mode')=='restored-ready-business-acceptance-pending' and ready.get('project')==T['restoreProject'] and ready.get('root')==T['restoreRoot'] and ready.get('browserOrigin')=='http://localhost:3101' and ready.get('workerStarted') is False)
need(all(ready.get(k)==I[k] for k in ('sourceCommit','testedPlatformConfig','runtimeImageId','engineProofSha256')))
need(ready.get('accessProfileSha256')==I['accessProfileSha256'] and ready.get('oldPairPreserved') is True)
need(ready.get('fixtureSha256')==T['hashes']['fixtureSha256'] and ready.get('backupManifestSha256')==T['hashes']['backupManifestSha256'])
need(re.fullmatch('[a-f0-9]{40}',str(ready.get('toolSourceCommit',''))) and re.fullmatch('[a-f0-9]{64}',str(ready.get('toolSha256',''))))
need(re.fullmatch(uuid,str(ready.get('operationId',''))) and T['restoreProject'][-6:]==ready['operationId'][:6])
need(start['backup']==T['backupDirectory'] and start['sourceCommit']==SOURCE and start['recoveryStartUtc']==ready['recoveryStartUtc'])
need(ready['backupStartUtc']==b['backupStartUtc'] and ready['backupCompleteUtc']==b['backupCompleteUtc'])
app=checked(root/'app.json','restoreConfigSha256',1001)
original=json.loads(protected(c.CONFIG/'app.json',1001));c.validate_config(original,c.APP,profile='ssh-localhost')
need(c.canonical_hash(original)==profile['configSha256']['app.json'])
need(set(app)==set(original) and all(app[k]==v for k,v in original.items() if k not in ('DATABASE_URL','APP_BASE_URL')))
need(app['APP_BASE_URL']=='http://localhost:3101' and re.fullmatch('postgresql://morphiume_restore_app:[a-f0-9]{64}@db:5432/morphiume_staging_restore',app['DATABASE_URL']))
need(c.private_file(root/'restore.env').read_text()==f"MORPHIUME_RESTORE_PROJECT={T['restoreProject']}\nMORPHIUME_RESTORE_ROOT={root}\nMORPHIUME_IMAGE={I['runtimeImageId']}\nMORPHIUME_OPS_ROOT={OPS_ROOT}\n")
ids=c.run(['docker','ps','--all','--filter','label=com.docker.compose.project='+T['restoreProject'],'--format','{{.ID}}']).splitlines()
items=json.loads(c.run(['docker','inspect',*ids])) if ids else []
need(len(items)==2);services={x['Config']['Labels'].get('com.docker.compose.service'):x for x in items};need(set(services)=={'app','db'})
for service,item in services.items():
 need(item['Config']['Labels'].get('com.docker.compose.project')==T['restoreProject'] and item['Config']['Labels'].get('morphiume.restore.scope')=='runtime' and item['State']['Running'] is True and item['State'].get('Health',{}).get('Status')=='healthy')
 mounts={m['Destination']:m for m in item['Mounts']}
 required={'/run/secrets/runtime_config':('app.json',False),'/app/media':('media',True)} if service=='app' else {'/var/lib/postgresql':('postgres',True),'/run/secrets/db_app_password':('db_app_password',False)}
 for destination,(name,writable) in required.items():
  m=mounts.get(destination);need(m and m['Type']=='bind' and m['Source']==T['restoreRoot']+'/'+name and m['RW'] is writable)
need(services['db']['Config']['Image']==c.PG_IMAGE and services['db']['Config']['User']=='999:999' and services['db']['HostConfig'].get('PortBindings') in (None,{}))
need(services['app']['HostConfig'].get('PortBindings')=={'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'3002'}]})
c.validate_app_containers([services['app']],release,services=('app',))
for media in F['media']:
 need(re.fullmatch('/media/'+uuid+r'\.webp',media['url']))
 p=c.exact_path(root/'media'/'public'/media['url'][7:]);s=p.stat();need(p.is_file() and s.st_uid==1001 and s.st_gid==1001 and s.st_nlink==1 and not s.st_mode & 0o027 and 0<s.st_size<=4194304)
 need(hashlib.sha256(p.read_bytes()).hexdigest()==media['sha256'])
order,product,phone=F['orderId'],F['productId'],F['phone'];tracking='QA-TRACK-'+F['fixtureId'][:8]
sql=f"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s'; SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object(
'database',current_database(),'role',current_user,'readOnly',current_setting('transaction_read_only')='on',
'roleSafe',(SELECT NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user),
'ddlDenied',NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=current_user::regrole) AND NOT EXISTS(SELECT FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='public' AND (x.relowner=current_user::regrole OR x.relkind IN('r','p') AND has_table_privilege(current_user,x.oid,'TRUNCATE'))),
'version',current_setting('server_version_num')::integer,'history',(SELECT jsonb_object_agg(name,checksum) FROM public.schema_migration),
'customerId',(SELECT o.user_id FROM public.orders o JOIN public."user" u ON u.id=o.user_id WHERE o.id='{order}'::uuid AND u.phone_number='{phone}' AND u.phone_number_verified AND NOT u.disabled),
'order',(SELECT jsonb_build_object('paymentStatus',payment_status,'subtotal',subtotal_irr::text,'discount',discount_irr::text,'shipping',shipping_irr::text,'tax',tax_irr::text,'total',total_irr::text,'committed',committed_at IS NOT NULL) FROM public.orders WHERE id='{order}'::uuid),
'items',(SELECT jsonb_agg(jsonb_build_object('quantity',i.quantity,'price',i.unit_price_irr::text,'lineTotal',i.line_total_irr::text,'productMatches',v.product_id='{product}'::uuid) ORDER BY i.id) FROM (SELECT * FROM public.order_item WHERE order_id='{order}'::uuid LIMIT 2) i JOIN public.variant v ON v.id=i.variant_id),
'attempts',(SELECT jsonb_agg(jsonb_build_object('authority',authority,'status',status,'provider',provider) ORDER BY id) FROM (SELECT * FROM public.payment_attempt WHERE order_id='{order}'::uuid LIMIT 2) a),
'receipts',(SELECT jsonb_agg(jsonb_build_object('id',id,'disposition',disposition,'amountIrr',amount_irr::text) ORDER BY id) FROM (SELECT * FROM public.payment_receipt WHERE order_id='{order}'::uuid LIMIT 2) r),
'commitments',(SELECT count(*) FROM public.inventory_ledger WHERE order_id='{order}'::uuid AND reason='payment_commit'),
'commitDelta',(SELECT coalesce(sum(on_hand_delta),0) FROM public.inventory_ledger WHERE order_id='{order}'::uuid AND reason='payment_commit'),
'commitReservedDelta',(SELECT coalesce(sum(reserved_delta),0) FROM public.inventory_ledger WHERE order_id='{order}'::uuid AND reason='payment_commit'),
'reservationCount',(SELECT count(*) FROM public.inventory_reservation WHERE order_id='{order}'::uuid),
'activeReservations',(SELECT count(*) FROM public.inventory_reservation WHERE order_id='{order}'::uuid AND status='active'),
'consumedReservations',(SELECT count(*) FROM public.inventory_reservation WHERE order_id='{order}'::uuid AND status='consumed'),
'consumedQuantity',(SELECT coalesce(sum(quantity),0) FROM public.inventory_reservation WHERE order_id='{order}'::uuid AND status='consumed'),
'balances',(SELECT jsonb_agg(jsonb_build_object('onHand',b.on_hand,'reserved',b.reserved) ORDER BY b.variant_id) FROM public.inventory_balance b JOIN public.variant v ON v.id=b.variant_id WHERE v.product_id='{product}'::uuid),
'shipments',(SELECT count(*) FROM public.shipment WHERE order_id='{order}'::uuid),
'shipment',(SELECT jsonb_build_object('status',status,'trackingMatches',tracking_code='{tracking}','carrierPresent',carrier IS NOT NULL AND length(carrier)>0) FROM public.shipment WHERE order_id='{order}'::uuid));
ROLLBACK;
"""
compose=['docker','compose','--project-name',T['restoreProject'],'--env-file',str(root/'restore.env'),'-f',str(OPS_ROOT/'runtime/compose.restore.yaml')]
command=compose+['exec','-T','db','sh','-c','PGPASSWORD="$(cat /run/secrets/db_app_password)"; export PGPASSWORD; exec psql -h 127.0.0.1 -U morphiume_restore_app -d morphiume_staging_restore -X -qAt --set ON_ERROR_STOP=1']
raw=c.run(command,input_text=sql,timeout=15);need(len(raw)<=32768);snapshot=json.loads(raw)
need(snapshot.pop('history')==EXPECTED_MIGRATIONS);version=snapshot.pop('version');need(version==180006)
out={'mode':'E4-restore-readonly-observation','binding':{'identity':I,'project':T['restoreProject'],'root':T['restoreRoot'],'backup':T['backupDirectory'],'schemaCount':13,'serverVersionNum':version,'workerStarted':False,'backupStartUtc':b['backupStartUtc'],'backupCompleteUtc':b['backupCompleteUtc'],'recoveryStartUtc':ready['recoveryStartUtc'],'applicationReadyUtc':ready['applicationReadyUtc'],'hashes':{k:T['hashes'][k] for k in ('backupManifestSha256','restoreReadySha256','restoreStartSha256','restoreConfigSha256')}},'snapshot':snapshot}
if REQUEST['action']=='inspect': out['mockControlSecret']=app['MOCK_CONTROL_SECRET']
print(json.dumps(out,separators=(',',':')))
`;

function windowsAcl(path){const script=String.raw`$p=[Console]::In.ReadToEnd();$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=Get-Acl -LiteralPath $p;$r=@($a.Access);$ok=$a.AreAccessRulesProtected -and $r.Count -eq 2 -and $a.Owner -eq $s.Translate([Security.Principal.NTAccount]).Value;foreach($x in $r){$id=$x.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;$ok=$ok -and $id -in @($s.Value,'S-1-5-18') -and -not $x.IsInherited -and $x.AccessControlType -eq 'Allow' -and $x.FileSystemRights -eq 'FullControl'};if(-not $ok){exit 1};[Console]::Out.Write('verified')`;
  try{assure(execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{input:path,encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','ignore']})==='verified','private-acl');}catch{fail('private-acl');}}
function protectNewEvidence(path){const script=String.raw`$p=[Console]::In.ReadToEnd();$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[Security.AccessControl.FileSecurity]::new();$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);foreach($id in @($s,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','Allow'))};Set-Acl -LiteralPath $p -AclObject $a`;
  try{execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{input:path,windowsHide:true,timeout:10000,stdio:['pipe','ignore','ignore']});windowsAcl(path);}catch{fail('private-acl');}}
export function checkedFile(path,maximum=65536){assure(typeof path==='string'&&resolve(path)===path,'private-file');for(let p=path;;p=dirname(p)){const s=lstatSync(p);assure(!s.isSymbolicLink()&&realpathSync(p)===p,'private-file');if(p===dirname(p))break;}
  const stat=lstatSync(path);assure(stat.isFile()&&stat.nlink===1&&stat.size>0&&stat.size<=maximum,'private-file');
  if(process.platform==='win32'){windowsAcl(dirname(path));windowsAcl(path);}else{const parent=lstatSync(dirname(path));assure(stat.uid===process.getuid()&&(stat.mode&0o777)===0o600&&parent.uid===process.getuid()&&(parent.mode&0o777)===0o700,'private-acl');}
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{return readFileSync(fd);}finally{closeSync(fd);}}
export function transportEnvironment(value){const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','PROGRAMDATA','USERPROFILE','HOME','TEMP','TMP']);return Object.fromEntries(Object.entries(value).filter(([k])=>allowed.has(k.toUpperCase())));}
function reserveEvidence(path){assure(!existsSync(path),'result-exists');const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{if(process.platform==='win32')protectNewEvidence(path);else{const s=lstatSync(path);assure(s.isFile()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600,'private-acl');}return fd;}catch(error){closeSync(fd);throw error;}}
function persistEvidence(fd,value){const body=Buffer.from(JSON.stringify(value,null,2)+'\n');assure(body.length<=1048576,'response-shape');let written=0;while(written<body.length){const count=writeSync(fd,body,written,body.length-written,written);assure(count>0,'private-file');written+=count;}ftruncateSync(fd,body.length);fsyncSync(fd);}
function remaining(deadline,maximum=10000,clock=()=>performance.now()){const left=deadline-clock();assure(left>0,'deadline');return Math.max(1,Math.min(Math.floor(left),maximum));}
async function remote(target,fixture,action,deadline){const data=Buffer.from(JSON.stringify({action,target,fixture})).toString('base64'),expected=JSON.stringify(accepted),migrations=JSON.stringify(MIGRATIONS);const input=`import base64,json\nREQUEST=json.loads(base64.b64decode('${data}'))\nEXPECTED=json.loads(${JSON.stringify(expected)})\nEXPECTED_MIGRATIONS=json.loads(${JSON.stringify(migrations)})\n`+remoteProgram;
  return new Promise((accept,reject)=>{const child=spawn('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','morphiume-deploy',"python3 -c 'import sys; exec(sys.stdin.read())'"],{shell:false,windowsHide:true,env:transportEnvironment(process.env),stdio:['pipe','pipe','ignore']});let size=0,done=false;const chunks=[];const stop=()=>{if(done)return;done=true;child.kill();reject(Object.assign(new Error('Private E4 restore transport failed.'),{safeCode:'transport'}));};const timer=setTimeout(stop,remaining(deadline,180000));child.stdout.on('data',chunk=>{size+=chunk.length;if(size>65536)stop();else chunks.push(chunk);});child.on('error',stop);child.stdin.on('error',stop);child.on('close',code=>{clearTimeout(timer);if(done)return;if(code!==0){stop();return;}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));validateObservation(value,target,fixture);done=true;accept(value);}catch{stop();}});child.stdin.end(input);});}
async function json(response){assure(response.status()===200,'http-status');const raw=await response.body();assure(raw.length<=65536,'response-shape');try{return JSON.parse(raw);}catch{fail('response-shape');}}
export async function runAndRecord({target,fixture,handoffSha256,run,persist,clock=()=>performance.now(),now=()=>new Date().toISOString()}){
  const started=clock(),startedAt=now();persist({formatVersion:1,mode:'E4-restore-business-started',startedAt,handoffSha256,fixtureSha256:target.hashes.fixtureSha256,suiteRetry:0,target});
  try{const result=await run(),completedAt=now();assure(utc(completedAt)>=utc(result.binding.recoveryStartUtc),'time');const record={...result,formatVersion:1,startedAt,completedAt,durationMs:clock()-started,fixtureSha256:target.hashes.fixtureSha256,handoffSha256,target,rtoSeconds:(utc(completedAt)-utc(result.binding.recoveryStartUtc))/1000,retainedFixtureToBackupSeconds:(utc(result.binding.backupStartUtc)-utc(fixture.createdAt))/1000,rpoEstablished:false};persist(record);return record;
  }catch(error){persist({...safeFailure(error,error.safeStage),formatVersion:1,startedAt,completedAt:now(),durationMs:clock()-started,handoffSha256,fixtureSha256:target.hashes.fixtureSha256,target,nativeStatuses:error.safeNativeStatuses??[],completedChecks:error.completedChecks??[],rawPrivateEvidence:error.privateEvidence??{}});throw error;}
}
export async function runChecks({target,fixture,observe,createContext,readMedia,clock=()=>performance.now()}){
  validateTarget(target);validateFixture(fixture);const deadline=clock()+wholeBudgetMs,nativeStatuses=[],checks=[],raw={};let context,stage='handoff';
  const bounds=()=>({timeout:remaining(deadline,10000,clock),maxRedirects:0,maxRetries:0});
  const mark=name=>{remaining(deadline,10000,clock);checks.push({name,passed:true,retry:false});};
  try{const before=validateObservation(await observe('inspect',deadline),target,fixture);assure(/^[a-f0-9]{64}$/u.test(before.mockControlSecret??''),'response-shape');raw.before={...before};delete raw.before.mockControlSecret;
    remaining(deadline,10000,clock);
    context=await createContext();stage='native-login';
    const ready=await context.get('/api/health/ready',bounds());assure(ready.status()===200,'http-status');
    await observedNative(()=>context.post('/api/auth/phone-number/send-otp',{...bounds(),data:{phoneNumber:fixture.phone}}),{stage:'customer-otp-send',deadline,clock,record:x=>nativeStatuses.push(x)});
    await observedNative(async()=>{const inbox=await json(await context.get(`/api/test/otp?phone=${encodeURIComponent(fixture.phone)}`,{...bounds(),headers:{'x-morphiume-test-secret':before.mockControlSecret}}));assure(/^\d{6}$/u.test(inbox.data?.code??''),'response-shape');return context.post('/api/auth/phone-number/verify',{...bounds(),data:{phoneNumber:fixture.phone,code:inbox.data.code}});},{stage:'customer-otp-verify',deadline,clock,record:x=>nativeStatuses.push(x)});
    const session=await json(await context.get('/api/auth/get-session',bounds()));assure(session.user?.id===before.snapshot.customerId&&session.user.phoneNumber===fixture.phone&&session.user.phoneNumberVerified===true);const cookies=(await context.storageState()).cookies;assure(cookies.some(c=>c.httpOnly&&c.name==='morphiume-customer.session_token'&&c.domain==='localhost'&&c.path==='/'),'response-shape');mark(stage);
    stage='owned-order';const response=await context.get(`/api/orders/${fixture.orderId}`,bounds());assure(/no-store/u.test(response.headers()['cache-control']??''),'http-status');const order=await json(response);ownedOrder(order,before.snapshot,fixture);raw.ownedOrder=order;mark(stage);
    stage='payment-dedup';paymentDedup(before.snapshot,before.snapshot,fixture);const authority=before.snapshot.attempts[0].authority;const callback=await context.get(`/api/payments/mock/callback?Authority=${encodeURIComponent(authority)}`,bounds());assure(callback.status()===303&&callback.headers().location===`${origin}/orders/${fixture.orderId}`,'http-status');const after=validateObservation(await observe('snapshot',deadline),target,fixture);raw.after=after;paymentDedup(before.snapshot,after.snapshot,fixture);mark(stage);
    stage='stock-reservation';stockReservation(before.snapshot,after.snapshot,fixture);mark(stage);
    stage='shipment-tracking';const current=await json(await context.get(`/api/orders/${fixture.orderId}`,bounds()));shipmentTracking(current,after.snapshot,fixture);mark(stage);
    stage='media-sha256';for(const media of fixture.media){const body=await readMedia(media.url,deadline);assure(body.length>0&&body.length<=4194304&&sha256(body)===media.sha256);}mark(stage);
    assure(checks.length===6&&checks.every((c,i)=>c.name===checkNames[i]&&c.retry===false));
    return{mode:'E4-six-business-checks-passed',checks,nativeStatuses,rawPrivateEvidence:raw,suiteRetry:0,workerStarted:false,nativeHttpProved:true,browserUiProved:false,intentionalMutationActions:{nativeOtpSend:true,nativeOtpVerify:true,paymentVerificationReplayCount:1,mockOutcomeReset:false},binding:before.binding};
  }catch(error){error.safeStage=stage;error.safeNativeStatuses=nativeStatuses;error.privateEvidence=raw;error.completedChecks=checks;throw error;}finally{if(context)await context.dispose();}
}
async function main(){const args=process.argv.slice(2);if(args.length===0){process.stdout.write(JSON.stringify(prepared())+'\n');return;}assure(args.length===4&&args[0]==='--apply'&&args[2]==='--handoff-sha256'&&/^[a-f0-9]{64}$/u.test(args[3]),'handoff');const targetBytes=checkedFile(resolve(args[1]));assure(sha256(targetBytes)===args[3],'handoff');const target=validateTarget(JSON.parse(targetBytes)),fixtureBytes=checkedFile(target.fixturePath),fixture=validateFixture(JSON.parse(fixtureBytes));assure(sha256(fixtureBytes)===target.hashes.fixtureSha256,'handoff');const self=fileURLToPath(import.meta.url),contract=fileURLToPath(new URL('./e4-restore-business-contract.mjs',import.meta.url));assure(sha256(readFileSync(self))===target.hashes.acceptanceToolSha256&&sha256(readFileSync(contract))===target.hashes.contractToolSha256,'handoff');for(const path of [self,contract]){const relative=path===self?'tests/ops/e4-restore-business-acceptance.mjs':'tests/ops/e4-restore-business-contract.mjs';assure(execFileSync('git',['show',`${target.toolSourceCommit}:${relative}`]).equals(readFileSync(path)),'handoff');}
  const output=resolve(dirname(resolve(args[1])),`e4-restore-business-${target.restoreProject}.json`),fd=reserveEvidence(output);try{const record=await runAndRecord({target,fixture,handoffSha256:args[3],persist:value=>persistEvidence(fd,value),run:async()=>{const{request}=await import('@playwright/test');return runChecks({target,fixture,observe:(action,deadline)=>remote(target,fixture,action,deadline),createContext:()=>request.newContext({baseURL:origin,timeout:10000,extraHTTPHeaders:{Origin:origin}}),readMedia:async(url,deadline)=>{const response=await fetch(new URL(url,origin),{redirect:'error',signal:AbortSignal.timeout(remaining(deadline))});assure(response.status===200&&response.headers.get('content-type')?.split(';')[0]==='image/webp','http-status');const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;assure(total<=4194304,'response-shape');chunks.push(chunk);}return Buffer.concat(chunks);}});}});process.stdout.write(JSON.stringify({mode:record.mode,checks:6,suiteRetry:0,nativeStatuses:record.nativeStatuses,durationMs:record.durationMs,workerStarted:false,rpoEstablished:false})+'\n');}finally{closeSync(fd);}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){main().catch(error=>{process.stdout.write(JSON.stringify({...safeFailure(error,error.safeStage),nativeStatuses:error.safeNativeStatuses??[]})+'\n');process.exitCode=1;});}
