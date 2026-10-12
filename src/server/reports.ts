import "server-only";
import type { Pool } from "pg";
import { CommerceError, type Actor, type Role } from "../contracts/commerce";
import type { ReportWorkQueueDto, StoreReportDto } from "../contracts/reports";
import { z } from "zod";
import { ROLE_PERMISSIONS } from "./commerce/permissions";
import { pool } from "./db";
import { parseReportPeriod } from "./report-period";

export function createReportStore(database: Pool) {
  async function authorize(db: Pick<Pool, "query">, actor: Actor) {
    const allowed = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter(role => ROLE_PERMISSIONS[role].includes("refunds.write"));
    const authorized = actor.kind === "admin" && (await db.query('SELECT s.id FROM session s JOIN "user" u ON u.id=s.user_id JOIN admin_grant g ON g.session_id=s.id JOIN role_membership r ON r.user_id=u.id WHERE s.id=$1 AND u.id=$2 AND s.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp() AND NOT u.disabled AND u.two_factor_enabled AND r.role=ANY($3::text[])', [actor.sessionId, actor.userId, allowed])).rowCount;
    if (!authorized) throw new CommerceError("FORBIDDEN", "مجوز مشاهدهٔ گزارش مالی را ندارید.", 403);
  }
  async function getReport(actor: Actor, input: unknown): Promise<StoreReportDto> {
    const period = parseReportPeriod(input), db = await database.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await authorize(db, actor);
      const result = await db.query<{
        received: string; refunded: string; primary_received: string; primary_refunded: string; extra_received: string; exception_received: string;
        primary_orders: number; verified_payments: number; checkout_started: number; order_completed: number; inventory_units: string; active_reservations: string;
        unresolved_receipts: number; pending_jobs: number; dead_jobs: number; undated_refunds: number;
      }>(`WITH bounds AS (SELECT $1::date::timestamp AT TIME ZONE 'Asia/Tehran' AS start_at,($2::date+1)::timestamp AT TIME ZONE 'Asia/Tehran' AS end_at),
      received AS (SELECT r.* FROM payment_receipt r,bounds b WHERE r.created_at>=b.start_at AND r.created_at<b.end_at),
      completed_refunds AS (SELECT r.amount_irr,p.disposition FROM refund r JOIN payment_receipt p ON p.id=r.receipt_id JOIN order_event e ON e.event_key='refund-complete:'||r.id::text AND e.order_id=r.order_id AND e.type='refund.completed',bounds b WHERE r.status='succeeded' AND e.created_at>=b.start_at AND e.created_at<b.end_at)
      SELECT (SELECT coalesce(sum(amount_irr),0)::text FROM received) AS received,
      (SELECT coalesce(sum(amount_irr),0)::text FROM completed_refunds) AS refunded,
      (SELECT coalesce(sum(amount_irr),0)::text FROM received WHERE disposition='primary') AS primary_received,
      (SELECT coalesce(sum(amount_irr),0)::text FROM completed_refunds WHERE disposition='primary') AS primary_refunded,
      (SELECT coalesce(sum(amount_irr),0)::text FROM received WHERE disposition='extra') AS extra_received,
      (SELECT coalesce(sum(amount_irr),0)::text FROM received WHERE disposition='inventory_exception') AS exception_received,
      (SELECT count(*)::int FROM received WHERE disposition='primary') AS primary_orders,
      (SELECT count(*)::int FROM received) AS verified_payments,
      (SELECT count(*)::int FROM order_event e,bounds b WHERE e.type='order.created' AND e.created_at>=b.start_at AND e.created_at<b.end_at) AS checkout_started,
      (SELECT count(*)::int FROM order_event e,bounds b WHERE e.type='shipment.delivered' AND e.created_at>=b.start_at AND e.created_at<b.end_at) AS order_completed,
      (SELECT coalesce(sum(on_hand),0)::text FROM inventory_balance) AS inventory_units,
      (SELECT coalesce(sum(reserved),0)::text FROM inventory_balance) AS active_reservations,
      (SELECT count(*)::int FROM payment_receipt p WHERE p.disposition IN ('extra','inventory_exception') AND p.amount_irr>(SELECT coalesce(sum(r.amount_irr),0) FROM refund r WHERE r.receipt_id=p.id AND r.status='succeeded')) AS unresolved_receipts,
      (SELECT count(*)::int FROM outbox_job WHERE status IN ('pending','running')) AS pending_jobs,
      (SELECT count(*)::int FROM outbox_job WHERE status='dead') AS dead_jobs,
      (SELECT count(*)::int FROM refund r WHERE r.status='succeeded' AND NOT EXISTS(SELECT 1 FROM order_event e WHERE e.event_key='refund-complete:'||r.id::text AND e.order_id=r.order_id AND e.type='refund.completed')) AS undated_refunds`, [period.fromDate, period.toDate]);
      const row = result.rows[0]!;
      await db.query("COMMIT");
      return { period, cash: { receivedIrr: row.received, refundedIrr: row.refunded, netIrr: (BigInt(row.received) - BigInt(row.refunded)).toString() },
        purchases: { primaryOrders: row.primary_orders, primaryReceivedIrr: row.primary_received, primaryRefundedIrr: row.primary_refunded, netPrimaryIrr: (BigInt(row.primary_received) - BigInt(row.primary_refunded)).toString(), extraReceivedIrr: row.extra_received, inventoryExceptionReceivedIrr: row.exception_received },
        activity: { checkoutStarted: row.checkout_started, paymentVerified: row.verified_payments, orderCompleted: row.order_completed },
        current: { inventoryUnits: row.inventory_units, activeReservations: row.active_reservations, unresolvedReceiptCount: row.unresolved_receipts, pendingJobs: row.pending_jobs, deadJobs: row.dead_jobs, undatedSuccessfulRefunds: row.undated_refunds } };
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
  async function getWorkQueue(actor: Actor, input: unknown): Promise<ReportWorkQueueDto> {
    const { page, pageSize } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict().parse(input);
    const offset = (page - 1) * pageSize, db = await database.connect();
    const remaining = "p.amount_irr-(SELECT coalesce(sum(r.amount_irr),0) FROM refund r WHERE r.receipt_id=p.id AND r.status='succeeded')";
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); await authorize(db, actor);
      const totals = (await db.query<{ receipts: number; jobs: number }>(`SELECT (SELECT count(*)::int FROM payment_receipt p WHERE p.disposition IN ('extra','inventory_exception') AND (${remaining})>0) AS receipts,(SELECT count(*)::int FROM outbox_job WHERE status IN ('pending','running','dead')) AS jobs`)).rows[0]!;
      const receipts = await db.query<{ receiptId: string; orderId: string; attemptId: string; disposition: "extra" | "inventory_exception"; createdAt: Date; remainingIrr: string; pendingRefundIrr: string }>(`SELECT p.id AS "receiptId",p.order_id AS "orderId",p.attempt_id AS "attemptId",p.disposition,p.created_at AS "createdAt",(${remaining})::text AS "remainingIrr",(SELECT coalesce(sum(r.amount_irr),0)::text FROM refund r WHERE r.receipt_id=p.id AND r.status IN ('pending','processing')) AS "pendingRefundIrr" FROM payment_receipt p WHERE p.disposition IN ('extra','inventory_exception') AND (${remaining})>0 ORDER BY p.created_at DESC,p.id DESC LIMIT $1 OFFSET $2`, [pageSize, offset]);
      const jobs = await db.query<{ id: string; type: string; status: "pending" | "running" | "dead"; attempts: number; availableAt: Date }>('SELECT id,type,status,attempts,available_at AS "availableAt" FROM outbox_job WHERE status IN (\'pending\',\'running\',\'dead\') ORDER BY available_at,id LIMIT $1 OFFSET $2', [pageSize, offset]);
      await db.query("COMMIT");
      return { receipts: { items: receipts.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), page, pageSize, totalItems: totals.receipts, totalPages: Math.ceil(totals.receipts / pageSize) },
        jobs: { items: jobs.rows.map(row => ({ id: row.id, type: row.type === "payment.initialize" || row.type === "payment.reconcile" ? row.type : "domain.other", status: row.status, attempts: row.attempts, availableAt: row.availableAt.toISOString() })), page, pageSize, totalItems: totals.jobs, totalPages: Math.ceil(totals.jobs / pageSize) } };
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
  return { getReport, getWorkQueue };
}
export const { getReport, getWorkQueue } = createReportStore(pool);
