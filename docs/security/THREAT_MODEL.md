# Morphiume security review scope

Reviewer: independent `security_reviewer` specialist. Started 2026-10-12. This document describes risks and planned evidence; it does not certify ASVS compliance or claim unexecuted tests passed.

The official [OWASP ASVS project page](https://owasp.org/projects/asvs) was checked on 2026-10-12 and names **5.0.0** as the latest stable version. The project targets applicable Level 2 requirements. Requirement identifiers will include `v5.0.0` once individual requirements have been checked; chapter names below are scope labels, not a completed conformance matrix.

## Assets and trust boundaries

| Asset | Trusted authority | Attacker-controlled boundary |
|---|---|---|
| Customer identity and phone ownership | Maintained auth library session plus successful, atomic OTP verification | Phone, OTP, concurrent/replayed verification, cookies, forwarded IP |
| Admin authority | Separate admin cookie/secret, active DB session/user, fresh verified-MFA grant and current roles | Customer cookies, password-only login, MFA/recovery routes, disabled/revoked account |
| Customer addresses/orders/cart | Server actor and ownership query in endpoint and domain service | Object IDs, guest cart token, attempted owner/role injection |
| IRR amount, stock and coupon quota | PostgreSQL integer amounts, row locks, immutable order snapshots | Browser quote, amount, stale cart/version, concurrent checkout |
| Payment receipt and fulfillment | Server provider verify of persisted attempt/merchant/currency/amount; DB dedup | Callback status/query/body, authority replay, timeout, distinct receipts |
| Refund budget | Locked receipt/order and persisted refunds/audit | Oversized/negative amounts, retries, concurrent requests, finance role |
| Private response and credentials | Server-only configuration, no-store response, host-only HttpOnly cookie | Shared cache, public bundle, logs, localStorage, malformed origin |
| Uploaded media | Authenticated permission plus limited raster decode/re-encode | MIME, extension, pixels, active SVG/HTML, filename traversal, external URL |
| Test adapters | Explicit test/staging, synthetic fixtures, private control authorization | Public mock controls, live config, guessed authority/phone |
| Job effects | Transactional outbox and database dedup/leases | Worker restarts, duplicate callbacks/jobs, partial effect failure |

## Actors

Anonymous visitors may browse published products and keep a guest cart. A malicious customer can manipulate all client input and another customer's object IDs, cookies and payment callback parameters. A compromised admin may have one role or only the password factor. An external website may induce credentialed cross-origin mutations. A dependency or malicious image may target the server, public bundle or storage. A provider/network interruption may yield an unknown payment outcome that must preserve accounting evidence.

## Access matrix and negative checks

| Operation | Anonymous | Customer A | Customer B against A's object | Password-only admin | MFA admin | Revoked/disabled admin |
|---|---|---|---|---|---|---|
| Published catalog/content | Allow | Allow | Allow | Allow | Allow | Allow |
| Guest cart | Secret required | Secret/owner required | Deny without own secret/ownership | Same rule | Same rule | Same rule |
| Checkout/order/address/wishlist | Deny checkout and private objects | Own only; verified phone for checkout | Deny | No customer session implied | Customer actor/ownership rule | Deny authenticated private actions |
| Catalog/media/coupon | Deny | Deny | Deny | Deny | `catalog.write` | Deny next sensitive request |
| Read all orders | Deny | Own only | Deny | Deny | `orders.read` | Deny |
| Fulfillment/inventory | Deny | Deny | Deny | Deny | Appropriate operation permission | Deny |
| Refund | Deny | Deny | Deny | Deny | `refunds.write`, recent reauthentication where required | Deny |
| Roles/recovery changes | Deny | Deny | Deny | Deny | Owner, recent reauthentication | Deny |
| Read mock OTP / set mock payment | Deny | Deny except explicitly authorized synthetic flow | Deny | Deny | Authorized MFA admin in test/staging or private test secret | Deny; always deny live |

The same-domain `/admin` design requires distinct cookie prefixes and secrets. Domain-level authorization must freshly read session, user status, MFA grant and role membership; layout checks and cached auth-cookie metadata cannot supply that evidence. Payment callback is a specific unauthenticated receipt-verification entry point, never an exemption for unrelated mutations.

## Independent reproduction plan

1. **Identity/session:** concurrent OTP verification must consume once; replay/expiry/wrong code/resend must not reset the failure budget. Verify raw codes are absent from native verification rows, responses/logs and stored challenge hashes. Test cookie namespace separation, mandatory MFA, failed factor/recovery, disabled account and immediate session/grant/role revocation.
2. **Authorization:** call domain services directly with synthetic two-user fixtures; attempt other-user cart/order/address/return reads/writes. Then repeat through direct API routes as anonymous/customer/password-only/revoked admin. Attempt owner/role/session injection.
3. **CSRF/cache:** execute credentialed mutations with foreign Origin, absent Origin, JSON/simple content type and forged forwarded headers; provider callback must still verify on the server. Compare private responses from two cookie jars and inspect `Cache-Control`, CDN behavior and public bundles.
4. **Finance/replay:** submit client amount tampering, changed/stale quote, duplicate keys with changed payload, same key across actors, concurrent last-stock/coupon/refund budget and concurrent repeated/distinct payment receipts. Failed/browser-success callback is not proof. One order may collect distinct real receipts but commit inventory and create fulfillment only once.
5. **Files/config:** try HTML/SVG with forged raster MIME, oversized dimensions/body, path traversal, external image URL and customer/no-MFA upload. Run config in isolated subprocesses to prove live rejects mocks, missing services/test controls and unsafe origins without printing secrets.
6. **Dependencies/deployment:** inspect lockfile advisory evidence and actual exposure/headers separately. A scanner result is scoped evidence, never a guarantee. No real provider secrets/data, live seeding, Git push or unrelated owner-file edits are authorized for this reviewer.

## Evidence rules and current limitations

Security tests use explicit test/staging and synthetic `.invalid` identities. Test harness must fail closed for live, assert an isolated DB target before writes, and clean up/disable its own fixtures only. Record command, exact outcome, relevant path/line and how to rerun. Confirmed critical/high findings are release blockers until the owner fixes and reviewer retests. Source observations without a reproduction are labeled unconfirmed.

At scope creation no running app/API auth routes were available. Strix CLI was not found; its code-review skill requires a writable clean checkout, which would conflict with other specialists' live ownership. No Strix scan has been run. HTTP/browser/cache/file abuse tests remain pending until those paths exist. The official ASVS source check is complete; it is not a completed Level 2 assessment.
