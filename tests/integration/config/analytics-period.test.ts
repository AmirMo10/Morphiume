import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAnalyticsReportStore } from "../../../src/server/analytics-report";
import { createAnalyticsAuthorizer } from "../../../src/server/analytics-access";
import { createAnalyticsStore } from "../../../src/server/commerce/analytics";
import { createIsolatedDatabase } from "../backend/isolated-database";
import { commerceFixture } from "../backend/commerce-fixture";
import { observationalBaseline } from "../backend/observational-baseline";

config({ path: ".env.local", quiet: true });
const runtimeUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled = process.env.ANONYMOUS_ANALYTICS_PG_TESTS === "true" && !!runtimeUrl && !!migrationUrl;

describe.skipIf(!enabled)("real PostgreSQL analytics period, cohort and fresh domain grant (not native login)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: pg.Pool, collector: pg.Pool;
  let fixture: Awaited<ReturnType<typeof commerceFixture>>;
  let observations: ReturnType<typeof createAnalyticsStore>;
  let before: Awaited<ReturnType<typeof observationalBaseline>>;
  let paidDelivered: Awaited<ReturnType<typeof fixture.purchase>>;
  function report(source = observations) {
    return createAnalyticsReportStore({ database: pool, observations: source, authorizeCurrent: createAnalyticsAuthorizer(pool) });
  }
  async function eventAt(orderId: string, type: string, at: string) {
    await pool.query("UPDATE order_event SET created_at=$3::timestamptz WHERE order_id=$1 AND type=$2", [orderId, type, at]);
  }
  beforeAll(async () => {
    before = await observationalBaseline();
    isolated = await createIsolatedDatabase(runtimeUrl!, migrationUrl!); pool = isolated.pool;
    fixture = await commerceFixture(pool);
    collector = new pg.Pool({ connectionString: pool.options.connectionString, max: 2, connectionTimeoutMillis: 200 });
    observations = createAnalyticsStore({ pool: collector, enabled: () => true });
    // Durable commerce flows first. Chronological edge timestamps below are
    // synthetic fixture edits solely inside this generated test schema.
    paidDelivered = await fixture.purchase(true);
    const oldStarted = await fixture.purchase(false), edgePaid = await fixture.purchase(false);
    const cart = await fixture.cart(), edgePending = await fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key);
    await eventAt(paidDelivered.checkout.orderId, "order.created", "2026-10-05T00:00:00Z");
    await eventAt(paidDelivered.checkout.orderId, "shipment.delivered", "2026-10-06T01:00:00Z");
    await eventAt(oldStarted.checkout.orderId, "order.created", "2026-10-04T00:00:00Z");
    await eventAt(edgePaid.checkout.orderId, "order.created", "2026-10-05T20:29:59.999999Z");
    await eventAt(edgePending.orderId, "order.created", "2026-10-05T20:30:00Z");
    for (const [orderId, at] of [[paidDelivered.checkout.orderId, "2026-10-06T00:00:00Z"], [oldStarted.checkout.orderId, "2026-10-05T00:00:00Z"], [edgePaid.checkout.orderId, "2026-10-05T20:30:00Z"]]) {
      await pool.query("UPDATE payment_receipt SET created_at=$2::timestamptz WHERE order_id=$1", [orderId, at]);
    }
    for (const [disposition, at] of [["extra", "2026-10-05T03:00:00Z"], ["inventory_exception", "2026-10-05T04:00:00Z"]]) {
      await pool.query(`INSERT INTO payment_receipt(id,attempt_id,order_id,provider,merchant_key,provider_ref,amount_irr,currency,disposition,created_at)
        SELECT $1,attempt_id,order_id,provider,merchant_key,$2,amount_irr,currency,$3,$4::timestamptz FROM payment_receipt WHERE order_id=$5 AND disposition='primary'`, [randomUUID(), `TEST-${randomUUID()}`, disposition, at, oldStarted.checkout.orderId]);
    }
    await pool.query("INSERT INTO order_event(id,order_id,event_key,type,created_at) VALUES($1,$2,$3,'order.created','2026-10-05T05:00:00Z'),($4,$2,$5,'shipment.delivered','3000-01-01T00:00:00Z')", [randomUUID(), paidDelivered.checkout.orderId, `TEST-${randomUUID()}`, randomUUID(), `TEST-${randomUUID()}`]);
  }, 120000);
  afterAll(async () => {
    try { await collector?.end(); await isolated?.close(); }
    finally { if (before) expect(await observationalBaseline()).toEqual(before); }
  }, 60000);
  it("uses Tehran inclusive-day boundaries and distinct durable orders, counting every receipt disposition", async () => {
    const beforeClock = (await pool.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0]!.at;
    const value = await report().getAnalytics(fixture.admin, { from: "2026-10-05", to: "2026-10-05" });
    const afterClock = (await pool.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0]!.at;
    expect(value.server).toEqual({ checkoutStarted: "2", verifiedReceipts: "3", primaryPaidOrders: "1", completedOrders: "0" });
    expect(value.cohort).toMatchObject({ basis: "orders_started_in_period", started: "2", primaryPaid: "2", delivered: "1" });
    expect(value.observed).toEqual({ productView: "0", search: "0", addToCart: "0", zeroResultSearch: "0" });
    expect(Date.parse(value.cohort.asOf)).toBeGreaterThanOrEqual(beforeClock.getTime());
    expect(Date.parse(value.cohort.asOf)).toBeLessThanOrEqual(afterClock.getTime());
  });
  it("separates started cohort from payments/deliveries occurring in the selected day", async () => {
    const value = await report().getAnalytics(fixture.admin, { from: "2026-10-06", to: "2026-10-06" });
    expect(value.server).toEqual({ checkoutStarted: "1", verifiedReceipts: "2", primaryPaidOrders: "2", completedOrders: "1" });
    expect(value.cohort).toMatchObject({ started: "1", primaryPaid: "0", delivered: "0" });
  });
  it("combines anonymous advisory observations without changing durable financial counts", async () => {
    const period = { from: "2026-10-01", to: "2026-10-31" };
    const first = await report().getAnalytics(fixture.admin, period);
    const observation = { eventId: randomUUID(), kind: "search", hasQuery: true, resultBucket: "zero" };
    await observations.captureBrowserEvent(observation); await observations.captureBrowserEvent(observation);
    const next = await report().getAnalytics(fixture.admin, period);
    expect(next.server).toEqual(first.server); expect(next.cohort.started).toBe(first.cohort.started);
    expect(BigInt(next.observed.search) - BigInt(first.observed.search)).toBe(1n);
    expect(next.coverage).toMatchObject({ clientCounts: "advisory", clientDelivery: "best_effort_unmeasured", captureEnabled: true });
    expect(JSON.stringify(next)).not.toContain(fixture.customer.userId);
  });
  it("denies customers and current support roles while allowing the separate analytics permission", async () => {
    await expect(report().getAnalytics(fixture.customer, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const role of ["product_manager", "finance", "support"] as const) {
      await pool.query("UPDATE role_membership SET role=$2 WHERE user_id=$1", [fixture.admin.userId, role]);
      try {
        if (role === "support") await expect(report().getAnalytics(fixture.admin, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
        else await expect(report().getAnalytics(fixture.admin, {})).resolves.toHaveProperty("server");
      } finally { await pool.query("UPDATE role_membership SET role='owner' WHERE user_id=$1", [fixture.admin.userId]); }
    }
  });
  it("withholds a real already-read snapshot if current grant expires before final authorization", async () => {
    const scoped = report({ ...observations, async getObservedPeriod(...args) {
      const result = await observations.getObservedPeriod(...args);
      await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [fixture.admin.sessionId]);
      return result;
    } });
    try { await expect(scoped.getAnalytics(fixture.admin, {})).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()+interval '1 hour' WHERE session_id=$1", [fixture.admin.sessionId]); }
  });
  it.each(["disabled", "factor", "session"])("denies fresh%s state and restores only owned fixtures", async mode => {
    if (mode === "session") await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [fixture.admin.sessionId]);
    else await pool.query(`UPDATE "user" SET ${mode === "disabled" ? "disabled=true" : "two_factor_enabled=false"} WHERE id=$1`, [fixture.admin.userId]);
    try { await expect(report().getAnalytics(fixture.admin, {})).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally {
      if (mode === "session") await pool.query("UPDATE session SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", [fixture.admin.sessionId]);
      else await pool.query('UPDATE "user" SET disabled=false,two_factor_enabled=true WHERE id=$1', [fixture.admin.userId]);
    }
  });
});
