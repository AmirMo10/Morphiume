import "server-only";
import assert from "node:assert/strict";
import type pg from "pg";
import type { Commerce } from "../../src/server/commerce/service";
import { createJobs } from "../../src/server/jobs/service";
import { createNotificationEventDispatcher } from "../../src/server/jobs/notification-events";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export type OwnedNotificationInput = { orderId: string; customerUserId: string; operatorUserIds: string[] };
export function parseOwnedNotificationInput(value: unknown): OwnedNotificationInput {
  assert(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  const item = value as Record<string, unknown>;
  const descriptors = Object.getOwnPropertyDescriptors(item);
  assert(Object.values(descriptors).every(field => Object.hasOwn(field, "value") && field.enumerable));
  assert.deepEqual(Reflect.ownKeys(item).sort(), ["customerUserId", "operatorUserIds", "orderId"]);
  assert(typeof item.orderId === "string" && uuid.test(item.orderId));
  assert(typeof item.customerUserId === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(item.customerUserId));
  assert(Array.isArray(item.operatorUserIds) && item.operatorUserIds.length >= 1 && item.operatorUserIds.length <= 3);
  assert(item.operatorUserIds.every(id => typeof id === "string" && uuid.test(id)));
  assert.equal(new Set(item.operatorUserIds).size, item.operatorUserIds.length);
  assert(!item.operatorUserIds.includes(item.customerUserId));
  return { orderId: item.orderId, customerUserId: item.customerUserId, operatorUserIds: [...item.operatorUserIds] };
}

/** Actual notification handling restricted to this order's canonical jobs. No reservation sweep. */
export async function deliverOwnedNotificationJobs(pool: pg.Pool, raw: unknown, deploymentEnv: "test" | "staging") {
  const input = parseOwnedNotificationInput(raw), started = performance.now();
  const authority = (await pool.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,has_schema_privilege(current_user,current_schema(),'CREATE') AS ddl,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=(SELECT oid FROM pg_namespace WHERE nspname=current_schema()) AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_tables FROM pg_roles WHERE rolname=current_user")).rows[0];
  assert(authority && Object.values(authority).every(flag => flag === false));
  const owner = (await pool.query("SELECT user_id FROM orders WHERE id=$1", [input.orderId])).rows;
  assert.equal(owner.length, 1); assert.equal(owner[0]!.user_id, input.customerUserId);
  const users = (await pool.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) AND NOT disabled AND two_factor_enabled', [input.operatorUserIds])).rows;
  assert.equal(users.length, input.operatorUserIds.length);
  const financial = async () => (await pool.query(`SELECT row_to_json(o) AS order_row,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM payment_attempt x WHERE x.order_id=o.id) AS attempts,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM payment_receipt x WHERE x.order_id=o.id) AS receipts,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM shipment x WHERE x.order_id=o.id) AS shipments,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM inventory_reservation x WHERE x.order_id=o.id) AS reservations,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.variant_id) FROM inventory_balance x WHERE x.variant_id IN(SELECT variant_id FROM order_item WHERE order_id=o.id)) AS balances,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM inventory_ledger x WHERE x.order_id=o.id) AS ledger,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM refund x WHERE x.order_id=o.id) AS refunds FROM orders o WHERE o.id=$1`, [input.orderId])).rows;
  const before = await financial();
  const jobs = (await pool.query<{ id: string; event_id: string; payload: unknown; status: string }>("SELECT j.id,e.id AS event_id,j.payload,j.status FROM order_event e JOIN outbox_job j ON j.type='notification.event' AND j.dedupe_key='notification:event:'||e.id::text WHERE e.order_id=$1 ORDER BY e.created_at,e.id", [input.orderId])).rows;
  assert(jobs.length >= 2 && jobs.length <= 24);
  const dispatcher = createNotificationEventDispatcher({ pool, deploymentEnv });
  let processed = 0;
  for (const job of jobs) {
    assert.deepEqual(job.payload, { eventId: job.event_id, orderId: input.orderId });
    const selectedPool = { query: async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("UPDATE outbox_job SET status='running'")) return pool.query("UPDATE outbox_job SET status='running',attempts=attempts+1,locked_until=now()+interval '60 seconds' WHERE id=$1 AND type='notification.event' AND (status='pending' OR (status='running' AND locked_until<now())) AND available_at<=now() RETURNING *", [job.id]);
      if (!sql.startsWith("UPDATE outbox_job SET status=") || !values?.some(value => value === job.id) || values.some(value => typeof value === "string" && uuid.test(value) && value !== job.id)) throw new Error("Nonowned notification worker operation refused");
      return pool.query(sql, values);
    } } as unknown as pg.Pool;
    const worker = createJobs({ pool: selectedPool,
      // Only notification.event is claimable, so other Commerce methods are unreachable.
      commerce: { expireReservations: async () => 0 } as unknown as Commerce,
      dispatchNotificationEvent: payload => { assert.deepEqual(payload, job.payload); return dispatcher.dispatchNotificationEvent(payload); },
    });
    for (;;) {
      const state = (await pool.query<{ status: string; attempts: number; last_error: string | null }>("SELECT status,attempts,last_error FROM outbox_job WHERE id=$1 AND type='notification.event' AND dedupe_key=$2", [job.id, `notification:event:${job.event_id}`])).rows;
      assert.equal(state.length, 1);
      assert(["pending", "running", "completed"].includes(state[0]!.status));
      // A real delivery failure remains a failure, even when a later retry could succeed.
      assert.equal(state[0]!.last_error, null);
      if (state[0]!.status === "completed") break;
      assert(performance.now() - started < 12_000, "Owned notification delivery deadline exceeded");
      processed += (await worker.tick()).processed;
      await new Promise(resolve => setTimeout(resolve, 75));
    }
  }
  assert.deepEqual(await financial(), before);
  return { scope: "owned-canonical-notification-delivery", completedJobs: jobs.length, processedJobs: processed, financialStateUnchanged: true };
}
