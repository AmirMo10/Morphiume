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
| [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) | Traced server.js runtime and explicit public/static asset copy |
| [Node official Alpine Dockerfile](https://github.com/nodejs/docker-node/blob/main/24/alpine3.24/Dockerfile) | Alpine3.24, musl build, libstdc++ runtime, npm/Yarn paths removed from final stage |
| [Sharp installation](https://sharp.pixelplumbing.com/install/) | Linux x64 musl >=1.2.5, SSE4.2 and optional native dependencies |
| [Alpine3.24 musl package](https://pkgs.alpinelinux.org/package/v3.24/main/x86_64/musl) | Published musl1.2.6-r2 compatibility candidate |
| [Vercel NFT](https://github.com/vercel/nft) | CLI dependency closure and conditional exports |
| [PostgreSQL runtime stream selection](https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/stream.js) | Guarded Cloudflare socket versus Node net/tls path |
| [Debian GnuTLS advisory](https://security-tracker.debian.org/tracker/CVE-2026-95210) | Bookworm and trixie packages both listed vulnerable; distro bump alone does not resolve it |
| [Official age encryption project](https://github.com/FiloSottile/age) | Ubuntu package installation, dedicated X25519 identity/recipient and authenticated stream encryption/decryption |
| [systemd timer reference](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml) | Prepared local timer/calendar behavior; actual installed-unit validation required |
| [systemd execution reference](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml) | Read-only host paths, explicit write paths, privilege and tmp restrictions for prepared units |
| [OpenSSL2026-09-29 advisory](https://openssl-library.org/news/secadv/20260929.txt) | Four scanned OpenSSL IDs fixed in3.5.9; upstream severity/trigger distinctions |
| [Alpine3.24 signed main index](https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/APKINDEX.tar.gz) | Actual libcrypto3/libssl3/openssl3.5.9-r0 and zlib1.3.2-r1 availability |
| [Alpine3.24 security DB](https://secdb.alpinelinux.org/v3.24/main.json) | zlib fixed1.3.2-r1; OpenSSL secfix data lag at observation |
| [Node official release index](https://nodejs.org/dist/index.json) | Actual latest22/24/26 embedded OpenSSL versions; APK updates do not patch static Node |
| [Node24.21 SecureContext source](https://github.com/nodejs/node/blob/v24.21.0/src/crypto/crypto_context.cc) | TLS method selection and unknown DTLS method rejection |
| [Node24.21 TLS source](https://github.com/nodejs/node/blob/v24.21.0/src/crypto/crypto_tls.cc) | SSL_set_SSL_CTX in server SNI context selection |
| [Node24.21 QUIC documentation](https://github.com/nodejs/node/blob/v24.21.0/doc/api/quic.md) | Experimental QUIC requires a flag; actual release audit remains required |
| [Docker image save](https://docs.docker.com/reference/cli/docker/image/save/) | Accepted platform tar/gzip export and explicit platform selection |
| [Docker image load](https://docs.docker.com/reference/cli/docker/image/load/) | Gzip input and platform-filtered loading; no application start |
| [OCI image configuration](https://github.com/opencontainers/image-spec/blob/main/config.md) | Config SHA256 image ID and uncompressed-layer diff-ID verification |
| [GitHub artifact download](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) | Exact-run authenticated artifact retrieval and expiry |

Encryption preparation actually installed Ubuntu's signed Apt package `age=1.1.1-1ubuntu0.24.04.3`; `age --version` returned1.1.1. A dedicated identity remains outside the repository in ignored user-protected local storage; only its recipient is stored on the server. An actual encryption/decryption digest roundtrip passed. This is encryption evidence, not a completed database restore or offsite backup.

Registry manifests read: PostgreSQL18.6-bookworm index `sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c`, amd64 manifest `sha256:9551dd5bf356409a21b31248f49b33bba9bb1877365f3a7e933aecd9af3cf52d`. Replacement Node24.21.0-alpine3.24 index `sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`; compared Node24.21.0-trixie-slim index `sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66`. Initial failed Node24.21.0-bookworm-slim index was `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`. Re-read pins at release; do not silently replace a digest when its tag changes. Official Alpine Dockerfile's x64 musl binary is sourced from the Node project's unofficial-builds service with a hard checksum; Linux image smoke and scan remain required.
