import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsStore, parseBrowserAnalyticsInput } from "../../../src/server/commerce/analytics";

const search = () => ({ eventId: randomUUID(), kind: "search", hasQuery: true, resultBucket: "zero" });
function poolStub(connect = vi.fn().mockRejectedValue(new Error("TEST private canary must never escape"))) {
  return { options: { max: 2 }, connect } as unknown as Pool;
}
afterEach(() => vi.useRealTimers());
describe("anonymous analytics boundary without a database", () => {
  it("normalizes UUID case and returns only the supported product/search fields", () => {
    const eventId = randomUUID().toUpperCase(), productId = randomUUID().toUpperCase();
    expect(parseBrowserAnalyticsInput({ eventId, kind: "product_view", productId })).toEqual({ eventId: eventId.toLowerCase(), kind: "product_view", productId: productId.toLowerCase() });
    expect(parseBrowserAnalyticsInput({ eventId, kind: "add_to_cart", productId })).toEqual({ eventId: eventId.toLowerCase(), kind: "add_to_cart", productId: productId.toLowerCase() });
    for (const hasQuery of [false, true]) for (const resultBucket of ["zero", "1_10", "11_100", "over_100"]) expect(parseBrowserAnalyticsInput({ eventId, kind: "search", hasQuery, resultBucket })).toEqual({ eventId: eventId.toLowerCase(), kind: "search", hasQuery, resultBucket });
  });
  it.each(["query", "ip", "userAgent", "url", "referrer", "cookie", "userId", "sessionId", "cartId", "orderId", "phone", "address", "amountIrr", "providerReference", "at", "payload"])("rejects forbidden %s metadata before touching a pool or exposing its canary", async field => {
    const pool = poolStub(), store = createAnalyticsStore({ pool, enabled: () => true });
    await expect(store.captureBrowserEvent({ ...search(), [field]: "TEST private canary" })).rejects.toMatchObject({ code: "VALIDATION", message: "رویداد تحلیلی معتبر نیست." });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it.each(["checkout_started", "payment_verified", "order_completed", "refund", "other"])("rejects forged authoritative event %s", kind => {
    expect(() => parseBrowserAnalyticsInput({ eventId: randomUUID(), kind })).toThrow(expect.objectContaining({ code: "VALIDATION" }));
  });
  it("rejects malformed values, nested/coercible inputs and non-v4 identifiers", () => {
    for (const input of [null, [], "{}", new Date(), { ...search(), eventId: "00000000-0000-1000-8000-000000000000" }, { ...search(), eventId: " "+randomUUID() }, { ...search(), hasQuery: "true" }, { ...search(), resultBucket: "0" }, { eventId: randomUUID(), kind: "product_view", productId: { toString: () => randomUUID() } }, { eventId: randomUUID(), kind: "product_view", productId: "00000000-0000-4000-7000-000000000000" }]) expect(() => parseBrowserAnalyticsInput(input)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
  });
  it("does not execute getters or accept symbols, hidden fields or custom prototypes", () => {
    const getter = vi.fn(() => "TEST private canary"), value = search();
    Object.defineProperty(value, "query", { get: getter, enumerable: true });
    expect(() => parseBrowserAnalyticsInput(value)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(getter).not.toHaveBeenCalled();
    for (const input of [Object.assign(Object.create({ query: "canary" }), search()), { ...search(), [Symbol("query")]: "canary" }, Object.defineProperty(search(), "query", { value: "canary", enumerable: false })]) expect(() => parseBrowserAnalyticsInput(input)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(parseBrowserAnalyticsInput(Object.assign(Object.create(null), search())).kind).toBe("search");
  });
  it("requires a dedicated max-two pool and permits only reduced internal limits", () => {
    for (const max of [undefined, 1, 3, 10]) expect(() => createAnalyticsStore({ pool: { ...poolStub(), options: { max } } as unknown as Pool, enabled: () => true })).toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
    for (const limit of [0, -1, 1.1, NaN, Infinity, 2001]) expect(() => createAnalyticsStore({ pool: poolStub(), enabled: () => true, limits: { globalPerMinute: limit } })).toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
    expect(() => createAnalyticsStore({ pool: poolStub(), enabled: () => true, limits: { productDimensionsPerDay: 10001 } })).toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
    expect(() => createAnalyticsStore({ pool: poolStub(), enabled: () => false, limits: { globalPerMinute: 1, productDimensionsPerDay: 1 } })).not.toThrow();
  });
  it("acknowledges disabled capture without connecting, but still validates input", async () => {
    const pool = poolStub(), store = createAnalyticsStore({ pool, enabled: () => false });
    expect(await store.captureBrowserEvent(search())).toEqual({ ok: true });
    await expect(store.captureBrowserEvent({ ...search(), query: "canary" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("makes outages and invalid enablement neutral and gives cleanup no false completion proof", async () => {
    const store = createAnalyticsStore({ pool: poolStub(), enabled: () => true });
    expect(await store.captureBrowserEvent(search())).toEqual({ ok: true });
    expect(await store.cleanupExpired()).toEqual({ seenDeleted: 0, quotaDeleted: 0, dailyDeleted: 0, expiredRowsPending: true });
    const misconfigured = createAnalyticsStore({ pool: poolStub(), enabled: () => "true" as unknown as boolean });
    expect(await misconfigured.captureBrowserEvent(search())).toEqual({ ok: true });
    await expect(misconfigured.getObservedPeriod({ query: vi.fn() } as unknown as PoolClient, { fromDate: "2026-10-01", toDate: "2026-10-01", timeZone: "Asia/Tehran" }, "2026-10-02T00:00:00Z")).rejects.toMatchObject({ code: "CONFIGURATION" });
  });
  it("rejects invalid report periods/as-of or cleanup bounds without querying", async () => {
    const store = createAnalyticsStore({ pool: poolStub(), enabled: () => false }), q = { query: vi.fn() } as unknown as PoolClient;
    for (const [fromDate, toDate] of [["2026-02-30", "2026-03-01"], ["2026-10-02", "2026-10-01"], ["2025-01-01", "2026-01-02"]]) await expect(store.getObservedPeriod(q, { fromDate: fromDate!, toDate: toDate!, timeZone: "Asia/Tehran" }, "2026-10-02T00:00:00Z")).rejects.toMatchObject({ code: "VALIDATION" });
    for (const asOf of ["2026-02-30T01:00:00Z", "2026-10-02T24:00:00Z", "2026-10-02T00:00:00+03:30", "not a date"]) await expect(store.getObservedPeriod(q, { fromDate: "2026-10-01", toDate: "2026-10-01", timeZone: "Asia/Tehran" }, asOf)).rejects.toMatchObject({ code: "VALIDATION" });
    for (const batch of [0, 501, 1.5, NaN]) await expect(store.cleanupExpired(batch)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(q.query).not.toHaveBeenCalled();
  });
  it("releases a late acquired connection after the bounded wait without running SQL", async () => {
    vi.useFakeTimers();
    let supply!: (client: PoolClient) => void;
    const connect = vi.fn(() => new Promise<PoolClient>(resolve => { supply = resolve; })), client = { query: vi.fn(), release: vi.fn() } as unknown as PoolClient;
    const result = createAnalyticsStore({ pool: poolStub(connect), enabled: () => true }).captureBrowserEvent(search());
    await vi.advanceTimersByTimeAsync(201);
    expect(await result).toEqual({ ok: true });
    supply(client); await Promise.resolve(); await Promise.resolve();
    expect(client.release).toHaveBeenCalledTimes(1); expect(client.query).not.toHaveBeenCalled();
  });
  it("bounds simultaneous store work at two and drops beyond fifty waiting calls", async () => {
    let open!: () => void;
    const barrier = new Promise<void>(resolve => { open = resolve; });
    let connected = 0, maximum = 0;
    const connect = vi.fn(async () => {
      connected++; maximum = Math.max(maximum, connected);
      const query = vi.fn(async () => { await barrier; return { rows: [{ at: new Date(), minute: new Date(), day: "2026-10-13", ordinal: 20739, cutoff: "2026-09-14" }], rowCount: 0 }; });
      return { query, release: () => { connected--; } } as unknown as PoolClient;
    });
    const store = createAnalyticsStore({ pool: poolStub(connect), enabled: () => true });
    const results = Array.from({ length: 53 }, () => store.captureBrowserEvent(search()));
    expect(await results[52]).toEqual({ ok: true }); expect(connect).toHaveBeenCalledTimes(2);
    open(); expect(await Promise.all(results)).toHaveLength(53); expect(maximum).toBe(2); expect(connected).toBe(0);
  });
});
