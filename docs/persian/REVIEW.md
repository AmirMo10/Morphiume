# Persian editor review — 2026-10-12

Actual specialist: `/root/persian_editor`. Scope: approved specification §8, T02/T19/T20/T23/T25, `AGENTS.md`, direct local `morphiume-fa-rtl` skill, source copy, shared formatter behavior and a read-only review of the running production build in a protected test environment. Frontend owns its pages/components; all corrections were sent to that owner. No product, order, checkout, OTP delivery or payment record was created by this review.

## Executed evidence

At 10:36 UTC, a Node/tsx assertion script imported the actual central helpers and passed with exit 0: eight valid Iranian phone representations converged to one canonical value; Persian/Arabic/Latin numeric strings normalized identically; a postal-style string kept its leading zero; Arabic Yeh/Kaf and half-space normalized in a separate search key; three Toman input styles converted exactly once; display was `۱٬۲۹۰٬۰۰۰ تومان`. `2026-10-11T20:29:00Z` displayed `۱۹ مهر ۱۴۰۵`; two minutes later displayed `۲۰ مهر ۱۴۰۵`, across Tehran midnight. Calendar resolved to `persian`.

The actual new `src/components/persian-datetime.ts` was independently exercised after implementation: four valid Jalali/time conversions, five invalid day/time cases (including a historical Tehran DST gap), four exact integer basis-point cases and five invalid percentages passed. `۱۴۰۵/۰۷/۲۰ ۱۲:۳۴` round-tripped as `2026-10-12T09:04:00.000Z`; `۰٫۲۹` produced 29 basis points without floating-point percentage multiplication. These are formatter assertions, not an end-to-end coupon API test.

Codex IAB rendered `http://localhost:3000` with a temporary 320×740 viewport:

| Page | Observed state | document client/scroll width |
|---|---|---|
| `/products` | Persian empty catalog, labeled search/sort/stock controls, test banner | 305 / 305 |
| `/account` | Phone sign-in form; `type=tel`, `inputmode=tel`, `dir=ltr`, actual label and help link; Tab from input focused request-code button | 305 / 305 |
| `/pages/shipping` | Approved content not yet published; no invented carrier/cost/delivery promise | 305 / 305 |
| `/admin/login` | Persian email/password login; distinct labels, `dir=ltr`, password type preserved | 320 / 320 |

`lang=fa` and `dir=rtl` were observed on catalog/account. Catalog and admin login screenshots were visually inspected through IAB. Input values are redacted by the browser tool, so no claim about exact phone value preservation is based on browser output; that evidence comes from the formatter/source check. The running build still showed the older buyer-specific account heading while source corrections were being integrated. A final rebuilt-page retest remains a separate QA/integration step.

The three `src/lib/fa-copy` modules passed scoped ESLint and TypeScript 6 compilation (explicit `--ignoreConfig`, ES2022/bundler mode), both exit 0. Official `skill-creator/scripts/quick_validate.py` validated the updated `morphiume-fa-rtl` skill with exit 0. Evidence JSON parsed successfully. Temporary IAB viewport override was reset and the reviewer-created tab closed. Root's integrated build/tests remain separately owned and reported by the coordinator.

QA subsequently supplied safe artificial-fixture screenshots `docs/qa/screenshots/owned-order-chromium-320.png` and `owned-order-webkit-320.png`. The editor visually reviewed both: recorded payment/shipment, Toman totals, Jalali event time and isolated tracking identifier were visible; English `confirmed` was still present on the older build. QA reported the order viewport overflow and coordinated the fix. These screenshots add an editorial inspection of an actual order view; the full purchase and browser-engine test execution remain QA's evidence, not this editor's execution.

## Findings and owner handoff

| Finding | Actual correction / handoff | Evidence status |
|---|---|---|
| Normal order/shipment states could expose English (`confirmed`, `preparing`, `completed`); partial refund and payment exception omitted | `src/lib/fa-copy/status.ts`; frontend imported it and order-event dictionary | Source integration observed; final UI retest pending |
| Generic `succeeded` is ambiguous for a refund | Context-aware `statusLabel(...,'refund')` and separate order/payment/shipment labels | Source integration observed |
| Account sign-in called every visitor a buyer; resend countdown used unnatural «تا» | Optional checkout context; account «ورود با شمارهٔ همراه»; resend «پس از» | Corrected frontend source observed; running old build not retested |
| Sign-out and generic error promised stronger privacy/order guarantees than implemented | Softened copy about ending use and checking the recorded order | Owner confirmed; final UI retest pending |
| Coupon edit sliced UTC and save used the device timezone; floating percentage multiplication rejected some decimals | Jalali inputs with explicit Tehran conversion; integer string basis-point parser | Actual helper edge assertions passed; UI/API flow pending |
| Receipt UI checked `applied/excess` but backend emits `primary/extra/inventory_exception`; «دریافت‌های واقعی» also mislabels mock receipts | `receiptDispositionLabel` integrated; caption now «دریافت‌های تأییدشدهٔ ثبت‌شده» | Corrected source observed; final UI retest pending |
| Audit actions/entity types/system reasons exposed technical English | `src/lib/fa-copy/admin.ts` integrated in reports and inventory; user-written reason text stays original | Corrected source observed; final UI retest pending |
| Default Zod field messages could be English | `validationMessage` integrated in coordinator's HTTP wrapper | Corrected source observed; final HTTP/UI retest pending |
| Latin family, concentration, notes, names and brand mixed with Persian need isolation; decorative uppercase brand spelling diverged | Concrete `bdi`/exact `Morphiume` corrections sent frontend | Source/UI recheck pending |

## Remaining limits and owner content

This review does not certify T20, WCAG conformance, real mobile hardware, zoom, screen reader behavior, three browser engines, a complete purchase, a real PSP/SMS integration or all payment error paths. Independent QA owns those actual results. Catalog was empty during initial live-browser review; later QA order screenshots were inspected as described above. Final copy review of rebuilt protected staging remains necessary after all integration changes.

Coordinator handoff: the aggregate financial report uses a display utility capped for one order. Multiple valid receipts can exceed that limit; use a separate exact aggregate formatter while preserving per-order validation. This source concern was reported, not tested end to end by the editor.

Owner-approved Persian brand spelling, legal entity and licenses, tax rules, product/photo/ingredient/warning facts, telephone/address/contact content, shipping coverage/cost/time, cancellation and perfume-return conditions, privacy/retention text and real service contracts are still unknown. Blank/draft content is intentional. Do not invent official policy to pass a screen test. The current test shipping/terms versions are test fixtures, not enforceable business policies.
