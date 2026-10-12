---
name: morphiume-fa-rtl
description: Write and review Persian copy, RTL, numeric input and bidi in Morphiume customer or admin screens; exclude backend-only work without user-facing effects.
---

Use the [copy guide](../../../docs/FA_COPY_GUIDE.md), actual screen, and approved owner information. Preserve Morphiume spelling, including decorative display text; unknown brand/product/legal facts stay unknown. Review evidence lives in [docs/persian/REVIEW.md](../../../docs/persian/REVIEW.md); it describes executed checks, not blanket acceptance.

Inspect lang=fa/dir=rtl and logical DOM/CSS. Isolate Latin names, identifiers, email and phone; keep phone/OTP/postal input strings and preserve leading zero. Accept Persian/Arabic/Latin digits and keep password unchanged. Display تومان from the central IRR utility and Jalali dates from UTC with Asia/Tehran.

Review labels, field errors, empty/loading/pending payment states and long Persian text at320px and zoom. Avoid translating uncertain payment into failure/success. Prefer «پرداخت هنوز تأیید نشده است» for unknown results. Finish with actual files/screens reviewed and remaining unknowns, without claiming mobile hardware tests from viewport emulation.

Reuse src/lib/fa-copy/status.ts for distinct payment/order/shipment/return/refund states and receipt dispositions; approved cancellation does not mean money was refunded. Reuse admin.ts for audit labels and known system reasons while preserving user-entered text. HTTP field errors use validation.ts; default library English must not appear in a Persian form summary. Phone sign-in uses neutral account copy and buyer/recipient distinction only during checkout.

Coupon expiry input uses Jalali date and Tehran time, independent of device timezone. Keep exact integer percentage parsing; test leap-day rejection, midnight and invalid time without inferring a completed coupon checkout. State whether corrections were inspected in source, built, observed in browser or exercised end to end.
