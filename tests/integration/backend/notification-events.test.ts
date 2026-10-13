import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "../../../src/contracts/commerce";
import { createNotificationEventDispatcher } from "../../../src/server/jobs/notification-events";
import { notifyOrderEvent } from "../../../src/server/jobs/notifications";
import { commerceFixture, observeLock } from "./commerce-fixture";
import { createIsolatedDatabase } from "./isolated-database";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled = process.env.NOTIFICATION_EVENTS_PG_TESTS === "true" && !!databaseUrl && !!migrationUrl;
describe.skipIf(!enabled)("isolated canonical in-app notifications (rollout gated)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: pg.Pool, fixture: Awaited<ReturnType<typeof commerceFixture>>;
  const dispatcher = (injected = pool) => createNotificationEventDispatcher({ pool: injected, deploymentEnv: "test" });
  async function operator(role: Role, flags: { disabled?: boolean; factor?: boolean } = {}) {
    const id = randomUUID();
    await pool.query('INSERT INTO "user"(id,name,email,disabled,two_factor_enabled) VALUES($1,\'TEST notification operator\',$2,$3,$4)', [id, `${id}@fixture.invalid`, flags.disabled ?? false, flags.factor ?? true]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)", [id, role]); return id;
  }
  async function source(type = "request.return") {
    const purchase = await fixture.purchase(), orderId = purchase.checkout.orderId;
    let eventId = (await pool.query<{ id: string }>("SELECT id FROM order_event WHERE order_id=$1 AND type=$2 ORDER BY id LIMIT 1", [orderId, type])).rows[0]?.id;
    if (!eventId) {
      // Controlled persisted source fixtures test delivery, not yet-unimplemented atomic producers.
      eventId = randomUUID(); await pool.query("INSERT INTO order_event(id,order_id,event_key,type,actor_id) VALUES($1,$2,$3,$4,$5)", [eventId, orderId, `TEST source contact/provider/reason canary:${randomUUID()}`, type, fixture.admin.userId]);
    }
    return { eventId, orderId };
  }
  async function messages() { return (await pool.query("SELECT * FROM notification_message ORDER BY audience,user_id,id")).rows; }
  async function manyOperators(count: number) {
    const ids = Array.from({ length: count }, () => randomUUID());
    await pool.query('INSERT INTO "user"(id,name,email,two_factor_enabled) SELECT id,\'TEST notification fanout\',id||\'@fixture.invalid\',true FROM unnest($1::text[]) id', [ids]);
    await pool.query("INSERT INTO role_membership SELECT id,'fulfillment' FROM unnest($1::text[]) id", [ids]); return ids;
  }
  function decoratedPool(onQuery: (sql: string) => void, afterQuery?: (sql: string) => void): pg.Pool {
    return { connect: async () => {
      const q = await pool.connect();
      return new Proxy(q, { get(target, key) {
        if (key === "query") return async (sql: string, values?: unknown[]) => { onQuery(sql); const result = await target.query(sql, values); afterQuery?.(sql); return result; };
        if (key === "release") return target.release.bind(target);
        return Reflect.get(target, key);
      } });
    } } as unknown as pg.Pool;
  }
  beforeAll(async () => { isolated = await createIsolatedDatabase(databaseUrl!, migrationUrl!); pool = isolated.pool; }, 60000);
  afterAll(async () => { await isolated?.close(); }, 60000);
  beforeEach(async () => {
    await pool.query("DELETE FROM notification_message");
    // This generated schema contains only these controlled fixtures; old role cohorts cannot pollute fanout.
    await pool.query('UPDATE "user" SET disabled=true'); fixture = await commerceFixture(pool);
  });
  it("retains the unchanged legacy producer shape and read state without inventing event/order links", async () => {
    const event = await source("order.created"), key = `TEST legacy:${randomUUID()}`;
    await notifyOrderEvent(pool, "test", "order.created", { orderId: event.orderId }, key);
    await pool.query("UPDATE notification_message SET read_at=clock_timestamp() WHERE event_key=$1", [key]); const before = await messages();
    await notifyOrderEvent(pool, "test", "order.created", { orderId: event.orderId }, key);
    expect(await messages()).toEqual(before); expect(before[0]).toMatchObject({ audience: "customer", kind: "legacy.order_update", order_id: null, source_event_id: null, required_permission: null });
  });
  it("derives the owner from the durable order and operators from current eligible roles only", async () => {
    const allowed = await operator("fulfillment"), support = await operator("support"), product = await operator("product_manager"), finance = await operator("finance"), disabled = await operator("fulfillment", { disabled: true }), factorOff = await operator("fulfillment", { factor: false });
    const event = await source(), result = await dispatcher().dispatchNotificationEvent(event), rows = await messages();
    expect(result).toEqual({ outcome: "processed", insertedMessages: 3, currentRecipients: 3 });
    expect(rows.filter(row => row.audience === "customer").map(row => row.user_id)).toEqual([fixture.customer.userId]);
    expect(rows.filter(row => row.audience === "operator").map(row => row.user_id).sort()).toEqual([fixture.admin.userId, allowed].sort());
    for (const id of [support, product, finance, disabled, factorOff]) expect(rows.some(row => row.user_id === id)).toBe(false);
    expect(rows.every(row => row.order_id === event.orderId && row.source_event_id === event.eventId)).toBe(true);
    expect(rows.filter(row => row.audience === "operator").every(row => row.required_permission === "orders.fulfill")).toBe(true);
  });
  it("uses finance routing for exceptions/refunds without copying raw evidence or claiming transfer", async () => {
    const finance = await operator("finance"), fulfillment = await operator("fulfillment");
    for (const kind of ["refund.failed", "payment.inventory_exception", "payment.extra_receipt"]) {
      const event = await source(kind); await dispatcher().dispatchNotificationEvent(event);
      const rows = (await messages()).filter(row => row.source_event_id === event.eventId);
      expect(rows.filter(row => row.audience === "operator").map(row => row.user_id).sort()).toEqual([fixture.admin.userId, finance].sort());
      expect(rows.some(row => row.user_id === fulfillment)).toBe(false); expect(JSON.stringify(rows)).not.toContain("canary");
      expect(rows.filter(row => row.audience === "operator").every(row => row.required_permission === "refunds.write")).toBe(true);
      if (kind === "refund.failed") expect(rows.every(row => !/انتقال.*انجام شد|تأیید شد/.test(row.title))).toBe(true);
    }
  });
  it("ignores missing, mismatched and unsupported sources without invented messages", async () => {
    const event = await source("payment.retry");
    for (const payload of [{ eventId: randomUUID(), orderId: event.orderId }, { eventId: event.eventId, orderId: randomUUID() }, event]) expect(await dispatcher().dispatchNotificationEvent(payload)).toEqual({ outcome: "ignored", insertedMessages: 0, currentRecipients: 0 });
    expect(await messages()).toHaveLength(0);
  });
  it("deduplicates a competing delivery/retry and preserves first read state", async () => {
    const event = await source(), outcomes = await Promise.allSettled([dispatcher().dispatchNotificationEvent(event), dispatcher().dispatchNotificationEvent(event)]);
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true);
    for (const result of outcomes) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFIGURATION" });
    // Bounded lock contention can require this explicit worker-like retry; it is not a hidden runtime retry.
    await dispatcher().dispatchNotificationEvent(event); const initial = await messages(); expect(initial).toHaveLength(2);
    await pool.query("UPDATE notification_message SET read_at=clock_timestamp() WHERE source_event_id=$1", [event.eventId]); const read = await messages();
    expect(await dispatcher().dispatchNotificationEvent(event)).toEqual({ outcome: "processed", insertedMessages: 0, currentRecipients: 2 }); expect(await messages()).toEqual(read);
  });
  it("does not collapse distinct persisted source events on the same order", async () => {
    const event = await source(), second = { ...event, eventId: randomUUID() };
    await pool.query("INSERT INTO order_event(id,order_id,event_key,type) VALUES($1,$2,$3,'request.return')", [second.eventId, event.orderId, `TEST second:${second.eventId}`]);
    await dispatcher().dispatchNotificationEvent(event); await dispatcher().dispatchNotificationEvent(second);
    expect(await messages()).toHaveLength(4);
  });
  it("rejects more than five hundred current operators without a partial customer/batch insertion", async () => {
    await manyOperators(500); const event = await source();
    await expect(dispatcher().dispatchNotificationEvent(event)).rejects.toMatchObject({ code: "CONFIGURATION", status: 503 }); expect(await messages()).toHaveLength(0);
  });
  it("admits exactly five hundred operators in one batch with a bounded query count", async () => {
    await manyOperators(499); const event = await source(), statements: string[] = [];
    expect(await dispatcher(decoratedPool(sql => statements.push(sql))).dispatchNotificationEvent(event)).toEqual({ outcome: "processed", insertedMessages: 501, currentRecipients: 501 });
    expect((await messages()).filter(row => row.audience === "operator")).toHaveLength(500);
    expect(statements.filter(sql => sql.includes("INSERT INTO notification_message"))).toHaveLength(1); expect(statements.length).toBeLessThanOrEqual(13);
  });
  it("keeps the lifetime per-event operator ceiling when a retry sees a new role cohort", async () => {
    const previous = await manyOperators(499), event = await source(); await dispatcher().dispatchNotificationEvent(event); const before = await messages();
    await pool.query("DELETE FROM role_membership WHERE user_id=ANY($1::text[])", [previous]); await operator("fulfillment");
    await expect(dispatcher().dispatchNotificationEvent(event)).rejects.toMatchObject({ code: "CONFIGURATION" }); expect(await messages()).toEqual(before);
  });
  it("rolls an actual batch back after an injected post-insert crash, then retries without duplicates", async () => {
    const event = await source(), fault = decoratedPool(() => {}, sql => { if (sql.includes("INSERT INTO notification_message")) throw new Error("TEST raw address/provider canary"); });
    await expect(dispatcher(fault).dispatchNotificationEvent(event)).rejects.toMatchObject({ code: "CONFIGURATION", message: "ثبت اعلان درون‌برنامه‌ای آزمایشی کامل نشد." }); expect(await messages()).toHaveLength(0);
    await dispatcher().dispatchNotificationEvent(event); await dispatcher().dispatchNotificationEvent(event); expect(await messages()).toHaveLength(2);
  });
  it.each(["disabled", "two_factor_enabled"] as const)("rechecks an operator %s change after an observed real user-row wait", async column => {
    const id = await operator("fulfillment"), event = await source(), blocker = await pool.connect();
    await blocker.query("BEGIN"); await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [id]);
    const pending = dispatcher().dispatchNotificationEvent(event);
    try {
      await observeLock(pool, `TEST-isolated-${isolated.schema}`, 'SELECT u.id FROM "user" u%');
      await blocker.query(`UPDATE "user" SET ${column}=$2 WHERE id=$1`, [id, column === "disabled"]); await blocker.query("COMMIT");
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    await pending; expect((await messages()).some(row => row.user_id === id)).toBe(false);
  });
  it("rechecks role removal after an observed membership lock wait", async () => {
    const id = await operator("fulfillment"), event = await source(), blocker = await pool.connect();
    await blocker.query("BEGIN"); await blocker.query("SELECT user_id FROM role_membership WHERE user_id=$1 FOR UPDATE", [id]); const pending = dispatcher().dispatchNotificationEvent(event);
    try {
      await observeLock(pool, `TEST-isolated-${isolated.schema}`, "SELECT user_id FROM role_membership WHERE user_id=ANY%");
      await blocker.query("DELETE FROM role_membership WHERE user_id=$1", [id]); await blocker.query("COMMIT");
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    await pending; expect((await messages()).some(row => row.user_id === id)).toBe(false);
  });
  it("does not route to a customer disabled during the observed customer-row wait", async () => {
    const event = await source("order.created"), blocker = await pool.connect(); await blocker.query("BEGIN"); await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [fixture.customer.userId]);
    const pending = dispatcher().dispatchNotificationEvent(event);
    try {
      await observeLock(pool, `TEST-isolated-${isolated.schema}`, 'SELECT id FROM "user" WHERE id=$1 AND NOT disabled%');
      await blocker.query('UPDATE "user" SET disabled=true WHERE id=$1', [fixture.customer.userId]); await blocker.query("COMMIT");
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect(await pending).toEqual({ outcome: "processed", insertedMessages: 0, currentRecipients: 0 }); expect(await messages()).toHaveLength(0);
  });
  it("preserves prior messages after revocation but no longer routes new events to that recipient", async () => {
    const id = await operator("fulfillment"), first = await source(); await dispatcher().dispatchNotificationEvent(first);
    const retained = (await messages()).find(row => row.user_id === id)!; await pool.query("DELETE FROM role_membership WHERE user_id=$1", [id]);
    const second = await source(); await dispatcher().dispatchNotificationEvent(second);
    expect((await messages()).filter(row => row.user_id === id)).toEqual([retained]);
    // Read/mark denial after revocation is a root native/API integration contract, not proved here.
  });
  it("retains canonical event/order history through the new source/link foreign keys", async () => {
    const event = await source(); await dispatcher().dispatchNotificationEvent(event);
    await expect(pool.query("DELETE FROM order_event WHERE id=$1", [event.eventId])).rejects.toMatchObject({ code: "23503" }); expect((await messages()).every(row => row.source_event_id === event.eventId)).toBe(true);
  });
});
