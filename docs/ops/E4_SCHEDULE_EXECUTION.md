# E4 scheduled-service execution

The guarded E4 health and encrypted-backup services were measured successfully, then the reviewed timers were enabled. The final read-only observation was **2026-10-13T11:51:40.949152Z**. The server window was released immediately afterward; all later timer suspension/restoration for the coordinator’s separate benchmark must preserve this enable-time observation. [Machine-readable evidence](e4-schedule-execution-safe.json) records the exact identities, sampled resource maxima and retained evidence checksums.

Application source remains `e4bed691dc938a9c0f79022696d24f063ad97724`, immutable engine image `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d`, and frozen Ops68 bundle (21 files) `68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3`. The separately published scheduling companion is commit `5d7ff8ab62fa59fc1ecc88457227c8b82d0cdc14`, LF source SHA256 `2aba55c27ce52b6dfacd6dc02c0bb8f47f2bd7f6f75c697ee7d1605c7153a1ce`. Scheduling binds the already accepted private-IP profile, the actual three-engine preview acceptance and the retained E4 six-check restore marker. It changes no application image or Ops68 file.

## Retained failure and finite adoption

The first one-time install, operation `0de00b3d-94a0-4b64-a0f9-7ccc55033025`, failed after `syntax-reload` at approximately11:22:22Z. Five existing files were snapshotted, the exact four frozen base units installed, only the three known old health overrides removed, both guarded service drop-ins installed and the one-time approval promoted. Neither service was started and neither timer enabled. All20 history files, including the failed record and five snapshots, remain retained.

The actual failure was the separate Manager.GetUnit lookup of an inactive one-shot after systemctl’s client disconnected. It reported the unit not loaded. Narrow metadata observation with one temporary persistent D-Bus connection proved the installed service properties, disabled timer expressions and four-unit syntax valid. The correction uses canonical-object Unit.Id and exact typed empty EnvironmentFiles reads; no missing value is assumed empty. [The dispatch runbook](E4_SCHEDULE_DISPATCH.md) documents the primary systemd source and46/46 Linux Python3.12 safety tests. The published lease callback was not changed.

A reviewed private companion adopted only the exact existing partial state into a **new** record, operation `bdf0c900-1eda-4a78-8849-6c7954694d9a`, in1.109s. It verified all21 Ops files, the original20-file history/snapshots, unchanged old guarded bytes, lock, disabled timers, accepted profile/native/restore records and exact frozen bases. It replaced only two scheduling drop-ins and the scheduling approval, reloaded the manager, verified the new properties and re-hashed the unchanged old history. No old failure was overwritten and the first installer was not rerun.

## Actual one-time measurements

| Service | Authentic unit cycle | Waiting client wall | Cgroup samples | Observed memory peak | Observed CPU | Outcome |
|---|---:|---:|---:|---:|---:|---|
| Health |30.915804s|31.163001s|117|45,883,392B|28.746306s|Accepted; healthy, alerts0, readiness200|
| Backup |152.779184s|152.983751s|573|46,436,352B|72.941237s|Accepted; ciphertext checks passed; writers resumed|

Each measurement used exactly **one** direct systemctl start. Both had zero observed OOM/OOM-kill events, an independent post-run immutable-image proof and equal whitelisted container/config/profile metadata before and after. The backup was already completed when the intentional model-switch interruption occurred; the existing process/result was reconciled, with no restart. Resource values are observed sample maxima, not whole-host capacity. Unit timing comes from authenticated PID1 start/success/done journal events; `executionSeconds` remains null. Local total durations, including independent post-proof, were46.078s for health and167.875s for backup.

Health used CPU100% (one core),256MiB,start50s/stop5s. Backup preserved CPU50%,512MiB,start20min/default90s stop. Both retain root/oneshot/0077, source/cache prechecks, NoNewPrivileges, PrivateTmp, ProtectHome and ProtectSystem=strict. Health adds no writable audit/config/tool path. The public-marker dispatch lock is ext4-bound and distinct from the unchanged deployment lock. Recurring busy contention may only emit an honest skip; it cannot claim a healthy check or completed backup. No concurrent-contention delivery was measured in this execution.

The backup is `/srv/morphiume/staging/runtime/backups/20261013T114642Z-e939c8f3`, migration count13. Actual encrypted files were915,035B database and1,248B media; their streamed SHA256 values matched manifest `7259612e004d1e9fffc1522c16286dc44f0abd660d65210f542e69fa206d881a`. This particular capture’s restore acceptance is **pending**. The previously accepted E4 restore remains separate evidence. No offsite protection, PITR or new RPO/RTO is claimed.

## Actual recurring configuration

Promotion operation `a31bad3f-ad22-4b7d-a809-499a8e67617b` completed in1.031s and bound both accepted private measurement records. Enable operation `f8084acb-6df9-4f47-9570-11460ba5ebaa` completed in1.063s. Both exact timers were active/enabled at the final observation:

- Health: OnBoot5min and OnUnitActive5min, accuracy1s, randomized delay5s, nonpersistent. The first automatic trigger was observed at11:49:36UTC; its completion is not inherited from the one-time acceptance.
- Backup: daily03:00UTC, randomized delay15min, persistent. Its observed next occurrence was2026-10-14 at03:04:29UTC. No scheduled backup delivery had yet been observed.

Both services were inactive with their exact effective guards/budgets; E4 app and worker were healthy, UID1001:1001, immutable image/source unchanged, read-only roots and cap-dropALL. Readiness returned200. All21 immutable Ops hashes and the reserved `/srv/morphiume/postgres` mount guard passed. The coordinator owns independent final verification and any exact temporary timer suspension/restoration for the subsequent benchmark.

Protected evidence remains under `/srv/morphiume/staging/runtime/metrics/`: the first failed setup namespace, the new reconciliation namespace, measurement `b3bff492-cf90-46fc-a6d8-cf868e572731` (health), measurement `50b66e7c-44b2-4c8a-bfe4-57a4f3313ba3` (backup), and both successful setup namespaces. Local raw captures remain in ignored `.local/e4-schedule-execution-private`; no raw configuration, credentials, rows or journals are included here. Scheduling covers `morphiume_staging_runtime`; no schema change or original-database row-equality measurement occurred. External alert delivery and live PSP/SMS were not activated.
