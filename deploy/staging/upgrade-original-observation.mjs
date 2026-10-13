#!/usr/bin/env node
// Read-only evidence for the ORIGINAL staging database. This is not a migrator.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ORIGINAL_DATABASE = "morphiume_staging";
export const ORIGINAL_APP_ROLE = "morphiume_staging_app";
const OWNER_ROLE = "morphiume_staging_owner";
const HEX = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/u;
const MAX_ROWS = 100_000;
const MAX_PROJECTED_BYTES = 256 * 1024 * 1024;
const MAX_ROW_BYTES = 2 * 1024 * 1024;
export const MIGRATIONS = Object.freeze({
  "0001_initial.sql": "097b2d70c00866c1c9b53d7c456d523a303657f9488b9035782c1c0df080af3c",
  "0002_auth_adjuncts.sql": "e36cd53d36bb82c7af27438a350f089391475213860d7e9aee0ecf052726d524",
  "0003_admin_domain.sql": "d48263261480f54194a7927f0760bd2bb95e246b882177b63e6e45e5a7a16b89",
  "0004_auth_rate_limit_id.sql": "af97c98d7a3775bad6219cfd3b381b638585acaf9f2c7e74ae1cf1bd0a0ea162",
  "0005_bulk_operations.sql": "f65b1b42e258ef29b64448dc0a9b30e298232a37c0aa2bdb7a2e4bfccbef3791",
  "0006_notification_messages.sql": "f00193d5f6b0514255da7ff574b64ce6f47cef551a702cd3491a63c5fc4c8e45",
  "0007_product_images.sql": "6e5d69f37c4aa1426d18e8a4b110ef1178dce9831e57c580f81fd2ea2e6cfa68",
  "0008_slug_claims.sql": "881bbd8ed459ba22ee73f462800a1248bc876e95ad01c11f2169506357eb78da",
  "0009_refund_failure_decisions.sql": "ea41ee686da8089133f6282e9e653825dffa0e0d1f575dfb191e3b57e198979f",
  "0010_return_decisions.sql": "4b0c678ae5ed1e0de613c336873efd9156ff3f3eecfe6e454bc310467c3968d2",
  "0011_product_content.sql": "fc4feb95d5a4ebf4cc8d5f0a7d4b53e83fafa1b6c54fe27b1ef94f81bac5e25a",
  "0012_anonymous_analytics.sql": "5ecc599e8f3be2716d64ba360e9c4be96add27a67fb5011fda8a86747c92dfb4",
  "0013_operator_notifications.sql": "6c3dc95837f75e2fc0f2cae1309346199663ee3f42483d3ffa9f78813fba2f25",
});
export const ORIGINAL_TABLES = Object.freeze((
  "account,address,admin_grant,audit_event,auth_rate_limit,bulk_operation,cart,cart_item,checkout_idempotency,collection,collection_product,collection_slug_claim,content_page,coupon,coupon_redemption,inventory_balance,inventory_ledger,inventory_reservation,media,mock_provider_transaction,mock_sms_delivery,notification_message,order_event,order_item,orders,otp_challenge,outbox_job,payment_attempt,payment_event,payment_receipt,product,product_image,product_slug_claim,refund,refund_failure_decision,return_decision,return_request,role_membership,schema_migration,schema_migration_checksum_audit,session,shipment,store_setting,two_factor,user,variant,verification,verification_challenge,wishlist_item"
).split(",").sort());
export const NEW_TABLES = Object.freeze(["analytics_coverage", "analytics_daily", "analytics_quota", "analytics_seen"]);
const OLD_MIGRATIONS = Object.keys(MIGRATIONS).slice(0, 11);
const NOTIFICATION_COLUMNS = [
  ["audience", "text", true, "'customer'::text"], ["kind", "text", true, "'legacy.order_update'::text"],
  ["order_id", "uuid", false, ""], ["source_event_id", "uuid", false, ""], ["required_permission", "text", false, ""],
];
const NEW_COLUMNS = {
  analytics_seen: [["event_id", "uuid", true, ""], ["fingerprint", "text", true, ""], ["expires_at", "timestamp with time zone", true, ""]],
  analytics_daily: [["day", "date", true, ""], ["kind", "text", true, ""], ["dimension", "text", true, ""], ["count", "bigint", true, ""], ["first_accepted_at", "timestamp with time zone", true, ""], ["last_accepted_at", "timestamp with time zone", true, ""], ["product_dimensions_truncated", "boolean", true, "false"]],
  analytics_quota: [["minute", "timestamp with time zone", true, ""], ["count", "integer", true, ""]],
  analytics_coverage: [["singleton", "boolean", true, "true"], ["started_at", "timestamp with time zone", false, ""], ["last_cleanup_at", "timestamp with time zone", false, ""]],
};
const NEW_CONSTRAINTS = {
  analytics_seen: { analytics_seen_pkey: "p", analytics_seen_fingerprint_check: "c" },
  // Actual PostgreSQL18 catalog names the cross-column inline timestamp CHECK
  // analytics_daily_check4; a column-name guess does not match this migration.
  analytics_daily: { analytics_daily_pkey: "p", analytics_daily_kind_check: "c", analytics_daily_count_check: "c", analytics_daily_check4: "c", analytics_daily_check: "c", analytics_daily_check1: "c", analytics_daily_check2: "c", analytics_daily_check3: "c" },
  analytics_quota: { analytics_quota_pkey: "p", analytics_quota_minute_check: "c", analytics_quota_count_check: "c" },
  analytics_coverage: { analytics_coverage_pkey: "p", analytics_coverage_singleton_check: "c" },
  notification_message: { notification_message_audience_check: "c", notification_message_kind_check: "c", notification_message_required_permission_check: "c", notification_message_order_id_fkey: "f", notification_message_source_event_id_fkey: "f", notification_audience_permission: "c", notification_source_link: "c", notification_v2_text_bounds: "c", notification_operator_kind: "c" },
};
const NEW_INDEXES = {
  analytics_seen: ["analytics_seen_pkey", "analytics_seen_expiry_idx"],
  analytics_daily: ["analytics_daily_pkey", "analytics_daily_report_idx", "analytics_daily_product_dimensions_idx"],
  analytics_quota: ["analytics_quota_pkey"], analytics_coverage: ["analytics_coverage_pkey"],
  notification_message: ["notification_source_recipient_idx", "notification_audience_feed_idx", "notification_audience_unread_idx"],
};

function fail() { throw new Error("Original observation contract rejected"); }
function requireTrue(condition) { if (!condition) fail(); }
export function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function digest(value) { return hash(JSON.stringify(canonical(value))); }
function exactKeys(value, keys) {
  requireTrue(value !== null && typeof value === "object" && !Array.isArray(value));
  requireTrue(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()));
}
function equal(left, right) { requireTrue(digest(left) === digest(right)); }
function uniqueMap(items, key) {
  const map = new Map();
  for (const item of items) { requireTrue(!map.has(item[key])); map.set(item[key], item); }
  return map;
}

// A dedicated small app-DML config is supplied on PRIVATE stdin. No dotenv,
// inherited DATABASE_URL, migration credential or arbitrary pg URI parameters.
export function validateConfiguration(config) {
  exactKeys(config, ["schemaVersion", "DATABASE_URL", "DEPLOYMENT_ENV", "PAYMENT_PROVIDER", "SMS_PROVIDER", "transport"]);
  requireTrue(config.schemaVersion === 1 && config.DEPLOYMENT_ENV === "staging" && config.PAYMENT_PROVIDER === "mock" && config.SMS_PROVIDER === "mock");
  const value = config.DATABASE_URL;
  requireTrue(typeof value === "string" && !/[\s\u0000-\u001f\u007f?#]/u.test(value));
  let url;
  try { url = new URL(value); } catch { fail(); }
  const expected = config.transport === "original-docker" ? ["db", "5432"] : config.transport === "original-host-loopback" ? ["127.0.0.1", "5433"] : [];
  requireTrue(expected.length === 2 && url.protocol === "postgresql:" && url.hostname === expected[0] && url.port === expected[1]);
  requireTrue(url.username === ORIGINAL_APP_ROLE && url.pathname === `/${ORIGINAL_DATABASE}` && /^[^/]+:\/\/[^/?#]+\/morphiume_staging$/u.test(value));
  let password;
  try { password = decodeURIComponent(url.password); } catch { fail(); }
  requireTrue(password.length >= 32 && !/[\u0000-\u001f\u007f]/u.test(password));
  return { host: expected[0], port: Number(expected[1]), user: ORIGINAL_APP_ROLE, database: ORIGINAL_DATABASE };
}
export function validateGate(gate, sourceCommit) {
  exactKeys(gate, ["schemaVersion", "databaseName", "acceptedSourceCommit", "minimumCompatibleNotificationConsumerSource", "migrationManifestSha256", "additionCatalogSha256", "backupManifestSha256", "backupVerified", "writerFreeCapture", "writersStopped", "windowReleased", "notificationActivationForbidden"]);
  requireTrue(COMMIT.test(sourceCommit) && gate.schemaVersion === 1 && gate.databaseName === ORIGINAL_DATABASE);
  requireTrue(gate.acceptedSourceCommit === sourceCommit && gate.minimumCompatibleNotificationConsumerSource === sourceCommit);
  requireTrue(gate.migrationManifestSha256 === digest(MIGRATIONS) && HEX.test(gate.backupManifestSha256) && HEX.test(gate.additionCatalogSha256));
  for (const key of ["backupVerified", "writerFreeCapture", "writersStopped", "windowReleased", "notificationActivationForbidden"]) requireTrue(gate[key] === true);
}
export async function verifyMigrationFiles(directory) {
  equal((await readdir(directory)).sort(), Object.keys(MIGRATIONS));
  for (const [name, expected] of Object.entries(MIGRATIONS)) {
    const path = join(directory, name);
    const stat = await lstat(path);
    requireTrue(stat.isFile() && !stat.isSymbolicLink() && stat.size < 1024 * 1024);
    requireTrue(hash((await readFile(path, "utf8")).replaceAll("\r\n", "\n")) === expected);
  }
  return digest(MIGRATIONS);
}
function identifier(value) { requireTrue(IDENTIFIER.test(value)); return `"${value}"`; }
export function projectionSql(table, columns) {
  requireTrue(ORIGINAL_TABLES.includes(table) || NEW_TABLES.includes(table));
  requireTrue(Array.isArray(columns) && columns.length > 0 && columns.length < 100 && new Set(columns).size === columns.length);
  const projection = `jsonb_build_array(${columns.map(identifier).join(",")})::text`;
  // Only the first11 migration rows belong to the preservation projection.
  const where = table === "schema_migration" ? " WHERE name = ANY($1::text[])" : "";
  return `WITH projected AS (SELECT ${projection} AS payload FROM public.${identifier(table)}${where}), hashed AS (SELECT octet_length(payload) AS bytes,encode(sha256(convert_to(payload,'UTF8')),'hex') AS h FROM projected) SELECT count(*)::text AS count,coalesce(sum(bytes),0)::text AS bytes,coalesce(max(bytes),0)::text AS largest,encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS digest FROM hashed`;
}
function rowEvidence(row) {
  const count = Number(row.count), bytes = Number(row.bytes), largest = Number(row.largest);
  requireTrue(Number.isSafeInteger(count) && count >= 0 && count <= MAX_ROWS && Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_PROJECTED_BYTES && Number.isSafeInteger(largest) && largest >= 0 && largest <= MAX_ROW_BYTES && HEX.test(row.digest));
  return { count, bytes, largest, digest: row.digest };
}
export function validateHistory(history, phase) {
  requireTrue(phase === "before" || phase === "after");
  const names = phase === "before" ? OLD_MIGRATIONS : Object.keys(MIGRATIONS);
  equal(history.map(row => row.name), names);
  for (const row of history) requireTrue(row.checksum === MIGRATIONS[row.name] && HEX.test(row.stampDigest));
}

const IDENTITY_SQL = `SELECT current_database() AS database,current_user AS role,session_user AS session_role,current_setting('server_version_num')::integer AS version,current_setting('transaction_read_only') AS read_only,r.rolsuper AS superuser,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,r.rolbypassrls AS bypass_rls,pg_has_role(current_user,'${OWNER_ROLE}','MEMBER') AS owner_member,has_schema_privilege(current_user,'public','USAGE') AS schema_usage,has_schema_privilege(current_user,'public','CREATE') AS schema_create FROM pg_roles r WHERE r.rolname=current_user`;
const TABLE_SQL = `SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,encode(sha256(convert_to(coalesce(c.relacl::text,''),'UTF8')),'hex') AS acl_digest,
  has_table_privilege(current_user,c.oid,'SELECT') AS can_select,has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,has_table_privilege(current_user,c.oid,'REFERENCES') AS can_reference,has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_grant,
  (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT n.nspname||'.'||co.collname FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE co.oid=a.attcollation) END,'defaultDigest',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex')) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`;
const INDEX_SQL = `SELECT t.relname AS "table",i.relname AS name,x.indisvalid AS valid,x.indisready AS ready,encode(sha256(convert_to(pg_get_indexdef(i.oid),'UTF8')),'hex') AS "definitionDigest" FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname`;
const CONSTRAINT_SQL = `SELECT t.relname AS "table",c.conname AS name,c.contype::text AS type,c.convalidated AS validated,c.condeferrable AS deferrable,c.condeferred AS deferred,encode(sha256(convert_to(pg_get_constraintdef(c.oid),'UTF8')),'hex') AS "definitionDigest" FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype<>'n' ORDER BY t.relname,c.conname`;
const SEQUENCE_SQL = `SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,has_sequence_privilege(current_user,c.oid,'SELECT') AS can_select,has_sequence_privilege(current_user,c.oid,'USAGE') AS can_use,has_sequence_privilege(current_user,c.oid,'UPDATE') AS can_update,encode(sha256(convert_to(jsonb_build_array(c.relacl::text,s.seqtypid,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)::text,'UTF8')),'hex') AS "definitionDigest" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname='public' ORDER BY c.relname`;
const SCHEMA_SQL = `SELECT pg_get_userbyid(n.nspowner) AS owner,encode(sha256(convert_to(coalesce(n.nspacl::text,''),'UTF8')),'hex') AS "aclDigest",(SELECT encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),d.defaclobjtype,d.defaclacl::text)::text,'' ORDER BY d.defaclrole,d.defaclobjtype),''),'UTF8')),'hex') FROM pg_default_acl d WHERE d.defaclnamespace=n.oid) AS "defaultsDigest" FROM pg_namespace n WHERE n.nspname='public'`;
const HISTORY_SQL = `SELECT name,checksum,encode(sha256(convert_to(jsonb_build_array(applied_at)::text,'UTF8')),'hex') AS "stampDigest" FROM public.schema_migration ORDER BY name`;

function validateIdentity(identity) {
  requireTrue(identity.database === ORIGINAL_DATABASE && identity.role === ORIGINAL_APP_ROLE && identity.session_role === ORIGINAL_APP_ROLE && identity.read_only === "on");
  requireTrue(Number.isInteger(identity.version) && identity.version >= 180000 && identity.version < 190000 && identity.schema_usage === true);
  for (const key of ["superuser", "create_db", "create_role", "replication", "bypass_rls", "owner_member", "schema_create"]) requireTrue(identity[key] === false);
}
function validateTable(table) {
  requireTrue(IDENTIFIER.test(table.name) && table.owner === OWNER_ROLE && table.rls === false && table.force_rls === false && HEX.test(table.acl_digest));
  for (const key of ["can_select", "can_insert", "can_update", "can_delete"]) requireTrue(table[key] === true);
  for (const key of ["can_truncate", "can_reference", "can_trigger", "public_grant"]) requireTrue(table[key] === false);
  requireTrue(Array.isArray(table.columns) && table.columns.length > 0 && table.columns.length < 100);
  uniqueMap(table.columns, "name");
  for (const col of table.columns) requireTrue(IDENTIFIER.test(col.name) && Number.isInteger(col.position) && col.position > 0 && HEX.test(col.defaultDigest));
}
function newColumns(actual, expected, firstPosition = 1) {
  requireTrue(actual.length === expected.length);
  for (let i = 0; i < expected.length; i++) {
    const [name, type, notNull, defaultSql] = expected[i], col = actual[i];
    requireTrue(col.name === name && col.position === firstPosition + i && col.type === type && col.notNull === notNull && col.defaultDigest === hash(defaultSql) && col.identity === "" && col.generated === "" && col.collation === (type === "text" ? "pg_catalog.default" : null));
  }
}
function additions(before, after, expected, kind) {
  const old = uniqueMap(before.map(item => ({ ...item, key: `${item.table}.${item.name}` })), "key");
  const current = uniqueMap(after.map(item => ({ ...item, key: `${item.table}.${item.name}` })), "key");
  for (const [key, value] of old) equal(value, current.get(key));
  const added = [...current].filter(([key]) => !old.has(key)).map(([, item]) => item);
  const wanted = Object.entries(expected).flatMap(([table, values]) => (Array.isArray(values) ? values : Object.keys(values)).map(name => `${table}.${name}`)).sort();
  equal(added.map(item => item.key).sort(), wanted);
  for (const item of added) {
    requireTrue(HEX.test(item.definitionDigest));
    if (kind === "constraint") requireTrue(item.type === expected[item.table][item.name] && item.validated === true && item.deferrable === false && item.deferred === false);
    else requireTrue(item.valid === true && item.ready === true);
  }
}
export function validateAdditionReference(reference, sourceCommit, version) {
  exactKeys(reference, ["schemaVersion", "sourceCommit", "migrationManifestSha256", "serverVersionNum", "columns", "indexes", "constraints"]);
  requireTrue(reference.schemaVersion === 1 && reference.sourceCommit === sourceCommit && reference.migrationManifestSha256 === digest(MIGRATIONS) && reference.serverVersionNum === version);
  exactKeys(reference.columns, [...NEW_TABLES, "notification_message"]);
  for (const name of NEW_TABLES) newColumns(reference.columns[name], NEW_COLUMNS[name]);
  newColumns(reference.columns.notification_message, NOTIFICATION_COLUMNS, 8);
  additions([], reference.indexes, NEW_INDEXES, "index"); additions([], reference.constraints, NEW_CONSTRAINTS, "constraint");
}
export function compareObservations(before, after, reference) {
  requireTrue(before.schemaVersion === 1 && after.schemaVersion === 1 && before.phase === "before" && after.phase === "after");
  equal(before.binding, after.binding); equal(before.identity, after.identity); equal(before.schema, after.schema); equal(before.sequences, after.sequences);
  validateIdentity(before.identity); validateIdentity(after.identity);
  validateAdditionReference(reference, before.binding.sourceCommit, before.identity.version);
  requireTrue(digest(reference) === before.binding.additionCatalogSha256);
  validateHistory(before.history, "before"); validateHistory(after.history, "after"); equal(before.history, after.history.slice(0, 11));
  equal(before.tables.map(table => table.name), ORIGINAL_TABLES);
  equal(after.tables.map(table => table.name), [...ORIGINAL_TABLES, ...NEW_TABLES].sort());
  const post = uniqueMap(after.tables, "name");
  for (const old of before.tables) {
    const current = post.get(old.name);
    validateTable(old); validateTable(current);
    const oldColumns = current.columns.slice(0, old.columns.length);
    equal(old.columns, oldColumns);
    const extra = current.columns.slice(old.columns.length);
    if (old.name === "notification_message") { newColumns(extra, NOTIFICATION_COLUMNS, old.columns.at(-1).position + 1); equal(extra, reference.columns.notification_message); }
    else requireTrue(extra.length === 0);
    equal({ ...old, columns: oldColumns }, { ...current, columns: oldColumns });
    equal(before.rows[old.name], after.rows[old.name]);
  }
  for (const name of NEW_TABLES) { validateTable(post.get(name)); newColumns(post.get(name).columns, NEW_COLUMNS[name]); equal(post.get(name).columns, reference.columns[name]); }
  additions(before.indexes, after.indexes, NEW_INDEXES, "index");
  additions(before.constraints, after.constraints, NEW_CONSTRAINTS, "constraint");
  for (const kind of ["indexes", "constraints"]) {
    const oldKeys = new Set(before[kind].map(item => `${item.table}.${item.name}`));
    const added = after[kind].filter(item => !oldKeys.has(`${item.table}.${item.name}`));
    equal(added.sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`)), [...reference[kind]].sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`)));
  }
  requireTrue(after.legacyNotificationInvalidCount === 0 && after.newTableCounts.analytics_coverage === 1);
  for (const name of NEW_TABLES.filter(name => name !== "analytics_coverage")) requireTrue(after.newTableCounts[name] === 0);
  requireTrue(after.coveragePristineCount === 1);
  return { schemaVersion: 1, accepted: true, preservedTableCount: 49, newTableCount: 4, migrationBeforeCount: 11, migrationAfterCount: 13, preservedRowsDigest: digest(before.rows), migrationPrefixDigest: digest(before.history), oldCatalogDigest: digest({ tables: before.tables, indexes: before.indexes, constraints: before.constraints, schema: before.schema, sequences: before.sequences }), newCatalogDigest: digest({ tables: after.tables, indexes: after.indexes, constraints: after.constraints }), bindingDigest: digest(before.binding) };
}

export async function captureOriginalObservation(client, { phase, sourceCommit, toolSourceCommit, gate, baseline, reference }) {
  requireTrue(phase === "before" || phase === "after"); validateGate(gate, sourceCommit); requireTrue(COMMIT.test(toolSourceCommit));
  if (phase === "after") requireTrue(baseline?.phase === "before");
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SELECT set_config('statement_timeout','15000',true),set_config('lock_timeout','1000',true),set_config('TimeZone','UTC',true),set_config('DateStyle','ISO, YMD',true),set_config('extra_float_digits','3',true),set_config('search_path','pg_catalog',true)");
    const identity = (await client.query(IDENTITY_SQL)).rows[0]; validateIdentity(identity);
    validateAdditionReference(reference, sourceCommit, identity.version); requireTrue(digest(reference) === gate.additionCatalogSha256);
    const tables = (await client.query(TABLE_SQL)).rows;
    equal(tables.map(table => table.name), phase === "before" ? ORIGINAL_TABLES : [...ORIGINAL_TABLES, ...NEW_TABLES].sort());
    tables.forEach(validateTable);
    const history = (await client.query(HISTORY_SQL)).rows; validateHistory(history, phase);
    const schema = (await client.query(SCHEMA_SQL)).rows[0];
    requireTrue(schema.owner === OWNER_ROLE && HEX.test(schema.aclDigest) && HEX.test(schema.defaultsDigest));
    const indexes = (await client.query(INDEX_SQL)).rows, constraints = (await client.query(CONSTRAINT_SQL)).rows;
    const sequences = (await client.query(SEQUENCE_SQL)).rows;
    for (const seq of sequences) {
      requireTrue(seq.owner === OWNER_ROLE && seq.can_select === true && seq.can_use === true && seq.can_update === false && HEX.test(seq.definitionDigest));
      seq.stateDigest = (await client.query(`SELECT encode(sha256(convert_to(jsonb_build_array(last_value,is_called)::text,'UTF8')),'hex') AS digest FROM public.${identifier(seq.name)}`)).rows[0].digest;
      requireTrue(HEX.test(seq.stateDigest));
    }
    const rows = {};
    const byName = uniqueMap(tables, "name");
    for (const table of ORIGINAL_TABLES) {
      const columns = (phase === "before" ? byName.get(table).columns : baseline.tables.find(item => item.name === table)?.columns)?.map(col => col.name);
      const params = table === "schema_migration" ? [OLD_MIGRATIONS] : [];
      const where = table === "schema_migration" ? " WHERE name = ANY($1::text[])" : "";
      const count = Number((await client.query(`SELECT count(*)::text AS count FROM (SELECT 1 FROM public.${identifier(table)}${where} LIMIT ${MAX_ROWS + 1}) bounded`, params)).rows[0].count);
      requireTrue(Number.isSafeInteger(count) && count >= 0 && count <= MAX_ROWS);
      rows[table] = rowEvidence((await client.query(projectionSql(table, columns), params)).rows[0]);
      requireTrue(rows[table].count === count);
    }
    const result = { schemaVersion: 1, phase, binding: { sourceCommit, toolSourceCommit, databaseName: ORIGINAL_DATABASE, gateDigest: digest(gate), migrationManifestSha256: digest(MIGRATIONS), additionCatalogSha256: digest(reference), backupManifestSha256: gate.backupManifestSha256 }, identity, tables, history, schema, indexes, constraints, sequences, rows };
    if (phase === "after") {
      result.newTableCounts = {};
      for (const table of NEW_TABLES) result.newTableCounts[table] = Number((await client.query(`SELECT count(*)::text AS count FROM public.${identifier(table)}`)).rows[0].count);
      result.coveragePristineCount = Number((await client.query("SELECT count(*)::text AS count FROM public.analytics_coverage WHERE singleton=true AND started_at IS NULL AND last_cleanup_at IS NULL")).rows[0].count);
      result.legacyNotificationInvalidCount = Number((await client.query("SELECT count(*)::text AS count FROM public.notification_message WHERE audience IS DISTINCT FROM 'customer' OR kind IS DISTINCT FROM 'legacy.order_update' OR order_id IS NOT NULL OR source_event_id IS NOT NULL OR required_permission IS NOT NULL")).rows[0].count);
      result.acceptance = compareObservations(baseline, result, reference);
    }
    return result;
  } finally { await client.query("ROLLBACK"); }
}

// Evidence contains identifiers, counts and digests, never row values. Keep it
// root-private anyway: even counts may reveal sensitive business information.
async function privatePath(path, exists) {
  requireTrue(isAbsolute(path) && /^\/srv\/morphiume\/staging\/original-upgrades\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(before\.json|after\.json|cutover-gates\.json|addition-catalog\.json)$/u.test(path));
  const parent = dirname(path);
  for (let current = parent; current !== "/"; current = dirname(current)) {
    const stat = await lstat(current);
    requireTrue(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o022) === 0);
  }
  requireTrue((await lstat(parent)).mode % 512 === 0o700 && await realpath(parent) === parent);
  if (exists) {
    const stat = await lstat(path);
    requireTrue(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o777) === 0o600 && stat.nlink === 1 && stat.size <= 4 * 1024 * 1024);
  } else {
    try { await lstat(path); fail(); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
async function privateJson(path, trustedDigest) {
  await privatePath(path, true);
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const content = await fd.readFile();
    requireTrue(hash(content) === trustedDigest);
    return JSON.parse(content.toString("utf8"));
  } finally { await fd.close(); }
}
async function main() {
  requireTrue(process.platform === "linux" && process.getuid() === 0);
  const args = process.argv.slice(2), options = {};
  const allowed = ["phase", "source-commit", "tool-source-commit", "tool-sha256", "migration-dir", "gate", "gate-sha256", "addition-catalog", "addition-catalog-sha256", "output", "baseline", "baseline-sha256"];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/u, "");
    requireTrue(args[i]?.startsWith("--") && allowed.includes(key) && typeof args[i + 1] === "string" && !Object.hasOwn(options, key));
    options[key] = args[i + 1];
  }
  requireTrue(["before", "after"].includes(options.phase) && COMMIT.test(options["source-commit"]) && COMMIT.test(options["tool-source-commit"]) && HEX.test(options["tool-sha256"]) && HEX.test(options["gate-sha256"]));
  requireTrue(hash(await readFile(fileURLToPath(import.meta.url))) === options["tool-sha256"]);
  requireTrue(isAbsolute(options["migration-dir"]));
  await verifyMigrationFiles(options["migration-dir"]);
  await privatePath(options.output, false);
  requireTrue(options.output.endsWith(`/${options.phase}.json`));
  const gate = await privateJson(options.gate, options["gate-sha256"]);
  validateGate(gate, options["source-commit"]);
  requireTrue(HEX.test(options["addition-catalog-sha256"]) && dirname(options["addition-catalog"]) === dirname(options.output) && options["addition-catalog"].endsWith("/addition-catalog.json"));
  const reference = await privateJson(options["addition-catalog"], options["addition-catalog-sha256"]);
  requireTrue(digest(reference) === gate.additionCatalogSha256);
  let baseline;
  if (options.phase === "after") {
    requireTrue(HEX.test(options["baseline-sha256"]) && dirname(options.baseline) === dirname(options.output) && options.baseline.endsWith("/before.json"));
    baseline = await privateJson(options.baseline, options["baseline-sha256"]);
  } else requireTrue(!options.baseline && !options["baseline-sha256"]);
  requireTrue(dirname(options.gate) === dirname(options.output));
  let stdin = "";
  for await (const chunk of process.stdin) { stdin += chunk.toString(); requireTrue(Buffer.byteLength(stdin) <= 16 * 1024); }
  const config = JSON.parse(stdin), target = validateConfiguration(config);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000, application_name: "morphiume-original-readonly-observation" });
  let connectionFailed = false;
  // A background driver error must never produce an unhandled raw error dump.
  client.on("error", () => { connectionFailed = true; });
  // Prove pg's parser agrees with the literal URL guard BEFORE connecting.
  for (const [key, value] of Object.entries(target)) requireTrue(client.connectionParameters[key] === value);
  await client.connect();
  let result;
  try { result = await captureOriginalObservation(client, { phase: options.phase, sourceCommit: options["source-commit"], toolSourceCommit: options["tool-source-commit"], gate, baseline, reference }); requireTrue(!connectionFailed); }
  finally { await client.end(); }
  const bytes = JSON.stringify(result) + "\n";
  const fd = await open(options.output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
  console.log(JSON.stringify({ schemaVersion: 1, completed: true, tableCount: result.tables.length, migrationCount: result.history.length, evidenceSha256: hash(bytes), preservationAccepted: result.acceptance?.accepted ?? false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Original read-only observation failed; preserve private evidence and stop cutover."); process.exitCode = 1; });
}
