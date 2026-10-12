# Operations runbook

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

Substitute the reviewed commit tag. The image must contain app, worker, tsx and migrations and must be validated before transfer. Registry publication needs coordinator authorization; alternatively `docker save --output deploy/staging/.local/release.tar morphiume:REVIEWED_COMMIT`, SHA-256 the file, transfer through SSH to a protected staging directory and verify checksum before `docker load --input`. Set `MORPHIUME_IMAGE` to the exact loaded `sha256:<image-id>` or reviewed registry `image@sha256:<digest>`, not a moving tag. Do not pass production secrets to builds. An offline build is not promised without complete verified package/base-image caches.

## First protected staging release

Before fast-forward, use `reconcile-checkout.py VERIFIED_COMMIT` in inspection mode after fetching the published commit. It accepts only the three audited original staging file hashes and compares each with the published file, preserving differences in its manifest. `--apply` relocates those exact known originals under root-only `/srv/morphiume/staging/checkout-handoff/<id>` and performs an ordinary fast-forward. Unknown/unreviewed work makes it stop. Do not use blanket clean/reset. The initial server checkout has three untracked files that otherwise conflict with newly published source.

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
docker compose --project-name morphiume-staging --env-file /etc/morphiume-staging/deploy.env -f deploy/staging/compose.yaml run --rm --no-deps migrate pnpm db:seed
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
