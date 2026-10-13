import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import type pg from "pg";
import { config } from "dotenv";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
import { createIsolatedDatabase } from "../integration/backend/isolated-database";
import { commerceFixture } from "../integration/backend/commerce-fixture";
import { createJobs, type JobEvent } from "../../src/server/jobs/service";
import { createNotificationEventDispatcher } from "../../src/server/jobs/notification-events";

// Standalone server-only Node fixture; NOT imported/discovered by Playwright/Vitest.
// Node conditions match the repository's maintained db/worker scripts.
async function runOwnedNotificationWorkerFixture() {
  config({ path: ".env.local", quiet: true });
  if (process.env.NOTIFICATION_OWNED_WORKER_GO !== "true") throw new Error("Explicit isolated worker fixture GO is required");
  const runtime = controlledQaDatabase(process.env);
  const migrationValue = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
  const migration = controlledQaDatabase({ ...process.env, DATABASE_URL: migrationValue });
  if (runtime.host !== migration.host || runtime.pathname !== migration.pathname) throw new Error("Isolated fixture target identities must match");
  const started = performance.now();
  const isolated = await createIsolatedDatabase(runtime.toString(), migration.toString());
  try {
    const pool = isolated.pool;
    const resolution = (await pool.query<{ owned: number }>("SELECT count(*)::int AS owned FROM unnest(ARRAY['notification_message','order_event']) AS name JOIN pg_class c ON c.oid=to_regclass(name) JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1", [isolated.schema])).rows[0]!;
    assert.equal(resolution.owned, 2);
    const fixture = await commerceFixture(pool), purchase = await fixture.purchase(true);
    const canary = "TEST raw reason phone=09120000000 email=qa-canary@fixture.invalid provider=PRIVATE_CANARY";
    await fixture.commerce.requestReturn(fixture.customer, purchase.checkout.orderId, "return", canary);
    const source = (await pool.query<{ id: string }>("SELECT id FROM order_event WHERE order_id=$1 AND type='request.return'", [purchase.checkout.orderId])).rows;
    assert.equal(source.length, 1); const eventId = source[0]!.id;
    const selected = (await pool.query<{ id: string; payload: { eventId: string; orderId: string }; status: string; attempts: number }>("SELECT id,payload,status,attempts FROM outbox_job WHERE type='notification.event' AND dedupe_key=$1", [`notification:event:${eventId}`])).rows;
    assert.equal(selected.length, 1); const job = selected[0]!;
    assert.deepEqual(job.payload, { eventId, orderId: purchase.checkout.orderId }); assert.equal(job.status, "pending"); assert.equal(job.attempts, 0);
    const others = async () => (await pool.query("SELECT id,status,attempts,available_at,locked_until,last_error FROM outbox_job WHERE id<>$1 ORDER BY id", [job.id])).rows;
    const financial = async () => (await pool.query("SELECT o.payment_status,o.total_irr::text,(SELECT count(*)::int FROM payment_receipt WHERE order_id=o.id) AS receipts,(SELECT count(*)::int FROM shipment WHERE order_id=o.id) AS shipments,b.on_hand,b.reserved FROM orders o JOIN inventory_balance b ON b.variant_id=$2 WHERE o.id=$1", [purchase.checkout.orderId, fixture.variantId])).rows;
    const beforeOthers = await others(), beforeFinancial = await financial(), events: JobEvent[] = [];
    // Guarded selection changes only the lease query: production factory handling remains real.
    // No expired-reservation sweep can escape this generated schema.
    const selectedPool = { query: async (text: string, values?: unknown[]) => {
      if (text.startsWith("UPDATE outbox_job SET status='running'")) {
        return pool.query("UPDATE outbox_job SET status='running',attempts=attempts+1,locked_until=now()+interval '60 seconds' WHERE id=$1 AND type='notification.event' AND (status='pending' OR (status='running' AND locked_until<now())) AND available_at<=now() RETURNING *", [job.id]);
      }
      if (!text.startsWith("UPDATE outbox_job SET status=") || !values?.some(value => value === job.id) || values.some(value => typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value) && value !== job.id)) throw new Error("Refusing a nonowned worker operation");
      return pool.query(text, values);
    } } as unknown as pg.Pool;
    const dispatcher = createNotificationEventDispatcher({ pool, deploymentEnv: "test" });
    let dispatches = 0;
    const worker = createJobs({ pool: selectedPool, commerce: fixture.commerce, dispatchNotificationEvent: async input => {
      assert.deepEqual(input, job.payload); dispatches++; return dispatcher.dispatchNotificationEvent(input);
    }, onJobEvent: event => { assert.equal(event.jobId, job.id); events.push(event); } });
    const tick = await worker.tick(); assert.deepEqual(tick, { expired: 0, processed: 1 }); assert.equal(dispatches, 1);
    assert.deepEqual(events.map(event => event.event), ["started", "completed"]);
    assert.deepEqual(await others(), beforeOthers); assert.deepEqual(await financial(), beforeFinancial);
    const delivered = (await pool.query("SELECT id,user_id,audience,kind,title,body,source_event_id,required_permission FROM notification_message WHERE source_event_id=$1 ORDER BY audience,user_id", [eventId])).rows;
    assert.equal(delivered.length, 2); assert.equal(delivered.filter(row => row.audience === "customer")[0]!.user_id, fixture.customer.userId);
    assert.equal(delivered.filter(row => row.audience === "operator")[0]!.user_id, fixture.admin.userId);
    assert.equal(delivered.filter(row => row.audience === "operator")[0]!.required_permission, "orders.fulfill");
    const ownerData = (await pool.query<{ phone_number: string; email: string }>('SELECT phone_number,email FROM "user" WHERE id=$1', [fixture.customer.userId])).rows[0]!;
    const sensitive = [ownerData.phone_number, ownerData.email, purchase.c.input.address.recipient, purchase.c.input.address.address, purchase.c.input.address.phone, purchase.c.input.address.postalCode];
    for (const row of delivered) {
      assert.equal(row.kind, "request.return"); assert.equal(row.source_event_id, eventId);
      assert.doesNotMatch(row.title + row.body, /09120000000|fixture\.invalid|PRIVATE_CANARY|TEST raw reason/u);
      for (const value of sensitive) assert.equal((row.title + row.body).includes(value), false);
    }
    await pool.query("UPDATE notification_message SET read_at=clock_timestamp() WHERE source_event_id=$1", [eventId]);
    const read = async () => (await pool.query("SELECT id,read_at FROM notification_message WHERE source_event_id=$1 ORDER BY id", [eventId])).rows;
    const readBefore = await read(), replay = await dispatcher.dispatchNotificationEvent(job.payload);
    assert.equal(replay.insertedMessages, 0); assert.deepEqual(await read(), readBefore);
    assert.deepEqual(await worker.tick(), { expired: 0, processed: 0 }); assert.equal(dispatches, 1);
    assert.deepEqual(await others(), beforeOthers); assert.deepEqual(await financial(), beforeFinancial);
    return { scope: "isolated-selected-notification-job", processedJobs: 1, messages: 2, replayInserted: 0, preservedReads: 2, unrelatedJobsUnchanged: true, financialStateUnchanged: true, nativeAuthenticationProved: false, elapsedMs: Math.round(performance.now() - started) };
  } finally { await isolated.close(); }
}

// Failure output is a fixed category only; SQL/schema/credentials/payload never leave this process.
void runOwnedNotificationWorkerFixture()
  .then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error("Owned isolated notification worker fixture failed; no raw diagnostic was exported."); process.exitCode = 1; });
