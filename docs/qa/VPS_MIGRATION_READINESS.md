# Dependency upgrade and clean VPS migration acceptance

Prepared on 2026-10-20 for the owner's request to upgrade dependencies first, test the result, and prepare an equivalent installation on a new VPS. The OVF/VM-clone route is cancelled. This is the independent acceptance record; the coordinator records actual candidate identities and executed results below as they become available.

The requested destination initially reproduces the existing **staging** site, catalog, financial history and controlled payment/SMS behavior. It does not turn the demonstration shop into public real-money sales. [The public-domain migration runbook](../ops/MORPHIUME_IR_MIGRATION.md) describes a different later transition. Its instruction to exclude synthetic staging data from a new live ledger must not be misapplied to this requested staging replica, whose history must be retained.

## Status and evidence boundary

| Gate | Evidence / status |
| --- | --- |
| Instructions and source review | Repository instructions, QA/Ops skills, migration specification, current runtime/DB Compose, backup contract, private-preview capability and earlier catalog acceptance read locally |
| Previous application baseline | Existing records identify application `32b89e13d31288fe4497f7419e170550baf5b293`, PostgreSQL 18.6, 13 migrations and 53 public tables. These are dated source records, not a fresh destination observation. |
| Previous content baseline | [Catalog acceptance](DEMO_CATALOG_EXECUTION.md) records six published fictional products, twelve variants, six 1024×1536 images and the retained successful controlled order. Historical QA products are archived; no order history was deleted. |
| Upgrade selection and lockfile | Coordinator selected Node 24.22.0, pnpm 12.14.0, Playwright 1.64.1, Next 16.4.2, React 19.3.1 and BetterAuth 1.7.11. Frozen installation, lint, TypeScript and production audit completed; full Linux source/image CI is still required. |
| Full source and packaged-image regression | Not executed by this QA agent; final candidate CI must be linked and independently inspected. The separately scoped offline legacy-credential unit checks below passed. |
| Clean-host planner/media guards | Final local run: 25 tests passed on Python 3.12; command/source bindings and corrected failures are recorded below. These tests cannot establish a successful Ubuntu installation or actual media restore. |
| Fresh source inventory / backup | Coordinator's read-only observation at `2026-10-20T06:24:06Z` confirmed Ubuntu 24.04.5 Noble x86_64, four CPUs, 5,155,532,800 bytes RAM (~4.80 GiB), healthy app/worker/DB and unchanged active resource caps. A final migration checkpoint/target restore remains unexecuted. |
| Destination provisioning / restore / cutover | Not executed. No destination address, host fingerprint or access inventory has been supplied. |
| Public domain / TLS / real PSP and SMS | Outside the staging replica acceptance; remain separate owner inputs and implementation gates |

No new SSH, database, browser, full application suite, build, restore, Ubuntu/application package installation or target mutation was performed by this QA agent while preparing this record. The actual pure guard tests and offline credential-format unit checks are recorded below. Planning/tests with injected facts are labelled separately from actual host results.

## Upgrade acceptance before choosing a migration image

The exact accepted source, dependency lockfile, Node/package-manager versions, Linux platform image, tested configuration, registry manifest, archive checksum, Engine mapping and relevant deployment-tool hashes must be recorded together. A successful workflow for the previous commit does not accept the new lockfile. A new image tag or `latest` package resolution is not an immutable release identity.

| Area | Required actual acceptance against the final upgraded candidate |
| --- | --- |
| Package selection | Resolve maintained stable versions from official registry/release metadata; pin the selected versions, supported runtime and package manager. Explain any deliberately retained major line or unsupported combination. Preserve the original lockfile through Git history. |
| Deterministic install | Clean Linux `pnpm install --frozen-lockfile`; verify build/worker/native image dependencies and no credentials included in layers or public artifacts |
| Static and server tests | Lint, TypeScript, meaningful unit/integration tests using real isolated PostgreSQL, role separation, migration-checksum checks, amount/idempotency/stock/auth contracts and dependency audit; record failures and corrected reruns |
| Source browsers | Actual Chromium, Firefox and WebKit against the optimized candidate: native owner/MFA controls, product/media publish, guest OTP/cart/checkout, server mock verify, one receipt/stock effect, replay, owned tracking and foreign-order rejection; RTL/mobile/keyboard/accessibility checks |
| Packaged image | Repeat the required native cases against the exact packaged image, check real worker heartbeat/graceful stop/restart, nonroot/read-only/scoped mounts and no build tools or package manager in runtime |
| Security disposition | Record actual vulnerability scan versions/results and justified residual findings. A zero High/Critical image scan is a scoped result, not an application-security certification. |
| Migration compatibility | Compare canonical SQL and applied checksums; explicitly state whether a schema migration is necessary. No seed/reset, implicit owner fallback, dependency-driven schema rewrites or restoration over the source. |

The new clean-host tooling has its own acceptance. Default/import behavior must not call package managers, Docker, systemd, network clients or file-mutating functions. Execution requires reviewed target facts and exact package pins. Positive synthetic tests exercise the intended fresh-host plan; negative cases cover the existing source host, wrong machine identity, unknown Ubuntu/architecture, inadequate resources, existing storage/services and malformed package pins. These tests verify guards, not the correctness of the Ubuntu repositories or a VPS provider image.

Independent review found incomplete safety observations and source-host aliases could pass the first bootstrap draft. Ops corrected the typed required-field checks and source-address refusal before the first actual guard run. Media review found root directory entries could evade expansion/member limits, opposite preview directory/file shapes were accepted, and the RAM-archive parent lacked an owner check; those were also corrected. The first expanded Windows test run stopped on the test harness attempting to mock Unix-only `os.chown`; the mock was made portable. A subsequent 23-test run reproduced two real trailing-slash/type guard failures; Ops normalized those names and the final rerun passed. Media apply now independently re-observes and binds the new destination machine ID/local IP and rejects source aliases before reading archives or creating target paths. None of those local failures involved a server operation or application data change.

### Actual portable guard execution

On 2026-10-20, the final command was `python -B tests/ops/vps-handoff.test.py` using the installed Python 3.12 interpreter on Windows. It exited 0: **25 tests, 0 failures/errors, 0.056 seconds** reported by `unittest`. This final rerun followed a fresh reread after Ops tightened target-parent ownership, delayed app ownership until the unfinished tree was complete, and made default path reporting POSIX. The fifteen bootstrap tests use synthetic facts and block commands/network/mutations at relevant boundaries. The ten media tests validate injected tar headers, path/type/size/member limits, capability quarantine shape, inert defaults and destination identity refusal. No host inspector, Docker, package manager, database, live archive extraction or application test ran.

| Reviewed local source at this run | SHA-256 |
| --- | --- |
| `deploy/vps/bootstrap.py` | `a65c52f435549251ccda391f0e03b9e269f1b4579e8c939ad50ee9efb4772093` |
| `deploy/vps/restore_media.py` | `bdab46d086eb0a9edfc096a34a7a0af2477abe74df6778b206c04ed4e1a64583` |
| `tests/ops/vps-handoff.test.py` | `bb0a7fc357325c32b073e5622a52fe9940e31dfb9a637a631a1f7622f83169fd` |

The [new-VPS runbook](../ops/NEW_VPS_MIGRATION.md), requirements, role initializer and replica Compose were also reviewed as source. The template starts only the fresh DB by default, publishes no DB port, keeps app/worker opt-in and has no build/seed/migration service. The new package installation, PostgreSQL dump/restore, native owner MFA, media extraction, Engine proof and scheduler operations described there remain unexecuted until a real destination is supplied.

The independent dependency audit's registry observation at `2026-10-20T06:17:33.626Z` is recorded in [the dependency matrix](../ops/VPS_DEPENDENCY_MATRIX.md). Candidate compatibility risks to exercise include BetterAuth core/adapter alignment and native MFA/CSRF/session behavior, matching Next/ESLint-plugin versions, the React/ReactDOM peer pair, and the Playwright 1.64.1 browser revision rather than a reused 1.64.0 browser cache. Node 24 remains the LTS runtime line; adopting the newer non-LTS major is not a prerequisite. TypeScript 6.0.3 remains within the inspected `typescript-eslint` peer range `<6.1.0`; selecting TypeScript 7 solely because its version is higher would violate that peer contract. The coordinator must confirm the final selections and results; this audit does not itself accept an upgraded build.

The coordinator's package/workspace/npmrc/Dockerfile/CI/line-ending changes received a separate read-only source review. The pnpm 12 settings agree with the official [settings reference](https://pnpm.io/settings) and [migration guide](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/migration.md): project policies belong in workspace YAML, registry/auth settings remain in `.npmrc`, and Docker copies workspace settings before installing. No legacy `npm_config_*` override or removed package-manager strictness/command usage was found in the reviewed repository paths. Node/package-manager pins match the two Docker stages, both CI jobs and browser exporter. This is source consistency, not a completed install/build; the lockfile, exact native APK closure and new browser binaries still need actual acceptance. The attempted Context7 CLI lookup failed to fetch, so the review used those official primary pages directly.

### Actual retained-credential format check

The upgraded fresh-database suite creates credentials with the upgraded library. It cannot by itself prove that a persisted password hash or encrypted factor from the previous library remains readable. With coordinator authorization, this QA agent fetched the exact public [BetterAuth 1.7.7](https://registry.npmjs.org/better-auth/1.7.7) and [utils 0.4.2](https://registry.npmjs.org/@better-auth%2futils/0.4.2) archives at `2026-10-20T06:37:09Z`, verified their official registry SHA-512 integrities, and inspected/executed only public code with synthetic input. No package was installed into the application's module tree, and no source database, account or real secret was read.

| Public archive | Verified SHA-256 |
| --- | --- |
| `better-auth-1.7.7.tgz` | `7113a05dabe14e406a9548cac8091dc71035a939161c257c82a81a9730fd32ff` |
| `utils-0.4.2.tgz` | `0c331c783c84eba5a206e81cbdca6f95426659f8af66a8c86de7025b64ccc95d` |

The old crypto exports were bundled without source edits using esbuild 0.28.2. Resolution explicitly selected the old utils Node password/hash exports; Noble ciphers/hashes 2.4.0 and Jose 6.2.12 match the pre-upgrade lockfile. Both BetterAuth versions have identical crypto-index bytes (`eda1857eadcf2dea50618c61da26e5fb5e79efd7755e665cc3d9f244a322c2a0`) and password-wrapper bytes (`757f075228ec993630dfe91a7d1bdb55a6589173a508ba5e522586cdddd06d7b`), while the old/new utils implementations differ. The tests therefore exercise persisted old outputs through the new implementation rather than generating both sides with the new library.

At `2026-10-20T06:39:14.791Z`, Node 24.22.0 executed the genuine old exports to generate a public synthetic password hash (including full-width/decomposed Unicode), bare-hex and versioned encrypted MFA secrets, and a six-digit/30-second TOTP at fixed millisecond time `1795542240000`. The old implementation verified/decrypted its own generated values before they were retained. Password salt and encryption nonces were generated once by the old library; their fixed persisted outputs make future checks deterministic. Two private setup errors in relative-path/symlink resolution stopped before successful vector creation and were corrected; they were not product failures.

`node node_modules/vitest/vitest.mjs run tests/unit/backend/auth-upgrade-compatibility.test.ts`, executed with Node 24.22.0, exited 0: **one file, seven tests passed, 601 ms**. The upgraded crypto/utils exports verified the retained password and normalization, rejected a wrong password, decrypted bare/versioned MFA data, rejected the wrong key/corrupted ciphertext/absent retired key, required the explicit legacy key for old bare data through a key ring, and verified the old TOTP while rejecting wrong/stale codes. No network, DB, session or browser was used during these unit tests. The Vite config emitted a future-loader warning; it did not fail the tests.

The ignored public-package provenance record has SHA-256 `3bde1c46d457ab095a04e2a8a9b9880645c7f62564da337d757c67dca62fe090`; the generated vector record is `306b26e3f053c581410876bda64f7e6dbcfd7d430a68004712db978f3d18ed1f`; the old crypto bundle is `d7d9afd5c6c36db2a67ee3ae0ad5089aa453229b2f35b43ac9229cdc63b5b693`. The tested new unit file is `a8c6a6baa031dfd71a8dccd32fa926c2dd78cff1c18ec48d648aaca8c811e3d3`. These bind this local preparation; CI must still execute the committed test against its final lockfile.

This accepts the tested serialization/cryptographic compatibility only. It is not a restored-database owner login, MFA enrollment/recovery or destination authorization acceptance. Those remain mandatory after actual data restoration.

## Data and secret boundary for an equivalent staging replica

Capture one consistent authoritative source checkpoint with its write-stop window and restore into a **fresh** destination database and media directory. Transfer an encrypted logical PostgreSQL dump and encrypted media archive, with safe metadata/checksums. Never copy a running PostgreSQL data directory or mount its physical files into another database version. Preserve the source and its reserved `/srv/morphiume/postgres` filesystem throughout.

Git contains source, the deterministic dependency lockfile, approved image/build definitions, safe catalog assets and migration procedures. Git alone is not a copy of the running shop's database, uploaded media, credentials or recovery material. Those belong in a separate encrypted operator handoff. Do not push a database dump, private media, capability file, runtime secret, browser report or backup recovery key to GitHub. A newer documentation/tooling commit on `main` does not silently replace the separately accepted application image identity.

| Preserve / transfer privately | Verify after restoration |
| --- | --- |
| Complete authoritative schema, applied migration checksums, grants and sequence state | Exact table/migration set, object ownership and independent owner/runtime roles; sequences remain ahead of restored identifiers |
| Full catalog, variants, slug/gallery relationships, prices, inventory and archived QA entries | Six published labelled demonstration products and both variants; no republishing archived QA entries; exact stock/reservation/ledger relationships |
| Orders, immutable order items, attempts/receipts/refunds, reservations, inventory ledger, fulfillment, shipments, returns, outbox/dedup and audit history | Keyed row hashes/digests and business invariants compared across all authoritative tables; counts alone cannot prove equal history |
| Owner/customer identities and required credential/factor encryption material | Existing owner and native customer authentication behave as intended; no silent owner password/MFA reset. Any session revocation is explicitly reviewed and scoped. |
| Private originals and public media derivatives with required modes/owners | Every DB media association resolves, file bytes/dimensions/permissions agree and private originals/control files are never publicly served |
| Service-scoped runtime/worker/migration secrets and operational encryption-key custody | Dedicated root/private transfer, final read-only mounts, no secret values in Git, public report, image build arguments, command transcript or rendered Compose output |

The private preview capability is stored under `MEDIA_ROOT/.private-preview-access/config.json` and is included in the current encrypted media backup. Its credentials are sensitive. The current application and immutable access profiles accept only the original private-IP origin for this exception. A different origin must fail closed and require normal admin login/MFA until a separately reviewed private-access contract exists. Never expose a copied shared operator capability through a public admin path or an unrestricted reverse proxy.

The existing loopback database port, CIDR `192.168.240.46/32`, source address `192.168.240.51`, Nginx host policy, old host key, image/profile/scheduler hashes and historical approval files are **source-specific** facts. Rebind destination address/origin/proxy/auth/trusted forwarding/monitoring explicitly. A blind search-and-replace, stale scheduler approval or replay of an old first-deploy script does not satisfy acceptance. Normal/default/live and isolated-restore authentication must retain their existing protections.

Keep the six prior stopped recovery pairs and their evidence on the source. They do not need six active database/app copies on the destination. Retention/export of their historical data is a separate archival choice; do not delete them to make a resource estimate fit.

## Destination acceptance checklist

| Stage | Evidence needed before accepting it |
| --- | --- |
| Identity | Independently verified new SSH host fingerprint, dedicated key/account/port, fresh machine ID, explicit target IP, administrative source CIDR and approved Ubuntu amd64 image |
| Host packages | Actual OS/kernel, installed exact Docker Engine/CLI/Compose/buildx/containerd and required Ubuntu package versions, repository-signing metadata, service starts and package-manager exit status; no unsupported distro defaults claimed as tested |
| Storage | Resolved mounts/devices, free root/Docker/data space, protected directory modes, fresh target DB/media paths and backup/recovery headroom; no unknown service or existing data overwritten |
| Artifact | Rehash archive and identity files on destination; verify source/config/manifest/layer closure, Docker load outcome and exact loaded Engine ID before starting the app |
| Consistent restore | Actual encrypted transfer receipt, decrypt/restore exit status, database/media integrity checks and authoritative source/target row comparisons; new destination keys/credentials are not printed |
| Perimeter | Actual IPv4 and IPv6 listeners and external probes; SSH restricted as intended, only approved proxy ports exposed, app/DB/cache nonpublic, unknown Host rejected, source-specific authless admin disabled |
| Native behavior | Real destination browser product/media create-publish, OTP/cart/order, mock server verification, one receipt and one stock commitment, callback replay, owner tracking and foreign-order denial; any new fixtures are bounded and financial history retained |
| Operations | Actual app readiness and worker heartbeat/restart/graceful-stop, encrypted backup, separate isolated restore with media/order invariants and measured timings; scheduler tools rebound to this exact candidate and only reviewed schedules enabled |
| Cutover | One authoritative writable ledger; explicit freeze/final delta window, no split writers, DNS/origin/cookie/callback changes reviewed and observed, old source retained for the agreed window |
| Final handoff | Source and target identities, actual UTC intervals/exit statuses, accepted safe evidence, remaining gaps and rollback/forward-repair decision published to `main` |

A rollback changes the image only if its schema contract remains compatible. Once the destination accepts new purchases, returning traffic to an older independent source database risks lost orders and duplicate fulfillment. Preserve all evidence, pause affected writes and reconcile authoritative changes before such a decision; do not treat a DNS change or old dump restoration as a financial rollback.

## Resource acceptance and limits

The current source configuration caps the active PostgreSQL, app and worker at 1,280 + 1,536 + 384 MiB = **3,200 MiB (3.125 GiB)** and 1.5 + 1.5 + 0.5 = **3.5 CPU**. These are configured limits, not measured demand or an SLA. A migration/maintenance job can add 384 MiB / 0.5 CPU; another isolated app/DB recovery copy needs its own explicit budget. The current source pool budgets are app 10 and worker 3 connections within PostgreSQL `max_connections=60`; extra replicas/tests need connection headroom rather than blindly duplicating that topology.

The fresh source observation `2026-10-20T06:24:06Z` reported four CPUs and 5,155,532,800 bytes of RAM (~4.80 GiB). Its root filesystem reported 25,185,042,432 total / 4,870,270,976 used / 19,009,507,328 free bytes. The three active services were healthy and Compose was 5.6.0. Those are one read-only snapshot, not a load measurement or the total size of every separate Docker/data mount; the final source inventory must account for those mounts and retained recovery archives separately.

The selected starting VPS class is **4 vCPU, 8 GiB RAM and 100 GB NVMe**, with **8 vCPU, 16 GiB and 160 GB NVMe** preferred for recovery/growth headroom. The bootstrap guard requires at least four CPUs, seven GiB of Linux-observed memory (allowing reservation within the advertised eight-GiB class), and sixty GiB of free root space before installation. These purchasing/guard values are conservative starting choices, not measured capacity guarantees. Do not substitute a four-GiB host for the eight-GiB class.

The coordinator's fresh source inventory and the clean-host runbook will supply the actual disk/memory baseline. Record package/image/archive sizes, PostgreSQL size, full private/public media, retained backups, old releases/recovery data and logs separately. Disk sizing must accommodate a working copy, encrypted transfer/checkpoint, an isolated restore, image extraction/previous image and growth; the source's small current catalog is not a general capacity estimate. Keep build and load generation off the destination.

The specification proposes 8 vCPU / 16 GiB as a starting point for a later 200-user deployment. Earlier controlled-load results apply to their old image, source host, synthetic dataset/network and mock providers. Neither those results nor this resource arithmetic establishes capacity for an upgraded candidate, another VPS, real gateways or arbitrary catalog growth. RPO ≤15 minutes requires tested WAL/PITR; a logical backup alone does not establish it. RTO ≤2 hours remains a target until a full business recovery exercise is measured.
