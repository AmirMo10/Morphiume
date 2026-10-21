# VPS dependency and version matrix

Prepared on 2026-10-20. This records the reproducible baseline and the package-upgrade candidate requested before the replacement-VPS handoff. OVF is not required. Software versions, database/media state, host configuration and secrets are separate inputs to a reconstruction; a Git checkout alone does not reproduce the current shop.

The currently running application source remains `32b89e13d31288fe4497f7419e170550baf5b293`, Engine image `sha256:a72b341aaef4dc0006f3073015aac228cba692afca73ebbab49a1da9883b5391`. Main at the beginning of this work was `549b4acef7b1e40233fff7c238a318a0f6246a78`; its later catalog/tool/report content does not identify a newer running application image. The six demo products and their served media are database/filesystem state. See [accepted image evidence](../qa/PROFESSIONAL_REDESIGN_RELEASE.md) and [catalog acceptance](../qa/DEMO_CATALOG_EXECUTION.md).

## Application packages

The following baseline is the pre-upgrade `package.json` and lockfile. Registry metadata was actually fetched from the first-party npm registry at `2026-10-20T06:17:33.626Z`; the selected column is a candidate until the coordinator records its exact CI/image acceptance. An available version or a successful metadata query is not an installed/tested/deployed upgrade. No prerelease was selected. No latest direct-package record returned a deprecation notice.

| Package | Baseline exact pin | Registry latest stable | Selected compatible candidate |
| --- | --- | --- | --- |
| [@better-auth/drizzle-adapter](https://registry.npmjs.org/@better-auth%2Fdrizzle-adapter) | 1.7.7 | 1.7.11 | 1.7.11 |
| [@better-auth/utils](https://registry.npmjs.org/@better-auth%2Futils) | 0.4.2 | 0.5.0 | 0.5.0 |
| [better-auth](https://registry.npmjs.org/better-auth) | 1.7.7 | 1.7.11 | 1.7.11 |
| [dotenv](https://registry.npmjs.org/dotenv) | 18.0.7 | 18.0.8 | 18.0.8 |
| [drizzle-orm](https://registry.npmjs.org/drizzle-orm) | 0.45.4 | 0.45.4 | 0.45.4 |
| [next](https://registry.npmjs.org/next) | 16.4.0 | 16.4.2 | 16.4.2 |
| [pg](https://registry.npmjs.org/pg) | 8.23.1 | 8.23.1 | 8.23.1 |
| [react](https://registry.npmjs.org/react) | 19.3.0 | 19.3.1 | 19.3.1 |
| [react-dom](https://registry.npmjs.org/react-dom) | 19.3.0 | 19.3.1 | 19.3.1 |
| [server-only](https://registry.npmjs.org/server-only) | 0.0.1 | 0.0.1 | 0.0.1 |
| [sharp](https://registry.npmjs.org/sharp) | 0.35.5 | 0.35.5 | 0.35.5 |
| [tsx](https://registry.npmjs.org/tsx) | 4.23.15 | 4.23.15 | 4.23.15 |
| [zod](https://registry.npmjs.org/zod) | 4.6.6 | 4.6.7 | 4.6.7 |
| [@axe-core/playwright](https://registry.npmjs.org/@axe-core%2Fplaywright) | 4.13.0 | 4.14.0 | 4.14.0 |
| [@eslint/js](https://registry.npmjs.org/@eslint%2Fjs) | 10.0.1 | 10.0.1 | 10.0.1 |
| [@next/eslint-plugin-next](https://registry.npmjs.org/@next%2Feslint-plugin-next) | 16.4.0 | 16.4.2 | 16.4.2 |
| [@playwright/test](https://registry.npmjs.org/@playwright%2Ftest) | 1.64.0 | 1.64.1 | 1.64.1 |
| [@tailwindcss/postcss](https://registry.npmjs.org/@tailwindcss%2Fpostcss) | 4.3.3 | 4.3.3 | 4.3.3 |
| [@types/node](https://registry.npmjs.org/@types%2Fnode) | 24.19.2 | 26.6.5 | 24.19.2: latest stable 24.x, matches runtime major |
| [@types/pg](https://registry.npmjs.org/@types%2Fpg) | 8.23.1 | 8.23.1 | 8.23.1 |
| [@types/react](https://registry.npmjs.org/@types%2Freact) | 19.3.0 | 19.3.0 | 19.3.0 |
| [@types/react-dom](https://registry.npmjs.org/@types%2Freact-dom) | 19.3.0 | 19.3.0 | 19.3.0 |
| [drizzle-kit](https://registry.npmjs.org/drizzle-kit) | 0.31.11 | 0.31.11 | 0.31.11 |
| [esbuild](https://registry.npmjs.org/esbuild) | 0.28.2 | 0.28.2 | 0.28.2 |
| [eslint](https://registry.npmjs.org/eslint) | 10.12.0 | 10.13.0 | 10.13.0 |
| [eslint-plugin-react-hooks](https://registry.npmjs.org/eslint-plugin-react-hooks) | 7.1.1 | 7.1.1 | 7.1.1 |
| [tailwindcss](https://registry.npmjs.org/tailwindcss) | 4.3.3 | 4.3.3 | 4.3.3 |
| [typescript](https://registry.npmjs.org/typescript) | 6.0.3 | 7.0.2 | 6.0.3: latest compatible stable 6.x |
| [typescript-eslint](https://registry.npmjs.org/typescript-eslint) | 8.71.1 | 8.72.0 | 8.72.0 |
| [vitest](https://registry.npmjs.org/vitest) | 5.0.3 | 5.0.5 | 5.0.5 |

The first thirteen rows are production dependencies; the remaining seventeen are development/test dependencies. The final image uses the traced standalone/runtime closure rather than a full development install; classify a package by the image's actual closure before claiming its absence. See [package manifest](../../package.json), [full transitive lock](../../pnpm-lock.yaml), [workspace build allowlist/overrides](../../pnpm-workspace.yaml), [runtime tracing](../../deploy/staging/trace-runtime.mjs) and [Dockerfile](../../deploy/staging/Dockerfile).

Compatibility decisions are explicit:

- `typescript-eslint@8.72.0` declares TypeScript `>=4.8.4 <6.1.0`. TypeScript 7.0.2 cannot be called compatible with this toolchain. Keep 6.0.3 until a separately reviewed migration can satisfy the peer contract.
- React/React DOM move together: `react-dom@19.3.1` requires React `^19.3.1`. Next and its ESLint plugin likewise share the selected patch version.
- Better Auth and its adapter move together to 1.7.11; the adapter permits utils `^0.4.2 || ^0.5.0`. Real hashing/login, admin MFA, session separation, CSRF and role tests remain acceptance requirements after resolution.
- Playwright 1.64.1 needs its own matching Chromium/Firefox/WebKit artifacts. A cache from 1.64.0 is not a newly accepted browser toolchain. These binaries and OS browser libraries belong on CI/test runners, not the serving VPS.
- Existing `@esbuild-kit/core-utils>esbuild=0.25.12` override and the explicit `esbuild`, `sharp`, `unrs-resolver` build allowlist must remain intentional. Do not remove a compatibility override merely to make every transitive version numerically newest.

## Node, package manager and container OS

| Layer | Accepted baseline | Upgrade consideration / placement |
| --- | --- | --- |
| CPU platform | `linux/amd64` | The accepted application and PostgreSQL images are amd64. Select an x86-64 VPS; ARM requires a separate build and acceptance. |
| Node runtime | 24.21.0 | Official index now lists **24.22.0**, dated 2026-10-14, LTS Krypton. Latest overall 26.12.0 was marked non-LTS at this observation. Keep the supported 24.x runtime contract and 24.x type definitions unless explicitly migrating major. Node is inside the image. |
| Package manager | `pnpm@11.25.0` | Registry latest is **12.14.0**; latest 11.x is **11.28.6**. A major-12 candidate requires configuration/lock compatibility and a fresh frozen install before acceptance. pnpm is a build/test dependency, not an app-container or VPS runtime prerequisite. |
| Lockfile | format `9.0`, exact specifiers and integrity records | Regenerate only with the selected pinned pnpm, review transitive changes, then verify a clean `pnpm install --frozen-lockfile`; preserve the lock in Git. |
| App base | `node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1` | This is Alpine/musl inside the image, independently of Ubuntu/glibc on the host. A Node/base-image update needs a new exact digest and image acceptance; never replace only a tag. |
| App dynamic libraries | `libcrypto3=3.5.9-r0`, `libssl3=3.5.9-r0`, `zlib=1.3.2-r1` | These are `apk` packages in the container. Do not request these package names/versions from Ubuntu Apt. Updating them does not update the OpenSSL statically embedded in Node. |
| Native modules | Sharp 0.35.5 with traced native closure | Require actual WebP encoding/dynamic-addon checks on the final musl image; a Windows install cannot prove Linux native compatibility. |
| PostgreSQL server and tools | `postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c` | PostgreSQL is a separate Debian-container image. Its `psql`, `pg_dump` and `pg_restore` are invoked with `docker exec`; they are not required in host PATH. Keep server/dump/restore tool compatibility and PG18 `/var/lib/postgresql/18/docker` layout. |

Sources actually consulted: [official Node release index](https://nodejs.org/dist/index.json), [pnpm registry metadata](https://registry.npmjs.org/pnpm), [pnpm configuration reference](https://pnpm.io/settings), [official Node image](https://hub.docker.com/_/node) and [PostgreSQL image](https://hub.docker.com/_/postgres). The current pnpm reference places `saveExact`/`engineStrict` in `pnpm-workspace.yaml`; `.npmrc` is for authentication/registry settings. Review the repository's historical `.npmrc` values when adopting pnpm 12 rather than silently losing those policies.

## Ubuntu host packages

Use Ubuntu **24.04 LTS amd64** for the least-change reconstruction. The historical source-host audit observed 24.04.5, Docker Engine 29.9.0, Compose 5.6.0, Buildx 0.38.0 and age `1.1.1-1ubuntu0.24.04.3`; these are dated observations, not newly verified destination pins or a recommendation to freeze all OS security updates. The fresh source inventory and selected target manifest must identify actual installed Apt versions and architecture before transfer. Follow the signed [Docker Ubuntu repository instructions](https://docs.docker.com/engine/install/ubuntu/) when selecting packages.

| Ubuntu package / provider | Needed on serving host | Purpose and boundary |
| --- | --- | --- |
| `openssh-server`, `openssh-client` | Yes | Administrative access and transport; independently verify the **new** host key. Never reuse the old host's fingerprint as the destination identity. |
| `ca-certificates`, `curl`, `gnupg` | Yes for preparation/updates | Trusted HTTPS and repository key inspection; do not disable TLS checks. |
| `git` | Yes for the tracked checkout/tool handoff | Repository source/tools only; no credential or database transfer through Git. |
| `nginx`, `nginx-common` | Yes | Reverse proxy, approved Host/client restriction and loopback application forwarding. TLS tooling is additional only when a public-domain release is separately configured. |
| `python3`, `python3-minimal` | Yes | Versioned release, preservation, backup/restore and scheduler tools use Python standard-library APIs, including `fcntl`, `subprocess`, `hashlib`, `json` and `pathlib`. No PyPI package install or virtualenv is required for those tools. |
| `age` | Yes | Encrypted DB/media stream capture and recovery. Keep recovery identity separately protected; a public recipient on the server cannot decrypt backups. |
| `tar`, `gzip`, `coreutils`, `findutils` | Yes | Media/image streams, digests and filesystem operations. Generally present in the base OS; verify rather than assume. |
| `util-linux` | Yes | `findmnt`, filesystem/mount checks and supporting administrative tools. Python itself supplies the deployment flock API. |
| `systemd`, `systemd-sysv` | Yes | Actual service manager and health/backup timers; a minimal container OS without systemd is not an equivalent VPS. |
| `iproute2`, `procps` | Yes | `ss`, listener/process/memory diagnostics. |
| `ufw`, `unattended-upgrades` | Yes for the documented host policy | Firewall and security updates; preserve SSH access and verify Docker-published IPv4/IPv6 exposure independently of UFW. |
| `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin` from Docker's signed Apt repository | Yes | Runtime Engine and Compose. Do not mix/conflict with Ubuntu `docker.io`, legacy `docker-compose`, `podman-docker`, standalone `containerd`/`runc` packages. Review existing installations before replacing anything. |
| `docker-buildx-plugin` | Build host required; source host historically has it | Image build/provenance/SBOM occur off the deployment VPS. An exact inventory clone may retain it, but normal serving/restore does not require building images on the VPS. |
| `jq` | Optional | Human/operator metadata inspection; Python tools do not require it. |
| `postgresql-client-*`, host `postgresql` | No | The pinned DB container supplies the version-matched PostgreSQL server and client binaries. Do not start an unintended second host DB. |
| host `nodejs`, `npm`, pnpm, `build-essential`, `libvips-dev` | No | The accepted image includes Node and its native runtime closure. Build tools belong off-host. |
| Redis, Kafka, Kubernetes, a separate search server | No for current architecture | PostgreSQL handles the current application's durable state/queues/search; these are not reconstruction prerequisites. |
| Chromium/Firefox/WebKit, X11/browser libraries, k6 | No on serving host | Use separate test/load runners. Do not consume the serving VPS's resource margin by installing/running the CI browser suite there. |
| `rsync`, Certbot or another ACME client | Optional by transfer/TLS design | Not dependencies of the accepted private-IP runtime. Add only for a concrete chosen transport/public TLS workflow. |

The old [provision script](../../deploy/provision.sh) installs the original host scaffold, not the whole currently accepted runtime. It does not install `age`, restore the current DB/media/secrets, reproduce immutable release approvals or retarget the current private-preview capability. Do not replay historical first-deploy/seed/restore commands to reconstruct a new host. See [runtime Compose](../../deploy/staging/runtime/compose.yaml), [database Compose](../../deploy/staging/compose.db.yaml), [backup implementation](../../deploy/staging/runtime/backup.py), [restore implementation](../../deploy/staging/runtime/restore.py) and the replacement-VPS migration runbook.

## Build, test and publishing dependencies

The build/test runner needs selected pinned Node/pnpm, Python 3, Git, Docker Engine/Buildx, the pinned PostgreSQL image, the matching Playwright browser package and OS dependencies. Existing CI uses `ubuntu-24.04`; tools are obtained from verified upstream artifacts. Current source pins are Gitleaks 8.30.1 and Grype 0.121.0, with checksums in [verify workflow](../../.github/workflows/verify.yml). Those scanners and GitHub artifact/publishing actions are CI dependencies; they are not shop-runtime services. [Load launcher](../../scripts/run-load.mjs) requires the verified k6 2.3.0 binary only for an explicitly scoped external load run.

Perform `pnpm install --frozen-lockfile`, lint, typecheck, unit/integration tests, production audit and build on the candidate; then the three-browser source suite and the independently built image suite/native audit/scan before accepting the new image. An upgrade must have its own recorded source, lock/base-image hashes, CI run, immutable image/archive and runtime evidence. The prior accepted 925 tests and 90 source plus 90 image browser cases belong to source `420990541325706cd120b98e5bea3fd4b32f22a4` (CI 39258176797); they must not be assigned to the new dependency candidate.

## What this dependency audit actually executed

Read repository instructions/specification, dependency/lock/workspace configuration, Dockerfile, CI workflow and relevant runtime/backup/restore code. Used Node **24.21.0** locally for read-only npm metadata requests and an independent manifest/lock/installed-version comparison: **30 of 30** direct pins matched, with zero mismatches. Baseline raw SHA-256: `package.json` `4aeaed9f0eb7e9e815a44ea47f4be87db13c43ce4af59f44fe6b3243aa07d832`; `pnpm-lock.yaml` `ad1126afdfe5fd6cc14b074a902a237e073c8da0528154b0184b4949d419e888`. These are pre-upgrade identities, not final candidate hashes.

The first local metadata command failed because it mixed `require()` with top-level `await`; the corrected ES-module command succeeded. The documentation helper `ctx7@latest library pnpm ...` was invoked through `npx` and returned `fetch failed`; official pnpm/Node pages and registry metadata were read directly instead. No server access, credential reads, application dependency changes/installation, application build, database/browser/load test, OS update or deployment was performed by this audit. Coordinator acceptance and fresh host inventory are separate evidence.

## Coordinator installation before CI

On20October the coordinator verified the official Node 24.22.0 Windows archive SHA256 `f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3` and actual executableSHA256 `ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c`, then ran its actual `--version`. Installed pinned pnpm 12.14.0 in an ignored task-local prefix, regenerated the lock, ran `pnpm update --depth Infinity` within exact direct/override contracts, and repeated `pnpm install --frozen-lockfile` successfully. pnpm 12 records its own platform-specific native binaries in a leading YAML document; the application lock remains format9.0. Do not assume a single-document parser.

`saveExact`/`engineStrict` moved from `.npmrc` to workspace YAML. The24-hour minimum release age and strict enforcement are explicit. Only the eleven exact8.72.0 typescript-eslint family packages released19October have reviewed exclusions; the old exact Zod exception is removed. The retained `@esbuild-kit` loader/core-utils are deprecated upstream transitive Drizzle tooling, with the deliberate esbuild override retained. They are not silently force-replaced with incompatible packages.

The new official app base is `node:24.22.0-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f`; anonymous registry response bytes/digest and Linux/amd64 manifest `sha256:429bdfbc204b4eabc6438e6d34e4e9d8dd2ca1df8289bcd78cdd3c5db387b7a5` were verified. Official Alpine 3.24 x86_64 index still lists libcrypto3/libssl3/openssl3.5.9-r0 and zlib1.3.2-r1, so those exact pins remain current. PostgreSQL official release index still lists18.6 stable;19RC1 is excluded. No DB schema/migration files were changed by the dependency refresh. Actual final-image native/scan/schema/browser acceptance is recorded separately after CI completes.

## CI tools and actions upgraded

Official GitHub release/ref/action metadata was actually checked on 20 October. Gitleaks8.30.1 and k6 2.3.0 remain the latest stable releases. Grype moved to0.121.0; the Linux/amd64 archive SHA256 `64e07133d3486115de647a66581461dccf5c732748a0a3119077395565f15519` agrees with the downloaded official checksum file and release API asset digest. CI verifies that hash before executing it.

Latest stable actions are pinned to exact reviewed commits: checkout7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1` and upload-artifact7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`. All use Node 24 on hosted Ubuntu 24.04 runners; the inputs in these push/main/dispatch jobs remain supported. Artifact `archive: true` explicitly preserves the ZIP/digest handoff. checkout's new unsafe-fork restrictions and setup-node's registry-token behavior do not affect these current triggers/inputs. Actual successful workflows/artifact retrieval, rather than this metadata check alone, establish integration acceptance. Sources: [Gitleaks releases](https://github.com/gitleaks/gitleaks/releases), [Grype 0.121.0](https://github.com/anchore/grype/releases/tag/v0.121.0), [k6 releases](https://github.com/grafana/k6/releases), [checkout7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).

### PostgreSQL registry recheck

At `2026-10-20T06:49:48.352Z`, anonymous official registry queries for `postgres:18.6-bookworm`, `postgres:18-bookworm` and the pinned digest all returned the same6,491-byte index. SHA256 of the actual index bytes matched `afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c`. The Linux/amd64 manifest remained `sha256:9551dd5bf356409a21b31248f49b33bba9bb1877365f3a7e933aecd9af3cf52d` (3,452 bytes, actual digest checked), config `sha256:2e182ed2ff8f5d0835353864264437a26dffc542a9a6c677ec495aa54e491627`. The existing database image pin is current; no database image change was needed. This was metadata verification, with no pull, start, server access or database change.

## Final accepted upgrade

Candidate `c5cc9e4b34d89167c3e58db98000b060666b0db5` is now accepted by full CI 39381986062, attempt 1:932 tests/60 files plus90 source and90 identical image browser cases, all passed without browser skips/retries/flaky/errors. Native checks and the production audit passed; Grype 0.121.0 reported zero High/Critical andthree Medium matches for CVE-2025-60876. Those BusyBox revisions are latest in Alpine 3.24 and marked possibly vulnerable by the vendor; no fix or false-positive assertion is made. The complete archive was retained and all 15 layers verified locally. [Exact image/archive/package/lock/tool hashes and actual execution](../qa/VPS_DEPENDENCY_UPGRADE_EXECUTION.md). The current source host was not upgraded or redeployed.
