---
name: morphiume-iran-payments
description: Connect or change Morphiume Iranian PSP adapters, callback verification, reconciliation, reverse or refund handling. Use the selected provider's current official contract; do not use for unrelated auth or interface changes.
---

Read `src/server/payments/provider.ts`, the selected adapter, and `docs/backend/PAYMENTS.md`. Recheck official provider documentation when modifying semantics, units or endpoints. Record URL and observation date in `docs/backend/SOURCES.md`.

Morphiume sends explicit IRR for Zarinpal requests and verifies with the persisted rial amount, authority and merchant. The provider docs do not establish a callback HMAC, so never invent one. Browser Status=OK can trigger server verification but cannot establish payment success. Inquiry informs reconciliation and never substitutes for verify.

Persist an attempt before network access. An external timeout is unknown, not a proven failure. Deduplicate provider receipts in PostgreSQL; codes 100 and 101 share one financial effect. Distinct real receipts for one order are recorded separately, with one stock/fulfillment commitment and an exception workflow for extra funds.

Treat reverse and general refund as separate capabilities. Zarinpal's documented short-window reverse cannot stand in for arbitrary partial refunds. Manual refunds remain pending until an authorized operator records verified evidence; serialize refund budgets per receipt.

The mock adapter is server-controlled and test/staging only. Changing callback query parameters must not alter mock provider state. Live configuration fails closed on mock or sandbox service selection. Never use actual PSP/SMS endpoints for load tests without explicit authorization.

Done means a typed adapter, contract tests with recorded fixtures, replay/timeout/late-payment tests, current real-provider blockers and exact tests executed. Do not claim live connectivity from local mock success. Owner PSP merchant credentials, approved callback domain, reverse IP restrictions and business refund policy remain external prerequisites.
