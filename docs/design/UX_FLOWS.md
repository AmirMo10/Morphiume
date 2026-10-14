# Navigation and critical UX flows

Design decision: 2026-10-12. Routes below are names for the coordinator to map into the application. Availability follows real backend capabilities.

2026-10-14 redesign: header search opens a native modal with a distinct accessible name; catalog submission preserves existing filters. Desktop filters live beside results; on phones the native drawer's primary result action submits the actual search/price form and keeps invalid values/errors visible. Selected filters can be removed individually. Product galleries add previous/next controls; guest/authenticated favorites share the existing actor rules, with one scoped authenticated reader across cards. The admin workspace groups permitted destinations, shows real server counts/status queues, separates payment from shipping, and links drafts to a preliminary publication checklist. The server still determines publication, money, inventory and payment outcomes.

## Information architecture

| Area | Persian label | Destinations and behavior |
| --- | --- | --- |
| Main catalog | عطرها | Published products, actual collections, URL-persisted filters |
| Guidance | راهنمای انتخاب رایحه | Short explainable guide; educational articles |
| Brand | دربارهٔ برند | Owner-approved story, contact and FAQ |
| Header utilities | جست‌وجو / حساب کاربری / سبد خرید | Search query, phone sign-in, cart count |
| Customer account | حساب کاربری | Profile, addresses, orders, favorites, session/logout controls |
| Support footer | ارسال / مرجوعی / پیگیری سفارش / تماس | Published policies and secure guest order tracking |
| Legal footer | حریم خصوصی / شرایط استفاده | Approved policy versions |
| Admin | نمای کلی، محصولات، موجودی، سفارش‌ها، مشتریان، تخفیف‌ها، محتوا، گزارش‌ها، تنظیمات | Show role-permitted destinations; server enforces the same permissions |

Gift, sample-set, reviews and bestseller navigation appear only when their complete service/data exists. Avoid gender categories inferred from fragrances; catalog metadata owns filter values.

## Discover → product → cart

1. Customer browses without login. Search accepts Persian/Latin; active query, filters and sort remain in URL. Show result count, removable active filters and `پاک‌کردن فیلترها`. A zero-result state preserves the query and offers clearing filters.
2. Product's first section shows selected variant image, title, concentration, volume, exact price, availability, short description and `افزودن به سبد خرید`. Unknown facts are omitted, not converted into reassuring claims.
3. Volume radio changes every linked variant fact together. An unavailable volume says `این حجم فعلاً موجود نیست.` No enabled purchase action exists for it. Cart add failure retains the chosen volume and gives a retry or updated availability.
4. Add announces `محصول به سبد خرید افزوده شد.` with a link to cart. Cart persists through refresh and gateway return. Adding does not claim an inventory reservation.
5. Cart supports quantity, remove, apply/remove coupon and server totals. Empty cart: `سبد خرید شما خالی است.` plus `مشاهدهٔ عطرها`. Price/stock changes show the affected row and require reviewing the updated total before payment.

## Guest checkout → verification → payment

Steps: `بررسی سبد` → `گیرنده و نشانی` → `روش ارسال` → `جمع‌بندی و پرداخت`.

- Required address fields: receiver name, contact number, province, city, address, building number and postal code. Unit is optional. Billing email/birthday/profile creation are optional. Separate receiver contact from purchaser identity for gifts.
- Back preserves data. Province/city change makes an invalid city selection explicit. Phone/postcode allow paste and preserve leading zeroes.
- After necessary details and before starting payment, verify purchaser phone with OTP. Say `کد تأیید را وارد کنید.` Display masked destination, edit-number control, clear expiry and resend wait. Use one field with `autocomplete="one-time-code"`; allow paste instead of a six-box memory task.
- A phone matching an existing account does not reveal existence or expose saved addresses before verification. After verification, saved addresses are an explicit choice; never silently replace freshly entered receiver details. Cart merge is defined by the commerce owner and visibly reports removed/unavailable quantities.
- Summary lists goods, discount, shipping, applicable tax and payable total; use exact server amount. Show preparation and carrier time separately when approved. CTA includes payable amount, e.g. `پرداخت {مبلغ} تومان`.
- If server returns changed totals or stock, display the change beside the affected item; return to review and get a new explicit confirmation. Pending submission prevents duplicate activation, with server idempotency as the authority.
- During uncertain prior payment, show its status and a `بررسی دوبارهٔ وضعیت` control. Do not start a new attempt until the server allows it. Payment card data is entered at the PSP.

## Payment result states

| Server state | Customer wording | Action |
| --- | --- | --- |
| Confirmed paid | پرداخت تأیید شد. | View authorized order and tracking; optional account completion |
| Definitively failed | پرداخت انجام نشد. | Return to preserved checkout, retry when server permits |
| Cancelled | پرداخت لغو شد. | Return to preserved cart/checkout |
| Pending/unknown | پرداخت هنوز تأیید نشده است. نتیجه از همین صفحه قابل پیگیری است. | Recheck status; explain support path if configured |
| Paid but stock exception | پرداخت ثبت شده و سفارش در حال بررسی است. | Show actual review/refund status; no false dispatch promise |

Order details separately display payment and fulfillment timelines. Never infer success from a callback query or thank-you page load. Guest tracking requires secure verification before any personal/order data.

## Guide

Three short non-sensitive questions: preferred catalog scent family, preferred catalog note character, and available budget range/volume. Include `هنوز مطمئن نیستم`, back and reset. Each choice is mapped to actual product attributes, not personality. Results show why each product matched and current price/availability. No match: explain that no published product fits all choices, allow relaxing one condition. Do not invent longevity or intensity metadata. Hide the guide's unsupported filters when metadata is absent.

## Favorites, cancellations and returns

Guest favorites may remain local; authenticated merge preserves explicit additions and reports unavailable products. Logging out on a shared device clears private account data. An eligible order exposes `درخواست لغو` or `درخواست مرجوعی` according to its real state and policy. Request view shows reason, timeline, review result and actual refund state; pending money is not labeled returned.

## Admin product workflow

`اطلاعات پایه` → `حجم، قیمت و موجودی` → `تصاویر` → `توضیح رایحه` → `پیش‌نمایش` → `انتشار`.

Use a single main form with short sections and progress, rather than six forced pages for a small edit. Save draft remains available; publication checks are separate. Identify missing requirements inline and in a summary. Draft preview is private and outside public indexing. Leaving unsaved changes shows a clear save/discard/stay dialog. Image errors explain processing failure and retain valid fields.

Empty admin overview uses real zeroes and `افزودن محصول`. Row actions use human labels; explain `شناسهٔ تنوع (SKU)` only where it helps. Price input explicitly says تومان; the central server utility converts once. Bulk edits and CSV import show dry-run row errors, count and before/after values before confirmation.

Concurrent edit conflict: `این محصول پس از بازکردن فرم تغییر کرده است. نسخهٔ تازه را بررسی کنید.` Provide reload/compare; never silently overwrite. Inventory adjustments require reason and show physical/reserved/sellable counts. Order view shows payment separately from preparation/shipment, audit timeline, permitted actions, tracking, private note and printable invoice. High-impact operations show a concrete amount/recipient/order before confirmation and use required reauthentication.

## Implementation acceptance handoff

Verify actual application scenarios T01, T19, T20, T21, T23, T25, T28 and T29 from the master prompt, plus keyboard/paste/OTP errors, all payment states and mixed bidi. Design documentation alone does not satisfy these tests.
