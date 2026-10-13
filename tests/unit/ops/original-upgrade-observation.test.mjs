import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { ORIGINAL_TABLES, NEW_TABLES, MIGRATIONS, hash, digest, validateConfiguration, validateGate, validateHistory, verifyMigrationFiles, projectionSql, compareObservations as compareActual, captureOriginalObservation as captureActual, validateAdditionReference } from "../../../deploy/staging/upgrade-original-observation.mjs";

const SHA = hash("synthetic only"), SOURCE = "1".repeat(40), TOOL_SOURCE = "2".repeat(40);
const config = () => ({ schemaVersion: 1, DEPLOYMENT_ENV: "staging", PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock", transport: "original-docker", DATABASE_URL: `postgresql://morphiume_staging_app:${"x".repeat(32)}@db:5432/morphiume_staging` });
const gate = () => ({ schemaVersion: 1, databaseName: "morphiume_staging", acceptedSourceCommit: SOURCE, minimumCompatibleNotificationConsumerSource: SOURCE, migrationManifestSha256: digest(MIGRATIONS), additionCatalogSha256: digest(reference()), backupManifestSha256: SHA, backupVerified: true, writerFreeCapture: true, writersStopped: true, windowReleased: true, notificationActivationForbidden: true });
const identity = () => ({ database: "morphiume_staging", role: "morphiume_staging_app", session_role: "morphiume_staging_app", version: 180006, read_only: "on", schema_usage: true, superuser: false, create_db: false, create_role: false, replication: false, bypass_rls: false, owner_member: false, schema_create: false });
const column = (name, position, type = "text", notNull = true, defaultSql = "") => ({ name, position, type, notNull, identity: "", generated: "", collation: type === "text" ? "pg_catalog.default" : null, defaultDigest: hash(defaultSql) });
const table = (name, columns = [column("id", 1)]) => ({ name, owner: "morphiume_staging_owner", rls: false, force_rls: false, acl_digest: SHA, can_select: true, can_insert: true, can_update: true, can_delete: true, can_truncate: false, can_reference: false, can_trigger: false, public_grant: false, columns });
const history = count => Object.entries(MIGRATIONS).slice(0, count).map(([name, checksum]) => ({ name, checksum, stampDigest: hash(name + "original timestamp") }));
const columns = {
  analytics_seen: [["event_id", "uuid", true], ["fingerprint", "text", true], ["expires_at", "timestamp with time zone", true]],
  analytics_daily: [["day", "date", true], ["kind", "text", true], ["dimension", "text", true], ["count", "bigint", true], ["first_accepted_at", "timestamp with time zone", true], ["last_accepted_at", "timestamp with time zone", true], ["product_dimensions_truncated", "boolean", true, "false"]],
  analytics_quota: [["minute", "timestamp with time zone", true], ["count", "integer", true]],
  analytics_coverage: [["singleton", "boolean", true, "true"], ["started_at", "timestamp with time zone", false], ["last_cleanup_at", "timestamp with time zone", false]],
};
const constraints = {
  analytics_seen: { analytics_seen_pkey: "p", analytics_seen_fingerprint_check: "c" },
  analytics_daily: { analytics_daily_pkey: "p", analytics_daily_kind_check: "c", analytics_daily_count_check: "c", analytics_daily_check4: "c", analytics_daily_check: "c", analytics_daily_check1: "c", analytics_daily_check2: "c", analytics_daily_check3: "c" },
  analytics_quota: { analytics_quota_pkey: "p", analytics_quota_minute_check: "c", analytics_quota_count_check: "c" },
  analytics_coverage: { analytics_coverage_pkey: "p", analytics_coverage_singleton_check: "c" },
  notification_message: { notification_message_audience_check: "c", notification_message_kind_check: "c", notification_message_required_permission_check: "c", notification_message_order_id_fkey: "f", notification_message_source_event_id_fkey: "f", notification_audience_permission: "c", notification_source_link: "c", notification_v2_text_bounds: "c", notification_operator_kind: "c" },
};
const indexes = { analytics_seen: ["analytics_seen_pkey", "analytics_seen_expiry_idx"], analytics_daily: ["analytics_daily_pkey", "analytics_daily_report_idx", "analytics_daily_product_dimensions_idx"], analytics_quota: ["analytics_quota_pkey"], analytics_coverage: ["analytics_coverage_pkey"], notification_message: ["notification_source_recipient_idx", "notification_audience_feed_idx", "notification_audience_unread_idx"] };
function reference() {
  return { schemaVersion: 1, sourceCommit: SOURCE, migrationManifestSha256: digest(MIGRATIONS), serverVersionNum: 180006,
    columns: { ...Object.fromEntries(NEW_TABLES.map(name => [name, columns[name].map(([n, t, nullable, def], i) => column(n, i + 1, t, nullable, def))])), notification_message: [["audience", "text", true, "'customer'::text"], ["kind", "text", true, "'legacy.order_update'::text"], ["order_id", "uuid", false], ["source_event_id", "uuid", false], ["required_permission", "text", false]].map(([n, t, nullable, def], i) => column(n, 8 + i, t, nullable, def)) },
    indexes: Object.entries(indexes).flatMap(([name, names]) => names.map(n => ({ table: name, name: n, valid: true, ready: true, definitionDigest: SHA }))),
    constraints: Object.entries(constraints).flatMap(([name, names]) => Object.entries(names).map(([n, type]) => ({ table: name, name: n, type, validated: true, deferrable: false, deferred: false, definitionDigest: SHA }))),
  };
}
const compareObservations = (before, after) => compareActual(before, after, reference());
const captureOriginalObservation = (client, options) => captureActual(client, { ...options, reference: reference() });
test("PG18 observed cross-column check4 name is required; guessed timestamp name is rejected", () => {
  const actual = reference();
  assert.equal(actual.constraints.length, 24);
  validateAdditionReference(actual, SOURCE, 180006);
  const guessed = structuredClone(actual);
  const constraint = guessed.constraints.find(c => c.table === "analytics_daily" && c.name === "analytics_daily_check4");
  assert.ok(constraint);
  constraint.name = "analytics_daily_last_accepted_at_check";
  assert.throws(() => validateAdditionReference(guessed, SOURCE, 180006));
});
function fixtures() {
  const before = { schemaVersion: 1, phase: "before", binding: { sourceCommit: SOURCE, toolSourceCommit: TOOL_SOURCE, databaseName: "morphiume_staging", gateDigest: digest(gate()), migrationManifestSha256: digest(MIGRATIONS), additionCatalogSha256: digest(reference()), backupManifestSha256: SHA }, identity: identity(), schema: { owner: "morphiume_staging_owner", aclDigest: SHA, defaultsDigest: SHA }, tables: ORIGINAL_TABLES.map(name => table(name, name === "notification_message" ? ["id", "user_id", "event_key", "title", "body", "read_at", "created_at"].map((n, i) => column(n, i + 1)) : undefined)), history: history(11), indexes: [{ table: "notification_message", name: "notification_message_user_idx", valid: true, ready: true, definitionDigest: SHA }], constraints: [{ table: "notification_message", name: "notification_message_pkey", type: "p", validated: true, deferrable: false, deferred: false, definitionDigest: SHA }], sequences: [{ name: "schema_migration_checksum_audit_id_seq", definitionDigest: SHA, stateDigest: SHA }], rows: Object.fromEntries(ORIGINAL_TABLES.map(name => [name, { count: name === "schema_migration" ? 11 : 2, bytes: 50, largest: 25, digest: hash(name) }])) };
  const after = structuredClone(before); after.phase = "after"; after.history = history(13);
  const notification = after.tables.find(t => t.name === "notification_message");
  notification.columns.push(...[["audience", "text", true, "'customer'::text"], ["kind", "text", true, "'legacy.order_update'::text"], ["order_id", "uuid", false], ["source_event_id", "uuid", false], ["required_permission", "text", false]].map(([n, t, nullable, def], i) => column(n, 8 + i, t, nullable, def)));
  after.tables.push(...NEW_TABLES.map(name => table(name, columns[name].map(([n, t, nullable, def], i) => column(n, i + 1, t, nullable, def))))); after.tables.sort((a, b) => a.name.localeCompare(b.name));
  after.indexes.push(...Object.entries(indexes).flatMap(([name, names]) => names.map(n => ({ table: name, name: n, valid: true, ready: true, definitionDigest: SHA }))));
  after.constraints.push(...Object.entries(constraints).flatMap(([name, names]) => Object.entries(names).map(([n, type]) => ({ table: name, name: n, type, validated: true, deferrable: false, deferred: false, definitionDigest: SHA }))));
  after.newTableCounts = { analytics_seen: 0, analytics_daily: 0, analytics_quota: 0, analytics_coverage: 1 }; after.coveragePristineCount = 1; after.legacyNotificationInvalidCount = 0;
  return { before, after };
}
test("original-only app credential and exact private transports are accepted", () => {
  assert.equal(validateConfiguration(config()).database, "morphiume_staging");
  const c = config(); c.transport = "original-host-loopback"; c.DATABASE_URL = c.DATABASE_URL.replace("db:5432", "127.0.0.1:5433"); assert.equal(validateConfiguration(c).port, 5433);
});
test("installed pg parser agrees with literal original target without connecting", () => {
  const c = config(); c.DATABASE_URL = c.DATABASE_URL.replace("x".repeat(32), "x".repeat(32) + "%40%3A%2F");
  const expected = validateConfiguration(c), client = new pg.Client({ connectionString: c.DATABASE_URL });
  for (const [key, value] of Object.entries(expected)) assert.equal(client.connectionParameters[key], value);
  assert.equal(client.connectionParameters.password, "x".repeat(32) + "@:/");
});
for (const [name, mutate] of Object.entries({ owner: c => c.DATABASE_URL = c.DATABASE_URL.replace("_app:", "_owner:"), runtime: c => c.DATABASE_URL += "_runtime", queryOverride: c => c.DATABASE_URL += "?host=remote", emptyQuery: c => c.DATABASE_URL += "?", fragment: c => c.DATABASE_URL += "#", normalizedPath: c => c.DATABASE_URL = c.DATABASE_URL.replace("/morphiume_staging", "/other/../morphiume_staging"), encodedDatabase: c => c.DATABASE_URL = c.DATABASE_URL.replace("morphiume_staging", "morphiume%5fstaging"), wrongTransport: c => c.transport = "original-host-loopback", unknownSecret: c => c.MIGRATION_DATABASE_URL = "never allowed", live: c => c.DEPLOYMENT_ENV = "live", nonMock: c => c.SMS_PROVIDER = "kavenegar", shortPassword: c => c.DATABASE_URL = c.DATABASE_URL.replace("x".repeat(32), "x") })) {
  test(`refuses ${name} before database I/O`, () => { const c = config(); mutate(c); assert.throws(() => validateConfiguration(c), /^Error: Original observation contract rejected$/u); });
}
test("cutover gate requires every release/backup/window/no-activation attestation", () => {
  validateGate(gate(), SOURCE);
  for (const key of ["backupVerified", "writerFreeCapture", "writersStopped", "windowReleased", "notificationActivationForbidden"]) { const g = gate(); g[key] = false; assert.throws(() => validateGate(g, SOURCE)); }
  const g = gate(); g.minimumCompatibleNotificationConsumerSource = "3".repeat(40); assert.throws(() => validateGate(g, SOURCE));
});
test("canonical local source names and all13 checksums are verified without PG", async () => {
  assert.equal(await verifyMigrationFiles(resolve("db/migrations")), digest(MIGRATIONS));
  const dir = await mkdtemp(join(tmpdir(), "morphiume-migration-pure-"));
  try { for (const name of Object.keys(MIGRATIONS)) await writeFile(join(dir, name), await readFile(resolve("db/migrations", name))); await writeFile(join(dir, "0013_operator_notifications.sql"), "tampered"); await assert.rejects(verifyMigrationFiles(dir)); }
  finally { for (const name of Object.keys(MIGRATIONS)) await unlink(join(dir, name)); await rmdir(dir); }
});
test("exact11-prefix timestamps and canonical migration checksums cannot change", () => {
  validateHistory(history(11), "before");
  const h = history(13); h[12].name = "0013_other.sql"; assert.throws(() => validateHistory(h, "after"));
  const { before, after } = fixtures(); after.history[0].stampDigest = hash("changed time"); assert.throws(() => compareObservations(before, after));
});
test("49 old projections preserve legacy notifications despite five added columns", () => {
  const { before, after } = fixtures(); const result = compareObservations(before, after);
  assert.equal(result.preservedTableCount, 49); assert.equal(result.migrationAfterCount, 13); assert.equal(result.accepted, true);
  const sql = projectionSql("notification_message", before.tables.find(t => t.name === "notification_message").columns.map(c => c.name));
  assert.match(sql, /jsonb_build_array\("id","user_id","event_key","title","body","read_at","created_at"\)/u); assert.doesNotMatch(sql, /audience|SELECT \*|row_to_json/u);
  assert.match(projectionSql("schema_migration", ["name", "checksum", "applied_at"]), /name = ANY\(\$1::text\[\]\)/u);
});
for (const [name, mutate] of Object.entries({ financialRow: a => a.rows.payment_receipt.digest = hash("lost receipt"), auditAppend: a => a.rows.schema_migration_checksum_audit.count++, schemaAcl: a => a.schema.aclDigest = hash("grant"), sequenceAdvance: a => a.sequences[0].stateDigest = hash("incremented"), oldColumn: a => a.tables.find(t => t.name === "orders").columns[0].type = "integer", oldIndex: a => a.indexes[0].definitionDigest = hash("dropped/rebuilt"), oldConstraint: a => a.constraints[0].definitionDigest = hash("weaker"), grantDDL: a => a.tables.find(t => t.name === "analytics_seen").can_truncate = true, missingDML: a => a.tables.find(t => t.name === "analytics_seen").can_insert = false, publicGrant: a => a.tables.find(t => t.name === "analytics_seen").public_grant = true, newOwner: a => a.tables.find(t => t.name === "analytics_seen").owner = "postgres", unexpectedTable: a => a.tables.push(table("surprise")), missingConstraint: a => a.constraints.pop(), unvalidatedConstraint: a => a.constraints.at(-1).validated = false, wrongNewColumnDefault: a => a.tables.find(t => t.name === "notification_message").columns[7].defaultDigest = hash("operator"), activatedAnalytics: a => a.newTableCounts.analytics_seen = 1, activatedNotifications: a => a.legacyNotificationInvalidCount = 1, changedBinding: a => a.binding.backupManifestSha256 = hash("wrong backup") })) {
  test(`post evidence rejects ${name}`, () => { const { before, after } = fixtures(); mutate(after); assert.throws(() => compareObservations(before, after)); });
}
test("projection refuses hostile identifiers and unknown relations", () => {
  assert.throws(() => projectionSql("orders;DELETE", ["id"])); assert.throws(() => projectionSql("orders", ["id\" FROM public.orders;--"])); assert.throws(() => projectionSql("orders", ["id", "id"]));
});
test("independent reference rejects weakened added checks/index predicates even with correct names", () => {
  for (const kind of ["indexes", "constraints"]) {
    const { before, after } = fixtures(); after[kind].at(-1).definitionDigest = hash("weakened predicate/body"); assert.throws(() => compareObservations(before, after));
  }
  const r = reference(); r.sourceCommit = "3".repeat(40); assert.throws(() => validateAdditionReference(r, SOURCE, 180006));
  assert.throws(() => validateAdditionReference(reference(), SOURCE, 180007));
});
test("wrong reference binding and dangerous role identity cannot accept post evidence", () => {
  const { before, after } = fixtures(); const r = reference(); r.constraints.at(-1).definitionDigest = hash("different reference"); assert.throws(() => compareActual(before, after, r));
  for (const key of ["superuser", "create_role", "owner_member", "schema_create", "bypass_rls"]) { const f = fixtures(); f.before.identity[key] = true; f.after.identity[key] = true; assert.throws(() => compareObservations(f.before, f.after)); }
});
function mockClient({ failure, badIdentity = false, rowCount = "2", phase = "before" } = {}) {
  const fixture = fixtures()[phase], calls = [];
  const client = { calls, async query(sql) {
    calls.push(sql);
    if (failure && sql.includes(failure)) throw new Error("private raw database failure must not escape CLI");
    if (sql.startsWith("BEGIN") || sql === "ROLLBACK" || sql.includes("set_config")) return { rows: [] };
    if (sql.includes("FROM pg_roles")) return { rows: [{ ...identity(), ...(badIdentity ? { schema_create: true } : {}) }] };
    if (sql.includes("c.relkind IN")) return { rows: fixture.tables };
    if (sql.includes("FROM public.schema_migration ORDER")) return { rows: fixture.history };
    if (sql.includes("FROM pg_namespace n WHERE")) return { rows: [fixture.schema] };
    if (sql.includes("FROM pg_index")) return { rows: fixture.indexes };
    if (sql.includes("FROM pg_constraint")) return { rows: fixture.constraints };
    if (sql.includes("JOIN pg_sequence")) return { rows: [] };
    if (sql.includes(" bounded")) return { rows: [{ count: sql.includes('"schema_migration"') ? "11" : rowCount }] };
    if (sql.includes("WITH projected")) return { rows: [{ count: sql.includes('"schema_migration"') ? "11" : rowCount, bytes: "50", largest: "25", digest: SHA }] };
    if (sql.includes("FROM public.notification_message WHERE")) return { rows: [{ count: "0" }] };
    if (sql.includes("FROM public.analytics_coverage WHERE")) return { rows: [{ count: "1" }] };
    if (sql.startsWith("SELECT count(*)") && sql.includes("public.\"analytics_")) return { rows: [{ count: sql.includes("analytics_coverage") ? "1" : "0" }] };
    throw new Error("unexpected mock query");
  } }; return client;
}
test("injected capture starts read-only, projects every49 tables, ends ROLLBACK", async () => {
  const client = mockClient(); const result = await captureOriginalObservation(client, { phase: "before", sourceCommit: SOURCE, toolSourceCommit: TOOL_SOURCE, gate: gate() });
  assert.equal(Object.keys(result.rows).length, 49); assert.equal(client.calls[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(client.calls.at(-1), "ROLLBACK");
  assert.equal(client.calls.filter(sql => sql.includes("WITH projected")).length, 49); assert.ok(client.calls.every(sql => !/^(CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|DROP|COMMIT)/u.test(sql)));
});
test("query failure and forbidden role privileges roll back with no continuation", async () => {
  for (const options of [{ failure: "FROM pg_index" }, { badIdentity: true }, { rowCount: "100001" }]) {
    const client = mockClient(options); await assert.rejects(captureOriginalObservation(client, { phase: "before", sourceCommit: SOURCE, toolSourceCommit: TOOL_SOURCE, gate: gate() })); assert.equal(client.calls.at(-1), "ROLLBACK");
    assert.ok(client.calls.filter(sql => sql.includes("WITH projected")).length < 49);
  }
});
test("post capture reuses the baseline seven notification columns and checks pristine additions", async () => {
  const options = { sourceCommit: SOURCE, toolSourceCommit: TOOL_SOURCE, gate: gate() };
  const before = await captureOriginalObservation(mockClient(), { ...options, phase: "before" });
  const client = mockClient({ phase: "after" });
  const after = await captureOriginalObservation(client, { ...options, phase: "after", baseline: before });
  assert.equal(after.acceptance.accepted, true); assert.equal(after.coveragePristineCount, 1); assert.equal(client.calls.at(-1), "ROLLBACK");
  const projected = client.calls.find(sql => sql.startsWith("WITH projected") && sql.includes('public."notification_message"'));
  assert.doesNotMatch(projected, /audience|source_event_id|required_permission/u);
  assert.ok(client.calls.some(sql => sql.includes("audience IS DISTINCT FROM 'customer'")));
});
test("CLI failure stays fixed/redacted and cannot inherit an ambient owner credential", () => {
  const secret = "synthetic-sensitive-marker-DO-NOT-PRINT";
  const child = spawnSync(process.execPath, [resolve("deploy/staging/upgrade-original-observation.mjs"), "--unknown", secret], { encoding: "utf8", env: { ...process.env, DATABASE_URL: secret, MIGRATION_DATABASE_URL: secret }, input: JSON.stringify({ DATABASE_URL: secret }), timeout: 5000 });
  assert.equal(child.status, 1); assert.equal(child.stdout, ""); assert.equal(child.stderr.trim(), "Original read-only observation failed; preserve private evidence and stop cutover."); assert.ok(!child.stderr.includes(secret));
});
