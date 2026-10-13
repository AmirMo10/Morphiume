import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { Commerce } from "../../../src/server/commerce/service";
import { createJobs } from "../../../src/server/jobs/service";

const commerce = () => ({ expireReservations: vi.fn().mockResolvedValue(0), initializeAttempt: vi.fn(), reconcileAttempt: vi.fn() }) as unknown as Commerce;
function queue(type = "notification.event", payload: Record<string, unknown> = { eventId: randomUUID(), orderId: randomUUID() }) {
  const job = { id: randomUUID(), type, payload, dedupe_key: `TEST:${randomUUID()}`, attempts: 1 }; let claimed = false;
  const query = vi.fn(async (...args: [sql: string, values?: unknown[]]) => {
    const [sql] = args;
    if (sql.startsWith("UPDATE outbox_job SET status='running'")) { if (claimed) return { rows: [], rowCount: 0 }; claimed = true; return { rows: [job], rowCount: 1 }; }
    return { rows: [], rowCount: 1 };
  });
  return { pool: { query } as unknown as Pool, query, job };
}
describe("required canonical notification job delivery without PG", () => {
  it("retries a missing required dispatcher without handing new events to the legacy consumer", async () => {
    const q = queue(), legacy = vi.fn();
    expect(await createJobs({ pool: q.pool, commerce: commerce(), notify: legacy }).tick()).toEqual({ expired: 0, processed: 0 });
    expect(legacy).not.toHaveBeenCalled();
    expect(q.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE outbox_job SET status='completed'"))).toBe(false);
    expect(q.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE outbox_job SET status=$1"))?.[1]).toEqual(["pending", "Canonical in-app notification delivery failed", q.job.id]);
  });
  it("uses only the required canonical dispatcher and validates/normalizes its pointers", async () => {
    const payload = { eventId: randomUUID().toUpperCase(), orderId: randomUUID().toUpperCase() }, q = queue("notification.event", payload), dispatch = vi.fn().mockResolvedValue({ outcome: "processed" }), legacy = vi.fn();
    expect(await createJobs({ pool: q.pool, commerce: commerce(), notify: legacy, dispatchNotificationEvent: dispatch }).tick()).toEqual({ expired: 0, processed: 1 });
    expect(dispatch).toHaveBeenCalledWith({ eventId: payload.eventId.toLowerCase(), orderId: payload.orderId.toLowerCase() }); expect(legacy).not.toHaveBeenCalled();
  });
  it("retries a malformed canonical payload and saves no raw error/private fields", async () => {
    const q = queue("notification.event", { eventId: randomUUID(), orderId: randomUUID(), reason: "TEST private canary" }), dispatch = vi.fn();
    expect((await createJobs({ pool: q.pool, commerce: commerce(), dispatchNotificationEvent: dispatch }).tick()).processed).toBe(0); expect(dispatch).not.toHaveBeenCalled();
    expect(q.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE outbox_job SET status=$1"))?.[1]).toEqual(["pending", "Canonical in-app notification delivery failed", q.job.id]);
  });
  it("propagates required delivery failure as retry rather than observer/legacy success", async () => {
    const q = queue(), dispatch = vi.fn().mockRejectedValue(new Error("TEST provider/contact canary"));
    expect((await createJobs({ pool: q.pool, commerce: commerce(), dispatchNotificationEvent: dispatch, onJobEvent: () => { throw new Error("TEST observer failure"); } }).tick()).processed).toBe(0);
    expect(q.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE outbox_job SET status=$1"))?.[1]).toEqual(["pending", "Canonical in-app notification delivery failed", q.job.id]);
  });
  it("keeps the legacy consumer for old queued order/shipment jobs and payment handlers separate", async () => {
    for (const type of ["order.created", "order.paid", "shipment.updated", "payment.exception"]) {
      const q = queue(type), legacy = vi.fn(), dispatch = vi.fn();
      expect((await createJobs({ pool: q.pool, commerce: commerce(), notify: legacy, dispatchNotificationEvent: dispatch }).tick()).processed).toBe(1);
      expect(legacy).toHaveBeenCalledWith(type, q.job.payload, q.job.dedupe_key); expect(dispatch).not.toHaveBeenCalled();
    }
    for (const type of ["payment.initialize", "payment.reconcile"]) {
      const attemptId = randomUUID(), q = queue(type, { attemptId }), domain = commerce(), legacy = vi.fn(), dispatch = vi.fn();
      await createJobs({ pool: q.pool, commerce: domain, notify: legacy, dispatchNotificationEvent: dispatch }).tick();
      expect(type === "payment.initialize" ? domain.initializeAttempt : domain.reconcileAttempt).toHaveBeenCalledWith(attemptId); expect(legacy).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
    }
  });
});
