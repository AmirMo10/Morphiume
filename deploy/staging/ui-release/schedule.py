#!/usr/bin/env python3
"""Source-bound UI-release health/backup callback. Default performs no I/O."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import types

CONFIG=Path('/etc/morphiume-staging-runtime')
HASH=re.compile('[a-f0-9]{64}')


def libraries(control=None):
    # Control bytes have already been externally pinned before this function runs.
    c=control or sys.modules['ui_release_control']
    s=c.library('private-preview-schedule.py',c.LIB_SCHEDULE)
    installer=c.library('private-preview-scheduler-installer.py',c.LIB_INSTALLER)
    b=c.module_from(c.ROOT/'releases'/c.BOOT_SOURCE/'tools'/c.BOOTSTRAP/'redesign-scheduled-bootstrap.py',c.BOOTSTRAP,'ui_release_verified_manager_observer')
    return s,b,installer


def validate_approval(value,request,state,args,control=None):
    c=control or sys.modules['ui_release_control']; need=c.need
    keys={'formatVersion','mode','scope','candidate','accessProfileSha256','capabilitySha256','nativeEvidence','restoreEvidence',
        'acceptanceSha256','requestSha256','controlSha256','callbackSha256','dispatchLock','serviceMeasurementSha256'}
    need(type(value) is dict and set(value)==keys and type(value['formatVersion']) is int and value['formatVersion']==1)
    need(value['mode']=='ui-release-scheduled-v1' and value['scope'] in ('one-time-service-measurement','recurring-timers'))
    need(value['candidate']==state['candidate'] and value['accessProfileSha256']==state['candidateProfileSha256'])
    need(value['capabilitySha256']==request['capabilitySha256'] and value['nativeEvidence']==state['nativeEvidence'] and value['restoreEvidence']==state['restoreEvidence'])
    need(value['requestSha256']==args.request_sha256 and value['controlSha256']==args.control_sha256 and value['callbackSha256']==args.self_sha256)
    need(HASH.fullmatch(value['acceptanceSha256']))
    lock=value['dispatchLock']; need(type(lock) is dict and set(lock)=={'path','sha256','device','inode','filesystem'})
    need(lock['path']==str(CONFIG/'schedule-dispatch.lock') and lock['filesystem']=='ext4' and lock['sha256']==c.sha(b'Morphiume E4 scheduled dispatch lock v1\n'))
    need(all(type(lock[k]) is int and lock[k]>0 for k in ('device','inode')))
    measurements=value['serviceMeasurementSha256']; need(type(measurements) is dict and set(measurements)=={'health','backup'})
    need(all(v is None for v in measurements.values()) if value['scope']=='one-time-service-measurement' else all(isinstance(v,str) and HASH.fullmatch(v) for v in measurements.values()))
    if value['scope']=='recurring-timers': need(measurements==state.get('measurements'))


def records(control,request,state,args,h,c,g):
    approval=control.parse(control.raw(CONFIG/'schedule-approved.json',args.approval_sha256)); validate_approval(approval,request,state,args)
    acceptance=control.reference({'path':str(control.evidence_root(request)/'release-accepted.json'),'sha256':approval['acceptanceSha256']})
    control.need(acceptance['mode']=='ui-release-accepted' and acceptance['candidate']==state['candidate'] and acceptance['operationId']==request['operationId'])
    control.need(acceptance['nativeEvidence']==state['nativeEvidence'] and acceptance['restoreEvidence']==state['restoreEvidence'])
    control.need(acceptance['accessProfileSha256']==state['candidateProfileSha256'] and acceptance['capabilitySha256']==request['capabilitySha256'])
    profile=c.active_profile(required=True); c.match_mapping(profile,state['candidate'])
    control.need(c.canonical_hash(profile)==state['candidateProfileSha256'])
    deployed=control.parse(control.raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,state['candidate'])
    control.need(deployed.get('accessProfileSha256')==state['candidateProfileSha256'])
    control.need(deployed.get('privatePreviewAcceptance')=='accepted' and deployed.get('privatePreviewNativeEvidenceSha256')==state['nativeEvidence']['sha256'])
    h.validate_native(control.reference(state['nativeEvidence']),{'candidate':state['candidate'],'candidateProfileSha256':state['candidateProfileSha256']},request['capabilitySha256'])
    restored=control.reference(state['restoreEvidence']); c.match_mapping(restored,state['candidate'])
    control.need(restored.get('mode')=='native-business-restore-accepted' and restored.get('accessProfileSha256')==state['candidateProfileSha256'] and restored.get('reviewCapabilityIgnored') is True)
    control.need(restored.get('workerStarted') is False and restored.get('origin')=='http://localhost:3101' and type(restored.get('commandExitCode')) is int and restored['commandExitCode']==0)
    control.need(set(restored['checks'])==h.CHECKS and all(v is True for v in restored['checks'].values()))
    control.need(h.config_files()==acceptance['protected']['configs'] and h.capability({'capabilitySha256':request['capabilitySha256']})==acceptance['protected']['capability'])
    control.need(h.file_view(control.SITE,mode=0o644)==acceptance['protected']['site'])
    actual=control.pair_snapshot(c,request['preservedPairCount']+1,include_storage=False,guard=g)
    control.need({k:v['containers'] for k,v in actual.items()}=={k:v['containers'] for k,v in acceptance['protected']['pairs'].items()})
    control.need(h.file_view(control.ROOT.parent/'deploy.lock')==acceptance['protected']['releaseLock'])
    return approval


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('plan','health','backup'),nargs='?',default='plan')
    for name in ('request','request-sha256','self-sha256','control-sha256','approval-sha256','unit'): parser.add_argument('--'+name)
    parser.add_argument('--execute',action='store_true'); args=parser.parse_args(); args.script=Path(__file__)
    if args.action=='plan' or not args.execute: return {'mode':'unexecuted-ui-release-callback-plan','serverMutation':False}
    for key in ('self_sha256','control_sha256','request_sha256','approval_sha256'):
        if not isinstance(getattr(args,key),str) or not HASH.fullmatch(getattr(args,key)): raise ValueError('callback_hash')
    own=CONFIG/'ui-release-tools'/args.self_sha256/'schedule.py'
    if own!=Path(__file__) or own.is_symlink(): raise ValueError('callback_path')
    # Standard library checks precede executing the externally pinned control companion.
    import hashlib
    import stat
    def verified(path,digest):
        if path.resolve()!=path or any(p.is_symlink() for p in (path,*path.parents)): raise ValueError('callback_symlink')
        for parent in path.parents:
            info=parent.stat()
            if info.st_uid!=0 or stat.S_IMODE(info.st_mode)&0o022: raise ValueError('callback_ancestor')
        info=path.lstat()
        if info.st_uid!=info.st_gid or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o644 or info.st_nlink!=1: raise ValueError('callback_metadata')
        parent=path.parent.stat()
        if parent.st_uid!=parent.st_gid or parent.st_uid!=0 or stat.S_IMODE(parent.st_mode)!=0o700: raise ValueError('callback_parent')
        body=path.read_bytes()
        if hashlib.sha256(body).hexdigest()!=digest: raise ValueError('callback_bytes')
        return body
    verified(own,args.self_sha256)
    prefix=own.parent/'unused-bytecode-cache'
    if prefix.exists() or prefix.is_symlink(): raise ValueError('callback_bytecode_cache')
    sys.dont_write_bytecode=True; sys.pycache_prefix=str(prefix)
    control_path=CONFIG/'ui-release-tools'/args.control_sha256/'control.py'
    body=verified(control_path,args.control_sha256)
    control=types.ModuleType('ui_release_control'); control.__file__=str(control_path); sys.modules['ui_release_control']=control
    exec(compile(body,str(control_path),'exec'),control.__dict__)
    control_args=types.SimpleNamespace(action='callback',request=args.request,request_sha256=args.request_sha256,self_sha256=args.control_sha256)
    request,ctx=control.load(control_args); h,c,backup,health,g,p,r=ctx
    state=control.parse(control.raw(control.evidence_root(request)/'journal.json'))
    control.need(state['requestCore']==control.request_core(request) and state['operationId']==request['operationId'])
    control.need(state['phase'] in ('schedule-install-dispatching','schedule-installed','health-dispatching','health-measured','backup-dispatching','both-measured','schedule-promote-dispatching','recurring-selected','timer-start-dispatching','complete-timers-active-enabled'))
    s,b,installer=libraries(); approval=records(control,request,state,args,h,c,g)
    invocation=os.environ.get('INVOCATION_ID',''); control.need(re.fullmatch('[a-f0-9]{32}',invocation) and args.unit=='morphiume-runtime-'+args.action+'.service')
    os.environ.clear(); os.environ.update(PATH='/usr/sbin:/usr/bin:/sbin:/bin',LANG='C.UTF-8',INVOCATION_ID=invocation)
    c.assert_boundaries()
    for action in ('health','backup'): s.effective(h,b,c,args,action,invocation,peer=action!=args.action)
    with s.dispatch_lock(h,approval) as acquired:
        if not acquired: return {'mode':'skipped-active-runtime-service','action':args.action,'actionCount':0,'sourceVerifiedBeforeImports':True}
        if args.action=='health':
            result=health.snapshot('running',expect_backups=True); control.need(result.get('runtimeImageId')==state['candidate']['runtimeImageId'])
        else:
            with c.lock():
                before=h.writers(c); c.validate_app_containers(before,state['candidate']); command=c.compose(state['candidate']['runtimeImageId'])
                try:
                    c.run(command+['stop','--timeout','30','app','worker'],timeout=75)
                    after=h.writers(c); c.validate_app_containers(after,state['candidate'],running=False)
                    graceful=h.graceful_writer_stop(before,after)
                    result=h.backup_verified(c,backup,state['candidate'])|{'mode':'encrypted-backup-completed','offsiteEstablished':False,'restoreAcceptance':'pending','gracefulExitCodes':graceful}
                finally: c.run(command+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app','worker'],timeout=210)
                c.validate_app_containers(h.writers(c),state['candidate']); h.ready(); result['runtimeWritersResumed']=True
        return result|{'actionCount':1,'sourceVerifiedBeforeImports':True,'sourceCommit':state['candidate']['sourceCommit'],
            'accessProfileSha256':state['candidateProfileSha256'],'approvalSha256':args.approval_sha256,'invocationId':invocation}


if __name__=='__main__':
    try:
        result=main(); print(json.dumps(result)); raise SystemExit({'healthy':0,'warning':1,'critical':2}.get(result.get('status'),0))
    except (OSError,ValueError,KeyError,TypeError,RuntimeError):
        print(json.dumps({'mode':'ui-release-callback-gated-or-failed','automaticRetry':False})); raise SystemExit(2) from None
