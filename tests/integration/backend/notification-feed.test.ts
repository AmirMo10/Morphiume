import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor, Role } from "../../../src/contracts/commerce";
import { createNotificationFeed } from "../../../src/server/commerce/notification-feed";
import { createNotificationEventDispatcher } from "../../../src/server/jobs/notification-events";
import { commerceFixture, observeLock } from "./commerce-fixture";
import { createIsolatedDatabase } from "./isolated-database";
config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled = process.env.NOTIFICATION_INTEGRATION_PG_TESTS === "true" && !!databaseUrl && !!migrationUrl;
describe.skipIf(!enabled)("isolated current notification feed", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: pg.Pool, fixture: Awaited<ReturnType<typeof commerceFixture>>;
  const feed = (injected = pool) => createNotificationFeed({ pool: injected });
  async function roles(actor: Actor, values: Role[]) { await pool.query("DELETE FROM role_membership WHERE user_id=$1", [actor.userId]); for (const role of values) await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)", [actor.userId, role]); }
  async function legacy(actor: Actor, count = 1) {
    const ids = Array.from({ length: count }, () => randomUUID());
    await pool.query("INSERT INTO notification_message(id,user_id,event_key,title,body,created_at) SELECT id,$2,'TEST feed:'||id::text,'TEST legacy title','TEST legacy body','2026-10-01T00:00:00Z'::timestamptz FROM unnest($1::uuid[]) id", [ids, actor.userId]); return ids;
  }
  async function routed(kind: "order.created" | "request.cancel" | "refund.pending" = "request.cancel") {
    const { checkout } = await fixture.purchase();
    if (kind === "request.cancel") await fixture.commerce.requestReturn(fixture.customer, checkout.orderId, "cancel", "TEST cancellation");
    if (kind === "refund.pending") { const receipt = (await pool.query("SELECT id FROM payment_receipt WHERE order_id=$1", [checkout.orderId])).rows[0]!; await fixture.commerce.requestRefund(fixture.admin, checkout.orderId, receipt.id, "10", "TEST refund", randomUUID()); }
    const event = (await pool.query("SELECT id FROM order_event WHERE order_id=$1 AND type=$2", [checkout.orderId, kind])).rows[0]!;
    await createNotificationEventDispatcher({ pool, deploymentEnv: "test" }).dispatchNotificationEvent({ eventId: event.id, orderId: checkout.orderId });
    return (await pool.query("SELECT id,user_id,audience,required_permission FROM notification_message WHERE source_event_id=$1", [event.id])).rows;
  }
  function afterData(callback: () => Promise<void>): pg.Pool {
    return { connect: async () => { const q = await pool.connect(); return new Proxy(q, { get(target, key) {
      if (key === "query") return async (sql: string, values?: unknown[]) => { const result = await target.query(sql, values); if (sql.startsWith("SELECT n.id") && sql.includes("LIMIT")) await callback(); return result; };
      if (key === "release") return target.release.bind(target); return Reflect.get(target, key);
    } }); } } as unknown as pg.Pool;
  }
  beforeAll(async () => { isolated = await createIsolatedDatabase(databaseUrl!, migrationUrl!); pool = isolated.pool; }, 60000);
  afterAll(async () => { await isolated?.close(); }, 60000);
  beforeEach(async () => { await pool.query("DELETE FROM notification_message"); await pool.query('UPDATE "user" SET disabled=true'); fixture = await commerceFixture(pool); });
  it("pages beyond one hundred with deterministic ties and exact scoped decimal unread count", async () => {
    const ids = await legacy(fixture.customer, 125), first = await feed().listCustomerNotifications(fixture.customer, { pageSize: 100 }), second = await feed().listCustomerNotifications(fixture.customer, { page: 2, pageSize: 100 });
    expect(first).toMatchObject({ totalItems: 125, totalPages: 2, unreadCount: "125" }); expect(first.items).toHaveLength(100); expect(second.items).toHaveLength(25);
    expect([...first.items, ...second.items].map(row => row.id)).toEqual(ids.sort().reverse()); expect(Object.keys(first.items[0]!).sort()).toEqual(["body", "createdAt", "id", "kind", "orderId", "readAt", "title"]);
    const other = await fixture.actor("customer"); expect((await feed().listCustomerNotifications(other)).totalItems).toBe(0);
  });
  it("marks once, preserves its first readAt and keeps unread-only page/count consistent", async () => {
    const ids = await legacy(fixture.customer, 3), first = await feed().markNotificationRead(fixture.customer, ids[0]!, "customer");
    expect(await feed().markNotificationRead(fixture.customer, ids[0]!, "customer")).toEqual(first); expect(await feed().listCustomerNotifications(fixture.customer, { unreadOnly: true })).toMatchObject({ totalItems: 2, unreadCount: "2" });
    expect((await feed().getNotification(fixture.customer, ids[0]!, "customer")).readAt).toBe(first.readAt);
  });
  it("gives cross-user/missing GET and mark the same404 without changing another user's state", async () => {
    const ids = await legacy(fixture.customer), other = await fixture.actor("customer");
    for (const id of [ids[0]!, randomUUID()]) { await expect(feed().getNotification(other, id, "customer")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 }); await expect(feed().markNotificationRead(other, id, "customer")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 }); }
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [ids[0]])).rows[0]!.read_at).toBeNull();
  });
  it("separates customer/operator audiences even when both native actor fixtures use one user", async () => {
    const sessionId = randomUUID(); await pool.query("INSERT INTO session(id,user_id,token,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [sessionId, fixture.admin.userId, randomUUID()]);
    const customer: Actor = { userId: fixture.admin.userId, sessionId, kind: "customer" }, ids = await legacy(customer), rows = await routed(), operator = rows.find(row => row.user_id === fixture.admin.userId)!;
    expect((await feed().listCustomerNotifications(customer)).items.map(row => row.id)).toEqual(ids); expect((await feed().listOperatorNotifications(fixture.admin)).items.map(row => row.id)).toEqual([operator.id]);
    await expect(feed().getNotification(customer, operator.id, "customer")).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(feed().markNotificationRead(customer, operator.id, "customer")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("checks each required permission and hides old retained operator rows after role changes", async () => {
    const fulfill = (await routed()).find(row => row.user_id === fixture.admin.userId)!, refund = (await routed("refund.pending")).find(row => row.user_id === fixture.admin.userId)!;
    await roles(fixture.admin, ["fulfillment"]); expect((await feed().listOperatorNotifications(fixture.admin)).items.map(row => row.id)).toEqual([fulfill.id]);
    await expect(feed().getNotification(fixture.admin, refund.id, "operator")).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(feed().markNotificationRead(fixture.admin, refund.id, "operator")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await roles(fixture.admin, ["support"]); await expect(feed().listOperatorNotifications(fixture.admin)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 }); await expect(feed().getNotification(fixture.admin, fulfill.id, "operator")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await roles(fixture.admin, ["product_manager"]); await expect(feed().listOperatorNotifications(fixture.admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("permits an ordinary live grant older than five minutes and denies disabled MFA/orphan grants", async () => {
    await routed(); await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1", [fixture.admin.sessionId]); expect((await feed().listOperatorNotifications(fixture.admin)).totalItems).toBe(1);
    await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1', [fixture.admin.userId]); await expect(feed().listOperatorNotifications(fixture.admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.query('UPDATE "user" SET two_factor_enabled=true WHERE id=$1', [fixture.admin.userId]); await pool.query("DELETE FROM admin_grant WHERE session_id=$1", [fixture.admin.sessionId]); await expect(feed().listOperatorNotifications(fixture.admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("denies customer disabled/session-expired/phone-unverified states with401", async () => {
    await legacy(fixture.customer); await pool.query('UPDATE "user" SET phone_number_verified=false WHERE id=$1', [fixture.customer.userId]); await expect(feed().listCustomerNotifications(fixture.customer)).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    await pool.query('UPDATE "user" SET phone_number_verified=true,disabled=true WHERE id=$1', [fixture.customer.userId]); await expect(feed().listCustomerNotifications(fixture.customer)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await pool.query('UPDATE "user" SET disabled=false WHERE id=$1', [fixture.customer.userId]); await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [fixture.customer.sessionId]); await expect(feed().listCustomerNotifications(fixture.customer)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("discards a page when current permission changes outside its RR snapshot", async () => {
    await routed(); await expect(feed(afterData(() => roles(fixture.admin, ["support"]))).listOperatorNotifications(fixture.admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("discards collected customer data after disable outside its RR snapshot", async () => {
    await legacy(fixture.customer); await expect(feed(afterData(async () => { await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [fixture.customer.userId]); })).listCustomerNotifications(fixture.customer)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("denies a role revoked during an observed message-row wait with no read effect", async () => {
    const row = (await routed()).find(value => value.user_id === fixture.admin.userId)!, blocker = await pool.connect(); await blocker.query("BEGIN"); await blocker.query("SELECT id FROM notification_message WHERE id=$1 FOR UPDATE", [row.id]);
    const pending = feed().markNotificationRead(fixture.admin, row.id, "operator").then(value => ({ value }), error => ({ error }));
    try { await observeLock(pool, `TEST-isolated-${isolated.schema}`, "SELECT n.id%FOR UPDATE OF n"); await roles(fixture.admin, ["support"]); await blocker.query("COMMIT"); } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect(await pending).toMatchObject({ error: { code: "NOT_FOUND" } }); expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [row.id])).rows[0]!.read_at).toBeNull();
  });
  it("denies expiry during a real grant-row wait using wall clock and rolls readAt back", async () => {
    const row = (await routed()).find(value => value.user_id === fixture.admin.userId)!, blocker = await pool.connect(); await blocker.query("BEGIN"); await blocker.query("SELECT session_id FROM admin_grant WHERE session_id=$1 FOR UPDATE", [fixture.admin.sessionId]);
    // Preflight reads the old live row; the final shared proof waits for the committed expired row.
    const pending = feed().markNotificationRead(fixture.admin, row.id, "operator").then(value => ({ value }), error => ({ error }));
    try { await observeLock(pool, `TEST-isolated-${isolated.schema}`, "%FOR SHARE OF s,u,g"); await blocker.query("UPDATE admin_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [fixture.admin.sessionId]); await blocker.query("COMMIT"); } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect(await pending).toMatchObject({ error: { code: "FORBIDDEN" } }); expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [row.id])).rows[0]!.read_at).toBeNull();
  });
  it("denies a customer disabled during an observed message wait", async () => {
    const id = (await legacy(fixture.customer))[0]!, blocker = await pool.connect(); await blocker.query("BEGIN"); await blocker.query("SELECT id FROM notification_message WHERE id=$1 FOR UPDATE", [id]); const pending = feed().markNotificationRead(fixture.customer, id, "customer").then(value => ({ value }), error => ({ error }));
    try { await observeLock(pool, `TEST-isolated-${isolated.schema}`, "SELECT n.id%FOR UPDATE OF n"); await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [fixture.customer.userId]); await blocker.query("COMMIT"); } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect(await pending).toMatchObject({ error: { code: "UNAUTHENTICATED" } }); expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [id])).rows[0]!.read_at).toBeNull();
  });
  it("does not expose a mislinked different-owner order even in a recipient-owned customer row", async () => {
    const rows = await routed("order.created"), row = rows.find(value => value.user_id === fixture.customer.userId)!, other = await fixture.actor("customer");
    await pool.query("UPDATE notification_message SET user_id=$1 WHERE id=$2", [other.userId, row.id]);
    expect((await feed().listCustomerNotifications(other)).totalItems).toBe(0); await expect(feed().getNotification(other, row.id, "customer")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
