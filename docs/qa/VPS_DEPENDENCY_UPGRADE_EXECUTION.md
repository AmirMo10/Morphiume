# Dependency upgrade and VPS handoff execution — 20–21 October 2026

**Accepted application source: `c5cc9e4b34d89167c3e58db98000b060666b0db5`.** All four workflows completed successfully on attempt 1. The tested upgraded image is retained for the replacement VPS; it has **not** replaced the currently running source-server image. OVF/OVA is canceled. No new VPS address/access was supplied and no destination was provisioned, restored or cut over.

The owner requested package upgrades first, full testing, then preparation of an equivalent staging replica. [The migration runbook](../ops/NEW_VPS_MIGRATION.md), [machine-readable manifest](../../deploy/vps/requirements.json), [dependency matrix](../ops/VPS_DEPENDENCY_MATRIX.md) and [fresh source inventory](../ops/VPS_SOURCE_INVENTORY.md) are the current handoff.

## Executed verification

| Scope | Actual result |
| --- | --- |
| [Full source/image CI](https://github.com/AmirMo10/Morphiume/actions/runs/39381986062) | `verify` and `image` succeeded, attempt 1; terminal success observed at 07:33:11.623Z |
| Source static/DB tests | Frozen install, lint, typecheck, production audit, migrations/role checks and production build passed; **60 files / 932 tests passed**, including all 7 retained-credential compatibility tests |
| Source browsers | **90/90** unique cases: 30 each Chromium/Firefox/WebKit; all passed, zero retries/errors/skips/flaky/unexpected cases |
| Packaged-image browsers | The **same 90/90** project/title identities passed, 30 per engine, with the same zero-failure/retry/skip disposition |
| Server evidence | Both reports collected and uncapped; source 6,410 / image 6,422 lines scanned, zero captured unexpected events |
| Native image | Actual Node 24.22.0, Sharp/WebP addon execution, TLS 1.3, rejected DTLS methods and disabled QUIC passed. Node/libvips `ldd` returned 0; addon `ldd` returned 127, with no missing-library pattern and successful actual Node addon load as required by the audit |
| [Browser-toolchain workflow](https://github.com/AmirMo10/Morphiume/actions/runs/39381985917) | Fresh official Playwright 1.64.1 Linux browsers exported with Node 24.22.0/pnpm 12.14.0; Linux guard commands and artifact upload passed |
| [Catalog workflow](https://github.com/AmirMo10/Morphiume/actions/runs/39381985955) | Committed fictional catalog, real WebP assets and finite API/preservation guards passed |
| [Release-operator workflow](https://github.com/AmirMo10/Morphiume/actions/runs/39381985968) | Syntax, inert defaults and operator safety guards passed |
| New-host guards | 25 pure migration tests passed locally; their command also passed in Linux CI. Earlier archive-name/type regressions were corrected before acceptance |

The original local Windows unit run was 666 passed/6 conditional skips in 34 files; the separate new credential file passed 7/7. Those local results were not called complete DB acceptance. The subsequent Linux CI executed all 932 tests without skips. Local browser-export tests had 10 passes / 7 Linux-only skips; Linux filesystem/import acceptance came from CI. The failed Windows attempt at Linux-only `O_NOFOLLOW` tests and unavailable WSL startup were not relabeled as successful Linux tests. See [independent preparation/review](VPS_MIGRATION_READINESS.md).

This regression covers native admin/MFA, product/media publishing, OTP/cart/checkout, server-side mock payment verification, one receipt/stock commitment, callback replay, shipments/owned tracking and foreign-order denial, plus existing RTL/mobile/accessibility cases. It uses controlled CI data and mock providers. It does not prove real PSP/SMS delivery, restored-owner login, destination operation, a new load/capacity benchmark or public-sales readiness.

## Exact release identities

| Field | Accepted value |
| --- | --- |
| Application source | `c5cc9e4b34d89167c3e58db98000b060666b0db5` |
| Tested Linux/amd64 config | `sha256:66d1404bf81d0054d15e9993490678c243bd1dea799e821d5339c8b32e76b0cf` |
| Published provenance/SBOM manifest | `sha256:cc9058eb5232462336ac3df2a7fe863f287fe5db5dfe4fdb12a5fc4d98683398` |
| Archive SHA256 | `ab8f2a898c6b7e2a9e265eb008ae90a53acd56513bbb0b4a2ed49890597d5009` |
| Archive bytes | 88,506,979 |
| Archive contents verified locally | 15 layers / 236,798,976 uncompressed bytes; config 11,536 bytes |
| GitHub image ZIP ID /SHA256 | 12247793481 / `0c65f09c1424ddacf5f382a590a47d907717885d0bef57f7f1fc736452e8f67e` |
| Source evidence ZIP ID /SHA256 | 12246119976 / `66ae1da895885a0ff540f21517ed1f205000bb7d261688640dc069bb1f79c7d8` |
| Image evidence ZIP ID /SHA256 | 12247683832 / `6f02d40ace8bd814b7d1fe834443014249bb7adf49d25e99db530acfc3ab21fa` |
| Package manifest SHA256 | `c718cfc130a5f5d0a03f336f7451a4a61245665d865d7e2ab7b0ef0f6daac4d9` |
| Dependency lock SHA256 | `fbf420d37d07111bdb5fd95fcea3fa494500f3ae788bf7c862c85d9fa0aabf3c` |
| New-VPS tool-set SHA256 | `eea4f44ca3d27622a56074416de7513cea651d291bb9e6d18824577ee0b5b61c` |

Tool-set hash means SHA256 of sorted-key UTF-8 JSON mapping the four `deploy/vps` bootstrap/media/Compose/role files to their SHA256 values, with comma/colon separators and no final newline. Exact members are in the requirements manifest. The manifest itself is metadata and is excluded from that hash. Source identity also pins the existing image verifier/Engine library. A later documentation/acceptance commit on main does not create a new application image.

The source and image ZIP bytes were independently checked against GitHub metadata. The coordinator retained the complete image ZIP and actual archive in protected local storage outside Git, verified its checksum and all 15 Docker-save layer diff-IDs, config/source/platform/user/entrypoint and credential-free image environment with `verify-release.py` in verification-only mode. The archive is under `.local/vps-handoff-root-20261020/accepted-c5cc9e4/image/` on this workstation. No Docker load/container start or server write was part of that verification.

The first large single-stream download timed out. A second slow streaming attempt was superseded and its partial file retained. Sixteen bounded HTTP ranges then completed; combined ZIP bytes and the saved file both matched the authenticated GitHub SHA256 before archive verification. The obsolete owned copy process was stopped only after the complete ranged copy was verified. These were transfer retries; CI itself passed on attempt 1. An offsite independent copy remains an operator requirement before migration; local retention is not an offsite backup.

## Scan result and unresolved vendor finding

Grype 0.121.0 scanned the actual accepted config at 07:10:14.700424668Z using valid database schema `v6.1.10`, built 2026-10-19T06:39:15Z. It reported **zero High/Critical and three Medium package matches for one CVE**, [CVE-2025-60876](https://nvd.nist.gov/vuln/detail/CVE-2025-60876): BusyBox wget request-target control-byte/header injection. Matches are `busybox`, `busybox-binsh` and `ssl_client`, all `1.37.0-r31`, under NVD CPE matching. Their scan fix states are empty and fixed-version lists empty; that is not proof that no fix exists.

At 07:38:41Z the official Alpine 3.24 x86_64 main index listed all three installed revisions as latest. Its secdb listed no fixed revision for this CVE; [Alpine's tracker](https://security.alpinelinux.org/vuln/CVE-2025-60876) marked this revision **possibly vulnerable**. No newer same-branch vendor fix, false positive, backport status or application reachability was established. No suppression was added. The accepted private-staging gate permits Medium findings; a vendor-fixed replacement requires a fresh build/native audit/scan/regression acceptance. This is a scoped scan result, not security certification or a public-sales approval.

Scan JSON SHA256 is `cb6ad5598e7540f616ef1938e95920c4e17f3ee3ea5c8dde1e13d3390b6e221a`; native report SHA256 is `403d6848af938efb06eb662b22f06b4fd13f21bbf4e0a31cb34705e20a045eca`. Embedded Node OpenSSL 3.5.8 and zlib `1.3.2.1-motley-285e94b` are distinct from container APK libcrypto/libssl 3.5.9-r0 and zlib 1.3.2-r1. The scan's local manifest identifier is not the later published provenance index; accepted config identity is the shared binding.

## Migration compatibility and remaining execution

An actual Git comparison found `src` and `db` byte-identical between running source 32b89e1 and accepted candidate c5cc9e4. Their Git tree IDs are respectively `a743b3fd27d8db018b159b4f5770be7797a0e03b` and `b65fc0d77594ded2a734507602ca7e9dd799378e` on both commits. No application schema/migration file changed. The PostgreSQL 18.6-bookworm digest was also rechecked against current official registry tags and remains unchanged. Crypto compatibility for retained password/MFA formats has seven actual old-library-vector checks; actual restored-account login still requires destination acceptance.

The current server stayed on source 32b89e1 /Engine `sha256:a72b341aaef4dc0006f3073015aac228cba692afca73ebbab49a1da9883b5391`. Only read-only host/package/disk observations were made in this task; no package update, application deployment, service restart, write fence, data export, seed, restore or DNS change occurred there. The current private-preview access remains source-specific.

Recommended new VPS: **Ubuntu Server 24.04 LTS amd64, 4 vCPU, 8 GiB RAM, 100 GB NVMe**; 8 vCPU / 16 GiB / 160 GB gives more recovery/growth margin. The measured source has 4 CPU / about 4.80 GiB RAM, healthy active services and 3,200 MiB of configured container ceilings. These purchase recommendations are operating-headroom estimates, not a throughput guarantee. Full Ubuntu packages/exact observed versions and storage accounting are linked above; host Node/PostgreSQL/browser installs are unnecessary because the accepted serving images contain their runtime dependencies.

Still required: new VPS identity/SSH fingerprint/access/console, target origin and restricted administrative perimeter, actual package installation, independently held backup key/offsite storage, a fresh consistent encrypted full DB/ACL/account/media capture, target Engine proof, restore and exact row/media/role comparison, native target purchase/owner MFA/recovery/scheduling, then a single-writer cutover. Preserve all six labelled demo products and financial history. The source authless-preview capability is quarantined outside target media; normal owner login/MFA applies at the new origin. The future morphiume.ir real-sales transition is separate.

## Final source observation — 21 October 2026

A fresh read-only, strict-host-key SSH check at `2026-10-21T05:30:46.079897Z` confirmed the source app and worker still use source 32b89e1 / Engine a72b341a…, all three app/worker/database containers are running and healthy, readiness returns 200, and the health/backup timers remain active/enabled. No service, package, data or configuration change was made. This refreshes operational preservation only; dependency metadata and the accepted CI execution above are dated 20 October, with no application rebuild or test rerun implied by this final documentation update.
