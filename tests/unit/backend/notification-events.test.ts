import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRequiredPermission } from "../../../src/contracts/notifications";
import { createNotificationEventDispatcher, notificationRecipientRoles, notificationTemplate, parseNotificationEventInput } from "../../../src/server/jobs/notification-events";

const input = () => ({ eventId: randomUUID(), orderId: randomUUID() });
const poolStub = (connect = vi.fn().mockRejectedValue(new Error("TEST contact/provider canary must not escape"))) => ({ connect }) as unknown as Pool;
describe("controlled canonical notification boundary without PG", () => {
  it("accepts only normalized canonical event/order pointers", () => {
    const value = input(); expect(parseNotificationEventInput({ eventId: value.eventId.toUpperCase(), orderId: value.orderId.toUpperCase() })).toEqual(value);
  });
  it.each(["recipient", "userId", "actorId", "type", "title", "body", "reason", "phone", "amountIrr", "providerReference", "address", "permission", "audience"])("rejects caller-supplied %s before connecting", async field => {
    const pool = poolStub(), dispatcher = createNotificationEventDispatcher({ pool, deploymentEnv: "test" });
    await expect(dispatcher.dispatchNotificationEvent({ ...input(), [field]: "TEST private canary" })).rejects.toMatchObject({ code: "VALIDATION", message: "شناسهٔ رویداد اعلان معتبر نیست." });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("rejects malformed pointers, class instances, hidden fields, symbols and accessors without coercion", () => {
    const getter = vi.fn(() => randomUUID()), withGetter = Object.defineProperty(input(), "eventId", { get: getter, enumerable: true });
    for (const value of [null, [], new Date(), { eventId: "bad", orderId: randomUUID() }, { ...input(), eventId: { toString: getter } }, { ...input(), [Symbol("recipient")]: randomUUID() }, Object.defineProperty(input(), "secret", { value: "canary", enumerable: false }), withGetter, Object.assign(Object.create({ recipient: randomUUID() }), input())]) expect(() => parseNotificationEventInput(value)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(getter).not.toHaveBeenCalled();
  });
  it("maps only real canonical event kinds to bounded fixed experimental text", () => {
    const kinds = ["order.created", "payment.verified", "shipment.shipped", "shipment.delivered", "request.cancel", "request.return", "request.approved", "request.rejected", "request.received", "request.closed", "refund.pending", "refund.completed", "refund.failed", "payment.inventory_exception", "payment.extra_receipt"];
    for (const kind of kinds) {
      const template = notificationTemplate(kind)!; expect(template.kind).toBe(kind); expect(template.title.length).toBeLessThanOrEqual(160); expect(template.body.length).toBeLessThanOrEqual(500); expect(template.title).toContain("آزمایشی"); expect(Object.isFrozen(template)).toBe(true);
      expect(template.operatorPermission).toBe(kind.startsWith("request.") ? "orders.fulfill" : kind.startsWith("refund.") || kind === "payment.inventory_exception" || kind === "payment.extra_receipt" ? "refunds.write" : undefined);
    }
    for (const kind of ["order.paid", "shipment.updated", "payment.exception", "payment.failed", "refund.unknown", "legacy.order_update", "provider.TEST canary"]) expect(notificationTemplate(kind)).toBeNull();
    expect(notificationTemplate("refund.failed")!.title).not.toMatch(/انتقال.*انجام شد|تأیید شد/);
    expect(notificationTemplate("payment.inventory_exception")!.title).not.toContain("پرداخت ناموفق");
  });
  it("routes current permissions through the maintained role map, never a supplied recipient role", () => {
    expect(notificationRecipientRoles("orders.fulfill")).toEqual(["fulfillment", "owner"]);
    expect(notificationRecipientRoles("refunds.write")).toEqual(["finance", "owner"]);
    expect(() => notificationRecipientRoles("content.write" as NotificationRequiredPermission)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
  });
  it("cannot create a live dispatcher or open a database in live mode", () => {
    const pool = poolStub(); expect(() => createNotificationEventDispatcher({ pool, deploymentEnv: "live" })).toThrow(expect.objectContaining({ code: "CONFIGURATION", status: 503 })); expect(pool.connect).not.toHaveBeenCalled();
  });
  it("propagates a static mapped-delivery failure rather than silently completing or leaking DB details", async () => {
    await expect(createNotificationEventDispatcher({ pool: poolStub(), deploymentEnv: "staging" }).dispatchNotificationEvent(input())).rejects.toMatchObject({ code: "CONFIGURATION", message: "ثبت اعلان درون‌برنامه‌ای آزمایشی کامل نشد.", status: 503 });
    const q = { query: vi.fn().mockRejectedValue(new Error("TEST provider/address canary")), release: vi.fn() } as unknown as PoolClient;
    await expect(createNotificationEventDispatcher({ pool: poolStub(vi.fn().mockResolvedValue(q)), deploymentEnv: "test" }).dispatchNotificationEvent(input())).rejects.toMatchObject({ code: "CONFIGURATION", message: "ثبت اعلان درون‌برنامه‌ای آزمایشی کامل نشد." }); expect(q.release).toHaveBeenCalledTimes(1);
  });
  it("does not insert an invented message for a missing/mismatched persisted event", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), q = { query, release: vi.fn() } as unknown as PoolClient;
    const result = await createNotificationEventDispatcher({ pool: poolStub(vi.fn().mockResolvedValue(q)), deploymentEnv: "test" }).dispatchNotificationEvent(input());
    expect(result).toEqual({ outcome: "ignored", insertedMessages: 0, currentRecipients: 0 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO notification_message"))).toBe(false);
  });
});
