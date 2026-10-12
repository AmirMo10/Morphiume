# Staging monitoring and alert contract

`deploy/staging/check-health.py` performs a read-only snapshot and emits sanitized JSON. It does not install a scheduler, send notifications, acknowledge an alert, inspect environment values or read request/customer/payment payloads. The business owner still needs to select a recipient/channel and incident owner; delivery is unverified until an authorized synthetic failure is received there.

Run on the server after the relevant verified source is installed:

```sh
python3 /opt/morphiume/deploy/staging/check-health.py
python3 /opt/morphiume/deploy/staging/check-health.py --expect-app --expect-backups
```

The first command expects only the intentionally running staging DB. The second expects app/worker/DB health, HTTP readiness and a completed logical backup within26h. Exit0 means healthy,1 warning,2 critical. Docker inspection returns only names/service/health/status/restart count/OOM/exit code, never container environment or health-log output. Filesystem usage covers root, Docker/staging storage and the reserved database mount through read-only statistics. Initial thresholds are configurable with `--disk-warning-percent`, `--disk-critical-percent`, `--memory-warning-percent`, `--backup-max-age-hours` and `--queue-warning-seconds`; they are operating starting points, not measured capacity.

| Condition | Initial severity | Evidence and response |
| --- | --- | --- |
| Expected service missing/not healthy, readiness unavailable | Critical | Inspect sanitized health, DB connectivity and redacted logs; respect planned maintenance mode |
| OOM state | Critical | Preserve memory/container evidence, stop new heavy work if needed, inspect limits before restarting |
| Container restart history | Warning | Cumulative count is history; compare changes over time before attributing a new incident |
| Disk usage >=80% / >=90% | Warning / critical | Verify the affected filesystem and reviewed log/image/backup retention; never delete DB/WAL files |
| Host available RAM <10% | Warning | Correlate host/container/swap metrics with the active workload; tune after measurement |
| Dead outbox jobs when app/worker expected | Critical | Backend reviews dedupe/reconciliation and retry cause; no blind replay or paid-state change |
| Oldest pending job >600s when worker expected | Warning | Starting threshold only; record the queue baseline and tune from real drain/capacity results |
| Logical backup absent/older than26h when expected | Critical | Review backup exit/manifest and take authorized recovery action; this check proves neither decryption nor offsite/PITR protection |

The predeployment baseline contains pending synthetic jobs while no worker is expected. These are not load-generated backlog and do not establish worker failure. Record queue depth/oldest age immediately before and after worker startup, then compare with the measured load run. Delayed PSP/SMS verification and spend need provider/account-specific alerting; no real provider connection is claimed.

For the 200VU/RPS run, QA's external Windows collector records container CPU/memory/network/IO and sanitized PG activity/locks/queue every15s. `deploy/staging/monitor.py` complements it with host RAM/swap/load and aggregate order/receipt/shipment counts. Run them only for the actual agreed interval, retain exact source/image/start/end timestamps and distinguish missing samples from zero usage. Health snapshots alone do not establish request latency, traffic capacity or operational alert delivery.

## Prepared schedules and actual evidence

Reviewable units are in `deploy/staging/systemd`: a one-minute local health timer and a daily03:00UTC encrypted logical-backup timer with random delay. They are not installed/enabled. Installation requires a successful actual restore and the coordinator's verified image dispatch; use DB-only expected mode during planned app/worker downtime. Their journal output/failed exit is local technical evidence, not delivered business-owner alerting. The backup script serializes all callers with a dedicated lock; its lock file exists after the required rehearsal. Preparation, deployment, backup and restore scripts assert the exact reserved mount source/filesystem plus staging path resolution before writing.

Actual DB-only health smoke on2026-10-12 returned exit0/healthy with only the DB expected and running. Snapshot showed synthetic pending136/dead0/oldest~8524s before worker/load; it generated no false app/worker alerts. The15s complementary collector completed at `/srv/morphiume/staging/metrics/predeploy-health-smoke-20261012.jsonl`. Exact reserved source `/dev/mapper/vg0-lv--2` and ext4 checks passed before the probes. A deliberate worker-stop/recover alert drill has not yet run; it follows verified app deployment.
