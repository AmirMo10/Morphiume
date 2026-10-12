import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { CheckoutDto, OrderDto, QuoteDto } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer, verifyAdminTotp } from "./acceptance-fixtures";

function exposesPrice(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) => ["price", "currentPrice", "nextPrice", "priceIrr", "priceToman", "unitPrice", "lineTotal", "amountIrr", "currency", "subtotal", "discount", "shipping", "tax", "total", "irr", "toman", "amount"].includes(key) || exposesPrice(item));
}

test("T06/T07/T20: inventory-only native MFA cannot receive or mutate price through variants/bulk", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), marker = randomUUID();
  const owner = await createAdmin(pool);
  const users: string[] = [owner.userId];
  const fulfillment = { userId: "", email: `qa-invited-${marker}@fixture.invalid`, password: `Qa-${randomUUID()}-Password!` };
  const worker = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const buyer = await browser.newContext({ baseURL });
  const stockPage = await worker.newPage();
  let productId: string | undefined;
  try {
    const ownerUri = await loginAdmin(page, owner);
    const product = await createProduct(page, baseURL!, marker); productId = product.id;
    await page.goto("/admin/customers");
    await page.getByLabel("نام مدیر", { exact: true }).fill("QA synthetic fulfillment account");
    await page.getByLabel("ایمیل مدیر", { exact: true }).fill(fulfillment.email);
    await page.getByLabel("رمز عبور اولیه", { exact: true }).fill(fulfillment.password);
    await page.getByRole("checkbox", { name: "مسئول ارسال و انبار", exact: true }).check();
    await page.getByLabel("دلیل ساخت یا تغییر دسترسی", { exact: true }).fill(`QA synthetic staff invitation ${marker}`);
    await verifyAdminTotp(page, ownerUri);
    await expect(page.locator(".reauth-panel [role=status]")).toContainText("کد تأیید شد.");
    await page.getByRole("button", { name: "بررسی و ثبت دسترسی", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأیید و ثبت دسترسی", exact: true }).click();
    await expect(page.getByText("حساب مدیر ساخته شد. مدیر باید در اولین ورود، رمزساز را فعال کند.", { exact: true })).toBeVisible();
    fulfillment.userId = (await pool.query('SELECT id FROM "user" WHERE email=$1', [fulfillment.email])).rows[0].id as string;
    users.push(fulfillment.userId);
    expect((await pool.query("SELECT role FROM role_membership WHERE user_id=$1", [fulfillment.userId])).rows).toEqual([{ role: "fulfillment" }]);
    const uri = await loginAdmin(stockPage, fulfillment);
    const variant = product.variants[0]!;
    const listed = await worker.request.get(`/api/admin/variants/page?search=${variant.sku}`);
    expect(listed.status()).toBe(200);
    expect(listed.headers()["cache-control"]).toContain("no-store");
    const listing = (await listed.json()).data;
    expect(listing.totalItems).toBe(1);
    expect(listing.items[0]).toMatchObject({ id: variant.id, onHand: 4, reserved: 0, productVersion: product.version });
    expect(exposesPrice(listing)).toBe(false);
    const input = { operations: [{ variantId: variant.id, expectedProductVersion: product.version, inventoryDelta: 2 }], reason: `QA inventory-only ${marker}`, operationKey: `qa-inventory-${marker}`, dryRun: true };
    const dryRun = await worker.request.post("/api/admin/bulk", { headers: { Origin: baseURL! }, data: input });
    expect(dryRun.status()).toBe(200);
    expect(dryRun.headers()["cache-control"]).toContain("no-store");
    const dry = (await dryRun.json()).data;
    expect(dry.financialVisible).toBe(false);
    expect(dry.changes[0]).toMatchObject({ currentStock: 4, nextStock: 6 });
    expect(exposesPrice(dry)).toBe(false);
    expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1", [variant.id])).rows[0].on_hand).toBe(4);
    const forbidden = await worker.request.post("/api/admin/bulk", { headers: { Origin: baseURL! }, data: { ...input, operations: [{ ...input.operations[0], priceToman: "1" }] } });
    expect(forbidden.status()).toBe(403);
    expect((await worker.request.get("/api/admin/products/page")).status()).toBe(403);
    expect((await worker.request.get("/api/admin/shipping")).status()).toBe(403);
    await pool.query("UPDATE admin_grant SET factor_verified_at=now()-interval '6 minutes' WHERE session_id IN(SELECT id FROM session WHERE user_id=$1)", [fulfillment.userId]);
    expect((await worker.request.post("/api/admin/bulk", { headers: { Origin: baseURL! }, data: { ...input, dryRun: false } })).status()).toBe(403);
    await stockPage.goto("/admin/inventory");
    await stockPage.getByRole("searchbox").fill(variant.sku);
    await stockPage.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    await expect(stockPage.getByRole("table", { name: "موجودی تنوع‌های محصول", exact: true }).getByRole("cell", { name: variant.sku, exact: true })).toBeVisible();
    await expect(stockPage.getByRole("columnheader", { name: /قیمت/ })).toHaveCount(0);
    await stockPage.goto("/admin/bulk");
    await stockPage.getByRole("searchbox").fill(variant.sku);
    await stockPage.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    await expect(stockPage.getByLabel(`تغییر موجودی ${variant.sku}`, { exact: true })).toBeVisible();
    await stockPage.locator("tbody input[type=checkbox]").check();
    await stockPage.getByLabel(`تغییر موجودی ${variant.sku}`, { exact: true }).fill("۲");
    await stockPage.getByLabel("دلیل تغییر گروهی", { exact: true }).fill(input.reason);
    await stockPage.getByRole("button", { name: "پیش‌نمایش تغییرها", exact: true }).click();
    await expect(stockPage.getByRole("heading", { name: "پیش‌نمایش ۱ تغییر", exact: true })).toBeVisible();
    await expect(stockPage.getByRole("columnheader", { name: /قیمت/ })).toHaveCount(0);
    await verifyAdminTotp(stockPage, uri);
    await expect(stockPage.locator(".reauth-panel [role=status]")).toContainText("کد تأیید شد.");
    await stockPage.getByRole("checkbox", { name: "این مقدارهای قبل و بعد را بررسی کرده‌ام.", exact: true }).check();
    const mutation = stockPage.waitForResponse(response => response.url().endsWith("/api/admin/bulk") && response.request().method() === "POST");
    await stockPage.getByRole("button", { name: "ثبت همهٔ تغییرها", exact: true }).click();
    const committed = await mutation;
    expect(committed.status()).toBe(200);
    expect(exposesPrice((await committed.json()).data)).toBe(false);
    const replay = await worker.request.post("/api/admin/bulk", { headers: { Origin: baseURL! }, data: committed.request().postDataJSON() });
    expect(replay.status()).toBe(200);
    expect(exposesPrice((await replay.json()).data)).toBe(false);
    expect((await pool.query("SELECT i.on_hand,i.reserved,v.price_irr::text AS price FROM inventory_balance i JOIN variant v ON v.id=i.variant_id WHERE v.id=$1", [variant.id])).rows[0]).toEqual({ on_hand: 6, reserved: 0, price: "1234560" });
    expect((await pool.query("SELECT count(*)::int AS n FROM inventory_ledger WHERE variant_id=$1 AND on_hand_delta=2 AND actor_id=$2", [variant.id, fulfillment.userId])).rows[0].n).toBe(1);
    // Prepare a genuine controlled paid order; the fulfillment shipment mutation
    // must apply the same financial projection as its read endpoint.
    expect((await buyer.request.get("/api/orders")).status()).toBe(401);
    expect((await buyer.request.post("/api/cart", { headers: { Origin: baseURL! }, data: { variantId: variant.id, quantity: 1 } })).status()).toBe(200);
    const customer = await loginCustomer(buyer, baseURL!); users.push(customer.userId);
    const cart = (await (await buyer.request.get("/api/cart")).json()).data;
    expect(cart.items).toHaveLength(1); expect(cart.items[0].quantity).toBe(1);
    const address = { recipient: "گیرندهٔ مصنوعی آزمون مجوز QA", phone: "09121234567", province: "تهران", city: "تهران", address: "نشانی مصنوعی؛ ارسال واقعی انجام نمی‌شود.", plaque: "1", postalCode: "1234567890" };
    const quoted = await buyer.request.post("/api/checkout/quote", { headers: { Origin: baseURL! }, data: { cartId: cart.id, cartVersion: cart.version } });
    expect(quoted.status()).toBe(200);
    const quote = (await quoted.json()).data as QuoteDto;
    const checkout = await buyer.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": `qa-fulfillment-order-${marker}` }, data: { cartId: cart.id, cartVersion: quote.cartVersion, address, shippingMethodId: quote.shippingMethodId, quoteFingerprint: quote.fingerprint, policyVersion: quote.policyVersion } });
    expect(checkout.status()).toBe(201);
    const order = (await checkout.json()).data as CheckoutDto;
    expect(order.redirectUrl).toContain("/test/payments/MOCK-");
    const authority = order.redirectUrl!.split("/").at(-1)!;
    expect((await buyer.request.post(`/api/test/payments/${authority}`, { headers: { Origin: baseURL! }, data: { outcome: "succeeded" } })).status()).toBe(200);
    const owned = (await (await buyer.request.get(`/api/orders/${order.orderId}`)).json()).data as OrderDto;
    expect(owned.paymentStatus).toBe("paid"); expect(owned.items).toHaveLength(1);
    expect(owned.items[0]!.unitPrice).toEqual({ amountIrr: "1234560", currency: "IRR" });
    const readOrder = await worker.request.get(`/api/admin/orders/${order.orderId}`);
    expect(readOrder.status()).toBe(200); expect(readOrder.headers()["cache-control"]).toContain("no-store");
    const readView = (await readOrder.json()).data;
    expect(readView.financialVisible).toBe(false); expect(exposesPrice(readView)).toBe(false);
    expect(readView.refunds).toEqual([]);
    expect(readView.events.some((event: { type: string }) => event.type.startsWith("payment.") || event.type.startsWith("refund."))).toBe(false);
    const shipment = { carrier: "QA synthetic carrier", trackingCode: `QA-${marker}`, status: "shipped" };
    for (let replay = 0; replay < 2; replay++) {
      const updated = await worker.request.patch(`/api/admin/orders/${order.orderId}/shipment`, { headers: { Origin: baseURL! }, data: shipment });
      expect(updated.status()).toBe(200); expect(updated.headers()["cache-control"]).toContain("no-store");
      const view = (await updated.json()).data;
      expect(view.financialVisible).toBe(false); expect(exposesPrice(view)).toBe(false);
      expect(view.shipment).toMatchObject(shipment);
      expect(view.refunds).toEqual([]);
      expect(view.events.some((event: { type: string }) => event.type.startsWith("payment.") || event.type.startsWith("refund."))).toBe(false);
    }
    // Fulfillment legitimately exports order statuses; financial product export
    // and receipts remain denied. Verify the allowed CSV has only its five
    // documented nonmonetary columns, rather than inventing an export ban.
    const statusExport = await worker.request.get("/api/admin/export?kind=orders");
    expect(statusExport.status()).toBe(200); expect(statusExport.headers()["cache-control"]).toContain("no-store");
    expect(statusExport.headers()["content-type"]).toContain("text/csv");
    const statusRows = (await statusExport.text()).replace(/^\uFEFF/u, "").trimEnd().split("\r\n");
    expect(statusRows[0]).toBe('"شمارهٔ سفارش","تاریخ","وضعیت","وضعیت پرداخت","وضعیت ارسال"');
    expect(statusRows.some(row => row.startsWith(`"${owned.orderNumber}",`))).toBe(true);
    for (const row of statusRows) expect(row).toMatch(/^"(?:[^"]|"")*"(?:,"(?:[^"]|"")*"){4}$/u);
    expect((await worker.request.get("/api/admin/export?kind=products")).status()).toBe(403);
    expect((await worker.request.get(`/api/admin/orders/${order.orderId}/receipts`)).status()).toBe(403);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [variant.id])).rows[0]).toEqual({ on_hand: 5, reserved: 0 });
    expect((await pool.query("SELECT (SELECT count(*)::int FROM payment_receipt WHERE order_id=$1) AS receipts,(SELECT count(*)::int FROM shipment WHERE order_id=$1) AS shipments", [order.orderId])).rows[0]).toEqual({ receipts: 1, shipments: 1 });
    await page.getByRole("row").filter({ hasText: fulfillment.email }).getByRole("button", { name: "ویرایش دسترسی", exact: true }).click();
    await page.getByRole("checkbox", { name: "مسئول ارسال و انبار", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "حساب غیرفعال شود.", exact: true }).check();
    await page.getByLabel("دلیل ساخت یا تغییر دسترسی", { exact: true }).fill(`QA revoke synthetic account ${marker}`);
    await page.getByRole("button", { name: "بررسی و ثبت دسترسی", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأیید و ثبت دسترسی", exact: true }).click();
    await expect(page.getByText("دسترسی حساب به‌روز شد.", { exact: true })).toBeVisible();
    expect([401, 403]).toContain((await worker.request.get(`/api/admin/variants/page?search=${variant.sku}`)).status());
    expect((await pool.query("SELECT count(*)::int AS n FROM session WHERE user_id=$1", [fulfillment.userId])).rows[0].n).toBe(0);
  } finally {
    if (productId) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [productId]);
    await disableUsers(pool, users);
    await buyer.close(); await worker.close(); await pool.end();
  }
});
