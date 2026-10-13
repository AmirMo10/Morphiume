# Dedicated native recovery acceptance — 2026-10-13

The complete Cart regression passed on the dedicated QA database: **38/38**, **19 Chromium (installed Chrome) + 19 WebKit**, with **0 unexpected, skipped, flaky or retried tests**. This execution used the unchanged production application build **83681**, fresh server session **76753**, canonical `http://localhost:3004`, and coordinator-provisioned schema **0011** in `morphiume_staging_qa_7f59c3b1d560aeac`.

- Start: `2026-10-13T01:33:20.090Z`.
- End: `2026-10-13T01:48:30.054Z`.
- Actual duration: **909964.618 ms** (15 minutes 10.0 seconds).
- All ten Cart cases, both complete T25 purchases, both catalog paging/CSV cases, and all six product-content native cases passed within this single full run.
- The original-database result remains **34/38 with four unexpected CSV409 failures**. Its safe report and private traces were preserved. Both full runs used the same frozen application build; this dedicated result does not rewrite the prior failure classification or claim its uncaptured response-body cause.

## Native authentication and server evidence

The existing maintained native helper recorded **218 observed POST actions**: **208 HTTP200**, **6 HTTP429**, **2 intentional wrong-code HTTP400**, and **2 controlled SMS-unavailable HTTP503**. Native session GET assertions are separate and are not included in this action count. Each429 was followed by the existing single bounded attempt after the real numeric `X-Retry-After` interval: customer verification **60/52 seconds**, TOTP renewal **6/9/3 seconds**, and password sign-in **1 second**. All six second attempts succeeded. There were no blanket test retries or rate-limit/IP/clock resets.

`server-recovery-dedicated-whole.json` contains only the bounded safe current-runtime evidence and this run interval: **2579 lines collected, 0 observed HTTP500, no byte/line/event cap reached**. Earlier CI/local500 findings remain historical findings and are not retroactively classified by this result.

The native auth, access-control and page-error assertions were retained. Observer instrumentation was off. Existing action10-second, case120-second budgets (the existing shipping-specific180-second budget) and aggregate25-minute cap were unchanged.

## Identity, isolation and owned cleanup

Before execution, the private environment was checked against the exact dedicated decoded database name, existing loopback tunnel port15433, and canonical origin3004. The same private environment was used by the running app and every fixture helper. At the final readonly audit, PostgreSQL authenticated readback matched the exact dedicated database and configured runtime DML role. Original and runtime database names were rejected by the audit's additional exact-target check; the original database was not queried during this exclusive window.

All **250** files in the pre-run source snapshot remained identical. The provider SHA256 was `83effbe9ea8ae88c7c469768679b0c6af56e4aab77c623f268d7497b4fa7ed2f`, HTTP wrapper `78fd76d9383f27186f5a0953f5102d19482b6715ca0e1af9c9ce2bfd63879a6f`, and approved QA target guard `7029252a6903995ff1992633475d0b660e63e8d2aa1fad625664bea94683b772`.

The readonly run-scoped audit at `2026-10-13T01:51:24.417Z` found **0 active owned administrators, 0 unarchived owned products, 0 active owned customers and 0 retained owned sessions**. Each test completed its scoped fixture cleanup; no additional mutation was needed. Financial/inventory history and native limiter records were preserved. Original history was preserved by avoiding the original target entirely, not by querying it during the hold. The exclusive native/PG window was explicitly released after the audit. QA performed no DDL, migration, reseed, worker tick, build or restart.

## Safe artifacts and limits

The raw38 report, logs, traces and previous34/38 private report remain in protected Admin/SYSTEM-only directories. The safe38 summary independently passed the field whitelist with0 unknown fields and no auth-secret pattern. All eight changed screenshots were visually reviewed: no password, OTP, TOTP URI, recovery code, token or cookie appears. Product/order screenshots show clearly labelled synthetic data and a decoded blue synthetic PNG. The two catalog screenshots show the empty public state at capture time; they do not demonstrate a populated image grid. Populated fixture paging/filter/CSV behavior is established by the native test assertions, separately from those screenshots.

- Safe browser summary: `browser-recovery-dedicated-whole.json`, SHA256 `4589278b29eae3e7a2d22c5098ca6af6452e253c1613a77c654717ac185b5926`.
- Safe server evidence: `server-recovery-dedicated-whole.json`, SHA256 `941aee615eeba63dfa375d544bd3964d95b24f2104ab3934cbaf5b91f8fe8b3c`.

This is local Chrome/WebKit native acceptance. Linux Firefox, B/C native acceptance, accepted-container publication/deployment, live payment/SMS and the 200-VU/20-minute load test were not executed by this run. The first failed provisioning transport and its coordinator-reviewed resolution remain separate operational history, not browser acceptance evidence.
