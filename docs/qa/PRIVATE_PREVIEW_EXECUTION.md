# Private preview execution — 18 October 2026

Final accepted runtime observation: **2026-10-18T12:27:06.374753+00:00**. The private preview opens the storefront and shared admin at `http://192.168.240.51` without Basic or browser admin login/MFA, restricted to `192.168.240.46/32`. Payment/SMS remain controlled tests; public migration/sales are separate.

## Release and transition

| Identity | Actual value |
| --- | --- |
| Application source | `3b62c340cbcb9becec3b1a9552eedeecb4837be2` |
| Loaded Docker Engine image | `sha256:5c065c87998774366e12204e5c0a00f821902768fedd44f8f0c15497225c030a` |
| Runtime access profile SHA256 | `288306187f020b2bbbb564742168ddf7d494a6080c43dc7967e496167840bd1c` |
| Published control/scheduler tool source | `06619aa6b6b2b4cda908ee731dab9ee28e3c3630` |
| Repository main observed while writing | `ffbd10c9a9a2757baaa87595b89af548578cc7e3` |

The [separate CI report](PRIVATE_PREVIEW_CI_EXECUTION.md) records the accepted source and packaged-image jobs. Main/tool commits are not substituted for the running application source, and the tested platform config is not substituted for its Docker Engine image ID.

The coordinator's saved `.local/authless-root-20261018/transition-observed.json` has raw SHA256 `5fff90c01561d568db35486ed11f33230ce11e1b084207b9eafbcce911c1e07c` and records these actual UTC stages:

| Stage | Time |
| --- | --- |
| Canonical site closed | `11:08:12.786288` |
| Source writers stopped | `11:08:14.112928` |
| Fresh backup verified | `11:08:28.202153` |
| Candidate profile selected | `11:08:34.330077` |
| Image ready; source data preserved | `11:09:28.153360` |
| Shared review authority enabled | `11:10:18.071605` |
| Preview reopened; native acceptance pending | `11:10:18.114645` |

The source database's 53 tables and 13 migrations were preserved; no migration or seed ran. Source app/worker stopped gracefully with actual exit codes 143/0. All four previous stopped restore pairs remained preserved. The owner account was unchanged. The intentional new shared preview operator was confined to the permitted authentication tables; all other tables were unchanged by enabling it. Its maintained native password/MFA proof stays on the server. Browser access does not imply that a human enrolled or completed MFA, and normal/default/isolated-restore/live authentication remains required.

Preparation history is retained rather than relabeled as success. Initial preparation recorded `ValueError` after `before-timer-pause` at `10:37:11.215835`, with no application start/profile selection. A later paused continuation exited 1 with `UnboundLocalError` in its postcheck. Separate load-only acceptance at `11:04:04.448105` confirmed the already loaded candidate and healthy prior runtime, preserving failed evidence and all four old pairs; it ran no additional loader, application switch or timer action. That acceptance was not deployment or purchase acceptance.

## Actual clean-browser review

One corrected full review ran with pinned Node24.21.0, Playwright1.64.0 and installed Chrome155.0.8059.81. The fresh 1440×1000 context received no credentials, storage state or cookies. Its outer process exited **0**, from `11:28:29.183Z` to `11:28:43.804Z` (14.620 seconds), one invocation with no automatic retry. The browser run itself was `11:28:30.430Z`–`11:28:42.598Z`.

All 12 route observations returned 200, had Persian `lang=fa`/`dir=rtl`, one visible main heading, and no application error alert or password/MFA input:

| Route | Result |
| --- | --- |
| `/` | Passed |
| `/products` | Passed |
| `/admin` | Passed |
| `/admin/products` | Passed |
| `/admin/orders` | Passed |
| `/admin/inventory` | Passed |
| `/admin/analytics` | Passed |
| `/admin/notifications` | Passed |
| `/admin/settings` | Passed |
| `/admin/presentation` | Passed |
| `/admin/reports` | Passed |
| `/admin/login` → `/admin` | Passed |

Each admin view displayed the private-preview badge, shared-account notice and storefront return link. All eight boundary observations passed:

| Check | Actual response |
| --- | --- |
| Admin session | 200, `private-preview`, server-proven `mfaVerified=true`, no-store |
| Customer native session | 200, null, no-store |
| Browser native admin session | 200, null, no-store |
| Unknown Host, using Node HTTP | 404 |
| Protected preview capability via public media URL | 404 |
| Wrong Origin / absent Origin / cross-site admin POST | Three 403 `FORBIDDEN`, no-store; invalid empty payloads could not create a product |

Browser admin cookies: **0**. Authorization attempts, external requests and unexpected admin mutation attempts: **0**. Page errors and admin API errors: **0**. No product/order mutation was requested. The owned browser closed after the review.

The four saved desktop screenshots were visually inspected: coherent RTL navigation, readable headings, working preview notices, and no visible clipping/overlap in the captured viewports. Product imagery and rows are QA fixtures. This is not a mobile, full-page or real-catalog acceptance.

Private evidence remains outside Git in `.local/authless-preview-ui-proposal/browser-review-final-actual-e04a84a0-ec68-4930-94e0-d159a6002a3a/`:

| Artifact | Raw SHA256 |
| --- | --- |
| `browser-review-result.json` | `2695ba176a23f3992d6a0adc0aa8a9da2fc144982aea411b45c6f148812acaf1` |
| `outer-process.json` | `c0e90fb0fc28faf5a0fc83e5aa08f9fd2d29b11c75ea3d793f552cdde0044bb5` |
| `home.png` | `e28d92de37fa9eddd3fc1bbd65697542391f17e2a0e01e0a7e493880a47bb6ab` |
| `admin-dashboard.png` | `8b03beb2e744daae415902ff892407c0e439bd9c50b0ac5179db4c22bf91f840` |
| `admin-products.png` | `95ea0b2ab8c39ed7626116cbde0e773d16a7ed394bb1c7912027fc8fb42c287e` |
| `admin-orders.png` | `23713b063932c3aa21f0e4e9d554ee7e59305e64c67f75a8d5a9237bfe8df8f2` |

## Actual native purchase acceptance

The fresh Chromium purchase case passed with browser exit **0**, recorded browser duration **48.549 seconds**, one expected case, zero unexpected/skipped/flaky cases and no retry. All **17** acceptance checks were true. Its native result was accepted at `11:35:39.367Z`, for the same application/image/profile and identity-file SHA256 `66a0fa75a9b772c39c259e848929fde1ceff56a7a48c2c269402bb6ae329d5ea`. Server control subsequently recorded `native-accepted-recovery-schedule-pending`, journal SHA256 `493bca4ba0bcb8ab1cd838c8ce2b99c4983d647310a2fd4c0ebafb005d6628bf`, binding the actual native marker below. Its timers remained paused.

The case created and published a new SKU through the shared-preview panel, completed customer checkout and server-side mock payment verification, and observed stock move from 3 to 2 with reserved stock zero. Exactly one receipt and shipment were present; repeated payment callback returned a stable 303 without another inventory commitment. Shipment tracking passed, a foreign customer's order access returned 404, and the uploaded 16×20 WebP gallery and media hashes matched. The checks also covered CSRF, permissions, the private perimeter, server-only review authority and rejection outside private staging. No browser HTTP credentials, admin cookie or browser MFA were used.

All 4,790 preexisting financial rows across 14 tables and 276 preexisting owner rows across four tables were unchanged. The foreign test customer was disabled and had zero sessions remaining. The primary buyer/product were deliberately retained until recovery; their completed cleanup is recorded below. The shared preview operator was untouched and financial history retained.

The frozen run is `.local/authless-preview-qa-proposal/purchase/runs/11209176-e93b-4de5-887f-4746ec95faf3/`. Actual raw file hashes were recomputed locally:

| Artifact | Raw SHA256 |
| --- | --- |
| `accepted-private.json` | `bd60cebae8675b02fcef6dcbf9d6cc47ed548e501e0e322e5258215b804da776` |
| `execution-private.json` | `4f8301b769d15a302e2447bc4313c22ed0ca7e079f2f87386ffe12134db571c9` |
| `restore-fixture-private.json` | `5f3706aa19f481f61a5b102c0bd0130c93c6e65293905390da27c6db7c8294f5` |
| `ui-gallery-private.json` | `9feec267f29c756bafb0540ec11bc3fdf4197fde506e9c931e18bf9b59804534` |
| `financial-preserved-private.json` | `2eecc0ab2e0ad4c14aab54d9bf67803391f904b1921966fa1938b99425c0216c` |
| `owners-preserved-private.json` | `ef62411e8a3f2848fb1276b572b8d1b587d7663e938bdc7a69335f73fc55d2a3` |

The accepted runner/freezer SHA256 values are `19d7a73fd9ace0d36373ec2979bef1acaae0f63721aa3c193896cd902b9f9529` / `947bb1172bae10a3d61422e792773acda6fb17615ab622a5857d082ec862d0e3`. Before the business run, local collection found one case with zero errors; six outside-configuration probes returned null and made zero network requests. These were harness gates, not additional business cases.

## Fresh backup and pre-start recovery guard

The actual post-native encrypted backup completed at `11:42:49.339837Z`, in `backups/20261018T114201Z-075a9896`, with manifest SHA256 `aa7607cc72bef08799b76e52cfcf1c15b2c59b2ff4d3c3750b9491dc401d82bb`. Its saved completion evidence has SHA256 `407dfb77bb29606a3c174eb5a1141a1a741a1b807ea744260e890239610e9cd3`. Source app/worker stopped with actual 143/0, source database/media were unchanged and all four stopped restore pairs were preserved. Source writers intentionally stayed paused, the canonical site stayed closed with 503, and a temporary decryption identity was staged in RAM for the isolated recovery operation. No automatic resume was requested.

The first fifth-restore invocation exited **1** (`11:44:27.761Z`–`11:45:01.536Z`) in the original helper's read-only `load` guard, before `start()` or any fifth-project creation. It incorrectly required the native buyer ID to be UUID-shaped. The hash-bound actual fixture uses a maintained native opaque ID: a 32-character ASCII alphanumeric string. Fixture/product/order identifiers remain UUIDs. No fifth pair was created by this failed invocation, and prior native/backup evidence and four old pairs were preserved.

Original helper SHA256 `7a490fe41e013086e041085ef64b73dbcb92236709ddb547964c52729a2819b6` was preserved byte-for-byte in read-only local history. The narrowly corrected helper SHA256 is `ad76c1b2cae138381d97ce8170b35ba04becc298bd0469d4e70b8cab17cfd535`: it separates strict native buyer-ID validation while preserving the UUID, candidate, native/fixture hash, AST and runtime preservation guards. All **18 offline tests** passed, including the actual hash-bound fixture, invalid types/path/NUL/malformed buyer shapes and all prior adapter/finish-order tests; syntax and unexecuted default-plan checks passed. This local correction is not evidence of a successful restore, recovery business check, source resume or cleanup. The failed outer record is retained as `.local/authless-root-20261018/phase-invoke-start-b85585d4-6947-4cac-a4e3-72ff65bc6b85-actual.json`, SHA256 `3868bd742215680257693e0befc0cd783e9a3d3b9358324eb9865bdcf3731e51`.

## Accepted fifth recovery and cleanup

A separately authorized invocation created `morphiume-runtime-restore-20261018t120022z-8afcb7` from the fresh encrypted backup above, with the same candidate image/profile. The isolated app's worker was not started. Its review capability was ignored at the restore origin `http://localhost:3101`; normal customer authentication remained required.

The actual native HTTP client exited **0**, once, without retry, and passed all six checks: native customer login, owned order, payment receipt deduplication, stock reservation, shipment tracking and media hashes. This was a Node/native HTTP recovery check, **not a browser execution**. The executed bundle SHA256 was `3fecde6032ffb3fbec05814dff61e761685689c9305158cd671fa765faa64630`; the earlier `f1ad` bundle was never executed. The accepted record, read back independently from the server into the coordinator's protected local evidence, binds the actual raw result/process records and the retained fixture.

| Recovery evidence | Actual value |
| --- | --- |
| Recovery began | `12:00:22.613702Z` |
| Isolated application ready | `12:00:36.381276Z` |
| Business checks | `12:03:02.651Z`–`12:03:03.118Z` |
| Recovery accepted | `12:05:04.591695Z` |
| `native-business-restore-accepted` raw SHA256 | `a0cd66044709904860872bb6823b48be0b40446aa522c3fc577204c74f14bfff` |
| Actual client result SHA256 | `706acedc29f61fa2602ee4665c01a48ac9d9dd8afad98d7616ddc148828fea70` |
| Independently observed process record SHA256 | `1e8b2c9da6bdcd4091543935518c625edb982966bb189f52f8e88c4cc2f5bf09` |
| Final recovery journal SHA256 | `00a1f47ab657323ae407239cb2313ef0f5781f2fac0b453ae8609a52784567f6` |

The acceptance records **281.977993 seconds observed RTO**, from this recovery's start to business acceptance, and a **449.19391-second observed fixture-to-capture gap**. These intervals do not include the entire preceding source pause/preparation or subsequent source resume, and establish neither a general RPO nor offsite/PITR coverage.

The finisher stopped only the fresh fifth pair and retained its data, preserving all four old stopped pairs. The temporary RAM identity was removed before source resume (`12:05:46.150113Z` in the saved progress journal). Source app/worker returned healthy and Nginx reopened at `12:07:21.333282Z`, on the same application/image/profile. Timers were not resumed by recovery.

Primary-fixture cleanup then exited **0**, once, from `12:07:37.942Z` to `12:07:53.060Z`: one product archived, one buyer disabled, one buyer session revoked and zero remaining buyer sessions. All **4,805** financial rows across 14 tables were preserved, as were all 291 other authentication rows and 661 other catalog rows. The shared preview authority was untouched; media matched before the exact allowed row changes. Cleanup did not delete financial history or the retained restore data.

The coordinator's protected `.local/authless-root-20261018/` contains `recovery-started.json`, `recovery-client-completed.json`, `recovery-accepted.json` and the independently captured acceptance record. Final local recovery-envelope SHA256 is `976143b6a6e36ab31fc8c787f44e5ba0dce4dcf3e473d112223d20a67a25e567`; `primary-cleanup-accepted.json` SHA256 is `abbf4ec8e094332e6a3cdc0f60e2066ca73f0716b87e31bac86af015665f6287`. The intermediate read-only progress observation is retained separately and is not substituted for final resume/acceptance.

## Preserved harness failures

The first full review exited 1 at home (`11:19:47.000Z`–`11:19:58.099Z`), accepting zero routes. Its frozen helper and hash-only failure record remain unchanged; result SHA256 is `542bc5d4bd1f53e843deb51e2caac3a67df392d15142deb4526bad70f5fe69a3`. A targeted actual home diagnostic then captured the false-positive condition: Playwright saw the empty `DIV#__next-route-announcer__`, `role=alert`, `aria-live=assertive`, inside the open `NEXT-ROUTE-ANNOUNCER` shadow root. A document selector had missed that shadow-root element.

The corrected helper excludes only that exact empty framework announcer and records it for each route; every other alert still fails. It also saves full errors privately before masking. Its SHA256 is `5fc760d3b321a0524a355159dbf9c0619217c4a3776d1d1c12c4ec3b5fc3c16e`. The diagnostic result proving the actual alert shape has SHA256 `ab770d2b3f1885494f898dbd37f5d7c7979b1a41bd7a753d2497c822b127a3ce`.

Two preceding purchase-harness attempts stopped before native business execution: Windows URL/tsx preload handling, then CJS import-meta collection. Minimal harness CWD/support corrections were followed by the local gates above. Those attempts are preserved pre-native/collection failures, not failed business purchases; only the subsequent actual case supplies purchase acceptance.

## Accepted scheduled jobs and recurring activation

The frozen installer completed observe → install → measure-health → measure-backup → promote → enable, each as a separate explicit invocation with actual exit 0 and no automatic retry. The exact final control request binds the current candidate/profile/capability, accepted 17-check native evidence and fifth restore acceptance. Old approval/service overrides were archived by same-filesystem rename; original four base units, enabled flags, both lock identities and effective cadence were preserved.

| Actual accepted measurement | Health | Encrypted backup |
| --- | --- | --- |
| Fresh PID1 InvocationID | `036bcfc0944c49b6a8599ea4099d2975` | `76cbdc09008946409cbd1a59f3fd6707` |
| Service starts / actual exit | 1 / 0 | 1 / 0 |
| Fresh cgroup samples | 72 | 191 |
| Collector elapsed seconds | 18.895 | 50.522 |
| Accepted raw measurement SHA256 | `168d9ae6bd51256303ea26b5721cb5c05ead24f021fd6e9cc2dbd731935bde85` | `30f8efff06f4a3f83e011d30bb92ce12ea5805e0b955afe7a8d101ea213312d5` |

Collector elapsed time includes observation/journal collection and is not substituted for exact PID1 process duration or the longer phase wrapper. Both actual measurements proved a new InvocationID/live PID, resource samples, matching callback identity and preservation of all 53 source tables, configuration and recovery pairs. Backup additionally verified encrypted manifest/ciphertexts, 13 migrations, graceful source exits and healthy writer resume. Its newly measured backup was not restored by the earlier fifth recovery.

One-time approval SHA256: `c8f132b98228179e0052e85b90a13c293decc1027720a802ea874299cc747f95`. Final recurring approval SHA256: `3611bc4f81453d67f1886138fb8af58ff1e509d0c06ac8f86a38d73fdb41ac21`. Final installer journal SHA256: `e67bfda367dc831825c42b4c2d9bb388fdb30e2cc0d42db9ace3e208ebcb2b7f`. The two actual measurement hashes above are bound into recurring approval. Health retains boot 5min/interval 5min with jitter 5s/accuracy 1s; backup retains 03:00 UTC daily with jitter 15min/accuracy 1min. Both timers are active/enabled. This proves configuration and the one observed execution of each service, not every future automatic delivery.

## Final runtime and visible review

A separate read-only observation at `2026-10-18T12:27:06.374753+00:00` confirmed the exact accepted image/profile, clean `3b62c340cbcb9becec3b1a9552eedeecb4837be2` server checkout, healthy original app/worker and readiness200, five stopped/preserved recovery pairs, absent temporary RAM identity, active/enabled timers and preserved cadence/base units/locks. The Root-owned loopback database forward was closed after successful cleanup; original SSH/key files were untouched.

A fresh headed Chrome context at `2026-10-18T12:27:53.817Z` received no credentials, storage state or cookies. Storefront, admin dashboard, products and orders each returned 200 with fa/RTL, a visible heading and no password inputs. Admin session returned 200/private-preview/no-store with server-verified MFA and zero browser admin cookies. All four tabs remain open, with the dashboard brought forward. This visible review is four navigations, not a repeat of the earlier full 12-route/eight-boundary suite.

## Acceptance scope

| Acceptance | Actual status |
| --- | --- |
| Fresh shared-preview admin → product → purchase → server payment verification → stock → tracking | Passed, 17 checks |
| Clean browser review and private boundaries | Passed, 12 routes/eight checks |
| Fresh candidate backup and fifth isolated restore | Passed, six native HTTP checks; all five pairs stopped/data retained |
| Temporary key removal, source resume and scoped primary cleanup | Passed; financial/other auth/catalog history preserved |
| One-time health/backup measurements and recurring timer activation | Passed; actual 0 exits and final timers active/enabled |
| Fresh headed storefront/admin/products/orders | Passed; four 200 tabs left open |

Payments/SMS remain controlled staging adapters on a restricted private IP. No public-sales readiness, real PSP/SMS activation, general RPO, offsite/PITR or success of all future scheduled deliveries is claimed. Future `morphiume.ir` deployment on another VPS is a separate migration.
