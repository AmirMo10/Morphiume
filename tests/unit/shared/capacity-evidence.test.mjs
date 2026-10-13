import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname, basename } from "node:path";
import { CAPACITY_APP_COMMIT, CAPACITY_TOOLS_COMMIT, CAPACITY_SQL, validateCapacityEvidence } from "../../load/validate-capacity-evidence.mjs";

const fixedFailure = { message: "Owned capacity evidence validation failed." };
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "morphiume-capacity-contract-"));
  const ids = Array.from({ length: 200 }, () => randomUUID()), variantIds = ids.map(() => randomUUID());
  const meta = { fixtureId: randomUUID(), createdAt: "2026-10-13T09:00:00.000Z", completedAt: "2026-10-13T09:20:00.000Z", appCommit: CAPACITY_APP_COMMIT, environment: "staging", baseURL: "http://localhost:3100", reconciliationRequired: false };
  const users = ids.map((_, index) => ({ userId: `synthetic-capacity-${index}`, cookies: [{ name: "controlled-test-session", value: "COOKIE_CANARY_NEVER_EXPORT" }] }));
  const final = { ...meta, setupStatus: "complete", productId: ids[0], productIds: ids, variantId: variantIds[0], initialStock: 100000, users };
  const progress = { ...meta, formatVersion: 1, state: "complete", failure: null, setupBudgetMs: 1800000, products: ids.map((id, index) => ({ id, variantId: variantIds[index], phase: "created" })), accounts: users.map(user => ({ userId: user.userId, phase: "session-ready" })) };
  const latest = { ...meta, formatVersion: 1, state: "complete" };
  for (const [name, value] of [["load-fixture.json", final], [`load-setup-progress-${meta.fixtureId}.json`, progress], ["load-setup-latest.json", latest]]) await writeFile(join(directory, name), JSON.stringify(value), { mode: 0o600 });
  const configuration = { DATABASE_URL: "postgresql://morphiume_runtime_app:PRIVATE_PASSWORD_CANARY@127.0.0.1:15434/morphiume_staging_runtime", APP_BASE_URL: meta.baseURL, LOAD_BASE_URL: meta.baseURL, LOAD_APP_COMMIT: CAPACITY_APP_COMMIT, LOAD_TOOLS_COMMIT: CAPACITY_TOOLS_COMMIT, DEPLOYMENT_ENV: "staging", PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock" };
  return { directory, configuration, final, progress, latest };
}
function fakeClient() {
  const rows = {
    identity: { database_ok: true, role_ok: true, restricted: true, no_ddl: true, migrations: 13, tables: 53 },
    stock: { products: 200, variants: 200, products_with_variant: 200, purchase_variants: 1, published: 200, archived: 0, violations: 0, other_sku_changes: 0, purchase_on_hand: 99997, purchase_reserved: 2 },
    finance: { orders: 5, committed_orders: 3, committed_units: 3, money_violations: 0, commit_violations: 0, stock_commits: 3, active_reserved: 2, foreign_orders: 0 },
    cleanup: { users: 200, disabled: 0, sessions: 200, users_with_session: 200 },
  };
  const calls = []; let released = 0;
  const client = { async query(sql, values) { calls.push({ sql, values }); const key = Object.keys(CAPACITY_SQL).find(key => CAPACITY_SQL[key] === sql); return { rows: key ? [rows[key]] : [] }; }, release() { released++; } };
  return { rows, calls, client, releaseCount: () => released };
}
async function scenario(action) {
  const f = await fixture(), fake = fakeClient(); let connects = 0;
  const run = options => validateCapacityEvidence(f.configuration, { directory: f.directory, connect: async () => { connects++; return fake.client; }, ...options });
  try { await action(f, fake, run, () => connects); }
  finally { const target = resolve(f.directory); assert.equal(dirname(target), resolve(tmpdir())); assert(basename(target).startsWith("morphiume-capacity-contract-")); await rm(target, { recursive: true, force: true }); }
}
test("complete owned fixture is inspected in one bounded read-only snapshot and exports counts only", async () => scenario(async (f, fake, run) => {
  const result = await run(); assert.equal(result.status, "passed"); assert.equal(result.stock.variants, 200); assert.equal(result.finance.committed_orders, 3);
  assert.deepEqual(fake.calls.map(call => call.sql), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout='3s'", CAPACITY_SQL.identity, CAPACITY_SQL.stock, CAPACITY_SQL.finance, CAPACITY_SQL.cleanup, "COMMIT"]);
  assert.deepEqual(fake.calls[3].values, [f.final.productIds, f.final.variantId, f.final.fixtureId]); assert.deepEqual(fake.calls[4].values, [f.final.users.map(user => user.userId), f.final.variantId]); assert.equal(fake.releaseCount(), 1);
  const output = JSON.stringify(result); for (const secret of ["COOKIE_CANARY_NEVER_EXPORT", "PRIVATE_PASSWORD_CANARY", f.final.fixtureId, f.final.users[0].userId, f.final.variantId, "postgresql://"]) assert(!output.includes(secret));
}));
for (const [name, mutate] of [
  ["owner credential", c => { c.DATABASE_URL = c.DATABASE_URL.replace("morphiume_runtime_app:", "morphiume_runtime_owner:"); }],
  ["original database", c => { c.DATABASE_URL = c.DATABASE_URL.replace("morphiume_staging_runtime", "morphiume_staging"); }],
  ["wrong tunnel", c => { c.DATABASE_URL = c.DATABASE_URL.replace("15434", "15433"); }],
  ["query override", c => { c.DATABASE_URL += "?database=live"; }],
  ["wrong app origin", c => { c.APP_BASE_URL = "http://localhost:3004"; }],
  ["wrong app source", c => { c.LOAD_APP_COMMIT = "a".repeat(40); }],
  ["missing explicit tools source", c => { delete c.LOAD_TOOLS_COMMIT; }],
  ["different fixture path", c => { c.LOAD_FIXTURE = "foreign/load-fixture.json"; }],
]) test(`refuses ${name} before connection`, async () => scenario(async (f, fake, run, connects) => { mutate(f.configuration); await assert.rejects(run(), fixedFailure); assert.equal(connects(), 0); assert.equal(fake.calls.length, 0); }));
test("a newer incomplete setup cannot fall back to a complete old fixture", async () => scenario(async (f, fake, run, connects) => {
  await writeFile(join(f.directory, "load-setup-latest.json"), JSON.stringify({ ...f.latest, fixtureId: randomUUID(), state: "partial" })); await assert.rejects(run(), fixedFailure); assert.equal(connects(), 0); assert.equal(fake.calls.length, 0);
}));
for (const key of ["database_ok", "role_ok", "restricted", "no_ddl"]) test(`refuses failed runtime ${key} before business queries`, async () => scenario(async (_, fake, run) => {
  fake.rows.identity[key] = false; await assert.rejects(run(), fixedFailure); assert.equal(fake.calls.at(-1).sql, "ROLLBACK"); assert.equal(fake.calls.some(call => call.sql === CAPACITY_SQL.stock), false); assert.equal(fake.releaseCount(), 1);
}));
for (const [name, mutate] of [
  ["missing owned variant", r => { r.stock.variants = 199; }],
  ["two variants for one product", r => { r.stock.variants = 201; }],
  ["nonpurchase SKU changed", r => { r.stock.other_sku_changes = 1; }],
  ["balance/seed/ledger violation", r => { r.stock.violations = 1; }],
  ["item subtotal or currency amount violation", r => { r.finance.money_violations = 1; }],
  ["receipt amount or shipment/commit violation", r => { r.finance.commit_violations = 1; }],
  ["second stock commit", r => { r.finance.stock_commits = 4; }],
  ["unexplained stock reduction", r => { r.stock.purchase_on_hand--; }],
  ["reservation sum mismatch", r => { r.finance.active_reserved++; }],
  ["foreign order references owned SKU", r => { r.finance.foreign_orders = 1; }],
  ["unexpected result field", r => { r.stock.secret = "COOKIE_CANARY_NEVER_EXPORT"; }],
  ["noninteger count", r => { r.finance.orders = "5"; }],
]) test(`rejects ${name} with rollback and no writes`, async () => scenario(async (_, fake, run) => {
  mutate(fake.rows); await assert.rejects(run(), fixedFailure); assert.equal(fake.calls.at(-1).sql, "ROLLBACK"); assert.equal(fake.calls.some(call => /^(?:UPDATE|DELETE|INSERT|ALTER|CREATE|TRUNCATE)\b/u.test(call.sql)), false); assert.equal(fake.releaseCount(), 1);
}));
test("optional cleanup acceptance requires all200 archived/disabled and zero session rows", async () => scenario(async (_, fake, run) => {
  Object.assign(fake.rows.stock, { published: 0, archived: 200 }); Object.assign(fake.rows.cleanup, { disabled: 200, sessions: 0, users_with_session: 0 }); const result = await run({ expectCleanup: true }); assert.equal(result.expectCleanup, true); assert.equal(result.cleanup.sessions, 0);
}));
for (const [name, mutate] of [
  ["one enabled user", r => { r.cleanup.disabled = 199; }], ["retained session", r => { r.cleanup.sessions = 1; }], ["one published product", r => { r.stock.archived = 199; }],
]) test(`cleanup refuses ${name}`, async () => scenario(async (_, fake, run) => {
  Object.assign(fake.rows.stock, { published: 0, archived: 200 }); Object.assign(fake.rows.cleanup, { disabled: 200, sessions: 0, users_with_session: 0 }); mutate(fake.rows); await assert.rejects(run({ expectCleanup: true }), fixedFailure);
}));
test("a raw database/credential error is reduced to the fixed failure", async () => scenario(async (_, fake, run) => {
  const original = fake.client.query; fake.client.query = async (sql, values) => { if (sql === CAPACITY_SQL.stock) throw new Error("PRIVATE_PASSWORD_CANARY raw SQL row cookie"); return original(sql, values); }; await assert.rejects(run(), fixedFailure); assert.equal(fake.calls.at(-1).sql, "ROLLBACK"); assert.equal(fake.releaseCount(), 1);
}));
test("release failure does not export a raw error or an accepted result", async () => scenario(async (_, fake, run) => {
  fake.client.release = () => { throw new Error("PRIVATE_PASSWORD_CANARY release"); }; await assert.rejects(run(), fixedFailure);
}));
test("unexpected extra aggregate rows are refused instead of silently using the first", async () => scenario(async (_, fake, run) => {
  const original = fake.client.query; fake.client.query = async (sql, values) => { const result = await original(sql, values); return sql === CAPACITY_SQL.stock ? { rows: [...result.rows, { secret: "COOKIE_CANARY_NEVER_EXPORT" }] } : result; }; await assert.rejects(run(), fixedFailure); assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
}));
