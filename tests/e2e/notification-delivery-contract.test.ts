import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { createHash } from "node:crypto";
import type { NotificationPageDto } from "../../src/contracts/notifications";
import { deliverOwnedNotificationJobs, parseOwnedNotificationInput } from "./notification-delivery-core";
import { assertCanonicalOperatorPage } from "./notification-fixtures";

const orderId = "11111111-1111-4111-8111-111111111111", operatorId = "22222222-2222-4222-8222-222222222222";
const input = { orderId, customerUserId: "nativeCustomerFixture", operatorUserIds: [operatorId] };
test("native customer identifiers are accepted without exposing or assuming UUID auth IDs", () => {
  const result = parseOwnedNotificationInput(input); assert.deepEqual(result, input);
  result.operatorUserIds.push("33333333-3333-4333-8333-333333333333"); assert.equal(input.operatorUserIds.length, 1);
});
test("strict input rejects extra keys, accessors, prototype objects and nonobjects before I/O", () => {
  for (const value of [null, [], "fixture", { ...input, role: "owner" }, Object.create(input), { ...input, get orderId() { throw new Error("Accessor must not run"); } }]) assert.throws(() => parseOwnedNotificationInput(value));
});
test("input rejects traversal identifiers, wrong UUIDs and oversized/duplicate operator lists", () => {
  for (const value of [{ ...input, orderId: "../event" }, { ...input, customerUserId: "x".repeat(129) }, { ...input, operatorUserIds: [] }, { ...input, operatorUserIds: [operatorId, operatorId] }, { ...input, operatorUserIds: Array.from({ length: 4 }, () => operatorId) }, { ...input, operatorUserIds: ["fixture"] }, { ...input, customerUserId: operatorId }]) assert.throws(() => parseOwnedNotificationInput(value));
});
const authority = { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, ddl: false, owns_tables: false };
test("all privilege escalation flags fail before order lookup or leasing", async () => {
  for (const key of Object.keys(authority)) {
    let calls = 0;
    const pool = { query: async () => { calls++; return { rows: [{ ...authority, [key]: true }] }; } } as unknown as pg.Pool;
    await assert.rejects(deliverOwnedNotificationJobs(pool, input, "test")); assert.equal(calls, 1);
  }
});
test("foreign order ownership fails with readonly queries only", async () => {
  const queries: string[] = [];
  const pool = { query: async (sql: string) => { queries.push(sql); return { rows: queries.length === 1 ? [authority] : [{ user_id: "foreignFixture" }] }; } } as unknown as pg.Pool;
  await assert.rejects(deliverOwnedNotificationJobs(pool, input, "test")); assert.equal(queries.length, 2); assert(queries.every(sql => sql.startsWith("SELECT")));
});
function jobPool(state: string, malformed = false) {
  const queries: string[] = [];
  const jobs = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"].map((event_id, index) => ({ id: index ? "77777777-7777-4777-8777-777777777777" : "66666666-6666-4666-8666-666666666666", event_id, status: state, payload: { eventId: event_id, orderId: malformed ? operatorId : orderId } }));
  const pool = { query: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM pg_roles")) return { rows: [authority] };
    if (sql.startsWith("SELECT user_id FROM orders")) return { rows: [{ user_id: input.customerUserId }] };
    if (sql.startsWith('SELECT id FROM "user"')) return { rows: [{ id: operatorId }] };
    if (sql.startsWith("SELECT row_to_json")) return { rows: [{ fixtureFinancialSnapshot: true }] };
    if (sql.startsWith("SELECT j.id")) return { rows: jobs };
    if (sql.startsWith("SELECT status,attempts")) return { rows: [{ status: state, attempts: 0, last_error: null }] };
    throw new Error("Unexpected write/lease query");
  } } as unknown as pg.Pool;
  return { pool, queries };
}
test("mismatched own-event payload is rejected before a lease", async () => {
  const { pool, queries } = jobPool("pending", true); await assert.rejects(deliverOwnedNotificationJobs(pool, input, "test")); assert(queries.every(sql => sql.startsWith("SELECT")));
});
test("dead and unknown states stay failures without reset, lease or fallback", async () => {
  for (const state of ["dead", "done", "unexpected"]) { const { pool, queries } = jobPool(state); await assert.rejects(deliverOwnedNotificationJobs(pool, input, "test")); assert(queries.every(sql => sql.startsWith("SELECT"))); }
});
test("already completed owned jobs remain untouched and financial snapshot is compared", async () => {
  const { pool, queries } = jobPool("completed");
  assert.deepEqual(await deliverOwnedNotificationJobs(pool, input, "test"), { scope: "owned-canonical-notification-delivery", completedJobs: 2, processedJobs: 0, financialStateUnchanged: true });
  assert(queries.every(sql => sql.startsWith("SELECT"))); assert.equal(queries.filter(sql => sql.startsWith("SELECT row_to_json")).length, 2);
});

function canonicalRows() {
  return ["88888888-8888-4888-8888-888888888888", "99999999-9999-4999-8999-999999999999"].map((source_event_id, index) => ({
    id: index ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", source_event_id,
    user_id: operatorId, audience: "operator", order_id: orderId, event_order: orderId, kind: "request.return", event_kind: "request.return",
    required_permission: "orders.fulfill", event_key: `notification:v2:${createHash("sha256").update(JSON.stringify([source_event_id, "operator", operatorId])).digest("hex")}`,
    title: "درخواست مرجوعی آزمایشی ثبت شد.", body: "یک تغییر آزمایشی برای بررسی ثبت شد. جزئیات را در سفارش و صف‌های مجاز بررسی کنید.",
    created_at: new Date(`2026-10-13T00:00:0${1 - index}Z`), read_at: null as Date | null,
  }));
}
function model(rows: ReturnType<typeof canonicalRows>, unreadOnly = false) {
  const visible = unreadOnly ? rows.filter(row => row.read_at === null) : rows;
  const page: NotificationPageDto = { items: visible.map(row => ({ id: row.id, kind: "request.return", title: row.title, body: row.body, orderId: row.order_id, createdAt: row.created_at.toISOString(), readAt: row.read_at?.toISOString() ?? null })), page: 1, pageSize: 100, totalItems: visible.length, totalPages: visible.length ? 1 : 0, unreadCount: String(rows.filter(row => row.read_at === null).length) };
  const pool = { query: async () => ({ rows }) } as unknown as pg.Pool;
  return { pool, page };
}
test("legitimate distinct prior-event rows are fully verified rather than filtered out", async () => {
  const { pool, page } = model(canonicalRows()); assert.equal((await assertCanonicalOperatorPage(pool, operatorId, ["orders.fulfill"], page)).totalItems, 2);
});
test("unknown source, alternate key and event-order mismatch remain hard failures", async () => {
  for (const change of [{ source_event_id: "unknown" }, { event_key: "qa-notification-operator:alternate" }, { event_order: operatorId }]) {
    const rows = canonicalRows(); Object.assign(rows[1]!, change); const { pool, page } = model(rows);
    await assert.rejects(assertCanonicalOperatorPage(pool, operatorId, ["orders.fulfill"], page));
  }
});
test("a wrong permission or private/template text cannot pass even when DB and DTO agree", async () => {
  for (const change of [{ required_permission: "refunds.write" }, { body: "PRIVATE_CANARY fixture contact" }]) {
    const rows = canonicalRows(); Object.assign(rows[1]!, change); const { pool, page } = model(rows);
    await assert.rejects(assertCanonicalOperatorPage(pool, operatorId, ["orders.fulfill"], page));
  }
});
test("global count model rejects a dropped legitimate extra row", async () => {
  const rows = canonicalRows(), { pool, page } = model(rows);
  page.items.pop(); page.totalItems = 1; page.unreadCount = "1";
  await assert.rejects(assertCanonicalOperatorPage(pool, operatorId, ["orders.fulfill"], page));
});
test("unread filtering retains and verifies historical read state outside the visible rows", async () => {
  const rows = canonicalRows(); rows[1]!.read_at = new Date("2026-10-13T01:00:00Z"); const { pool, page } = model(rows, true);
  await assertCanonicalOperatorPage(pool, operatorId, ["orders.fulfill"], page, true); assert.equal(page.totalItems, 1); assert.equal(page.unreadCount, "1");
});
test("distinct message IDs for the same event-recipient are not accepted as legitimate extras", async () => {
  const rows = canonicalRows(); rows[1]!.source_event_id = rows[0]!.source_event_id; rows[1]!.event_key = rows[0]!.event_key;
  const { pool, page } = model(rows); await assert.rejects(assertCanonicalOperatorPage(pool, operatorId, ["orders.fulfill"], page));
});
