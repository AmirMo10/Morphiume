# Paged account and operator inboxes — source handoff

This slice implements the typed inbox consumers. It does not claim application-server, native authentication-server, PostgreSQL, worker, SMS or email acceptance. The frozen analytics and checkout-recovery slices were not edited.

## Routes and controls

- Customer: existing `/account` tab `اعلان‌های حساب`. `CustomerPrivateBoundary` uses the current native customer identity and global private generation; pending/error hides and unmounts inbox data. Guest visitors see the existing login link.
- Operator: `/admin/notifications`, heading/navigation `اعلان‌های مدیریت`. The actual admin native client must be settled, error-free and match the server admin identity. Mandatory MFA and an **explicit server permission** `orders.fulfill` or `refunds.write` are required. Role-name fallback is not used for this destination or its rows. Permission-scope changes remount the panel; server row authorization remains authoritative.
- Checkbox: `فقط خوانده‌نشده‌ها`. Select: `اعلان در هر صفحه`, choices ۲۰/۵۰/۱۰۰. Changing either returns to page ۱. Page/filter state is local, private and unpersisted.
- Refresh: `تازه‌سازی اعلان‌ها`. GET failure: `اعلان‌ها دریافت نشدند.` with `تلاش دوبارهٔ اعلان‌ها`.
- Per-row read: `علامت‌گذاری به‌عنوان خوانده‌شده`, pending `در حال ثبت…`, success `اعلان به‌عنوان خوانده‌شده ثبت شد.`. An in-memory in-flight guard prevents duplicate click submission. A failed read keeps the current row/read action for explicit retry; no automatic write retry or optimistic count decrement occurs.
- Count: `اعلان‌های خوانده‌نشده در همهٔ صفحه‌ها:` uses the server's decimal `unreadCount` and integer BigInt formatting, including values beyond Number's exact range. It is independent of the currently visible page/filter.
- Paging landmark: `صفحه‌های اعلان‌ها`, standard `صفحهٔ قبل`/`صفحهٔ بعد`. Empty all: `در این صفحه اعلانی وجود ندارد.`; empty unread: `اعلان خوانده‌نشده‌ای در این صفحه ندارید.` An empty page still shows the actual server count and any available paging controls.
- `مشاهدهٔ سفارش` links only to `/orders/<id>` for a customer or `/admin/orders/<id>` for an operator with explicit `orders.read`. No financial/refund/provider/evidence interpolation is present.

## Wire and lifetime

GET `/api/notifications/page` and `/api/admin/notifications/page` send exactly `page`, `pageSize`, `unreadOnly` (canonical integer/boolean strings). Responses are `NotificationPageDto` in the existing `{data}` envelope. Per-row PATCH `/api/notifications/<id>` or `/api/admin/notifications/<id>` sends the literal `{}`. Success reloads the server page/count; refresh failure keeps the known read-success notice without inventing new page state.

`usePagedData` cancels obsolete GETs and excludes responses from an old query/attempt. Read work uses the keyed component's lifetime signal and checks it before success, error and finally updates. Customer identity/generation changes and operator native pending/error/owner changes unmount private rows. Operator GET/PATCH 401/403 clears the panel and routes to admin sign-in; the shared customer API denial path closes the native customer private boundary. Existing session/privacy/checkout/auth modules were not changed.

Text uses ordinary React content, bidi isolation, existing external CSS, named article headings, native controls, live feedback and no inline styles. Only typed title/body/read time/order identity are displayed; extra payload/error/provider/evidence fields are not rendered. No inbox data, phone, OTP, auth state or session token is persisted by these components. The existing anonymous privacy transport signal remains unchanged.

## Executed controlled checks

`node docs/frontend/notifications-component-check.mjs` passed **13 reported groups**: one SSR group plus six groups each in Chromium and WebKit. It bundles the actual inboxes, registered admin page/shell, customer provider and installed Better Auth clients. Only Next navigation/link integration is a fixture shim; all native-session and feed responses are intercepted synthetic HTTP at the genuinely insecure `http://192.0.2.1` origin. No running Morphiume application, native server, DB or worker is contacted.

The groups cover global count `9007199254740993`, mixed text, page/filter/100/reset and exact query whitelist, strict `{}` PATCH and double-click guard, server read/count refresh, empty/error/retry, failed read retention, actual native pending/error, late GET/PATCH account changes, customer/operator 401/403 clearing, guest state, explicit permission union, denied support/product-manager/owner-with-missing-permissions, finance without order links, mandatory MFA, private extra-field exclusions, 320px overflow, keyboard activation and zero serious/critical tagged axe violations. Both engines assert zero page errors. SSR has zero transport/browser-data exposure. The shared anonymous storage signal is allowed only with its existing `kind`/`signal` keys; inbox/session data is absent.

Two initial fixture failures were corrected without weakening assertions: the operator late-read setup reused a previously-read synthetic row, and a zero-localStorage assertion contradicted the accepted provider's anonymous privacy signal. Resetting only synthetic read state and asserting the exact anonymous signal schema resolved them. Final tests retain strict zero page errors.

`node docs/frontend/cart-privacy-ssr-check.mjs` passed all seven existing customer consumers with pending native identity, no private form/data, no inline attributes and no browser/storage/entropy/transport access. Global TypeScript, scoped ESLint (four UI files and two controlled harnesses, zero warnings) and scoped `git diff --check` passed.

The older `cart-privacy-component-check.mjs` fixture was updated **only** from the legacy notification array to the paged endpoint/envelope and the corresponding late-response alias. Its broader latest WebKit order/cart navigation access-control page-error failure remains recorded in `CHECKOUT_RECOVERY_LIFETIME.md`; this C slice does not suppress that assertion, reinterpret it as auth denial, claim it fixed, or claim a fresh whole-cart pass. Dedicated C privacy tests passed, with the accurately narrower scope above.

## Frozen paths and remaining acceptance

UI: `src/components/notifications.tsx`, `src/components/admin-notifications.tsx`, `src/app/admin/notifications/page.tsx`, and the inbox nav-only addition in `src/components/admin-shell.tsx`. Harness/doc: this document, `notifications-component-check.mjs`, notification DTO/alias-only updates in `cart-privacy-component-check.mjs`, and the appended frontend implementation handoff.

Root owns the combined production build/runtime/API/schema integration. Independent QA must exercise actual native actors, audience/per-row authorization, persisted paging/unread counts and selected-job worker output in the new runtime. No source UI test establishes external delivery, live privacy-policy approval, capacity or production readiness. No commit, push, app-server request, native-server request, PG call, migration, worker, build or restart was performed by frontend.
