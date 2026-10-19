# UI polish execution — 19 October 2026

**Local UI checks, source/image CI and owned test-environment cleanup completed.** The patch was verified against base main `1b12200f52a19c8baa7c4c13ecaf842de1ad3bb4` and published to main as `0d6d27e7a0dad4d19cba34e0b47596e75f3f983d`. The final source secret scan exited 0 with zero findings. Both jobs in [CI run 39208158980](https://github.com/AmirMo10/Morphiume/actions/runs/39208158980) completed successfully; their downloaded evidence was accepted at `06:57:35.947Z`. No deployment was requested or performed today. The previously accepted private preview remains application source `3b62c340cbcb9becec3b1a9552eedeecb4837be2`, documented in [the preview execution report](PRIVATE_PREVIEW_EXECUTION.md). The live-baseline review and new local verification are separate observations.

## Actual live baseline

Independent QA reviewed the existing private preview with fresh Chrome 155.0.8059.81 contexts, Playwright 1.64.0 and pinned Node 24.21.0. Home, catalog, one available product, empty cart, dashboard, admin products, orders and settings were captured at **1440×1000, 390×844 and 320×844**: **24 HTTP 200 views**, Persian/RTL, one H1 each and no document horizontal overflow. Every baseline axe WCAG 2/2.1 A/AA scan returned zero violations; console/page errors and browser admin cookies were zero. Only same-origin GET/HEAD requests were permitted. No login, checkout, product/admin mutation or deployment was performed by this live pass.

The baseline found a coherent editorial hero and useful empty/no-results/validation states. Actual defects were a mobile menu remaining open after header-cart navigation, an empty header search field despite an active catalog query, initial search focus on the close button, and rejected price input still claiming results were loading. Admin context/navigation consumed the narrow first viewport; narrow table actions wrapped into vertical text. The dashboard's daily heading described all-time counts. These observations and screenshots are retained in `.local/polish-20261019-qa/FINDINGS.md`.

| Private baseline evidence | Raw report SHA256 |
| --- | --- |
| `live-05310cab-d3d0-4c70-9fa7-04f4285d63a2/` —24 views | `77990bf28ea74acd796b75096c1a12605c6034d077eae4347f992d02659b598f` |
| `focused-d4b3bcfe-b9c1-49f0-9685-6e9592ca2340/` —menu/navigation | `861b804ddbd841b0fa4c3806a2df868341a0525423b09e15d417a3bdbaec446b` |
| `search-0118963f-5880-41a2-8e0a-82561a05bd02/` —correct search/price parameters | `9cf6d7346539df6f6d7f33f7bdcaaf188bc0231b28f6b44047e5175997b164ef` |

The first focused query used unsupported parameter names; its files do not prove empty/invalid-price states. The subsequent correct `search`/`minPriceToman` observations supply those findings. Zero axe findings do not establish complete accessibility, keyboard traversal, screen-reader operation or real mobile-device acceptance.

## Implemented local corrections

These source changes passed the local behavior, visual and regression checks and the Linux source/image verification recorded below:

- Header search prefills the active URL query and focuses its input after the native dialog opens. Existing filter preservation, Escape, inert background and trigger-focus restoration remain. Mobile navigation closes on link/history navigation and Escape.
- Catalog has one atomic results announcement and distinct invalid-price/error/loading messages. Favorite controls use compact named hearts with real pressed/pending states and recoverable account/wishlist lookup errors. OTP send/resend/edit transitions focus the relevant field while retaining error-summary focus.
- Product cards and galleries measure the current decoded image, including already-complete cached images. Sources below 96px in either intrinsic dimension receive a neutral brand treatment, scale-down rendering and the visible label «تصویر با وضوح محدود». Original image source/alt, media bytes, gallery/variant selection, products and links are preserved.
- Admin context, narrow navigation and table actions are made more compact/readable; the overview heading reflects its actual period, product paging is bounded and visible, and inventory controls present clearer selection/empty/error states. Scoped CSS supports these layouts and touch/focus targets.

The actual specialist owners were `launch_readiness` for storefront components, `launch_ops` for admin components and integration review, and `launch_qa` for the two new regression cases and independent browser/visual checks. The coordinator owned styles, integration, existing-test output fixes and publication. Ownership returned after each handoff.

Storefront components: `site-shell.tsx`, `storefront-dialog.tsx`, `catalog.tsx`, `product-gallery.tsx`, `wishlist.tsx`, `phone-verification.tsx`. Admin components: `admin-shell.tsx`, `admin-overview.tsx`, `admin-products.tsx`, `admin-inventory.tsx`. Integration styles: `src/styles/storefront-redesign.css`, `admin-redesign.css`, `globals.css`.

Two new regression cases in `tests/e2e/ui-polish.spec.ts` are the primary new coverage: storefront search/navigation/errors/favorites/original media, and bounded admin navigation/table actions/filter intent. Their actual Chromium report is recorded below. Two existing heading assertions in `redesign.spec.ts` were updated for the truthful overview heading. The `playwright.config.ts` change updates a case-count comment from 28 to 30; its actual 25-minute budget is unchanged.

No backend, authorization, payment/stock logic or native-auth contract is changed by this patch. The shared preview exception remains scoped to private staging; normal native auth/MFA remains the test authority. No product photography, product facts, reviews, contacts or service promises were invented. Existing synthetic names, blue tiny QA media and missing owner-supplied real catalog assets remain content limitations; presentation treatment does not make them real commercial assets.

## Isolated test safety and actual completed commands

The coordinator prepared run **`4a5f4f2d9622`**, a new tmpfs-only PostgreSQL container/network and unique QA database `morphiume_staging_qa_b9ae9285630ecb38`. Existing containers/data and the existing local environment file were preserved. Migration and seed targeted only this new QA database. No existing staging/main database was selected for those writes.

The first creation wrapper exited 1 because its postcheck compared a short returned container ID with a full ID after creation had occurred. A separate read-only acceptance verified and reused that exact existing QA container; it exited 0 at `05:32:10.943Z` and created no duplicate. This failed wrapper is preserved rather than reported as a successful creation command. Safe accepted metadata is `db-created.json`, SHA256 `99fdeb3097681e0d0d45726496a0f360bd8a54da2c5118b9f35ac16ad555d3c2`, under `.local/polish-20261019-root/`; credentials and environment values are excluded from this report.

| Actual local phase | Result | Completed UTC | Raw process-record SHA256 |
| --- | --- | --- | --- |
| New QA database migrations | Exit 0 | `05:36:18.896Z` | `d594df022b97c21db8d2fa8752c85ee2b430f85cf357564e2ecaf703e8382695` |
| New QA database seed | Exit 0 | `05:36:28.280Z` | `38e0e672b786c6edb661df74732710f40e901f967e8ff31609f01e3c36bd9e6f` |
| Repository ESLint | Exit 0 | `05:40:46.106Z` | `2c98478748a6ded129bfecb350d0384c4177bfb61cd4726fa20d844bcfb286f9` |
| TypeScript, no emit/no incremental | Exit 0 | `05:41:07.895Z` | `e265722accb92af085f5e8493ca632a5f5003640e3df84ae08b598b47f399c44` |
| Next optimized build | Exit 0 | `05:41:40.995Z` | `cebdc254326c521501c4cebad129e8189fc3e438b0b0d32996e5a11559be2d9b` |
| Runtime bundle | Exit 0 | `05:41:45.769Z` | `b63df0b1b0001238fd51f4cbf232e1d25405a8dc1e4179a9296ad175fa0adba1` |
| Runtime trace guard | Exit 0 | `05:41:59.723Z` | `9a86390a3af0d3fa94e683bd3dd421737064fd6e814568de083b2151311b1fc9` |
| Standalone preparation | Exit 0 | `05:42:07.366Z` | `1279478bae62f5a42ca2c420751c2bbe899d469013a1a7b487a0046cd489ae86` |

Original process records/logs are retained privately as `run-*-actual.json` and matching logs in that directory. Four completed build phases establish local build success, not a new accepted container image, CI result or deployment.

The local full unit/integration invocation was **incomplete**, stopped by its 480-second outer budget: `ETIMEDOUT`, `SIGTERM`, exit code null, `05:40:41.462Z`–`05:48:45.345Z`. Before cutoff, four completed integration files reported **79 passing tests**: return-transitions (15), cart-lifecycle (26), commerce (27) and fulfillment-refund (11). No completed-file failure marker was observed; uncompleted tests remain unknown, so this is not full-suite acceptance. The supervisor's worker exited and the failed/incomplete attempt is preserved: `run-test-0-actual.json`, SHA256 `533026a1a43571c8c5225ab775924cad121905827fdb4ce0fccbf6605c4a9990`; original stdout SHA256 `ae507e57b9806ffc18f8713378461f9f29ffe19051db05d6dfdab04c2a6a89b6`.

The separate **unit-only run exited 0** (`05:49:46.744Z`–`05:50:15.470Z`): 34 files, **666 passed and six skipped out of 672**, framework duration 24.19 seconds. The skips are the existing Linux-only filesystem-boundary cases in `tests/unit/auth/private-preview.test.ts:106` when run on Windows; local zero-skip acceptance is not claimed. Raw `run-unit-0-actual.json` SHA256 is `f4de137a333c8674d0d7affedb456e76e82837083c69c0cdf3b2be635a78375c`, stdout SHA256 `bb06527cd5e861ea97317093e418730565fc2af1dcc6510bb6e57aa96be06259`. This does not complete the timed-out integration suite.

The first focused Chromium run's **two native cases passed**, individually 13.395 and 8.688 seconds; report duration 23.958 seconds, starting `05:49:44.527Z`. The raw report has two expected cases and zero unexpected/skipped/flaky cases, retries, case errors or global errors. Evidence: `.local/polish-20261019-qa/native-7ace970a-f20e-4746-86f2-73327f409d68/report-private.json`, SHA256 `49bf1d96ac24071d9a0c589ffd8c9fc37f2cf0a376f6ead42eec5c73ea4777eb`. The outer wrapper subsequently exited 1 during Windows ACL postprocessing after the browser child finished; that wrapper exit is not relabeled 0, and its child CLI exit was not persisted. At `05:54:31.206Z`, finite acceptance verified the unchanged original report/artifacts and repaired only their ACLs, with no test replay, network or database operation. Accepted-record SHA256 is `d9febd56f5b2b7c12651c7ddf1e24c7bf60fdf2a71e78d4c707eafe72ac4b7c9`; the two report results are accepted without inventing a missing process exit code.

## First post-change visual run

The isolated app's first post-change visual pass captured **26 views/screenshots** across 1440px, 390px and 320px widths, from `05:54:41.271Z` to `05:57:32.205Z`. Every captured view passed its axe check with no document overflow; console/page errors were zero. Outer process and child each exited **0**, with durations 189.665 / 174.694 seconds. The isolated fixtures did not leave a published public product for this visual pass, so it did not capture a public product page. Product behavior/media had been exercised by the separate native case before its fixture was archived. These 26 captures must not be confused with the earlier 24 live-baseline views.

The deep settings navigation at 390px and 320px was bounded to 506.39px in an 844px viewport, using internal `overflow:auto` with scrollHeight 1397; the header toggle remained visible, focus/Escape checks passed, and window scroll stayed 0. The coordinator visually inspected seven resulting images, including the mobile menu and private admin product preview.

Evidence directory: `.local/polish-20261019-qa/visual-8f511307-944d-434f-b586-f58987739f58/`. Raw `visual-private.json` SHA256 is `6e5307b9d4133291d97300af43110a45636bf3ca7074832b8368f095659c7a0a`; process record `5d08821773b499935588bf6b44d31457ea209ea380d6742007ac957cc5ee80b9`, child exit record `7fef402cc54c74d6e2b2aaf717846fe446fb619d35a4d4b6a6f119b7e985259e`.

Two subsequent source refinements are **outside that first visual runtime**: the draft-count helper now says «حداکثر چهار پیش‌نویس برای تکمیل اطلاعات و بررسی انتشار.»; three scoped admin CSS rules keep private-preview gallery navigation arrows/counter in one row. Their final build and focused final-runtime check passed below.

## Existing regressions and final build

The three existing Chromium regressions passed on the first optimized local runtime: the full product→purchase→verification→stock→tracking case (24.783 seconds) and the two redesign cases (14.803 / 7.256 seconds). Report duration was 48.921 seconds, with zero unexpected/skipped/flaky cases, retries, case errors or global errors. The actual CLI child **exit 0 was persisted**, duration 49.733 seconds. Raw report SHA256 is `e0a686bf4a769a132e6ccd75b483e8cb58893eebed9cd0beaba73775bbbb6863` in `.local/polish-20261019-qa/regression-c2b91b0b-41c8-410e-a9db-87cce73e8a62/`.

The outer wrapper again exited 1 after test completion, during a Windows PowerShell 5 Unicode-path ACL postcheck. Separate finite acceptance at `06:01:59.591Z` verified the actual child exit 0, all 12 original artifact byte hashes and ACLs through pinned PowerShell 7, without replay. Accepted-record SHA256 is `1f5568006ad8a4a1a32a51751e66d7d04a49c4ea3b0bb4e289aa10385763bbfe`; the original wrapper failure remains recorded.

An initial screenshot-path correction covered two destinations and missed the third product capture. The regression temporarily overwrote `docs/qa/screenshots/product-chromium-390.png`. The coordinator saved that new capture privately, restored the exact original HEAD/index bytes, and changed all three full-purchase screenshot destinations to `info.outputPath`. Restoration evidence is `.local/polish-20261019-root/historical-screen-restored.json`, SHA256 `bd097665c4d9db306cb6436ab406dc4a3ce3f5505f3337840348ce2f399198d0`. The historical PNG is not part of the change; assertions and budgets were not altered.

After the late caption/CSS and third screenshot-path fix, all four final optimized build phases exited 0 (`06:01:41.003Z`–`06:02:27.022Z`). Raw `run-finalbuild-[0..3]-actual.json` SHA256 values, in phase order, are `43d64c85faca17f8bb76b4df98b8f540160ddf2db5b21821286eb7652eedd3d3`, `38b56a1e5c8fb9cbd6cfb0897789d94f0723254beb93f21e8ce22e516ff0066f`, `b6ecf4e502daccb5f4722b15aa98e52f104f262b611332c8625f8db1d701c33d` and `7f8bd2657f9f5f855988e49ac6a7cbb7b968aa240dd0742d2f5888cbf2d6d457`.

The isolated app restart guard initially refused before mutation because a typed PowerShell UTC date was reparsed as local time. Typed UTC conversion was corrected without relaxing its time bound, and the exact owned old process was verified stopped at 06:01:36Z. The QA database/forward remained available for the subsequent final-runtime check.

The rebuilt final runtime then passed its focused check at **1440px, 390px and 320px**, including the exact new draft-count copy, row-aligned private-preview gallery controls, 48×48px buttons and a zero-margin counter, original 16×20px media retained with scale-down and visible quality labels, and zero axe findings/document overflow. Actual child/outer exits were **0/0**, durations 22.523 / 36.221 seconds; the focused observation ran `06:03:31.580Z`–`06:03:50.219Z`. The coordinator visually inspected the 390px controls and 320px preview. A full-page skip-link artifact was independently checked: it was unfocused, with its viewport rectangle above the screen (top −97.59 / bottom −44.8), while a button was active. No CSS blur/hiding workaround was introduced. Owned QA browsers closed and the temporary test admin was disabled.

Final evidence: `.local/polish-20261019-qa/visual-591212a6-e106-40e6-abb3-399c78ed501e/final-preview-private.json`, SHA256 `321161fedcb852c1e7af7167e1cbe820e73c41cb34a55f6807a5beddbc095213`. Its process/child-exit record SHA256 values are `6911209e937bdd67739bbfb331bca16c7265c3c9d57bd702970b0eae0d699d76` / `2cb1960d79de0d39dd33e00664ebde664ee9d362db35cdfe494c572e2419ab11`.

Owned test-environment cleanup also completed. Local cleanup exited 0 after stopping only the owned final app process and database SSH forward; their listeners on 3095/15439 were absent afterward. The first Windows PowerShell 5 file invocation was blocked by execution policy before mutation; the coordinator used the existing bundled PowerShell 7 without changing policy. Remote cleanup exited 0 at `06:06:08.288Z`, removing only the new tmpfs QA container, its owned network and its temporary protected environment file. All 13 preexisting container identities, images, states, mounts and ports matched before/after; existing application data and all five restore pairs remained untouched. Actual evidence is retained in `local-cleanup-v2-actual.json`, `remote-cleanup-actual.json` and `remote-cleanup-safe.json` under the private coordinator evidence directory.

## Linux source verification

Job `117915414346` completed successfully for exact source `0d6d27e7a0dad4d19cba34e0b47596e75f3f983d`: **925 tests in 59 files** passed. All **90 browser cases** passed, 30 each in Chromium, Firefox and WebKit, with zero unexpected/skipped/flaky cases, test retries, case errors or global errors. Browser report duration was 1,154,067.954ms. Deployment-boundary checks, history credential scanning, runtime DML identity checks, dependency audit, build and the server-evidence acceptance step also passed.

The downloaded source evidence artifact `12167636334` was checked against its GitHub digest and exact source identity. ZIP SHA256 is `d3cdfd4e292843e4a01ea123b10ca729779deebfb5ea263e55d6a8e8f03957ca`; raw source job-log SHA256 is `cabe52ffe2e1f6d255a02a3d9fd8ecfc6def8ee2f00cc5c4648ecdcad878eb81`. Originals and acceptance metadata are private under `.local/polish-20261019-root/`. This source result does not establish image acceptance or deployment.

## Packaged-image acceptance

Image job `117922122498` completed successfully. Its packaged migration/seed, app, media encoding, normal authentication and worker heartbeat/graceful-shutdown checks passed. All **90 browser cases** passed again: 30 per engine, zero unexpected/skipped/flaky cases, retries or case errors, duration 1,248,638.344ms. The two runs contain the same scenario/project pairs; they are **90 cases repeated against two runtimes**, not 180 unique scenarios. Both server-evidence exports were complete, with zero unexpected events across 6,447 source-runtime and 6,443 image-runtime lines.

The image scan reported **zero High/Critical matches and three Medium matches**. The runtime native WebP encoder and Node addon load passed. This is not a claim of zero vulnerabilities or security certification.

Accepted image: `ghcr.io/amirmo10/morphiume:0d6d27e7a0dad4d19cba34e0b47596e75f3f983d`. Tested platform config: `sha256:d0ab86a3982e920150fa63579bc1278040c8cb4748e7bfee107226d9b161d49b`; published candidate manifest: `sha256:f0c2024aa482085bcdb6603e388c1dd681fa38573e1a4f758e3eea4e8449f9dd`. The CI publication guard matched the tested config before promotion. These registry/config identities are not a loaded server Engine identity.

Image-evidence artifact `12168302334` was downloaded, source/digest checked and parsed; ZIP SHA256 is `01a049189fb3cd4fdc63245ee670cbf91c383a879f629080a4a862a8b775665b`. Its raw job-log SHA256 is `181d85f62c95e5332adf6c7413e4077d27588706de33d248c3281093e10d6906`. Original image identity/scan/native/browser/server exports and `accepted-ci.json` are retained privately in `.local/polish-20261019-root/ci-accepted-0d6d27e7a0da/`; the safe aggregation is `ci-final-evidence-safe.json`.

The transfer archive is published as artifact `12168267441`, 88,142,913 bytes, GitHub metadata digest `sha256:687cb68d98fcdcf29770289ca61564c7004246ebf4531e1f45c576533150b061`. That archive was **not downloaded, extracted, transferred or loaded on the server in this task**. Deployment/archive-byte acceptance remains a separate operation.

## Outcome and remaining work

- Full Linux source verification: **passed**, including 925 tests and 90 browser cases. The local full-suite timeout and separate local platform skips remain distinct historical results.
- Two new and three existing Chromium regression reports, plus the first 26-view visual pass, are accepted within the scopes above.
- Final four-phase build and focused verification of the rebuilt local runtime, including the late copy/CSS refinements: **passed**.
- Owned QA-infrastructure cleanup: **completed**, with existing runtime/data preserved as recorded above.
- Source commit/push and both CI jobs: **completed** at `0d6d27e7a0dad4d19cba34e0b47596e75f3f983d`. The documentation follow-up records this acceptance without changing application source. No deployment was requested or performed; today's live screenshots show the earlier deployed source.

Real catalog photography/content, future public VPS/domain and real PSP/SMS activation remain separate owner/deployment work. This report makes no new capacity, public-sales, blanket accessibility or future scheduler-delivery claim.
