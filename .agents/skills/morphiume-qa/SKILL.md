---
name: morphiume-qa
description: Independently verify Morphiume commerce, admin, security-sensitive acceptance and release behavior using real DB/browser evidence; exclude implementation-shaped or invented test claims.
---

Input: current commit/build, protected test configuration, [acceptance scenarios](../../../docs/spec/Morphiume_Codex_Master_Prompt.txt) T01-T30 and changed behavior. Keep samples and mocks confined to isolated test/staging; no real PSP/SMS load.

Start with T25: create/publish product in admin, guest cart, verify phone, checkout, server mockverify, single stock effect, shipment and owned tracking. Independently test last-unit competition, checkout fingerprint/idempotency, replay and distinct receipts, late payment, coupon/refund limits, role revocation/IDOR and OTP concurrent consume. Use actual PostgreSQL transactions.

Run available Chromium/Firefox/WebKit, RTL320px/zoom/keyboard/reduced-motion and axe, report engine gaps. Capacity has separate200accounts/200VU/RPS scenarios and external generator. Record commands, artifacts, failures and retests by scenario; mark unrun tests unrun. End with evidence-backed release blockers, never universal “all tests passed”.
