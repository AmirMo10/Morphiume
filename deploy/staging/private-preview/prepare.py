#!/usr/bin/env python3
"""Verify incoming CI artifacts, pause old jobs and load one new runtime image.

Default is unexecuted. Inspect is read-only, including standalone archive checks.
Apply starts no container and changes no active profile/config/deploy environment.
No image build/pull, migration/seed, service kill, automatic retry or rollback.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import time
import types

ROOT=Path('/srv/morphiume/staging/runtime')
CONFIG=Path('/etc/morphiume-staging-runtime')
BEFORE_SITE='bb37396699c5774a5a43e7e2858cf4de0f22c99f46e7f516cb99e1dd3b4eed1c'
HASH=re.compile('[a-f0-9]{64}')
UUID=re.compile('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
FILES=('accepted-image.tar.gz','accepted-image.sha256','image-identity.json')
MAX_ARCHIVE=1024**3


def need(value):
    if not value: raise ValueError('private_preview_prepare_guard')


def sha(raw): return hashlib.sha256(raw).hexdigest()


def parse(raw):
    def pairs(values):
        result={}
        for key,value in values: need(key not in result); result[key]=value
        return result
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:need(False))


def root_file(path,mode=0o600,maximum=1024**2):
    path=Path(path); need(path.is_absolute() and path.resolve()==path and not any(p.is_symlink() for p in (path,*path.parents)))
    info=path.lstat(); need(stat.S_ISREG(info.st_mode) and info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==mode and info.st_nlink==1 and 0<info.st_size<=maximum)
    return path


def validate_request(value):
    keys={'formatVersion','mode','operationId','sourceCommit','controlSha256','publicAcceptedSha256',
        'expectedProtectedStateSha256','oldInventory','fourthAcceptance','sharedDatabaseWindowReleased'}
    need(type(value) is dict and set(value)==keys and type(value['formatVersion']) is int and value['formatVersion']==1)
    need(value['mode']=='private-preview-prepare-candidate' and value['sharedDatabaseWindowReleased'] is True)
    need(isinstance(value['operationId'],str) and UUID.fullmatch(value['operationId']))
    need(isinstance(value['sourceCommit'],str) and re.fullmatch('[a-f0-9]{40}',value['sourceCommit']))
    need(value['sourceCommit']!='7feb4fe8e8254e917c53f9654b315ee7ef3fada1')
    for key in ('controlSha256','publicAcceptedSha256'): need(isinstance(value[key],str) and HASH.fullmatch(value[key]))
    need(value['expectedProtectedStateSha256'] is None or isinstance(value['expectedProtectedStateSha256'],str) and HASH.fullmatch(value['expectedProtectedStateSha256']))
    for key in ('oldInventory','fourthAcceptance'):
        ref=value[key]; need(type(ref) is dict and set(ref)=={'path','sha256'} and isinstance(ref['sha256'],str) and HASH.fullmatch(ref['sha256']))
        path=PurePosixPath(ref['path']); need(path.is_absolute() and path.is_relative_to(PurePosixPath(ROOT.as_posix())) and '..' not in path.parts)
    return value


def validate_ci(value,source):
    keys={'formatVersion','mode','repository','sourceCommit','runId','runAttempt','verifyJob','imageJob','artifact','observedUtc'}
    need(type(value) is dict and set(value)==keys and type(value['formatVersion']) is int and value['formatVersion']==1)
    need(value['mode']=='root-observed-accepted-github-ci' and value['repository']=='AmirMo10/Morphiume' and value['sourceCommit']==source)
    need(isinstance(value['runId'],str) and re.fullmatch('[1-9][0-9]{0,19}',value['runId']))
    need(type(value['runAttempt']) is int and 1<=value['runAttempt']<=100)
    for name in ('verifyJob','imageJob'):
        job=value[name]; need(type(job) is dict and set(job)=={'id','conclusion'} and job['conclusion']=='success')
        need(isinstance(job['id'],str) and re.fullmatch('[1-9][0-9]{0,19}',job['id']))
    need(value['verifyJob']['id']!=value['imageJob']['id'])
    artifact=value['artifact']; need(type(artifact) is dict and set(artifact)=={'id','zipSha256','testedPlatformConfig','candidateManifestDigest','archiveSha256'})
    need(isinstance(artifact['id'],str) and re.fullmatch('[1-9][0-9]{0,19}',artifact['id']))
    for key in ('zipSha256','archiveSha256'): need(isinstance(artifact[key],str) and HASH.fullmatch(artifact[key]))
    for key in ('testedPlatformConfig','candidateManifestDigest'): need(isinstance(artifact[key],str) and re.fullmatch('sha256:[a-f0-9]{64}',artifact[key]))
    observed=datetime.datetime.fromisoformat(value['observedUtc'].replace('Z','+00:00'))
    need(observed.tzinfo is not None and observed.utcoffset()==datetime.timedelta(0))
    need(0<=(datetime.datetime.now(datetime.timezone.utc)-observed).total_seconds()<=3600)
    return value


def load(args):
    need(os.name=='posix' and os.getuid()==0 and HASH.fullmatch(args.self_sha256 or '') and HASH.fullmatch(args.request_sha256 or ''))
    own=root_file(Path(__file__),0o644); need(sha(own.read_bytes())==args.self_sha256)
    parent=CONFIG/'private-preview-tools'/args.self_sha256; need(own==parent/'prepare.py')
    request=parse(root_file(args.request).read_bytes()); need(sha(Path(args.request).read_bytes())==args.request_sha256); validate_request(request)
    control_path=root_file(parent/'private-preview-control.py',0o644)
    body=control_path.read_bytes(); need(sha(body)==request['controlSha256'])
    info=parent.lstat(); need(stat.S_ISDIR(info.st_mode) and info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==0o700)
    for path in parent.parents:
        info=path.lstat(); need(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not stat.S_IMODE(info.st_mode)&0o022)
    h=types.ModuleType('prepare_verified_control'); h.__file__=str(control_path)
    sys.dont_write_bytecode=True; exec(compile(body,str(control_path),'exec'),h.__dict__)
    need(request['oldInventory']['sha256']==h.OLD_INVENTORY and request['fourthAcceptance']['sha256']==h.FOURTH_ACCEPTANCE)
    need(Path(request['oldInventory']['path'])==ROOT/'preservation/c7d9bd5c-46b4-4709-bff6-9d0f5c0531f3/old-restore-inventory.json')
    legacy={}
    for name,digest in h.LEGACY.items():
        path=parent/name; raw=h.raw(path,digest,mode=0o644)
        module=types.ModuleType('prepare_'+name.replace('-','_')); module.__file__=str(path)
        exec(compile(raw,str(path),'exec'),module.__dict__); legacy[name]=module
    g=legacy['redesign-isolated-restore.py']; preservation=legacy['redesign-preserved-upgrade.py']
    preservation.validate_restore_storage_policy(g); preservation.validate_restore_acceptance_policy(g)
    # Explicitly use the already accepted previous bundle, not a candidate-shaped request.
    bundle=ROOT/'releases'/h.PREVIOUS['sourceCommit']/'ops-bundles'/h.OPS/'ops'
    g.verify_ops(bundle)
    sources={name:h.raw(bundle/name,mode=0o644).replace(b'\r\n',b'\n') for name in h.OPS_FILES}
    need(sha(json.dumps({n:sha(v) for n,v in sources.items()},sort_keys=True,separators=(',',':')).encode())==h.OPS)
    need('contract' not in sys.modules)
    c=types.ModuleType('contract'); c.__file__=str(bundle/'runtime/contract.py'); sys.modules['contract']=c
    exec(compile(sources['runtime/contract.py'],c.__file__,'exec'),c.__dict__); need(c.ops_digest()==h.OPS)
    verifier=types.ModuleType('prepare_archive_verifier'); verifier.__file__=str(bundle/'verify-release.py')
    exec(compile(sources['verify-release.py'],verifier.__file__,'exec'),verifier.__dict__)
    return request,h,c,g,preservation,verifier,legacy['remove-basic.py'],sources


def incoming(request,h,verifier):
    directory=ROOT/'incoming'/('private-preview-'+request['operationId'])
    h.metadata(directory,mode=0o700,directory=True)
    need({p.name for p in directory.iterdir()}==set(FILES)|{'public-accepted.json'})
    for name in FILES: root_file(directory/name,maximum=MAX_ARCHIVE if name=='accepted-image.tar.gz' else 1024**2)
    metadata=root_file(directory/'public-accepted.json').read_bytes(); need(sha(metadata)==request['publicAcceptedSha256'])
    ci=validate_ci(parse(metadata),request['sourceCommit']); a=ci['artifact']
    report=verifier.verify(directory/FILES[0],directory/FILES[2],request['sourceCommit'],a['testedPlatformConfig'],a['candidateManifestDigest'],a['archiveSha256'])
    need(report['archiveBytes']<=MAX_ARCHIVE)
    return directory,ci,report


def headroom(report):
    required=report['archiveBytes']+2*report['uncompressedLayerBytes']+1024**3
    free={}
    for path in (ROOT,Path('/var/lib/docker')):
        value=os.statvfs(path); free[str(path)]=value.f_bavail*value.f_frsize; need(free[str(path)]>=required)
    return {'requiredBytes':required,'availableBytes':free}


def protected_state(request,h,c,g,preservation,basic,sources,expected_head,timers_active=True):
    c.assert_boundaries(); c.db_container(); c.load_configs()
    need(c.run(['git','-C','/opt/morphiume','rev-parse','HEAD'])==expected_head and not c.run(['git','-C','/opt/morphiume','status','--porcelain']))
    remote=c.run(['git','-C','/opt/morphiume','remote','get-url','origin'])
    need(remote in ('https://github.com/AmirMo10/Morphiume.git','https://github.com/AmirMo10/Morphiume','git@github.com:AmirMo10/Morphiume.git'))
    profile=c.active_profile(required=True); c.match_mapping(profile,h.PREVIOUS); need(c.canonical_hash(profile)==h.PREVIOUS_PROFILE)
    deployed=h.parse(h.raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,h.PREVIOUS)
    need(deployed.get('accessProfileSha256')==h.PREVIOUS_PROFILE and deployed.get('nativeFixtureAcceptance')=='accepted')
    c.match_mapping(h.PREVIOUS,c.archived_image(h.PREVIOUS))
    need(h.raw(CONFIG/'deploy.env').decode()==c.compose_environment(h.PREVIOUS['runtimeImageId'],c.OPS_ROOT,profile))
    app=h.writers(c); c.validate_app_containers(app,h.PREVIOUS); h.ready()
    need(sha(h.raw(h.SITE,mode=0o644))==BEFORE_SITE)
    h.site_versions({'reviewed_change':basic.reviewed_change})
    need(not h.STATE.exists() and not h.CAPABILITY.parent.exists())
    for name in ('upgrading.json','deploy.candidate.env','deployed-release.json.new','active-profile.json.new'): need(not (CONFIG/name).exists())
    units={unit:h.manager(c,unit) for unit in h.UNITS}
    for unit,value in units.items():
        if unit.endswith('.timer'): need(value['ActiveState']==('active' if timers_active else 'inactive') and value['UnitFileState']=='enabled')
        else:
            need(value['ActiveState'] in (('inactive','active','activating') if timers_active else ('inactive',)))
            if value['ActiveState']=='inactive': need(value['Result']=='success' and value['ExecMainStatus']=='0')
        path=Path('/etc/systemd/system')/unit
        need(h.raw(path,mode=0o644)==sources['runtime/systemd/'+unit])
    baseline={'checkoutHead':expected_head,'units':units,'configs':h.config_files(),
        'deployment':{name:h.file_view(CONFIG/name) for name in ('deployed-release.json','active-profile.json','deploy.env','redesign-upgrade.json','schedule-approved.json','schedule-dispatch.lock')},
        'releaseLock':h.file_view(ROOT.parent/'deploy.lock'),'scheduleFiles':h.schedule_files(),
        'appWorker':sorted([g.container_view(i) for i in app],key=lambda i:i['service']),
        'fourPairs':h.four_pairs(c,g,request),'media':g.media_snapshot(c,None,ROOT/'media'),
        'existingAuth':h.existing_auth(c,preservation),'nginxSite':h.file_view(h.SITE,mode=0o644)}
    return baseline


def core(value): return {key:item for key,item in value.items() if key not in ('checkoutHead','units')}


def wait_inactive(h,c,before,deadline_seconds=75):
    deadline=time.monotonic()+deadline_seconds
    while True:
        now={u:h.manager(c,u) for u in h.UNITS}
        for unit,value in now.items():
            if unit.endswith('.timer'): need(value['ActiveState']=='inactive' and value['UnitFileState']==before[unit]['UnitFileState']=='enabled')
            else:
                need(value['ActiveState'] in ('inactive','active','activating','deactivating'))
                need(value['InvocationID']==before[unit]['InvocationID'])
                if value['ActiveState']=='inactive': need(value['Result']=='success' and value['ExecMainStatus']=='0')
        if all(v['ActiveState']=='inactive' for u,v in now.items() if u.endswith('.service')): return now
        need(time.monotonic()<deadline); time.sleep(1)


def copy_artifact(source,target,h):
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        os.fchmod(fd,0o600)
        with source.open('rb') as input,os.fdopen(fd,'wb',closefd=False) as output:
            shutil.copyfileobj(input,output,1024*1024); output.flush(); os.fsync(output.fileno())
    finally: os.close(fd)
    h.sync_directory(target.parent)
    with source.open('rb') as input,target.open('rb') as output: need(hashlib.file_digest(input,'sha256').digest()==hashlib.file_digest(output,'sha256').digest())


def child_then_locked_postcheck(c,child,postcheck):
    """The frozen loader owns its own release flock in its separate process."""
    result=child()
    with c.lock(): return postcheck(result)


def apply(request,h,c,g,preservation,verifier,basic,sources,args):
    incoming_dir,ci,report=incoming(request,h,verifier); disk=headroom(report)
    before=protected_state(request,h,c,g,preservation,basic,sources,h.PREVIOUS['sourceCommit'])
    need(request['expectedProtectedStateSha256'] is not None and sha(h.encode(before))==request['expectedProtectedStateSha256'])
    release=ROOT/'releases'/request['sourceCommit']; need(not release.exists() and not release.is_symlink())
    evidence=ROOT/'metrics'/('private-preview-prepare-'+request['operationId']); need(not evidence.exists())
    evidence.mkdir(mode=0o700); h.metadata(evidence,mode=0o700,directory=True)
    state={'mode':'private-preview-candidate-preparation','operationId':request['operationId'],'sourceCommit':request['sourceCommit'],
        'requestSha256':args.request_sha256,'publicAcceptedSha256':request['publicAcceptedSha256'],'controlSha256':request['controlSha256'],
        'prepareSha256':args.self_sha256,'stages':[],'automaticRetry':False,'automaticRollback':False,'applicationStarted':False,
        'profileSelected':False,'protectedStateSha256':request['expectedProtectedStateSha256']}
    def record(phase):
        state['phase']=phase; state['stages'].append({'phase':phase,'utc':h.utc()})
        h.write_new(evidence/(str(len(state['stages'])).zfill(2)+'-'+phase+'.json'),h.encode(state))
    h.write_new(evidence/'protected-before.json',h.encode(before)); h.write_new(evidence/'public-accepted.json',h.encode(ci))
    record('before-timer-pause')
    try:
        c.run(['systemctl','stop',*[u for u in h.UNITS if u.endswith('.timer')]],timeout=30)
        state['unitsAfterPause']=wait_inactive(h,c,before['units']); record('timers-paused-services-inactive')
        with c.lock():
            paused=protected_state(request,h,c,g,preservation,basic,sources,h.PREVIOUS['sourceCommit'],timers_active=False)
            need(core(paused)==core(before)); headroom(report)
            record('before-fetch-ff')
            c.run(['git','-C','/opt/morphiume','fetch','--no-tags','origin','main'],timeout=90)
            c.run(['git','-C','/opt/morphiume','merge-base','--is-ancestor',h.PREVIOUS['sourceCommit'],request['sourceCommit']])
            c.run(['git','-C','/opt/morphiume','merge','--ff-only',request['sourceCommit']],timeout=90)
            need(c.run(['git','-C','/opt/morphiume','rev-parse','HEAD'])==request['sourceCommit'] and not c.run(['git','-C','/opt/morphiume','status','--porcelain']))
            record('head-fast-forwarded-exact-candidate')
            release.mkdir(mode=0o700); h.metadata(release,mode=0o700,directory=True)
            for name in FILES: copy_artifact(incoming_dir/name,release/name,h)
            h.write_new(release/'private-preview-ci-accepted.json',h.encode(ci))
            bundle=c.preserve_ops_bundle(request['sourceCommit']); c.verify_ops_bundle(bundle,h.OPS)
            need(all(h.raw(bundle/name,mode=0o644).replace(b'\r\n',b'\n')==sources[name] for name in h.OPS_FILES))
            record('candidate-archive-ops-materialized')
        # Parent flock is released before the independent frozen loader acquires it.
        a=ci['artifact']; command=['/usr/bin/python3','-I','-B',str(bundle/'verify-release.py'),str(release/FILES[0]),str(release/FILES[2]),
            '--source',request['sourceCommit'],'--config-id',a['testedPlatformConfig'],'--manifest-digest',a['candidateManifestDigest'],
            '--archive-sha256',a['archiveSha256'],'--load','--namespace','runtime','--ops-sha256',h.OPS]
        def child():
            h.write_new(evidence/'loader-stdout.private',b''); h.write_new(evidence/'loader-stderr.private',b'')
            record('one-loader-child-dispatched')
            started=time.monotonic()
            with (evidence/'loader-stdout.private').open('wb') as stdout,(evidence/'loader-stderr.private').open('wb') as stderr:
                actual=subprocess.run(command,stdout=stdout,stderr=stderr,timeout=600,env=c.command_environment(command))
                stdout.flush(); stderr.flush(); os.fsync(stdout.fileno()); os.fsync(stderr.fileno())
            state['loaderChild']={'exitCode':actual.returncode,'durationSeconds':time.monotonic()-started,'invocationCount':1,
                'stdoutSha256':sha(h.raw(evidence/'loader-stdout.private')),'stderrSha256':sha(h.raw(evidence/'loader-stderr.private'))}
            record('loader-child-returned'); need(actual.returncode==0)
            return state['loaderChild']
        def postcheck(_actual_child):
            identity={'sourceCommit':request['sourceCommit'],'testedPlatformConfig':a['testedPlatformConfig'],
                'candidateManifestDigest':a['candidateManifestDigest'],'archiveSha256':a['archiveSha256'],'opsSha256':h.OPS}
            loaded=c.archived_image(identity)
            candidate={key:loaded[key] for key in h.PREVIOUS}
            proof=c.engine_record_path(request['sourceCommit'],h.OPS); proof_sha=sha(h.raw(proof))
            after=protected_state(request,h,c,g,preservation,basic,sources,request['sourceCommit'],timers_active=False)
            need(core(after)==core(before))
            h.write_new(evidence/'protected-after.json',h.encode(after))
            state|={'candidate':candidate,'engineRecordPath':str(proof),'engineRecordSha256':proof_sha,
                'allFourOldPairsPreserved':True,'configsOwnerAndProfileUnchanged':True,'runtimeAppWorkerSameHealthy':True}
            record('candidate-loaded-previous-runtime-preserved')
            return {'mode':state['phase'],'candidate':candidate,'engineRecordPath':str(proof),'engineRecordSha256':proof_sha,
                'evidenceRoot':str(evidence),'finalEvidenceSha256':sha(h.raw(evidence/(str(len(state['stages'])).zfill(2)+'-'+state['phase']+'.json'))),
                'loaderChild':state['loaderChild'],'timersPaused':True,'applicationStarted':False,'profileSelected':False,'allFourOldPairsPreserved':True}
        return child_then_locked_postcheck(c,child,postcheck)
    except Exception as error:
        state['failedAfterPhase']=state['phase']; state['failureType']=type(error).__name__; record('failed-preserved'); raise


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('action',choices=('plan','inspect','apply'),nargs='?',default='plan')
    parser.add_argument('--request'); parser.add_argument('--request-sha256'); parser.add_argument('--self-sha256'); parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    if args.action=='plan' or args.action=='apply' and not args.apply: return {'mode':'unexecuted-private-preview-prepare-plan','serverMutation':False}
    need(not args.apply if args.action=='inspect' else args.apply)
    request,h,c,g,preservation,verifier,basic,sources=load(args)
    if args.action=='inspect':
        _,ci,report=incoming(request,h,verifier); disk=headroom(report)
        baseline=protected_state(request,h,c,g,preservation,basic,sources,h.PREVIOUS['sourceCommit'])
        return {'mode':'read-only-private-preview-prepare-inspection','protectedState':baseline,'protectedStateSha256':sha(h.encode(baseline)),
            'headroom':disk,'archiveVerified':True,'runId':ci['runId'],'applicationStarted':False,'serverMutation':False}
    return apply(request,h,c,g,preservation,verifier,basic,sources,args)


if __name__=='__main__':
    try: print(json.dumps(main()))
    except Exception as error:
        frames=[]; cursor=error.__traceback__
        while cursor is not None:
            frames.append({'file':Path(cursor.tb_frame.f_code.co_filename).name,'function':cursor.tb_frame.f_code.co_name,'line':cursor.tb_lineno}); cursor=cursor.tb_next
        print(json.dumps({'mode':'private-preview-prepare-gated-or-failed','failureType':type(error).__name__,'failureFrames':frames[-3:],
            'privateStatePreserved':True,'automaticRetry':False,'automaticRollback':False}))
        raise SystemExit(1) from None
