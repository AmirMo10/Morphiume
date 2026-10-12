# Protected staging deployment contract

The coordinator owns release/publishing. These settings describe the intended staging stack; server mutation requires the coordinator's explicit dispatch. The user currently requested private-IP infrastructure. Public sales, live payment credentials, live SMS and real customer data are outside this staging contract.

| Boundary | Staging | Reserved live environment |
| --- | --- | --- |
| Compose project | `morphiume-staging` | Existing project `morphiume` |
| Configuration | `/etc/morphiume-staging` | `/etc/morphiume` |
| Database files | `/srv/morphiume/staging/postgres` | Preserve `/srv/morphiume/postgres` and contents |
| Media | `/srv/morphiume/staging/media` | Separate storage selected before live |
| App port | Host `127.0.0.1:3001`, container 3000 | Existing Nginx upstream `127.0.0.1:3000` |
| Access | SSH local tunnel only | Private-IP HTTP infrastructure only for now |
| Browser URL | `http://localhost:3100` through tunnel | Domain/TLS unspecified |
| Mode | `NODE_ENV=production`, `DEPLOYMENT_ENV=staging` | `DEPLOYMENT_ENV=live`; mocks rejected |
| Providers/data | Mock adapters and clearly marked synthetic data only | Real credentials/data kept separate |

The staging Compose file has no database host port, no cache, no container-mounted Docker socket, no host networking and no host configuration mount. Staging has no Nginx route on port 80. Use `ssh -N -L 127.0.0.1:3100:127.0.0.1:3001 morphiume-deploy`; this uses authenticated SSH transport and binds only to local loopback. If network access is later required, add an authenticated TLS proxy and access restriction before exposing mock controls. `noindex` headers are useful but are not access control.

The separately authorized DB-only integration configuration temporarily publishes `127.0.0.1:5433`, forwarded locally through SSH15433. It uses the same staging project/database and a management bridge because publishing is inactive on an internal-only Docker network. The full-stack configuration removes this temporary DB mapping.

## Image and process contract

Use one immutable `linux/amd64` image for app, worker and one-shot migration, built off the deployment server. Node 24.21.0 and pnpm 11.25.0 are pinned. App command is `pnpm start` (`next start --hostname 0.0.0.0 --port 3000`); worker is `pnpm worker` (`node --conditions=react-server --import tsx src/server/worker.ts`); migration is `pnpm db:migrate`; seed is `pnpm db:seed`, explicitly test/staging only. Keep the worker/migration runtime dependencies in the release image; do not prune `tsx` or migration dependencies without bundling and validating those processes.

The coordinator chose the full Next runtime for this initial common image; `next.config.ts` must omit `output: standalone` while using `next start`. Actual package scripts add `node --conditions=react-server --import tsx` for worker/migration/seed. Local Docker Desktop remains unavailable. An explicitly authorized temporary staging-only host build may be considered after compile/tests with a 3GiB cap and DB paused if needed; it has not run. Future live releases require an off-server/CI build and measured resource evidence.

App/worker/migration run as uid/gid 1001, filesystem read-only with writable tmpfs/cache/media paths, dropped capabilities, `no-new-privileges`, PID limits, local rotating logs and a 30-second stop grace. The app readiness probe is `/api/health/ready` with a DB probe and no connection details; liveness is `/api/health/live`. The infrastructure `/healthz` cannot establish application readiness. Worker readiness must track a real successful database polling heartbeat; absence of a heartbeat contract blocks claiming worker health.

PostgreSQL 18.6 bookworm is digest-pinned, uses uid/gid 999 and persists `/var/lib/postgresql` with `PGDATA=/var/lib/postgresql/18/docker` (PostgreSQL 18 image layout). It has separate bootstrap superuser, migration-owner and application passwords. The app/worker role receives DML and sequence permissions; the migration owner receives DDL. No application service receives the bootstrap-superuser credential. Migration and seed are explicit jobs, not a restart-time destructive reset.

Initial resource ceilings: app 1536 MiB/1.5 CPU, worker 384 MiB/0.5 CPU, DB 1280 MiB/1.5 CPU, migration 384 MiB/0.5 CPU only while running. Total persistent ceiling is 3.125 GiB, leaving roughly 1.6 GiB for host and operational overhead on the observed 4.8 GiB host. These are staging ceilings, not measured capacity. Suggested DB starting settings: max_connections=60, shared_buffers=256MB; app pool 10, worker pool 3, migrations pool 2, adjusted by measurements. Avoid simultaneously running a live stack or load generator here.

## Configuration contract

Dedicated read-only JSON config files become the process environment through `deploy/staging/runtime.mjs`. Config files are outside Git, service-scoped and readable by uid 1001 through mounts; parent directory remains root-only. App config contains `DATABASE_URL`, `AUTH_SECRET` (32+ random characters), distinct `ADMIN_AUTH_SECRET`, `MOCK_CONTROL_SECRET`, `APP_BASE_URL`, `MEDIA_ROOT`, `PAYMENT_PROVIDER=mock`, `SMS_PROVIDER=mock`. Worker config has only fields its imports need; migration config uses the owner-role database URL. Do not copy `/etc/morphiume/app.env` or any live merchant/SMS credential.

The worker currently uses the shared `getConfig` validator, so it also requires auth and mock-control fields. `sync-worker-config.py` adds fresh worker-specific auth/control values and the non-secret origin/media fields without rotating any existing value or sharing customer session keys. Deployment checks must actually start the worker and observe a successful tick/heartbeat.

The staging wrapper rejects a deployment mode other than `staging` and non-mock providers, and forwards shutdown to the Linux child process group. The application itself must reject mocks and absent required secrets in live mode; an ops wrapper alone does not prove T24. Never pass runtime secrets into Docker build args, image layers, metadata, tests or public artifacts.

Build images with `--build-arg MORPHIUME_SOURCE_COMMIT=VERIFIED_40_CHARACTER_COMMIT`. Deployment takes that commit and immutable image as explicit arguments and checks the image revision label and checkout before starting services. No app build/start was authorized at encryption-preparation time. The temporary integration override keeps loopback5433 for authenticated SSH QA/load setup when `MORPHIUME_KEEP_DB_TUNNEL=1`; it does not publish a public DB port.

## Acceptance before starting app/worker

1. An off-server image build succeeds; app, worker and migration commands run with the same image.
2. The exact image ID/digest and commit are recorded and Compose parses without printing configuration secrets.
3. Database/migration/seed operate only in the staging project and path; reserved mount device and contents still match the audit.
4. External IPv4/IPv6 checks confirm only intended proxy/SSH ports. App is accessible only through the tunnel.
5. Readiness, worker heartbeat, graceful stop, restarted jobs and a real isolated backup/restore rehearsal pass.
6. Critical/high confirmed security findings, money/inventory invariant failures and fake payment success block release.
