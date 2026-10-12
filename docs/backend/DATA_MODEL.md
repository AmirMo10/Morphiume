# Data model and transitions

`db/migrations` is canonical for domain constraints. `db/schema.ts` maps Better Auth logical models to SQL through the maintained Drizzle adapter. Financial mutations use parameterized pg queries on one transaction client so locking and SQL checks remain explicit. Applied migration checksums are recorded and cannot be edited silently.

| Module | Tables and relations |
|---|---|
| Identity | user → session/account/two_factor; current role_membership; session → admin_grant; verification_challenge atomic customer OTP; encrypted test-only mock_sms_delivery; database auth_rate_limit |
| Catalog | product → variant → inventory_balance; product_image ordered gallery references ready media and optional same-product variant; media processing metadata; collection ↔ product; immutable historical order items refer to variants; bulk_operation stores actor/key/fingerprint/result for atomic price/stock edits |
| Cart/account | opaque-digest cart → cart_item; verified customer owns claimed cart, address and wishlist_item |
| Checkout | orders → order_item snapshots, inventory_reservation, payment_attempt; actor/operation/key checkout_idempotency |
| Payments | payment_attempt → unique payment_receipt and payment_event; independent controlled mock_provider_transaction |
| Inventory | balance and append-only inventory_ledger; reservation row plus unique ledger operation key |
| Fulfillment | order → one shipment, return_request and refund; refund is bounded per recorded receipt |
| Content/jobs | optimistic content_page/coupon/collection; store_setting reserved for configurable public settings; outbox_job leases/retry; audit_event; notification_message is an owned, event-deduplicated controlled in-app inbox |

Order status: awaiting_payment → confirmed after verified payment and stock commitment; → payment_exception on accepted money without allocation; → cancelled through authorized pre-shipment cancellation; confirmed → completed after shipment delivery. Financial status remains independent: pending/unknown/failed → paid → partially_refunded/refunded only after documented completion. Extra refunds do not change primary purchase status.

Attempt: created → unknown while external create is claimed; → pending on known authority; → succeeded only after verify; → failed on explicit rejection. Unknown is retained for reconciliation. A new attempt is permitted only when earlier attempts are known failed. One order can have distinct receipts without creating multiple shipments.

Reservation: active → consumed on commitment, or released by idempotent expiry/cancellation. Retry can reacquire available stock under locks. Late success either allocates released stock safely or records a paid exception. Coupon quota is reserved/consumed/released separately; late success cannot exceed a quota reused elsewhere.

Shipment: preparing → shipped → delivered; preparing → cancelled through an authorized cancellation. Return request: pending → approved/rejected; approved → received/closed; received → closed. Returning items restock only during authorized received transition with explicit quality decision; refund remains a separate financial operation.

Refund: pending/processing → succeeded after operator-recorded evidence; failed releases refund budget. The current UI can request and record manual refunds; no arbitrary full/partial PSP refund capability is claimed. Outbox pending → running lease → completed, or pending retry; repeated failures → dead for operator handling.

All timestamps use timestamptz/UTC. Dates with no time must remain separate when shipping policies add calendar promises. No brand/legal/tax facts are inferred from schema defaults.

Migration integrity uses canonical LF source text. Only an exact historical CRLF hash of the same canonical SQL can be upgraded, conditionally under the migration advisory lock. `schema_migration_checksum_audit` records old/new checksums, database role, reason and time; normalization is explicitly logged. Changed statements, whitespace or removed content remain an error. No applied SQL is silently replaced.
