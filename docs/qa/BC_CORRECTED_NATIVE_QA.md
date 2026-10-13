# B/C corrected focused native acceptance — 2026-10-13

The distinct corrected focused run completed **13/14 passed,1 failed**: Chrome7/7 and WebKit6/7, with0 skipped/flaky/test retries. All **8/8 notification HTTP/UI cases passed**. The remaining failure is Windows WebKit analytics Cookie omission; full cross-engine analytics acceptance is still incomplete. The initial **5/14** failed run and raw/safe artifacts remain preserved in `BC_INITIAL_NATIVE_QA.md`.

Production build **96160**, server **92789**, canonical `http://localhost:3004`; exact fresh database `morphiume_staging_qa_b625408702be90db`, canonical schema13/53 public tables, runtime app-only credentials and explicit test/mock capture enabled. Start **2026-10-13T03:11:53.879Z**, end **03:19:31.717Z**, duration **457838.256 ms**. These are JSON-reporter values, not rounded console durations. No application source/build/runtime changes occurred during the run.

| Scope | Chrome | WebKit | Evidence and limit |
| --- | --- | --- | --- |
| Analytics native report permissions/UI | Pass | Pass | Real owner/product_manager/finance MFA, support403/customer-anonymous401, aggregate-only/no-store, Jalali dates,320px/axe and subsequent native role withdrawal401. No deterministic post-repeatable-read native race is claimed. |
| Anonymous HTTP boundaries/dedup | Pass | Pass | Strict body/UUID/Origin/MIME/size rejection, neutral202, exact owned-event cardinality and unchanged financial/server counters. |
| Actual FE emissions/collector outage/paid purchase | Pass | Fail | Chrome completed real OTP→cart→quote→paid replay/callback/stock/receipt/shipment/report invariants despite collector interruption. WebKit stopped at the unchanged Cookie-omission assertion before outage/purchase steps. |
| Customer notification HTTP/UI |2 passed |2 passed | Own105-row paging/global unread/read replay/foreign404/no-store, genuine A→logout→B and exact retained-disabled403 masks. |
| Operator notification HTTP/UI |2 passed |2 passed | Native owner/fulfillment/finance permissions, genuine shipped→delivered before return, current-factor403/native-role-session withdrawal401, private-data masks, read replay and320px/keyboard/axe. |

## Remaining analytics failure

The exact failure is `analytics-fixtures.ts:100`, reached from `analytics.spec.ts:102`. The maintained privacy assertion was not changed, retried, skipped or relaxed. Retained network evidence shows three event POSTs with **202**, **canonical Origin=true**, **Origin:null=false**, and **Cookie present=true**. Authorization/referrer/test-control-header presence was false. The previous initial events were403/Origin:null; the Origin-only source correction is therefore observed, while Cookie privacy remains failed.

`analytics-webkit-origin-corrected-wire.json` contains only fixed kind/status/header-presence/origin booleans before collector interception. Its six records include configuration GET traffic; no header value, cookie name, request body, contact canary, provider reference or raw URL is exported. Browser trace evidence alone is not a server-received-header proof or classification of the Cookie cause. The separately executed frontend synthetic real-loopback echo provides its own transport evidence in `docs/frontend/ANALYTICS_TRANSPORT_DIAGNOSIS.md`; it does not replace this failed native gate. WebKit steps after that gate did not execute.

## Native responses and safe server evidence

There were **119 observed native POST actions:116 HTTP200 and3 HTTP429**. Password sign-in429 intervals8/9 seconds and customer OTP-send50 seconds came from actual numeric `X-Retry-After`, each followed by exactly one successful second attempt. No limiter/IP/clock reset, quota increase, code fabrication, blanket retry or test retry was used. The28 MFA-enable/enrollment successes,28 sign-in successes and16 customer send/verify pairs were real maintained-library flows. Existing action10-second/case120-second/global25-minute budgets stayed unchanged.

The complete private server log yielded **877 lines,0 HTTP500, no byte/line/event cap reached**. Safe evidence is scoped to this run's actual start/end. This does not classify or erase older INTERNAL500 records. The generic browser exporter still omits notification-specific annotations; their exact stage/status/UUID records remain protected privately.

Windows engines: Playwright1.64.0, installed Chrome154.0.8037.93, WebKit27.2. The previously measured ordinary Firefox launch failed `spawn UNKNOWN`;0 native Firefox cases ran, no workaround. Selected Linux21 and whole local52/Linux78 remain **unrun** and require separate authorization.

## Frozen identity, privacy and cleanup

Before the first corrected test, authenticated readonly53-table fingerprints and **394 app/test/deploy source hashes** were captured. All394 files remained unchanged through acceptance. The exact DML role had no superuser/createdb/createrole/public-CREATE privileges; no migration-owner credential was present. Canonical13 migration names/checksums remained unchanged afterward.

The installed Playwright HTML reporter prioritizes supported `PLAYWRIGHT_HTML_OUTPUT_DIR` over configured outputFolder. The run used a unique child of the protected `.local/native-bc-b625408702be90db` directory because the reporter recreates its folder. JSON/output paths and all assertions/budgets remained unchanged. Post-run ACL verification checked40 report/private-parent entries and found only current Admin/SYSTEM rules. The raw corrected JSON, failure trace/screenshot and stdout were separately archived privately; initial artifacts were preserved. No new screenshot is published.

Readonly cleanup audit at **2026-10-13T03:21:52.366Z** found0 active owned administrators,0 unarchived owned products,0 active owned customers and0 retained owned sessions. All53 tables were captured afterward;22 were unchanged, including both immutable migration-history tables. Other changes are controlled native/commerce/feed/analytics fixtures retained privately, not a claim of all-public-row equality. No extra cleanup mutation was needed; financial/inventory/audit/source/outbox/notification history and limiter rows remain. No original, accepted runtime or previous QA database was queried. The exclusive window was explicitly released after the audit; no further native/PG probe was run.

## Separate coordinator-owned worker scope

Root separately ran the corrected generated-schema selected-worker fixture in **11.751 seconds**:1 job/2 messages/replay0/two preserved read timestamps, unrelated job/financial snapshots unchanged and nativeAuthfalse. Its first pre-entry CJS/top-level-await failure and subsequent parent-parser migration-prefix failure remain documented; Root reconciled the same successful capture without another business run. This is controlled factory delivery, not native OTP/MFA, a deployed worker, historical queue replay or external provider acceptance. QA did not run a worker during either native window.

## Evidence hashes

| Evidence | SHA256 |
| --- | --- |
| `browser-bc-focused-corrected.json` | `2d86ae408eea989dce06f7cdacb1f455bf1f2439b0e32eebbca470e4bf01cbf5` |
| `server-bc-focused-corrected.json` | `8af53a143a6edf53a5e62df9acc4509dc20f1d45c81943159765e8b9e4d72bf9` |
| `analytics-webkit-origin-corrected-wire.json` | `c03d5f8792d9f121a13cba651153af0daa1ea9449cf243f2635bc2fca291c569` |
| Private before-table baseline | `375c4fdd333bd4aded207e06e5277d903485ec146088bb2578e387cd60530596` |
| Private after-table/cleanup baseline | `d0f756d36b5ac982bbc9a672a127d37e40b8c745a4f26188f5c2e737c4cece1d` |

Frozen corrected source hashes: analytics client `331c119faa059e01fb37faaef48a0b29d9b51d12ab109aaf8d81ec861123b464`; notification spec `8cff2c34a7e746d92d7dd41fd6ff670714f7f84cf774f580479839b422db6395`; notification fixtures `ad329049e13073c9d746446c3aa0085776fa335a70c6f00b37dc55268867044b`; selected-worker fixture `60010091d2bce5cd7563f5632b0c8d90fc575b322adef88a49028745b971073c`. Test-fixture corrections do not change the application's disabled-account or delivery policy. No full B/C rollout, accepted immutable image, load200VU/20-minute, live provider or production readiness is claimed.
