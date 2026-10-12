# Environment audit — 2026-10-12

This is observed evidence, not a production-readiness claim. The audit used SSH alias `morphiume-deploy` with strict host-key verification. No server configuration, image, directory, database or service was changed during this audit.

| Item | Observed result |
| --- | --- |
| Host | `morphiume`, Ubuntu 24.04.5 LTS, `x86_64`, 4 CPU cores |
| Memory | 4.8 GiB RAM, 4.2 GiB available at audit; 4 GiB swap unused |
| Docker | Engine 29.9.0; Compose 5.6.0; Buildx 0.38.0; official Ubuntu Apt source |
| Docker storage | `/var/lib/docker`, overlayfs, local log driver; `/var` 37 GiB available |
| Root filesystem | 20 GiB available; proposed staging data will consume this filesystem |
| Reserved PostgreSQL filesystem | `/dev/mapper/vg0-lv--2`, ext4, 32 GiB at `/srv/morphiume/postgres`, 30 GiB available; only `lost+found` observed |
| Services | Docker and Nginx active/enabled; zero failed systemd units; Nginx configuration valid |
| Listeners | SSH 22 and Nginx 80 on IPv4 and IPv6; no 443, app, DB or cache listener |
| Firewall | UFW active; incoming/routed default deny; TCP 22/80/443 allowed on IPv4 and IPv6 |
| App configuration | `/etc/morphiume` mode 700; live `app.env` and `deploy.env` root:root mode 600; contents were not read |
| Source checkout | `/opt/morphiume` clean at `885d891de81c5b258707399e40eb6e2c043849b4` during audit |
| Containers | None running; only historical `hello-world` and Nginx images cached |
| Host tools | curl and jq available; node/npm/npx/psql/pg_dump/pg_restore absent from PATH |
| External check from Windows | `/healthz` HTTP 200, `morphiume server ready`; TCP 3000/3001/5432/6379 did not connect within 2 seconds |

The IPv4 TCP checks apply to this private network and this source computer only. No external IPv6 route, Internet reachability or mobile/ISP path in Iran was tested. UFW alone does not establish Docker exposure safety; repeat port checks after containers start.

Local initial tooling: Node 24.19.0, pnpm 11.25.0, Windows Docker client 29.8.0 and Buildx 0.37.1. The Docker daemon was unavailable at first audit. The coordinator subsequently requested Docker Desktop startup; daemon readiness still needs verification before local builds. The deployment runtime contract was updated to Node 24.21.0, the current official LTS image candidate. Do not claim a local 24.21.0 build until the runtime is actually used.

Commands executed included `docker version`, `docker compose version`, `docker buildx version`, `docker ps`, `docker images`, `docker info`, `free -h`, `df -h`, `findmnt`, `stat`, `du`, `ss -lntp`, `systemctl --failed`, `nginx -t`, `ufw status verbose` and checkout status/revision. Registry manifests were read with `docker buildx imagetools inspect`. The Context7 CLI attempt through `pnpm dlx ctx7@latest` failed with missing `chalk`; official documentation was read directly instead.

See [deployment contract](STAGING_CONTRACT.md), [sources](SOURCES.md) and [prerequisites](PREREQUISITES.md) for decisions and remaining evidence.

## Authorized staging database setup

After explicit coordinator dispatch on 2026-10-12, only staging files were transferred through `/tmp/morphiume-staging.NmuFyIBO` and installed under `/opt/morphiume/deploy/staging`. `prepare.sh` created `/etc/morphiume-staging` and `/srv/morphiume/staging`; no live configuration was copied. Database pull/start logs and preparation log are retained under root-only staging storage.

`compose.db.yaml` started `morphiume-staging-db-1` healthy with the pinned PostgreSQL image. Actual `SHOW server_version` returned `18.6 (Debian 18.6-1.pgdg12+2)` and container `id` returned uid/gid 999. Both migration-owner and runtime roles have `rolsuper=false`, `rolcreatedb=false`, `rolcreaterole=false`; schema CREATE permission is false for runtime and true for migration owner. The DB has explicit 1280MiB/1.5CPU limits. DB-only integration access binds `127.0.0.1:5433`; `ss` confirmed the loopback listener and no IPv6 DB listener. An internal-only Docker network did not publish the configured port, so the temporary integration compose adds a management bridge; full-stack compose removes integration access.

App/worker/migration JSON files are mode 600 owned by uid/gid1001, mounted read-only for later processes; bootstrap DB password is mode600 uid/gid999, configuration parent is root:root700. Values were not printed. Local ignored staging connection/config copies have a user-only Windows ACL. Hidden SSH tunnel PID22264 provides local `127.0.0.1:15433` to server loopback5433; it must be checked/recreated if that process ends. No app or worker started.

Actual password authentication from Windows through the tunnel succeeded for both roles using the application's installed `pg` driver. External TCP5433 from Windows did not connect within two seconds. Targeted inspect confirmed DB uid999, memory limit1342177280 bytes, CPU quota1.5, read-only root filesystem and all capabilities dropped. Infrastructure health remained HTTP200 and systemd still had no failed units. No external IPv6 route was available for an IPv6 connection check.

After setup/recreation, the reserved mount remained `/dev/mapper/vg0-lv--2` ext4 at `/srv/morphiume/postgres` containing only `lost+found`. This setup is synthetic staging infrastructure, not a live sales deployment.

## Configuration checks completed

- Node syntax and launcher behavior: valid config reached the child, live mode was rejected, malformed JSON did not print its secret marker, unapproved environment injection was rejected, and a real payment provider was rejected.
- PowerShell bootstrap parsed successfully; Bash `-n` passed for initdb/prepare/deploy/backup/restore scripts.
- Staging, DB-only integration, local DB and restore Compose configurations passed quiet validation. Only the server DB-only configuration was actually started.
- `morphiume-ops` passed the official `quick_validate.py` using PyYAML installed into ignored `deploy/staging/.local/validation-libs`; no global Python dependency was changed. Private staging files are confirmed ignored by Git.
- `git diff --check` passed. Docker image build/start, app/worker readiness, backup/restore, alert delivery, 200VU capacity and Iran network/device tests have not been executed by this ops task.

## Resumed preparation

The resumed audit found only the staging DB healthy, roughly39MiB RAM and1% sampled CPU,4.1GiB host RAM available, six migrations applied, and the reserved mount still unchanged. No app/worker was running. Ubuntu's signed age package1.1.1-1ubuntu0.24.04.3 was installed; the dedicated encryption/decryption digest self-test passed with the private identity held only in ignored user-protected local storage. The server received only a public recipient file. This was an encryption self-test, not a real DB restore.

Worker configuration was completed because the current shared runtime validator requires additional fields. Existing values, including its database credential, were preserved; newly required worker-specific auth/control values were generated independently. Mode600 uid1001 and required-key/distinct-secret checks passed. Source worker is `src/server/worker.ts`; the replacement image runs its bundled `runtime/worker.mjs` directly with Node and react-server conditions.

The three original untracked staging files were compared by exact audited hashes, preserved with a manifest under `/srv/morphiume/staging/checkout-handoff/acbe5ce890be43c391b11c03bc1fc20b`, and the server fast-forwarded to published source7f403a9834aee3f392d182d58f37b1ee12cb56a0. Checkout was clean afterward, only the DB remained healthy, and the reserved mount remained unchanged. Reconciliation log is `/srv/morphiume/staging/reconcile-checkout.log`.

The initial CI config-free Docker build succeeded but the bookworm/full-install image failed Grype's high-severity gate; it was not published/deployed. The pinned minimal Alpine replacement has not yet completed its actual image checks. A local isolated351-file CLI dependency probe imported pg, Better Auth crypto, dotenv, zod and server-only; an authenticated SELECT1 through15433 and real password hashing passed. Missing-package rejection and env/private/build-file exclusion passed. This Windows Node24.19 probe verifies closure behavior, not the Linux24.21 native image or its scan. It exposed and fixed missing intermediate pnpm junction links in NFT output.

Staging health instrumentation was added after checkpoint1a4fa4433d720b490ce222e8898cb09f73ba4abf. An actual DB-only snapshot returned exit0/healthy; app/worker were intentionally absent. Explicit expected-app/backup mode correctly returned exit2 for missing services/readiness/backup, without notification delivery. Current fixture queue was pending136/dead0 before worker/load; oldest~8524s at the first probe. A15-second host/container/DB metrics smoke completed at `/srv/morphiume/staging/metrics/predeploy-health-smoke-20261012.jsonl`.

The source/path boundary guard passed against the exact reserved ext4 mount and staging paths. Bash syntax passed for boundary/preparation/deployment/backup/restore/init scripts; Python AST and Ubuntu `systemd-analyze verify` passed for the health script and four prepared timer/service units. `systemd-analyze calendar` accepted daily03:00UTC. Only temporary validation files inside staging metrics were created/removed; no unit was installed, no timer enabled and no app/image changed. Actual worker-stop/recover alert drill, scheduled backup success, owner alert receipt, full restore and capacity evidence remain pending.
