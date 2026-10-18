#!/usr/bin/env python3
"""New source-bound callback around immutable Ops68; no mutable HEAD dependency.

This does not install/start/enable units. Default is an unexecuted plan.
Root separately reviews replacement drop-ins, measurements and timer activation.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import types
import subprocess
import stat

ROOT=Path('/srv/morphiume/staging/runtime')
CONFIG=Path('/etc/morphiume-staging-runtime')
DISPATCH=CONFIG/'schedule-dispatch.lock'
LOCK_BYTES=b'Morphiume E4 scheduled dispatch lock v1\n'
BOOTSTRAP='b00f191cbbd28c0d96e4a24125cfd339af8f0897c3fdfaf9e492ff264c3b98b0'
HASH=re.compile('[a-f0-9]{64}')


def need(value):
    if not value: raise ValueError('private_preview_schedule_guard')


def sha(value): return hashlib.sha256(value).hexdigest()


def path_text(path):
    value=Path(path).as_posix(); need(re.fullmatch('/[A-Za-z0-9_./-]+',value) and '..' not in Path(value).parts)
    return value


def command(args,action,name):
    need(action in ('health','backup') and name in ('%n','morphiume-runtime-'+action+'.service'))
    for value in (args.self_sha256,args.control_sha256,args.request_sha256,args.approval_sha256): need(isinstance(value,str) and HASH.fullmatch(value))
    path=path_text(args.script); request=path_text(args.request)
    return ['/usr/bin/python3','-I','-B','-X','pycache_prefix='+path_text(Path(path).parent/'unused-bytecode-cache'),
        path,action,'--request',request,'--request-sha256',args.request_sha256,'--self-sha256',args.self_sha256,
        '--control-sha256',args.control_sha256,'--approval-sha256',args.approval_sha256,'--unit',name,'--execute']


def dropin(args,action):
    prefix=path_text(Path(args.script).parent/'unused-bytecode-cache')
    budget='CPUQuota=100%\nMemoryMax=256M\nTimeoutStartSec=50s\nTimeoutStopSec=5s\n' if action=='health' else ''
    return '[Service]\nEnvironmentFile=\nEnvironment=PYTHONDONTWRITEBYTECODE=1\nExecStartPre=\nExecStartPre=/usr/bin/test ! -e '+prefix+'\nExecStartPre=/usr/bin/test ! -L '+prefix+'\nExecStart=\nExecStart='+ ' '.join(command(args,action,'%n'))+'\nCPUAccounting=yes\nMemoryAccounting=yes\n'+budget


def load(args):
    need(os.name=='posix' and os.getuid()==0)
    for value in (args.self_sha256,args.control_sha256,args.request_sha256,args.approval_sha256): need(isinstance(value,str) and HASH.fullmatch(value))
    # The external reviewed self hash is checked before any companion executes.
    own=Path(__file__); need(own.is_absolute() and own.resolve()==own and not own.is_symlink())
    info=own.lstat(); need(info.st_uid==info.st_gid==0 and info.st_mode&0o777==0o644 and info.st_nlink==1)
    need(sha(own.read_bytes())==args.self_sha256)
    parent=own.parent; need(parent.name==args.self_sha256 and parent.parent.name=='tools')
    control_path=parent.parent/args.control_sha256/'private-preview-control.py'
    need(control_path.resolve()==control_path and not any(p.is_symlink() for p in (control_path,*control_path.parents)))
    info=control_path.lstat(); need(info.st_uid==info.st_gid==0 and info.st_mode&0o777==0o644 and info.st_nlink==1)
    body=control_path.read_bytes(); need(sha(body)==args.control_sha256)
    control=types.ModuleType('private_preview_control'); control.__file__=str(control_path)
    sys.dont_write_bytecode=True
    exec(compile(body,str(control_path),'exec'),control.__dict__)
    control.metadata(control_path.parent,mode=0o700,directory=True)
    control.protected_code_parent(control_path.parent)
    request,control_parent=control.load_request(types.SimpleNamespace(self_sha256=args.control_sha256,request=args.request,request_sha256=args.request_sha256))
    expected=ROOT/'releases'/request['candidate']['sourceCommit']/'tools'/args.self_sha256/'private-preview-schedule.py'
    need(own==expected); control.metadata(parent,mode=0o700,directory=True)
    control.protected_code_parent(parent)
    need(not (parent/'unused-bytecode-cache').exists() and not (parent/'unused-bytecode-cache').is_symlink())
    # Same verified code/Engine/profile checks; callbacks never require working HEAD.
    c,backup,health,g,preservation,_=control.import_frozen(request,control_parent,verify_archives=False)
    bootstrap_path=ROOT/'releases'/control.PREVIOUS['sourceCommit']/'tools'/BOOTSTRAP/'redesign-scheduled-bootstrap.py'
    bootstrap_raw=control.raw(bootstrap_path,BOOTSTRAP,mode=0o644)
    b=types.ModuleType('previous_verified_manager_observer'); b.__file__=str(bootstrap_path)
    exec(compile(bootstrap_raw,str(bootstrap_path),'exec'),b.__dict__)
    return control,request,c,backup,health,b


def validate_approval(value,request,args):
    keys=set(request['candidate'])|{'formatVersion','mode','scope','sharedDatabaseWindowReleased','accessProfileSha256',
        'requestSha256','controlSha256','scheduleSha256','nativeEvidenceSha256','restoreEvidenceSha256','capabilitySha256',
        'dispatchLock','serviceMeasurementSha256'}
    need(type(value) is dict and set(value)==keys and type(value['formatVersion']) is int and value['formatVersion']==1)
    need(value['mode']=='private-preview-scheduled-v1' and value['scope'] in ('one-time-service-measurement','recurring-timers') and value['sharedDatabaseWindowReleased'] is True)
    need(all(value[k]==v for k,v in request['candidate'].items()))
    for key,expected in {'accessProfileSha256':request['candidateProfileSha256'],'requestSha256':args.request_sha256,
        'controlSha256':args.control_sha256,'scheduleSha256':args.self_sha256,'nativeEvidenceSha256':request['nativeEvidence']['sha256'],
        'restoreEvidenceSha256':request['restoreEvidence']['sha256'],'capabilitySha256':request['capabilitySha256']}.items():
        need(isinstance(expected,str) and HASH.fullmatch(expected) and value[key]==expected)
    lock=value['dispatchLock']; need(type(lock) is dict and set(lock)=={'path','sha256','device','inode','filesystem'})
    need(lock['path']==DISPATCH.as_posix() and lock['sha256']==sha(LOCK_BYTES) and lock['filesystem']=='ext4')
    need(all(type(lock[key]) is int and lock[key]>0 for key in ('device','inode')))
    measurement=value['serviceMeasurementSha256']; need(type(measurement) is dict and set(measurement)=={'health','backup'})
    need(all(v is None for v in measurement.values()) if value['scope']=='one-time-service-measurement' else all(isinstance(v,str) and HASH.fullmatch(v) for v in measurement.values()))


def records(h,request,c,args):
    approval=h.parse(h.raw(CONFIG/'schedule-approved.json',args.approval_sha256)); validate_approval(approval,request,args)
    profile=c.active_profile(required=True); c.match_mapping(profile,request['candidate'])
    need(c.canonical_hash(profile)==request['candidateProfileSha256'])
    deployed=h.parse(h.raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,request['candidate'])
    need(deployed.get('accessProfileSha256')==request['candidateProfileSha256'] and deployed.get('privatePreviewAcceptance')=='accepted')
    c.load_configs(); cap=h.capability(request)
    need(deployed.get('privatePreviewCapabilitySha256')==cap['sha256'])
    native=h.parse(h.raw(request['nativeEvidence']['path'],request['nativeEvidence']['sha256']))
    h.validate_native(native,request,cap['sha256'])
    need(deployed.get('privatePreviewNativeEvidenceSha256')==request['nativeEvidence']['sha256'])
    restored=h.parse(h.raw(request['restoreEvidence']['path'],request['restoreEvidence']['sha256']))
    c.match_mapping(restored,request['candidate'])
    need(restored.get('mode')=='native-business-restore-accepted' and restored.get('accessProfileSha256')==request['candidateProfileSha256'])
    need(restored.get('origin')=='http://localhost:3101' and restored.get('workerStarted') is False)
    need(restored.get('reviewCapabilityIgnored') is True)
    need(restored.get('restoreProject')==Path(request['restoreEvidence']['path']).parent.name)
    need(type(restored.get('checks')) is dict and set(restored['checks'])==h.CHECKS and all(v is True for v in restored['checks'].values()))
    need(restored.get('commandExitCode')==0 and type(restored.get('commandExitCode')) is int)
    need(isinstance(restored.get('acceptedUtc'),str) and isinstance(restored.get('rawResultSha256'),str) and HASH.fullmatch(restored['rawResultSha256']))
    for key in ('observedRtoSeconds','observedRecoveryPointGapSeconds'):
        import math
        need(type(restored.get(key)) in (int,float) and math.isfinite(restored[key]) and restored[key]>=0)
    import datetime
    restored_utc=datetime.datetime.fromisoformat(restored['acceptedUtc'].replace('Z','+00:00'))
    need(restored_utc.tzinfo is not None and restored_utc.utcoffset()==datetime.timedelta(0))
    need(datetime.datetime.fromisoformat(native['acceptedUtc'].replace('Z','+00:00'))<=restored_utc<=datetime.datetime.now(datetime.timezone.utc))
    state=h.parse(h.raw(h.STATE))
    need(state['operationId']==request['operationId'] and state['candidate']==request['candidate'] and state['candidateProfileSha256']==request['candidateProfileSha256'])
    need(state['phase']=='native-accepted-recovery-schedule-pending' and state['nativeEvidence']==request['nativeEvidence'] and state['capability']['sha256']==cap['sha256'])
    need(state['evidenceRoot']==str(ROOT/'metrics'/('private-preview-transition-'+request['operationId'])))
    h.need(h.raw(h.SITE,mode=0o644)==h.raw(Path(state['evidenceRoot'])/'new-site.conf'))
    return approval,deployed


def effective(h,b,c,args,action,invocation,peer=False):
    unit='morphiume-runtime-'+action+'.service'
    value=b.read_manager_properties(c,unit)
    if peer:
        need(value['ActiveState'] in ('inactive','activating','active','deactivating','failed'))
        invocation=value['InvocationID']; need(invocation=='' or re.fullmatch('[a-f0-9]{32}',invocation))
    expected={'Id':unit,'Names':unit,'LoadState':'loaded','FragmentPath':'/etc/systemd/system/'+unit,
        'DropInPaths':'/etc/systemd/system/'+unit+'.d/20-private-preview-verified.conf',
        'Type':'oneshot','User':'root','UMask':'0077','Restart':'no','EnvironmentFiles':'','InvocationID':invocation,
        'WorkingDirectory':str(CONFIG),'NoNewPrivileges':'yes','PrivateTmp':'yes','ProtectHome':'yes','ProtectSystem':'strict',
        'CPUAccounting':'yes','MemoryAccounting':'yes','TimeoutStartUSec':'50s' if action=='health' else '20min',
        'TimeoutStopUSec':'5s' if action=='health' else '1min 30s','MemoryMax':str((256 if action=='health' else 512)*1024**2),
        'CPUQuotaPerSecUSec':'1s' if action=='health' else '500ms',
        'ReadWritePaths':'' if action=='health' else str(ROOT/'backups')+' /srv/morphiume/staging/deploy.lock'}
    need(all(value.get(key)==v for key,v in expected.items()))
    if not peer: need(value['ActiveState'] in ('activating','active'))
    entry=value['ExecStart']; need(entry.startswith('{ ') and entry.endswith(' }') and entry.count('argv[]=')==1)
    fields={}
    for item in entry[2:-2].split(' ; '):
        need('=' in item); key,text=item.split('=',1); need(key not in fields); fields[key]=text
    need(set(fields)<={'path','argv[]','ignore_errors','start_time','stop_time','pid','code','status'})
    need(fields.get('path')=='/usr/bin/python3' and fields.get('argv[]')==' '.join(command(args,action,unit)) and fields.get('ignore_errors')=='no')
    need(h.raw(expected['DropInPaths'],mode=0o644).decode()==dropin(args,action))
    h.metadata(Path(expected['DropInPaths']).parent,mode=0o700,directory=True)
    for name in ('service','timer'):
        path=Path('/etc/systemd/system')/('morphiume-runtime-'+action+'.'+name)
        need(h.raw(path,mode=0o644)==(c.OPS_ROOT/'runtime/systemd'/path.name).read_bytes())


@contextmanager
def dispatch_lock(h,approval):
    import errno
    import fcntl
    expected=approval['dispatchLock']; h.metadata(DISPATCH)
    fd=os.open(DISPATCH,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd); need(stat.S_ISREG(info.st_mode) and info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==0o600)
        need((info.st_dev,info.st_ino)==(expected['device'],expected['inode']) and info.st_nlink==1 and os.read(fd,len(LOCK_BYTES)+1)==LOCK_BYTES)
        acquired=False
        try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB); acquired=True
        except OSError as error: need(error.errno in (errno.EAGAIN,errno.EWOULDBLOCK))
        now=DISPATCH.lstat(); need((now.st_dev,now.st_ino)==(info.st_dev,info.st_ino) and now.st_nlink==1)
        yield acquired
    finally: os.close(fd)


def execute(h,request,c,backup,health,b,args):
    invocation=os.environ.get('INVOCATION_ID',''); need(re.fullmatch('[a-f0-9]{32}',invocation))
    need(args.unit=='morphiume-runtime-'+args.action+'.service')
    os.environ.clear(); os.environ.update(PATH='/usr/sbin:/usr/bin:/sbin:/bin',LANG='C.UTF-8',INVOCATION_ID=invocation)
    c.assert_boundaries(); approval,deployed=records(h,request,c,args)
    for action in ('health','backup'): effective(h,b,c,args,action,invocation,peer=action!=args.action)
    with dispatch_lock(h,approval) as acquired:
        if not acquired: return {'mode':'skipped-active-runtime-service','action':args.action,'actionCount':0,'sourceVerifiedBeforeImports':True}
        if args.action=='health':
            # snapshot verifies actual archived artifact/Engine mapping once; no HEAD dependency.
            result=health.snapshot('running',expect_backups=True)
            need(result.get('runtimeImageId')==request['candidate']['runtimeImageId'])
        else:
            with c.lock():
                c.db_container(); c.load_configs(); c.validate_app_containers(h.writers(c),request['candidate'])
                command_args=c.compose(request['candidate']['runtimeImageId'])
                try:
                    c.run(command_args+['stop','--timeout','30','app','worker'],timeout=75)
                    result=h.backup_verified(c,backup,request['candidate'])|{'mode':'encrypted-backup-completed','offsiteEstablished':False,'restoreAcceptance':'pending'}
                finally:
                    # Same frozen scheduling behavior: resume the exact writer pair after a backup attempt.
                    c.run(command_args+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app','worker'],timeout=210)
                c.validate_app_containers(h.writers(c),request['candidate']); h.ready()
                result|={'runtimeWritersResumed':True}
        return result|{'actionCount':1,'sourceVerifiedBeforeImports':True,'sourceCommit':request['candidate']['sourceCommit'],
            'accessProfileSha256':request['candidateProfileSha256'],'approvalSha256':args.approval_sha256,'invocationId':invocation}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('plan','render','health','backup'),nargs='?',default='plan')
    for name in ('request','request-sha256','self-sha256','control-sha256','approval-sha256','unit'): parser.add_argument('--'+name)
    parser.add_argument('--execute',action='store_true'); args=parser.parse_args(); args.script=Path(__file__)
    if args.action=='plan' or args.action in ('health','backup') and not args.execute:
        return {'mode':'unexecuted-private-preview-schedule-plan','serviceStarts':0,'timerMutation':False}
    h,request,c,backup,health,b=load(args)
    if args.action=='render':
        need(not args.execute)
        return {'mode':'rendered-only','healthDropin':dropin(args,'health'),'backupDropin':dropin(args,'backup'),'serviceStarts':0,'timerMutation':False}
    return execute(h,request,c,backup,health,b,args)


if __name__=='__main__':
    try:
        result=main(); print(json.dumps(result)); raise SystemExit({'healthy':0,'warning':1,'critical':2}.get(result.get('status'),0))
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):
        print(json.dumps({'mode':'private-preview-schedule-gated-or-failed','automaticRetry':False}))
        raise SystemExit(2) from None
