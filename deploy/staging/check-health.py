"""Read-only, sanitized staging checks; no external notifications or scheduler."""
import argparse
import datetime
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


def command(arguments):
    try:
        result = subprocess.run(arguments, capture_output=True, text=True, timeout=12)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def snapshot(expect_app=False, expect_backups=False, queue_warning=600, disk_warning=80, disk_critical=90, memory_warning=10, backup_age_hours=26):
    now = datetime.datetime.now(datetime.timezone.utc)
    result = {'utc': now.isoformat(), 'scope': 'morphiume-staging',
              'expectAppWorker': expect_app, 'expectLogicalBackups': expect_backups,
              'notificationDelivery': 'not-configured', 'alerts': [], 'containers': [], 'disks': {},
              'thresholds': {'diskWarningPercent': disk_warning, 'diskCriticalPercent': disk_critical,
                             'availableMemoryWarningPercent': memory_warning, 'logicalBackupMaxAgeHours': backup_age_hours,
                             'queueWarningSeconds': queue_warning}}

    def alert(severity, code, observed=None):
        event = {'severity': severity, 'code': code}
        if observed is not None:
            event['observed'] = observed
        result['alerts'].append(event)

    for directory in ('/', '/var', '/srv/morphiume/staging', '/srv/morphiume/postgres'):
        try:
            usage = os.statvfs(directory)
            percent = round(100 * (1 - usage.f_bavail / usage.f_blocks), 2)
            result['disks'][directory] = {'usedPercent': percent}
            if percent >= disk_critical:
                alert('critical', 'disk_usage', {'path': directory, 'usedPercent': percent})
            elif percent >= disk_warning:
                alert('warning', 'disk_usage', {'path': directory, 'usedPercent': percent})
        except OSError:
            alert('critical', 'filesystem_unavailable', directory)

    memory = {}
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, value = line.split(':', 1)
            if key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'):
                memory[key + 'KiB'] = int(value.split()[0])
        available_percent = round(100 * memory['MemAvailableKiB'] / memory['MemTotalKiB'], 2)
        result['hostMemory'] = memory | {'availablePercent': available_percent}
        if available_percent < memory_warning:
            alert('warning', 'host_memory_low', available_percent)
    except (OSError, ValueError, KeyError):
        alert('warning', 'host_memory_probe_failed')

    names = command(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=morphiume-staging', '--format', '{{.Names}}'])
    if names is None:
        alert('critical', 'docker_probe_failed')
    else:
        template = ('{"name":{{json .Name}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
                    '"status":{{json .State.Status}},"oomKilled":{{json .State.OOMKilled}},'
                    '"restarts":{{json .RestartCount}},"exitCode":{{json .State.ExitCode}},'
                    '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"absent"{{end}}}')
        containers = command(['docker', 'inspect', '--format', template, *names.splitlines()]) if names else ''
        try:
            result['containers'] = [json.loads(line) for line in containers.splitlines()] if containers is not None else []
        except (ValueError, AttributeError):
            alert('critical', 'container_probe_failed')
        expected = ('db', 'app', 'worker') if expect_app else ('db',)
        for service in expected:
            matches = [item for item in result['containers'] if item['service'] == service]
            if len(matches) != 1:
                alert('critical', 'expected_service_missing', service)
                continue
            container = matches[0]
            if container['status'] != 'running' or container['health'] != 'healthy':
                alert('critical', 'service_not_healthy', {'service': service, 'status': container['status'], 'health': container['health']})
            if container['oomKilled']:
                alert('critical', 'container_oom', service)
            if container['restarts']:
                alert('warning', 'container_restart_history', {'service': service, 'count': container['restarts']})

    query = """SELECT jsonb_build_object(
      'pending',(SELECT count(*) FROM outbox_job WHERE status IN ('pending','running')),
      'dead',(SELECT count(*) FROM outbox_job WHERE status='dead'),
      'oldestPendingSeconds',(SELECT coalesce(extract(epoch FROM clock_timestamp()-min(created_at)),0) FROM outbox_job WHERE status IN ('pending','running'))
    );"""
    queue = command(['docker', 'compose', '--project-name', 'morphiume-staging', '-f', '/opt/morphiume/deploy/staging/compose.db.yaml',
                     'exec', '-T', 'db', 'psql', '-U', 'morphiume_staging_owner', '-d', 'morphiume_staging', '-X', '-At', '-c', query])
    try:
        result['queue'] = json.loads(queue) if queue else None
        if not result['queue']:
            alert('critical', 'queue_probe_failed')
        elif expect_app:
            if result['queue']['dead']:
                alert('critical', 'dead_outbox_jobs', result['queue']['dead'])
            if result['queue']['oldestPendingSeconds'] > queue_warning:
                alert('warning', 'outbox_age', result['queue']['oldestPendingSeconds'])
    except (ValueError, TypeError, KeyError):
        alert('critical', 'queue_probe_failed')

    if expect_app:
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=5) as response:
                result['appReadiness'] = response.status
                if response.status != 200:
                    alert('critical', 'app_readiness_failed')
        except (OSError, urllib.error.URLError):
            result['appReadiness'] = 'unavailable'
            alert('critical', 'app_readiness_failed')

    completed = []
    for file in Path('/srv/morphiume/staging/backups').glob('*/backup-complete-utc'):
        if (file.parent / 'SHA256SUMS').is_file():
            try:
                completed.append(datetime.datetime.fromisoformat(file.read_text().strip().replace('Z', '+00:00')))
            except (OSError, ValueError):
                continue
    age = (now - max(completed)).total_seconds() if completed else None
    result['lastCompletedLogicalBackupAgeSeconds'] = age
    if expect_backups and (age is None or age > backup_age_hours * 3600):
        alert('critical', 'logical_backup_missing_or_old', age)
    result['status'] = 'critical' if any(item['severity'] == 'critical' for item in result['alerts']) else 'warning' if result['alerts'] else 'healthy'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--expect-app', action='store_true', help='Require running app/worker and app readiness; omit for intentional DB-only operation')
    parser.add_argument('--expect-backups', action='store_true', help='Require a completed local logical backup in the last26h; does not verify offsite/PITR')
    parser.add_argument('--queue-warning-seconds', type=int, default=600)
    parser.add_argument('--disk-warning-percent', type=float, default=80)
    parser.add_argument('--disk-critical-percent', type=float, default=90)
    parser.add_argument('--memory-warning-percent', type=float, default=10)
    parser.add_argument('--backup-max-age-hours', type=float, default=26)
    args = parser.parse_args()
    if args.queue_warning_seconds < 30:
        parser.error('Queue warning must be at least30 seconds')
    if not 0 < args.disk_warning_percent < args.disk_critical_percent <= 100 or not 0 < args.memory_warning_percent < 100 or not 0 < args.backup_max_age_hours <= 168:
        parser.error('Require 0<disk warning<critical<=100, 0<memory warning<100 and backup age0-168h')
    report = snapshot(args.expect_app, args.expect_backups, args.queue_warning_seconds,
                      args.disk_warning_percent, args.disk_critical_percent, args.memory_warning_percent, args.backup_max_age_hours)
    print(json.dumps(report))
    raise SystemExit({'healthy': 0, 'warning': 1, 'critical': 2}[report['status']])
