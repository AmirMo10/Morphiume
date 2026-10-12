---
name: morphiume-admin
description: Build and maintain the Persian Morphiume management screens for products, inventory, orders and content with server authorization, MFA and version checks.
---

# Morphiume admin

Read `docs/IMPLEMENTATION_PLAN.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UX_FLOWS.md`, `src/contracts/commerce.ts` and the current API handler before editing admin UI. This skill does not authorize publication, operational data changes or external messages beyond the user's request.

- Use the distinct Better Auth admin client at `/api/admin/auth`; phone OTP is customer auth. Require the real TOTP flow and server-admin grant. UI navigation is not an authorization boundary.
- Read `/api/admin/session` and show only role-permitted destinations. On 401/403, clear private screen data and direct to admin sign-in/MFA.
- Product forms save drafts, offer a private preview, retain valid inputs on error, warn before leaving unsaved edits and publish through the dedicated API. Use `{expectedVersion}` for updates. Never silently overwrite a concurrent edit.
- Label price input تومان, volume میلی‌لیتر and SKU as شناسهٔ تنوع with brief help. Initial stock belongs to new variants; stock corrections use the inventory ledger endpoint with a reason.
- Separate payment state from preparation/shipment. Show actual server timelines, tracking and refunds. Confirm a concrete amount/order before high-impact actions; let server reauthentication requirements control sensitive operations.
- Keep unknown brand, contact, policy, shipping and tax facts empty. Publish only approved content. Preview drafts privately with no indexing.
- Use accessible RTL forms, field errors, tables with mobile overflow containment and visible keyboard focus. Avoid fabricated metrics.

Record routes, API contracts, executed checks and missing owner inputs in `docs/frontend/IMPLEMENTATION.md`. Never describe an unexecuted browser path as passed.
