# Linux E4 focused native execution — 2026-10-13

Actual focused acceptance passed on all three native Linux engines: **notifications12/12** and, in a separate subsequent run, **analytics9/9**. Both runs had0 unexpected/skipped/flaky results and0 test retries. The complete safe evidence is [linux-e4-focused-native-summary.json](linux-e4-focused-native-summary.json). This is selected21-case acceptance, not a whole-generator78-case run, capacity measurement or production certification.

| Run | Chromium | Firefox | WebKit | JSON start UTC | Exact JSON duration |
| --- | --- | --- | --- | --- | --- |
| Notifications |4/4 |4/4 |4/4 |2026-10-13T06:37:12.997Z |212972.323ms |
| Analytics |3/3 |3/3 |3/3 |2026-10-13T06:41:43.675Z |104808.02900000001ms |

The JSON preserves process UTC start/end and monotonic elapsed separately. Those process values are not substituted for the authoritative Playwright durations or used to invent a single combined run end.

## Frozen runtime and real engines

Source was exactly `e4bed691dc938a9c0f79022696d24f063ad97724`, Ubuntu24.04 WSL2, Node24.21.0/pnpm11.25.0/Playwright1.64.0. The coordinator's production build completed39.488s; server39448 served canonical `http://localhost:3004`. The app and all native/SQL fixtures used the same dedicated schema13/53-table database, runtime DML-only configuration and verified loopback SSH15433 tunnel. The private runtime config was mode600; no owner credential was present or passed to the selected notification child.

The same imported cache had coordinator-verified actual launch-smoke versions Chromium156.0.8078.4, Firefox157.0 and WebKit27.2. All three then genuinely ran their selected native tests. No Chromium channel, custom browser flag, network/header rewrite, auth interception, quota reset, forged IP, clock change or native library bypass was used. The test-only analytics collector outage is an explicit advisory-event interruption; native cart/auth/payment requests stayed real.

Cache binding was producer `c749f796d62b9680a26dd7ee5a84f38f2fd43da6`, run38353949717/job115152409404/artifact11791724128. ZIP SHA256 `484775ced3e5d753c8ee33e376f6acdf188f9b9c13a85ea9f24cab7b8a6645ef`; manifest `f8965f364a91eed031b9289417e646fbe06ee17c62e7ebd39f19ea27fb401114`; archive `976d997960e8b328cc7b6343014efb5225b534511fd602b0b4e29e118782304f`; published importer canonical-LF `0091785338dd15f0838db386cda0360233a490ef33aa81b2d62faee9dc3a99fc`. The coordinator verified/imported these identities. QA did not repeat the download/import or rehash the whole official cache.

Before the first test, all686 tracked-file byte hashes exactly matched the coordinator's private post-build baseline. Two strict Git-blob prefreeze comparisons stopped before native/PG calls; all214 differences were subsequently proved newline-only, with0 other content differences. Their scripts, tool observations and safe stopped-attempt records remain private. No source normalization/edit was performed. All686 source hashes and the private runtime-config hash remained unchanged after both runs.

## Acceptance actually exercised

Notification cases used genuine customer OTP and admin password/MFA sessions. Customer HTTP/UI exercised105-row pagination, global unread counts, idempotent read timestamps, foreign/unknown404, exact retained-disabled403 versus revoked/absent401, no-store, empty same-origin PATCH, cross-tab logout/A→B privacy,320px/keyboard/axe. Operator cases used real paid→shipped→delivered→return/refund HTTP journeys, canonical selected notification jobs and exact event/recipient/template/key/read assertions. Each full current-permission DB model checked every visible or retained row and global count; no arbitrary extra-row filter was added. Audited owned membership reduction was explicitly fixture preparation after real MFA/delivery; final role/session withdrawal used the real native owner API. Current-factor and revoked-role failures removed the private panels. No broad public worker or reservation sweep was started locally; only the exact owned canonical jobs were selected. Packaged-image worker acceptance belongs to the coordinator's separate CI evidence.

Analytics cases exercised native owner/product_manager/finance access, support403 and customer/anonymous401, aggregate-only/no-store reports, Jalali date conversion,320px/axe and subsequent real role withdrawal. Strict anonymous metadata/UUID/Origin/MIME/size rejection, neutral202, event dedup and exact unchanged server financial counters passed. With a real customer httpOnly session cookie present, each Linux engine passed the unchanged wire assertion: capture omitted Cookie/Authorization/referrer/control headers and event Origin was canonical. Explicit successful search/view/cart emissions, no contact/query canary leakage, advisory collector outage, paid mock verification/replay/callback, one receipt/shipment/stock effect and independent server/cohort counts also passed.

The old Windows WebKit Cookie-omission failure, initial/corrected Windows B/C results and packaged-image77/78 notification fixture failure remain preserved. Linux success does not relabel those failures or prove their precise original causes. No universal Safari/device/privacy claim is made.

## Native limits, safe logs and cleanup

Notifications observed113 native POST responses:108 HTTP200 and5 HTTP429. Analytics observed69:66 HTTP200 and3 HTTP429. Each of the eight actual429 responses had bounded numeric `X-Retry-After`, followed by exactly one successful second attempt with normal maintained-library code issuance. Notification intervals were1/9/54/9/8 seconds; analytics9/9/8 seconds. Retries0/action10s/case120s/global25min and library quotas were unchanged.

A bounded readonly copy of the complete server log yielded **1414 lines/0 wrapper HTTP500**, with byte/line/event caps all false. The original server log was never cleared/truncated. Sanitizers and their two evidence helpers ran only in separate protected scratch namespaces; the application checkout's tracked browser-summary.json was not overwritten. Raw JSON/HTML/logs/traces remained under mode700 private parents, files mode600. No new public screenshot or raw credential/contact/provider/error artifact was produced.

The final readonly audit at **2026-10-13T06:52:23.847Z** verified canonical13 migration checksums,53 public tables,0 generated schemas, DML-only identity/no owner and **0 active owned admins,0 unarchived owned products,0 active owned customers,0 retained owned sessions**. No additional cleanup mutation was needed. Tests retained their financial/inventory/audit/notification/source/outbox history and native limiter records. Only normal owned fixture cleanup ran.

**Global unrelated public-row equality is unmeasured.** No fresh prewindow53-table row baseline was captured, and none was backfilled. Per-case owned financial/read/idempotency assertions are actual; the private final53-table snapshot is an after-only record.

The exclusive native/PG window was released after that audit and explicitly acknowledged by the coordinator. Recorded release handoff: **2026-10-13T06:53:32.000Z**. No later native/PG/worker/source/build/deployment action was performed for this task; remaining reporting was offline.

## Commands

Both commands ran from the exact private E4 source, using the installed Node/pnpm executables, explicit verified cache, matching private npm config/store and `verifyDepsBeforeRun=error`. Supported installed-reporter environment overrides placed raw JSON/HTML under unique private paths; a normal --output path placed browser artifacts there. No assertion or budget option was changed.

```text
pnpm --config.store-dir=PRIVATE_STORE --config.verifyDepsBeforeRun=error exec playwright test -c tests/e2e/playwright.config.ts notifications.spec.ts --project=chromium --project=firefox --project=webkit --output=PRIVATE_NOTIFICATION_OUTPUT
pnpm --config.store-dir=PRIVATE_STORE --config.verifyDepsBeforeRun=error exec playwright test -c tests/e2e/playwright.config.ts analytics.spec.ts --project=chromium --project=firefox --project=webkit --output=PRIVATE_ANALYTICS_OUTPUT
```

No commit/push, source implementation change, migration, reseed, global worker, load200VU/20min, live provider, security pentest or deployment acceptance was performed by QA here.
