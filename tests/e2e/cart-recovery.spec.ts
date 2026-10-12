import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import type pg from "pg";
import type { CheckoutDto, CheckoutInput, QuoteDto } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { claimCurrentCart, readCurrentCart, setCurrentCartCoupon, setCurrentCartQuantity } from "./cart-fixtures";
import { archiveFixtureProducts, assertPrivateOrderCounts, payControlledCheckout } from "./next-acceptance-fixtures";

// Cookie values and fixture identifiers stay in the ignored raw report only.
async function actualCartCookie(context: BrowserContext, baseURL: string) {
  const cookie = (await context.cookies(baseURL)).find(value => value.name === "morphiume-cart");
  expect(cookie !== undefined, "A real server-issued cart cookie exists").toBe(true);
  return cookie!;
}
async function privateCartState(pool: pg.Pool, cartId: string) {
  const result = await pool.query("SELECT c.id,c.user_id,c.version,c.coupon_code,c.guest_token_digest,COALESCE((SELECT jsonb_agg(jsonb_build_object('variantId',i.variant_id,'quantity',i.quantity) ORDER BY i.variant_id) FROM cart_item i WHERE i.cart_id=c.id),'[]'::jsonb) AS items FROM cart c WHERE c.id=$1", [cartId]);
  expect(result.rowCount).toBe(1);
  return result.rows[0]!;
}
async function totalCarts(pool: pg.Pool) {
  return Number((await pool.query("SELECT count(*)::text AS n FROM cart")).rows[0]!.n);
}
async function createCoupon(context: BrowserContext, baseURL: string, code: string) {
  const response = await context.request.post("/api/admin/coupons", { headers: { Origin: baseURL }, data: { code, basisPoints: 1000, maxRedemptions: 10, maxPerUser: 3, minimumIrr: "0", enabled: true } });
  expect(response.status()).toBe(200);
}
async function privateFinancialState(pool: pg.Pool, orderId: string, variantId: string) {
  return (await pool.query("SELECT o.payment_status,o.subtotal_irr::text,o.discount_irr::text,o.shipping_irr::text,o.tax_irr::text,o.total_irr::text,(SELECT count(*)::int FROM payment_attempt WHERE order_id=o.id) AS attempts,(SELECT count(*)::int FROM payment_receipt WHERE order_id=o.id) AS receipts,(SELECT count(*)::int FROM shipment WHERE order_id=o.id) AS shipments,(SELECT count(*)::int FROM inventory_ledger WHERE order_id=o.id AND reason='payment_commit') AS commits,(SELECT jsonb_agg(jsonb_build_object('quantity',i.quantity,'unitPrice',i.unit_price_irr::text,'lineTotal',i.line_total_irr::text) ORDER BY i.id) FROM order_item i WHERE i.order_id=o.id) AS items,b.on_hand,b.reserved FROM orders o JOIN inventory_balance b ON b.variant_id=$2 WHERE o.id=$1", [orderId, variantId])).rows[0]!;
}

test("T07/T12/T25: explicit guest claim preserves selection, revokes guest access, and rejects stale absolute cart writes", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), users: string[] = [admin.userId], products: string[] = [];
  const buyer = await browser.newContext({ baseURL }), previousGuest = await browser.newContext({ baseURL }), foreign = await browser.newContext({ baseURL }), emptyVisitor = await browser.newContext({ baseURL });
  const marker = randomUUID(), couponCode = `QA-${marker}`.toUpperCase();
  try {
    await loginAdmin(page, admin);
    const product = await createProduct(page, baseURL!, marker); products.push(product.id);
    const variant = product.variants[0]!;
    await createCoupon(page.context(), baseURL!, couponCode);
    let cart = await readCurrentCart(buyer);
    cart = await setCurrentCartQuantity(buyer, baseURL!, variant.id, 2, cart);
    cart = await setCurrentCartCoupon(buyer, baseURL!, couponCode, cart);
    const bearer = await actualCartCookie(buyer, baseURL!);
    await previousGuest.addCookies([bearer]); // Copy only the actual guest bearer, never an auth session.
    const guestState = await privateCartState(pool, cart.id), cartCount = await totalCarts(pool);
    for (const context of [buyer, emptyVisitor]) expect((await context.request.get("/api/cart/coupon")).status()).toBe(404);
    expect(await totalCarts(pool)).toBe(cartCount);
    expect(await privateCartState(pool, cart.id)).toEqual(guestState);
    expect((await emptyVisitor.cookies(baseURL!)).some(cookie => cookie.name === "morphiume-cart")).toBe(false);

    const account = await loginCustomer(buyer, baseURL!); users.push(account.userId);
    const claimed = await claimCurrentCart(buyer, baseURL!, cart);
    expect(claimed).toEqual({ ...cart, version: cart.version + 1 });
    const claimedState = await privateCartState(pool, cart.id);
    expect(claimedState.user_id === account.userId && claimedState.guest_token_digest !== guestState.guest_token_digest, "Claim assigns this native account and revokes the previous guest digest").toBe(true);
    expect(await claimCurrentCart(buyer, baseURL!, cart)).toEqual(claimed); // An already-owned claim replay is read-only.
    expect(await privateCartState(pool, cart.id)).toEqual(claimedState);

    const stale = { cartId: cart.id, expectedVersion: cart.version };
    expect((await buyer.request.put("/api/cart/items", { headers: { Origin: baseURL! }, data: { variantId: variant.id, quantity: 1 } })).status()).toBe(400);
    expect((await buyer.request.post("/api/cart/coupon", { headers: { Origin: baseURL! }, data: { code: couponCode } })).status()).toBe(400);
    expect((await buyer.request.put("/api/cart/items", { headers: { Origin: baseURL! }, data: { ...stale, variantId: variant.id, quantity: 1 } })).status()).toBe(409);
    expect((await buyer.request.delete("/api/cart/items", { headers: { Origin: baseURL! }, data: { ...stale, variantId: variant.id } })).status()).toBe(409);
    expect((await buyer.request.delete("/api/cart/coupon", { headers: { Origin: baseURL! }, data: stale })).status()).toBe(409);
    expect(await privateCartState(pool, cart.id)).toEqual(claimedState);
    expect((await previousGuest.request.put("/api/cart/items", { headers: { Origin: baseURL! }, data: { cartId: cart.id, expectedVersion: claimed.version, variantId: variant.id, quantity: 1 } })).status()).toBe(404);
    const other = await loginCustomer(foreign, baseURL!); users.push(other.userId);
    await foreign.addCookies([bearer]);
    expect((await foreign.request.post("/api/cart/claim", { headers: { Origin: baseURL! }, data: { cartId: cart.id, expectedVersion: claimed.version } })).status()).toBe(404);
    expect((await (await foreign.request.get("/api/orders")).json()).data).toEqual([]);
    expect(await privateCartState(pool, cart.id)).toEqual(claimedState);
    const updated = await setCurrentCartQuantity(buyer, baseURL!, variant.id, 1, claimed);
    expect(updated.version).toBe(claimed.version + 1);
    expect(updated.items[0]?.quantity).toBe(1);
    expect(updated.couponCode).toBe(couponCode);
  } finally {
    await pool.query("UPDATE coupon SET active=false WHERE code=$1", [couponCode]);
    await archiveFixtureProducts(pool, products); await disableUsers(pool, users);
    await buyer.close(); await previousGuest.close(); await foreign.close(); await emptyVisitor.close(); await pool.end();
  }
});

test("T07/T12/T19/T25: a lost checkout response recovers the saved order without consuming new selections or foreign carts", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), users: string[] = [admin.userId], products: string[] = [];
  const buyer = await browser.newContext({ baseURL }), replacement = await browser.newContext({ baseURL }), foreign = await browser.newContext({ baseURL });
  const marker = randomUUID(), couponCode = `QA-${marker}`.toUpperCase(), operationKey = randomUUID();
  try {
    await loginAdmin(page, admin);
    const product = await createProduct(page, baseURL!, marker); products.push(product.id);
    const variant = product.variants[0]!;
    await createCoupon(page.context(), baseURL!, couponCode);
    const account = await loginCustomer(buyer, baseURL!); users.push(account.userId);
    let cart = await claimCurrentCart(buyer, baseURL!);
    cart = await setCurrentCartQuantity(buyer, baseURL!, variant.id, 1, cart);
    cart = await setCurrentCartCoupon(buyer, baseURL!, couponCode, cart);
    const quoteResponse = await buyer.request.post("/api/checkout/quote", { headers: { Origin: baseURL! }, data: { cartId: cart.id, cartVersion: cart.version } });
    expect(quoteResponse.status()).toBe(200);
    const quote = (await quoteResponse.json()).data as QuoteDto;
    const input: CheckoutInput = { cartId: cart.id, cartVersion: quote.cartVersion, shippingMethodId: quote.shippingMethodId, quoteFingerprint: quote.fingerprint, policyVersion: quote.policyVersion, address: { recipient: "گیرندهٔ مصنوعی بازیابی QA", phone: "09121234567", province: "تهران", city: "تهران", address: "نشانی صرفاً آزمایشی QA؛ ارسال واقعی انجام نشود.", plaque: "1", postalCode: "1234567890" } };
    // A same-origin static document avoids unrelated application hydration/cart requests.
    // This is a real browser transport failure after server commit, not a claimed UI recovery test.
    const transport = await buyer.newPage();
    expect((await transport.goto("/assets/sample-perfume.svg"))?.status()).toBe(200);
    let committed: CheckoutDto | undefined;
    await transport.route("**/api/checkout", async route => {
      const upstream = await route.fetch();
      expect(upstream.status()).toBe(201);
      committed = (await upstream.json()).data as CheckoutDto;
      await route.abort("failed");
    }, { times: 1 });
    const lost = await transport.evaluate(async ({ input, operationKey }) => {
      try {
        await fetch("/api/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey }, body: JSON.stringify(input) });
        return { transportFailed: false };
      } catch { return { transportFailed: true }; }
    }, { input, operationKey });
    await transport.close();
    expect(lost).toEqual({ transportFailed: true });
    expect(committed !== undefined, "The server committed a durable checkout before response loss").toBe(true);
    const checkout = committed!;
    const consumed = await readCurrentCart(buyer);
    expect(consumed).toMatchObject({ id: cart.id, version: cart.version + 1, couponCode: null, items: [] });
    expect((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1", [account.userId])).rows[0]!.n).toBe(1);
    expect((await pool.query("SELECT quantity,status FROM inventory_reservation WHERE order_id=$1", [checkout.orderId])).rows).toEqual([{ quantity: 1, status: "active" }]);
    expect(checkout.total).toEqual(quote.total);
    expect(checkout.redirectUrl?.startsWith(`${baseURL}/test/payments/MOCK-`)).toBe(true);
    const authority = checkout.redirectUrl!.split("/").at(-1)!;
    const paid = await payControlledCheckout(buyer, baseURL!, authority, checkout.orderId);
    expect(paid.items[0]?.quantity).toBe(1); expect(paid.total).toEqual(quote.total);
    expect(paid.discount).toEqual(quote.discount);
    await assertPrivateOrderCounts(pool, checkout.orderId);
    const financial = await privateFinancialState(pool, checkout.orderId, variant.id);
    expect(financial).toMatchObject({ payment_status: "paid", attempts: 1, receipts: 1, shipments: 1, commits: 1, on_hand: 3, reserved: 0 });
    const selected = await setCurrentCartQuantity(buyer, baseURL!, variant.id, 2, consumed);
    const selectionState = await privateCartState(pool, selected.id);
    const replay = async () => {
      const response = await buyer.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": operationKey }, data: input });
      expect(response.status()).toBe(201);
      const recovered = (await response.json()).data as CheckoutDto;
      expect(recovered).toMatchObject({ orderId: checkout.orderId, paymentAttemptId: checkout.paymentAttemptId, total: quote.total });
      expect(await privateCartState(pool, selected.id)).toEqual(selectionState);
      expect(await privateFinancialState(pool, checkout.orderId, variant.id)).toEqual(financial);
    };
    let count = await totalCarts(pool);
    await buyer.clearCookies({ name: "morphiume-cart" });
    await replay(); // Real native auth cookies remain; the old cart cookie is absent.
    expect(await totalCarts(pool)).toBe(count);
    expect((await buyer.cookies(baseURL!)).some(cookie => cookie.name === "morphiume-cart")).toBe(false);

    let different = await readCurrentCart(replacement);
    different = await setCurrentCartQuantity(replacement, baseURL!, variant.id, 1, different);
    const replacementState = await privateCartState(pool, different.id);
    await buyer.addCookies([await actualCartCookie(replacement, baseURL!)]);
    count = await totalCarts(pool);
    await replay(); // A different actual guest cart is not claimed or consumed during saved recovery.
    expect(await totalCarts(pool)).toBe(count);
    expect(await privateCartState(pool, different.id)).toEqual(replacementState);
    expect((await buyer.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": operationKey }, data: { ...input, address: { ...input.address, plaque: "2" } } })).status()).toBe(409);

    const other = await loginCustomer(foreign, baseURL!); users.push(other.userId);
    let otherCart = await claimCurrentCart(foreign, baseURL!);
    otherCart = await setCurrentCartQuantity(foreign, baseURL!, variant.id, 1, otherCart);
    const otherState = await privateCartState(pool, otherCart.id);
    expect((await foreign.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": operationKey }, data: input })).status()).toBe(404);
    expect((await foreign.request.get(`/api/orders/${checkout.orderId}`)).status()).toBe(404);
    expect((await (await foreign.request.get("/api/orders")).json()).data).toEqual([]);
    expect(await privateCartState(pool, otherCart.id)).toEqual(otherState);
    expect(await privateCartState(pool, selected.id)).toEqual(selectionState);
    expect(await privateFinancialState(pool, checkout.orderId, variant.id)).toEqual(financial);
  } finally {
    await pool.query("UPDATE coupon SET active=false WHERE code=$1", [couponCode]);
    await archiveFixtureProducts(pool, products); await disableUsers(pool, users);
    await buyer.close(); await replacement.close(); await foreign.close(); await pool.end();
  }
});
