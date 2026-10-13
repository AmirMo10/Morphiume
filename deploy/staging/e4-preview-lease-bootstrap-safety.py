#!/usr/bin/env python3
"""Pure lease-bootstrap counterexamples; all daemon/action calls are mocked."""
import copy
import datetime
import importlib.util
import json
import os
import py_compile
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('lease_bootstrap', Path(__file__).with_name('e4-preview-lease-bootstrap.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
UNIT = 'morphiume-runtime-preview-012345abcdef.service'
INVOCATION = 'a' * 32


def args():
    return SimpleNamespace(tool_sha256='b' * 64, tool_source_commit='c' * 40, ops_root=str(m.BUNDLE),
        unit=UNIT, execute=False, render_dropin=False)


def state():
    return {'transaction': str(m.ROOT / 'metrics/preview-20261013T100000Z-012345abcdef'),
        'candidate': m.EXPECTED | {'profile': 'private-ip', 'origin': 'http://192.168.240.51', 'opsRoot': str(m.BUNDLE)},
        'previous': m.EXPECTED | {'profile': 'ssh-localhost', 'origin': 'http://localhost:3100', 'opsRoot': str(m.BUNDLE)},
        'phase': 'native-acceptance-pending', 'startedUtc': '2026-10-13T10:00:00Z',
        'acceptanceDeadlineUtc': '2026-10-13T10:20:00.900000Z', 'dataRollback': False}


def effective(a):
    return {'Id': UNIT, 'Names': UNIT, 'LoadState': 'loaded', 'FragmentPath': '/etc/systemd/system/' + UNIT,
        'DropInPaths': str(m.DROPIN), 'Type': 'oneshot', 'User': 'root', 'UMask': '0077',
        'TimeoutStartUSec': '2min', 'Restart': 'no', 'EnvironmentFiles': '', 'InvocationID': INVOCATION,
        'ActiveState': 'activating', 'ExecStart': '{ path=/usr/bin/python3 ; argv[]=' + ' '.join(m.command(a, UNIT)) +
        ' ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }'}


class C:
    CONFIG = Path('/etc/morphiume-staging-runtime')
    def __init__(self, value=None): self.value = value or state(); self.calls = []; self.files = {}
    def validate_profile(self, _): pass
    def active_profile(self, **_): return self.value['candidate']
    def load_configs(self): return 'verified protected settings'
    def private_file(self, _): return SimpleNamespace(read_text=lambda: 'exact canonical env')
    def compose_environment(self, *_): return 'exact canonical env'
    def run(self, command):
        self.calls.append(command)
        return '\n'.join(k + '=' + v for k,v in effective(args()).items())
    def write_private(self, path, body):
        if str(path) in self.files: raise FileExistsError('exclusive evidence')
        self.files[str(path)] = body


class Safety(unittest.TestCase):
    def test_default_plan_has_no_import_or_commands(self):
        with patch.object(m, 'verified_sources', side_effect=AssertionError('must not import')):
            self.assertFalse(m.main(args())['serverMutation'])

    def test_prefix_scope_and_reset_are_exact(self):
        text = m.dropin(args())
        self.assertEqual(str(m.DROPIN), '/etc/systemd/system/morphiume-runtime-preview-.service.d/10-e4-verified-lease.conf')
        self.assertIn('ExecStart=\nExecStart=/usr/bin/python3 -I -B -X', text)
        self.assertEqual(text.count('ExecStartPre=/usr/bin/test'), 2)
        self.assertIn('--unit %n --execute', text)
        for forbidden in ('enable', 'Restart=', '[Timer]', 'CPUQuota=', 'MemoryMax=', 'TimeoutStartSec=', 'preview.py expire', 'DATABASE_URL'):
            self.assertNotIn(forbidden, text)

    def test_renderer_stdout_exact_no_extra_blank_line(self):
        a = args()
        result = subprocess.run([sys.executable, m.__file__, '--tool-sha256', a.tool_sha256,
            '--tool-source-commit', a.tool_source_commit, '--ops-root', a.ops_root, '--render-dropin'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0); self.assertEqual(result.stdout, m.dropin(a))

    def test_invalid_args_and_unit_injection_rejected(self):
        for field, value in [('tool_sha256', 'x'), ('tool_source_commit', '../x'), ('ops_root', '/tmp/ambient')]:
            a = args(); setattr(a, field, value)
            with self.subTest(field=field), self.assertRaises(ValueError): m.dropin(a)
        for unit in ('morphiume-runtime-backup.service', UNIT.upper(), 'morphiume-runtime-preview-x.service', UNIT + ';rm'):
            with self.subTest(unit=unit), self.assertRaises(ValueError): m.command(args(), unit)

    def test_all21_current_frozen_bytes_pass(self):
        base = Path(m.__file__).parent
        sources = {name:(base/name).read_bytes().replace(b'\r\n', b'\n') for name in m.OPS_FILES}
        manifest = {name:m.sha(data) for name,data in sources.items()}
        m.verify_manifest(manifest, sources)

    def test_incomplete_unknown_tampered_manifest_rejected(self):
        sources = dict.fromkeys(m.OPS_FILES, b'test source')
        manifest = {name:m.sha(data) for name,data in sources.items()}
        for change in ('missing', 'extra', 'tamper', 'wrong-bundle'):
            s = dict(sources); h = dict(manifest)
            if change == 'missing': s.pop('runtime/contract.py')
            if change == 'extra': h['runtime/unknown.py'] = 'a' * 64
            if change == 'tamper': s['runtime/preview.py'] = b'changed'
            with self.subTest(change=change), self.assertRaises(ValueError): m.verify_manifest(h,s)

    def test_duplicate_json_properties_and_nonfinite_rejected(self):
        for value in ('{"a":1,"a":2}', '{"a":NaN}'):
            with self.assertRaises(ValueError): m.parse(value)
        with self.assertRaises(ValueError): m.properties('User=root\nUser=root')

    def test_effective_positive_and_ignored_blank_separators(self):
        value = effective(args()); m.validate_effective(value,args(),INVOCATION)
        self.assertEqual(m.properties('\n'+ '\n\n'.join(k+'='+v for k,v in value.items())),value)

    def test_effective_shadow_env_alias_timeout_restart_invocation_rejected(self):
        for key,value in [('DropInPaths',str(m.DROPIN)+' /run/shadow.conf'), ('EnvironmentFiles','/private/env'),
            ('Names',UNIT+' alias.service'), ('TimeoutStartUSec','3min'), ('Restart','always'), ('InvocationID','c'*32), ('User','other'), ('ActiveState','inactive')]:
            x=effective(args());x[key]=value
            with self.subTest(key=key), self.assertRaises(ValueError):m.validate_effective(x,args(),INVOCATION)

    def test_effective_direct_old_command_or_ignored_error_rejected(self):
        for change in ('old', 'ignore', 'duplicate', 'unknown'):
            x=effective(args())
            if change=='old':x['ExecStart']=x['ExecStart'].replace(' '.join(m.command(args(),UNIT)),'/usr/bin/python3 frozen/preview.py expire')
            if change=='ignore':x['ExecStart']=x['ExecStart'].replace('ignore_errors=no','ignore_errors=yes')
            if change=='duplicate':x['ExecStart']=x['ExecStart'].replace(' ; pid=0',' ; path=/usr/bin/python3 ; pid=0')
            if change=='unknown':x['ExecStart']=x['ExecStart'].replace(' ; pid=0',' ; secret=bad ; pid=0')
            with self.subTest(change=change),self.assertRaises(ValueError):m.validate_effective(x,args(),INVOCATION)

    def test_environment_drops_host_optins_and_credentials(self):
        with patch.dict(os.environ,{'DATABASE_URL':'not-a-real-connection','AUTH_SECRET':'not-a-real-key','PYTHONPATH':'/ambient','DOCKER_HOST':'remote'},clear=True):
            m.clean_environment(INVOCATION)
            self.assertEqual(set(os.environ),{'PATH','LANG','INVOCATION_ID'})

    def test_verified_source_loader_ignores_cached_module(self):
        # Execute verified bytes directly; an ambient alias must fail instead of being reused.
        with patch.dict(sys.modules,{'contract':SimpleNamespace(untrusted=True)}):
            with self.assertRaises(ValueError):m.import_verified({})

    def test_cache_guard_existing_and_dangling_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent=Path(directory);prefix=parent/'unused-bytecode-cache';prefix.mkdir()
            with self.assertRaises(ValueError):m.cache_guard(parent)
            prefix.rmdir();prefix.symlink_to(parent/'missing')
            with self.assertRaises(ValueError):m.cache_guard(parent)

    def test_verified_bytes_ignore_timestamp_valid_stale_pyc(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(sys,'pycache_prefix',None):
            parent=Path(directory);(parent/'runtime').mkdir();file=parent/'runtime/contract.py'
            old="VALUE='old'\ndef ops_digest(): return '"+m.OPS+"'\n"
            new=old.replace("'old'","'new'")
            file.write_text(old);stamp=file.stat().st_mtime;py_compile.compile(str(file),doraise=True)
            file.write_text(new);os.utime(file,(stamp,stamp))
            control=importlib.util.spec_from_file_location('stale_control',file)
            baseline=importlib.util.module_from_spec(control);control.loader.exec_module(baseline)
            self.assertEqual(baseline.VALUE,'old')
            sources={'runtime/contract.py':new.encode(),**{'runtime/'+name+'.py':b'VERIFIED=True\n' for name in ('backup','upgrade','preview')}}
            with patch.object(m,'BUNDLE',parent),patch.dict(sys.modules):
                for name in ('contract','backup','upgrade','preview'):sys.modules.pop(name,None)
                m.cache_guard(parent)
                c,_=m.import_verified(sources)
                self.assertEqual(c.VALUE,'new');self.assertFalse((parent/'unused-bytecode-cache').exists())

    def test_main_verifies_once_before_import_and_dispatch(self):
        a=args();a.execute=True;order=[]
        with patch.dict(os.environ,{'INVOCATION_ID':INVOCATION},clear=True), \
            patch.object(m,'verified_sources',side_effect=lambda _:(order.append('verify') or (Path('/verified'),{}))), \
            patch.object(m,'clean_environment',side_effect=lambda _:order.append('clean')), \
            patch.object(m,'import_verified',side_effect=lambda _:(order.append('import') or ('c','p'))), \
            patch.object(m,'dispatch',side_effect=lambda *_:(order.append('dispatch') or {'mode':'safe'})):
            self.assertEqual(m.main(a),{'mode':'safe'})
        self.assertEqual(order,['verify','clean','import','dispatch'])

    def check_state(self,x=None,when='2026-10-13T10:20:00.100000Z'):
        x=x or state()
        with patch.object(m,'metadata',side_effect=lambda path,*_:Path(path)):
            return m.validate_state(C(x),x,UNIT,m.timestamp(when))

    def test_calendar_fractional_tick_matches_frozen_schedule(self):self.check_state()
    def test_future_pending_cannot_expire(self):
        with self.assertRaises(ValueError):self.check_state(when='2026-10-13T10:19:59.999999Z')
    def test_accepted_and_rolledback_are_safe_noop_candidates(self):
        for phase in ('accepted','rolled-back'):
            x=state();x['phase']=phase;self.check_state(x,'2026-10-13T10:00:01Z')
    def test_wrong_transaction_source_engine_origin_and_phase_rejected(self):
        for change in ('transaction','source','engine','origin','phase','rollback'):
            x=state()
            if change=='transaction':x['transaction']=str(m.ROOT/'metrics/preview-20261013T100000Z-ffffffffffff')
            if change=='source':x['candidate']['sourceCommit']='d'*40
            if change=='engine':x['previous']['runtimeImageId']='sha256:'+'e'*64
            if change=='origin':x['candidate']['origin']='http://localhost:3100'
            if change=='phase':x['phase']='failed-closed-recovery-required'
            if change=='rollback':x['dataRollback']=True
            with self.subTest(change=change),self.assertRaises(ValueError):self.check_state(x)

    def action(self,fail=False,phase='native-acceptance-pending',drift=False,replay=False,withdrawal_failure=False):
        a=args();x=state();x['phase']=phase;c=C(x);calls=[]
        p=SimpleNamespace(lease_units=lambda _:('morphiume-runtime-preview-012345abcdef','exact generated service','exact generated timer'))
        def expire(actual):
            calls.append(actual)
            if fail:raise ValueError('private config must not escape')
            if phase!='native-acceptance-pending':return {'mode':'lease-completed-no-op'}
            return {'mode':'expired-preview-withdrawn','recoveryFailures':['writer-stop-failed'] if withdrawal_failure else []}
        p.expire=expire
        def text(path,*_,**__):
            if str(path)=='/proc/1/comm':return 'systemd\n'
            if str(path).endswith('.service'):return 'drifted' if drift else 'exact generated service'
            return 'exact generated timer'
        with patch.object(m,'metadata',side_effect=lambda path,*_:Path(path)),patch.object(m.os,'getppid',return_value=1), \
            patch.object(Path,'read_text',new=text),patch.object(Path,'read_bytes',return_value=json.dumps(x).encode()):
            if fail or drift or withdrawal_failure:
                with self.assertRaises(ValueError):m.dispatch(a,c,p,INVOCATION,m.timestamp('2026-10-13T10:20:01Z'))
            else:
                result=m.dispatch(a,c,p,INVOCATION,m.timestamp('2026-10-13T10:20:01Z'))
                self.assertTrue(result['auditRetained']);self.assertFalse(result['dataRollback'])
                if replay:
                    with self.assertRaises(FileExistsError):m.dispatch(a,c,p,INVOCATION,m.timestamp('2026-10-13T10:20:02Z'))
        self.assertEqual(len(calls),0 if drift else 1)
        self.assertTrue(all(command[:2]==['systemctl','show'] for command in c.calls))
        if fail or withdrawal_failure:
            self.assertTrue(any(path.endswith('-failed.json') for path in c.files))
        if withdrawal_failure:
            self.assertFalse(any(path.endswith('-completed.json') for path in c.files))
            record=next(json.loads(body) for path,body in c.files.items() if path.endswith('-failed.json'))
            self.assertEqual(record['recoveryFailures'],['writer-stop-failed'])
        return c

    def test_expired_dispatch_calls_only_original_expire_once(self):self.action()
    def test_accepted_dispatch_noop(self):self.action(phase='accepted')
    def test_rolledback_dispatch_noop(self):self.action(phase='rolled-back')
    def test_callback_failure_redacted_evidence_and_no_retry(self):self.action(fail=True)
    def test_withdrawal_mode_with_recovery_failure_is_failure_not_acceptance(self):self.action(withdrawal_failure=True)
    def test_changed_base_unit_blocks_action(self):self.action(drift=True)
    def test_same_invocation_replay_blocked(self):self.action(replay=True)


if __name__=='__main__':unittest.main(verbosity=2)
