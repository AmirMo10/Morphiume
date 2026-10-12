import { expect, type BrowserContext, type Page } from "@playwright/test";
import type pg from "pg";
import type { CartDto, CheckoutDto, CheckoutInput, OrderDto, QuoteDto } from "../../src/contracts/commerce";
import type { PresentationDto, PresentationValue } from "../../src/contracts/presentation";

export function editablePresentation(value: PresentationDto): PresentationValue {
  return { heroTitle: value.heroTitle, heroDescription: value.heroDescription, heroAction: value.heroAction, banner: value.banner, headerLinks: value.headerLinks, footerLinks: value.footerLinks, footerText: value.footerText, featuredProductIds: value.featuredProductIds, services: value.services, maintenance: value.maintenance };
}

export async function controlledCheckout(customer: BrowserContext, baseURL: string, variantId: string, operationKey: string) {
  // POST adds to existing quantity; these independently controlled journeys
  // intentionally buy exactly one unit even when reusing an owned cart.
  expect((await customer.request.put("/api/cart/items", { headers: { Origin: baseURL }, data: { variantId, quantity: 1 } })).status()).toBe(200);
  const cart = (await (await customer.request.get("/api/cart")).json()).data as CartDto;
  expect(cart.items).toHaveLength(1); expect(cart.items[0]?.variantId).toBe(variantId); expect(cart.items[0]?.quantity).toBe(1);
  const quoted = await customer.request.post("/api/checkout/quote", { headers: { Origin: baseURL }, data: { cartId: cart.id, cartVersion: cart.version } });
  expect(quoted.status()).toBe(200);
  const quote = (await quoted.json()).data as QuoteDto;
  const input: CheckoutInput = { cartId: cart.id, cartVersion: quote.cartVersion, shippingMethodId: quote.shippingMethodId, quoteFingerprint: quote.fingerprint, policyVersion: quote.policyVersion, address: { recipient: "گیرندهٔ مصنوعی QA", phone: "09121234567", province: "تهران", city: "تهران", address: "نشانی مصنوعی آزمون؛ ارسال واقعی انجام نشود.", plaque: "1", postalCode: "1234567890" } };
  const response = await customer.request.post("/api/checkout", { headers: { Origin: baseURL, "Idempotency-Key": operationKey }, data: input });
  expect(response.status()).toBe(201);
  const checkout = (await response.json()).data as CheckoutDto;
  expect(checkout.redirectUrl).toContain("/test/payments/MOCK-");
  return { checkout, input, operationKey, authority: checkout.redirectUrl!.split("/").at(-1)! };
}
export async function payControlledCheckout(customer: BrowserContext, baseURL: string, authority: string, orderId: string) {
  const verified = await customer.request.post(`/api/test/payments/${authority}`, { headers: { Origin: baseURL }, data: { outcome: "succeeded" } });
  expect(verified.status()).toBe(200);
  const response = await customer.request.get(`/api/orders/${orderId}`);
  expect(response.status()).toBe(200);
  const order = (await response.json()).data as OrderDto;
  expect(order.paymentStatus).toBe("paid");
  return order;
}
export async function archiveFixtureProducts(pool: pg.Pool, ids: string[]) {
  if (ids.length) await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])", [ids]);
}
export async function assertPrivateOrderCounts(pool: pg.Pool, orderId: string) {
  expect((await pool.query("SELECT (SELECT count(*)::int FROM payment_receipt WHERE order_id=$1 AND disposition='primary') AS receipts,(SELECT count(*)::int FROM shipment WHERE order_id=$1) AS shipments", [orderId])).rows[0]).toEqual({ receipts: 1, shipments: 1 });
}
export async function fillReturnDecision(page: Page, requestId: string, status: "approved" | "received" | "closed", reason: string) {
  await page.getByLabel("درخواست مشتری", { exact: true }).selectOption(requestId);
  await page.getByLabel("نتیجهٔ رسیدگی", { exact: true }).selectOption(status);
  await page.getByLabel("دلیل و توضیح رسیدگی", { exact: true }).fill(reason);
}
