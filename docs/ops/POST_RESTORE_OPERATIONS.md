# Accepted613 recovery and next operations under immutable Ops591

The coordinator completed the finite recovery using tool SHA256 `9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d`, published source `a89997232dd76fda69dd4177d1682e92c405683d`. QA passed all six restored native/business/media checks in33.8336788s, with first-attempt OTP send/verify200 and no restore worker. Protected business-result and recovery-accepted records are root600; their parent directories remain root700. These are supplied coordinator/QA execution results. During preparation, root separately authorized two bounded read-only health measurements: the quarter-core deadline failed, then the reviewed one-core probe completed healthy. Both results are retained below. No backup, approval, persistent unit, container/key/config change, restart or worker drill was performed by this agent.

| Actual milestone | UTC / result |
| --- | --- |
| Last retained durable business mutation | 2026-10-12T21:24:42.542062Z |
| Writer-free encrypted backup capture | 2026-10-12T21:26:44.545224Z |
| Original restore start, before the uppercase-project failure | 2026-10-12T21:27:29.611539Z |
| Six-check native acceptance started | 2026-10-12T22:22:29.174Z |
| Six-check business acceptance completed | 2026-10-12T22:23:03.008Z |
| Full observed RTO, including failure/diagnosis/review/publication/recovery | 3333.396461s |
| Retained-business-fixture-to-writer-free-capture gap | 122.003162s |
| Runtime app/worker resumed | 2026-10-12T22:31:04.930595Z; healthy/readiness200, UID1001 |

The measured gap describes this retained synthetic fixture and this logical capture. It does not establish general order-data RPO, PITR, offsite protection or the proposed15-minute recovery objective. The33.8336788s acceptance suite is not the full RTO. Parent session35483 exited0 after stopping exactly the restore pair, removing only the temporary RAM identity/file directory after owner/mode/link/hash guards, and resuming exactly the runtime pair. Restored data/journal/config remain retained; original data, encryption identity, history and secrets were not reset. Offsite protection remainsfalse.

## Exact old deployment and retained recovery mapping

The eight independent runtime bindings remain:

| Record field | Trusted value |
| --- | --- |
| sourceCommit | `6130f4ed7ec090344a5a4a1937a65ef04572975b` |
| testedPlatformConfig | `sha256:8a5600eeaafa7de6293aadc2807843f13b269244bb583e4d04e90295adbc1968` |
| candidateManifestDigest | `sha256:d5bb24a403247f4d42345bef6c9b7b9788a84962c6f44336167af832e3d5f9be` |
| archiveSha256 | `d6df8cd57720187fddbc47c279d9df306cc41620d304b270716a87ab196b6cb9` |
| opsSha256 | `591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db` |
| runtimeImageId | `sha256:ad5c0e3d9537e3380051d32528d2f07b9b804b5c9b73f1df7c2a69cc733a24c0` |
| engineProofSha256 | `c6f83e325dcae50f2f84bfac08b874850946f454325ba729bcc38953060bdad7` |
| accessProfileSha256 | `3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c` |

The protected native runtime is `http://localhost:3100`, project `morphiume-staging-runtime`, DB `morphiume_staging_runtime`. The restored native URL was `http://localhost:3101`, loopback upstream3002, DB `morphiume_staging_restore`. Preserve this exact journal-bound mapping:

```text
Docker project: morphiume-runtime-restore-20261012t212729z-d03c35
Physical root: /srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261012T212729Z-d03c35
Selected env:  PHYSICAL_ROOT/restore.recovery.env
Journal:       PHYSICAL_ROOT/recovery-journal.json
Acceptance:    PHYSICAL_ROOT/recovery-accepted.json
Backup:        /srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce
```

No case normalization, rename, first-only seed, restore replay, successor Ops adoption or broad cleanup is allowed. Old591's `restore.validate_restore_path` accepts this uppercase physical name, even though its Docker project had to be recovered separately. The future-only lowercase generator Ops4d626 deliberately rejects that physical name and must not be used to validate/schedule this old deployment.

The frozen server Ops root is:

```text
/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/ops-bundles/591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db/ops
```

The actual Windows loader is `S:/Morphiume-runtime-613/.local/operator-591/runtime/operator-config.mjs`. Its three protected inputs are `runtime-app.json`, `runtime-connections.json`, `runtime-profile.json` in **that tool's** `../.local/`, namely `S:/Morphiume-runtime-613/.local/operator-591/.local/`. It requires source/config/manifest/archive/Ops/profile flags in that order, then `--` and the exact613 QA command. Acknowledging Windows ACLs is allowed only after actual ACL review. It exposes app-scoped configuration to that child process, never owner/bootstrap credentials. Original15433 and runtime15434 remain separate. The generic loader/QA DB guard does not authorize the restore DB; the scoped recovery-journal harness supplied that acceptance.

Protected QA result: `S:/Morphiume-runtime-613/.local/restore-business-result-morphiume-runtime-restore-20261012t212729z-d03c35.json`, SHA256 `139f916c48f32308894025d002d91f287ff175d3e33549560c29344141aa3498`. The safe six-check report is [restore-business-summary.json](../qa/restore-business-summary.json); its marker=false describes the harness before the coordinator subsequently wrote the marker. Never overwrite/relabel that earlier report to imply the harness itself published acceptance.

## Scheduling record required before installation

`/etc/morphiume-staging-runtime/schedule-approved.json` is still uncreated/unapproved in this handoff. Root must exclusively create it after a newly released shared-database window and explicit schedule dispatch, root:root0600 under the existing0700 private parent. Its fields must include all eight values above plus:

```json
{
  "mode": "quiesce-runtime-only",
  "sharedDatabaseWindowReleased": true,
  "restoreEvidence": "/srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261012T212729Z-d03c35/recovery-accepted.json"
}
```

This snippet shows the additional fields; it is not a complete approval. The existing protected acceptance must match the seven release/Ops/engine identities, have the six **exact** true checks `nativeLogin`, `ownedOrder`, `paymentReceiptDedup`, `stockReservation`, `shipmentTracking`, `mediaHashes`, an actual acceptedUtc, and finite nonnegative observedRtoSeconds3333.396461/observedRecoveryPointGapSeconds122.003162. Approval also binds the current accessProfileSha256. Root separately reviews the marker's profile/fixture/result/journal/config hashes. Old591 scheduler checks those named release/check/timing fields and protected path; it does not replace the coordinator's independent evidence review or add a separate marker-file SHA gate.

`scheduled.py health --apply` and `scheduled.py backup --apply` are intentionally apply-gated entrypoints, despite health being observational. Default invocation without `--apply` prints only an unexecuted plan. Both import old591's restore validator; run only from the immutable root above. Pending preview transitions, changed profile/proof/Ops or absent approval fail closed. Backup holds `/srv/morphiume/staging/deploy.lock`, verifies the healthy two-writer pair, stops only that pair with30s grace, takes an encrypted backup, and attempts to resume the same pair even if backup fails. No first-deployment/migration/seed/original role action occurs. Its availability pause still needs real measurement.

## Python source/cache guard and real resource baseline

Use only a hash-verified old591 bundle, protected nonsymlink directories and the exact **nonexistent** cache prefix below; reject even a dangling symlink. Existing old `__pycache__` files are retained. Disabling writes alone does not prevent cached reads. The reviewed recovery stale-PYC test proved why the prefix redirection is necessary; Python documents the write suppression and separate cache tree controls. [Python3.12 command-line/environment reference](https://docs.python.org/3.12/using/cmdline.html).

```sh
task_ops_root='/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/ops-bundles/591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db/ops'
task_cache_prefix='/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/tools/9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d/unused-bytecode-cache'
test ! -e "$task_cache_prefix"
test ! -L "$task_cache_prefix"
```

These variable assignments are public identities, not secrets. Before any import, independently verify the canonical-LF OPS_FILES manifest against591 and protected exact parent ownership; do not import current working-tree contract/restore. Parent retains accepted archive/source/profile/proof unchanged. Manual entrypoints use `python3 -E -B -X "pycache_prefix=$task_cache_prefix" "$task_ops_root/runtime/health.py" --mode running --expect-backups`; `-E` ignores inherited Python overrides while explicit `-X` selects the reviewed prefix. Health reports sanitized JSON and exit0/1/2 for healthy/warning/critical.

**Actual one-probe result: the proposed deadline failed.** Root authorized exactly one fresh-runtime read-only health execution at CPU25%,256MiB,50s start deadline and5s stop ceiling, while original QA retained its native/business window. All21 old591 files matched the independently published canonical-LF manifest before any import; the exact protected cache prefix remained absent. Transient `morphiume-runtime-health-baseline-20261013-f30795f675.service` returned systemd-run exit1 after50.231034s, Result=timeout and SIGTERM status15. Sampled cgroup memory peak was32,800,768bytes, OOM/oom_kill both0. Termination preceded the health JSON/child timing result; final health status, alert counts and process peak RSS are **unavailable**. Cgroup peak is not a process-RSS measurement. The transient failed record is retained; there is no retry, cache deletion, budget change or application/service restart.

Private stdout/stderr evidence is the ACL-protected ignored `deploy/staging/.local/health-baseline-20261013-f30795f675.json`, SHA256 `7c15e1388e6b62e81fafe71ef5c44ff0af536260b2c314eb868cd792b3cad9df`; safe facts are [HEALTH_BASELINE_591.json](HEALTH_BASELINE_591.json). The exact timeout disproves completion under these configured caps, but does not locate the slow internal stage or prove unhealthy application/DB. Historical static four-unit verification does not override this failure.

**Separately authorized revised probe passed:** CPUQuota100% (one core of four),256MiB,120s deadline plus5s stop, same21 verified files/prefix/hardening and unchanged health command. Overall wall18.801830s, child health18.640249s; child userCPU16.008956s/systemCPU0.514308s, peakRSS46,080KiB. Sampled cgroup peak53,751,808bytes/CPU16.547230s, OOM0. Health exit0, healthy, zero alerts; unit resultsuccess/exit0 and transient unit was already unloaded/inactive. Private evidence `deploy/staging/.local/health-onecore-20261013-6d14bbd495.json` SHA256 `1f4238cbe214f6c3197ed8930e10de29584e3f2d966f0cac6f923d3c16588279`; [safe revised facts](HEALTH_ONECORE_591.json). This is a single measured read-only cost sample, not host/load capacity or a guaranteed interval. Original50s failure remains retained. Root's proposed **persistent health-only** config is CPUQuota100%,MemoryMax256MiB and the existing deadline50s. The120s deadline belongs only to the separately authorized cost probe. Actual `scheduled.py health --apply` performs another release proof before calling health, so direct-health timing does not prove the full scheduled service completes under50s. That full sandbox/approval measurement still needs released QA window and separate GO before installation. No persistent budget/timer is applied and no further probe is authorized by this recipe.

The following GNU time illustration was not executed; both actual probes used private Python timing/child-resource wrappers. It is not permission to repeat either probe. Any new observation needs root GO and a reviewed shared-resource window. A capped execution must retain timeout/OOM evidence. For example, after selecting an unused exact unit name and the guards above:

```sh
systemd-run --wait --pipe --unit=morphiume-runtime-health-baseline-20261013 \
  --property=Type=oneshot --property=User=root --property=UMask=0077 \
  --property=TimeoutStartSec=120s --property=TimeoutStopSec=5s \
  --property=MemoryMax=256M --property=CPUQuota=100% \
  --property=CPUAccounting=yes --property=MemoryAccounting=yes \
  --property=WorkingDirectory=/etc/morphiume-staging-runtime \
  --property=NoNewPrivileges=yes --property=PrivateTmp=yes \
  --property=ProtectHome=yes --property=ProtectSystem=strict \
  --setenv=PYTHONDONTWRITEBYTECODE=1 --setenv="PYTHONPYCACHEPREFIX=$task_cache_prefix" \
  /usr/bin/time -f 'wall_seconds=%e peak_rss_kib=%M command_exit=%x' \
  /usr/bin/python3 -B -X "pycache_prefix=$task_cache_prefix" \
  "$task_ops_root/runtime/health.py" --mode running --expect-backups
```

Use a unique separately reviewed unit suffix; do not reset/reuse failed evidence. Record cgroup peak/timeout/OOM metadata while the transient unit exists, plus any actual sanitized health result. GNU time/process peak RSS is not total host/container RAM; CPU quota bounds this operator process group, not Docker/PG daemons. A deadline overrun blocks installation until root reviews a measured config-only budget adjustment; it does not justify weakening identity reproof. The first actual deadline killed its wrapper before final RSS/health output. `systemd-run --wait` propagates completion and reports runtime; transient properties/setenv provide explicit probe limits. [Upstream systemd255 run reference](https://github.com/systemd/systemd/blob/v255/man/systemd-run.xml).

The prepared common drop-in [591-python-cache-guard.conf](../../deploy/staging/post-restore/591-python-cache-guard.conf), canonical-LF SHA256 `672e07d612751b0ce919d7900ad9c32528256ff7e9c82cfce36374dd67f113f7`, is **outside OPS_FILES**, configuration only, not installed. Install it separately as root0644 at each exact `morphiume-runtime-health.service.d/10-verified-python-source.conf` and `morphiume-runtime-backup.service.d/10-verified-python-source.conf` under `/etc/systemd/system`, with root-owned nonsymlink directories. It enforces PYTHONDONTWRITEBYTECODE=1, PYTHONPYCACHEPREFIX at that exact protected prefix and fails both exists/link prechecks. It removes Python path/home/startup/case overrides. Preserve the old unit ExecStart and bundle bytes; verify protected deploy.env contains only the existing reviewed identity/origin assignments, so it cannot override the guard environment. [Upstream systemd255 environment rules](https://github.com/systemd/systemd/blob/v255/man/systemd.exec.xml).

The separate prepared [591-health-budget.conf](../../deploy/staging/post-restore/591-health-budget.conf), canonical-LF SHA256 `ff3857c5919d36c7b12716d30c72613a6de8b2f580133b378b11fc2a4c1d2234`, may be copied root0644 **only** to `/etc/systemd/system/morphiume-runtime-health.service.d/20-reviewed-operator-budget.conf` after publication/review/GO. It proposes CPUQuota100%,MemoryMax256M,TimeoutStartSec50s and has no command/origin/secret changes. Backup retains its distinct old50%CPU/512MiB/20min budget. Do not install the health override in the backup drop-in directory. A prospective five-minute health interval would reduce repeated archive-proof cost, but neither interval nor actual scheduled cost is accepted yet; the immutable old timer still says60s. Any future interval override must be separate reviewed timer configuration, without changing old source bytes.

For the still-pending full-service cost/sandbox check, the exact immutable command is `/usr/bin/python3 "$task_ops_root/runtime/scheduled.py" health --apply`, with the cache environment above, the unchanged private deploy.env EnvironmentFile/working directory and old unit's hardening, under reviewed CPU100%/256MiB/50s bounds. Root must first review/create schedule-approved after the original QA window release and explicitly authorize that one measurement. Preserve the original stopped/failed probe record and measure both release proofs plus health as one complete scheduled action. Do not substitute direct health or an unexecuted plan to mark the service accepted. Its sandbox/drop-in verification and real full-service result remain pending.

## Finite worker critical/recovery drill, still undispatched

Only after explicit drill GO, the original QA/native window release, successful baseline and exact eight-identity reproof: hold the shared release lock for the drill, keep backup/health timers absent or suspended, and prohibit concurrent fixture/load/upgrade/preview work. Capture baseline `health.py --mode running --expect-backups`, safe image/UID/source, OOM/restarts and heartbeat stat age. A legitimate existing alert is evidence, not permission to clear its queue.

The reviewed private operator driver must import only cache-guarded old591 contract and use its `c.run`, which captures private stderr and removes conflicting MORPHIUME_/COMPOSE_/DOCKER_ exports. Before stop, assert boundaries,591 digest, `c.deployed_image()` and exact healthy app+worker via `c.validate_app_containers`. The specific mutation call is:

```python
c.run(c.compose(c.runtime_image(proven)) + ['stop', '--timeout', '30', 'worker'], timeout=75)
```

Do not stop app/PG or force-kill worker. Inspect only worker State.Status/ExitCode/OOMKilled, proven .Image/User/source and heartbeat stat metadata; graceful exit must be0 and OOMfalse. The accepted worker handles SIGTERM by finishing its loop and ending the pool; no `worker_stopped` log event exists, and raw worker logs/job payloads are not required. Repeat health in **running** mode: expect exit2 plus `runtime_service_unhealthy` observed `worker`. Maintenance mode would incorrectly flag the still-running app and is unsuitable for this drill.

Re-prove deployed image/profile and the expected stopped worker/running app identities; resume only the same worker with:

```python
c.run(c.compose(c.runtime_image(proven)) + ['up', '-d', '--no-build', '--pull', 'never',
      '--wait', '--wait-timeout', '180', 'worker'], timeout=210)
```

Require both writers healthy with the same immutable image/User/source, readiness200, fresh heartbeat below the90s health boundary, no new OOM and removal of the worker-unhealthy alert. Compare other alert codes to baseline rather than falsely demanding green by deleting history. Store start/critical/recovery UTC, worker graceful exit and sanitized before/during/after JSON in a new protected exact runtime metrics directory. A stop/unknown/restart failure preserves evidence and needs finite root recovery; no seed, automatic image substitution, original queue cleanup or external notification is allowed. None of these steps ran in this turn.

## Four-unit installation, only after separate root GO

Prerequisites: completed root acceptance/retained evidence, fresh eight-identity proof and old591 source hash, completed full scheduled-service resource/sandbox measurement and worker drill, no pending preview/upgrade, original QA window released, schedule-approved reviewed, encryption recipient still valid, disk/RAM headroom, exact protected paths/no symlinks and no pre-existing conflicting Morphiume runtime unit/drop-in. The direct healthy cost sample meets only its own bounded observation, not full scheduled-unit proof. Hash-compare **old bundle's** four files before copying root0644 to the corresponding `/etc/systemd/system/` paths. Prepare the two scoped cache drop-ins and health-only budget above without changing either old source unit. No installation occurred here.

Run actual `systemd-analyze verify` on those four installed unit paths with their drop-ins, validate `systemd-analyze calendar '*-*-* 03:00:00 UTC'`, daemon-reload, and inspect only selected effective properties/limits/ExecStart/guard environment. Historical public-source unit/calendar validation passed; post-install/drop-in/capped validation remains pending. After a successful explicitly approved manual scheduled health/backup cycle, record backup pause/resume duration and verified pair health, then enable/start **only** `morphiume-runtime-health.timer` and `morphiume-runtime-backup.timer`.

Health timer is OnBootSec5min, OnUnitActiveSec60s, randomized5s, accuracy1s. Backup is03:00UTC daily, randomized15min, Persistent=yes. Both may fire soon after activation: an elapsed boot timer starts immediately, and persistent calendar scheduling catches up a missed run. Review dispatch availability before `enable --now`; these are not inert installation commands. [Ubuntu24.04 systemd.timer semantics](https://manpages.ubuntu.com/manpages/noble/man5/systemd.timer.5.html).

Before any later shared-cluster native/QA window, root stops/disables only those two timers, waits for any already active backup to finish/resume, and confirms no writer pause/backup in progress. Disabling a timer does not stop an already running service. The approval's released-window=true is an operator acknowledgement, not a perpetual exclusive-resource lease. Local journald JSON/exit status is the only alert destination; no owner notification channel is configured or delivery tested.

## Preview evidence compatibility gate

Actual six-check restore acceptance is complete, but the current marker uses fixtureSha256. Old591 `preview.validate_baselines` requires restore `origin=http://localhost:3101`, workerStarted=false and **fixtureManifestSha256 equal to the retained3100 baseline's actual same fixture hash**. Before preview, root must review an explicit additive normalization of the existing protected marker, preserve its original bytes/hash/result/journal proof and recalculate the trusted marker hash supplied to preview. Do not rewrite the six observed checks/times or fabricate a3100 `adminMfa`/`newT25` baseline; those require the actual retained3100 evidence with its exact seven-check set. Scheduler acceptance of today's marker does not imply preview schema compatibility.

No private-IP origin/Nginx credential/route change, live provider/domain activation, timer install, worker drill,200VU/RPS, offsite/PITR or successor Ops adoption is included in this completed recovery or this prepared recipe.
