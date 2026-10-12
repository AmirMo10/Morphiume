# Official operations sources

Observed on 2026-10-12. Version pins come from registry manifests or installed-package output, not assumed current-version numbers. The Context7 CLI failed locally with `ERR_MODULE_NOT_FOUND: chalk`; these official sources were read directly.

| Source | Application |
| --- | --- |
| [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/) | Official Apt repository; installed package audit |
| [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) | DB health gating and successful one-shot migration ordering |
| [Compose services reference](https://docs.docker.com/reference/compose-file/services/) | Loopback port binding, caps, resources, tmpfs, restart, mounts |
| [Compose up CLI](https://docs.docker.com/reference/cli/docker/compose/up/) | Actual `up --wait --wait-timeout` behavior |
| [Docker packet filtering/firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/) | Docker-published traffic can bypass UFW; verify exposure |
| [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) | Service-specific secret-file mounts; local Compose uses bind mounts |
| [Dockerfile reference](https://docs.docker.com/reference/dockerfile/) | Multi-stage image and nonroot USER |
| [Build best practices](https://docs.docker.com/build/building/best-practices/) | Digest pins and separation of build/runtime |
| [Build context](https://docs.docker.com/build/concepts/context/) | Dockerfile-specific ignore file excludes local secrets/build output |
| [Docker GitHub Actions](https://docs.docker.com/build/ci/github-actions/) | Off-server Buildx build/push and SBOM/provenance |
| [Docker daemon access](https://docs.docker.com/engine/security/protect-access/) | SSH-managed daemon; no public Docker API |
| [Official PostgreSQL image](https://hub.docker.com/_/postgres) | 18.6-bookworm candidate, PG18 volume layout, nonroot and password-file support |
| [Official Node image](https://hub.docker.com/_/node) | 24.21.0 LTS deployment image candidate |
| [PostgreSQL dump](https://www.postgresql.org/docs/current/backup-dump.html) | Custom-format logical backup and restore scope |
| [PostgreSQL pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html) | Exit-on-error isolated restore |
| [PostgreSQL PITR](https://www.postgresql.org/docs/current/continuous-archiving.html) | Base backup plus continuous WAL, recovery-point evidence |
| [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) | Same build across instances, cache and graceful shutdown considerations |
| [Official age encryption project](https://github.com/FiloSottile/age) | Ubuntu package installation, dedicated X25519 identity/recipient and authenticated stream encryption/decryption |

Encryption preparation actually installed Ubuntu's signed Apt package `age=1.1.1-1ubuntu0.24.04.3`; `age --version` returned1.1.1. A dedicated identity remains outside the repository in ignored user-protected local storage; only its recipient is stored on the server. An actual encryption/decryption digest roundtrip passed. This is encryption evidence, not a completed database restore or offsite backup.

Registry manifest read: PostgreSQL 18.6-bookworm index digest `sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c`, amd64 manifest `sha256:9551dd5bf356409a21b31248f49b33bba9bb1877365f3a7e933aecd9af3cf52d`. Node 24.21.0-bookworm-slim index digest `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`. Re-read pinned manifests at release; do not silently replace a digest when its tag changes.
