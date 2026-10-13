import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../src/contracts/commerce";
import { createAnalyticsReportStore } from "../../../src/server/analytics-report";

const actor: Actor = { kind: "admin", userId: "test-admin", sessionId: "test-session" };
function fixture() {
  let released = false;
  const snapshot = new Date("2026-10-12T21:00:00.123Z");
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT clock_timestamp()")) return { rows: [{ asOf: snapshot }] };
    if (sql.startsWith("WITH bounds")) return { rows: [{ started: "9007199254740993", verified: "4", primary: "2", completed: "3", cohortPrimary: "1", cohortDelivered: "1", privateCanary: "never-export" }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn(() => { released = true; }) };
  const database = { connect: vi.fn(async () => client) } as unknown as Pool;
  const observed = {
    coverage: { captureEnabled: true, clientCounts: "advisory" as const, clientDelivery: "best_effort_unmeasured" as const, retentionDays: 30 as const, observedFrom: null, observedTo: null, retainedFrom: null, partialRetention: true, productDimensionsTruncated: false, lastCleanupUtc: null, cleanupPending: false },
    observed: { productView: "12", search: "7", addToCart: "5", zeroResultSearch: "2" },
  };
  const getObservedPeriod = vi.fn(async () => observed);
  const authorizeCurrent = vi.fn(async () => {});
  const store = createAnalyticsReportStore({ database, observations: { getObservedPeriod }, authorizeCurrent });
  return { database, client, getObservedPeriod, authorizeCurrent, store, observed, snapshot, released: () => released };
}
describe("analytics report fresh authorization and snapshot boundary", () => {
  it("preserves BIGINT counts and separates anonymous totals from server cohort", async () => {
    const f = fixture();
    const result = await f.store.getAnalytics(actor, { from: "2026-10-01", to: "2026-10-12" });
    expect(result.server).toEqual({ checkoutStarted: "9007199254740993", verifiedReceipts: "4", primaryPaidOrders: "2", completedOrders: "3" });
    expect(result.cohort).toEqual({ basis: "orders_started_in_period", asOf: f.snapshot.toISOString(), started: "9007199254740993", primaryPaid: "1", delivered: "1" });
    expect(result.observed).toEqual(f.observed.observed);
    expect(JSON.stringify(result)).not.toContain("never-export");
    expect(f.getObservedPeriod).toHaveBeenCalledWith(f.client, result.period, f.snapshot.toISOString());
    expect(f.authorizeCurrent).toHaveBeenCalledTimes(2);
  });
  it("rejects a revoked grant before allocating a data connection", async () => {
    const f = fixture(); f.authorizeCurrent.mockRejectedValueOnce(new Error("revoked"));
    await expect(f.store.getAnalytics(actor, {})).rejects.toThrow("revoked");
    expect(f.database.connect).not.toHaveBeenCalled();
    expect(f.getObservedPeriod).not.toHaveBeenCalled();
  });
  it("withholds already-read counts if authorization is revoked during the snapshot", async () => {
    const f = fixture(); let revoked = false;
    f.authorizeCurrent.mockImplementation(async () => { if (revoked) throw new Error("revoked-current"); });
    f.getObservedPeriod.mockImplementation(async () => { revoked = true; return f.observed; });
    await expect(f.store.getAnalytics(actor, {})).rejects.toThrow("revoked-current");
    expect(f.client.release).toHaveBeenCalledOnce();
    expect(f.authorizeCurrent).toHaveBeenCalledTimes(2);
  });
  it("releases the data client before the fresh final permission check", async () => {
    const f = fixture(); let checks = 0;
    f.authorizeCurrent.mockImplementation(async () => { checks++; if (checks === 2 && !f.released()) throw new Error("data-client-not-released"); });
    await expect(f.store.getAnalytics(actor, {})).resolves.toMatchObject({ cohort: { basis: "orders_started_in_period" } });
  });
  it("does not fabricate zeros or export a partial report on observation failure", async () => {
    const f = fixture(); f.getObservedPeriod.mockRejectedValueOnce(new Error("capture-tables-unavailable"));
    await expect(f.store.getAnalytics(actor, {})).rejects.toThrow("capture-tables-unavailable");
    expect(f.client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(f.client.release).toHaveBeenCalledOnce();
    expect(f.authorizeCurrent).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed or oversized date periods before any privilege/data query", async () => {
    for (const period of [{ from: "2026-02-30" }, { from: "2024-01-01", to: "2026-01-01" }, { from: "2026-10-12", to: "2026-10-01" }, { from: "2026-10-01", customerId: "never-export" }]) {
      const f = fixture(); await expect(f.store.getAnalytics(actor, period)).rejects.toThrow();
      expect(f.authorizeCurrent).not.toHaveBeenCalled(); expect(f.database.connect).not.toHaveBeenCalled();
    }
  });
});
