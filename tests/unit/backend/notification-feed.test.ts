import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../src/contracts/commerce";
import { createNotificationFeed, parseNotificationPageInput } from "../../../src/server/commerce/notification-feed";

const actor = (kind: Actor["kind"] = "customer"): Actor => ({ userId: randomUUID(), sessionId: randomUUID(), kind });
const poolStub = (q?: PoolClient) => ({ connect: q ? vi.fn().mockResolvedValue(q) : vi.fn().mockRejectedValue(new Error("TEST private canary")) }) as unknown as Pool;
describe("notification feed privacy boundary without PG", () => {
  it("defaults bounded paging and preserves explicit unread=false", () => {
    expect(parseNotificationPageInput()).toEqual({ page: 1, pageSize: 25, unreadOnly: false }); expect(parseNotificationPageInput({ page: 2, pageSize: 100, unreadOnly: true })).toEqual({ page: 2, pageSize: 100, unreadOnly: true });
  });
  it.each([null, [], { page: null }, { unreadOnly: null }, { page: "1" }, { page: 0 }, { page: 1.5 }, { page: 1000001 }, { pageSize: 101 }, { unreadOnly: "false" }, { recipient: "TEST canary" }])("rejects invalid/private paging input %#", input => {
    expect(() => parseNotificationPageInput(input)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
  });
  it("does not execute paging getters or accept symbols/prototypes", () => {
    const getter = vi.fn(() => 1), value = Object.defineProperty({}, "page", { get: getter, enumerable: true });
    for (const input of [value, { [Symbol("secret")]: "canary" }, Object.create({ page: 1 })]) expect(() => parseNotificationPageInput(input)).toThrow(expect.objectContaining({ code: "VALIDATION" })); expect(getter).not.toHaveBeenCalled();
  });
  it("does not let a customer principal request operator rows or admin request the customer audience", async () => {
    const pool = poolStub(), feed = createNotificationFeed({ pool });
    await expect(feed.listOperatorNotifications(actor())).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(feed.listCustomerNotifications(actor("admin"))).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(pool.connect).not.toHaveBeenCalled();
  });
  it("gives malformed object IDs the same generic missing result without a DB query", async () => {
    const pool = poolStub(), feed = createNotificationFeed({ pool });
    await expect(feed.getNotification(actor(), "TEST private canary", "customer")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 }); await expect(feed.markNotificationRead(actor(), "bad", "customer")).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(pool.connect).not.toHaveBeenCalled();
  });
  it("does not fabricate an empty authorized feed when the database is unavailable", async () => {
    await expect(createNotificationFeed({ pool: poolStub() }).listCustomerNotifications(actor())).rejects.toMatchObject({ code: "CONFIGURATION", status: 503, message: "اطلاعات اعلان‌ها در دسترس نیست." });
  });
  it("withholds a collected customer page after its final current proof is lost", async () => {
    let proofs = 0;
    const q = { query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM session s JOIN "user"')) return { rows: proofs++ === 0 ? [{ id: "TEST" }] : [], rowCount: proofs === 1 ? 1 : 0 };
      if (sql.includes(" AS total")) return { rows: [{ total: "1", unread: "1" }], rowCount: 1 };
      if (sql.startsWith("SELECT n.id")) return { rows: [{ id: randomUUID(), kind: "legacy.order_update", title: "TEST private record", body: "TEST", order_id: null, created_at: new Date(), read_at: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }), release: vi.fn() } as unknown as PoolClient;
    await expect(createNotificationFeed({ pool: poolStub(q) }).listCustomerNotifications(actor())).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 }); expect(q.release).toHaveBeenCalledTimes(1);
  });
});
