import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsStore, type AnalyticsLimits } from "../../../src/server/commerce/analytics";
import type { ReportPeriod } from "../../../src/contracts/reports";
import { createIsolatedDatabase } from "./isolated-database";
import { commerceFixture } from "./commerce-fixture";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
// Temporary rollout gate: no PG allocation until the coordinator opens the analytics window.
const enabled = process.env.ANONYMOUS_ANALYTICS_PG_TESTS === "true" && !!databaseUrl && !!migrationUrl;
describe.skipIf(!enabled)("isolated PostgreSQL anonymous analytics (not activated by discovery)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: pg.Pool, collector: pg.Pool;
  const search = (eventId = randomUUID()) => ({ eventId, kind: "search", hasQuery: true, resultBucket: "zero" });
  const store = (limits?: AnalyticsLimits, captureEnabled = true) => createAnalyticsStore({ pool: collector, enabled: () => captureEnabled, limits });
  async function publicProduct(status: "draft" | "published" | "archived" = "published", active = true) {
    const id = randomUUID();
    await pool.query("INSERT INTO product(id,name,slug,status) VALUES($1,'TEST analytics fixture',$2,$3)", [id, `test-analytics-${id}`, status]);
    await pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr,active) VALUES($1,$2,$3,50,10000,$4)", [randomUUID(), id, `TEST-ANALYTICS-${id}`, active]);
    return id;
  }
  async function report(subject = store(), override?: ReportPeriod) {
    const q = await pool.connect();
    try {
      await q.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const boundary = (await q.query<{ at: Date; day: string }>("SELECT clock_timestamp() AS at,(clock_timestamp() AT TIME ZONE 'Asia/Tehran')::date::text AS day")).rows[0]!;
      const value = await subject.getObservedPeriod(q, override ?? { fromDate: boundary.day, toDate: boundary.day, timeZone: "Asia/Tehran" }, boundary.at.toISOString());
      await q.query("COMMIT"); return value;
    } finally { await q.query("ROLLBACK"); q.release(); }
  }
  async function collectorState() { return {
    seen: (await pool.query("SELECT * FROM analytics_seen ORDER BY event_id")).rows,
    daily: (await pool.query("SELECT * FROM analytics_daily ORDER BY day,kind,dimension")).rows,
    quota: (await pool.query("SELECT * FROM analytics_quota ORDER BY minute")).rows,
    coverage: (await pool.query("SELECT * FROM analytics_coverage")).rows,
  }; }
  async function financeState() { return (await pool.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM orders o) AS orders,
    (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM payment_receipt r) AS receipts,
    (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY variant_id),'[]') FROM inventory_balance b) AS balances,
    (SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]') FROM outbox_job j) AS jobs`)).rows[0]!; }
  beforeAll(async () => {
    isolated = await createIsolatedDatabase(databaseUrl!, migrationUrl!); pool = isolated.pool;
    collector = new pg.Pool({ connectionString: pool.options.connectionString, max: 2, connectionTimeoutMillis: 200, application_name: `TEST-analytics-${isolated.schema}` });
    // Warm both independent collector connections; real runtime pool still enforces max2.
    const clients = await Promise.all([collector.connect(), collector.connect()]); for (const q of clients) q.release();
  }, 60000);
  afterAll(async () => { try { await collector?.end(); } finally { await isolated?.close(); } }, 60000);
  beforeEach(async () => {
    for (const table of ["analytics_seen", "analytics_daily", "analytics_quota"]) await pool.query(`DELETE FROM ${table}`);
    await pool.query("UPDATE analytics_coverage SET started_at=NULL,last_cleanup_at=NULL WHERE singleton");
  });
  it("has only four collector tables, no FK to business data and rejects unbounded/raw dimensions", async () => {
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename LIKE 'analytics_%' ORDER BY tablename", [isolated.schema])).rows;
    expect(tables.map(row => row.tablename)).toEqual(["analytics_coverage", "analytics_daily", "analytics_quota", "analytics_seen"]);
    expect((await pool.query("SELECT c.oid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname LIKE 'analytics_%' AND c.contype='f'", [isolated.schema])).rows).toHaveLength(0);
    await expect(pool.query("INSERT INTO analytics_seen VALUES($1,'TEST contact canary',clock_timestamp())", [randomUUID()])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("INSERT INTO analytics_daily(day,kind,dimension,count,first_accepted_at,last_accepted_at) SELECT (t AT TIME ZONE 'Asia/Tehran')::date,'search','query:TEST canary',1,t,t FROM (SELECT clock_timestamp() t) x")).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("INSERT INTO analytics_quota VALUES(date_trunc('minute',clock_timestamp()),2001)")).rejects.toMatchObject({ code: "23514" });
  });
  it("reports no fabricated activation/observations when enabled but no event was accepted", async () => {
    const result = await report();
    expect(result.observed).toEqual({ productView: "0", search: "0", addToCart: "0", zeroResultSearch: "0" });
    expect(result.coverage).toMatchObject({ captureEnabled: true, observedFrom: null, observedTo: null, retainedFrom: null, lastCleanupUtc: null, partialRetention: true, clientDelivery: "best_effort_unmeasured" });
    expect((await report(store(undefined, false))).coverage.captureEnabled).toBe(false);
  });
  it("counts global events once, not their product/search dimensions, and uses two report queries", async () => {
    const id = await publicProduct(), subject = store();
    await subject.captureBrowserEvent({ eventId: randomUUID(), kind: "product_view", productId: id });
    await subject.captureBrowserEvent({ eventId: randomUUID(), kind: "add_to_cart", productId: id });
    await subject.captureBrowserEvent(search()); await subject.captureBrowserEvent({ ...search(), hasQuery: false, resultBucket: "1_10" });
    const result = await report(); expect(result.observed).toEqual({ productView: "1", search: "2", addToCart: "1", zeroResultSearch: "1" });
    expect(result.coverage.observedFrom).not.toBeNull(); expect(result.coverage.observedTo).not.toBeNull();
    const q = await pool.connect();
    try {
      await q.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const boundary = (await q.query("SELECT clock_timestamp() AS at,(clock_timestamp() AT TIME ZONE 'Asia/Tehran')::date::text AS day")).rows[0]!;
      const spy = vi.spyOn(q, "query");
      try { await subject.getObservedPeriod(q, { fromDate: boundary.day, toDate: boundary.day, timeZone: "Asia/Tehran" }, boundary.at.toISOString()); expect(spy).toHaveBeenCalledTimes(2); }
      finally { spy.mockRestore(); }
    } finally { await q.query("ROLLBACK"); q.release(); }
    expect((await report(store(undefined, false))).observed).toEqual(result.observed);
  });
  it("keeps one event under simultaneous same-ID deliveries and neutral changed-payload replay", async () => {
    const subject = store(), event = search();
    const acks = await Promise.all(Array.from({ length: 12 }, () => subject.captureBrowserEvent(event))); expect(acks).toEqual(Array.from({ length: 12 }, () => ({ ok: true })));
    // A subsequent accepted request distinguishes a nonce replay from a lost admission.
    await subject.captureBrowserEvent(event);
    expect((await report()).observed.search).toBe("1"); expect((await pool.query("SELECT * FROM analytics_seen")).rows).toHaveLength(1);
    const before = (await collectorState()).daily;
    expect(await subject.captureBrowserEvent({ ...event, resultBucket: "over_100", hasQuery: false })).toEqual({ ok: true });
    expect((await collectorState()).daily).toEqual(before);
    expect((await pool.query("SELECT coalesce(sum(count),0)::integer AS count FROM analytics_quota")).rows[0]!.count).toBeGreaterThan(1);
  });
  it("uniformly ignores missing/draft/archived/inactive products without claiming their nonce", async () => {
    const subject = store(), before = await financeState();
    for (const productId of [randomUUID(), await publicProduct("draft"), await publicProduct("archived"), await publicProduct("published", false)]) expect(await subject.captureBrowserEvent({ eventId: randomUUID(), kind: "product_view", productId })).toEqual({ ok: true });
    expect((await collectorState()).seen).toHaveLength(0); expect((await collectorState()).daily).toHaveLength(0); expect((await report()).coverage.observedFrom).toBeNull(); expect(await financeState()).toEqual(before);
  });
  it("bounds concurrent minute quota and charges replay requests without counting them twice", async () => {
    const subject = store({ globalPerMinute: 3 });
    await Promise.all(Array.from({ length: 12 }, () => subject.captureBrowserEvent(search())));
    const minutes = (await pool.query<{ count: number }>("SELECT count FROM analytics_quota")).rows;
    expect(minutes.length).toBeGreaterThan(0); for (const minute of minutes) expect(minute.count).toBeLessThanOrEqual(3);
    expect(BigInt((await report()).observed.search)).toBeLessThanOrEqual(BigInt(minutes.length * 3));
    await pool.query("DELETE FROM analytics_seen"); await pool.query("DELETE FROM analytics_daily"); await pool.query("DELETE FROM analytics_quota");
    const limited = store({ globalPerMinute: 2 }), event = search();
    await limited.captureBrowserEvent(event); await limited.captureBrowserEvent(event); await limited.captureBrowserEvent(search());
    expect((await report()).observed.search).toBe("1"); expect((await pool.query("SELECT count FROM analytics_quota")).rows).toEqual([{ count: 2 }]);
  });
  it("bounds distinct product dimensions across kinds and marks global-only overflow", async () => {
    const subject = store({ productDimensionsPerDay: 2 }), products = await Promise.all([publicProduct(), publicProduct(), publicProduct()]);
    for (const productId of products) await subject.captureBrowserEvent({ eventId: randomUUID(), kind: "product_view", productId });
    await subject.captureBrowserEvent({ eventId: randomUUID(), kind: "add_to_cart", productId: products[0] });
    expect((await pool.query("SELECT DISTINCT dimension FROM analytics_daily WHERE dimension LIKE 'p:%'")).rows).toHaveLength(2);
    expect(await report()).toMatchObject({ observed: { productView: "3", addToCart: "1" }, coverage: { productDimensionsTruncated: true } });
  });
  it("serializes two competing new product dimensions without increasing the daily ceiling", async () => {
    const subject = store({ productDimensionsPerDay: 1 }), products = await Promise.all([publicProduct(), publicProduct()]);
    const events = products.map(productId => ({ eventId: randomUUID(), kind: "product_view", productId }));
    await Promise.all(events.map(event => subject.captureBrowserEvent(event)));
    expect((await pool.query("SELECT DISTINCT dimension FROM analytics_daily WHERE dimension LIKE 'p:%'")).rows.length).toBeLessThanOrEqual(1);
    // Best-effort admission may drop a lock-timeout contender; one same-ID follow-up is explicit.
    for (const event of events) await subject.captureBrowserEvent(event);
    expect((await pool.query("SELECT DISTINCT dimension FROM analytics_daily WHERE dimension LIKE 'p:%'")).rows).toHaveLength(1);
    expect(await report()).toMatchObject({ observed: { productView: "2" }, coverage: { productDimensionsTruncated: true } });
  });
  it("reuses only expired dedup keys even if physical deletion has not happened", async () => {
    const subject = store(), event = search(); await subject.captureBrowserEvent(event);
    // The native pg Date clock has millisecond precision; keep this fixture unambiguously expired.
    const expired = await pool.query("UPDATE analytics_seen SET expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1", [event.eventId]);
    expect(expired.rowCount).toBe(1); // The existing dedup row remains physically present before reuse.
    await subject.captureBrowserEvent({ ...event, resultBucket: "1_10" });
    expect((await report()).observed).toMatchObject({ search: "2", zeroResultSearch: "1" });
    expect((await pool.query("SELECT event_id FROM analytics_seen")).rows).toHaveLength(1);
  });
  it("keeps one snapshot while later capture commits, with actual accepted timestamp bounds", async () => {
    const subject = store(); await subject.captureBrowserEvent(search()); const q = await pool.connect();
    try {
      await q.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const boundary = (await q.query("SELECT clock_timestamp() AS at,(clock_timestamp() AT TIME ZONE 'Asia/Tehran')::date::text AS day")).rows[0]!;
      await subject.captureBrowserEvent(search());
      const result = await subject.getObservedPeriod(q, { fromDate: boundary.day, toDate: boundary.day, timeZone: "Asia/Tehran" }, boundary.at.toISOString());
      expect(result.observed.search).toBe("1"); expect(Date.parse(result.coverage.observedTo!)).toBeLessThanOrEqual(boundary.at.getTime());
    } finally { await q.query("ROLLBACK"); q.release(); }
    expect((await report()).observed.search).toBe("2");
  });
  it("uses Tehran midnight and logical thirty-day retention before physical cleanup", async () => {
    const boundary = (await pool.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tehran')::date::text AS day,((clock_timestamp() AT TIME ZONE 'Asia/Tehran')::date::timestamp AT TIME ZONE 'Asia/Tehran') AS midnight")).rows[0]!;
    const midnight: Date = boundary.midnight, previous = new Date(midnight.getTime() - 1), older = new Date(midnight.getTime() - 30 * 86400000);
    for (const [at, count] of [[previous, "2"], [midnight, "3"], [older, "999"]] as const) await pool.query("INSERT INTO analytics_daily(day,kind,dimension,count,first_accepted_at,last_accepted_at) VALUES(($1::timestamptz AT TIME ZONE 'Asia/Tehran')::date,'search','all',$2,$1,$1)", [at, count]);
    await pool.query("UPDATE analytics_coverage SET started_at=$1", [older]);
    const fromDate = (await pool.query("SELECT ($1::timestamptz AT TIME ZONE 'Asia/Tehran')::date::text AS day", [older])).rows[0]!.day;
    const result = await report(store(), { fromDate, toDate: boundary.day, timeZone: "Asia/Tehran" });
    expect(result.observed.search).toBe("5"); expect(result.coverage).toMatchObject({ partialRetention: true, cleanupPending: true, observedFrom: previous.toISOString(), observedTo: midnight.toISOString() });
    expect(result.coverage.retainedFrom).toBe(new Date(midnight.getTime() - 29 * 86400000).toISOString());
  });
  it("limits physical cleanup to five hundred rows per table and exposes the remaining backlog", async () => {
    const ids = Array.from({ length: 501 }, () => randomUUID());
    await pool.query("INSERT INTO analytics_seen(event_id,fingerprint,expires_at) SELECT id,repeat('0',64),clock_timestamp()-interval '1 hour' FROM unnest($1::uuid[]) id", [ids]);
    await pool.query("INSERT INTO analytics_quota SELECT date_trunc('minute',clock_timestamp())-interval '3 hours'-n*interval '1 minute',1 FROM generate_series(1,501) n");
    await pool.query("INSERT INTO analytics_daily(day,kind,dimension,count,first_accepted_at,last_accepted_at) SELECT (t AT TIME ZONE 'Asia/Tehran')::date,'product_view','p:'||id::text,1,t,t FROM unnest($1::uuid[]) id CROSS JOIN (SELECT clock_timestamp()-interval '31 days' t) x", [ids]);
    await store().captureBrowserEvent(search());
    const first = await store().cleanupExpired(); expect(first).toEqual({ seenDeleted: 500, quotaDeleted: 500, dailyDeleted: 500, expiredRowsPending: true });
    expect((await report()).coverage).toMatchObject({ cleanupPending: true, lastCleanupUtc: expect.any(String) });
    expect(await store().cleanupExpired()).toEqual({ seenDeleted: 1, quotaDeleted: 1, dailyDeleted: 1, expiredRowsPending: false });
    expect((await report()).observed.search).toBe("1");
  });
  it("skips an expired row held by another cleanup and reports it until a later confirmed deletion", async () => {
    const ids = [randomUUID(), randomUUID()];
    await pool.query("INSERT INTO analytics_seen SELECT id,repeat('0',64),clock_timestamp()-interval '1 hour' FROM unnest($1::uuid[]) id", [ids]);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT 1 FROM analytics_seen WHERE event_id=$1 FOR UPDATE", [ids[0]]);
      expect(await store().cleanupExpired(1)).toEqual({ seenDeleted: 1, quotaDeleted: 0, dailyDeleted: 0, expiredRowsPending: true });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect(await store().cleanupExpired(1)).toEqual({ seenDeleted: 1, quotaDeleted: 0, dailyDeleted: 0, expiredRowsPending: false });
  });
  it("rolls a counter overflow back without retaining a nonce/quota or mutating financial evidence", async () => {
    const subject = store(); await subject.captureBrowserEvent(search());
    await pool.query("UPDATE analytics_daily SET count=9223372036854775807 WHERE dimension='all'");
    const before = await collectorState(), finance = await financeState(), event = search();
    expect(await subject.captureBrowserEvent(event)).toEqual({ ok: true }); expect(await collectorState()).toEqual(before); expect(await financeState()).toEqual(finance);
    expect((await pool.query("SELECT event_id FROM analytics_seen WHERE event_id=$1", [event.eventId])).rows).toHaveLength(0);
  });
  it("allows a real new durable checkout while collector counters are locked and capture times out", async () => {
    // Controlled valid account/grant fixtures exercise domain independence, not native authentication.
    const fixture = await commerceFixture(pool), cart = await fixture.cart(), subject = store(); await subject.captureBrowserEvent(search());
    const blocker = await pool.connect(), before = await collectorState();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT 1 FROM analytics_daily WHERE dimension='all' FOR UPDATE");
      const [ack, checkout] = await Promise.all([subject.captureBrowserEvent(search()), fixture.commerce.createCheckout(fixture.customer, cart.guestToken, cart.input, cart.key)]);
      expect(ack).toEqual({ ok: true }); expect(checkout.orderId).toMatch(/^[0-9a-f-]{36}$/);
      expect(await collectorState()).toEqual(before); expect((await pool.query("SELECT count(*)::integer AS count FROM orders WHERE id=$1", [checkout.orderId])).rows[0]!.count).toBe(1);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
});
