# Persian review: presentation, maintenance, returns and collections

Actual reviewer: `/root/persian_editor`; date: 2026-10-12, 16:35 UTC. Observed Git HEAD: `538ff1c`; the presentation/returns/collections/reporting slices under review are still part of the integrating working tree. Ownership for this pass is limited to `src/lib/fa-copy`, `docs/FA_COPY_GUIDE.md` and `docs/persian`. Frontend and backend paths were read only. The coordinator had reserved the quiet database test window for the commerce agent.

No browser, native-auth, public/API, database, production build or restart operation was executed by this reviewer. Prior browser evidence was not reused as a test result for these slices.

## Findings and exact owner handoff

Line numbers refer to the inspected source revision and may move during integration.

| Source | Finding | Proposed replacement / observed state |
|---|---|---|
| `src/components/admin-returns.tsx:69` | «سوابق قبلی به‌تنهایی مدرک بازآزمایی این صفحه نیستند» describes implementation/test behavior to a nontechnical manager. | «رسیدگی به این درخواست پایان یافته است. وضعیت و توضیح ثبت‌شده را بررسی کنید.» Requested from frontend; not yet observed applied at this review checkpoint. |
| `src/components/admin-returns.tsx:46,76`; `manual-refund-failure.tsx:63` | «بازآزمایی» sounds like software testing rather than a retry of a recorded business decision. | «ارسال دوبارهٔ همان تصمیم». Helper: «همان درخواست، نتیجه، دلیل و تصمیم موجودی دوباره ارسال می‌شوند. با ویرایش فرم، تصمیم تازه ساخته می‌شود.» Keep the existing bound-payload behavior; this is a copy recommendation. |
| `src/components/admin-returns.tsx:74` | The server/permission implementation sentence can be replaced by the business consequence. | «ثبت این تصمیم، بازپرداخت وجه انجام نمی‌دهد. وضعیت مالی سفارش را جداگانه بررسی کنید.» Financial approval remains separate from cancellation or receipt of goods. |
| `src/components/manual-refund-failure.tsx:53–66` | Unknown transfer outcome must not become a failed refund or completed cash outflow. | Current text correctly requires confirmed non-transfer, leaves unknown results pending/processing, states that no money transfer is performed and that failed amount is not added to completed refunds. Source behavior/copy observed; no payment test performed. |
| `src/components/admin-returns.tsx:70–73` | Cancellation and physical return have different effects. Quality review and restocking must not be implied by merely receiving a returned item. | Current source offers explicit receive-without-restock vs quality-reviewed restock, and explains stock permission. No invented perfume-return policy, eligibility duration or automatic refund guarantee. |
| `src/components/orders.tsx:45` | Customer copy exposes the backend operation («در سرور بررسی می‌شود»). | «گزینه‌های این فرم با توجه به وضعیت و سوابق سفارش نمایش داده می‌شوند.» Keep «ثبت درخواست به معنی تأیید آن یا انجام بازپرداخت نیست.» |
| `src/components/cart.tsx:26` | «از سرور محاسبه می‌شوند» describes implementation rather than the next customer step. | «هزینهٔ ارسال، تخفیف و مالیات در مرحلهٔ جمع‌بندی نمایش داده می‌شوند.» No new fee or tax rule is proposed. |
| `src/components/site-shell.tsx:31`, `src/app/checkout/page.tsx:8`, cart maintenance notice | Maintenance is a pause in new order acceptance, not an outage of account/tracking. | Current text says new orders are temporarily paused and preserves links to account/tracking/cart. Checkout route reads the current state separately. These are source observations, not new runtime acceptance results. |
| `src/server/presentation.ts:53` | «حالت نگه‌داری» is less precise than the actual order-acceptance switch. | Coordinator changed this message to «تغییر توقف موقت سفارش‌گیری به تأیید دومرحله‌ای تازه نیاز دارد.» Two-factor wording preserves all valid factor proofs, not only TOTP. |
| Commerce retry-payment pause message | «ایجاد تلاش پرداخت جدید» is technical and can be confused with whether an older payment succeeded. | «شروع پرداخت تازه موقتاً متوقف است. نتیجهٔ پرداخت قبلی را از همین سفارش پیگیری کنید.» Queued to the backend owner after the quiet test window; not edited by the reviewer. |
| `src/components/presentation-form.ts:16` | «پارامتر و کد» is vague for store staff correcting a link. | «نشانی یک صفحه از همین فروشگاه را وارد کنید. نشانی بیرونی و بخش‌های اضافی پس از علامت سؤال یا # مجاز نیستند.» Requested only; internal-link rules are unchanged. |
| `src/components/admin-presentation.tsx:107` | Latin routes embedded directly in an RTL paragraph are not isolated; the route list is technical. | Isolate examples using `bdi dir=ltr`, with ordinary explanations such as product list or an approved published page, while retaining the actual supported routes. No external link or unapproved content is suggested. |
| `src/components/admin-presentation.tsx:109` | When maintenance message is null, preview says only «پیام عمومی توقف». That does not show the actual published default text. | Show the exact default message visible to customers. Avoid presenting a placeholder as the concrete post-save preview. |
| `src/components/home-presentation.tsx:10,12`; `collection-catalog.tsx:12` | Owner-entered description text may mix Persian and Latin; names/titles are isolated but these paragraphs are not. | Wrap the description text with `bdi` or apply `dir=auto` to the paragraph, preserving whitespace and original text. Source/browser retest pending. |
| `src/components/collection-catalog.tsx:34` | «محصول قابل نمایشی در این مجموعه نیست» is unnatural. | «در این مجموعه هنوز محصولی برای نمایش وجود ندارد.» Range fields correctly label تومان; selected facet values and limited-filter help are retained. |

## Reviewer-owned changes

`src/lib/fa-copy/admin.ts` now labels `presentation.updated` as «ویرایش نمایش فروشگاه» and `refund.failed` as «ثبت عدم انتقال وجه بازپرداخت». `src/lib/fa-copy/status.ts` now labels the corresponding failed-refund event as a recorded non-transfer decision and `payment.retry` as a newly recorded payment request. None of these strings turns an uncertain payment into success or failure.

The guide was extended with the same presentation/return/maintenance copy rules. Period-report wording is explicitly a proposal in [REPORT_COPY_PROPOSAL.md](REPORT_COPY_PROPOSAL.md). During this review, the coordinator activated the frontend agent's report-only work; no report screen acceptance is claimed by this editor. Return/presentation source refinements are queued for the next owner window because those slices are frozen for the combined checkpoint.

The report proposal was also checked against actual SQL, without executing it: `current.activeReservations` is `SUM(inventory_balance.reserved)` (stock units, not reservation-record count), `pendingJobs` counts both pending and running, and work-queue receipt remainder subtracts only completed refunds while pending/processing refunds have their own column. Recommendations were corrected to match those facts and sent to the report UI owner.

## Executed checks

`node docs/frontend/presentation-form-check.mjs` completed with exit 0. It imports the actual pure client draft helper and strict schema, bundles only those modules in memory and touches no DB: nullable/metadata normalization, plain text handling, limits, internal href agreement, 16 invalid cases rejected by both and immutable ordering preserving retained IDs. This is not a production application build or browser test and does not prove screen rendering, authorization or owner approval.

After the owned audit/event-label changes, scoped ESLint and TypeScript 6 compilation of the three copy modules both exited 0. Evidence JSON parsed successfully, and scoped `git diff --check` exited 0. Broader commerce test results belong to the commerce/coordinator report. No full security, accessibility, WCAG, real device, full purchase or legal-accounting certification is claimed here.

## Freeze and next integration

The copy owner should apply the requested frontend strings and bidi changes, then the coordinator should include them in the next built-page/component verification. Backend wording must wait for the owner's quiet test window to close. Unknown legal, brand, carrier, shipping, product-quality/ingredient and medical facts remain unknown; configuration text accepts approved facts rather than inventing them.
