# Payment provider contract

Sources observed 2026-10-12 are in [SOURCES.md](SOURCES.md). Adapter code: `src/server/payments/provider.ts`, `mock.ts`, `zarinpal.ts`. Real transactions have not been attempted.

`create` returns created/rejected/unknown; `verify` returns verified with provider reference and alreadyVerified flag, rejected, or unknown; `inquiry` returns a known provider state or unknown. Only a verified result can produce a receipt. General and partial refund capability remain false. Reverse is a separately declared capability.

Zarinpal v4 request uses POST `request.json` with merchant_id, amount, currency=IRR, description, callback_url and optional order metadata. Redirect uses `/pg/StartPay/{authority}`. Verify uses persisted merchant, authority and rial amount; code 100 is first successful verification and 101 indicates prior verification. The documented response does not echo amount/currency; these are bound through the persisted authority and verify request. Node 24 JSON reviver source preserves numeric reference digits; unsafe values without exact source become unknown. [Official connection guide](https://www.zarinpal.com/docs/paymentGateway/connectToGateway)

Currency docs support IRR and IRT on request. Morphiume selects IRR only, so no provider-side تومان conversion occurs. [Official currency guide](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency)

Inquiry returns VERIFIED, PAID, IN_BANK, FAILED or REVERSED, and is explicitly not a verification method. PAID/VERIFIED reconciliation still calls verify before recording funds. [Official inquiry](https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry)

Reverse accepts merchant and authority, applies only within the documented 30-minute window, and requires configured server IP restrictions. It is not an arbitrary partial-refund API. Controlled manual refunds stay pending until evidence is recorded. [Official reverse](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/reverse)

Sandbox replaces the production host with sandbox.zarinpal.com, permits a test UUID merchant and issues S-prefixed authorities. The local mock is a distinct deterministic test dependency, not proof that sandbox works. [Official sandbox](https://www.zarinpal.com/docs/paymentGateway/sandBox)

Live blockers: owner-approved PSP contract/merchant, actual approved callback domain and TLS, test access/contract fixtures including 101 reference response, bank amount bounds, production IP registration for reverse, refund policy/operations, and audited first real transaction authorization. Create timeout without an authority cannot be automatically matched from the documented inquiry input and is retained for operator reconciliation. No new attempt should be created while that ambiguity remains.
