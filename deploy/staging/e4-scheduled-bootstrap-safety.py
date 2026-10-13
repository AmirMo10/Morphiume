#!/usr/bin/env python3
"""Pure E4 scheduling counterexamples; mocked commands, no daemon/DB/SSH."""
import ast
from contextlib import nullcontext
import copy
import errno
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import py_compile
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('e4_schedule_bootstrap', Path(__file__).with_name('e4-scheduled-bootstrap.py'))
m = importlib.util.module_from_spec(SPEC)
exec(compile(Path(SPEC.origin).read_bytes(), SPEC.origin, 'exec'), m.__dict__)
INVOCATION = 'a' * 32


def args(action='health'):
    return SimpleNamespace(action=action, tool_source_commit='b'*40, tool_sha256='c'*64,
        ops_root=str(m.BUNDLE), approval_sha256='d'*64, profile_sha256=m.SSH_PROFILE,
        unit=m.unit(action), execute=False, render_dropin=False, render_health_timer=False)


def approval(a=None):
    a = a or args()
    return m.EXPECTED | {'formatVersion': 1, 'mode': 'quiesce-runtime-only', 'sharedDatabaseWindowReleased': True,
        'accessProfileSha256': a.profile_sha256, 'restoreEvidence': str(m.RESTORE), 'restoreEvidenceSha256': m.RESTORE_SHA,
        'bootstrapSourceCommit': a.tool_source_commit, 'bootstrapSha256': a.tool_sha256,
        'scope': 'one-time-service-measurement', 'backupTimeoutStopSeconds': 90,
        'serviceMeasurementSha256': {'health': None, 'backup': None}, 'healthTimerIntervalSeconds':300,
        'dispatchLock':{'path':str(m.DISPATCH_LOCK),'sha256':m.sha(m.LOCK_BYTES),'device':1,'inode':2,'filesystem':'ext4'}}


def evidence():
    return m.EXPECTED | {'mode': 'native-business-restore-accepted', 'accessProfileSha256': m.SSH_PROFILE,
        'checks': dict.fromkeys(m.CHECKS, True), 'workerStarted': False, 'origin': 'http://localhost:3101',
        'fixtureManifestSha256': m.FIXTURE_SHA, 'acceptedUtc': '2026-10-13T09:11:27.877614Z',
        'observedRtoSeconds': 516.390835, 'observedRecoveryPointGapSeconds': 1657.188}


def effective(a=None):
    a = a or args(); health = a.action == 'health'
    return {'Id':m.unit(a.action),'Names':m.unit(a.action),'LoadState':'loaded',
        'FragmentPath':'/etc/systemd/system/'+m.unit(a.action),'DropInPaths':str(m.dropin_path(a.action)),
        'Type':'oneshot','User':'root','UMask':'0077','Restart':'no','EnvironmentFiles':'','InvocationID':INVOCATION,
        'ActiveState':'activating','WorkingDirectory':str(m.CONFIG),'NoNewPrivileges':'yes','PrivateTmp':'yes',
        'ProtectHome':'yes','ProtectSystem':'strict','CPUAccounting':'yes','MemoryAccounting':'yes',
        'TimeoutStartUSec':'50s' if health else '20min','TimeoutStopUSec':'5s' if health else '1min 30s',
        'MemoryMax':str((256 if health else 512)*1024**2),'CPUQuotaPerSecUSec':'1s' if health else '500ms',
        'ReadWritePaths':'' if health else str(m.ROOT/'backups')+' /srv/morphiume/staging/deploy.lock',
        'ExecStart':'{ path=/usr/bin/python3 ; argv[]='+' '.join(m.command(a,m.unit(a.action)))+
        ' ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0 }'}


def text(value):
    return '\n\n'.join(key+'='+value for key,value in value.items())+'\n'


def timer(name='morphiume-runtime-health.timer'):
    return {'Id':name,'LoadState':'loaded','ActiveState':'inactive','UnitFileState':'disabled',
            'FragmentPath':'/etc/systemd/system/'+name,'DropInPaths':'','Triggers':name.replace('.timer','.service')}


def healthy():
    return {'scope':'morphiume-staging-runtime','expectedServiceMode':'running','expectLogicalBackups':True,
        'status':'healthy','alerts':[],'appReadiness':200,'databaseHealthy':True,
        'runtimeImageId':m.EXPECTED['runtimeImageId'],'testedPlatformConfig':m.EXPECTED['testedPlatformConfig'],
        'accessProfile':'ssh-localhost','canonicalOrigin':'http://localhost:3100',
        'containers':[{'service':name,'status':'running','health':'healthy','engineIdentityMatches':True,
                       'oomKilled':False,'restarts':0} for name in ('app','worker')]}


class PureChecks(unittest.TestCase):
    def test_default_plan_imports_and_commands_zero(self):
        with patch.object(m,'verified_sources',side_effect=AssertionError), patch.object(m,'import_verified',side_effect=AssertionError):
            self.assertEqual(m.main(args())['mode'],'unexecuted-plan')

    def test_cli_plan_no_files_or_remote_actions(self):
        a=args()
        result=subprocess.run([sys.executable,m.__file__,'health','--tool-source-commit',a.tool_source_commit,
            '--tool-sha256',a.tool_sha256,'--ops-root',a.ops_root,'--approval-sha256',a.approval_sha256,
            '--profile-sha256',a.profile_sha256],capture_output=True,text=True,env={'PATH':os.environ.get('PATH','')})
        self.assertEqual(result.returncode,0); self.assertIs(json.loads(result.stdout)['serverMutation'],False)

    def test_invalid_args_unknown_action_injection_rejected(self):
        for key,value in [('tool_sha256','x'),('tool_source_commit','../main'),('ops_root','/tmp/ops'),
                          ('approval_sha256','bad'),('profile_sha256','../bad'),('action','restore')]:
            a=args();setattr(a,key,value)
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_arguments(a)
        with self.assertRaises(ValueError):m.command(args(),'other.service;bad')

    def test_dropins_separate_budgets_no_timer_writepaths_install(self):
        h=m.dropin(args());b=m.dropin(args('backup'))
        self.assertIn('CPUQuota=100%\nMemoryMax=256M\nTimeoutStartSec=50s\nTimeoutStopSec=5s',h)
        for key in ('CPUQuota=','MemoryMax=','TimeoutStartSec=','TimeoutStopSec='): self.assertNotIn(key,b)
        for value in (h,b):
            self.assertEqual(value.count('ExecStartPre=/usr/bin/test'),2)
            self.assertIn('EnvironmentFile=\n',value);self.assertIn('--unit %n --execute',value)
            for bad in ('[Timer]','enable','ReadWritePaths=','Restart=','DATABASE_URL','591'):self.assertNotIn(bad,value)

    def test_renderer_matches_exact_stdout(self):
        a=args('backup')
        result=subprocess.run([sys.executable,m.__file__,'backup','--tool-source-commit',a.tool_source_commit,
            '--tool-sha256',a.tool_sha256,'--ops-root',a.ops_root,'--approval-sha256',a.approval_sha256,
            '--profile-sha256',a.profile_sha256,'--render-dropin'],capture_output=True,text=True)
        self.assertEqual(result.returncode,0);self.assertEqual(result.stdout,m.dropin(a))

    def test_five_minute_timer_reset_recreates_boot_without_budget_or_backup_change(self):
        rendered=m.health_timer_dropin()
        self.assertEqual(rendered,'[Timer]\nOnUnitActiveSec=\nOnBootSec=5min\nOnUnitActiveSec=5min\n')
        self.assertNotIn('60s',rendered)
        for forbidden in ('RandomizedDelaySec','AccuracySec','Persistent','OnCalendar','CPUQuota','ExecStart','backup'):
            self.assertNotIn(forbidden,rendered)
        a=args();a.render_health_timer=True
        with patch.object(m,'verified_sources',side_effect=AssertionError):self.assertEqual(m.main(a),rendered)
        a.render_dropin=True
        with self.assertRaises(ValueError):m.main(a)

    def test_all21_frozen_ops_manifest(self):
        base=Path(m.__file__).parent
        sources={name:(base/name).read_bytes().replace(b'\r\n',b'\n') for name in m.OPS_FILES}
        manifest={name:m.sha(value) for name,value in sources.items()}
        m.verify_manifest(manifest,sources)

    def test_missing_extra_changed21_source_rejected(self):
        base=Path(m.__file__).parent
        sources={name:(base/name).read_bytes().replace(b'\r\n',b'\n') for name in m.OPS_FILES}
        manifest={name:m.sha(value) for name,value in sources.items()}
        for kind in ('missing','extra','changed','digest'):
            s=dict(sources);h=dict(manifest)
            if kind=='missing':s.pop('runtime/contract.py')
            if kind=='extra':h['runtime/unknown.py']='e'*64
            if kind=='changed':s['runtime/scheduled.py']+=b'changed'
            if kind=='digest':h['runtime/health.py']='e'*64
            with self.subTest(kind=kind),self.assertRaises(ValueError):m.verify_manifest(h,s)

    def test_duplicate_json_nonfinite_and_scalar_properties_rejected(self):
        for value in ('{"a":1,"a":2}','{"a":Infinity}','{"a":NaN}'):
            with self.assertRaises(ValueError):m.parse(value)
        with self.assertRaises(ValueError):m.properties('User=root\nUser=root')

    def test_cache_existing_dangling_and_source_direct_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary);prefix=base/'unused-bytecode-cache'
            prefix.mkdir()
            with self.assertRaises(ValueError):m.cache_guard(base)
            prefix.rmdir();prefix.symlink_to(base/'missing')
            with self.assertRaises(ValueError):m.cache_guard(base)
            prefix.unlink()
            previous=sys.pycache_prefix
            try:
                m.cache_guard(base);self.assertTrue(sys.dont_write_bytecode);self.assertFalse(prefix.exists())
                names=('contract','backup','health','restore','scheduled')
                sources={'runtime/'+name+'.py':b'VALUE="verified source"\n' for name in names}
                sources['runtime/contract.py']+=('def ops_digest(): return '+repr(m.OPS)+'\n').encode()
                guarded_prefix=sys.pycache_prefix
                for name in names:
                    file=base/'runtime'/(name+'.py');file.parent.mkdir(parents=True,exist_ok=True)
                    verified=sources['runtime/'+name+'.py'];hostile=verified.replace(b'verified source',b'hostile pycache')
                    self.assertEqual(len(verified),len(hostile))
                    file.write_bytes(hostile);stamp=file.stat().st_mtime
                    sys.pycache_prefix=None
                    py_compile.compile(str(file),doraise=True)
                    file.write_bytes(verified);os.utime(file,(stamp,stamp))
                    control=importlib.machinery.SourceFileLoader('control',str(file)).get_code('control')
                    self.assertIn('hostile pycache',control.co_consts)  # Real valid stale-PYC counterexample.
                    sys.pycache_prefix=guarded_prefix
                with patch.object(m,'BUNDLE',base),patch.dict(sys.modules,{},clear=False):
                    saved={name:sys.modules.pop(name,None) for name in names}
                    try:
                        c,s=m.import_verified(sources);self.assertEqual(c.VALUE,'verified source');self.assertEqual(s.VALUE,'verified source')
                    finally:
                        for name in names:
                            sys.modules.pop(name,None)
                            if saved[name] is not None:sys.modules[name]=saved[name]
                self.assertFalse(prefix.exists())
            finally:sys.pycache_prefix=previous

    def test_ambient_module_alias_rejected(self):
        with patch.dict(sys.modules,{'contract':Mock()}),self.assertRaises(ValueError):m.import_verified({})

    def test_inherited_environment_secrets_python_docker_removed(self):
        with patch.dict(os.environ,{'DATABASE_URL':'not-real','AUTH_SECRET':'not-real','DOCKER_HOST':'remote','PYTHONPATH':'ambient'},clear=True):
            m.clean_environment(INVOCATION)
            self.assertEqual(set(os.environ),{'PATH','LANG','INVOCATION_ID'})
        with self.assertRaises(ValueError):m.clean_environment('invalid')

    def test_health_backup_effective_positive_and_blank_lines(self):
        for action in ('health','backup'):
            a=args(action);v=effective(a)
            self.assertEqual(m.properties(text(v)),v);m.validate_effective(v,a,INVOCATION,90)

    def test_effective_budget_security_env_shadow_scalar_fail_closed(self):
        for key,value in [('DropInPaths',str(m.dropin_path('health'))+' /run/shadow.conf'),('EnvironmentFiles','/private/env'),
            ('MemoryMax','536870912'),('CPUQuotaPerSecUSec','2s'),('TimeoutStartUSec','2min'),('TimeoutStopUSec','10s'),
            ('ProtectSystem','full'),('PrivateTmp','no'),('ProtectHome','no'),('NoNewPrivileges','no'),('User','1001'),
            ('ReadWritePaths','/srv'),('Names',m.unit('health')+' alias'),('Restart','always'),('InvocationID','b'*32)]:
            x=effective();x[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_effective(x,args(),INVOCATION,90)

    def test_effective_old_exec_ignore_duplicate_unknown_fields_rejected(self):
        for before,after in [('ignore_errors=no','ignore_errors=yes'),(' ; pid=0',' ; path=x ; pid=0'),
            (' ; pid=0',' ; secret=x ; pid=0'),('argv[]='+' '.join(m.command(args(),m.unit('health'))),'argv[]=/old/591/scheduled.py')]:
            v=effective();v['ExecStart']=v['ExecStart'].replace(before,after)
            with self.subTest(after=after),self.assertRaises(ValueError):m.validate_effective(v,args(),INVOCATION,90)

    def test_approval_exact_mapping_scope_positive(self):
        m.validate_approval(approval(),args())
        value=approval();value['scope']='recurring-timers';value['serviceMeasurementSha256']={'health':'e'*64,'backup':'f'*64}
        m.validate_approval(value,args())

    def test_approval_unknown_old_ops_profile_no_window_and_budget_rejected(self):
        for key,value in [('extra','unknown'),('opsSha256','e'*64),('accessProfileSha256','f'*64),
            ('sharedDatabaseWindowReleased',False),('bootstrapSha256','f'*64),('restoreEvidenceSha256','e'*64),
            ('restoreEvidence',str(m.RESTORE).replace('20261013t','20261012T')),('backupTimeoutStopSeconds',120),
            ('healthTimerIntervalSeconds',60),('formatVersion',True)]:
            x=approval();x[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_approval(x,args())

    def test_recurring_without_both_service_measurements_rejected(self):
        v=approval();v['scope']='recurring-timers'
        with self.assertRaises(ValueError):m.validate_approval(v,args())
        v['serviceMeasurementSha256']={'health':'e'*64,'backup':None}
        with self.assertRaises(ValueError):m.validate_approval(v,args())

    def test_restore_actual_fixture_marker_positive_no_relabel(self):
        m.validate_restore(evidence())
        self.assertEqual(m.RESTORE_SHA,'74d77bef8e420532fd384880f7f049c86e747d04da58270a1e929b304c8f26e6')

    def test_restore_old_identity_missing_check_nonfinite_origin_alias_rejected(self):
        for key,value in [('sourceCommit','a'*40),('origin','http://localhost:3100'),('workerStarted',True),
            ('fixtureManifestSha256','b'*64),('observedRtoSeconds',float('inf')),('observedRecoveryPointGapSeconds',True),
            ('accessProfileSha256','b'*64),('acceptedUtc','2026-10-13T09:11:00')]:
            x=evidence();x[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_restore(x)
        x=evidence();x['checks'].pop('mediaHashes')
        with self.assertRaises(ValueError):m.validate_restore(x)

    def test_ssh_profile_and_private_accepted_transition(self):
        c=Mock();c.canonical_hash.side_effect=lambda p:p['testHash']
        old=m.EXPECTED|{'profile':'ssh-localhost','origin':'http://localhost:3100','opsRoot':str(m.BUNDLE),'testHash':m.SSH_PROFILE}
        dep=m.EXPECTED|{'accessProfileSha256':m.SSH_PROFILE}
        m.validate_profile(c,old,dep,None,args())
        a=args();a.profile_sha256='f'*64
        new=old|{'profile':'private-ip','origin':'http://192.168.240.51','testHash':a.profile_sha256}
        state={'phase':'accepted','nativeAcceptance':'accepted','dataRollback':False,'candidate':new,'previous':old,
            'acceptanceSha256':'e'*64,'startedUtc':'2026-10-13T10:00:00Z','acceptedUtc':'2026-10-13T10:10:00Z',
            'acceptanceDeadlineUtc':'2026-10-13T10:20:00Z'}
        m.validate_profile(c,new,dep|{'accessProfileSha256':a.profile_sha256,'nativePreviewAcceptance':'accepted'},state,a)
        for key,value in [('phase','native-acceptance-pending'),('nativeAcceptance','pending'),('previous',new),('dataRollback',True)]:
            x=state|{key:value}
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_profile(c,new,dep|{'accessProfileSha256':a.profile_sha256,'nativePreviewAcceptance':'accepted'},x,a)

    def test_one_time_timer_disabled_gates_no_enable(self):
        v=timer()
        m.validate_timer_state(v,'one-time-service-measurement')
        for key,value in [('ActiveState','active'),('UnitFileState','enabled'),('Id','other.timer')]:
            with self.assertRaises(ValueError):m.validate_timer_state(v|{key:value},'one-time-service-measurement')

    def test_timer_shadow_target_or_pending_cadence_override_rejected(self):
        for key,value in [('DropInPaths','/run/shadow.conf'),('Triggers','other.service'),('FragmentPath','/run/unit.timer')]:
            v=timer()|{'DropInPaths':str(m.HEALTH_TIMER_DROPIN)}
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_timer_state(v|{key:value},'recurring-timers')
        m.validate_timer_state(timer()|{'DropInPaths':str(m.HEALTH_TIMER_DROPIN)},'recurring-timers')
        with self.assertRaises(ValueError):m.validate_timer_state(timer(),'recurring-timers')
        empty=timer()|{'LoadState':'not-found','UnitFileState':'','FragmentPath':'','Triggers':''}
        m.validate_timer_state(empty,'one-time-service-measurement')
        with self.assertRaises(ValueError):m.validate_timer_state(empty,'recurring-timers')

    def test_private_native_three_engine_exact_checks_no_skip_retry(self):
        a=args();a.profile_sha256='f'*64
        state={'acceptedUtc':'2026-10-13T10:10:00Z'}
        value=m.EXPECTED|{'origin':'http://192.168.240.51','accessProfileSha256':a.profile_sha256,
            'noUnexpectedBusinessMutation':True,'acceptedUtc':state['acceptedUtc'],
            'engines':[{'engine':name,'checks':dict.fromkeys(m.NATIVE_CHECKS,True),'unexpected':0,'skipped':0,'testRetries':0}
                       for name in ('chromium','firefox','webkit')]}
        m.validate_native(value,state,a)
        for kind in ('missing','duplicate','skip','retry','false','time','profile'):
            x=copy.deepcopy(value)
            if kind=='missing':x['engines'].pop()
            if kind=='duplicate':x['engines'][2]['engine']='firefox'
            if kind=='skip':x['engines'][1]['skipped']=1
            if kind=='retry':x['engines'][1]['testRetries']=1
            if kind=='false':x['engines'][0]['checks']['perimeter']=False
            if kind=='time':x['acceptedUtc']='2026-10-13T10:15:00Z'
            if kind=='profile':x['accessProfileSha256']=m.SSH_PROFILE
            with self.subTest(kind=kind),self.assertRaises(ValueError):m.validate_native(x,state,a)

    def test_guarded_records_hashes_raw_approval_and_marker_not_canonical(self):
        a=args();marker=(json.dumps(evidence(),indent=2)+'\n').encode()
        value=approval(a)|{'restoreEvidenceSha256':m.sha(marker)}
        raw=(json.dumps(value,indent=2)+'\n').encode();a.approval_sha256=m.sha(raw)
        profile=m.EXPECTED|{'profile':'ssh-localhost','origin':'http://localhost:3100','opsRoot':str(m.BUNDLE)}
        dep=m.EXPECTED|{'accessProfileSha256':a.profile_sha256}
        c=Mock();c.active_profile.return_value=profile;c.canonical_hash.return_value=a.profile_sha256
        def file(path,*unused):
            result=Mock()
            result.read_bytes.return_value={m.CONFIG/'schedule-approved.json':raw,m.RESTORE:marker,
                m.CONFIG/'deployed-release.json':json.dumps(dep).encode()}[path]
            return result
        with patch.object(m,'metadata',side_effect=file),patch.object(m,'RESTORE_SHA',m.sha(marker)),patch.object(Path,'exists',return_value=False),patch.object(Path,'is_symlink',return_value=False):
            got,_=m.guarded_records(a,c);self.assertEqual(got['mode'],'quiesce-runtime-only')
            a.approval_sha256=m.sha(json.dumps(value,sort_keys=True,separators=(',',':')).encode())
            with self.assertRaises(ValueError):m.guarded_records(a,c)

    def test_sanitized_health_no_raw_secret_data_and_healthy_falsification(self):
        h=healthy();h['privateUnknown']='private-not-real'
        result=m.safe_result('health',h,args());self.assertNotIn('private-not-real',json.dumps(result))
        for key,value in [('alerts',[{'code':'x'}]),('appReadiness',503),('databaseHealthy',False),
            ('runtimeImageId','sha256:'+'e'*64),('accessProfile','private-ip')]:
            with self.subTest(key=key),self.assertRaises(ValueError):m.safe_result('health',h|{key:value},args())
        h=healthy();h['containers'][1]['oomKilled']=True
        with self.assertRaises(ValueError):m.safe_result('health',h,args())

    def test_backup_completion_not_new_restore_or_offsite_acceptance(self):
        h={'mode':'encrypted-backup-completed','runtimeWritersResumed':True,'directory':str(m.ROOT/'backups/20261013T100000Z-1234abcd')}
        v=m.safe_result('backup',h,args('backup'));self.assertEqual(v['restoreAcceptance'],'pending');self.assertFalse(v['offsiteEstablished'])
        for key,value in [('runtimeWritersResumed',False),('directory','/srv/other'),('mode','partial')]:
            with self.assertRaises(ValueError):m.safe_result('backup',h|{key:value},args('backup'))

    def dispatch_fake(self, failure=None, after_changed=False):
        a=args();a.execute=True;c=Mock();s=Mock();s.main.return_value=healthy()
        if failure:s.main.side_effect=failure
        def run(command):
            if command[2]==a.unit:
                v=effective(a)
                if '--all' not in command:v.pop('EnvironmentFiles')
                return text(v)
            if command[2].endswith('.timer'):return text(timer(command[2]))
            peer=copy.copy(a);peer.action='backup';peer.unit=m.unit('backup')
            return text(effective(peer)|{'ActiveState':'inactive','InvocationID':''})
        c.run.side_effect=run
        records=[(approval(a),{'same':'before'}),(approval(a),{'same':'before'}),
                 (approval(a),{'same':'changed' if after_changed else 'before'})]
        old_run=c.run.side_effect
        c.run.side_effect=lambda command:'ext4\n' if command[0]=='findmnt' else old_run(command)
        with patch.object(m,'guarded_records',side_effect=records),patch.object(m,'dispatch_lock',return_value=nullcontext(True)),patch.object(m.os,'getppid',return_value=1),patch.object(Path,'read_text',return_value='systemd\n'):
            if failure or after_changed:
                with self.assertRaises((ValueError,subprocess.SubprocessError)):m.dispatch(a,c,s,INVOCATION)
                result=None
            else:result=m.dispatch(a,c,s,INVOCATION)
        s.main.assert_called_once_with('health',apply=True)
        for command in c.run.call_args_list:
            self.assertIn(command.args[0][0],('systemctl','findmnt'))
            if command.args[0][0]=='systemctl':self.assertEqual(command.args[0][3],'--all')
        return result

    def test_dispatch_one_action_and_only_readonly_manager_metadata(self):
        self.assertEqual(self.dispatch_fake()['actionCount'],1)

    def test_empty_environmentfiles_requires_all_query_and_exact_field_presence(self):
        value=effective();self.assertEqual(value['EnvironmentFiles'],'')
        m.validate_effective(value,args(),INVOCATION,90)
        value.pop('EnvironmentFiles')
        with self.assertRaises(ValueError):m.validate_effective(value,args(),INVOCATION,90)
        self.assertEqual(self.dispatch_fake()['actionCount'],1)

    def test_action_failure_preserved_no_retry(self):
        self.dispatch_fake(subprocess.SubprocessError('private-error'))

    def test_post_record_drift_cannot_be_reported_accepted(self):
        self.dispatch_fake(after_changed=True)

    def test_direct_non_systemd_execution_stopped_before_records(self):
        a=args()
        with patch.object(m.os,'getppid',return_value=7),patch.object(m,'guarded_records') as records,self.assertRaises(ValueError):
            m.dispatch(a,Mock(),Mock(),INVOCATION)
        records.assert_not_called()

    def test_approval_lock_wrong_inode_device_path_hash_or_network_filesystem(self):
        for key,value in [('path','/srv/morphiume/staging/deploy.lock'),('sha256','a'*64),
                          ('device',0),('inode',True),('filesystem','nfs'),('unknown',1)]:
            a=approval();a['dispatchLock'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_approval(a,args())

    def lock_fixture(self, directory):
        file=Path(directory)/'schedule-dispatch.lock';file.write_bytes(m.LOCK_BYTES);file.chmod(0o600)
        info=file.stat();a=approval();a['dispatchLock']|={'path':str(file),'device':info.st_dev,'inode':info.st_ino}
        return file,a

    def test_actual_readonly_descriptor_exclusive_flock_blocks_separate_process(self):
        with tempfile.TemporaryDirectory() as temporary:
            file,a=self.lock_fixture(temporary)
            fd=os.open(file,os.O_RDONLY|os.O_CLOEXEC);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            child='import fcntl,os,sys\nf=os.open(sys.argv[1],os.O_RDONLY)\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: print("busy");sys.exit(4)\nprint("acquired")\n'
            try:
                result=subprocess.run([sys.executable,'-c',child,str(file)],capture_output=True,text=True)
                self.assertEqual((result.returncode,result.stdout.strip()),(4,'busy'))
                self.assertFalse(os.get_inheritable(fd));self.assertEqual(fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE,os.O_RDONLY)
                self.assertEqual(file.read_bytes(),m.LOCK_BYTES)
            finally:os.close(fd)
            result=subprocess.run([sys.executable,'-c',child,str(file)],capture_output=True,text=True)
            self.assertEqual((result.returncode,result.stdout.strip()),(0,'acquired'))

    def test_lock_context_actual_acquire_busy_release_and_marker_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary:
            file,a=self.lock_fixture(temporary)
            original_fstat=os.fstat
            def root_info(fd):
                info=original_fstat(fd)
                return SimpleNamespace(st_uid=0,st_mode=info.st_mode,st_nlink=info.st_nlink,
                    st_dev=info.st_dev,st_ino=info.st_ino,st_size=info.st_size)
            with patch.object(m,'DISPATCH_LOCK',file),patch.object(m,'metadata',side_effect=lambda p,*unused:p),patch.object(m.os,'fstat',side_effect=root_info):
                with m.dispatch_lock(a) as held:
                    self.assertTrue(held)
                    with m.dispatch_lock(a) as busy:self.assertFalse(busy)
                with self.assertRaises(ValueError):
                    with m.dispatch_lock(a) as held:raise ValueError('not-real action failure')
                with m.dispatch_lock(a) as held:self.assertTrue(held)
                self.assertEqual(file.read_bytes(),m.LOCK_BYTES)

    def test_lock_wrong_identity_content_and_unknown_errno_never_busy_skip(self):
        with tempfile.TemporaryDirectory() as temporary:
            file,a=self.lock_fixture(temporary);original_fstat=os.fstat
            def root_info(fd):
                info=original_fstat(fd)
                return SimpleNamespace(st_uid=0,st_mode=info.st_mode,st_nlink=info.st_nlink,
                    st_dev=info.st_dev,st_ino=info.st_ino,st_size=info.st_size)
            with patch.object(m,'DISPATCH_LOCK',file),patch.object(m,'metadata',side_effect=lambda p,*unused:p),patch.object(m.os,'fstat',side_effect=root_info):
                wrong=copy.deepcopy(a);wrong['dispatchLock']['inode']+=1
                with self.assertRaises(ValueError):
                    with m.dispatch_lock(wrong):pass
                file.write_bytes(m.LOCK_BYTES[:-1]+b'x')
                with self.assertRaises(ValueError):
                    with m.dispatch_lock(a):pass
                file.write_bytes(m.LOCK_BYTES)
                with patch.object(fcntl,'flock',side_effect=OSError(errno.EACCES,'not-real')),self.assertRaises(OSError):
                    with m.dispatch_lock(a):pass

    def test_lock_symlink_hardlink_and_write_mode_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            file,a=self.lock_fixture(temporary);original_fstat=os.fstat
            def root_info(fd):
                info=original_fstat(fd)
                return SimpleNamespace(st_uid=0,st_mode=info.st_mode,st_nlink=info.st_nlink,
                    st_dev=info.st_dev,st_ino=info.st_ino,st_size=info.st_size)
            with patch.object(m,'metadata',side_effect=lambda p,*unused:p),patch.object(m.os,'fstat',side_effect=root_info):
                link=Path(temporary)/'alias';link.symlink_to(file)
                with patch.object(m,'DISPATCH_LOCK',link),self.assertRaises(OSError):
                    with m.dispatch_lock(a):pass
                link.unlink();os.link(file,link)
                with patch.object(m,'DISPATCH_LOCK',file),self.assertRaises(ValueError):
                    with m.dispatch_lock(a):pass
                link.unlink();file.chmod(0o640)
                with patch.object(m,'DISPATCH_LOCK',file),self.assertRaises(ValueError):
                    with m.dispatch_lock(a):pass

    def test_one_time_busy_fails_recurring_verified_busy_is_not_healthy_or_backup(self):
        a=args();c=Mock();s=Mock();record=approval(a)
        def run(command):
            if command[0]=='findmnt':return 'ext4\n'
            if command[2]==a.unit:return text(effective(a))
            if command[2].endswith('.service'):
                peer=copy.copy(a);peer.action='backup';peer.unit=m.unit('backup')
                return text(effective(peer)|{'ActiveState':'active','InvocationID':'b'*32})
            v=timer(command[2])
            if record['scope']=='recurring-timers' and 'health.timer' in command[2]:v['DropInPaths']=str(m.HEALTH_TIMER_DROPIN)
            return text(v)
        c.run.side_effect=run
        with patch.object(m,'guarded_records',return_value=(record,{})),patch.object(m,'dispatch_lock',return_value=nullcontext(False)),patch.object(m.os,'getppid',return_value=1),patch.object(Path,'read_text',return_value='systemd\n'):
            with self.assertRaises(ValueError):m.dispatch(a,c,s,INVOCATION)
            record['scope']='recurring-timers';record['serviceMeasurementSha256']={'health':'e'*64,'backup':'f'*64}
            result=m.dispatch(a,c,s,INVOCATION)
        s.main.assert_not_called()
        self.assertEqual(result['mode'],'recurring-dispatch-busy-skipped');self.assertEqual(result['actionCount'],0)
        self.assertFalse(result['healthEvaluated']);self.assertFalse(result['backupCreated']);self.assertNotIn('status',result)

    def test_lock_held_through_single_backup_action_and_final_proof(self):
        # A mocked lock tracks boundaries; frozen deploy.lock remains separate.
        from contextlib import contextmanager
        a=args('backup');a.execute=True;c=Mock();s=Mock();held=[];records=[]
        @contextmanager
        def gate(unused):
            held.append(True)
            try:yield True
            finally:held.pop()
        def protected(unused,*unused_args):
            records.append(bool(held));return approval(a),{'unchanged':True}
        def action(*unused,**unused_kwargs):
            self.assertEqual(held,[True])
            return {'mode':'encrypted-backup-completed','runtimeWritersResumed':True,
                'directory':str(m.ROOT/'backups/20261013T100000Z-1234abcd')}
        s.main.side_effect=action
        def run(cmd):
            if cmd[0]=='findmnt':return 'ext4\n'
            if cmd[2]==a.unit:return text(effective(a))
            if cmd[2].endswith('.service'):
                peer=copy.copy(a);peer.action='health';peer.unit=m.unit('health')
                return text(effective(peer)|{'ActiveState':'inactive','InvocationID':''})
            return text(timer(cmd[2]))
        c.run.side_effect=run
        with patch.object(m,'guarded_records',side_effect=protected),patch.object(m,'dispatch_lock',side_effect=gate),patch.object(m.os,'getppid',return_value=1),patch.object(Path,'read_text',return_value='systemd\n'):
            self.assertEqual(m.dispatch(a,c,s,INVOCATION)['actionCount'],1)
        self.assertEqual(records,[False,True,True]);self.assertEqual(held,[]);s.main.assert_called_once_with('backup',apply=True)

    def test_peer_stale_manager_old_command_cannot_bypass_atomic_lock(self):
        a=args('backup');v=effective(a)|{'ActiveState':'inactive','InvocationID':''}
        m.validate_peer_effective(v,a,90)
        v['ExecStart']=v['ExecStart'].replace(' '.join(m.command(a,m.unit('backup'))),'/usr/bin/python3 /old/591/scheduled.py backup --apply')
        with self.assertRaises(ValueError):m.validate_peer_effective(v,a,90)

    def test_exact_frozen_backup_finally_resumes_after_failure(self):
        # Compile untouched scheduled.py with mocked import boundaries, not a
        # mirror of its try/finally implementation; no real PG/Docker call.
        c=Mock();b=Mock();h=Mock();r=Mock()
        c.assert_boundaries=Mock()
        c.CONFIG=Path('/not-real');c.ROOT=m.ROOT;c.PROJECT='morphiume-staging-runtime';c.ops_digest.return_value=m.OPS
        c.exact_path.side_effect=Path
        c.deployed_image.return_value=m.EXPECTED;c.lock.return_value=nullcontext();c.compose.return_value=['compose']
        c.runtime_image.return_value=m.EXPECTED['runtimeImageId']
        c.private_file.return_value.read_text.side_effect=[json.dumps(approval()),json.dumps(m.EXPECTED),json.dumps(evidence())]
        c.run.side_effect=lambda command,**kwargs:'id' if command[:2]==['docker','ps'] else '[]' if command[:2]==['docker','inspect'] else ''
        b.main.side_effect=ValueError('not-real failure')
        ns={'__name__':'frozen_scheduled_test'}
        with patch.dict(sys.modules,{'contract':c,'backup':b,'health':h,'restore':r}),patch.object(Path,'exists',return_value=False):
            exec(compile((Path(m.__file__).parent/'runtime/scheduled.py').read_bytes(),'immutable-scheduled.py','exec'),ns)
            with self.assertRaises(ValueError):ns['main']('backup',True)
        stop=[v.args[0] for v in c.run.call_args_list if 'stop' in v.args[0]]
        resume=[v.args[0] for v in c.run.call_args_list if 'up' in v.args[0]]
        self.assertEqual(stop,[['compose','stop','--timeout','30','app','worker']])
        self.assertEqual(resume,[['compose','up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app','worker']])
        b.main.assert_called_once();self.assertNotIn('seed',repr(c.run.call_args_list))

    def test_source_ast_and_no_install_approval_write_or_retry(self):
        source=Path(m.__file__).read_text();tree=ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute):
                self.assertNotIn(node.func.attr,('write_text','write_bytes','unlink','mkdir','chmod','chown'))
        self.assertNotIn('systemctl\", \"start',source)


if __name__=='__main__':unittest.main(verbosity=2)
