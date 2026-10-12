"""Sample staging host/container/DB metrics without request or customer data."""
import argparse
import datetime
import json
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--duration', type=int, default=1800)
parser.add_argument('--interval', type=int, default=15)
parser.add_argument('--output', required=True)
args = parser.parse_args()
if not 1 <= args.duration <= 3600 or not 5 <= args.interval <= 60:
    raise SystemExit('Use duration1-3600s and interval5-60s.')
output = Path(args.output).resolve()
if not output.is_relative_to(Path('/srv/morphiume/staging/metrics')):
    raise SystemExit('Metrics output must be under staging/metrics.')
output.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
query = '''SELECT jsonb_build_object(
 'connections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()),
 'active',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active'),
 'waiting',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),
 'ungrantedLocks',(SELECT count(*) FROM pg_locks WHERE NOT granted),
 'pendingJobs',(SELECT count(*) FROM outbox_job WHERE status IN ('pending','running')),
 'deadJobs',(SELECT count(*) FROM outbox_job WHERE status='dead'),
 'oldestPendingSeconds',(SELECT coalesce(extract(epoch from clock_timestamp()-min(created_at)),0) FROM outbox_job WHERE status IN ('pending','running')),
 'orders',(SELECT count(*) FROM orders),
 'receipts',(SELECT count(*) FROM payment_receipt),
 'shipments',(SELECT count(*) FROM shipment)
);'''

def command(arguments):
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=10)
    return result.stdout.strip() if result.returncode == 0 else None

deadline = time.monotonic()+args.duration
with output.open('x', encoding='utf-8') as log:
    output.chmod(0o600)
    while time.monotonic() < deadline:
        started = time.monotonic()
        memory = {}
        for line in Path('/proc/meminfo').read_text().splitlines():
            key,value = line.split(':',1)
            if key in ('MemTotal','MemAvailable','SwapTotal','SwapFree'):
                memory[key+'KiB'] = int(value.split()[0])
        database = command(['docker','compose','-f','/opt/morphiume/deploy/staging/compose.db.yaml','exec','-T','db','psql','-U','morphiume_staging_owner','-d','morphiume_staging','-X','-At','-c',query])
        containers = command(['docker','stats','--no-stream','--format','{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.PIDs}}'])
        sample = {'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'loadAverage':Path('/proc/loadavg').read_text().split()[:3],
                  'hostMemory':memory, 'containers':containers.splitlines() if containers else [],
                  'database':json.loads(database) if database else None}
        log.write(json.dumps(sample)+'\n'); log.flush()
        time.sleep(min(max(0,args.interval-(time.monotonic()-started)),max(0,deadline-time.monotonic())))
print(f'Staging metrics retained at {output}; no customer/request details collected.')
