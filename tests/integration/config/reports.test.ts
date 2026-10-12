import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../../../src/contracts/commerce";
import { createReportStore } from "../../../src/server/reports";
import { createIsolatedDatabase } from "../backend/isolated-database";

config({ path: ".env.local", quiet: true });
const runtime = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const migration = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
describe.skipIf(!runtime || !migration)("periodic reports on canonical isolated PostgreSQL evidence", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: pg.Pool, store: ReturnType<typeof createReportStore>, actor: Actor;
  const orderId = randomUUID(), olderOrderId = randomUUID();
  async function receipt(order: string, disposition: string, at: string) {
    const attemptId = randomUUID(), receiptId = randomUUID();
    await pool.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr,status) VALUES($1,$2,'mock','TEST reporting',10000,'succeeded')", [attemptId, order]);
    await pool.query("INSERT INTO payment_receipt(id,attempt_id,order_id,provider,merchant_key,provider_ref,amount_irr,currency,disposition,created_at) VALUES($1,$2,$3,'mock','TEST reporting',$4,10000,'IRR',$5,$6)", [receiptId, attemptId, order, randomUUID(), disposition, at]);
    return receiptId;
  }
  async function refund(order: string, receiptId: string, amount: string, status: string, completedAt?: string) {
    const id = randomUUID();
    await pool.query("INSERT INTO refund(id,order_id,receipt_id,amount_irr,status,reason,operation_key,actor_id) VALUES($1,$2,$3,$4,$5,'TEST report evidence',$6,$7)", [id, order, receiptId, amount, status, randomUUID(), actor.userId]);
    if (completedAt) await pool.query("INSERT INTO order_event(id,order_id,event_key,type,created_at) VALUES($1,$2,$3,'refund.completed',$4)", [randomUUID(), order, `refund-complete:${id}`, completedAt]);
  }
  beforeAll(async () => {
    isolated = await createIsolatedDatabase(runtime!, migration!); pool = isolated.pool; store = createReportStore(pool);
    actor = { kind: "admin", userId: randomUUID(), sessionId: randomUUID() };
    // Controlled report authorization/evidence; native auth issuance is tested separately.
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,two_factor_enabled) VALUES($1,\'TEST report fixture\',$2,true,true)', [actor.userId, `${actor.userId}@fixture.invalid`]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [actor.sessionId, randomUUID(), actor.userId]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'finance')", [actor.userId]);
    await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')", [actor.sessionId]);
    for (const id of [orderId, olderOrderId]) await pool.query("INSERT INTO orders(id,order_number,user_id,status,payment_status,subtotal_irr,discount_irr,shipping_irr,tax_irr,total_irr,address_snapshot,policy_version,shipping_method_id) VALUES($1,$2,$3,'confirmed','paid',10000,0,0,0,10000,'{}','TEST','standard')", [id, `TEST-${id}`, actor.userId]);
    const primary = await receipt(orderId, "primary", "2026-10-11T20:30:00Z");
    const extra = await receipt(orderId, "extra", "2026-10-12T20:29:59.999Z");
    await receipt(orderId, "inventory_exception", "2026-10-12T20:30:00Z");
    const older = await receipt(olderOrderId, "primary", "2026-10-11T20:29:59.999Z");
    await refund(olderOrderId, older, "3000", "succeeded", "2026-10-11T20:30:00Z");
    await refund(orderId, extra, "1000", "succeeded", "2026-10-12T20:29:59.999Z");
    await refund(orderId, primary, "1000", "succeeded");
    await refund(orderId, extra, "5000", "pending");
    await refund(orderId, primary, "500", "failed");
    for (const type of ["order.created", "shipment.delivered"]) await pool.query("INSERT INTO order_event(id,order_id,event_key,type,created_at) VALUES($1,$2,$3,$4,'2026-10-12T00:00:00Z')", [randomUUID(), orderId, randomUUID(), type]);
  });
  afterAll(async () => { await isolated?.close(); });
  it("separates primary purchase cash from extra and exception receipts with exact Tehran boundaries", async () => {
    const report = await store.getReport(actor, { from: "2026-10-12", to: "2026-10-12" });
    expect(report.cash).toEqual({ receivedIrr: "20000", refundedIrr: "4000", netIrr: "16000" });
    expect(report.purchases).toEqual({ primaryOrders: 1, primaryReceivedIrr: "10000", primaryRefundedIrr: "3000", netPrimaryIrr: "7000", extraReceivedIrr: "10000", inventoryExceptionReceivedIrr: "0" });
    expect(report.activity).toEqual({ checkoutStarted: 1, paymentVerified: 2, orderCompleted: 1 });
    expect(report.current.undatedSuccessfulRefunds).toBe(1);
    expect(report.current.unresolvedReceiptCount).toBe(2);
    expect(report.current.inventoryUnits).toBe("0");
    expect(Object.keys(report).sort()).toEqual(["activity", "cash", "current", "period", "purchases"]);
    expect(JSON.stringify(report)).not.toMatch(/fixture\.invalid|TEST reporting|address_snapshot|provider_ref|userId/);
  });
  it("keeps refund-only period cashflow negative rather than clamping it to zero", async () => {
    const id = randomUUID();
    await pool.query("INSERT INTO order_event(id,order_id,event_key,type,created_at) VALUES($1,$2,$3,'refund.completed','2026-10-13T00:00:00Z')", [id, orderId, `unrelated:${id}`]);
    const receiptId = (await pool.query<{ id: string }>("SELECT id FROM payment_receipt WHERE order_id=$1 AND disposition='primary'", [orderId])).rows[0]!.id;
    await refund(orderId, receiptId, "2000", "succeeded", "2026-10-14T00:00:00Z");
    const report = await store.getReport(actor, { from: "2026-10-14", to: "2026-10-14" });
    expect(report.cash).toEqual({ receivedIrr: "0", refundedIrr: "2000", netIrr: "-2000" });
    expect(report.purchases.netPrimaryIrr).toBe("-2000");
    const refundDay = await store.getReport(actor, { from: "2026-10-13", to: "2026-10-13" });
    expect(refundDay.cash).toEqual({ receivedIrr: "10000", refundedIrr: "0", netIrr: "10000" });
    expect(refundDay.purchases.inventoryExceptionReceivedIrr).toBe("10000");
  });
  it("pages outstanding exception receipts and durable jobs without exposing bank references or raw errors", async () => {
    await pool.query("INSERT INTO outbox_job(id,dedupe_key,type,payload,status,attempts,last_error) VALUES($1,$2,'payment.reconcile','{}','dead',12,'PRIVATE provider address/code'),($3,$4,'PRIVATE raw-type','{}','pending',0,NULL)", [randomUUID(), randomUUID(), randomUUID(), randomUUID()]);
    const queue = await store.getWorkQueue(actor, { page: 1, pageSize: 1 });
    expect(queue.receipts.totalItems).toBe(2); expect(queue.receipts.items).toHaveLength(1); expect(queue.receipts.totalPages).toBe(2);
    const second = await store.getWorkQueue(actor, { page: 2, pageSize: 1 });
    expect(second.receipts.items).toHaveLength(1); expect(second.receipts.items[0]!.receiptId).not.toBe(queue.receipts.items[0]!.receiptId);
    const full = await store.getWorkQueue(actor, { pageSize: 100 });
    expect(full.jobs.totalItems).toBe(2); expect(full.jobs.items.map(job => job.type).sort()).toEqual(["domain.other", "payment.reconcile"]);
    expect(full.receipts.items.find(receipt => receipt.disposition === "extra")).toMatchObject({ remainingIrr: "9000", pendingRefundIrr: "5000" });
    expect(JSON.stringify(full)).not.toMatch(/PRIVATE|provider_ref|last_error|dedupe_key|payload/);
    await expect(store.getWorkQueue(actor, { pageSize: 101 })).rejects.toThrow();
  });
  it("checks current grants and roles even for direct finance report calls", async () => {
    await pool.query("DELETE FROM role_membership WHERE user_id=$1", [actor.userId]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'fulfillment')", [actor.userId]);
    await expect(store.getReport(actor, {})).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await pool.query("DELETE FROM role_membership WHERE user_id=$1", [actor.userId]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'finance')", [actor.userId]);
    await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [actor.sessionId]);
    await expect(store.getReport(actor, {})).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
