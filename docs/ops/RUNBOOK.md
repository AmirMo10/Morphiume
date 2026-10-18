# Operations runbook

## Accepted redesign runtime — 18 October 2026

The accepted application is `7feb4fe8e8254e917c53f9654b315ee7ef3fada1`, Engine `sha256:f7723802ca524cb16c63988f08220ef14c32f2be136aeaa73f7bbc8720df09df`, with frozen Ops68, thirteen migrations and fifty-three tables. The protected origin remains `http://192.168.240.51`. Three-engine native purchase acceptance and the fourth isolated recovery passed. Recovery acceptance was committed; only the fourth pair was stopped with its data preserved, its temporary RAM key was removed, and the same source app/worker resumed healthy. All three older stopped pairs, owner credentials, original database and reserved mount remain preserved. [Current deployment and scheduling status](REDESIGN_STAGING_EXECUTION.md), [native purchase](../qa/REDESIGN_STAGING_T25_EXECUTION.md), [actual recovery](../qa/REDESIGN_RECOVERY_EXECUTION.md).

Server checkout stays clean at this exact application commit. Later main commits publish tooling/reports and do not redeploy their images. The current optimized preview uses controlled staging PSP/SMS and local encrypted backups. The later different-VPS move to `morphiume.ir` is a [separate migration](MORPHIUME_IR_MIGRATION.md). Public TLS/sales, real providers, offsite/PITR and general RPO are not established by this preview. The dated ACF8/E4 procedures below are historical; do not replay them against the current runtime.

## Historical accepted ACF8 runtime — 2026-10-14T07:53:23.596075+00:00

The running application is acf8e96ee348c487df0fcefe89d568f2bf93367a with immutable Engine sha256:5bf00e2bc40523dd9eaf85d7ef50eecc320bd2c40baf6d10cc38e65e66e2b482, frozen Ops68, schema13 and protected private-IP origin http://192.168.240.51. Read [actual deployment, native purchase, isolated restore and scheduler evidence](ACF8_STAGING_EXECUTION.md) before another action. App/worker are healthy and both existing timers active/enabled at the observation. All three stopped restore pairs, reserved storage and owner data remain preserved. Published tools come from c7b1f0ee210fb0a6a6eeb57462bf2ad6c5c51022; checkout stays ACF8. Main reports/tools do not redeploy an image. Local backups, mock providers and no TLS/offsite/PITR remain the explicit scope.

The E4 and generic sections below are historical procedures, not the current release or an instruction to replay a first-deploy/seed/restore command. Never start613 against schema13 or overwrite an existing restore. A new operation requires exact source/image/profile and individually hashed tool bindings.

## Historical E4 runtime entry point

As of 2026-10-13 11:19 UTC, use the [current E4 staging contract](STAGING_CONTRACT.md), [actual cutover evidence](E4_RUNTIME_CUTOVER_EXECUTION.md), [private-IP acceptance](../qa/E4_PRIVATE_PREVIEW_EXECUTION.md) and [E4 recovery evidence](E4_RESTORE_EXECUTION.md). The running source is E4 with Ops68 and schema13; its accepted private-IP origin is `http://192.168.240.51`. Access credentials remain in protected operator files outside Git. The database DML and migration-owner identities remain separate.

The generic commands below describe earlier preparation. They must not overwrite the current runtime configuration or restore a previous consumer. In particular, restarting613 after migrations0012/0013 is unsupported. Current config/proxy recovery uses the frozen preview transition and the same accepted E4 image; it does not rewind financial data. Preserve both stopped restore projects, original storage and immutable release evidence. Read current [STATUS](../STATUS.md) and the exact published operation's execution report before another deployment action.

## Historical preparation procedures

Run server-changing commands only after the coordinator dispatches the exact staging deployment contract. These scripts are scoped to staging and do not apply the existing `deploy/provision.sh`. Record commit, image ID/digest, UTC time, command exit status and real health results for each release. Current executed evidence is in [environment audit](ENVIRONMENT_AUDIT.md).

## Local database and off-server build

From `S:\Morphiume`, a running Linux Docker daemon is required:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/staging/bootstrap.ps1
```

This creates only project `morphiume-dev`, volume `morphiume-dev-pg18` and loopback port 5433. The random credentials/connection URLs are in ignored `deploy/staging/.local/database.json` with a user-only Windows ACL. Read it into process variables without printing it; use `migrationDatabaseUrl` for migrations and `databaseUrl` for runtime. Never apply a migration through the bootstrap-superuser URL. Re-running retains passwords/data; lost credentials require recovery.

The current verified fallback database is on the staging server because local Docker was unavailable. `compose.db.yaml` provides server loopback5433 only. Forward it using `ssh -N -L 127.0.0.1:15433:127.0.0.1:5433 morphiume-deploy`. Protected ignored local `deploy/staging/.local/staging-connections.json` contains the runtime/migration URLs already rewritten for loopback15433; server config copies are `staging-app.json` and `staging-migration.json`. Do not print their values. Current tunnel PID is recorded in `.local/staging-tunnel.json`; PIDs are session evidence, not reusable constants. Full-stack deployment removes DB integration publishing, so stop relying on that tunnel after application deployment.

The build uses repository root as context and its adjacent Dockerfile ignore file:

```powershell
docker buildx build --platform linux/amd64 --file deploy/staging/Dockerfile --build-arg MORPHIUME_SOURCE_COMMIT=VERIFIED_40_CHARACTER_COMMIT --tag morphiume:REVIEWED_COMMIT --load .
docker image inspect morphiume:REVIEWED_COMMIT --format '{{.Id}}'
```

Substitute the reviewed commit tag. The image contains Next standalone, static/public assets, bundled worker/migration/seed JS, their traced dependency closure and migration SQL. It runs direct Node commands without package managers or build tools. Validate actual migration/seed, read-only app/worker readiness, native auth/media flows and the image scan before transfer. Registry publication needs coordinator authorization; alternatively `docker save --output deploy/staging/.local/release.tar morphiume:REVIEWED_COMMIT`, SHA-256 the file, transfer through SSH to a protected staging directory and verify checksum before `docker load --input`. Set `MORPHIUME_IMAGE` to the exact loaded `sha256:<image-id>` or reviewed registry `image@sha256:<digest>`, not a moving tag. Do not pass production secrets to builds. An offline build is not promised without complete verified package/base-image caches.

The current CI fallback exports a gated gzip archive and identity/checksum sidecars. Use the [accepted archive handoff](ARCHIVE_HANDOFF.md) and default read-only `verify-release.py` before any load; the coordinator must provide its accepted source/config/manifest/archive identities. No archive has yet been accepted/transferred/loaded at this review.

## First protected staging release

The initial three untracked staging files were hash-checked, preserved under root-only `/srv/morphiume/staging/checkout-handoff/acbe5ce890be43c391b11c03bc1fc20b` and reconciled with published commit7f403a9834aee3f392d182d58f37b1ee12cb56a0. The ordinary fast-forward completed with a clean checkout. For future updates, inspect status and fast-forward only to the coordinator's verified published commit; unknown work must be preserved/reviewed. `reconcile-checkout.py` remains a narrowly scoped helper for the original audited files, not a general cleanup command.

After reviewed source reaches `/opt/morphiume`, execute on the server:

```sh
git -C /opt/morphiume status --short
git -C /opt/morphiume rev-parse HEAD
bash /opt/morphiume/deploy/staging/prepare.sh
```

Preparation creates separate credentials/directories and starts nothing. Set the actual immutable image in `/etc/morphiume-staging/deploy.env` (root-owned 600). Inspect only names/modes, not file contents or rendered secret configuration. Deploy:

```sh
bash /opt/morphiume/deploy/staging/deploy.sh VERIFIED_40_CHARACTER_COMMIT IMMUTABLE_IMAGE
```

This verifies source/image identity, takes a deployment lock, validates quietly, starts the DB, stops app/worker writers, takes an encrypted staging logical backup, runs the migration job once and starts app/worker with readiness checks. It records deployed image/source and retains previous identities. It does not seed automatically. Set `MORPHIUME_KEEP_DB_TUNNEL=1` for the loopback DB integration override during QA/load setup. For an explicitly requested synthetic seed:

```sh
cd /opt/morphiume
docker compose --project-name morphiume-staging --env-file /etc/morphiume-staging/deploy.env -f deploy/staging/compose.yaml run --rm --no-deps migrate node --conditions=react-server runtime/seed.mjs
```

Access from Windows through `ssh -N -L 127.0.0.1:3100:127.0.0.1:3001 morphiume-deploy` and open `http://localhost:3100`. Verify mock controls require authorized admin access, T24 live mocks fail, and the complete T25 journey. Recheck port3000/3001/5432/6379 externally and host IPv4/IPv6 listeners; verify the reserved PostgreSQL mount device and contents still match the audit. Test graceful worker stop and retry/idempotent recovery of outstanding jobs, not merely a running container.

## Rollback

Before migration, review backward compatibility and record the backup and previous image. To roll back the application, stop app/worker, replace only `MORPHIUME_IMAGE` with the recorded previous immutable ID/digest, quietly validate and start app/worker using `up -d --no-build --pull never --wait --wait-timeout 180 app worker`. Run readiness and a purchase smoke test. If schema compatibility is unknown, keep writers stopped and coordinate a forward repair; do not run `down --volumes`, delete database files, or restore over the existing DB. An image rollback does not revert a migration.

## Monitoring and incident ownership

Ops owns host/runtime/backup incidents; Backend owns payment reconciliation, stock invariants and stuck outbox handling; Security owns account compromise. The business owner must choose the actual notification recipient/channel. Until a synthetic alert reaches that recipient, monitoring is not operationally accepted.

Watch app readiness/liveness/error and latency, DB connection/pool waits/locks, worker heartbeat and oldest pending event, delayed verifies/refunds, duplicate/inconsistent inventory, SMS spend, disk/memory/swap/OOM/restarts, backup age/failure and eventual TLS expiry. Structured logs need request/order/payment correlation IDs and redaction of OTPs, secrets, phone/address and provider credentials. Restrict monitoring UI/API. Initial actionable thresholds: disk >80% warning/>90% critical, missing successful logical backup >26h, worker heartbeat >90s; tune latency/pool/queue thresholds from real baselines. A 15-minute RPO will require WAL archiving freshness alerts.

Useful safe diagnostics: `docker compose ... ps`, `docker stats --no-stream`, `df -h`, `free -h`, `systemctl --failed`, `ss -lntp`, redacted/tail-limited application logs. Avoid `docker inspect` environment, `compose config` without `--quiet`, or `cat` secret files in captured output.

For PSP timeout, preserve unknown payment state, pause fulfillment where necessary and reconcile using server-side verification before marking paid. For SMS outage, preserve form/cart and issue no fake successful delivery; inspect retry limits and spend before replaying. Do not fire real adapters from staging.

For full disk, stop heavy new writes/jobs when needed, identify the filesystem, inspect rotating logs and old reviewed images/backups, recover space through reviewed targeted cleanup and check DB/WAL integrity. Never recursively delete database/WAL directories or prune all Docker volumes.

For compromised admin, Security revokes sessions/role and resets the owner authentication/MFA recovery method; preserve audit evidence and pause sensitive payout/refund changes. Rotate affected credentials with their service owner, review product/stock/price/order changes and reconcile payment effects. Do not erase logs or claim recovery from a password change alone.
