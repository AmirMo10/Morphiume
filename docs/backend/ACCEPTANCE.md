# Backend acceptance matrix

Planned coverage, not a test result. See actual executed evidence in the coordinator test report.

| Requirement | Backend evidence needed |
|---|---|
| T01/T25 | Admin MFA draft/publish → anonymous cart → customer OTP → quote → persisted checkout → controlled provider settle → verify → one stock commitment → shipment tracking → owned order read |
| T02/T03 | Phone/digit equivalence; atomic OTP consume; expiry/replay/resend limits |
| T04/T05/T06 | Direct service/API denied without permission, cross-owner order/cart denied, revoked session/role denied |
| T07/T23 | Tampered amounts not accepted, integer cap and complete تومان rounding, snapshot-provider amount equality |
| T08/T09/T30 | Concurrent last unit; actor/payload-bound checkout key; repeat key returns same order |
| T10/T11/T14/T26 | Forged callback ineffective; verify 100/101 replay; merchant/authority/amount binding; separate successful receipts preserve one commitment |
| T12/T13/T16 | Unknown timeout and reconciliation; reservation expiry/late payment with available and unavailable inventory; leased outbox restart |
| T15/T27/T28 | Concurrent refund budget; concurrent last coupon; stale product version conflict |
| T17/T18/T19/T20 | Media, cache, SMS resilience and UI checks owned by respective specialists; backend private DTOs remain uncached |
| T21/T22/T24/T29 | Product workflow; separate restore/payment reconciliation; live mock/seed rejection; owned state-guarded return requests |
| SEO section21 / T28 | Transactional current/historical product and collection slug claims; concurrent collision/stale rollback; canonical one-hop public resolution; withdrawn target hidden; paged consistent collection data and bounded sitemap |
| T04/T06/T15/T29/T30 | Explicit confirmed-non-transfer manual decision; actor/key/refund-bound terminal replay; stale/disabled/revoked or post-lock-expired finance proof denied; unknown transfer never inferred failed; released budget remains serialized |
| T06/T16/T25/T29/T30 | Transactional checkout pause preserves durable replay/pre-pause work; kind-aware full-order requests and immutable actor/effect decisions; one physical return/restoration; post-lock reviewer denial; repeated distinct late receipts never revive an approved cancellation |
| Operational correlation | Optional sanitized job started/completed/retry/dead observer; failing/unavailable sink cannot change durable worker outcome; no raw payload/key/error/provider/contact/amount emitted |

No test load against Zarinpal or SMS services is authorized by this matrix. Use local controlled provider state and isolated PostgreSQL.
