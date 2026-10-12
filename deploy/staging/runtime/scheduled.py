"""Local-only timer entrypoint, gated on a real restore and explicit approval."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from types import SimpleNamespace

import backup
import contract as c
import health
import restore

CHECKS = {'nativeLogin', 'ownedOrder', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}


def validate_acceptance(approval, evidence, release):
    if not isinstance(approval, dict) or approval.get('mode') != 'quiesce-runtime-only' or approval.get('sharedDatabaseWindowReleased') is not True:
        raise ValueError('Runtime scheduling approval is absent or incompatible')
    if any(approval.get(key) != release[key] for key in ('sourceCommit', 'testedPlatformConfig', 'opsSha256')):
        raise ValueError('Runtime scheduling approval differs from reviewed release')
    if release.get('accessProfileSha256') and approval.get('accessProfileSha256') != release['accessProfileSha256']:
        raise ValueError('Timer approval must explicitly bind the current canonical profile')
    if not isinstance(evidence, dict) or set(evidence.get('checks', {})) != CHECKS or not all(value is True for value in evidence['checks'].values()):
        raise ValueError('Actual native restore business acceptance is incomplete')
    if not evidence.get('acceptedUtc') or evidence.get('sourceCommit') != release['sourceCommit'] or evidence.get('testedPlatformConfig') != release['testedPlatformConfig']:
        raise ValueError('Restore acceptance differs from the accepted runtime')
    for key in ('observedRtoSeconds', 'observedRecoveryPointGapSeconds'):
        if type(evidence.get(key)) not in (int, float) or not math.isfinite(evidence[key]) or evidence[key] < 0:
            raise ValueError('Observed recovery timing is required; proposed targets are insufficient')


def main(action, apply=False):
    if not apply:
        return {'mode': 'unexecuted-plan', 'action': action, 'scope': c.PROJECT, 'notificationDelivery': 'local-only-not-configured'}
    c.assert_boundaries()
    if (c.CONFIG / 'preview-transition.json').exists():
        state = json.loads(c.private_file(c.CONFIG / 'preview-transition.json').read_text())
        if state.get('phase') not in ('accepted', 'rolled-back'): raise ValueError('Scheduling is closed during partial preview/native acceptance')
    approval = json.loads(c.private_file(c.CONFIG / 'schedule-approved.json').read_text())
    deployed = json.loads(c.private_file(c.CONFIG / 'deployed-release.json').read_text())
    evidence_path = c.exact_path(Path(approval.get('restoreEvidence', '')))
    restore.validate_restore_path(evidence_path.parent)
    if evidence_path.name != 'recovery-accepted.json': raise ValueError('Use exact runtime restore acceptance evidence')
    evidence = json.loads(c.private_file(evidence_path).read_text())
    validate_acceptance(approval, evidence, deployed)
    if c.ops_digest() != deployed['opsSha256']: raise ValueError('Scheduled ops bundle fingerprint changed')
    if action == 'health':
        result = health.snapshot('running', expect_backups=True)
        return result
    args = SimpleNamespace(source=deployed['sourceCommit'], config_id=deployed['testedPlatformConfig'],
                           manifest_digest=deployed['candidateManifestDigest'], archive_sha256=deployed['archiveSha256'],
                           ops_sha256=deployed['opsSha256'], quiescent_window_released=True, apply=True)
    c.verify_release(args)
    with c.lock():
        c.db_container(); c.load_configs()
        ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
        actual = json.loads(c.run(['docker', 'inspect', *ids])) if ids else []
        if {item['Config']['Labels'].get('com.docker.compose.service') for item in actual} != {'app', 'worker'} or any(item['Image'] != args.config_id or not item['State']['Running'] or item['State'].get('Health', {}).get('Status') != 'healthy' for item in actual):
            raise ValueError('Scheduled backup starts only from the verified healthy runtime pair')
        command = c.compose(args.config_id)
        # Only this namespace's two writers are paused; original DB/container,
        # configs and data are untouched. The shared release lock spans recovery.
        try:
            c.run(command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            result = backup.main(args, locked=True)
        finally:
            # Even a failed backup must attempt to restore the exact prior writer
            # pair. Failure remains a failed service requiring operator action.
            c.run(command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app', 'worker'], timeout=210)
        return result | {'runtimeWritersResumed': True, 'notificationDelivery': 'local-only-not-configured'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('health', 'backup'))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        report = main(args.action, args.apply)
        print(json.dumps(report))
        raise SystemExit({'healthy': 0, 'warning': 1, 'critical': 2}.get(report.get('status'), 0))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print(json.dumps({'scope': c.PROJECT, 'status': 'critical', 'code': 'runtime_schedule_gated_or_failed', 'notificationDelivery': 'local-only-not-configured'}))
        raise SystemExit(2) from None
