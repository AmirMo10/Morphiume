import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { QuoteDto } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { totpForUri } from "../integration/auth/helpers";

test("T07/T15/T19/T21/T23/T29: fresh native shipping approval resets checkout consent; notes, return and refund remain exact", async ({ browser, page, baseURL }) => {
  test.setTimeout(180_000);
  const pool = isolatedPool(), marker = randomUUID(), admin = await createAdmin(pool);
  const users: string[] = [admin.userId];
  const original = (await pool.query("SELECT * FROM store_setting WHERE key='shipping'")).rows[0];
  const customer = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const buyer = await customer.newPage();
  let productId: string | undefined, collectionId: string | undefined;
  const couponCode = `QA-${marker}`.toUpperCase();
  async function savePolicy(fee: string, threshold: string | null) {
    const current = (await (await page.request.get("/api/admin/shipping")).json()).data;
    const response = await page.request.put("/api/admin/shipping", { headers: { Origin: baseURL! }, data: { shippingFeeToman: fee, freeShippingThresholdToman: threshold, expectedVersion: current.version, reason: `QA controlled shipping ${marker}` } });
    expect(response.status()).toBe(200);
    return (await response.json()).data as { policyVersion: string; version: number };
  }
  async function restorePolicy() {
    const restore = await pool.connect();
    try {
      await restore.query("BEGIN");
      await restore.query("SET LOCAL lock_timeout='5s'");
      await restore.query("SELECT pg_advisory_xact_lock(818002)");
      const active = (await restore.query("SELECT updated_by FROM store_setting WHERE key='shipping' FOR UPDATE")).rows[0];
      if (active?.updated_by === admin.userId) {
        if (original) await restore.query("UPDATE store_setting SET value=$1::jsonb,version=$2,updated_by=$3,updated_at=$4 WHERE key='shipping'", [JSON.stringify(original.value), original.version, original.updated_by, original.updated_at]);
        else await restore.query("DELETE FROM store_setting WHERE key='shipping'");
      }
      await restore.query("COMMIT");
    } catch (error) { await restore.query("ROLLBACK"); throw error; } finally { restore.release(); }
  }
  try {
    const uri = await loginAdmin(page, admin);
    const product = await createProduct(page, baseURL!, marker); productId = product.id;
    const user = await loginCustomer(customer, baseURL!); users.push(user.userId);
    const variant = product.variants[0]!;
    await savePolicy("۲۵٬۰۰۰", "۲۰۰٬۰۰۰");
    expect((await customer.request.post("/api/cart", { headers: { Origin: baseURL! }, data: { variantId: variant.id, quantity: 1 } })).status()).toBe(200);
    await buyer.goto("/checkout");
    for (const [label, value] of [["نام گیرنده", "گیرندهٔ صرفاً آزمایشی QA"], ["شمارهٔ تماس گیرنده", "۰۹۱۲۱۲۳۴۵۶۷"], ["استان", "تهران"], ["شهر", "تهران"], ["نشانی کامل", "نشانی مصنوعی؛ این سفارش برای ارسال واقعی معتبر نیست."], ["پلاک", "۱۲"], ["کدپستی ده‌رقمی", "۱۲۳۴۵۶۷۸۹۰"]] as const) await buyer.getByLabel(label, { exact: true }).fill(value);
    const cityList = await buyer.getByLabel("شهر", { exact: true }).getAttribute("list");
    expect(cityList).toBeTruthy();
    expect(await buyer.locator(`datalist[id="${cityList}"] option`).evaluateAll(options => options.some(option => (option as HTMLOptionElement).value === "تهران"))).toBe(true);
    await buyer.getByLabel("استان", { exact: true }).fill("كردستان");
    await expect(buyer.getByLabel("شهر", { exact: true })).toHaveValue("");
    expect(await buyer.locator(`datalist[id="${cityList}"] option`).evaluateAll(options => options.some(option => (option as HTMLOptionElement).value === "سنندج"))).toBe(true);
    expect(await buyer.locator(`datalist[id="${cityList}"] option`).evaluateAll(options => options.some(option => (option as HTMLOptionElement).value === "تهران"))).toBe(false);
    await buyer.getByLabel("استان", { exact: true }).fill("تهران");
    const customCity = "شهر آزمایشی خارج از فهرست QA";
    await buyer.getByLabel("شهر", { exact: true }).fill(customCity);
    await buyer.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click();
    const consent = buyer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/ });
    await expect(buyer.getByRole("button", { name: "پرداخت ۱۴۸٬۴۵۶ تومان", exact: true })).toBeDisabled();
    await consent.check();

    // Stale is simulated only for this already genuinely enrolled admin. Success requires native TOTP.
    await pool.query("UPDATE admin_grant SET factor_verified_at=now()-interval '6 minutes' WHERE session_id IN(SELECT id FROM session WHERE user_id=$1)", [admin.userId]);
    const before = (await (await page.request.get("/api/admin/shipping")).json()).data;
    expect((await page.request.put("/api/admin/shipping", { headers: { Origin: baseURL! }, data: { shippingFeeToman: "35000", freeShippingThresholdToman: "200000", expectedVersion: before.version, reason: `QA stale proof ${marker}` } })).status()).toBe(403);
    await page.goto("/admin/shipping");
    await page.getByLabel("هزینهٔ ارسال (تومان)", { exact: true }).fill("۳۵٬۰۰۰");
    await page.getByLabel("دلیل تغییر سیاست ارسال", { exact: true }).fill(`QA native approval ${marker}`);
    await page.getByRole("button", { name: "بررسی تغییر سیاست ارسال", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "تأیید و ثبت سیاست ارسال", exact: true })).toBeDisabled();
    await dialog.getByLabel("کد رمزساز برای تأیید دوباره", { exact: true }).fill(totpForUri(uri));
    await dialog.getByRole("button", { name: "تأیید دوباره", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "تأیید و ثبت سیاست ارسال", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "تأیید و ثبت سیاست ارسال", exact: true }).click();
    await expect(page.getByText("سیاست هزینهٔ ارسال ذخیره شد.", { exact: true })).toBeVisible();
    const staleFee = buyer.waitForResponse(response => response.url().endsWith("/api/checkout") && response.request().method() === "POST");
    await buyer.getByRole("button", { name: "پرداخت ۱۴۸٬۴۵۶ تومان", exact: true }).click();
    expect((await staleFee).status()).toBe(409);
    await expect(buyer.getByLabel("نام گیرنده", { exact: true })).toHaveValue("گیرندهٔ صرفاً آزمایشی QA");
    expect((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1", [user.userId])).rows[0].n).toBe(0);
    await buyer.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click();
    await expect(buyer.getByRole("button", { name: "پرداخت ۱۵۸٬۴۵۶ تومان", exact: true })).toBeDisabled();
    await expect(consent).not.toBeChecked();
    await consent.check();
    const thresholdPolicy = await savePolicy("35000", "123456");
    const staleThreshold = buyer.waitForResponse(response => response.url().endsWith("/api/checkout") && response.request().method() === "POST");
    await buyer.getByRole("button", { name: "پرداخت ۱۵۸٬۴۵۶ تومان", exact: true }).click();
    expect((await staleThreshold).status()).toBe(409);
    await expect(buyer.getByLabel("نام گیرنده", { exact: true })).toBeVisible();
    await buyer.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click();
    await expect(buyer.getByRole("button", { name: "پرداخت ۱۲۳٬۴۵۶ تومان", exact: true })).toBeDisabled();
    await expect(consent).not.toBeChecked();
    await expect(buyer.getByText(thresholdPolicy.policyVersion, { exact: true })).toBeVisible();
    await consent.check();
    await buyer.getByRole("button", { name: "پرداخت ۱۲۳٬۴۵۶ تومان", exact: true }).click();
    await expect(buyer).toHaveURL(/\/test\/payments\//);
    await buyer.getByRole("button", { name: "ثبت نتیجهٔ موفق آزمایشی", exact: true }).click();
    await expect(buyer).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    const orderId = buyer.url().split("/").at(-1)!;
    expect((await pool.query("SELECT shipping_irr::text AS shipping,total_irr::text AS total,policy_version AS policy FROM orders WHERE id=$1", [orderId])).rows[0]).toEqual({ shipping: "0", total: "1234560", policy: thresholdPolicy.policyVersion });
    expect((await pool.query("SELECT address_snapshot->>'city' AS city FROM orders WHERE id=$1", [orderId])).rows[0].city).toBe(customCity);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [variant.id])).rows[0]).toEqual({ on_hand: 3, reserved: 0 });
    await page.goto(`/admin/orders/${orderId}`);
    const privateNote = `یادداشت داخلی مصنوعی QA ${marker}`;
    await page.getByLabel("یادداشت تازه", { exact: true }).fill(privateNote);
    await page.getByRole("button", { name: "ثبت یادداشت", exact: true }).click();
    await expect(page.getByText(privateNote, { exact: true })).toBeVisible();
    expect(JSON.stringify((await (await customer.request.get(`/api/orders/${orderId}`)).json()).data).includes(privateNote)).toBe(false);
    const shipment = { carrier: "QA synthetic carrier", trackingCode: `QA-${marker}`, status: "shipped" };
    expect((await page.request.patch(`/api/admin/orders/${orderId}/shipment`, { headers: { Origin: baseURL! }, data: shipment })).status()).toBe(200);
    expect((await page.request.patch(`/api/admin/orders/${orderId}/shipment`, { headers: { Origin: baseURL! }, data: { ...shipment, status: "delivered" } })).status()).toBe(200);
    const returned = await customer.request.post(`/api/orders/${orderId}/returns`, { headers: { Origin: baseURL! }, data: { kind: "return", reason: "QA synthetic return after controlled delivery" } });
    expect(returned.status()).toBe(201);
    const returnId = (await returned.json()).data.id as string;
    expect((await page.request.patch(`/api/admin/returns/${returnId}`, { headers: { Origin: baseURL! }, data: { status: "approved", reason: "QA approved synthetic return" } })).status()).toBe(200);
    const receive = { status: "received", reason: "QA synthetic quality inspection; no physical delivery", restock: true };
    for (let count = 0; count < 2; count++) expect((await page.request.patch(`/api/admin/returns/${returnId}`, { headers: { Origin: baseURL! }, data: receive })).status()).toBe(200);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [variant.id])).rows[0]).toEqual({ on_hand: 4, reserved: 0 });
    expect((await pool.query("SELECT count(*)::int AS n FROM inventory_ledger WHERE operation_key=$1", [`return-stock:${returnId}:${variant.id}`])).rows[0].n).toBe(1);

    await page.reload();
    const receiptId = (await pool.query("SELECT id FROM payment_receipt WHERE order_id=$1", [orderId])).rows[0].id as string;
    await page.getByLabel("دریافت پرداخت", { exact: true }).selectOption(receiptId);
    await page.getByLabel("مبلغ بازپرداخت (تومان)", { exact: true }).fill("۱۲٬۳۴۵");
    await page.getByLabel("دلیل بازپرداخت", { exact: true }).fill("QA partial synthetic refund; no real money moved");
    await page.getByRole("button", { name: "بررسی درخواست بازپرداخت", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأیید و ثبت", exact: true }).click();
    await expect(page.getByText("درخواست بازپرداخت ثبت شد. تا ثبت مدرک پرداخت، وضعیت آن در انتظار می‌ماند.", { exact: true })).toBeVisible();
    const refundId = (await pool.query("SELECT id FROM refund WHERE order_id=$1", [orderId])).rows[0].id as string;
    await page.getByLabel("درخواست بازپرداخت", { exact: true }).selectOption(refundId);
    const evidence = "QA controlled evidence only; no real bank transfer has occurred.";
    await page.getByLabel("مدرک یا شمارهٔ مرجع انتقال", { exact: true }).fill(evidence);
    await page.getByRole("button", { name: "بررسی ثبت مدرک", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأیید و ثبت", exact: true }).click();
    await expect(page.getByText("انجام بازپرداخت با مدرک ثبت شد.", { exact: true })).toBeVisible();
    expect((await page.request.post(`/api/admin/refunds/${refundId}/complete`, { headers: { Origin: baseURL! }, data: { evidence } })).status()).toBe(200);
    expect((await pool.query("SELECT status,amount_irr::text AS amount FROM refund WHERE order_id=$1", [orderId])).rows).toEqual([{ status: "succeeded", amount: "123450" }]);
    expect((await pool.query("SELECT payment_status FROM orders WHERE id=$1", [orderId])).rows[0].payment_status).toBe("partially_refunded");
    expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1", [variant.id])).rows[0].on_hand).toBe(4);

    await page.goto("/admin/coupons");
    await page.getByLabel("کد تخفیف", { exact: true }).fill(couponCode);
    await page.getByLabel("درصد تخفیف", { exact: true }).fill("۱۰");
    await page.getByLabel("سقف کل استفاده", { exact: true }).fill("۲");
    await page.getByLabel("سقف استفادهٔ هر خریدار", { exact: true }).fill("۱");
    const future = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).formatToParts(Date.now() + 30 * 86400000);
    await page.getByLabel("تاریخ پایان اعتبار (شمسی)", { exact: true }).fill(["year", "month", "day"].map(type => future.find(part => part.type === type)!.value).join("/"));
    await page.getByLabel("ساعت پایان اعتبار (تهران)", { exact: true }).fill("۱۸:۰۰");
    await page.getByRole("button", { name: "ذخیرهٔ کد تخفیف", exact: true }).click();
    await expect(page.getByText("کد تخفیف ذخیره شد.", { exact: true })).toBeVisible();
    expect((await pool.query("SELECT basis_points,usage_limit,per_user_limit FROM coupon WHERE code=$1", [couponCode])).rows[0]).toEqual({ basis_points: 1000, usage_limit: 2, per_user_limit: 1 });
    expect((await customer.request.put("/api/cart/items", { headers: { Origin: baseURL! }, data: { variantId: variant.id, quantity: 1 } })).status()).toBe(200);
    expect((await customer.request.post("/api/cart/coupon", { headers: { Origin: baseURL! }, data: { code: couponCode } })).status()).toBe(200);
    const cart = (await (await customer.request.get("/api/cart")).json()).data;
    const quoteResponse = await customer.request.post("/api/checkout/quote", { headers: { Origin: baseURL! }, data: { cartId: cart.id, cartVersion: cart.version } });
    expect(quoteResponse.status()).toBe(200);
    const quote = (await quoteResponse.json()).data as QuoteDto;
    expect(quote.discount.amountIrr).toBe("123450");
    expect(quote.shipping.amountIrr).toBe("350000"); // eligibility uses subtotal after discount
    const collection = await page.request.post("/api/admin/collections", { headers: { Origin: baseURL! }, data: { name: `QA collection ${marker}`, slug: `qa-collection-${marker}`, description: "Synthetic QA collection", published: true, productIds: [product.id] } });
    expect(collection.status()).toBe(200); collectionId = (await collection.json()).data.id;
    expect((await (await customer.request.get("/api/collections")).json()).data.some((item: { id: string }) => item.id === collectionId)).toBe(true);
    await page.goto("/admin/customers");
    await expect(page.getByRole("cell", { name: user.phone, exact: true })).toBeVisible();
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_event WHERE actor_id=$1 AND action='shipping.policy_updated'", [admin.userId])).rows[0].n).toBe(3);
  } finally {
    // Restore only our changes; an unexpected external writer is never overwritten.
    await restorePolicy();
    if (productId) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [productId]);
    if (collectionId) await pool.query("UPDATE collection SET published=false WHERE id=$1", [collectionId]);
    await pool.query("UPDATE coupon SET active=false WHERE code=$1", [couponCode]);
    await disableUsers(pool, users);
    await customer.close(); await pool.end();
  }
});
