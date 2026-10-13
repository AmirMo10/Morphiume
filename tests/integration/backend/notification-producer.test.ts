import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCommerce } from "../../../src/server/commerce/service";
import { createJobs } from "../../../src/server/jobs/service";
import { createNotificationEventDispatcher } from "../../../src/server/jobs/notification-events";
import { notifyOrderEvent } from "../../../src/server/jobs/notifications";
import { commerceFixture } from "./commerce-fixture";
import { createIsolatedDatabase } from "./isolated-database";
config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled = process.env.NOTIFICATION_INTEGRATION_PG_TESTS === "true" && !!databaseUrl && !!migrationUrl;
describe.skipIf(!enabled)("isolated canonical notification producer and worker", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: pg.Pool, fixture: Awaited<ReturnType<typeof commerceFixture>>;
  async function jobs(orderId: string) { return (await pool.query("SELECT * FROM outbox_job WHERE type='notification.event' AND payload->>'orderId'=$1 ORDER BY dedupe_key", [orderId])).rows; }
  function failEnqueue(): pg.Pool {
    return { query: pool.query.bind(pool), connect: async () => { const q = await pool.connect(); return new Proxy(q, { get(target, key) {
      if (key === "query") return async (sql: string, values?: unknown[]) => { const result = await target.query(sql, values); if (sql.startsWith("INSERT INTO outbox_job") && values?.[1] === "notification.event") throw new Error("TEST notification insert crash"); return result; };
      if (key === "release") return target.release.bind(target); return Reflect.get(target, key);
    } }); } } as unknown as pg.Pool;
  }
  async function evidence(orderId?: string) { return {
    orders: (await pool.query("SELECT * FROM orders WHERE $1::uuid IS NULL OR id=$1 ORDER BY id", [orderId ?? null])).rows,
    items: (await pool.query("SELECT * FROM order_item WHERE $1::uuid IS NULL OR order_id=$1 ORDER BY id", [orderId ?? null])).rows,
    receipts: (await pool.query("SELECT * FROM payment_receipt WHERE $1::uuid IS NULL OR order_id=$1 ORDER BY id", [orderId ?? null])).rows,
    events: (await pool.query("SELECT * FROM order_event WHERE $1::uuid IS NULL OR order_id=$1 ORDER BY id", [orderId ?? null])).rows,
    jobs: (await pool.query("SELECT * FROM outbox_job ORDER BY id")).rows,
    stock: (await pool.query("SELECT * FROM inventory_balance WHERE variant_id=$1", [fixture.variantId])).rows,
    ledger: (await pool.query("SELECT * FROM inventory_ledger WHERE variant_id=$1 ORDER BY id", [fixture.variantId])).rows,
    reservations: (await pool.query("SELECT * FROM inventory_reservation WHERE variant_id=$1 ORDER BY id", [fixture.variantId])).rows,
  }; }
  beforeAll(async () => { isolated = await createIsolatedDatabase(databaseUrl!, migrationUrl!); pool = isolated.pool; }, 60000);
  afterAll(async () => { await isolated?.close(); }, 60000);
  beforeEach(async () => {
    // Only this generated queue is reset; runtime tick/sweep remain unchanged and wholly schema-scoped.
    await pool.query("DELETE FROM outbox_job"); fixture = await commerceFixture(pool);
  });
  it("atomically creates one canonical order event/job, with stable actor-key checkout replay", async () => {
    const cart = await fixture.cart(), first = await fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key), event = (await pool.query("SELECT * FROM order_event WHERE order_id=$1 AND type='order.created'", [first.orderId])).rows[0]!;
    expect(await jobs(first.orderId)).toEqual([expect.objectContaining({ dedupe_key: `notification:event:${event.id}`, payload: { eventId: event.id, orderId: first.orderId } })]);
    expect((await fixture.commerce.createCheckout(fixture.customer, "", cart.input, cart.key)).orderId).toBe(first.orderId); expect((await jobs(first.orderId))).toHaveLength(1);
    expect((await pool.query("SELECT type FROM outbox_job WHERE type IN ('order.created','order.paid','shipment.updated','payment.exception')")).rows).toHaveLength(0);
    expect((await pool.query("SELECT type FROM outbox_job WHERE dedupe_key=$1", [`initialize:${first.paymentAttemptId}`])).rows).toEqual([{ type: "payment.initialize" }]);
  });
  it("rolls actual event/job insertion back together with new order/cart/stock before retry", async () => {
    const cart = await fixture.cart(), before = await evidence(), cartBefore = await fixture.commerce.getCart(cart.input.cartId, cart.guestToken), domain = createCommerce({ ...fixture.options, pool: failEnqueue() });
    await expect(domain.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key)).rejects.toThrow("TEST notification insert crash"); expect(await evidence()).toEqual(before); expect(await fixture.commerce.getCart(cart.input.cartId, cart.guestToken)).toEqual(cartBefore);
    const retry = await fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key); expect(await jobs(retry.orderId)).toHaveLength(1);
  });
  it("rolls payment receipt/stock commitment/event/job back after notification failure, then verifies once", async () => {
    const cart = await fixture.cart(), order = await fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key), authority = await fixture.authority(order.paymentAttemptId); await fixture.mock.complete(authority, "paid"); const before = await evidence(order.orderId);
    await expect(createCommerce({ ...fixture.options, pool: failEnqueue() }).verifyPayment(authority)).rejects.toThrow("TEST notification insert crash"); expect(await evidence(order.orderId)).toEqual(before);
    await fixture.commerce.verifyPayment(authority); await fixture.commerce.verifyPayment(authority);
    expect((await pool.query("SELECT count(*)::integer AS count FROM payment_receipt WHERE order_id=$1", [order.orderId])).rows[0]!.count).toBe(1); expect((await pool.query("SELECT count(*)::integer AS count FROM shipment WHERE order_id=$1", [order.orderId])).rows[0]!.count).toBe(1);
    expect(await jobs(order.orderId)).toHaveLength(2);
  });
  it("queues new shipped/delivered/cancel-review/refund events once and never creates legacy job aliases", async () => {
    const purchase = await fixture.purchase(), request = await fixture.commerce.requestReturn(fixture.customer, purchase.checkout.orderId, "cancel", "TEST pending cancel"); await fixture.commerce.decideReturn(fixture.admin, request.id, { status: "rejected", reason: "TEST reject" }); await fixture.commerce.decideReturn(fixture.admin, request.id, { status: "rejected", reason: "TEST reject" });
    const shipping = { carrier: "TEST", trackingCode: "TEST", status: "shipped" as const }; await fixture.commerce.recordShipment(fixture.admin, purchase.checkout.orderId, shipping); await fixture.commerce.recordShipment(fixture.admin, purchase.checkout.orderId, shipping); await fixture.commerce.recordShipment(fixture.admin, purchase.checkout.orderId, { ...shipping, status: "delivered" });
    const receipt = (await pool.query("SELECT id FROM payment_receipt WHERE order_id=$1", [purchase.checkout.orderId])).rows[0]!, key = randomUUID(), refund = await fixture.commerce.requestRefund(fixture.admin, purchase.checkout.orderId, receipt.id, "10", "TEST refund", key); await fixture.commerce.requestRefund(fixture.admin, purchase.checkout.orderId, receipt.id, "10", "TEST refund", key); await fixture.commerce.completeManualRefund(fixture.admin, refund.id, "TEST evidence"); await fixture.commerce.completeManualRefund(fixture.admin, refund.id, "TEST evidence");
    const events = (await pool.query("SELECT id FROM order_event WHERE order_id=$1", [purchase.checkout.orderId])).rows; expect(await jobs(purchase.checkout.orderId)).toHaveLength(events.length); expect(new Set((await jobs(purchase.checkout.orderId)).map(row => row.payload.eventId)).size).toBe(events.length);
    expect((await pool.query("SELECT id FROM outbox_job WHERE type IN ('order.created','order.paid','shipment.updated','payment.exception')")).rows).toHaveLength(0);
  });
  it("keeps extra/late exception receipts traceable with canonical UUID-only jobs", async () => {
    const c = await fixture.cart(), order = await fixture.commerce.createCheckout(fixture.customer, c.guestToken, c.input, c.key), authority = await fixture.authority(order.paymentAttemptId);
    await pool.query("UPDATE inventory_reservation SET expires_at=clock_timestamp()-interval '1 second' WHERE order_id=$1", [order.orderId]); await fixture.commerce.expireReservations(); await fixture.commerce.adjustInventory(fixture.admin, fixture.variantId, -10, "TEST stockout", randomUUID()); await fixture.mock.complete(authority, "paid"); await fixture.commerce.verifyPayment(authority);
    const extraId = randomUUID(); await pool.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr) VALUES($1,$2,'mock','controlled-mock',$3)", [extraId, order.orderId, order.total.amountIrr]);
    const created = await fixture.mock.create({ attemptId: extraId, orderId: order.orderId, amountIrr: BigInt(order.total.amountIrr), currency: "IRR", merchantKey: "controlled-mock", callbackUrl: "http://127.0.0.1:3000/api/payments/mock/callback" }); if (created.kind !== "created") throw new Error("TEST mock creation failed"); await pool.query("UPDATE payment_attempt SET authority=$1,status='pending' WHERE id=$2", [created.authority, extraId]); await fixture.mock.complete(created.authority, "paid"); await fixture.commerce.verifyPayment(created.authority); await fixture.commerce.verifyPayment(created.authority);
    const events = (await pool.query("SELECT id,type FROM order_event WHERE order_id=$1 AND type IN ('payment.inventory_exception','payment.extra_receipt')", [order.orderId])).rows; expect(events).toHaveLength(2); const notifications = await jobs(order.orderId); for (const event of events) expect(notifications.filter(job => job.payload.eventId === event.id)).toHaveLength(1);
    expect(JSON.stringify(notifications.map(row => row.payload))).not.toContain(created.authority); expect(notifications.every(row => Object.keys(row.payload).sort().join(',') === "eventId,orderId")).toBe(true);
  });
  it("does not backfill a historical canonical event when its legitimate shipment replay is processed", async () => {
    const { checkout } = await fixture.purchase(), value = { carrier: "TEST", trackingCode: "TEST", status: "shipped" as const }; await fixture.commerce.recordShipment(fixture.admin, checkout.orderId, value);
    const event = (await pool.query("SELECT id FROM order_event WHERE order_id=$1 AND type='shipment.shipped'", [checkout.orderId])).rows[0]!; await pool.query("DELETE FROM outbox_job WHERE dedupe_key=$1", [`notification:event:${event.id}`]);
    await fixture.commerce.recordShipment(fixture.admin, checkout.orderId, value); expect((await jobs(checkout.orderId)).some(row => row.payload.eventId === event.id)).toBe(false); expect((await pool.query("SELECT id FROM order_event WHERE id=$1", [event.id])).rows).toHaveLength(1);
  });
  it("retries absent required worker delivery, then completes real messages without touching old completed/dead jobs", async () => {
    const cart = await fixture.cart(), order = await fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key), notification = (await jobs(order.orderId))[0]!;
    const old = [randomUUID(), randomUUID()]; await pool.query("INSERT INTO outbox_job(id,type,dedupe_key,payload,status) VALUES($1,'order.created',$3,'{}','completed'),($2,'shipment.updated',$4,'{}','dead')", [...old, `TEST old:${old[0]}`, `TEST old:${old[1]}`]); const before = (await pool.query("SELECT * FROM outbox_job WHERE id=ANY($1::uuid[]) ORDER BY id", [old])).rows;
    await createJobs({ pool, commerce: fixture.commerce }).tick(); expect((await pool.query("SELECT status,attempts,last_error FROM outbox_job WHERE id=$1", [notification.id])).rows[0]).toEqual({ status: "pending", attempts: 1, last_error: "Canonical in-app notification delivery failed" });
    await pool.query("UPDATE outbox_job SET available_at=clock_timestamp()-interval '365 days' WHERE id=$1", [notification.id]); const dispatch = createNotificationEventDispatcher({ pool, deploymentEnv: "test" }); await createJobs({ pool, commerce: fixture.commerce, dispatchNotificationEvent: dispatch.dispatchNotificationEvent }).tick();
    expect((await pool.query("SELECT status,attempts FROM outbox_job WHERE id=$1", [notification.id])).rows[0]).toEqual({ status: "completed", attempts: 2 }); expect((await pool.query("SELECT id FROM notification_message WHERE order_id=$1", [order.orderId])).rows).toHaveLength(1); expect((await pool.query("SELECT * FROM outbox_job WHERE id=ANY($1::uuid[]) ORDER BY id", [old])).rows).toEqual(before);
  });
  it("recovers a worker crash after message commit and keeps one message/read state on actual retry", async () => {
    const cart = await fixture.cart(), order = await fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key), notification = (await jobs(order.orderId))[0]!, dispatch = createNotificationEventDispatcher({ pool, deploymentEnv: "test" });
    await createJobs({ pool, commerce: fixture.commerce, dispatchNotificationEvent: async input => { await dispatch.dispatchNotificationEvent(input); throw new Error("TEST private provider crash canary"); } }).tick();
    await pool.query("UPDATE notification_message SET read_at=clock_timestamp() WHERE order_id=$1", [order.orderId]); const before = (await pool.query("SELECT * FROM notification_message WHERE order_id=$1", [order.orderId])).rows;
    await pool.query("UPDATE outbox_job SET available_at=clock_timestamp()-interval '365 days' WHERE id=$1", [notification.id]); await createJobs({ pool, commerce: fixture.commerce, dispatchNotificationEvent: dispatch.dispatchNotificationEvent }).tick();
    expect((await pool.query("SELECT status,attempts,last_error FROM outbox_job WHERE id=$1", [notification.id])).rows[0]).toEqual({ status: "completed", attempts: 2, last_error: null }); expect((await pool.query("SELECT * FROM notification_message WHERE order_id=$1", [order.orderId])).rows).toEqual(before);
  });
  it("continues old pending notification consumers without aliasing them into v2source delivery", async () => {
    const { checkout } = await fixture.purchase(), oldId = randomUUID(), key = `TEST old pending:${oldId}`; await pool.query("INSERT INTO outbox_job(id,type,dedupe_key,payload,available_at) VALUES($1,'order.created',$2,$3::jsonb,clock_timestamp()-interval '365 days')", [oldId, key, JSON.stringify({ orderId: checkout.orderId })]);
    const dispatch = createNotificationEventDispatcher({ pool, deploymentEnv: "test" }); await createJobs({ pool, commerce: fixture.commerce, notify: (type, payload, dedupe) => notifyOrderEvent(pool, "test", type, payload, dedupe), dispatchNotificationEvent: dispatch.dispatchNotificationEvent }).tick();
    expect((await pool.query("SELECT status FROM outbox_job WHERE id=$1", [oldId])).rows[0]!.status).toBe("completed"); expect((await pool.query("SELECT kind,source_event_id FROM notification_message WHERE event_key=$1", [key])).rows).toEqual([{ kind: "legacy.order_update", source_event_id: null }]);
  });
});
