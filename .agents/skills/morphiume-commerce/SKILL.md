---
name: morphiume-commerce
description: Change Morphiume pricing, coupons, inventory, checkout, orders or returns while preserving its IRR ledger and concurrency rules. Use for financial domain changes, not purely visual storefront work.
---

Read the relevant contract in `src/contracts/commerce.ts`, domain service in `src/server/commerce/service.ts`, SQL migrations in `db/migrations`, and `docs/backend/INVARIANTS.md` before changing a financial operation.

Inputs are the requested behavior, current schema, and applicable T01–T30 acceptance scenarios in `docs/spec/Morphiume_Codex_Master_Prompt.txt`. Preserve unknown business facts as owner inputs. Test fixtures must be labeled and excluded from live deployment.

Use integer BIGINT IRR in the database/server and decimal strings in JSON. Convert admin تومان once in `money.ts`; calculate prices and discounts on the server. Round discounts down to whole تومان, with no hidden difference between accepted display and provider amount. Tax stays disabled until the actual business policy is configured.

Lock affected inventory variants in fixed UUID order in a short PostgreSQL transaction. Network calls happen after commit. Adding to cart does not reserve stock. Ledger operation keys, payment receipts, order commitment and outbox dedupe keys must remain unique. Successful late payments and extra receipts remain traceable even when allocation fails.

An API/layout check does not replace domain authorization. Read active sessions, admin grants and current roles again for sensitive operations. Cart IDs and order numbers are identifiers, never authorization proofs.

Complete a change with a migration where needed, current contracts, relevant arithmetic/concurrency/ownership tests on an isolated PostgreSQL database, and a factual report of checks actually run. Do not alter applied migration checksums; add a new migration. Read `docs/backend/ACCEPTANCE.md` for the financial test matrix. Keep root dependencies and route integration under the coordinator's ownership.
