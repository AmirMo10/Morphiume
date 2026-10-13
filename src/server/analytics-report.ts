import "server-only";
import type { Pool } from "pg";
import type { Actor } from "../contracts/commerce";
import type { AnalyticsPeriodDto } from "../contracts/analytics";
import type { AnalyticsStore } from "./commerce/analytics";
import { parseReportPeriod } from "./report-period";

type Options = {
  database: Pool;
  observations: Pick<AnalyticsStore, "getObservedPeriod">;
  // Both invocations must use fresh native grant/role data outside the RR snapshot.
  authorizeCurrent: (actor: Actor) => Promise<void>;
};

/** Anonymous observations and durable server counts are distinct populations. */
export function createAnalyticsReportStore({ database, observations, authorizeCurrent }: Options) {
  async function getAnalytics(actor: Actor, input: unknown): Promise<AnalyticsPeriodDto> {
    const period = parseReportPeriod(input);
    await authorizeCurrent(actor);
    const db = await database.connect();
    let result: AnalyticsPeriodDto;
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout = '2s'");
      await db.query("SET LOCAL lock_timeout = '250ms'");
      // This is the first snapshot-acquiring query. BEGIN/transaction_timestamp
      // alone may precede a wait and cannot describe the actual read snapshot.
      const clock = (await db.query<{ asOf: Date }>('SELECT clock_timestamp() AS "asOf"')).rows[0]!;
      const asOf = clock.asOf.toISOString();
      type Counts = { started: string; verified: string; primary: string; completed: string; cohortPrimary: string; cohortDelivered: string };
      const counts = (await db.query<Counts>(`WITH bounds AS (
        SELECT $1::date::timestamp AT TIME ZONE 'Asia/Tehran' AS from_at,
          ($2::date+1)::timestamp AT TIME ZONE 'Asia/Tehran' AS to_at,$3::timestamptz AS as_of
      ), started AS (
        SELECT DISTINCT e.order_id FROM order_event e JOIN orders o ON o.id=e.order_id CROSS JOIN bounds b
        WHERE e.type='order.created' AND e.created_at>=b.from_at AND e.created_at<b.to_at AND e.created_at<=b.as_of
      ), verified AS (
        SELECT r.order_id,r.disposition FROM payment_receipt r CROSS JOIN bounds b
        WHERE r.created_at>=b.from_at AND r.created_at<b.to_at AND r.created_at<=b.as_of
      ), completed AS (
        SELECT DISTINCT e.order_id FROM order_event e JOIN shipment s ON s.order_id=e.order_id CROSS JOIN bounds b
        WHERE e.type='shipment.delivered' AND e.created_at>=b.from_at AND e.created_at<b.to_at AND e.created_at<=b.as_of
      ) SELECT (SELECT count(*)::text FROM started) AS started,
        (SELECT count(*)::text FROM verified) AS verified,
        (SELECT count(DISTINCT order_id)::text FROM verified WHERE disposition='primary') AS primary,
        (SELECT count(*)::text FROM completed) AS completed,
        (SELECT count(*)::text FROM started c WHERE EXISTS (
          SELECT 1 FROM payment_receipt r CROSS JOIN bounds b
          WHERE r.order_id=c.order_id AND r.disposition='primary' AND r.created_at<=b.as_of
        )) AS "cohortPrimary",
        (SELECT count(*)::text FROM started c WHERE EXISTS (
          SELECT 1 FROM order_event e JOIN shipment s ON s.order_id=e.order_id CROSS JOIN bounds b
          WHERE e.order_id=c.order_id AND e.type='shipment.delivered' AND e.created_at<=b.as_of
        )) AS "cohortDelivered"`, [period.fromDate, period.toDate, asOf])).rows[0]!;
      const observed = await observations.getObservedPeriod(db, period, asOf);
      result = { period, ...observed,
        server: { checkoutStarted: counts.started, verifiedReceipts: counts.verified, primaryPaidOrders: counts.primary, completedOrders: counts.completed },
        cohort: { basis: "orders_started_in_period", asOf, started: counts.started, primaryPaid: counts.cohortPrimary, delivered: counts.cohortDelivered } };
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
    // A repeatable-read snapshot must never preserve revoked authorization.
    // Release the data client first so a fresh permission query cannot wait for it.
    await authorizeCurrent(actor);
    return result;
  }
  return { getAnalytics };
}
