# Prepared runtime schema11 → 13 preservation protocol

Prepared on 2026-10-13. This is source and pure-test preparation, **not execution authority or runtime acceptance**. No SSH, network, PostgreSQL connection, backup, migration, seed, writer operation or credential read occurred in this preparation. The deployed runtime and original historical database were not observed or changed. Candidate source `db928…` has reported verification evidence, but its accepted packaged-image identity is still pending for this protocol.

The pending state is `acceptedSourceCommit=null`, `acceptedImage=null`, `beforeEvidence=null`, `afterEvidence=null`, `preservationAccepted=false`. These values deliberately cannot pass the execution gate. The coordinator must bind actual accepted image/source/Ops evidence, a fresh encrypted backup, and an explicitly released writer-free window before dispatch.

## Target and shared checks

[observe-runtime-preservation.mjs](../../deploy/staging/observe-runtime-preservation.mjs) targets exactly `morphiume_staging_runtime`, authenticating only as `morphiume_runtime_app`. Its object/schema owner must be `morphiume_runtime_owner`, matching `runtime/contract.py` and `runtime/prepare.py`. Original `morphiume_staging`, its app/owner roles, restore/QA databases and all migration-owner URLs are rejected. This file is outside the frozen21-file Ops bundle; preparing it does not change Ops591 or the old app613 image.

The unchanged [original observer](../../deploy/staging/upgrade-original-observation.mjs) supplies only target-independent exports: `MIGRATIONS`, `ORIGINAL_TABLES` aliased as `PRESERVED_TABLES`, `NEW_TABLES`, `hash`, `digest`, `projectionSql`, `verifyMigrationFiles`, `validateHistory` and `validateAdditionReference`. The original capture/configuration/gate/comparison functions contain original role/database assumptions and are **not** reused. Runtime records carry `kind:"runtime-preservation"` and the literal runtime database name; original observations cannot serve as runtime baselines.

Canonical migration-manifest digest is `4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119`. The shared helper checks all13 exact names/LF checksums, exact11 history before and exact13 after, preserving the first11 checksums and hashed timestamps. No checksum canonicalization, audit insertion, seed or history repair is permitted during the comparison. The only append candidates are0012/0013, and their execution belongs to a separate coordinator dispatch.

The independent catalog reference must identify the finally accepted source and exact PostgreSQL patch version. It supplies20 added columns,10 added indexes and24 added non-not-null constraints, including PostgreSQL18's actual `analytics_daily_check4`. The runtime observer uses the reviewed reference validator and compares complete definition digests. A reference generated from the post-migration target itself is insufficient; the prepared dedicated-QA reference needs final source/image byte binding before use.

## Read-only observation

`captureRuntimeObservation(client, {phase,sourceCommit,toolSourceCommit,sharedHelperSha256,gate,baseline?,reference})` opens `REPEATABLE READ READ ONLY`, sets transaction-local15s statement and1s lock timeouts, UTC, ISO dates, stable float formatting and `search_path=pg_catalog`, and ends with `ROLLBACK`, including query/identity/size failures. It never imports a migrator or executes DDL/DML/COMMIT.

Before records all49 old public tables; after must contain precisely those49 plus the four analytics tables. It hashes every baseline column row multiset inside PostgreSQL. Only counts, byte sizes, opaque catalog identifiers and digests leave those queries. After projects exactly the old columns; notification rows retain their seven original fields while five new fields are checked separately. Duplicate rows remain material. Old table/column ownership and metadata, effective DML-only grants, ACLs, schema/default ACLs, old indexes/constraints, sequence definitions/state and all old row digests must remain equal. No account, event, queued job, reservation, financial or audit history is exempted.

Every old projection has a100,000-row ceiling,256MiB aggregate serialized-text ceiling and2MiB per-row ceiling. Oversize fails; it never samples. Individual timeouts do not establish a whole-phase deadline or measured runtime cost. The coordinator must supervise a finite overall observation/ciphertext-verification deadline and retain any interrupted state.

Post observations require three empty analytics data/quota/dedup tables and exactly one pristine coverage singleton with null capture/cleanup times. Existing notification rows must all remain `audience=customer`, `kind=legacy.order_update`, with null order/event/permission links. No capture, new notification producer/consumer, native fixture or worker may run between before and post acceptance. This protocol observes preservation; it does not test the new APIs, native auth, delivery or browser behavior.

## Release, backup and window gate

`validateRuntimeGate(gate, sourceCommit)` accepts exactly these fields:

| Field | Requirement |
| --- | --- |
| `schemaVersion`, `databaseName` | `1`, literal runtime database |
| `acceptedSourceCommit`, `minimumCompatibleNotificationConsumerSource` | Same explicit accepted non-placeholder40hex source |
| `acceptedImage`, `previousImage` | Exact release objects described below |
| `migrationManifestSha256`, `additionCatalogSha256` | Canonical13-file manifest and independently trusted catalog digests |
| `backupManifestSha256`, `backupCiphertextSha256` | Raw completed manifest digest and exact two ciphertext digests |
| `backupVerified`, `backupEncrypted`, `writerFreeCapture`, `writersStopped`, `windowReleased` | Each explicitly `true` after actual independent verification |
| `notificationActivationForbidden`, `analyticsActivationForbidden` | Each `true` throughout both observations |

Each release object contains exactly `sourceCommit`, `testedPlatformConfig`, `candidateManifestDigest`, `archiveSha256`, `opsSha256`, `runtimeImageId`, `engineProofSha256`. Config/manifest/runtime-image identities use `sha256:<64hex>`; archive/Ops/proof use64hex. A tag, partial object, null identity or all-zero source cannot substitute. The gate's candidate source matches `acceptedImage`; the pre-upgrade backup matches **previousImage**, including its actual old Ops identity. Executing `backupOpsSha256` is separately retained; an old-running-release backup is never relabeled as candidate-image evidence.

`verifyRuntimeBackupFiles(directory, gate)` accepts only `/srv/morphiume/staging/runtime/backups/YYYYMMDDTHHMMSSZ-8lowerhex`. Directory/parents must be real root-owned, without group/other writes; final directory700. Its exact files are `backup-manifest.json`, `database.dump.age`, `media.tar.gz.age`, root-owned600 regular singly-linked files. Partial/extra files fail. The manifest is raw-byte rehashed, bounds-checked to4MiB and must identify the runtime previous release, schema11, a completed ordered valid UTC interval, positive DB size estimate and the two exact ciphertext hashes. Both ciphertext files are streamed/rehashed and must have age's v1 header. This is byte-integrity/format checking, **not decryption, restore proof, signed image acceptance or independently stopping writers**. Fresh backup generation and writer identity checks remain the coordinator's reviewed runtime-backup responsibility.

Boolean attestations and trusted argument hashes require independent operator evidence; the helper cannot manufacture it. Existing restore/health results for an earlier release do not satisfy this upgrade's fresh backup and before/after gates. Do not generate a passing gate from the pending placeholder state.

## Private CLI contract

Evidence resides only below `/srv/morphiume/staging/runtime/preservation/<lowercase-UUIDv4>/`, root-owned700, with root-owned600 singly-linked non-symlink files of at most4MiB. All parents must be root-owned without group/other writes. Existing outputs are never overwritten. The observer creates no directories, credentials or approval records.

The Linux-root CLI requires explicit paired arguments: `--phase before|after`, `--runtime-source-commit`, `--runtime-tool-source-commit`, `--runtime-tool-sha256`, `--shared-helper-sha256`, `--migration-dir`, `--gate`, `--gate-sha256`, `--addition-catalog`, `--addition-catalog-sha256`, `--backup-directory`, `--output`. The after phase additionally requires `--baseline` and `--baseline-sha256`; before rejects them. Gate/reference/baseline belong to the same preservation directory. Tool and imported-helper raw byte hashes are verified separately before connection. Record the actual Linux file hashes from the finally published bytes; do not substitute a Windows CRLF raw hash.

Private stdin is exactly `{schemaVersion:1,DEPLOYMENT_ENV:"staging",PAYMENT_PROVIDER:"mock",SMS_PROVIDER:"mock",transport,DATABASE_URL}`. Allowed transports are `runtime-docker` → literal `db:5432`, or `runtime-host-loopback` → literal `127.0.0.1:5433`; actual availability must be verified separately. Windows15433 is excluded. URL query/fragment/normalized/encoded database paths, extra fields, live mode and non-mock providers fail. No dotenv, owner URL or ambient database URL is read. Explicit parsed host/port/user/database/password, disabled SSL and empty PG options prevent ambient connection parameters replacing the approved target; the actual authenticated identity is then checked inside the read-only transaction.

Stdout reports only runtime kind/target, completion/counts/digest and preservation acceptance. CLI errors are fixed and redacted, without arguments, URLs, raw driver errors or row values. Preserve failed/partial evidence and stop; no implicit retry, cleanup, restart, rollback migration or queued-history mutation exists.

## Preparation evidence and remaining work

The new Node suite is explicit because Vitest's current patterns do not discover `.test.mjs`: `node --test tests/unit/ops/runtime-preservation.test.mjs`. Pure tests use synthetic metadata/injected query clients and locally constructed pg parsers without opening connections.77/77 passed on Windows Node24.19 in586.8581ms, then77/77 on existing WSL Linux Node24.21 in2378.43378ms, both exit0. Final combined Linux regression with the unchanged original44 cases passed121/121 in1412.630237ms, exit0. Cases cover original/owner target rejection, canonical13 source/reference, preservation counterexamples, old-image backup identity, missing/corrupt/partial gate metadata, before-SQL rejection, timeout/size bounds, rollback and redacted CLI failures. A generation-time slash-escape syntax error was corrected before those tests; it caused no network/database action.

Actual runtime directory/ACL/ciphertext-file verification, fresh backup, stopped-writer evidence, runtime before observation, owner-only migration0012/0013, runtime after comparison and compatible app/worker/API/native acceptance remain unrun. No preservation acceptance or action authority is inferred from the pure tests. Root owns publication, CI integration of this explicit Node suite, accepted source/image/Ops/reference binding and any later execution. No commit/push was performed by the commerce agent.
