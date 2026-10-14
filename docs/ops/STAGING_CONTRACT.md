# Protected staging deployment contract

## Current accepted ACF8 runtime — 2026-10-14T07:53:23.596075+00:00

The running application is acf8e96ee348c487df0fcefe89d568f2bf93367a with immutable Engine sha256:5bf00e2bc40523dd9eaf85d7ef50eecc320bd2c40baf6d10cc38e65e66e2b482, frozen Ops68, schema13 and protected private-IP origin http://192.168.240.51. Read [actual deployment, native purchase, isolated restore and scheduler evidence](ACF8_STAGING_EXECUTION.md) before another action. App/worker are healthy and both existing timers active/enabled at the observation. All three stopped restore pairs, reserved storage and owner data remain preserved. Published tools come from c7b1f0ee210fb0a6a6eeb57462bf2ad6c5c51022; checkout stays ACF8. Main reports/tools do not redeploy an image. Local backups, mock providers and no TLS/offsite/PITR remain the explicit scope.

The E4 and generic sections below are historical procedures, not the current release or an instruction to replay a first-deploy/seed/restore command. Never start613 against schema13 or overwrite an existing restore. A new operation requires exact source/image/profile and individually hashed tool bindings.

## Current E4 runtime — 2026-10-13, 11:19 UTC

The accepted application is `e4bed691dc938a9c0f79022696d24f063ad97724`, immutable runtime image `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d`, with the separately frozen Ops68 bundle. App/worker use project `morphiume-staging-runtime`, configuration `/etc/morphiume-staging-runtime`, storage `/srv/morphiume/staging/runtime` and database `morphiume_staging_runtime` (13 migrations, 53 tables). The original staging database and `/srv/morphiume/postgres` remain separate and preserved.

Current browser origin is `http://192.168.240.51`, restricted to the reviewed client CIDR and distinct Basic authentication on every route. Unknown Host/IPv6 routes are denied; application3001 and PostgreSQL5433 remain host-loopback only. Three actual browser engines and independent financial/cleanup checks passed before operator acceptance. [Private-preview execution](../qa/E4_PRIVATE_PREVIEW_EXECUTION.md), [accepted image](E4_ACCEPTED_IMAGE_EVIDENCE.md), [cutover](E4_RUNTIME_CUTOVER_EXECUTION.md).

The SSH3100 origin and generic project settings below are historical preparation contracts, not the active browser/auth origin. Do not redeploy from those examples or resume the old613 consumer against schema13. New releases require a newly tested image and explicit compatible migration; pushing operations/docs to main does not replace the accepted image. HTTPS/domain, live providers, offsite/PITR and owner activation remain separate prerequisites.

## Historical initial preparation

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

Use one immutable `linux/amd64` image for app, worker and one-shot migration, built off the deployment server. Both build/runtime stages pin Node24.21.0 Alpine3.24 by digest; only the builder uses pnpm11.25.0. The app runs `node server.js` from Next standalone. Worker, migration and seed run `node --conditions=react-server runtime/worker.mjs`, `runtime/migrate.mjs` or `runtime/seed.mjs`; seed is explicitly test/staging only. Runtime has no npm, pnpm, Yarn, tsx or esbuild installation. Repository development scripts still use the package manager and TypeScript loader locally.

`pnpm build` produces Next standalone, bundles the three CLI entrypoints, runs `deploy/staging/trace-runtime.mjs` to merge the CLI dependency closure, and copies public/static assets. The tracer uses Next's packaged NFT with node/react-server/production conditions, copies only traced node_modules files and relocates pnpm links. It excludes env/private/build files and fails unknown unresolved imports. PostgreSQL's unused native driver and guarded Cloudflare socket import are documented optional tracing paths; they are not vulnerability-scan exclusions. CI must run the actual image migration, seed, app, worker, native MFA and Sharp media flow before scanning/publishing.

The first off-server image build succeeded, but its bookworm/full-install image failed Grype's high-severity gate and was not published. The replacement minimal Alpine image is a candidate until CI functional tests and the unchanged scan gate pass. Switching only to Debian trixie does not resolve the observed unfixed GnuTLS advisory. Alpine3.24's published musl1.2.6-r2 meets Sharp's x64 requirement >=1.2.5; server SSE4.2 was verified. Both stages use musl so Linux native dependencies are installed for the same target. Local Docker Desktop remains unavailable. No temporary host build has run; any staging-only exception needs explicit dispatch, resource limits and observed results. Future live releases require an off-server/CI build.

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
