---
name: morphiume-storefront
description: Build and maintain Morphiume's Persian storefront, catalog, cart, checkout and customer order screens using the shared commerce DTOs and real API.
---

# Morphiume storefront

Read `docs/PROJECT_BRIEF.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UX_FLOWS.md` and `src/contracts/commerce.ts` before changing purchase flows. Follow `AGENTS.md` and the current ownership plan. This skill does not authorize messaging, publication or operational data changes.

- Keep the document `lang="fa" dir="rtl"`, use logical CSS, self-hosted Vazirmatn and the original `/brand/morphiume-wordmark.svg`. Isolate Latin names, phones and identifiers.
- Read products, variant availability and totals from the server. Never invent product claims, service promises, reviews or success states. Show explicit empty/error/loading states.
- Use the same-origin cookie API envelope `{data}` or `{error:{code,message,fields?}}`. Use native Better Auth customer phone APIs. Never keep auth tokens in browser storage.
- Preserve the guest cart through its server cookie. Keep address inputs on failure and gateway return; clear private draft address on logout. Purchaser phone and receiver contact are separate.
- Display IRR DTOs as exact decimal تومان using integer arithmetic. Send volume identity and quantity, never client price. Quote before checkout; submit the server fingerprint, policy version and an idempotency key.
- Show a fresh explicit review after price/stock conflicts. Payment status comes from server verification. Unknown payments offer status refresh and no fresh attempt from the result page.
- Use persistent field labels, inline errors, a focused linked summary, keyboard controls, at least 44px targets and one polite cart announcement. Verify 320px, mixed direction and zoom.
- Hide unsupported services. Test/demo adapters and data must be visibly marked and blocked in live by server controls.

Record real checks and unresolved limits in `docs/frontend/IMPLEMENTATION.md`. Appropriate checks include typecheck, lint, production build and the critical browser path when its database/API is available; do not claim checks that were not run.
