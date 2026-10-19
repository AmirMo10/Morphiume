# Private-preview UI image releases

The first execution of this protocol completed on 2026-10-19 for app source `32b89e13d31288fe4497f7419e170550baf5b293`, with separately accepted operator source `7bafc56967628caef93579d3f7621cdf0db8e185`. Actual source/image CI, image transition, 17-check native purchase, fresh six-check recovery, scoped cleanup, PID1 health/backup measurements, enabled timers and final browser review are recorded in [the release execution report](../qa/PROFESSIONAL_REDESIGN_RELEASE.md). This historical acceptance does not authorize replaying that operation or establish future scheduled delivery.

These tools are prepared and offline-tested. Their existence does not establish a server deployment. Root reviews/publishes their separate tool commit, observes its dedicated Linux guard CI, accepts the application's full source/image CI, and dispatches each finite phase. Defaults are dry plans. This is for the existing private staging origin `http://192.168.240.51`, client `192.168.240.46/32`, existing protected shared preview operator and controlled mock providers. Public sales/domain/TLS/live provider activation is separate.

The previous runtime is not inferred from main or this document. Before every release, Root rechecks actual source/image/profile, owner/capability/config, original PostgreSQL mount, stopped restore pairs, units, locks and current acceptance. Current historical evidence is [the accepted 3b62 preview](../qa/PRIVATE_PREVIEW_EXECUTION.md). Never replay first-deployment/seed or first-preview operator enable. Never modify frozen Ops68, old profiles, acceptance records or restore data.

## Trust and preparation

Build off-server. Accept successful source and packaged-image CI for the exact app commit and exact platform-config/manifest/archive, including actual browser, worker, media, security and live-gate checks. Root separately accepts/publishes the operator tool source; a later operator/docs main commit need not be the running app source. No `[skip ci]` substitutes for the dedicated tool guards.

Materialize the raw-reviewed `control.py` at `/etc/morphiume-staging-runtime/ui-release-tools/CONTROL_SHA/control.py` and `schedule.py` at the sibling `CALLBACK_SHA/schedule.py`: root-owned directories 0700 and public source 0644, no symlinks/overwrites. The adapter verifies the existing3b62 utility library/control `bc2d394…`, legacy companions `a1afdc…`/`e7056b…`/`bc17fa…`, prior scheduler `6f6fb1…`, installer `828993…`, manager observer `b00f19…`, and every Ops68 byte before importing them. Existing utilities supply metadata, backup, graceful-stop, schema, restore and PID1 measurement primitives; their first-transition/installer entrypoints are not replayed. No mutable checkout code is imported for trust.

Root stages a fresh `/srv/morphiume/staging/runtime/incoming/ui-release-UUID/` (root 0700) containing exactly four root 0600 files: `accepted-image.tar.gz`, `accepted-image.sha256`, `image-identity.json`, `public-accepted.json`. The last file uses the existing exact `root-observed-accepted-github-ci` schema documented in [private-preview preparation](../../deploy/staging/private-preview/README.md), including two successful actual job IDs, artifact ZIP/archive/config/manifest and UTC observation no older than one hour. Compressed archive cap is1 GiB. It is streamed/verified by the frozen verifier; it is not loaded into a Python bytes object. Disk headroom covers archive copy plus twice actual uncompressed layers plus1 GiB.

The adapter's release request is exact JSON (root 0600, protected parent), with fields:

| Field | Required meaning |
| --- | --- |
| `formatVersion`, `mode` | Integer 1, `private-preview-ui-release-v1` |
| `operationId` | Fresh UUIDv4; never reuse a failed operation |
| `previous` | Actual seven-field source/config/manifest/archive/Ops/Engine/proof identity |
| `candidate` | Five CI fields `sourceCommit`, `testedPlatformConfig`, `candidateManifestDigest`, `archiveSha256`, `opsSha256`; Engine/proof are obtained after the real loader |
| `previousProfileSha256` | Actual canonical immutable previous profile hash |
| `capabilitySha256`, `siteSha256` | Actual unchanged protected capability and no-Basic Nginx site raw hashes |
| `preservedPairCount` | Actual stopped pair count, initially5; every later successful release adds its fresh rehearsal pair |
| `baselineSha256` | Null for observe; actual observed baseline hash for prepare |
| `incoming` | `{directory, publicAcceptedSha256}` for the exact fresh directory |
| `frontendReview` | `{reviewed:true, changedPaths:[sorted exact paths]}` after Root reviews the actual previous→candidate diff |
| `callbackSha256` | Separately published/reviewed new callback raw hash |
| `nativeEvidence` | Null initially; actual protected `{path,sha256}` after deployed purchase acceptance |
| `recovery` | Null initially; later exact `{fixture,temporaryIdentity,businessResult,processRecord}`, each null or protected `{path,sha256}` |
| `approved`, `sharedDatabaseWindowReleased` | Explicit Root apply flag and actual exclusive DB-window release |

The allowed diff is UI components/styles/pages/assets, tests/docs, these new tools, the five named historical private-preview operator files already separately published since 3b62, and the exact `.github/workflows/verify.yml` file for Root's separately reviewed operator-only path exclusions. Other workflows/root configs remain rejected. API/auth/server/commerce/database/dependency and frozen 21-file Ops changes are rejected. A path allowlist does not replace Root's semantic review of shared components, server-rendered pages or that workflow diff. Unknown source changes require another deployment protocol, not a widened runtime guard. The networkless candidate SQL-file probe must still match the exact 13-migration manifest; no migration, seed, DDL or operator enable command is invoked.

## Finite dispatch

Every command uses the actual saved raw request SHA and self SHA. Every phase after prepare additionally requires the actual immediately preceding `journal.json` raw SHA. Capture stdout/stderr directly into protected files before printing only safe metadata. Do not expose raw configs/capability, owner/contact data, credentials or keys. Default/action without `--apply` is unexecuted; `observe` is read-only.

```text
python3 -I -B CONTROL_PATH observe --request REQUEST --request-sha256 RAW --self-sha256 CONTROL_SHA
python3 -I -B CONTROL_PATH prepare --apply --request REQUEST --request-sha256 RAW --self-sha256 CONTROL_SHA
python3 -I -B CONTROL_PATH PHASE --apply --request REQUEST --request-sha256 RAW --self-sha256 CONTROL_SHA --expected-state-sha256 ACTUAL_PREDECESSOR
```

Phases, dispatched one at a time after Root accepts their real result:

1. **observe → prepare:** validate previous healthy app/worker/archive/Engine/profile, owner rows, capability/config/site bytes, generic exact stopped pair IDs/storage/evidence/media, reserved mount, unit files/approval and both locks. Observe emits a digest-only/private metadata baseline. Prepare verifies that baseline again, marks the operation exclusive, pauses only the two existing timers and lets an existing job finish naturally (bounded by the existing backup service budget, without kill/reset/retry). A legitimate final InvocationID is recorded after pause. Fast-forward only to the accepted app commit, preserve unchanged Ops68/copy the three artifacts under the release lock, release that lock for exactly one frozen loader child, reacquire for actual Engine proof and full previous-runtime preservation. The immutable raw Engine record hash and canonical Engine proof fingerprint remain distinct. Timers stay paused.
2. **apply:** verify the loaded candidate, unchanged protected state and paused services. Gracefully stop the same writer IDs with exit 0/143 and no OOM, create/rehash an encrypted previous-image backup, compare all 53 tables/schema 13/catalog/sequences, and select the new immutable profile/env/deployed identity. Start app without build/pull, verify readiness and unchanged DB/media before starting worker, then verify the pair/heartbeat. Preserve existing capability, operator, owner and configuration bytes. Nginx is unchanged; clients may see a brief upstream-unavailable response during the controlled writer pause. Return `image-ready-native-pending`; do not resume timers.
3. **accept-native:** independent QA runs actual deployed admin product creation/publication → native customer checkout → server mock payment verification → one inventory commitment → owned tracking, replay/foreign-order/access checks. The externally accepted marker uses the existing17-check `private-preview-native-accepted` schema, binds actual seven-field identity/profile/capability/origin/CIDR, command exit 0, one invocation and no retry and raw result SHA, after this image's ready time. Preserve a new primary fixture for restore. No old marker is relabeled.
4. **recovery-start:** Root provides the actual retained fixture with `sourceCommit`/`createdAt` and one exact root 0600 temporary RAM identity at `/dev/shm/morphiume-runtime-restore-12hex/identity`. Stop the exact source pair gracefully, create/verify a fresh new-image encrypted backup, keep source writers paused, and invoke the frozen restore exactly once. The sole reviewed AST change substitutes an exact generic old-pair assertion for the historical no-old-pairs guard; roundtrip validation proves every other frozen node unchanged. A new namespace uses separate DB/config/media and loopback 3002 / localhost:3101, no worker. Require normal anonymous admin 401, ignored preview capability, all media hashes and unchanged previous pairs. Return actual ready/config/start hashes and keep source paused for QA. No automatic resume on failure.
5. **recovery-finish:** independent actual recovery client supplies the six business checks and a separate Root-observed exit/process envelope bound to this fixture/backup/ready/config/image/project. Preserve actual timestamps and hashes. Accept only command exit 0, one invocation and no retry, actual financial preservation and wrong-origin rejection. Write a new acceptance result, stop only the fresh pair with the same IDs/graceful codes, preserve all old pairs, remove only the exact verified RAM identity, resume the source pair and verify readiness/health. Record measured finite RTO/fixture-to-capture gap; do not claim general RPO/offsite/PITR.
6. **schedule-install → measure-health → measure-backup → schedule-promote → schedule-enable:** create one immutable new release acceptance, archive the current approval/two overrides by same-filesystem rename, install only the two source-bound `20-private-preview-verified.conf` overrides and verify PID1-selected commands/protections. Keep four base units, health every 5 minutes / daily backup at 03:00 UTC, jitter and Persistent, permissions/budgets and both lock device/inode/bytes unchanged. The new callback avoids mutable HEAD. Observe exactly one actual PID1 health and encrypted backup invocation using the pinned collector, including fresh InvocationID, live PID, cgroup samples, journals, exit 0, backup ciphertexts and source preservation. Bind those actual hashes in recurring approval, then start only historically enabled timers. If a timer immediately dispatches an ordinary due job, allow it to finish naturally before final health observation. Record actual active/enabled state; future delivery is not established by one measurement.

The final scheduling request must stay byte-identical through install/measure/promote/enable: it is pinned in the selected commands and approval. Only the predecessor journal SHA changes between CLI calls. Early request additions for actual native/recovery evidence are permitted and explicitly source-bound; they do not change the immutable release request core.

After preparation or any accepted later phase, `observe` with the mandatory actual `--expected-state-sha256` rechecks the current phase read-only (including the loaded candidate before apply). It reports actual units and does not recreate files, load images, resume writers/timers or promote acceptance. A missing/malformed predecessor hash is rejected before reading state or dispatching actions; it never means “use the latest state.” Before apply/measurement, close the coordinator's old preview browser contexts and release the shared mutation window so no permitted client's background request can create auth/business rows during the quiescent comparison.

## Actual recovery evidence interface

`businessResult` is an externally observed `ui-release-recovery-result`: exact candidate, access/capability hashes, restoreProject, fixture/backupManifest/ready/appConfig hashes, origin localhost:3101, `reviewCapabilityIgnored:true`, `anonymousAdminStatus:401`, six named checks all true, `financialRowsPreserved:true`, `noFinancialRowsAdded:true`, `noNewOrder:true`, `directSqlMutations` integer 0, actual started/completed UTC. The fixture raw SHA must be the actual `restoreFixtureSha256` retained by the accepted native marker (`retainPrimary:true`). This is not fabricated by the release helper.

`processRecord` is separate `root-observed-ui-release-recovery-process`: exact candidate/operationId/restoreProject/rawResultSha256, integer `exitCode:0`, `timedOut:false`, `invocationCount:1`, `automaticRetry:false` and actual start/completion UTC enclosing result execution after readiness. Root must adapt/run the real recovery client and observe its real process; merely writing these JSON fields does not pass acceptance.

## Failures and verification limits

An unexpected predicate, partial loader/journal, failed service, identity/config/pair drift or ambiguous child exit stops the operation and preserves evidence. Never replay prepare/apply/recovery or rerun a loader, reset services, restore over the current DB, remove old pairs, silently resume timers or edit a failed journal. Diagnose read-only and prepare a separately reviewed finite continuation. Previous image/profile/env/deployed snapshots and encrypted backup permit a reviewed image-only recovery after schema compatibility is independently reconfirmed; this adapter does not automatically roll back or roll schema/data backward.

Portable guard checks use Python 3 stdlib only:

```text
python3 -I -B tests/ops/ui-release.test.py
python3 -I -B deploy/staging/ui-release/control.py
python3 -I -B deploy/staging/ui-release/schedule.py
```

The guard suite exercises failure ordering, real injected image-apply flow, external process/result binding, source allowlist/identity separation, unchanged frozen restore AST, phase replay/concurrency and recurring-measurement rejection. These tests do not prove SSH/image-load/DB/Nginx/browser/restore/scheduler execution. Final reports must list only actual commands/results and remaining prerequisites. See the [Ops skill](../../.agents/skills/morphiume-ops/SKILL.md) and [CI release contract](CI_RELEASE.md): postdeploy native T25 plus one fresh new-image isolated business recovery remain required for completion; five historical rehearsals and operator provisioning do not repeat.

The 2026-10-19 read-only integration probe found that the actual systemd timers expose six common manager fields, while services additionally expose `ExecMainStatus`. The manager observer requests `--all` and validates the exact known per-type schema, rejecting duplicate, unknown or missing fields. Service success and exit status 0 remain mandatory when quiet. This observation changed no units, checkout, acceptance, image or application state; it does not establish deployment success.
