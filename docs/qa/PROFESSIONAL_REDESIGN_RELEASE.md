# Professional redesign: private-preview release

Date: 2026-10-19. Target: the existing private staging preview at `http://192.168.240.51`, restricted to the approved client CIDR and controlled mock providers. This report records actual release results as they arrive. Public sales, a public domain/TLS and real payment/SMS activation are separate prerequisites.

The application source is `32b89e13d31288fe4497f7419e170550baf5b293`. Its accepted image is deployed to the private preview. The actual deployed purchase, fresh six-check recovery, source resume, scoped cleanup, measured scheduler activation and final headed browser review all succeeded. The source is healthy; six restore pairs are stopped/preserved and both timers are active/enabled. The operator-only descendants, including `4d5c2bc` and the `7baf` manager-schema correction, are separate tool versions. A later main commit does not become the application's image identity.

## Accepted source and tool verification

| Actual check | Result |
| --- | --- |
| [Application CI run 39239870865](https://github.com/AmirMo10/Morphiume/actions/runs/39239870865), verify job 118017800743, attempt 1 | Succeeded; 925 unit/integration tests across 59 files |
| Source-browser evidence from that job | 90 passed: 30 Chromium, 30 Firefox, 30 WebKit; zero unexpected, skipped, flaky or retried cases and zero case errors |
| Source-browser execution | Started `2026-10-19T10:50:26.533Z`; report duration 1,226.884442 seconds |
| Application image job 118027331047, attempt 1 | Succeeded; 90 packaged-image browser cases passed: 30 Chromium, 30 Firefox, 30 WebKit; zero unexpected, skipped, flaky or retried cases and zero case errors |
| Packaged-image browser execution | Started `2026-10-19T11:14:02.705Z`; report duration 1,171.070538 seconds |
| Grype image scan | Three Medium matches; zero High or Critical matches. This is not a zero-vulnerability result |
| Native runtime audit | Pinned Node 24.21.0, actual Sharp WebP encoding, dynamic addon loading, TLS 1.3 client, DTLS rejection and disabled QUIC checks passed |
| [Operator CI run 39242054556](https://github.com/AmirMo10/Morphiume/actions/runs/39242054556), job 118024982619, attempt 1 | Succeeded; 25 portable release guards verified from the actual job log |

The coordinator independently checked the raw source job log and sanitized browser evidence. The protected source-acceptance record has SHA-256 `6e400f4fbe3ac8ca614dae6a3108ad9165523eb1f0684898475fadf9096cc5ec`; the raw verify log has SHA-256 `db9a101a992aaeab610488760900463ff9ded3a13950dcf7fb65d503c9f4ec8f`, and the browser summary has SHA-256 `1f6433d41cdf09e150def0a06b9e2f335c66830579d3088a09de55b4847a02f3`. Raw reports remain protected under ignored local evidence directories.

The source and image reports execute the same 90 scenarios in separate environments; they are not 180 distinct scenarios. The final CI evidence record has SHA-256 `a03ba610edea0ed8fa06a7ccc7b825a4a9ea234e0b8026e10c45fe16459727c3`; the packaged-image browser summary has SHA-256 `92c9aff3fd74a3656c2c61f9bd69aa9091f929bc43d1ca461b6bd4c8181292af`.

Runtime artifact `12183386301` was downloaded as exactly 88,153,280 ZIP bytes with SHA-256 `0f9687feb70d620ec0a58f99d9dfffdaaef11263557de3d8058f83ca32396b70`. The final transfer completed 1,346 parts at `11:57:32.483Z`, using 64-KiB ranges, concurrency 32 and bounded read-only timeout retries with at most two attempts per range. Credentials were not forwarded. The standalone extractor and archive verifier each exited 0 without an automatic retry; verification completed at `11:58:18.569Z`, without Docker or a server mutation.

Earlier transfer evidence remains preserved: the initial one-shot attempt exited 1 at its 180-second limit; four 4-MiB parts timed out with zero completed; small 64-KiB probes succeeded; an eight-part 256-KiB attempt completed seven parts and timed out on one. A full curl transfer was deliberately cancelled after 111 seconds and 2,715,648 bytes, rather than reaching its 600-second timeout. A separate read-only 64-KiB server probe succeeded. These transfer outcomes are not image/application failures, and none is relabeled as the accepted completed download. The initial failure record has SHA-256 `afa70abf9f5e8c06cc2b07875e005889ff94a3c1da4dfac14adc53ddb5688703`.

The accepted local archive record has SHA-256 `8b000231c84458dc5bdab82077d8477d93a94f89529238822ddf5712ecf27a2f`. Its exact candidate fields are:

| Candidate field | Accepted value |
| --- | --- |
| `sourceCommit` | `32b89e13d31288fe4497f7419e170550baf5b293` |
| `testedPlatformConfig` | `sha256:9596e1325a3e259afe54ec0cd4682c00b8b7f4a2a6e6109c44a6743953dcb75e` |
| `candidateManifestDigest` | `sha256:d344516bb4b316b016a1670794a698f8dc83fb609dc2dcb9380730832b5a7ffd` |
| `archiveSha256` | `3790c4b03f0e2dc33ef81c33bc7442aa99214773e40608852b7dd6c6812b92ba` |
| `opsSha256` | `68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3` |

The extracted compressed image archive is 88,152,420 bytes. Subsequent actual Engine loading produced runtime image ID `sha256:a72b341aaef4dc0006f3073015aac228cba692afca73ebbab49a1da9883b5391` and Engine proof SHA-256 `7c5f01740bcb214c0627f1e949318c7e4a69d715a16fe07abb518cce07291385`.

The earlier local native, responsive, accessibility and pixel observations remain in [the frozen design execution report](PROFESSIONAL_REDESIGN_EXECUTION.md). They establish their stated local build coverage; they do not substitute for testing this image after deployment.

## Read-only server discovery and preserved failures

The initial server discovery exited 1 at `10:56:58.197Z`. A separate diagnostic exited 1 at `10:59:12.279Z`, identifying the manager-unit schema gate. Both failed invocations and their outputs remain preserved; neither performed a release mutation. Healthy writers, readiness, profile/Engine and the five existing stopped restore pairs had passed the preceding read-only checks.

A narrow manager probe exited 0 at `11:01:13.917Z`. The observer had required seven fields for every systemd unit. Actual timer records correctly returned six common fields and omitted `ExecMainStatus`; services returned all seven fields. The published correction validates the exact per-type field set, rejects duplicate/unknown/missing fields, and continues to require successful quiet services with actual exit status 0. It does not invent a timer process exit status.

The corrected discovery then exited 0 at `11:06:02.921Z`, with the server observation timestamp `11:06:00.863105Z`. It observed the existing `3b62c340cbcb9becec3b1a9552eedeecb4837be2` app/worker healthy, readiness 200, the protected source state and five stopped restore pairs preserved. The two existing timers were active/enabled; their services were inactive with successful results and `ExecMainStatus=0`. These are baseline observations before the new release, rather than acceptance of a new scheduler installation.

| Preserved actual record | Raw record SHA-256 |
| --- | --- |
| Initial failed discovery | `bfeb4d4c2ebe36d3e44e450f349cc93ace091e0a38a4078c28380cc7a55dab9d` |
| Failed diagnostic | `3638a54f19030954e68ca6d629b8249fe22274c0c94b423b6f982cab4ae60f05` |
| Narrow manager probe | `89d913aaef661bc4c2ff09034a694e7eef885fa004eff044bb158d546742aee1` |
| Successful corrected discovery | `1fec3534e081131883f416e5797078de5cb6347138498c14dafbe5a646cd476f` |

These observations changed no release acceptance, images, application data, unit configuration or restore pair.

## Operator-file materialization

One tools-only transport exited 0 at `11:38:14.125Z`, with no automatic retry. It materialized the separately reviewed immutable `control.py` and `schedule.py` files, whose raw SHA-256 values are `b86d37a701d2ffb02597cea6386a076d3d4b5a4148a29f2e1a3e852e2c770786` and `6a896ce9b466db9fd7c4ff579d90268d33d1beff411d5cd9270fdb81f19dcf0a`. The actual result explicitly reports no application/unit change and no image load. Tools-only summary SHA-256: `e5295a41cbdb03236642a9e74ed10240c748000bad82679119a3365fd0ae6fd6`.

At that tools-only checkpoint, no image upload, timer pause, writer transition, deployed native purchase or new recovery had occurred. The subsequent upload and runtime phases are recorded separately below.

## Actual image transition

Release operation `70b288a4-2a77-43a3-9f76-1566aa2deb22` used the accepted archive. Incoming-file materialization exited 0 at `11:59:17.839Z`, verifying the exact four protected input files and archive hash. It did not itself load the image or change the application/units.

| Actual phase | Observed result |
| --- | --- |
| Prepare | One invocation, exit 0, no timeout or automatic retry; completed `12:04:27.876613Z` after 173.252600 seconds; candidate loaded and previous runtime preserved |
| Apply | One invocation, exit 0, no timeout or automatic retry; completed `12:06:25.106002Z` after 95.073767 seconds; `image-ready-native-pending` |
| Application readiness | `12:06:25.035253Z`, accepted source/image above, app and worker healthy |
| Selected access profile | SHA-256 `65831c6a405bbab67c6f1f20579687d65403c688e78dc6d8b38803c04bed5142` |
| Timers at apply | Paused; neither phase resumed them. Their later measured activation is recorded below |

The successful prepare/apply results retain the protocol's previous-runtime, protected-state and old-pair preservation gates. Their saved summary hashes are `e1962cc75e1d2eb97fa2664a99c5e989df601b5a5ccc34b47b8c1b105119f6e7` and `d49f8d570d87c5962a3eef056f59a1ff88c2a597b6f86eb8d56b184bebdb0e24`. The actual ready journal SHA-256 is `e35d5ca3db16528af3c5fe82210ced515a916b01970b7eed93d43aaa29e75fbb`.

QA configuration was exported successfully once. A subsequent local mapping guard incorrectly expected a nonexistent `localOnly` field and exited 1 before QA execution. The coordinator corrected that local mapping using the saved export's actual `serverBind`, `clientBind` and `hostConfigAndNetworkSettingsMatched` fields; the original export was preserved and was not repeated on the server. Correction-record SHA-256: `15e662c7f5b01e5f30b63c5c658b596c459eb4e16c47d6323efa3dea2e1b865f`. The owned loopback forward was then started for the separate native invocation below.

## Actual deployed native purchase

The single Windows Chromium invocation completed with outer exit 0 at `12:12:02.134Z`, after 197.370 seconds including guards and private evidence processing. Its browser child exited 0 after 67.721 seconds. The raw Playwright report contains exactly one passed result, retry 0, zero skipped/unexpected/flaky cases and zero case errors; report duration is 64.436269 seconds. Chrome reported `155.0.8059.81`. No repeated native execution is represented by these nested process/report timings.

All exact seventeen acceptance flags were true:

| Area | Actual accepted flags |
| --- | --- |
| Private-preview boundary | Basic not required; admin browser login not required; server-only review authority; CSRF; permissions; approved perimeter; review authority rejected outside private staging |
| Product and commerce | UI product creation; UI publication; checkout creation; mock payment verified; single inventory commitment; stable repeated callback |
| Fulfillment and preservation | Shipment tracking; foreign-order denial; media hashes; owner unchanged |

The paid order has one receipt and one inventory commitment, with commitment deltas −1/−1 and final on-hand 2/reserved 0. Shipment tracking matches the retained fixture. The original 16×20 media hash matches the purchase, gallery and restore fixture. Browser evidence recorded zero admin authentication requests, zero Authorization headers and zero admin cookies; neither browser Basic credentials nor browser MFA were supplied. Administrative actions used the existing shared preview operator, without creating a new admin/owner account.

Independent local recomputation compared every keyed before/after row hash: all 4,805 preexisting rows across fourteen financial tables were preserved. All 278 protected preexisting identity rows across `user`, `account`, `two_factor` and `role_membership` were also preserved; that identity snapshot excludes the shared preview operator and its normal server authentication activity. One foreign synthetic customer was disabled and had zero remaining sessions. At native acceptance, the new primary customer/product remained enabled/published solely for the fresh backup/restore. Their subsequent completed cleanup is recorded below; the original retained fixture and financial history remain preserved.

The accepted marker binds all nine candidate/access fields, the actual release operation/request core, original ready time/journal, physical runner/freeze/settings hashes and nine raw proof-file hashes. The fixture and gallery match that same identity/operation and the actual purchased product. Raw evidence remains protected under `.local/professional-release-qa/native/runs/bf4f48ce-0f61-4a18-9ef9-ea83e5958e55/`; no customer values or credentials are published here.

| Native evidence | SHA-256 |
| --- | --- |
| Accepted marker, accepted at `12:11:58.188Z` | `2d6da7fe966187eeaf3e64332d69b92d3a7334cf879b5f1b5d391ad95dcabfed` |
| Raw Playwright report | `3075f30f21541f0832551d88cce9a0a96c6ec95a8c845bcba91d2fb2f0e85729` |
| Raw case result | `61fafc57389fb046124a4c046ef2cfeda6cdf8013145f64662caa80191098d10` |
| Retained fresh fixture | `726f03326d30f35f8a135477f0512ab36ac66f83757f53e950451275586a4b26` |
| UI gallery | `cfc8a2c5df5ac760724ea78a58a52f51f8490af1273478381341052a7f69117f` |
| Coordinator's actual outer-process/result envelope | `6414e63067f1c8c7cdc284d8d588937093cdbad5e52165a24eaf77471472b6ec` |

This postdeployment execution covers one Chromium purchase case. The three-engine CI results above remain distinct evidence. The independent audit found no material proof mismatch. The separate server `accept-native` phase subsequently exited 0 after 19.141159 seconds, one invocation/no retry, completed at `12:13:59.838985Z`. It accepted the exact marker above with mode `native-accepted`; saved phase-summary SHA-256: `d72f9a6aa0bd71d31d1eb9b4f803ae1dbe186230e6aa5e04976802562fd4b847`.

## Actual fresh recovery business checks

The temporary restore identity was staged successfully in RAM; the original local key was preserved and the stage left the release journal unchanged. The separate `recovery-start` invocation exited 0 after 70.585980 seconds, one invocation/no retry, completed at `12:16:47.928690Z`. It created the fresh sixth isolated restore pair from a new encrypted backup, preserving the five old pairs. The restored origin was `http://localhost:3101`, with no worker started and the source writers held paused. Saved start-summary SHA-256: `9dfcdbf17ffc6fb96cc068ec07cc88788f3a6ea198bb0e7d5b420dcbc4b601d1`.

The customer-only recovery client then completed once with actual process exit 0, no timeout and no retry. Its independently recorded process duration was 0.668220 seconds; the six business checks ran from `12:17:54.317Z` to `12:17:54.764Z` (447 ms), inside that process interval and after the ready phase. These are client execution times, not full restore RTO or transport duration.

| Recovery check | Actual result |
| --- | --- |
| `nativeLogin` | Native customer OTP send/inbox/verify returned 200; initial customer session was null |
| `ownedOrder` | Restored customer's paid order returned 200 |
| `paymentReceiptDedup` | Successful callback replay returned 303 and retained the existing payment state |
| `stockReservation` | Restored stock, reservation and commitment state matched the retained fixture |
| `shipmentTracking` | Existing shipment and tracking matched the retained fixture |
| `mediaHashes` | Restored public media returned 200 and matched its original hash |

Anonymous admin access returned 401 and the preview capability was ignored at the restore origin. The real client compared 4,820 preexisting rows across fourteen financial tables and reported them preserved, with no financial additions, no new order and zero direct SQL mutations. Direct SQL was read-only; customer authentication and callback verification used the application's real HTTP handlers. No browser ran for these six checks and no browser administration or live provider was used.

The independent local audit recomputed the unchanged business/process file hashes and checked candidate/access identity, operation/request core, retained fixture, backup manifest, restore ready/start/config, frozen client bundle and enclosing process times. It found no material mismatch. Business-result SHA-256: `c64b814ec3d3eb7bdc97e21e7789e8373e7d6fc951657d8a45b14ea2bfb5480c`; separate actual process SHA-256: `213499956051b4bdb7e7a56d3ed35ede1a57272545c9fcb254199705eb0169f9`.

The separate `recovery-finish` phase subsequently exited 0 after 27.421444 seconds, one invocation/no retry, completed at `12:20:05.189621Z`. It accepted the exact raw business/process proofs, stopped and preserved the sixth pair, preserved the five old pairs, removed only the verified temporary RAM identity and resumed the healthy source app/worker. The original local key remained unchanged; timers were not resumed by this phase. Saved finish-summary SHA-256: `b16604f36bf2ecb9084cb0db055099adb688589ee1a43933c791c720fc5b88be`.

The independent auditor rehashed the exported raw restore acceptance (`a9a2cccbd0cdcf04b9bc8b4a5cacbe9e1e7a373a44ad4ba0c6be994cb39a3fda`) and its referenced business/process proofs, verified candidate/profile/capability bindings and recomputed the following intervals from their actual microsecond timestamps:

| Finite recovery observation | Actual interval |
| --- | ---: |
| Restore start `12:16:33.443234Z` → restored application readiness `12:16:47.108624Z` | 13.665390 s |
| Same restore start → accepted business recovery `12:19:38.706478Z` | 185.263244 s |
| Retained fixture creation → backup capture | 355.498311 s |

The second interval includes the finite coordination/acceptance wait; it is distinct from application readiness and from source resume at finish. The third is an observed fixture-to-capture gap. No general RPO, offsite recovery, PITR or service-level guarantee is established.

## Scoped primary cleanup and forward closure

After accepted recovery/source resume, one cleanup invocation exited 0, with no retry, completed at `12:21:47.715Z`. Its scoped transaction ran from `12:21:43.760Z` to `12:21:45.283Z` (1.523 seconds). It archived exactly the owned synthetic product, disabled exactly its owned primary buyer and revoked that buyer's one session, leaving zero buyer sessions. The foreign synthetic buyer had already been disabled during native cleanup; no other fixture/restore was cleaned.

The actual result binds the exact candidate, operation/request core, retained fixture, native/recovery markers and raw recovery result. It reports the media hash checked before mutation, the exact permitted row delta, all 4,820 financial rows across fourteen tables preserved, all 299 other authentication rows preserved, all 665 other catalog rows preserved and the shared preview operator untouched. The independent local audit verified those raw bindings, flags and actual exit/process interval. Cleanup envelope SHA-256: `d741c2b06baafe6c81baed703d5c70a708a59456f77752334b80c1ae111ac92d`. Financial history and archived test records are retained.

The coordinator closed only its owned QA loopback forward; the actual closure record confirms listeners absent at `12:22:15.014Z`, SHA-256 `6b2e42a388554fb9426b35432363df4291132154e5d455b7825496e6fd78b7df`.

## Actual scheduling measurements and final runtime observation

The five scheduling phases each exited 0, with one invocation and no automatic retry. The independent audit verified that their final request remained byte-identical throughout:

| Phase | Actual completion UTC |
| --- | --- |
| Schedule install | `12:23:11.652184Z` |
| Measure health | `12:24:42.126865Z` |
| Measure backup | `12:26:47.494941Z` |
| Promote recurring approval | `12:27:38.700664Z` |
| Enable timers | `12:28:54.302774Z` |

The actual PID1 service measurements, separately bound to the accepted candidate/profile, were:

| Measurement | Actual elapsed | Starts / exit | Samples |
| --- | ---: | --- | --- |
| Health | 20.537552944 s | One / 0 | 78 matching the fresh invocation; 76 with live PID/resource observations |
| Encrypted backup | 56.163636858 s | One / 0 | 212 matching the fresh invocation; 210 with live PID/resource observations |

The raw measurements prove source/config preservation; the backup callback records its two ciphertext hashes and resumed runtime writers. Their elapsed values are the recorded finite service measurements, distinct from each full coordinator dispatch. Health raw SHA-256: `588402901d79d72d8fe280dfb5d8546ff7f1dff4e5697647d9c05001d5c808ab`; backup raw SHA-256: `4c91062d86893077d962dfef1284bcf6e9bf6dbc15d73c5104b19ffadf8e4756`.

The recurring approval SHA-256 `8848c8e919ec0640480c937bbcb3562ddfa5eb1536e9fb8f5242b3fa4df81589` binds those exact measurement hashes. The actual enable result is `complete-timers-active-enabled`. A separate read-only final observation exited 0 at `12:29:32.236700Z`, matched the current accepted candidate, and observed both timers active/enabled and both services inactive with successful results and exit status 0. Its saved summary SHA-256 is `244426cae5575aa56ad0e630ee15b032c9113632921dd38e944cad72ad4abbb6`.

These actual invocations and current unit states do not prove future scheduled delivery, continuous availability, an RPO or offsite recovery.

## Final headed browser acceptance

The coordinator opened a fresh headed Chrome context with five tabs, without supplied credentials or stored browser state. The initial rendered-route guard exited 1 at `12:30:41.346Z` because it incorrectly required document scroll width to equal `innerWidth`. The normal vertical scrollbar left document/client width 1425 within a 1440-pixel viewport; the saved diagnostic and subsequent accepted observations identify no horizontal overflow. This failed check remains preserved with raw record SHA-256 `cdd8b7752f63280dc7e226db462ab46d14746f1838bc2326a9b9fdd2a2c25a8b`.

A separately reviewed finite continuation used the same five tabs and rejected actual overflow using `scrollWidth > clientWidth`. It supplied no credentials/storage, opened no new context/tabs and changed no application layout. Its real command exited 0; final acceptance was recorded at `12:32:03.744Z`, SHA-256 `6f5b9bfbc0a361e2c60ae9fa45acf813a8cc142225e2798c0dd68fe60a3cac7d`.

All five expected routes—home, catalog, admin dashboard, admin products and admin orders—returned HTTP 200, `lang=fa`, `dir=rtl`, a loaded nonempty heading, zero password inputs and zero loading elements. All measured `scrollWidth=clientWidth=1425`, with `innerWidth=1440`. The admin session returned 200, `accessMode=private-preview`, native server MFA proof verified and `Cache-Control: no-store`; the browser held zero admin cookies and performed no browser admin login/MFA. Home was left as the front tab.

The coordinator inspected four actual viewport screenshots. The independent reviewer checked their PNG signatures, 1440×1000 dimensions and raw hashes against the preserved private output directory `.local/professional-20261019-root/visible-fbc76c26-7195-4481-be99-130af73ac255/`:

| Actual screenshot | SHA-256 |
| --- | --- |
| Home | `8c1968febe9883d3428cda27b302891c0f09427f86cd3c679834d2a5e67d5883` |
| Catalog | `5f29621d81368957548facc54f491d41033a43cf984e8112ef9da4ebb4fd7458` |
| Admin dashboard | `96d51851b4c314286cdb729b1e1a5509f28fc80e492f5d8c7307c92e94c99658` |
| Admin products | `e2f686a44b8b05e2a04629ef82f373b7ce06a69ec09b2a84b2d3e0e3a8bebb78` |

The observed catalog contains four preexisting published QA products with tiny 16×20 blue sample images/brand fallback. They were preserved as existing data; this release does not establish real merchandise data or professional product photography. The final visible check covers desktop Chrome; the earlier responsive/keyboard/accessibility observations and three-engine CI remain their own stated evidence.

## Local QA environment cleanup

The owned temporary QA database/network cleanup exited 0 at `10:47:53.197Z`. It discarded only that run's tmpfs database and bootstrap environment; all 13 preexisting container identities and states were preserved. The coordinator also stopped the owned local application and SSH forward and closed the old visible Chrome session. Those temporary targets must not be reused for release testing. Cleanup record SHA-256: `56468a1946cb942e67e84d481b073df393ee0e73f07717ed2c8b14fc74cbf217`.

## Release gates

Each phase requires its own observed result under [the finite release protocol](../ops/UI_RELEASE_RUNBOOK.md). Prepared clients and guard tests establish readiness to execute, rather than business or operational acceptance.

| Phase | Current actual status |
| --- | --- |
| Source, packaged-image CI and operator verification | Accepted as recorded above; source/tools published to main |
| Immutable release tool files | Materialized; tools-only transport exit 0, runtime unchanged |
| Archive download and standalone verification | Accepted; exact ZIP/archive hashes and candidate fields recorded above |
| Server transfer | Completed; exact protected incoming files materialized |
| Engine load and identity | Accepted; actual runtime image/proof recorded above |
| Release preparation and new-image writer transition | Accepted; app ready at `12:06:25.035253Z`, timers paused |
| Deployed native purchase, 17 checks | Passed once, outer/browser exit 0; raw evidence independently audited, primary retained and server `accept-native` accepted |
| Fresh new-image isolated recovery, six business checks | Passed once, real exit 0; accepted finish, source healthy, sixth pair stopped/preserved and temporary RAM identity removed |
| Scoped primary-fixture cleanup | Completed once; own product archived/buyer disabled/session revoked, financial and unrelated auth/catalog history preserved |
| Actual PID1 health and encrypted-backup measurements | Accepted; one real successful invocation each, immutable raw evidence audited |
| Recurring scheduler installation/approval/enable | Completed; both timers actually active/enabled, services inactive/success/0 |
| Final source/runtime observation | Accepted read-only at `12:29:32.236700Z`, exact current candidate |
| Final headed browser review | Accepted at `12:32:03.744Z`; five actual loaded routes, four screenshots inspected |

The private-preview runtime release and its stated acceptance checks are complete. Public sales/domain/TLS, real providers and real catalog content remain outside this private-preview release.
