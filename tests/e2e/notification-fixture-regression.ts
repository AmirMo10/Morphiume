import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
import { createIsolatedDatabase } from "../integration/backend/isolated-database";
import { commerceFixture } from "../integration/backend/commerce-fixture";
import { createNotificationEventDispatcher } from "../../src/server/jobs/notification-events";
import { createNotificationFeed } from "../../src/server/commerce/notification-feed";
import { createJobs } from "../../src/server/jobs/service";
import { sourceNotificationEvent } from "./notification-fixtures";
import { deliverOwnedNotificationJobs } from "./notification-delivery-core";

config({ path: ".env.local", quiet: true });

let proofStage = "guards";
/** Isolated controlled factory proof, never native authentication or a public worker. */
export async function proveNotificationFixtureCoexistence() {
  assert.equal(process.env.NOTIFICATION_FIXTURE_PG_GO, "true");
  const started = performance.now();
  const plan = JSON.parse(await readFile(".local/native-qa/b625408702be90db/plan.json", "utf8"));
  const databaseUrl = controlledQaDatabase(process.env).toString();
  assert.equal(new URL(databaseUrl).pathname, "/morphiume_staging_qa_b625408702be90db");
  assert.equal(new URL(databaseUrl).port, "15433");
  assert.equal(databaseUrl, plan.connections.databaseUrl);
  const ownerUrl = new URL(plan.connections.migrationDatabaseUrl);
  assert.equal(ownerUrl.host, new URL(databaseUrl).host); assert.equal(ownerUrl.pathname, new URL(databaseUrl).pathname);
  assert.equal(decodeURIComponent(ownerUrl.username), plan.ownerRole);
  proofStage = "schema";
  const isolated = await createIsolatedDatabase(databaseUrl, ownerUrl.toString());
  const pool = isolated.pool;
  const publicState = async () => (await pool.query("SELECT (SELECT md5(coalesce(string_agg(id::text||':'||status||':'||attempts||':'||available_at::text||':'||coalesce(locked_until::text,'')||':'||coalesce(last_error,''),',' ORDER BY id),'')) FROM public.outbox_job) AS jobs,(SELECT md5(coalesce(string_agg(id::text||':'||status||':'||expires_at::text,',' ORDER BY id),'')) FROM public.inventory_reservation) AS reservations")).rows[0];
  const financial = async () => {
    const result: Record<string, unknown> = {};
    for (const name of ["orders", "order_item", "payment_attempt", "payment_receipt", "inventory_balance", "inventory_reservation", "inventory_ledger", "shipment", "refund"]) result[name] = (await pool.query(`SELECT row_to_json(t) AS row FROM ${name} t ORDER BY row_to_json(t)::text`)).rows;
    return result;
  };
  const eventIds = async (orderId: string) => {
    const rows = (await pool.query<{ id: string; type: string }>("SELECT id,type FROM order_event WHERE order_id=$1 AND type IN ('request.return','refund.pending') ORDER BY type", [orderId])).rows;
    assert.equal(rows.length, 2); return rows;
  };
  const purchaseEvents = async (fixture: Awaited<ReturnType<typeof commerceFixture>>) => {
    const purchase = await fixture.purchase(true);
    await fixture.commerce.requestReturn(fixture.customer, purchase.checkout.orderId, "return", "TEST controlled notification coexistence");
    const receipt = (await pool.query<{ id: string }>("SELECT id FROM payment_receipt WHERE order_id=$1", [purchase.checkout.orderId])).rows[0]!;
    await fixture.commerce.requestRefund(fixture.admin, purchase.checkout.orderId, receipt.id, "10", "TEST controlled notification refund", randomUUID());
    return { purchase, events: await eventIds(purchase.checkout.orderId) };
  };
  const rowsFor = async (eventId: string, userId: string) => (await pool.query("SELECT * FROM notification_message WHERE source_event_id=$1 AND user_id=$2 AND audience='operator' ORDER BY id", [eventId, userId])).rows;
  // Preserve the rejected historical fixture as an explicit baseline, independent
  // of the corrected native fixture helpers. Never run this against public.
  const seedAlternateKey = async (userId: string, orderId: string, eventId: string, kind: string, permission: string) => {
    const id = randomUUID();
    await pool.query("INSERT INTO notification_message(id,user_id,event_key,title,body,audience,kind,order_id,source_event_id,required_permission) VALUES($1,$2,$3,'TEST alternate-key baseline','TEST fixture baseline','operator',$4,$5,$6,$7)", [id, userId, `qa-notification-operator:${randomUUID()}`, kind, orderId, eventId, permission]);
    return id;
  };
  const pendingOnlyBaseline = async (eventId: string) => assert.equal((await pool.query("SELECT status FROM outbox_job WHERE dedupe_key=$1", [`notification:event:${eventId}`])).rows[0]!.status, "pending");
  let result;
  try {
    const resolved = (await pool.query("SELECT n.nspname FROM unnest(ARRAY['notification_message','order_event','orders']) name JOIN pg_class c ON c.oid=to_regclass(name) JOIN pg_namespace n ON n.oid=c.relnamespace")).rows;
    assert.equal(resolved.length, 3); assert.equal(resolved.every(row => row.nspname === isolated.schema), true);
    const beforePublic = await publicState();
    proofStage = "baseline-fixture";
    const old = await commerceFixture(pool), a = await purchaseEvents(old), dispatcher = createNotificationEventDispatcher({ pool, deploymentEnv: "test" }), feed = createNotificationFeed({ pool });
    proofStage = "alternate-key-conflict";
    const beforeA = await financial(); let manualConflicts = 0;
    for (const event of a.events) {
      const permission = event.type === "request.return" ? "orders.fulfill" : "refunds.write";
      const id = await seedAlternateKey(old.admin.userId, a.purchase.checkout.orderId, event.id, event.type, permission);
      await feed.markNotificationRead(old.admin, id, "operator"); const existing = await rowsFor(event.id, old.admin.userId);
      await assert.rejects(dispatcher.dispatchNotificationEvent({ eventId: event.id, orderId: a.purchase.checkout.orderId }), error => { assert.equal((error as { code: string }).code, "CONFIGURATION"); assert.equal((error as { status: number }).status, 503); manualConflicts++; return true; });
      assert.deepEqual(await rowsFor(event.id, old.admin.userId), existing);
    }
    assert.deepEqual(await financial(), beforeA);
    await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])', [[old.admin.userId, old.customer.userId]]);
    proofStage = "prior-event-current-owner";
    const current = await commerceFixture(pool), b = await purchaseEvents(current);
    for (const event of b.events) await seedAlternateKey(current.admin.userId, b.purchase.checkout.orderId, event.id, event.type, event.type === "request.return" ? "orders.fulfill" : "refunds.write");
    const beforeB = await financial();
    for (const event of a.events) assert.equal((await dispatcher.dispatchNotificationEvent({ eventId: event.id, orderId: a.purchase.checkout.orderId })).insertedMessages, 1);
    const four = await feed.listOperatorNotifications(current.admin); assert.equal(four.items.length, 4); assert.equal(four.totalItems, 4);
    const keys = (await pool.query<{ event_key: string }>("SELECT event_key FROM notification_message WHERE user_id=$1 AND audience='operator'", [current.admin.userId])).rows;
    assert.equal(keys.filter(row => row.event_key.startsWith("qa-notification-operator:")).length, 2); assert.equal(keys.filter(row => row.event_key.startsWith("notification:v2:")).length, 2);
    assert.equal((await pool.query("SELECT source_event_id FROM notification_message WHERE user_id=$1 AND audience='operator' GROUP BY source_event_id HAVING count(*)>1", [current.admin.userId])).rowCount, 0);
    assert.deepEqual(await financial(), beforeB);

    // Fresh own events use only the real dispatcher; no alternate key or copied template.
    proofStage = "canonical-replay";
    const clean = await purchaseEvents(current), beforeClean = await financial(); let canonicalPreserved = 0;
    const observedStatuses = new Set<string>(), pendingOnlyRejected: string[] = [];
    for (const event of clean.events) {
      const input = { eventId: event.id, orderId: clean.purchase.checkout.orderId };
      assert.equal((await dispatcher.dispatchNotificationEvent(input)).insertedMessages, 2);
      const canonical = (await rowsFor(event.id, current.admin.userId))[0]!; assert.match(canonical.event_key, /^notification:v2:[a-f0-9]{64}$/u);
      await feed.markNotificationRead(current.admin, canonical.id, "operator"); const saved = await rowsFor(event.id, current.admin.userId);
      assert.equal((await dispatcher.dispatchNotificationEvent(input)).insertedMessages, 0); assert.deepEqual(await rowsFor(event.id, current.admin.userId), saved); canonicalPreserved++;
      await sourceNotificationEvent(pool, input.orderId, event.type as "request.return" | "refund.pending"); observedStatuses.add("pending");
      proofStage = "selected-worker";
      const job = (await pool.query("SELECT * FROM outbox_job WHERE dedupe_key=$1", [`notification:event:${event.id}`])).rows[0]!;
      const selectedPool = { query: async (sql: string, values?: unknown[]) => {
        if (sql.startsWith("UPDATE outbox_job SET status='running'")) return pool.query("UPDATE outbox_job SET status='running',attempts=attempts+1,locked_until=now()+interval '60 seconds' WHERE id=$1 AND type='notification.event' AND (status='pending' OR (status='running' AND locked_until<now())) AND available_at<=now() RETURNING *", [job.id]);
        if (!sql.startsWith("UPDATE outbox_job SET status=") || !values?.some(value => value === job.id)) throw new Error("Refusing a nonowned regression worker operation");
        return pool.query(sql, values);
      } } as unknown as pg.Pool;
      const worker = createJobs({ pool: selectedPool, commerce: current.commerce, dispatchNotificationEvent: async payload => {
        assert.deepEqual(payload, input); const status = (await pool.query("SELECT status FROM outbox_job WHERE id=$1", [job.id])).rows[0]!.status; assert.equal(status, "running"); observedStatuses.add(status);
        await assert.rejects(pendingOnlyBaseline(event.id)); pendingOnlyRejected.push("running");
        assert.equal(await sourceNotificationEvent(pool, input.orderId, event.type as "request.return" | "refund.pending"), event.id);
        return dispatcher.dispatchNotificationEvent(payload);
      } });
      assert.deepEqual(await worker.tick(), { expired: 0, processed: 1 });
      assert.equal((await pool.query("SELECT status FROM outbox_job WHERE id=$1", [job.id])).rows[0]!.status, "completed"); observedStatuses.add("completed");
      await assert.rejects(pendingOnlyBaseline(event.id)); pendingOnlyRejected.push("completed");
      assert.equal(await sourceNotificationEvent(pool, input.orderId, event.type as "request.return" | "refund.pending"), event.id);
      assert.deepEqual(await rowsFor(event.id, current.admin.userId), saved); assert.deepEqual(await worker.tick(), { expired: 0, processed: 0 });
    }
    assert.deepEqual(await financial(), beforeClean); assert.deepEqual(await publicState(), beforePublic);
    assert.deepEqual([...observedStatuses].sort(), ["completed", "pending", "running"]);
    assert.equal(pendingOnlyRejected.length, 4);
    // Corrected selected-job core operates in this generated DML schema only.
    const canonicalFixture = await commerceFixture(pool), next = await purchaseEvents(canonicalFixture), beforeDelivery = await financial();
    const expectedReads = await rowsFor(clean.events[0]!.id, current.admin.userId);
    const delivered = await deliverOwnedNotificationJobs(pool, { orderId: next.purchase.checkout.orderId, customerUserId: canonicalFixture.customer.userId, operatorUserIds: [canonicalFixture.admin.userId] }, "test");
    assert.equal(delivered.completedJobs, 6); assert.equal(delivered.processedJobs, 6);
    const replay = await deliverOwnedNotificationJobs(pool, { orderId: next.purchase.checkout.orderId, customerUserId: canonicalFixture.customer.userId, operatorUserIds: [canonicalFixture.admin.userId] }, "test");
    assert.equal(replay.completedJobs, 6); assert.equal(replay.processedJobs, 0);
    assert.deepEqual(await rowsFor(clean.events[0]!.id, current.admin.userId), expectedReads);
    assert.deepEqual(await financial(), beforeDelivery); assert.deepEqual(await publicState(), beforePublic);
    result = { scope: "isolated-notification-fixture-coexistence", manualDispatcherConflicts: manualConflicts, legitimateOwnerRows: 4, sameEventDuplicates: 0, priorEventCanonicalRows: 2, canonicalReplayPreservedRows: canonicalPreserved, observedJobStatuses: [...observedStatuses].sort(), pendingOnlyGuardRejects: pendingOnlyRejected.length, correctedOwnedJobs: delivered.completedJobs, correctedReplayProcessed: replay.processedJobs, financialStateUnchanged: true, publicQueueReservationsUnchanged: true, nativeAuthenticationProved: false, elapsedMs: Math.round(performance.now() - started) };
  } finally { await isolated.close(); }
  return { ...result, ownedSchemaCleanupVerified: true };
}

void proveNotificationFixtureCoexistence()
  .then(result => console.log(JSON.stringify(result)))
  .catch(async error => { await writeFile(".local/notification-fixture-regression-correction-error-private.json", JSON.stringify({ stage: proofStage, name: error?.name, code: error?.code, actual: error?.actual, expected: error?.expected, stack: error?.stack }), { mode: 0o600, flag: "wx" }); console.error(JSON.stringify({ scope: "isolated-notification-fixture-coexistence", stage: proofStage, outcome: "failed" })); process.exitCode = 1; });
