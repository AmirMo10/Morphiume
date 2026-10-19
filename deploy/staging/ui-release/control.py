#!/usr/bin/env python3
"""Finite UI-only private-preview release. Default plan performs no I/O.

This is a prepared protocol, not evidence of a deployment. Every mutation needs
an externally hashed request, self hash, predecessor journal hash and --apply.
No migration, seed, operator provisioning, image build/pull or automatic retry.
"""
import argparse
import ast
import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import types
import urllib.error
import urllib.request

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
SITE = Path('/etc/nginx/sites-available/morphiume')
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
LIB_SOURCE = '3b62c340cbcb9becec3b1a9552eedeecb4837be2'
LIB_CONTROL = 'bc2d394283b7f6f8cb779429f97577022640d05eef56241a250eec0972ce9639'
LIB_SCHEDULE = '6f6fb1a17bd9981515630a822857f05e65a7dcabddb782059e0feddf4fd926cf'
LIB_INSTALLER = '828993203d6943e3787836e171d45c4131829941c8b3475d9e02a44bf26be179'
BOOTSTRAP = 'b00f191cbbd28c0d96e4a24125cfd339af8f0897c3fdfaf9e492ff264c3b98b0'
BOOT_SOURCE = '7feb4fe8e8254e917c53f9654b315ee7ef3fada1'
MIGRATIONS = '4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119'
RESTORE_RAW = '63f50b595b2871e67f6ecff9b213aee43cd328cd2172cce170ce7c30675bed95'
RESTORE_MAIN_AST = '228bf29cd21a9f5407ea1a02c77ff867a334e3ef48ff07d16302db6c91781e75'
HASH = re.compile('[a-f0-9]{64}')
COMMIT = re.compile('[a-f0-9]{40}')
UUID = re.compile('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
PROJECT = re.compile('morphiume-runtime-restore-[0-9]{8}t[0-9]{6}z-[a-f0-9]{6}')
BASE_KEYS = {'sourceCommit','testedPlatformConfig','candidateManifestDigest','archiveSha256','opsSha256'}
IDENTITY_KEYS = BASE_KEYS | {'runtimeImageId','engineProofSha256'}
FILES = ('accepted-image.tar.gz','accepted-image.sha256','image-identity.json')
UNITS = tuple('morphiume-runtime-'+a+'.'+k for a in ('health','backup') for k in ('timer','service'))
GUARD = """if c.run(['docker', 'ps', '--all', '--filter', 'label=morphiume.restore.scope=runtime', '--format', '{{.ID}}']):
    raise ValueError('An existing runtime restore requires explicit recovery; no duplicate or cleanup is attempted')
"""


def need(value, code='ui_release_guard'):
    if not value: raise ValueError(code)


def sha(value): return hashlib.sha256(value).hexdigest()
def encode(value): return (json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
def utc(): return dt.datetime.now(dt.timezone.utc).isoformat()


def instant(value):
    need(isinstance(value,str)); result=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    need(result.tzinfo is not None and result.utcoffset()==dt.timedelta(0)); return result


def parse(value):
    def pairs(items):
        result={}
        for key,item in items: need(key not in result,'duplicate_json'); result[key]=item
        return result
    return json.loads(value,object_pairs_hook=pairs,parse_constant=lambda _:need(False,'nonfinite_json'))


def exact(path):
    path=Path(path); need(path.is_absolute() and path.resolve()==path and not any(p.is_symlink() for p in (path,*path.parents)),'path')
    return path


def file_metadata(path,mode=0o600,uid=0,maximum=16*1024**2):
    path=exact(path); info=path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid==info.st_gid==uid and stat.S_IMODE(info.st_mode)==mode and info.st_nlink==1 and 0<=info.st_size<=maximum,'file_metadata')
    return path


def raw(path,digest=None,mode=0o600,uid=0,maximum=16*1024**2):
    path=file_metadata(path,mode,uid,maximum)
    body=path.read_bytes()
    if digest is not None: need(isinstance(digest,str) and HASH.fullmatch(digest) and sha(body)==digest,'file_hash')
    return body


def reference(value):
    need(type(value) is dict and set(value)=={'path','sha256'} and isinstance(value['sha256'],str) and HASH.fullmatch(value['sha256']))
    return parse(raw(value['path'],value['sha256']))


def identity(value,loaded):
    need(type(value) is dict and set(value)==(IDENTITY_KEYS if loaded else BASE_KEYS))
    need(COMMIT.fullmatch(value.get('sourceCommit','')) and value.get('opsSha256')==OPS)
    for key in ('testedPlatformConfig','candidateManifestDigest',*(('runtimeImageId',) if loaded else ())):
        need(isinstance(value[key],str) and re.fullmatch('sha256:[a-f0-9]{64}',value[key]))
    for key in ('archiveSha256',*(('engineProofSha256',) if loaded else ())): need(isinstance(value[key],str) and HASH.fullmatch(value[key]))
    return value


def frontend_paths(paths):
    need(type(paths) is list and 0<len(paths)<=512 and paths==sorted(set(paths)))
    for name in paths:
        need(isinstance(name,str) and not name.startswith('/') and '..' not in Path(name).parts and '\\' not in name)
        allowed=name.startswith(('src/components/','src/styles/','public/','tests/','docs/','deploy/staging/ui-release/'))
        allowed |= name.startswith('src/app/') and not name.startswith('src/app/api/')
        allowed |= name in {'deploy/staging/private-preview/'+n for n in ('control.py','prepare.py','schedule.py','test-prepare.py','test-release.py')}
        allowed |= name=='.github/workflows/verify.yml'
        need(allowed,'non_ui_change')
    return paths


def validate_request(value):
    keys={'formatVersion','mode','operationId','previous','candidate','previousProfileSha256','capabilitySha256','siteSha256',
        'preservedPairCount','baselineSha256','incoming','frontendReview','callbackSha256','nativeEvidence','recovery','approved','sharedDatabaseWindowReleased'}
    need(type(value) is dict and set(value)==keys and type(value['formatVersion']) is int and value['formatVersion']==1)
    need(value['mode']=='private-preview-ui-release-v1' and UUID.fullmatch(value.get('operationId','')))
    identity(value['previous'],True); identity(value['candidate'],False)
    need(value['previous']['sourceCommit']!=value['candidate']['sourceCommit'])
    need(type(value['preservedPairCount']) is int and 5<=value['preservedPairCount']<=32)
    for key in ('previousProfileSha256','capabilitySha256','siteSha256','callbackSha256'): need(isinstance(value[key],str) and HASH.fullmatch(value[key]))
    need(value['baselineSha256'] is None or isinstance(value['baselineSha256'],str) and HASH.fullmatch(value['baselineSha256']))
    inc=value['incoming']; need(type(inc) is dict and set(inc)=={'directory','publicAcceptedSha256'})
    need(Path(inc['directory'])==ROOT/'incoming'/('ui-release-'+value['operationId']) and HASH.fullmatch(inc['publicAcceptedSha256']))
    review=value['frontendReview']; need(type(review) is dict and set(review)=={'reviewed','changedPaths'} and review['reviewed'] is True)
    frontend_paths(review['changedPaths'])
    need(type(value['approved']) is bool and value['sharedDatabaseWindowReleased'] is True)
    need(value['nativeEvidence'] is None or type(value['nativeEvidence']) is dict and set(value['nativeEvidence'])=={'path','sha256'})
    recovery=value['recovery']
    if recovery is not None:
        need(type(recovery) is dict and set(recovery)=={'fixture','temporaryIdentity','businessResult','processRecord'})
        for key in ('fixture','temporaryIdentity','businessResult','processRecord'):
            item=recovery[key]; need(item is None or type(item) is dict and set(item)=={'path','sha256'})
    return value


def module_from(path,digest,name):
    path=exact(path)
    for parent in path.parents: need(parent.stat().st_uid==0 and not stat.S_IMODE(parent.stat().st_mode)&0o022,'code_parent')
    body=raw(path,digest,mode=0o644); module=types.ModuleType(name); module.__file__=str(path)
    exec(compile(body,str(path),'exec'),module.__dict__); return module


def cache_guard(parent):
    prefix=Path(parent)/'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink(),'unexpected_bytecode_cache')
    sys.dont_write_bytecode=True; sys.pycache_prefix=str(prefix)
    return prefix


def verify_ancestry(c,previous,candidate):
    c.run(['git','-C','/opt/morphiume','merge-base','--is-ancestor',previous,candidate])
    # FETCH_HEAD is the one exact `fetch --no-tags origin main` result, not a
    # possibly stale local branch or a separately accepted off-main descendant.
    c.run(['git','-C','/opt/morphiume','merge-base','--is-ancestor',candidate,'FETCH_HEAD'])


def context(request,bundle_source):
    """Verify frozen public bytes before importing; never call old first-transition gates."""
    parent=ROOT/'releases'/LIB_SOURCE/'tools'/LIB_CONTROL
    h=module_from(parent/'private-preview-control.py',LIB_CONTROL,'ui_release_verified_legacy_utilities')
    h.protected_code_parent(parent)
    for name,digest in h.LEGACY.items(): raw(parent/name,digest,mode=0o644)
    c,backup,health,g,p,_=h.import_frozen({'candidate':{'sourceCommit':bundle_source}},parent,verify_archives=False)
    return h,c,backup,health,g,p,sys.modules['restore']


def library(name,digest):
    return module_from(ROOT/'releases'/LIB_SOURCE/'tools'/digest/name,digest,'ui_release_verified_'+name.replace('.','_'))


def manager(c,unit):
    fields=('Id','LoadState','ActiveState','UnitFileState','Result','ExecMainStatus','InvocationID')
    result=dict(line.split('=',1) for line in c.run(['systemctl','show',unit,'--property='+','.join(fields)]).splitlines())
    need(set(result)==set(fields) and result['Id']==unit and result['LoadState']=='loaded'); return result


def paused(c):
    result={u:manager(c,u) for u in UNITS}
    need(all(v['ActiveState']=='inactive' and (u.endswith('.timer') or v['Result']=='success' and v['ExecMainStatus']=='0') for u,v in result.items()),'units_not_quiet')
    return result


def tree_view(root,exclude_postgres=False):
    """Hash evidence/config/media, never PostgreSQL data files; preserve directory metadata."""
    root=exact(root); result={}; total=0
    for parent,dirs,files in os.walk(root,followlinks=False):
        directory=exact(parent); info=directory.lstat()
        need(stat.S_ISDIR(info.st_mode) and len(result)<65536)
        key=directory.relative_to(root).as_posix()
        result[key]={'uid':info.st_uid,'gid':info.st_gid,'mode':stat.S_IMODE(info.st_mode),'device':info.st_dev,'inode':info.st_ino}
        for child in dirs: exact(directory/child)
        if exclude_postgres and directory==root and 'postgres' in dirs:
            pg=directory/'postgres'; info=pg.lstat(); need(info.st_uid==info.st_gid==999 and stat.S_IMODE(info.st_mode)==0o700)
            result['postgres']={'uid':info.st_uid,'gid':info.st_gid,'mode':stat.S_IMODE(info.st_mode),'device':info.st_dev,'inode':info.st_ino}
            dirs.remove('postgres')
        for name in files:
            path=exact(directory/name); info=path.lstat()
            need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size<=64*1024**2 and len(result)<65536)
            total+=info.st_size; need(total<=16*1024**3)
            with path.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
            result[path.relative_to(root).as_posix()]={'uid':info.st_uid,'gid':info.st_gid,'mode':stat.S_IMODE(info.st_mode),'bytes':info.st_size,'sha256':digest,'device':info.st_dev,'inode':info.st_ino}
    return result


def restore_items(c):
    ids=c.run(['docker','ps','--all','--no-trunc','--filter','label=morphiume.restore.scope=runtime','--format','{{.ID}}']).splitlines()
    return parse(c.run(['docker','inspect',*ids])) if ids else []


def pair_root(project,guard):
    need(guard is not None,'missing_verified_restore_mapping')
    root=guard.OLD_RELEASES[project]['root'] if project in guard.OLD_RELEASES else ROOT/'restore'/project
    need(Path(root).parent==ROOT/'restore'); return exact(root)


def pair_snapshot(c,count,extra=None,include_storage=True,guard=None):
    groups={}
    for item in restore_items(c):
        project=item['Config']['Labels'].get('com.docker.compose.project'); need(isinstance(project,str) and PROJECT.fullmatch(project))
        if project==extra: continue
        groups.setdefault(project,[]).append(item)
    need(len(groups)==count,'restore_pair_count')
    result={}
    for project,items in sorted(groups.items()):
        need(len(items)==2 and {i['Config']['Labels'].get('com.docker.compose.service') for i in items}=={'app','db'})
        root=pair_root(project,guard); need(root.lstat().st_uid==0 and stat.S_IMODE(root.lstat().st_mode)==0o700)
        entries={}
        for item in items:
            state=item['State']; need(state['Status']=='exited' and all(state[k] is False for k in ('Running','Paused','Restarting','OOMKilled')) and type(state['ExitCode']) is int and state['ExitCode'] in (0,143),'old_restore_running_or_failed')
            need(re.fullmatch('[a-f0-9]{64}',item['Id']))
            entries[item['Id']]={'image':item['Image'],'configSha256':sha(encode(item['Config'])),'hostConfigSha256':sha(encode(item['HostConfig'])),'mounts':item['Mounts'],'state':state}
        result[project]={'containers':entries,'storage':tree_view(root,exclude_postgres=True) if include_storage else None}
    return result


def owner_digest(c,p):
    result={}; owners="SELECT user_id FROM public.role_membership WHERE role='owner'"
    for table,column in (('user','id'),('account','user_id'),('two_factor','user_id'),('role_membership','user_id')):
        result[table]=p.sql(c,"SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(v,'' ORDER BY v),''),'UTF8')),'hex')) FROM (SELECT to_jsonb(t)::text v FROM public.\""+table+'" t WHERE t.'+column+' IN ('+owners+')) bounded')
        need(type(result[table]) is dict and type(result[table].get('count')) is int and HASH.fullmatch(result[table].get('sha256','')))
    need(result['user']['count']>0,'owner_missing'); return result


def protected(request,h,c,g,p,extra=None):
    c.assert_boundaries(); c.db_container()
    db=parse(c.run(['docker','inspect',c.DB_CONTAINER]))[0]
    return {'configs':h.config_files(),'capability':h.capability({'capabilitySha256':request['capabilitySha256']}),
        'site':h.file_view(SITE,mode=0o644),'owners':owner_digest(c,p),'pairs':pair_snapshot(c,request['preservedPairCount'],extra,guard=g),
        'databaseContainer':{'id':db['Id'],'image':db['Image'],'configSha256':sha(encode(db['Config'])),'mounts':db['Mounts']},
        'reservedMount':c.run(['findmnt','--mountpoint','/srv/morphiume/postgres','--noheadings','--output','SOURCE,FSTYPE,MAJ:MIN']),
        'releaseLock':h.file_view(ROOT.parent/'deploy.lock'),'dispatchLock':h.file_view(CONFIG/'schedule-dispatch.lock'),
        'historicalRecords':{name:h.file_view(CONFIG/name) for name in ('redesign-upgrade.json','private-preview-transition.json')}}


def immutable_core(value):
    return {k:v for k,v in value.items() if k not in ('owners','pairs')}


def assert_protected(before,after,allow_new_media=False):
    need(before==after,'protected_state_changed')


def runtime(request,h,c,which='previous',loaded=None,running=True):
    expected=request['previous'] if which=='previous' else loaded
    c.match_mapping(expected,c.archived_image(expected)); profile=c.active_profile(required=True); c.match_mapping(profile,expected)
    need(profile['origin']=='http://192.168.240.51' and profile['profile']=='private-ip')
    deployed=parse(raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,expected)
    need(deployed.get('accessProfileSha256')==c.canonical_hash(profile))
    need(raw(CONFIG/'deploy.env').decode()==c.compose_environment(expected['runtimeImageId'],Path(profile['opsRoot']),profile))
    c.load_configs(); c.validate_app_containers(h.writers(c),expected,running=running)
    if running: h.ready()
    return profile,deployed


def incoming(request,h,c):
    directory=exact(request['incoming']['directory']); h.metadata(directory,mode=0o700,directory=True)
    need({p.name for p in directory.iterdir()}==set(FILES)|{'public-accepted.json'})
    ci=parse(raw(directory/'public-accepted.json',request['incoming']['publicAcceptedSha256']))
    need(set(ci)=={'formatVersion','mode','repository','sourceCommit','runId','runAttempt','verifyJob','imageJob','artifact','observedUtc'})
    need(ci['formatVersion']==1 and type(ci['formatVersion']) is int and ci['mode']=='root-observed-accepted-github-ci' and ci['repository']=='AmirMo10/Morphiume')
    need(ci['sourceCommit']==request['candidate']['sourceCommit'] and isinstance(ci['runId'],str) and ci['runId'].isdigit() and type(ci['runAttempt']) is int and ci['runAttempt']>0)
    for key in ('verifyJob','imageJob'): need(set(ci[key])=={'id','conclusion'} and isinstance(ci[key]['id'],str) and ci[key]['id'].isdigit() and ci[key]['conclusion']=='success')
    a=ci['artifact']; need(set(a)=={'id','zipSha256','testedPlatformConfig','candidateManifestDigest','archiveSha256'} and isinstance(a['id'],str) and a['id'].isdigit() and HASH.fullmatch(a['zipSha256']))
    need(all(a[k]==request['candidate'][k] for k in ('testedPlatformConfig','candidateManifestDigest','archiveSha256')))
    age=(instant(utc())-instant(ci['observedUtc'])).total_seconds(); need(0<=age<=3600,'ci_observation_stale')
    for name in FILES: file_metadata(directory/name,maximum=1024**3)
    verifier=module_from(c.OPS_ROOT/'verify-release.py',sha(raw(c.OPS_ROOT/'verify-release.py',mode=0o644)),'ui_release_verified_archive')
    q=request['candidate']; report=verifier.verify(directory/FILES[0],directory/FILES[2],q['sourceCommit'],q['testedPlatformConfig'],q['candidateManifestDigest'],q['archiveSha256'])
    required=report['archiveBytes']+2*report['uncompressedLayerBytes']+1024**3
    need(all(shutil.disk_usage(path).free>=required for path in (ROOT,'/var/lib/docker')),'archive_headroom')
    return directory,report


def evidence_root(request): return ROOT/'metrics'/('ui-release-'+request['operationId'])


def active_operation(request,allow_previous=False):
    path=CONFIG/'ui-release-active.json'
    if not path.exists():
        need(allow_previous,'missing_active_operation'); return None
    pointer=parse(raw(path)); need(type(pointer) is dict and set(pointer)=={'formatVersion','mode','operationId','evidenceRoot','requestCoreSha256'})
    need(pointer['formatVersion']==1 and pointer['mode']=='ui-release-active' and UUID.fullmatch(pointer['operationId']))
    need(pointer['evidenceRoot']==str(ROOT/'metrics'/('ui-release-'+pointer['operationId'])))
    if allow_previous:
        previous=parse(raw(Path(pointer['evidenceRoot'])/'journal.json'))
        need(previous['phase']=='complete-timers-active-enabled' and previous['candidate']==request['previous'],'unfinished_prior_ui_release')
    else:
        need(pointer['operationId']==request['operationId'] and pointer['requestCoreSha256']==sha(encode(request_core(request))),'other_active_ui_release')
    return pointer


def save(h,state,phase):
    state['phase']=phase; state['stages'].append({'phase':phase,'utc':utc()})
    root=Path(state['evidenceRoot']); body=encode(state)
    if (root/'journal.json').exists(): h.replace_private(root/'journal.json',body)
    else: h.write_new(root/'journal.json',body)
    h.write_new(root/(str(len(state['stages'])).zfill(2)+'-'+phase+'.json'),body)


def state_for(request,digest,phase=None):
    need(isinstance(digest,str) and HASH.fullmatch(digest),'missing_predecessor_hash')
    active_operation(request)
    state=parse(raw(evidence_root(request)/'journal.json',digest))
    need(state['operationId']==request['operationId'] and state['previous']==request['previous'] and state['candidateBase']==request['candidate'])
    need(state['requestCore']==request_core(request))
    if phase is not None: need(state['phase']==phase,'phase_or_replay')
    return state


def request_core(request): return {k:v for k,v in request.items() if k not in ('nativeEvidence','recovery','approved','baselineSha256')}


def inspect(request,h,c,g,p):
    active_operation(request,allow_previous=True)
    need(c.run(['git','-C','/opt/morphiume','rev-parse','HEAD'])==request['previous']['sourceCommit'] and not c.run(['git','-C','/opt/morphiume','status','--porcelain']))
    profile,deployed=runtime(request,h,c)
    need(c.canonical_hash(profile)==request['previousProfileSha256'] and deployed.get('privatePreviewAcceptance')=='accepted')
    need(sha(raw(SITE,mode=0o644))==request['siteSha256'])
    need(not evidence_root(request).exists() and not (ROOT/'releases'/request['candidate']['sourceCommit']).exists(),'existing_release_or_operation')
    incoming(request,h,c)
    # Reuse the actual original schema/path/proof validators once at the fresh
    # baseline, including the retained uppercase physical613 storage path.
    old=reference({'path':str(ROOT/'preservation/c7d9bd5c-46b4-4709-bff6-9d0f5c0531f3/old-restore-inventory.json'),'sha256':h.OLD_INVENTORY})
    g.inventories_shape(old); items=restore_items(c)
    for record in old['pairs']: g.old_pair(c,record,items)
    units={u:manager(c,u) for u in UNITS}
    need(all(v['ActiveState']=='active' and v['UnitFileState']=='enabled' for u,v in units.items() if u.endswith('.timer')))
    stable=protected(request,h,c,g,p)
    stable['scheduleFiles']=h.schedule_files(); stable['approval']=h.file_view(CONFIG/'schedule-approved.json')
    stable['sourceMedia']=g.media_snapshot(c,None,ROOT/'media')
    return stable,units,profile,deployed


def child_then_postcheck(c,child,postcheck):
    """A separate loader owns the release flock. Never hold its parent flock."""
    result=child()
    with c.lock(): return postcheck(result)


def prepare(request,args,h,c,backup,health,g,p,r):
    baseline,units,profile,deployed=inspect(request,h,c,g,p)
    need(request['baselineSha256']==sha(encode(baseline)),'baseline_changed')
    root=evidence_root(request)
    state={'formatVersion':1,'mode':'private-preview-ui-release-v1','operationId':request['operationId'],'evidenceRoot':str(root),
        'previous':request['previous'],'candidateBase':request['candidate'],'requestCore':request_core(request),'baseline':baseline,
        'timerBaseline':{u:v for u,v in units.items() if u.endswith('.timer')},'previousProfile':profile,'previousDeployed':deployed,
        'stages':[],'automaticRetry':False,'automaticRollback':False,'migrationInvoked':False,'seedInvoked':False,'operatorEnableInvoked':False}
    # Keep the operation exclusive even while the frozen child temporarily owns
    # the flock. A later release may supersede only a completed prior operation.
    with c.lock():
        active_operation(request,allow_previous=True); runtime(request,h,c)
        root.mkdir(mode=0o700); h.metadata(root,mode=0o700,directory=True)
        for name in ('deployed-release.json','active-profile.json','deploy.env'): h.write_new(root/('previous-'+name),raw(CONFIG/name))
        h.write_new(root/'baseline.json',encode(baseline)); save(h,state,'before-timer-pause')
        pointer=encode({'formatVersion':1,'mode':'ui-release-active','operationId':request['operationId'],'evidenceRoot':str(root),'requestCoreSha256':sha(encode(request_core(request)))})
        active=CONFIG/'ui-release-active.json'
        if active.exists():
            h.write_new(root/'previous-ui-release-active.json',raw(active)); h.replace_private(active,pointer)
        else: h.write_new(active,pointer)
    try:
        c.run(['systemctl','stop',*(u for u in UNITS if u.endswith('.timer'))],timeout=30)
        deadline=time.monotonic()+1250
        while True:
            jobs=[manager(c,u)['ActiveState'] for u in UNITS if u.endswith('.service')]
            need(all(x in ('inactive','activating','active','deactivating') for x in jobs),'preparation_job_failed')
            if all(x=='inactive' for x in jobs): break
            need(time.monotonic()<deadline,'active_job_deadline'); time.sleep(0.5)
        state['pausedUnits']=paused(c)
        need(all(state['pausedUnits'][u]['UnitFileState']==v['UnitFileState'] for u,v in state['timerBaseline'].items()))
        save(h,state,'timers-paused-jobs-finished')
        with c.lock():
            assert_protected({k:v for k,v in baseline.items() if k not in ('scheduleFiles','approval','sourceMedia')},protected(request,h,c,g,p))
            directory,report=incoming(request,h,c)
            c.run(['git','-C','/opt/morphiume','fetch','--no-tags','origin','main'],timeout=90)
            a=request['previous']['sourceCommit']; b=request['candidate']['sourceCommit']
            verify_ancestry(c,a,b)
            changed=c.run(['git','-C','/opt/morphiume','diff','--name-only',a,b]).splitlines()
            need(sorted(changed)==request['frontendReview']['changedPaths'],'reviewed_diff_changed')
            for name in h.OPS_FILES:
                command=['git','-C','/opt/morphiume','show',b+':deploy/staging/'+name]
                blob=subprocess.run(command,capture_output=True,timeout=15,env=c.command_environment(command))
                need(blob.returncode==0 and len(blob.stdout)<=1024**2)
                need(blob.stdout.replace(b'\r\n',b'\n')==raw(c.OPS_ROOT/name,mode=0o644).replace(b'\r\n',b'\n'),'candidate_ops_changed')
            c.run(['git','-C','/opt/morphiume','merge','--ff-only',b],timeout=90)
            need(c.run(['git','-C','/opt/morphiume','rev-parse','HEAD'])==b and not c.run(['git','-C','/opt/morphiume','status','--porcelain']))
            release=ROOT/'releases'/b; release.mkdir(mode=0o700)
            for name in FILES:
                fd=os.open(release/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                try:
                    os.fchmod(fd,0o600)
                    with os.fdopen(fd,'wb',closefd=False) as output,(directory/name).open('rb') as source: shutil.copyfileobj(source,output); output.flush(); os.fsync(output.fileno())
                finally: os.close(fd)
            c.preserve_ops_bundle(b); save(h,state,'candidate-materialized-before-loader')
        def child():
            a=request['candidate']; prefix=cache_guard(c.bundle_path(b,OPS))
            command=['python3','-I','-B','-X','pycache_prefix='+str(prefix),str(c.bundle_path(b,OPS)/'verify-release.py'),str(release/FILES[0]),str(release/FILES[2]),
                '--source',b,'--config-id',a['testedPlatformConfig'],'--manifest-digest',a['candidateManifestDigest'],'--archive-sha256',a['archiveSha256'],'--load','--namespace','runtime','--ops-sha256',OPS]
            for name in ('loader-stdout.log','loader-stderr.log'): h.write_new(root/name,b'')
            save(h,state,'loader-dispatching')
            begin=time.monotonic()
            with (root/'loader-stdout.log').open('ab') as out,(root/'loader-stderr.log').open('ab') as err:
                proc=subprocess.run(command,stdout=out,stderr=err,timeout=600,env=c.command_environment(command)); out.flush(); err.flush(); os.fsync(out.fileno()); os.fsync(err.fileno())
            record={'exitCode':proc.returncode,'invocationCount':1,'automaticRetry':False,'seconds':time.monotonic()-begin,
                'stdoutSha256':sha(raw(root/'loader-stdout.log')),'stderrSha256':sha(raw(root/'loader-stderr.log'))}
            h.write_new(root/'loader-process.json',encode(record)); need(proc.returncode==0,'loader_failed'); return record
        def postcheck(record):
            candidate=c.archived_image(request['candidate']); loaded={k:candidate[k] for k in IDENTITY_KEYS}; identity(loaded,True)
            runtime(request,h,c); paused(c)
            assert_protected({k:v for k,v in baseline.items() if k not in ('scheduleFiles','approval','sourceMedia')},protected(request,h,c,g,p))
            state.update(candidate=loaded,loader=record,engineRecordSha256=sha(raw(c.engine_record_path(b,OPS))))
            save(h,state,'candidate-loaded-previous-runtime-preserved'); return state
        return child_then_postcheck(c,child,postcheck)
    except Exception:
        state['failedAfterPhase']=state['phase']; save(h,state,'failed-preserved'); raise


def common(request,state,h,c,g,p,extra=None,owner=True):
    paused(c); current=protected(request,h,c,g,p,extra)
    baseline={k:v for k,v in state['baseline'].items() if k not in ('scheduleFiles','approval','sourceMedia')}
    if not owner: baseline.pop('owners'); current.pop('owners')
    assert_protected(baseline,current)
    need(h.schedule_files()==state['baseline']['scheduleFiles'] and h.file_view(CONFIG/'schedule-approved.json')==state['baseline']['approval'])
    return current


def stop_writers(h,c,candidate):
    before=h.writers(c); c.validate_app_containers(before,candidate)
    command=c.compose(candidate['runtimeImageId'],ops_root=c.bundle_path(candidate['sourceCommit'],OPS))
    c.run(command+['stop','--timeout','30','app','worker'],timeout=75)
    after=h.writers(c); c.validate_app_containers(after,candidate,running=False)
    return h.graceful_writer_stop(before,after)


def apply_image(request,state,h,c,backup,health,g,p,r):
    common(request,state,h,c,g,p); runtime(request,h,c)
    candidate=state['candidate']; c.match_mapping(candidate,c.archived_image(candidate)); configs=c.load_configs()
    profile=c.make_profile(candidate,'private-ip',configs)
    with c.lock():
        common(request,state,h,c,g,p); save(h,state,'before-image-writer-stop')
        state['gracefulExitCodes']=stop_writers(h,c,request['previous']); save(h,state,'previous-writers-stopped')
        state['previousBackup']=h.backup_verified(c,backup,request['previous']); save(h,state,'previous-encrypted-backup-verified')
        before=p.capture_database(c,g); h.write_new(Path(state['evidenceRoot'])/'database-before.json',encode(before))
        p.candidate_migrations(c,{'candidate':candidate,'migrationManifestSha256':MIGRATIONS})
        c.preserve_profile(profile); c.select_profile(profile)
        env=c.compose_environment(candidate['runtimeImageId'],c.OPS_ROOT,profile).encode()
        h.replace_private(CONFIG/'deploy.env',env)
        deployed=candidate|{'project':c.PROJECT,'database':c.DATABASE,'accessProfileSha256':c.canonical_hash(profile),'deployedUtc':utc(),
            'previousSourceCommit':request['previous']['sourceCommit'],'preMigrationBackup':state['previousBackup']['directory'],
            'privatePreviewAcceptance':'pending','privatePreviewCapabilitySha256':request['capabilitySha256'],'uiReleaseOperationId':request['operationId'],
            'migrationInvoked':False,'seedInvoked':False}
        h.replace_private(CONFIG/'deployed-release.json',encode(deployed)); save(h,state,'candidate-profile-selected')
        command=c.compose(candidate['runtimeImageId']); c.run(command+['config','--quiet'])
        c.run(command+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app'],timeout=210)
        c.validate_app_containers([i for i in h.writers(c) if i['Config']['Labels'].get('com.docker.compose.service')=='app'],candidate,services=('app',))
        # Readiness uses no preview principal; compare before starting the worker or QA.
        h.ready(); after=p.capture_database(c,g); state['databasePreservation']=p.compare_database(before,after)
        need(g.media_snapshot(c,None,ROOT/'media')==state['baseline']['sourceMedia'],'source_media_changed_during_swap')
        h.write_new(Path(state['evidenceRoot'])/'database-after.json',encode(after))
        c.run(command+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','worker'],timeout=210)
        runtime(request,h,c,'candidate',candidate); common(request,state,h,c,g,p)
        state.update(candidateProfile=profile,candidateProfileSha256=c.canonical_hash(profile),imageReadyUtc=utc())
        save(h,state,'image-ready-native-pending')
    return state


def accept_native(request,state,h,c,backup,health,g,p,r):
    common(request,state,h,c,g,p); runtime(request,h,c,'candidate',state['candidate'])
    marker=reference(request['nativeEvidence']); q={'candidate':state['candidate'],'candidateProfileSha256':state['candidateProfileSha256']}
    h.validate_native(marker,q,request['capabilitySha256'])
    need(instant(state['imageReadyUtc'])<=instant(marker['acceptedUtc']))
    need(isinstance(marker.get('rawResultSha256'),str) and HASH.fullmatch(marker['rawResultSha256']))
    with c.lock():
        common(request,state,h,c,g,p); deployed=parse(raw(CONFIG/'deployed-release.json'))
        deployed.update(privatePreviewAcceptance='accepted',privatePreviewNativeEvidenceSha256=request['nativeEvidence']['sha256'])
        h.replace_private(CONFIG/'deployed-release.json',encode(deployed)); state['nativeEvidence']=request['nativeEvidence']; save(h,state,'native-accepted')
    return state


def adapted_restore(source,assert_pairs):
    """Replace exactly the old-footprint If, retaining every other frozen AST node."""
    source=source.replace(b'\r\n',b'\n'); need(sha(source)==RESTORE_RAW)
    tree=ast.parse(source); main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
    dump=lambda n:ast.dump(n,include_attributes=False)
    need(sha(dump(main).encode())==RESTORE_MAIN_AST)
    main=copy.deepcopy(main); guard=ast.parse(GUARD).body[0]; hits=[]
    for parent in ast.walk(main):
        if isinstance(parent,ast.With):
            hits.extend((parent,i) for i,node in enumerate(parent.body) if dump(node)==dump(guard))
    need(len(hits)==1); parent,index=hits[0]
    replacement=ast.Expr(ast.Call(ast.Name('_preserved_pairs',ast.Load()),[],[])); parent.body[index]=replacement
    restored=copy.deepcopy(main)
    for node in ast.walk(restored):
        if isinstance(node,ast.With):
            for i,entry in enumerate(node.body):
                if dump(entry)==dump(replacement): node.body[i]=copy.deepcopy(guard)
    original=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main'); need(dump(restored)==dump(original))
    return ast.fix_missing_locations(ast.Module([main],type_ignores=[]))


def recovery_start(request,state,h,c,backup,health,g,p,r):
    need(request['recovery'] is not None and request['recovery']['fixture'] is not None and request['recovery']['temporaryIdentity'] is not None)
    fixture=reference(request['recovery']['fixture']); need(fixture.get('sourceCommit')==state['candidate']['sourceCommit'])
    native=reference(state['nativeEvidence'])
    need(native.get('retainPrimary') is True and native.get('restoreFixtureSha256')==request['recovery']['fixture']['sha256'],'fixture_not_from_accepted_native')
    identity_ref=request['recovery']['temporaryIdentity']; identity_path=exact(identity_ref['path']); raw(identity_path,identity_ref['sha256'])
    need(identity_path.parent.parent==Path('/dev/shm') and re.fullmatch('morphiume-runtime-restore-[a-f0-9]{12}',identity_path.parent.name) and identity_path.name=='identity')
    h.metadata(identity_path.parent,mode=0o700,directory=True)
    common(request,state,h,c,g,p); runtime(request,h,c,'candidate',state['candidate'])
    with c.lock():
        save(h,state,'before-recovery-writer-stop'); state['recoveryGracefulExitCodes']=stop_writers(h,c,state['candidate'])
        state['sourceStoppedIds']=sorted(i['Id'] for i in h.writers(c))
        state['recoveryBackup']=h.backup_verified(c,backup,state['candidate']); state['recoveryMedia']=g.media_snapshot(c,r,ROOT/'media')
        manifest=reference({'path':state['recoveryBackup']['directory']+'/backup-manifest.json','sha256':state['recoveryBackup']['manifestSha256']})
        need(instant(fixture['createdAt'])<=instant(native['acceptedUtc'])<=instant(manifest['backupStartUtc']))
        state['fixture']=request['recovery']['fixture']; state['temporaryIdentity']=identity_ref
        save(h,state,'before-one-isolated-restore')
    namespace=dict(r.__dict__); namespace['_preserved_pairs']=lambda:need(pair_snapshot(c,request['preservedPairCount'],guard=g)==state['baseline']['pairs'])
    exec(compile(adapted_restore(raw(c.OPS_ROOT/'runtime/restore.py',mode=0o644),namespace['_preserved_pairs']),str(c.OPS_ROOT/'runtime/restore.py'),'exec'),namespace)
    q=state['candidate']; args=types.SimpleNamespace(apply=True,source=q['sourceCommit'],config_id=q['testedPlatformConfig'],manifest_digest=q['candidateManifestDigest'],archive_sha256=q['archiveSha256'],ops_sha256=OPS,quiescent_window_released=True,backup_directory=Path(state['recoveryBackup']['directory']),identity=identity_path)
    result=namespace['main'](args); project=result['project']; need(PROJECT.fullmatch(project))
    root=ROOT/'restore'/project; need(result['root']==str(root) and result['workerStarted'] is False)
    common(request,state,h,c,g,p,project)
    need(g.media_snapshot(c,r,root/'media')==state['recoveryMedia'])
    app=parse(raw(root/'app.json',uid=1001)); need(app['APP_BASE_URL']=='http://localhost:3101')
    try:
        urllib.request.urlopen('http://127.0.0.1:3002/api/admin/session',timeout=10); need(False,'anonymous_restore_admin_open')
    except urllib.error.HTTPError as error: need(error.code==401)
    state.update(restoreProject=project,restoreReady=result,restoreReadySha256=sha(raw(root/'recovery-ready.json')),
        restoreStartSha256=sha(raw(root/'recovery-start.json')),restoreConfigSha256=sha(raw(root/'app.json',uid=1001)),
        freshContainers={i['Id']:sha(encode({'Config':i['Config'],'HostConfig':i['HostConfig'],'Image':i['Image'],'Mounts':i['Mounts']})) for i in restore_items(c) if i['Config']['Labels'].get('com.docker.compose.project')==project})
    save(h,state,'restore-ready-business-pending'); return state


def validate_recovery(result,process,state,request):
    need(type(result) is dict and result.get('mode')=='ui-release-recovery-result' and result.get('candidate')==state['candidate'])
    expected={'accessProfileSha256':state['candidateProfileSha256'],'capabilitySha256':request['capabilitySha256'],'restoreProject':state['restoreProject'],
        'fixtureSha256':state['fixture']['sha256'],'backupManifestSha256':state['recoveryBackup']['manifestSha256'],'readySha256':state['restoreReadySha256'],
        'appConfigSha256':state['restoreConfigSha256'],'origin':'http://localhost:3101','reviewCapabilityIgnored':True,'anonymousAdminStatus':401}
    need(all(type(result.get(k)) is type(v) and result[k]==v for k,v in expected.items()))
    checks={'nativeLogin','ownedOrder','paymentReceiptDedup','stockReservation','shipmentTracking','mediaHashes'}
    need(type(result.get('checks')) is dict and set(result['checks'])==checks and all(v is True for v in result['checks'].values()))
    need(all(result.get(k) is True for k in ('financialRowsPreserved','noFinancialRowsAdded','noNewOrder')))
    need(result.get('directSqlMutations')==0 and type(result.get('directSqlMutations')) is int)
    need(type(process) is dict and process.get('mode')=='root-observed-ui-release-recovery-process' and process.get('candidate')==state['candidate'])
    for k,v in {'operationId':request['operationId'],'restoreProject':state['restoreProject'],'rawResultSha256':request['recovery']['businessResult']['sha256'],
        'exitCode':0,'timedOut':False,'invocationCount':1,'automaticRetry':False}.items(): need(type(process.get(k)) is type(v) and process[k]==v)
    need(instant(state['restoreReady']['applicationReadyUtc'])<=instant(process['startedUtc'])<=instant(result['startedUtc'])<=instant(result['completedUtc'])<=instant(process['completedUtc'])<=instant(utc()))
    return result


def recovery_finish(request,state,h,c,backup,health,g,p,r):
    result=reference(request['recovery']['businessResult']); process=reference(request['recovery']['processRecord']); validate_recovery(result,process,state,request)
    project=state['restoreProject']; root=ROOT/'restore'/project; common(request,state,h,c,g,p,project)
    for name,key,uid in (('recovery-ready.json','restoreReadySha256',0),('recovery-start.json','restoreStartSha256',0),('app.json','restoreConfigSha256',1001)):
        raw(root/name,state[key],uid=uid)
    need(g.media_snapshot(c,r,root/'media')==state['recoveryMedia'])
    items=[i for i in restore_items(c) if i['Config']['Labels'].get('com.docker.compose.project')==project]
    r.validate_restored_containers(items,state['candidate']); before={i['Id'] for i in items}
    need({i['Id']:sha(encode({'Config':i['Config'],'HostConfig':i['HostConfig'],'Image':i['Image'],'Mounts':i['Mounts']})) for i in items}==state['freshContainers'])
    source=h.writers(c); c.validate_app_containers(source,state['candidate'],running=False)
    need(sorted(i['Id'] for i in source)==state['sourceStoppedIds'])
    accepted_time=utc()
    accepted=state['candidate']|{'mode':'native-business-restore-accepted','accessProfileSha256':state['candidateProfileSha256'],
        'capabilitySha256':request['capabilitySha256'],'origin':'http://localhost:3101','restoreProject':project,'workerStarted':False,
        'reviewCapabilityIgnored':True,'checks':result['checks'],'commandExitCode':0,'rawResultSha256':request['recovery']['businessResult']['sha256'],
        'nativeProcessRecordSha256':request['recovery']['processRecord']['sha256'],'acceptedUtc':accepted_time,
        'observedRtoSeconds':(instant(accepted_time)-instant(state['restoreReady']['recoveryStartUtc'])).total_seconds(),
        'observedRecoveryPointGapSeconds':(instant(state['restoreReady']['backupStartUtc'])-instant(reference(state['fixture'])['createdAt'])).total_seconds(),
        'rpoEstablished':False,'offsiteEstablished':False,'pitrEstablished':False}
    with c.lock():
        common(request,state,h,c,g,p,project); h.write_new(root/'business-acceptance-result.json',raw(request['recovery']['businessResult']['path'],request['recovery']['businessResult']['sha256']))
        h.write_new(root/'recovery-accepted.json',encode(accepted)); state['restoreEvidence']={'path':str(root/'recovery-accepted.json'),'sha256':sha(encode(accepted))}
        save(h,state,'recovery-accepted-before-cleanup')
        command=['docker','compose','--project-name',project,'--env-file',str(root/'restore.env'),'-f',str(c.OPS_ROOT/'runtime/compose.restore.yaml')]
        c.run(command+['stop','--timeout','30','app','db'],timeout=75)
        stopped=[i for i in restore_items(c) if i['Config']['Labels'].get('com.docker.compose.project')==project]
        need(len(stopped)==2 and {i['Id'] for i in stopped}==before)
        for item in stopped:
            s=item['State']; need(s['Status']=='exited' and all(s[k] is False for k in ('Running','Paused','Restarting','OOMKilled')) and type(s['ExitCode']) is int and s['ExitCode'] in (0,143))
        identity_ref=state['temporaryIdentity']; path=exact(identity_ref['path']); raw(path,identity_ref['sha256']); h.metadata(path.parent,mode=0o700,directory=True)
        path.unlink(); path.parent.rmdir(); common(request,state,h,c,g,p,project)
        c.run(c.compose(state['candidate']['runtimeImageId'])+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app','worker'],timeout=210)
        runtime(request,h,c,'candidate',state['candidate']); common(request,state,h,c,g,p,project)
        state['allStoppedPairs']=pair_snapshot(c,request['preservedPairCount']+1,guard=g); save(h,state,'recovery-accepted-source-healthy')
    return state


def schedule_facts(request,state,h,c,g,p):
    q=request|{'preservedPairCount':request['preservedPairCount']+1}
    actual=protected(q,h,c,g,p)
    expected={k:v for k,v in state['baseline'].items() if k not in ('scheduleFiles','approval','sourceMedia')}
    expected['pairs']=state['allStoppedPairs']; assert_protected(expected,actual)
    runtime(request,h,c,'candidate',state['candidate'])
    return actual


def schedule_phase(request,state,args,h,c,backup,health,g,p,r):
    callback_path=CONFIG/'ui-release-tools'/request['callbackSha256']/'schedule.py'
    callback=module_from(callback_path,request['callbackSha256'],'ui_release_new_callback')
    binding=types.SimpleNamespace(**globals()); s,b,installer=callback.libraries(binding)
    a=types.SimpleNamespace(script=callback_path,request=Path(args.request),request_sha256=args.request_sha256,
        self_sha256=request['callbackSha256'],control_sha256=args.self_sha256,approval_sha256=state.get('approvalSha256'),unit=None)
    root=Path(state['evidenceRoot']); facts=schedule_facts(request,state,h,c,g,p); paused(c)
    q={'candidate':state['candidate'],'candidateProfileSha256':state['candidateProfileSha256']}
    if args.action=='schedule-install':
        need(h.schedule_files()==state['baseline']['scheduleFiles'] and h.file_view(CONFIG/'schedule-approved.json')==state['baseline']['approval'])
        timers={k:installer.timer(c,k) for k in ('health','backup')}
        need(all(v['ActiveState']=='inactive' for v in timers.values()))
        acceptance={'formatVersion':1,'mode':'ui-release-accepted','operationId':request['operationId'],'candidate':state['candidate'],
            'accessProfileSha256':state['candidateProfileSha256'],'capabilitySha256':request['capabilitySha256'],
            'nativeEvidence':state['nativeEvidence'],'restoreEvidence':state['restoreEvidence'],'protected':facts,
            'baseScheduleFiles':{k:v for k,v in h.schedule_files().items() if not k.endswith('.service.d/20-private-preview-verified.conf')},
            'timerCadence':timers,'acceptedUtc':utc()}
        h.write_new(root/'release-accepted.json',encode(acceptance)); state['releaseAcceptanceSha256']=sha(encode(acceptance))
        lock=facts['dispatchLock']; need(c.run(['findmnt','--target',str(CONFIG/'schedule-dispatch.lock'),'--noheadings','--output','FSTYPE'])=='ext4')
        approval={'formatVersion':1,'mode':'ui-release-scheduled-v1','scope':'one-time-service-measurement','candidate':state['candidate'],
            'accessProfileSha256':state['candidateProfileSha256'],'capabilitySha256':request['capabilitySha256'],
            'nativeEvidence':state['nativeEvidence'],'restoreEvidence':state['restoreEvidence'],'acceptanceSha256':state['releaseAcceptanceSha256'],
            'requestSha256':args.request_sha256,'controlSha256':args.self_sha256,'callbackSha256':request['callbackSha256'],
            'dispatchLock':{k:lock[k] for k in ('path','sha256','device','inode')}|{'filesystem':'ext4'},'serviceMeasurementSha256':{'health':None,'backup':None}}
        body=encode(approval); state['approvalSha256']=sha(body); a.approval_sha256=state['approvalSha256']
        archive=root/'schedule-before'; archive.mkdir(mode=0o700)
        originals=[(CONFIG/'schedule-approved.json',archive/'schedule-approved.json',0o600)]
        for action in ('health','backup'):
            directory=Path('/etc/systemd/system')/('morphiume-runtime-'+action+'.service.d')
            need({x.name for x in directory.iterdir()}=={'20-private-preview-verified.conf'})
            originals.append((directory/'20-private-preview-verified.conf',archive/(action+'.conf'),0o644))
        with c.lock():
            with s.dispatch_lock(h,approval) as acquired:
                need(acquired); save(h,state,'schedule-install-dispatching')
                for source,destination,mode in originals:
                    before=h.file_view(source,mode=mode); need(source.stat().st_dev==archive.stat().st_dev)
                    os.rename(source,destination); after=h.file_view(destination,mode=mode)
                    need({k:v for k,v in before.items() if k!='path'}=={k:v for k,v in after.items() if k!='path'})
                    h.sync_directory(source.parent); h.sync_directory(destination.parent)
                h.write_new(CONFIG/'schedule-approved.json',body)
                for action in ('health','backup'):
                    file=Path('/etc/systemd/system')/('morphiume-runtime-'+action+'.service.d')/'20-private-preview-verified.conf'
                    h.write_new(file,s.dropin(a,action).encode(),mode=0o644)
                c.run(['systemctl','daemon-reload'])
                for action in ('health','backup'): s.effective(h,b,c,a,action,'',peer=True)
                save(h,state,'schedule-installed')
    elif args.action in ('measure-health','measure-backup'):
        approval=parse(raw(CONFIG/'schedule-approved.json',state['approvalSha256'])); callback.validate_approval(approval,request,state,a,binding)
        for action in ('health','backup'): s.effective(h,b,c,a,action,'',peer=True)
        before=p.capture_database(c,g); action=args.action.removeprefix('measure-')
        measured=installer.measure(h,q,c,s,b,a,{'approval':{'sha256':state['approvalSha256']}},state,action)
        p.compare_database(before,p.capture_database(c,g)); need(schedule_facts(request,state,h,c,g,p)==facts)
        measured['sourceAndConfigPreserved']=True; h.write_new(root/(action+'-measurement.json'),encode(measured))
        state.setdefault('measurements',{})[action]=sha(raw(root/(action+'-measurement.json')))
        save(h,state,'health-measured' if action=='health' else 'both-measured')
    elif args.action=='schedule-promote':
        approval=parse(raw(CONFIG/'schedule-approved.json',state['approvalSha256'])); callback.validate_approval(approval,request,state,a,binding)
        need(set(state['measurements'])=={'health','backup'})
        for action,digest in state['measurements'].items():
            measured=parse(raw(root/(action+'-measurement.json'),digest)); installer.validate_measurement(measured,q,action,state['approvalSha256'])
        recurring=approval|{'scope':'recurring-timers','serviceMeasurementSha256':state['measurements']}
        state['measurementApprovalSha256']=state['approvalSha256']; state['approvalSha256']=sha(encode(recurring))
        a.approval_sha256=state['approvalSha256']
        with c.lock():
            with s.dispatch_lock(h,approval) as acquired:
                need(acquired); save(h,state,'schedule-promote-dispatching')
                h.write_new(root/'measurement-approved.json',raw(CONFIG/'schedule-approved.json'))
                h.replace_private(CONFIG/'schedule-approved.json',encode(recurring))
                for action in ('health','backup'):
                    file=Path('/etc/systemd/system')/('morphiume-runtime-'+action+'.service.d')/'20-private-preview-verified.conf'
                    h.write_new(root/(action+'-measurement-dropin.conf'),raw(file,mode=0o644))
                    replace_public(h,file,s.dropin(a,action).encode())
                c.run(['systemctl','daemon-reload'])
                for action in ('health','backup'): s.effective(h,b,c,a,action,'',peer=True)
                save(h,state,'recurring-selected')
    else:
        approval=parse(raw(CONFIG/'schedule-approved.json',state['approvalSha256'])); callback.validate_approval(approval,request,state,a,binding)
        need(approval['scope']=='recurring-timers' and approval['serviceMeasurementSha256']==state['measurements'])
        for action,digest in state['measurements'].items():
            installer.validate_measurement(parse(raw(root/(action+'-measurement.json'),digest)),q,action,state['measurementApprovalSha256'])
        for action in ('health','backup'): s.effective(h,b,c,a,action,'',peer=True)
        need(all(installer.timer(c,k)==reference({'path':str(root/'release-accepted.json'),'sha256':state['releaseAcceptanceSha256']})['timerCadence'][k] for k in ('health','backup')))
        with c.lock():
            with s.dispatch_lock(h,approval) as acquired:
                need(acquired); save(h,state,'timer-start-dispatching')
                c.run(['systemctl','start',*(u for u,v in state['timerBaseline'].items() if v['UnitFileState']=='enabled')],timeout=30)
        deadline=time.monotonic()+1250
        while True:
            jobs=[manager(c,u)['ActiveState'] for u in UNITS if u.endswith('.service')]
            need(all(x in ('inactive','activating','active','deactivating') for x in jobs),'initial_timer_job_failed')
            if all(x=='inactive' for x in jobs): break
            need(time.monotonic()<deadline,'initial_timer_job_deadline'); time.sleep(0.5)
        need(all(manager(c,u)['ActiveState']=='active' and manager(c,u)['UnitFileState']==v['UnitFileState'] for u,v in state['timerBaseline'].items()))
        need(schedule_facts(request,state,h,c,g,p)==facts); save(h,state,'complete-timers-active-enabled')
    return state


def replace_public(h,path,body):
    raw(path,mode=0o644); temporary=path.with_name(path.name+'.ui-release-new')
    h.write_new(temporary,body,mode=0o644); os.replace(temporary,path); h.sync_directory(path.parent)


def load(args):
    need(os.name=='posix' and os.getuid()==0 and HASH.fullmatch(args.self_sha256 or '') and HASH.fullmatch(args.request_sha256 or ''))
    request=validate_request(parse(raw(args.request,args.request_sha256)))
    own=CONFIG/'ui-release-tools'/args.self_sha256/'control.py'; need(Path(__file__)==own)
    raw(own,args.self_sha256,mode=0o644)
    info=own.parent.lstat(); need(info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==0o700)
    for p in own.parent.parents: need(p.stat().st_uid==0 and not stat.S_IMODE(p.stat().st_mode)&0o022)
    cache_guard(own.parent)
    initial_observe=args.action=='observe' and getattr(args,'expected_state_sha256',None) is None
    source=request['previous']['sourceCommit'] if initial_observe or args.action=='prepare' else request['candidate']['sourceCommit']
    return request,context(request,source)


def observe_current(request,state,h,c,backup,health,g,p,r):
    need(c.run(['git','-C','/opt/morphiume','rev-parse','HEAD'])==request['candidate']['sourceCommit'] and not c.run(['git','-C','/opt/morphiume','status','--porcelain']))
    if state['phase']=='candidate-loaded-previous-runtime-preserved':
        common(request,state,h,c,g,p); runtime(request,h,c)
        c.match_mapping(state['candidate'],c.archived_image(state['candidate']))
    elif state['phase'] in ('image-ready-native-pending','native-accepted'):
        common(request,state,h,c,g,p); runtime(request,h,c,'candidate',state['candidate'])
    elif state['phase']=='restore-ready-business-pending':
        common(request,state,h,c,g,p,state['restoreProject']); runtime(request,h,c,'candidate',state['candidate'],running=False)
        need(sorted(i['Id'] for i in h.writers(c))==state['sourceStoppedIds'])
        root=ROOT/'restore'/state['restoreProject']; raw(root/'recovery-ready.json',state['restoreReadySha256'])
        raw(root/'app.json',state['restoreConfigSha256'],uid=1001)
        r.validate_restored_containers([i for i in restore_items(c) if i['Config']['Labels'].get('com.docker.compose.project')==state['restoreProject']],state['candidate'])
    else:
        need(state['phase'] in ('recovery-accepted-source-healthy','schedule-installed','health-measured','both-measured','recurring-selected','complete-timers-active-enabled'))
        schedule_facts(request,state,h,c,g,p)
    return result_summary(request,state)|{'mode':'ui-release-observed-current','observedPhase':state['phase'],'serverMutation':False,'units':{u:manager(c,u) for u in UNITS}}


def result_summary(request,state):
    result={'mode':state['phase'],'operationId':request['operationId'],'sourceCommit':request['candidate']['sourceCommit'],
        'journalPath':str(evidence_root(request)/'journal.json'),'journalSha256':sha(raw(evidence_root(request)/'journal.json')),
        'candidate':state.get('candidate'),'candidateProfileSha256':state.get('candidateProfileSha256'),
        'timersResumed':state['phase']=='complete-timers-active-enabled','automaticRetry':False}
    for key in ('approvalSha256','measurements','releaseAcceptanceSha256','nativeEvidence','restoreEvidence'):
        if key in state: result[key]=state[key]
    if 'restoreProject' in state:
        result['restore']={'project':state['restoreProject'],'readySha256':state['restoreReadySha256'],
            'startSha256':state['restoreStartSha256'],'appConfigSha256':state['restoreConfigSha256'],
            'backup':state['recoveryBackup'],'origin':'http://localhost:3101','workerStarted':False}
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    actions=('plan','observe','prepare','apply','accept-native','recovery-start','recovery-finish',
        'schedule-install','measure-health','measure-backup','schedule-promote','schedule-enable')
    parser.add_argument('action',choices=actions,nargs='?',default='plan')
    for key in ('request','request-sha256','self-sha256','expected-state-sha256'): parser.add_argument('--'+key)
    parser.add_argument('--apply',action='store_true'); args=parser.parse_args()
    if args.action=='plan' or args.action!='observe' and not args.apply: return {'mode':'unexecuted-ui-release-plan','serverMutation':False}
    request,ctx=load(args); h,c,backup,health,g,p,r=ctx
    if args.action=='observe':
        if args.expected_state_sha256 is not None:
            return observe_current(request,state_for(request,args.expected_state_sha256),*ctx)
        baseline,units,profile,deployed=inspect(request,h,c,g,p)
        return {'mode':'ui-release-observed','baselineSha256':sha(encode(baseline)),'baseline':baseline,'units':units,'serverMutation':False}
    need(request['approved'] is True)
    if args.action=='prepare': state=prepare(request,args,*ctx)
    else:
        phases={'apply':'candidate-loaded-previous-runtime-preserved','accept-native':'image-ready-native-pending','recovery-start':'native-accepted','recovery-finish':'restore-ready-business-pending',
            'schedule-install':'recovery-accepted-source-healthy','measure-health':'schedule-installed','measure-backup':'health-measured','schedule-promote':'both-measured','schedule-enable':'recurring-selected'}
        state=state_for(request,args.expected_state_sha256,phases[args.action])
        try:
            if args.action in ('apply','accept-native','recovery-start','recovery-finish'):
                state={'apply':apply_image,'accept-native':accept_native,'recovery-start':recovery_start,'recovery-finish':recovery_finish}[args.action](request,state,*ctx)
            else: state=schedule_phase(request,state,args,*ctx)
        except Exception:
            state['failedAfterPhase']=state['phase']; save(h,state,'failed-preserved'); raise
    return result_summary(request,state)


if __name__=='__main__':
    try: print(json.dumps(main()))
    except Exception as error:
        import traceback
        frames=[{'function':x.name,'line':x.lineno} for x in traceback.extract_tb(error.__traceback__)]
        print(json.dumps({'mode':'ui-release-gated-or-failed','failureType':type(error).__name__,'frames':frames[-4:],'automaticRetry':False,'automaticRollback':False}))
        raise SystemExit(1) from None
