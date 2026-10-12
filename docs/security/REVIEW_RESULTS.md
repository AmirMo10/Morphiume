# Independent security reproduction evidence

Reviewer: `security_reviewer`; 2026-10-12. Target at execution: isolated SSH-forwarded PostgreSQL 18.6 database `morphiume_staging`, app role `morphiume_staging_app`, `DEPLOYMENT_ENV=test`, controlled mock payments. All identities, products, addresses and financial operations in this suite are labeled synthetic. No real payment or SMS was made. Tests archive/disable only their own fixtures while retaining accounting evidence.

## Confirmed finding requiring owner fix

**SEC-01 — Medium: parallel checkout keys bypass the active-reservation account budget.** `src/server/commerce/service.ts`, `createCheckout`, counts active reservations before taking per-SKU inventory locks, but does not serialize requests for one customer. Four concurrent requests with different carts/idempotency keys all observe a count below three and create four active orders. This permits one account to hold more stock than the intended limit. Inventory balance checks still prevent overselling; this finding is reservation abuse, not demonstrated financial loss.

Reproduction: `node --conditions=react-server --import tsx --test --test-name-pattern='reservation account budget' tests/security/commerce-security.test.ts`. The four carts have one unit each of one synthetic ten-unit SKU and one verified customer. Observation: assertion failed with **4 active orders**. Send the customer row/advisory lock before checking the budget, and enforce the budget when reactivating expired reservations for payment retry. Commerce owner and coordinator were notified. Retest is pending.

## Executed checks

| Command / scenario | Actual result |
|---|---|
| Initial domain harness before adapting verified-phone fixtures to a concurrent owner change | 0/7 passed; fixture users omitted non-null phone now required by the domain. This was a test-fixture error, not a confirmed product defect. Fixtures were corrected. |
| `node --conditions=react-server --import tsx --test tests/security/commerce-security.test.ts` (initial seven cases) | Exit 0; 7 passed, 0 failed/skipped; about 14.9 seconds. |
| Invalid session, password-only admin, customer-kind actor, revoked role/grant, disabled admin | Denied by fresh domain checks. |
| Two-user order/return/address/cart attacks | Denied; another customer's address was preserved after unauthorized deletion attempt. |
| Unverified customer checkout | Rejected in domain layer. |
| Modified quote and injected browser price/owner/payment status | Invalid quote rejected; server saved original actor, 10,100 IRR and pending payment. |
| Checkout retry and altered payload / same key across two actors | Same actor/payload returned same order; altered payload rejected; actor namespace remained separate; one provider transaction. |
| Unpaid authority and concurrent/repeated verified callbacks | Unpaid remained unknown with no shipment; paid replay left one receipt, one shipment and one stock commitment. |
| Unauthorized customer refund and concurrent refund budget | Customer denied; amount above receipt denied; only one of two 8,000 IRR requests against 10,100 IRR succeeded. |
| `node --conditions=react-server --import tsx --test --test-name-pattern='reservation account budget\|distinct receipts' tests/security/commerce-security.test.ts` | Exit 1; one confirmed cap failure, one passed distinct-receipt scenario. |
| Distinct paid receipts and extra-receipt refund | Two receipts retained; only one stock effect/shipment; refunding the extra receipt kept the purchase `paid`. |

## Dependency evidence

`pnpm audit --prod --json` was executed and returned exit 1: one moderate advisory, zero high/critical reported. The lockfile includes optional transitive `esbuild@0.18.20` through `better-auth > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils`. The primary [esbuild advisory GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) concerns cross-origin reads when the esbuild `serve` feature is used, affecting <=0.24.2 and patched in >=0.25.0. No esbuild serve use or exploitable app route was observed. A scoped patched override/removal is recommended with compatibility checks; this is dependency presence evidence, not a reproduced production exploit.

## Pending and limits

Auth/OTP/MFA, direct HTTP routes, CSRF, shared cache isolation, headers/CSP, raster upload resource/format/path checks, public bundle secret check and deployed IPv4/IPv6 exposure remain pending until implementation/server availability. Runtime config subprocess tests are prepared and will record their execution next. No Strix scan was run: CLI absent and no isolated clean writable review checkout. No ASVS certificate, exhaustive Level 2 assessment, production-readiness guarantee or zero-vulnerability claim is made.
