import { config } from "dotenv";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createCommerce } from "../../src/server/commerce/service";
import { MockPaymentProvider } from "../../src/server/payments/mock";
import type { Actor, CheckoutInput, ProductInput } from "../../src/contracts/commerce";

config({ path: ".env.local", quiet: true });
// Deliberately fail, never skip or silently fall back to a live database.
assert.equal(process.env.DEPLOYMENT_ENV, "test", "Security fixtures require DEPLOYMENT_ENV=test");
assert.equal(process.env.PAYMENT_PROVIDER, "mock", "No real payment provider may be used");
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
assert.ok(databaseUrl, "Explicit test database configuration is required");
const target = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "Only the isolated local SSH tunnel is permitted");
assert.equal(decodeURIComponent(target.pathname), "/morphiume_staging", "This harness is scoped to the isolated morphiume_staging DB");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 6 });
const payments = new MockPaymentProvider(pool, "test", "http://127.0.0.1:3000");
const commerce = createCommerce({ pool, payments, deploymentEnv: "test", appBaseUrl: "http://127.0.0.1:3000", policyVersion: "security-fixture-policy", shippingFeeIrr: 100n });
const users: string[] = [], products: string[] = [];
let admin: Actor;

async function actor(kind: Actor["kind"] = "customer", grant = false, phoneVerified = true): Promise<Actor> {
  const userId = randomUUID(), sessionId = randomUUID();
  users.push(userId);
  const syntheticPhone = kind === "customer" ? `+989000${randomInt(0, 1_000_000).toString().padStart(6, "0")}` : null;
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number_verified,phone_number) VALUES($1,\'SECURITY synthetic fixture\',$2,true,$3,$4)', [userId, `${userId}@security-fixture.invalid`, phoneVerified, syntheticPhone]);
  await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [sessionId, randomUUID(), userId]);
  if (kind === "admin") await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')", [userId]);
  if (grant) await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')", [sessionId]);
  return { userId, sessionId, kind };
}
async function product(stock = 3) {
  const tag = randomUUID();
  const input: ProductInput = { name: `SECURITY synthetic ${tag}`, slug: `security-${tag}`, description: "Synthetic security test data; not a real product", concentration: "TEST", family: "TEST", topNotes: [], heartNotes: [], baseNotes: [], imageUrl: "/assets/sample-perfume.svg", variants: [{ sku: `SEC-${tag}`, volumeMl: 50, priceToman: "1000", initialStock: stock }] };
  const p = await commerce.createProduct(admin, input); products.push(p.id);
  return commerce.publishProduct(admin, p.id, p.version);
}
async function checkoutInput(who: Actor, variantId: string) {
  const { cart, guestToken } = await commerce.createCart();
  const filled = await commerce.setCartItem(cart.id, guestToken, variantId, 1, cart.version);
  const quote = await commerce.quoteCheckout(who, guestToken, cart.id);
  const input: CheckoutInput = { cartId: cart.id, cartVersion: filled.version, address: { recipient: "SECURITY synthetic recipient", phone: "+989000000001", province: "TEST", city: "TEST", address: "Synthetic security fixture address", plaque: "1", postalCode: "0000000000" }, shippingMethodId: "standard", quoteFingerprint: quote.fingerprint, policyVersion: quote.policyVersion };
  return { input, guestToken, key: randomUUID() };
}
async function createOrder(who: Actor, stock = 3) {
  const p = await product(stock), c = await checkoutInput(who, p.variants[0]!.id);
  const order = await commerce.createCheckout(who, c.guestToken, c.input, c.key);
  const payment = (await pool.query<{ authority: string }>("SELECT authority FROM payment_attempt WHERE id=$1", [order.paymentAttemptId])).rows[0]!;
  return { p, c, order, authority: payment.authority };
}
const denied = (operation: Promise<unknown>, code: string) => assert.rejects(operation, (error: unknown) => (error as { code?: string }).code === code);

before(async () => {
  const identity = (await pool.query<{ db: string; role: string }>("SELECT current_database() AS db,current_user AS role")).rows[0]!;
  assert.equal(identity.db, "morphiume_staging");
  assert.equal(identity.role, "morphiume_staging_app");
  admin = await actor("admin", true);
});
after(async () => {
  try {
    // Preserve financial evidence. Disable/archive only IDs this process created.
    await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])", [products]);
    await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])', [users]);
    await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])", [users]);
  } finally { await pool.end(); }
});

test("domain rejects invalid, password-only, customer-kind, revoked and disabled admin actors", async () => {
  await denied(commerce.listAdminProducts({ userId: randomUUID(), sessionId: randomUUID(), kind: "admin" }), "UNAUTHENTICATED");
  const passwordOnly = await actor("admin");
  await denied(commerce.listAdminProducts(passwordOnly), "FORBIDDEN");
  const customer = await actor();
  await denied(commerce.listAdminProducts(customer), "FORBIDDEN");
  const revoked = await actor("admin", true);
  await commerce.listAdminProducts(revoked);
  await pool.query("DELETE FROM role_membership WHERE user_id=$1", [revoked.userId]);
  await denied(commerce.listAdminProducts(revoked), "FORBIDDEN");
  const revokedGrant = await actor("admin", true);
  await pool.query("DELETE FROM admin_grant WHERE session_id=$1", [revokedGrant.sessionId]);
  await denied(commerce.listAdminProducts(revokedGrant), "FORBIDDEN");
  const disabled = await actor("admin", true);
  await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [disabled.userId]);
  await denied(commerce.listAdminProducts(disabled), "UNAUTHENTICATED");
});

test("two-user object attacks reject order, return, address and cart access", async () => {
  const a = await actor(), b = await actor(), fixture = await createOrder(a);
  await denied(commerce.getOrder(b, fixture.order.orderId), "NOT_FOUND");
  await denied(commerce.requestReturn(b, fixture.order.orderId, "cancel", "Synthetic attack"), "NOT_FOUND");
  await denied(commerce.getCart(fixture.c.input.cartId, "wrong-token", b), "NOT_FOUND");
  const saved = await commerce.saveAddress(a, fixture.c.input.address);
  await denied(commerce.saveAddress(b, { ...fixture.c.input.address, recipient: "ATTACK" }, saved.id), "NOT_FOUND");
  await commerce.deleteAddress(b, saved.id);
  assert.equal((await commerce.listAddresses(a)).some((address) => address.id === saved.id), true);
});

test("checkout requires verified phone in the domain layer", async () => {
  const unverified = await actor("customer", false, false), verified = await actor(), p = await product();
  const c = await checkoutInput(verified, p.variants[0]!.id);
  await assert.rejects(commerce.createCheckout(unverified, c.guestToken, c.input, c.key), (error: unknown) => ["FORBIDDEN", "UNAUTHENTICATED"].includes((error as { code: string }).code));
});

test("changed quote is rejected; browser price/owner extras cannot set order values", async () => {
  const a = await actor(), p = await product(), c = await checkoutInput(a, p.variants[0]!.id);
  await denied(commerce.createCheckout(a, c.guestToken, { ...c.input, quoteFingerprint: "attacker" }, c.key), "PRICE_CHANGED");
  const tampered = { ...c.input, totalIrr: "10", subtotalIrr: "10", userId: randomUUID(), paymentStatus: "paid" };
  const saved = await commerce.createCheckout(a, c.guestToken, tampered, c.key);
  assert.equal(saved.total.amountIrr, "10100");
  const row = (await pool.query("SELECT user_id,total_irr::text,payment_status FROM orders WHERE id=$1", [saved.orderId])).rows[0];
  assert.deepEqual(row, { user_id: a.userId, total_irr: "10100", payment_status: "pending" });
});

test("checkout idempotency binds actor and payload before provider request", async () => {
  const a = await actor(), b = await actor(), p = await product(5), c = await checkoutInput(a, p.variants[0]!.id);
  const first = await commerce.createCheckout(a, c.guestToken, c.input, c.key);
  const replay = await commerce.createCheckout(a, c.guestToken, c.input, c.key);
  assert.equal(replay.orderId, first.orderId);
  await denied(commerce.createCheckout(a, c.guestToken, { ...c.input, address: { ...c.input.address, recipient: "ATTACK altered" } }, c.key), "CONFLICT");
  const other = await checkoutInput(b, p.variants[0]!.id);
  const otherOrder = await commerce.createCheckout(b, other.guestToken, other.input, c.key);
  assert.notEqual(otherOrder.orderId, first.orderId);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM mock_provider_transaction WHERE attempt_id=$1", [first.paymentAttemptId])).rows[0].count, 1);
});

test("unpaid callback cannot commit; concurrent replay produces one receipt and fulfillment", async () => {
  const a = await actor(), f = await createOrder(a, 3);
  assert.equal((await commerce.verifyPayment(f.authority)).status, "unknown");
  assert.equal((await commerce.getOrder(a, f.order.orderId)).status, "awaiting_payment");
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM shipment WHERE order_id=$1", [f.order.orderId])).rows[0].count, 0);
  await payments.complete(f.authority, "paid");
  await Promise.all([commerce.verifyPayment(f.authority), commerce.verifyPayment(f.authority), commerce.verifyPayment(f.authority)]);
  await commerce.verifyPayment(f.authority);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM payment_receipt WHERE order_id=$1", [f.order.orderId])).rows[0].count, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM shipment WHERE order_id=$1", [f.order.orderId])).rows[0].count, 1);
  assert.deepEqual((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [f.p.variants[0]!.id])).rows[0], { on_hand: 2, reserved: 0 });
});

test("customer cannot request refund; concurrent refund budgets cannot exceed receipt", async () => {
  const a = await actor(), f = await createOrder(a);
  await payments.complete(f.authority, "paid"); await commerce.verifyPayment(f.authority);
  const receipt = (await pool.query<{ id: string }>("SELECT id FROM payment_receipt WHERE order_id=$1", [f.order.orderId])).rows[0]!;
  await denied(commerce.requestRefund(a, f.order.orderId, receipt.id, "100", "ATTACK", randomUUID()), "FORBIDDEN");
  await denied(commerce.requestRefund(admin, f.order.orderId, receipt.id, "10110", "ATTACK excess", randomUUID()), "CONFLICT");
  const results = await Promise.allSettled([commerce.requestRefund(admin, f.order.orderId, receipt.id, "8000", "SECURITY refund A", randomUUID()), commerce.requestRefund(admin, f.order.orderId, receipt.id, "8000", "SECURITY refund B", randomUUID())]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});

test("concurrent new keys cannot bypass the three active-reservation account budget", async () => {
  const a = await actor(), p = await product(10);
  const carts = await Promise.all(Array.from({ length: 4 }, () => checkoutInput(a, p.variants[0]!.id)));
  await Promise.allSettled(carts.map((c) => commerce.createCheckout(a, c.guestToken, c.input, c.key)));
  const row = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM orders o WHERE user_id=$1 AND EXISTS(SELECT 1 FROM inventory_reservation r WHERE r.order_id=o.id AND r.status='active')", [a.userId])).rows[0]!;
  assert.ok(row.count <= 3, `Concurrent requests created ${row.count} active orders despite the three-order budget`);
});

test("distinct receipts are preserved but commit once; extra-receipt refund does not refund the purchase", async () => {
  const a = await actor(), f = await createOrder(a, 4);
  await payments.complete(f.authority, "paid"); await commerce.verifyPayment(f.authority);
  const attemptId = randomUUID();
  await pool.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr) VALUES($1,$2,'mock','controlled-mock',$3)", [attemptId, f.order.orderId, f.order.total.amountIrr]);
  const extra = await payments.create({ attemptId, orderId: f.order.orderId, amountIrr: BigInt(f.order.total.amountIrr), currency: "IRR", merchantKey: "controlled-mock", callbackUrl: "http://127.0.0.1:3000/api/payments/mock/callback" });
  assert.equal(extra.kind, "created"); if (extra.kind !== "created") throw new Error("Synthetic payment creation failed");
  await pool.query("UPDATE payment_attempt SET authority=$1,status='pending' WHERE id=$2", [extra.authority, attemptId]);
  await payments.complete(extra.authority, "paid"); await commerce.verifyPayment(extra.authority);
  const receipts = (await pool.query<{ id: string; disposition: string }>("SELECT id,disposition FROM payment_receipt WHERE order_id=$1 ORDER BY disposition", [f.order.orderId])).rows;
  assert.deepEqual(receipts.map((row) => row.disposition), ["extra", "primary"]);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM shipment WHERE order_id=$1", [f.order.orderId])).rows[0].count, 1);
  assert.deepEqual((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [f.p.variants[0]!.id])).rows[0], { on_hand: 3, reserved: 0 });
  const refund = await commerce.requestRefund(admin, f.order.orderId, receipts[0]!.id, f.order.total.amountIrr, "SECURITY synthetic extra refund", randomUUID());
  await commerce.completeManualRefund(admin, refund.id, "SECURITY synthetic evidence; no money moved");
  assert.equal((await commerce.getOrder(a, f.order.orderId)).paymentStatus, "paid");
});
