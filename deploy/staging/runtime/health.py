"""Sanitized runtime-only read-only metrics and local alert evaluation."""
import argparse
import datetime
import json
import os
import subprocess
import urllib.request

import contract as c

DEFAULTS = {'diskWarningPercent': 80, 'diskCriticalPercent': 90, 'availableMemoryWarningPercent': 10,
            'queueWarningSeconds': 600, 'logicalBackupMaxAgeHours': 26}


def evaluate(facts, mode, expect_backups=False, thresholds=None):
    if mode not in ('prepared', 'running', 'maintenance'):
        raise ValueError('Choose an explicit expected-service mode')
    thresholds = DEFAULTS | (thresholds or {})
    if not 0 < thresholds['diskWarningPercent'] < thresholds['diskCriticalPercent'] <= 100 or not 0 < thresholds['availableMemoryWarningPercent'] < 100 or thresholds['queueWarningSeconds'] < 30 or not 0 < thresholds['logicalBackupMaxAgeHours'] <= 168:
        raise ValueError('Invalid configurable staging alert thresholds')
    alerts = []
    def alert(severity, code, observed=None):
        alerts.append({'severity': severity, 'code': code, 'observed': observed})
    if not facts.get('databaseHealthy'): alert('critical', 'existing_staging_database_unhealthy')
    for path, percent in facts.get('diskUsedPercent', {}).items():
        if percent >= thresholds['diskCriticalPercent']: alert('critical', 'disk_usage', {'path': path, 'usedPercent': percent})
        elif percent >= thresholds['diskWarningPercent']: alert('warning', 'disk_usage', {'path': path, 'usedPercent': percent})
    if facts.get('availableMemoryPercent', 100) < thresholds['availableMemoryWarningPercent']: alert('warning', 'host_memory_low', facts['availableMemoryPercent'])
    for service in ('app', 'worker'):
        items = [item for item in facts.get('containers', []) if item['service'] == service]
        if any(item.get('engineIdentityMatches') is False for item in items): alert('critical', 'runtime_engine_identity_changed', service)
        if mode == 'running':
            if len(items) != 1 or items[0]['status'] != 'running' or items[0]['health'] != 'healthy': alert('critical', 'runtime_service_unhealthy', service)
            if items and items[0]['oomKilled']: alert('critical', 'runtime_oom', service)
            if items and items[0]['restarts']: alert('warning', 'runtime_restart_history', {'service': service, 'count': items[0]['restarts']})
        elif any(item['status'] == 'running' for item in items): alert('critical', 'unexpected_runtime_writer', service)
    if mode == 'running' and facts.get('appReadiness') != 200: alert('critical', 'runtime_app_not_ready')
    queue = facts.get('database')
    if mode != 'prepared' and (not queue or queue.get('database') != c.DATABASE): alert('critical', 'runtime_database_probe_failed')
    elif mode == 'running' and queue:
        if queue['dead']: alert('critical', 'runtime_dead_jobs', queue['dead'])
        if queue['oldestPendingSeconds'] > thresholds['queueWarningSeconds']: alert('warning', 'runtime_queue_age', queue['oldestPendingSeconds'])
    age = facts.get('lastLogicalBackupAgeSeconds')
    if expect_backups and (age is None or age > thresholds['logicalBackupMaxAgeHours'] * 3600): alert('critical', 'runtime_logical_backup_missing_or_old', age)
    return facts | {'scope': c.PROJECT, 'expectedServiceMode': mode, 'expectLogicalBackups': expect_backups,
                    'thresholds': thresholds, 'alerts': alerts, 'notificationDelivery': 'local-only-not-configured',
                    'status': 'critical' if any(item['severity'] == 'critical' for item in alerts) else 'warning' if alerts else 'healthy'}


def snapshot(mode, expect_backups=False, thresholds=None):
    c.assert_boundaries()
    facts = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'containers': [], 'databaseHealthy': False, 'diskUsedPercent': {}}
    profile = c.active_profile()
    if mode != 'prepared' and not profile: raise ValueError('An explicit proven active profile is required for runtime monitoring')
    if profile:
        c.load_configs()
        facts['accessProfile'] = profile['profile']
        facts['canonicalOrigin'] = profile['origin']
        if mode != 'prepared':
            proven = c.deployed_image()
            facts['runtimeImageId'] = c.runtime_image(proven)
            facts['testedPlatformConfig'] = proven['testedPlatformConfig']
    try: c.db_container(); facts['databaseHealthy'] = True
    except (OSError, ValueError, KeyError): pass
    for path in ('/', '/var/lib/docker', str(c.ROOT)):
        usage = os.statvfs(path)
        facts['diskUsedPercent'][path] = round(100 * (1 - usage.f_bavail / usage.f_blocks), 2)
    memory = {}
    for line in __import__('pathlib').Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'): memory[key + 'KiB'] = int(value.split()[0])
    facts['hostMemory'] = memory
    facts['availableMemoryPercent'] = round(100 * memory['MemAvailableKiB'] / memory['MemTotalKiB'], 2)
    facts['loadAverage'] = __import__('pathlib').Path('/proc/loadavg').read_text().split()[:3]
    ids = c.run(['docker', 'ps', '--all', '--filter', 'label=com.docker.compose.project=' + c.PROJECT, '--format', '{{.ID}}']).splitlines()
    if ids:
        for item in json.loads(c.run(['docker', 'inspect', *ids])):
            facts['containers'].append({'service': item['Config']['Labels'].get('com.docker.compose.service'), 'status': item['State']['Status'],
                'health': item['State'].get('Health', {}).get('Status', 'absent'), 'oomKilled': item['State']['OOMKilled'], 'restarts': item['RestartCount'],
                'engineIdentityMatches': 'runtimeImageId' not in facts or item['Image'] == facts['runtimeImageId'] and item['Config']['User'] == '1001:1001' and item['Config']['Labels'].get('org.opencontainers.image.revision') == profile['sourceCommit']})
    stats = c.run(['docker', 'stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.PIDs}}'])
    facts['containerResourceSample'] = [line for line in stats.splitlines() if line.startswith((c.PROJECT + '-', c.DB_CONTAINER + '|'))]
    if mode != 'prepared':
        try:
            facts['database'] = json.loads(c.psql(c.DATABASE, """BEGIN READ ONLY; SET LOCAL statement_timeout='3s'; SELECT jsonb_build_object(
              'database',current_database(),'connections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()),
              'active',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active'),
              'waiting',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),
              'ungrantedLocks',(SELECT count(*) FROM pg_locks WHERE NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())),
              'pending',(SELECT count(*) FROM outbox_job WHERE status IN ('pending','running')),
              'dead',(SELECT count(*) FROM outbox_job WHERE status='dead'),
              'oldestPendingSeconds',(SELECT coalesce(extract(epoch FROM clock_timestamp()-min(created_at)),0) FROM outbox_job WHERE status IN ('pending','running'))
            ); COMMIT;"""))
        except (OSError, ValueError, KeyError): facts['database'] = None
    if mode == 'running':
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=5) as response: facts['appReadiness'] = response.status
        except OSError: facts['appReadiness'] = 'unavailable'
    completed = []
    for file in (c.ROOT / 'backups').glob('*/backup-manifest.json'):
        try:
            value = json.loads(c.private_file(file).read_text())
            if value['database'] == c.DATABASE:
                completed.append(datetime.datetime.fromisoformat(value['backupCompleteUtc']))
        except (OSError, ValueError, KeyError): pass
    facts['lastLogicalBackupAgeSeconds'] = (datetime.datetime.now(datetime.timezone.utc) - max(completed)).total_seconds() if completed else None
    return evaluate(facts, mode, expect_backups, thresholds)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('prepared', 'running', 'maintenance'), required=True)
    parser.add_argument('--expect-backups', action='store_true')
    parser.add_argument('--queue-warning-seconds', type=int, default=600)
    parser.add_argument('--backup-max-age-hours', type=float, default=26)
    args = parser.parse_args()
    try:
        value = snapshot(args.mode, args.expect_backups, {'queueWarningSeconds': args.queue_warning_seconds, 'logicalBackupMaxAgeHours': args.backup_max_age_hours})
        print(json.dumps(value)); raise SystemExit({'healthy': 0, 'warning': 1, 'critical': 2}[value['status']])
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print(json.dumps({'scope': c.PROJECT, 'status': 'critical', 'code': 'runtime_probe_failed', 'notificationDelivery': 'local-only-not-configured'}))
        raise SystemExit(2) from None
