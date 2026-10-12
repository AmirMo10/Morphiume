---
name: morphiume-qa
description: Independently verify Morphiume commerce, admin, security-sensitive acceptance and release behavior using real DB/browser evidence; exclude implementation-shaped or invented test claims.
---

Input: current commit/build, protected test configuration, [acceptance scenarios](../../../docs/spec/Morphiume_Codex_Master_Prompt.txt) T01-T30 and changed behavior. Keep samples and mocks confined to isolated test/staging; no real PSP/SMS load.

Start with T25: create/publish product in admin, guest cart, verify phone, checkout, server mockverify, single stock effect, shipment and owned tracking. Independently test last-unit competition, checkout fingerprint/idempotency, replay and distinct receipts, late payment, coupon/refund limits, role revocation/IDOR and OTP concurrent consume. Use actual PostgreSQL transactions.

Run available Chromium/Firefox/WebKit, RTL320px/zoom/keyboard/reduced-motion and axe, report engine gaps. Capacity has separate200accounts/200VU/RPS scenarios and external generator. Record commands, artifacts, failures and retests by scenario; mark unrun tests unrun. End with evidence-backed release blockers, never universal “all tests passed”.

Repository checks: `pnpm test` covers shared integer-money/Persian inputs, native BetterAuth OTP/MFA against isolated PG and commerce invariants. `pnpm test:e2e` uses tests/e2e/playwright.config.ts and the actual production server already started by the coordinator; never launch a competing build/dev process into the shared .next directory. If Chromium downloads are unavailable, `E2E_CHROMIUM_CHANNEL=chrome` selects installed Chrome; record browser.version(). Failed Firefox launch is an engine gap, not a passed scenario.

Keep traces/raw browser reports under ignored test-results; they can contain MFA URI, recovery codes, OTP and cookies. `node tests/e2e/sanitize-report.mjs` exports only safe statuses/timing/counts. Capture admin/product/order guide screenshots only after secrets have left the screen, using clearly marked synthetic data. Do not upload failure screenshots indiscriminately.

Capacity workflow and safeguards are in [docs/qa/PERFORMANCE.md](../../../docs/qa/PERFORMANCE.md). Official pinned k6 runs on a generator host separate from app/DB. Fixture setup uses native library OTP/session issuance, 200 synthetic products/accounts and no real SMS. Inspecting options or running the two-VU smoke does not establish 200-VU capacity. Run the 20-minute plateau, independent request-arrival scenario and actual PG ledger validation; report resource/commit/network/queue measurements and failures. Clean up only fixture products/accounts, preserving financial test history and all unrelated data.

Done for a delegated QA task: owned tests and safe evidence exist, genuine failures are sent to the file owner, corrections are rerun against the final build, [acceptance matrix](../../../docs/qa/ACCEPTANCE_MATRIX.md) distinguishes complete/partial/unrun checks, and the coordinator receives exact commands/results and unresolved release gates. Business prerequisites, missing network/device access and unavailable engines must stay visible.
