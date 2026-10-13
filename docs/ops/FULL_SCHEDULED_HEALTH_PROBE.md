# Full scheduled-health sandbox check for old591/app613

Prepared only. No approval, unit, timer, database, service or server file was created in this documentation turn. Backend currently owns its B15/C16 database window; actual preparation/start needs that window's explicit release and a new root dispatch. The accepted worker drill is [WORKER_ALERT_DRILL_591.json](WORKER_ALERT_DRILL_591.json). It does not establish scheduled-service acceptance.

## Exact source and one-time scope

Run the **health** branch of immutable Ops591, with accepted app613, enginead5/proofc6f83/profile3a246 and the completed retained uppercase restore evidence recorded in [POST_RESTORE_OPERATIONS.md](POST_RESTORE_OPERATIONS.md). Nothing uses current cart/C16 SQL or a newer application image. Old source is published25e1b197; the separate two public configuration drop-ins are published in5cf694c5ed97272851ad32685fed3abd5634f005. Materialize only those reviewed files; do not pull newer main into the accepted application checkout or silently adopt future Ops4d626.

| Public source | Canonical-LF SHA256 | Sole intended target |
| --- | --- | --- |
| Old591 `runtime/systemd/morphiume-runtime-health.service` | `4433c82ded1f43f18c896b4e38c68e9aa640b719d95c58ee5c089cfeb86bfb5d` | `/etc/systemd/system/morphiume-runtime-health.service` |
| [591-python-cache-guard.conf](../../deploy/staging/post-restore/591-python-cache-guard.conf) | `672e07d612751b0ce919d7900ad9c32528256ff7e9c82cfce36374dd67f113f7` | That health service's `10-verified-python-source.conf` drop-in |
| [591-health-budget.conf](../../deploy/staging/post-restore/591-health-budget.conf) | `ff3857c5919d36c7b12716d30c72613a6de8b2f580133b378b11fc2a4c1d2234` | That health service's `20-reviewed-operator-budget.conf` drop-in |
| [591-health-probe-accounting.conf](../../deploy/staging/post-restore/591-health-probe-accounting.conf), newly prepared, publication pending | `33c359ca12b9b50f00b6198e01573fc977385a37750f8949681f9531cb798998` | Runtime-only `/run/systemd/system/morphiume-runtime-health.service.d/30-one-shot-probe.conf` |

The first file must be read from the existing immutable server bundle, not copied from future restore source. Drop-ins are outside OPS_FILES. Root must supply checked absolute staging paths for the two published drop-in files, with expected owner/mode/no links/hash, before any copy. Do not install a backup service, either timer, an enabled symlink, or a wildcard of the four-unit directory during this bounded health check.

```sh
task_ops_root='/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/ops-bundles/591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db/ops'
task_cache_prefix='/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/tools/9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d/unused-bytecode-cache'
```

Before **any old helper import**, independently hash all21 OPS_FILES against591 and verify protected nonsymlink root parents, the exact accepted source/archive/config/manifest, engine proof and canonical profile. The exact prefix must be nonexistent, including not a dangling symlink; retain old caches. Existing private deploy.env must select precisely this task_ops_root/engine image/origin3100; reject unexpected assignments or source paths before its ExecStart variable can be expanded. Root must review protected actual recovery/result/journal/fixture hashes and then exclusively create schedule-approved.json with the exact eight bindings, released-window acknowledgement and **uppercase physical-root** restoreEvidence path. Do not rewrite the completed acceptance or regenerate credentials. Scheduling accepts the existing six-check marker; preview's separate fixtureManifestSha256/origin normalization is not invented here.

## What the full unit actually exercises

Old591 `scheduled.py health --apply` calls `c.deployed_image()` before approval/evidence validation, then calls `health.snapshot('running', expect_backups=True)`, which calls `c.deployed_image()` again. Each path hashes/verifies the accepted archive/layers/config and re-proves the immutable Docker/containerd manifest binding. The unit also reads root600 approval/deployed/profile/restore evidence, validates the old uppercase physical-path pattern and six actual checks/timings, rehashes Ops591, then performs the fresh runtime read-only queue/resource/readiness observation. No health branch invokes backup, lock/writer-stop, migration, seed, role change or image pull. Omitting `--apply` only returns an unexecuted plan and is not a test.

The18.640249s direct-health sample and three approximately18.4s drill probes exercised only **one** such archive path per health invocation. They passed the proposed hardening/socket access at one-core/256MiB; they did not exercise EnvironmentFile, ConditionPathExists, approval/evidence or both sequential proofs within the full50s deadline. No proof count or duration is fabricated from an unexecuted plan. Suggested five-minute monitoring cadence remains a proposal until the complete scheduled action is measured.

## Filesystem and socket compatibility

| Effective setting / dependency | Source-based requirement and bounded evidence |
| --- | --- |
| ProtectSystem=strict | Archive, Ops, profiles, config/evidence and `/proc` facts are read-only inputs. Health needs no ReadWritePaths. Do not add writable root/runtime exceptions to make a failed probe green. |
| ProtectHome=yes | Accepted inputs and tools are below `/srv` and `/etc`; no restore identity under a home directory is needed. Actual direct/drill sandbox probes already completed Docker/ctr calls with this setting. Registry credentials under a home directory are not needed because there is no pull. Full-unit completion remains pending. |
| PrivateTmp=yes | The nonexistent cache prefix is under the protected tool923 parent, outside temporary storage, with writes disabled. The existing worker heartbeat is read inside its own container; it is not the unit's private `/tmp`. |
| NoNewPrivileges=yes, User=root, UMask0077 | Root reads protected configuration and local daemon sockets without setuid escalation. Secrets remain file inputs and are not added to unit Environment. |
| `/var/run/docker.sock` and `/run/containerd/containerd.sock` | Existing pathname Unix sockets must remain reachable. Root verifies actual socket metadata and active Docker/containerd; do not replace sockets, change namespaces/store or restart daemons. Old engine code pins socket/moby/client+serverv2.4.1 and reads only bounded OCI manifest bytes, never config blobs. |
| Host loopback network | Readiness calls `http://127.0.0.1:3001/api/health/ready`. Do not add PrivateNetwork=yes or a blanket network restriction that would hide that host listener. There is no public mock route or origin change. |

Read-only mounts do **not** make Docker/containerd APIs read-only: the operation restriction comes from byte-verified old591 health commands and the fixed `health --apply` action. Keep the exact original service hardening; do not grant additional host write access or mistake sandbox incompatibility for a product failure. Upstream documents strict filesystem mounts, inaccessible home paths and the remaining Unix-socket boundary. [systemd255 execution reference](https://github.com/systemd/systemd/blob/v255/man/systemd.exec.xml).

## Preferred check: install only the disabled health service, start once

Root may choose this after explicit released-window/approval/install GO. It tests the actual unchanged base unit plus the two reviewed drop-ins; it avoids cloning properties into a subtly different probe. Preflight rejects any unknown existing unit/drop-in/target symlink, checks no running backup or timer, and confirms Docker already active. Do not restart/start a missing daemon as part of this check. Root must verify every existing parent and each explicit destination stays under `/etc/systemd/system`; no recursive cleanup or overwrite of unknown state is allowed.

After those guards, these are the exact copy targets. task_cache_source/task_budget_source are independently hash-verified **absolute** materialized paths supplied by that dispatch; never a main-tip lookup or a shell-sourced .conf.

```sh
: "${task_cache_source:?Reviewed exact source path required}"
: "${task_budget_source:?Reviewed exact source path required}"
install -o root -g root -m 0644 "$task_ops_root/runtime/systemd/morphiume-runtime-health.service" /etc/systemd/system/morphiume-runtime-health.service
install -o root -g root -m 0755 -d /etc/systemd/system/morphiume-runtime-health.service.d
install -o root -g root -m 0644 "$task_cache_source" /etc/systemd/system/morphiume-runtime-health.service.d/10-verified-python-source.conf
install -o root -g root -m 0644 "$task_budget_source" /etc/systemd/system/morphiume-runtime-health.service.d/20-reviewed-operator-budget.conf
systemd-analyze verify /etc/systemd/system/morphiume-runtime-health.service
systemctl daemon-reload
```

The service stays disabled and has no timer. Root compares selected effective properties to the expected values: Typeoneshot, Userroot, WorkingDirectory/private EnvironmentFile unchanged, exact ExecStart ending `runtime/scheduled.py health --apply`, CPUQuota100% (one of four cores), MemoryMax268435456, TimeoutStart50s, unchanged hardening and both cache prechecks. Capture the entire Environment/ExecStart/journal privately; print only allowed path/guard/mode/result fields. Plain whole-unit or all-environment dumps are unnecessary.

Base source has no explicit TimeoutStopSec, so its manager shutdown default must not be assumed to be5s. For this one-time measurement, the separately prepared **runtime-only** accounting file above sets `TimeoutStopSec=5s`, `CPUAccounting=yes`, `MemoryAccounting=yes`; it changes no Ops byte or persistent budget and is not a timer authorization. It must be reviewed/published/materialized with its own exact source/SHA before use; it is not part of published5cf. After root independently supplies its checked absolute task_probe_accounting_source and explicit GO, copy it root0644 only to `/run/systemd/system/morphiume-runtime-health.service.d/30-one-shot-probe.conf` under checked root-owned nonsymlink parents, then daemon-reload and verify effective full unit/drop-ins again. Retain that reviewed file/state until a specific cleanup dispatch; do not delete generic runtime unit directories. If root instead chooses a transient unit, it must reproduce all base properties, cache environment/prechecks, exact private EnvironmentFile/working directory and fixed literal old591 command, with50s start/5s stop, one core/256MiB and no timer. Such a clone is a separate recipe, not evidence the real base service ran.

Once those exact effective properties/guards are reviewed, invoke **one** `systemctl start morphiume-runtime-health.service` from the protected operator capture. Record caller UTC before/after, unit InvocationID/ConditionResult/AssertResult/Result/ExecMainCode/ExecMainStatus, selected start/exit timestamps, actual healthy JSON, CPU and cgroup memory peak. Observe the cgroup while running, since successful oneshot cgroup data can disappear after exit. Preserve partial/failure output privately without retry, reset-failed or budget escalation.

The50s start deadline covers the prechecks and oneshot execution, including both proofs. A skipped condition or successful `systemctl start` alone is not acceptance: require actual invocation/start/exit, ConditionResult=true, ExecMainStatus0, Resultsuccess, complete old591 health JSON with scope=morphiume-staging-runtime, running/expect-backups=true, healthy/zero alerts/readiness200 and exact trusted image/profile context. Stop on timeout/OOM/guard/unknown failure; keep the original failed25%-CPU probe and all new evidence. Do not weaken archive proof or blindly increase the deadline. [systemd255 service timeout and oneshot reference](https://github.com/systemd/systemd/blob/v255/man/systemd.service.xml).

## Acceptance still pending

This offline recipe does not create schedule-approved, copy/start a unit, normalize preview evidence or alter the server. Actual full-service result and post-install drop-in verification remain unexecuted. Only after that accepted measurement may root choose a cadence and separately dispatch timer installation/activation. Backup keeps its own50%CPU/512MiB/20min budget; no health override applies to it. No backup timer, live service, provider/domain, offsite/PITR or external notification delivery is accepted by the worker drill or this prepared health check.
