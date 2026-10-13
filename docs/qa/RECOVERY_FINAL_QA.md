# Final local recovery regression — 2026-10-13

The complete native regression ran on the frozen Guide checkout, production build **83681**, server session **25202**, canonical `http://localhost:3004`, original controlled schema **0011**. It finished with **34 passed / 4 failed out of 38**, not a successful whole-suite acceptance. Chromium and WebKit each had 17 passed and 2 failed. There were no skipped, flaky or retried tests.

- Start: `2026-10-13T00:51:40.096Z`; end: `2026-10-13T01:06:46.695Z`.
- Actual duration: **906599.832 ms** (15 minutes 6.6 seconds).
- All ten Cart cases and both complete T25 purchase cases passed within this run. The older separate 4/4 and 2/2 runs are separate evidence.
- Native diagnostics recorded **213** observed actions: **204 HTTP200**, **5 HTTP429**, **2 intentional wrong-code HTTP400**, and **2 controlled SMS-unavailable HTTP503**. Each observed429 received the existing single bounded retry after the server interval; test retries remained zero. The intervals were customer verification 49 and 46 seconds, and TOTP renewal 5, 8 and 3 seconds.
- Observer instrumentation was off. Existing action10-second, case120-second budgets (the existing shipping-specific180-second budget) and aggregate25-minute cap were retained. No library limit, clock, IP, limiter record, payment history or inventory history was reset.

## Preserved unexpected failures

| Engine | Spec / assertion | Expected | Observed |
| --- | --- | --- | --- |
| Chromium | `catalog-paging.spec.ts:106` | Products CSV HTTP200 following real native TOTP renewal | HTTP409 |
| WebKit | `catalog-paging.spec.ts:106` | Products CSV HTTP200 following real native TOTP renewal | HTTP409 |
| Chromium | `product-content.spec.ts:152` | Products CSV HTTP200 | HTTP409 |
| WebKit | `product-content.spec.ts:152` | Products CSV HTTP200 | HTTP409 |

The private traces establish these statuses. The CSV response bodies were not retained in the trace, so these traces alone do not identify the error code or prove a count/byte-cap cause. Both existing product-count and CSV-byte guards can return409 in source; a separate readonly dataset diagnosis is required. The assertions remain unchanged. No failure has been relabelled as intentional or attributed to authentication without evidence. Catalog assertions after its CSV failure, and product-content assertions after its CSV failure, did not execute.

## Server evidence, identity and cleanup

`server-recovery-final-whole.json` contains only the bounded safe server evidence and this execution interval. The private current-runtime log yielded **2541 lines**, **zero observed HTTP500 events**, and no byte, line or event cap was reached. This does not retroactively explain or erase the four earlier CI500 events or the earlier separate local500.

All **205** files in the pre-run source snapshot remained identical. All **10** files in the Root trusted source manifest matched exactly. The customer-session provider matched `83effbe9ea8ae88c7c469768679b0c6af56e4aab77c623f268d7497b4fa7ed2f`; the tested HTTP wrapper matched `78fd76d9383f27186f5a0953f5102d19482b6715ca0e1af9c9ce2bfd63879a6f`.

The readonly, run-scoped cleanup audit at `2026-10-13T01:08:34.369Z` found **0 active owned administrators, 0 unarchived owned products, 0 active owned customers and 0 retained owned sessions**. The tests' owned cleanup completed; no additional mutation was required. Original financial/inventory history and native limiter records were preserved. The exclusive original native/PG window was explicitly released after this audit.

The six changed screenshots were visually reviewed. They show labelled synthetic product/recipient/phone/postal/tracking data, a decoded blue synthetic PNG and controlled order states. They contain no password, OTP, TOTP URI, recovery code, token or cookie. The private reports/traces/logs remain under Admin/SYSTEM-only directories; the prior2/2 private run was archived before the full run. The new safe summary is `browser-recovery-final-whole.json`, SHA256 `3d3e5ef2c0bc0d0fd82d3f91380ab1dbbdb09e54f07f925775ff4a81e200ded3`.

Linux Firefox, B/C native acceptance, the accepted container image, live payment/SMS, and the 200-VU/20-minute load test were not executed by this run. No build, restart, DDL or broad worker execution was performed by QA.
