#!/usr/bin/env node
// Read-only preservation for the separate DEPLOYED RUNTIME database. Never a migrator.
import { constants, createReadStream } from "node:fs";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_DATABASE = "morphiume_staging_runtime";
export const RUNTIME_APP_ROLE = "morphiume_runtime_app";
export const RUNTIME_OWNER_ROLE = "morphiume_runtime_owner";
const HEX = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/u;
const MAX_ROWS = 100_000;
const MAX_PROJECTED_BYTES = 256 * 1024 * 1024;
const MAX_ROW_BYTES = 2 * 1024 * 1024;
import { MIGRATIONS, ORIGINAL_TABLES as PRESERVED_TABLES, NEW_TABLES, hash, digest, projectionSql, verifyMigrationFiles, validateHistory, validateAdditionReference } from "./upgrade-original-observation.mjs";
export { MIGRATIONS, PRESERVED_TABLES, NEW_TABLES, hash, digest, projectionSql, verifyMigrationFiles, validateHistory, validateAdditionReference };
const OLD_MIGRATIONS = Object.keys(MIGRATIONS).slice(0, 11);
function fail() { throw new Error("Runtime preservation contract rejected"); }
function requireTrue(condition) { if (!condition) fail(); }
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
export function validateRuntimeConfiguration(config) {
  exactKeys(config, ["schemaVersion", "DATABASE_URL", "DEPLOYMENT_ENV", "PAYMENT_PROVIDER", "SMS_PROVIDER", "transport"]);
  requireTrue(config.schemaVersion === 1 && config.DEPLOYMENT_ENV === "staging" && config.PAYMENT_PROVIDER === "mock" && config.SMS_PROVIDER === "mock");
  const value = config.DATABASE_URL;
  requireTrue(typeof value === "string" && !/[\s\u0000-\u001f\u007f?#]/u.test(value));
  let url;
  try { url = new URL(value); } catch { fail(); }
  const expected = config.transport === "runtime-docker" ? ["db", "5432"] : config.transport === "runtime-host-loopback" ? ["127.0.0.1", "5433"] : [];
  requireTrue(expected.length === 2 && url.protocol === "postgresql:" && url.hostname === expected[0] && url.port === expected[1]);
  requireTrue(url.username === RUNTIME_APP_ROLE && url.pathname === `/${RUNTIME_DATABASE}` && /^[^/]+:\/\/[^/?#]+\/morphiume_staging_runtime$/u.test(value));
  let password;
  try { password = decodeURIComponent(url.password); } catch { fail(); }
  requireTrue(password.length >= 32 && !/[\u0000-\u001f\u007f]/u.test(password));
  return { host: expected[0], port: Number(expected[1]), user: RUNTIME_APP_ROLE, database: RUNTIME_DATABASE };
}
const RELEASE_KEYS = ["sourceCommit", "testedPlatformConfig", "candidateManifestDigest", "archiveSha256", "opsSha256", "runtimeImageId", "engineProofSha256"];
const CIPHERTEXT_NAMES = ["database.dump.age", "media.tar.gz.age"];
function validateImage(value) {
  exactKeys(value, RELEASE_KEYS);
  requireTrue(COMMIT.test(value.sourceCommit) && value.sourceCommit !== "0".repeat(40));
  for (const key of ["testedPlatformConfig", "candidateManifestDigest", "runtimeImageId"]) requireTrue(/^sha256:[0-9a-f]{64}$/u.test(value[key]));
  for (const key of ["archiveSha256", "opsSha256", "engineProofSha256"]) requireTrue(HEX.test(value[key]));
}
export function validateRuntimeGate(gate, sourceCommit) {
  exactKeys(gate, ["schemaVersion", "databaseName", "acceptedSourceCommit", "acceptedImage", "previousImage", "minimumCompatibleNotificationConsumerSource", "migrationManifestSha256", "additionCatalogSha256", "backupManifestSha256", "backupCiphertextSha256", "backupVerified", "backupEncrypted", "writerFreeCapture", "writersStopped", "windowReleased", "notificationActivationForbidden", "analyticsActivationForbidden"]);
  requireTrue(COMMIT.test(sourceCommit) && sourceCommit !== "0".repeat(40) && gate.schemaVersion === 1 && gate.databaseName === RUNTIME_DATABASE);
  requireTrue(gate.acceptedSourceCommit === sourceCommit && gate.minimumCompatibleNotificationConsumerSource === sourceCommit);
  validateImage(gate.acceptedImage); validateImage(gate.previousImage);
  requireTrue(gate.acceptedImage.sourceCommit === sourceCommit);
  requireTrue(gate.migrationManifestSha256 === digest(MIGRATIONS) && HEX.test(gate.backupManifestSha256) && HEX.test(gate.additionCatalogSha256));
  exactKeys(gate.backupCiphertextSha256, CIPHERTEXT_NAMES);
  for (const name of CIPHERTEXT_NAMES) requireTrue(HEX.test(gate.backupCiphertextSha256[name]));
  for (const key of ["backupVerified", "backupEncrypted", "writerFreeCapture", "writersStopped", "windowReleased", "notificationActivationForbidden", "analyticsActivationForbidden"]) requireTrue(gate[key] === true);
}
export function validateRuntimeBackupManifest(manifest, gate) {
  validateRuntimeGate(gate, gate.acceptedSourceCommit);
  requireTrue(manifest !== null && typeof manifest === "object" && !Array.isArray(manifest) && manifest.database === RUNTIME_DATABASE);
  for (const key of RELEASE_KEYS) requireTrue(manifest[key] === gate.previousImage[key]);
  equal(manifest.ciphertextSha256, gate.backupCiphertextSha256);
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u;
  requireTrue(utc.test(manifest.backupStartUtc) && utc.test(manifest.backupCompleteUtc));
  const start = Date.parse(manifest.backupStartUtc), end = Date.parse(manifest.backupCompleteUtc);
  requireTrue(Number.isFinite(start) && Number.isFinite(end) && end >= start);
  requireTrue(new Date(start).toISOString().slice(0, 19) === manifest.backupStartUtc.slice(0, 19) && new Date(end).toISOString().slice(0, 19) === manifest.backupCompleteUtc.slice(0, 19));
  requireTrue(manifest.businessBaseline?.migrationCount === 11 && HEX.test(manifest.backupOpsSha256));
  for (const key of ["databaseBytesEstimate", "mediaBytes"]) requireTrue(Number.isSafeInteger(manifest[key]) && manifest[key] >= 0);
  requireTrue(manifest.databaseBytesEstimate > 0);
  requireTrue(!Object.hasOwn(manifest, "partial") && !Object.hasOwn(manifest, "error"));
}
function identifier(value) { requireTrue(IDENTIFIER.test(value)); return `"${value}"`; }
function rowEvidence(row) {
  const count = Number(row.count), bytes = Number(row.bytes), largest = Number(row.largest);
  requireTrue(Number.isSafeInteger(count) && count >= 0 && count <= MAX_ROWS && Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_PROJECTED_BYTES && Number.isSafeInteger(largest) && largest >= 0 && largest <= MAX_ROW_BYTES && HEX.test(row.digest));
  return { count, bytes, largest, digest: row.digest };
}
const IDENTITY_SQL = `SELECT current_database() AS database,current_user AS role,session_user AS session_role,current_setting('server_version_num')::integer AS version,current_setting('transaction_read_only') AS read_only,r.rolsuper AS superuser,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,r.rolbypassrls AS bypass_rls,pg_has_role(current_user,'${RUNTIME_OWNER_ROLE}','MEMBER') AS owner_member,has_schema_privilege(current_user,'public','USAGE') AS schema_usage,has_schema_privilege(current_user,'public','CREATE') AS schema_create FROM pg_roles r WHERE r.rolname=current_user`;
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
  requireTrue(identity.database === RUNTIME_DATABASE && identity.role === RUNTIME_APP_ROLE && identity.session_role === RUNTIME_APP_ROLE && identity.read_only === "on");
  requireTrue(Number.isInteger(identity.version) && identity.version >= 180000 && identity.version < 190000 && identity.schema_usage === true);
  for (const key of ["superuser", "create_db", "create_role", "replication", "bypass_rls", "owner_member", "schema_create"]) requireTrue(identity[key] === false);
}
function validateTable(table) {
  requireTrue(IDENTIFIER.test(table.name) && table.owner === RUNTIME_OWNER_ROLE && table.rls === false && table.force_rls === false && HEX.test(table.acl_digest));
  for (const key of ["can_select", "can_insert", "can_update", "can_delete"]) requireTrue(table[key] === true);
  for (const key of ["can_truncate", "can_reference", "can_trigger", "public_grant"]) requireTrue(table[key] === false);
  requireTrue(Array.isArray(table.columns) && table.columns.length > 0 && table.columns.length < 100);
  uniqueMap(table.columns, "name");
  for (const col of table.columns) requireTrue(IDENTIFIER.test(col.name) && Number.isInteger(col.position) && col.position > 0 && HEX.test(col.defaultDigest));
}
function preserveDefinitions(before, after, expected) {
  const old = uniqueMap(before.map(item => ({ ...item, key: item.table + "." + item.name })), "key");
  const current = uniqueMap(after.map(item => ({ ...item, key: item.table + "." + item.name })), "key");
  for (const [key, value] of old) equal(value, current.get(key));
  const added = [...current].filter(([key]) => !old.has(key)).map(([, item]) => { const { key, ...definition } = item; return definition; });
  const sorted = rows => [...rows].sort((a, b) => (a.table + "." + a.name).localeCompare(b.table + "." + b.name));
  equal(sorted(added), sorted(expected));
}
export function compareRuntimeObservations(before, after, reference) {
  requireTrue(before.schemaVersion === 1 && after.schemaVersion === 1 && before.kind === "runtime-preservation" && after.kind === "runtime-preservation" && before.phase === "before" && after.phase === "after");
  equal(before.binding, after.binding); equal(before.identity, after.identity); equal(before.schema, after.schema); equal(before.sequences, after.sequences);
  requireTrue(before.binding.databaseName === RUNTIME_DATABASE && COMMIT.test(before.binding.sourceCommit) && HEX.test(before.binding.sharedHelperSha256));
  validateImage(before.binding.acceptedImage); validateImage(before.binding.previousImage);
  requireTrue(before.binding.acceptedImage.sourceCommit === before.binding.sourceCommit);
  validateIdentity(before.identity); validateIdentity(after.identity);
  requireTrue(before.schema.owner === RUNTIME_OWNER_ROLE && HEX.test(before.schema.aclDigest) && HEX.test(before.schema.defaultsDigest));
  for (const sequence of before.sequences) {
    requireTrue(IDENTIFIER.test(sequence.name) && sequence.owner === RUNTIME_OWNER_ROLE && sequence.can_select === true && sequence.can_use === true && sequence.can_update === false && HEX.test(sequence.definitionDigest) && HEX.test(sequence.stateDigest));
  }
  validateAdditionReference(reference, before.binding.sourceCommit, before.identity.version);
  requireTrue(digest(reference) === before.binding.additionCatalogSha256 && before.binding.migrationManifestSha256 === digest(MIGRATIONS));
  validateHistory(before.history, "before"); validateHistory(after.history, "after"); equal(before.history, after.history.slice(0, 11));
  equal(before.tables.map(table => table.name), PRESERVED_TABLES);
  equal(after.tables.map(table => table.name), [...PRESERVED_TABLES, ...NEW_TABLES].sort());
  exactKeys(before.rows, PRESERVED_TABLES); exactKeys(after.rows, PRESERVED_TABLES);
  const post = uniqueMap(after.tables, "name");
  for (const old of before.tables) {
    const current = post.get(old.name);
    validateTable(old); validateTable(current);
    const oldColumns = current.columns.slice(0, old.columns.length);
    equal(old.columns, oldColumns);
    const extra = current.columns.slice(old.columns.length);
    if (old.name === "notification_message") equal(extra, reference.columns.notification_message);
    else requireTrue(extra.length === 0);
    equal({ ...old, columns: oldColumns }, { ...current, columns: oldColumns });
    rowEvidence(before.rows[old.name]); rowEvidence(after.rows[old.name]);
    equal(before.rows[old.name], after.rows[old.name]);
  }
  for (const name of NEW_TABLES) { validateTable(post.get(name)); equal(post.get(name).columns, reference.columns[name]); }
  preserveDefinitions(before.indexes, after.indexes, reference.indexes);
  preserveDefinitions(before.constraints, after.constraints, reference.constraints);
  exactKeys(after.newTableCounts, NEW_TABLES);
  requireTrue(after.legacyNotificationInvalidCount === 0 && after.newTableCounts.analytics_coverage === 1);
  for (const name of NEW_TABLES.filter(name => name !== "analytics_coverage")) requireTrue(after.newTableCounts[name] === 0);
  requireTrue(after.coveragePristineCount === 1);
  return { schemaVersion: 1, kind: "runtime-preservation", databaseName: RUNTIME_DATABASE, accepted: true, preservedTableCount: 49, newTableCount: 4, migrationBeforeCount: 11, migrationAfterCount: 13, preservedRowsDigest: digest(before.rows), migrationPrefixDigest: digest(before.history), oldCatalogDigest: digest({ tables: before.tables, indexes: before.indexes, constraints: before.constraints, schema: before.schema, sequences: before.sequences }), newCatalogDigest: digest({ tables: after.tables, indexes: after.indexes, constraints: after.constraints }), bindingDigest: digest(before.binding) };
}

export async function captureRuntimeObservation(client, { phase, sourceCommit, toolSourceCommit, sharedHelperSha256, gate, baseline, reference }) {
  requireTrue(phase === "before" || phase === "after"); validateRuntimeGate(gate, sourceCommit); requireTrue(COMMIT.test(toolSourceCommit) && toolSourceCommit !== "0".repeat(40) && HEX.test(sharedHelperSha256));
  if (phase === "after") {
    requireTrue(baseline?.phase === "before" && baseline.kind === "runtime-preservation" && baseline.binding?.databaseName === RUNTIME_DATABASE);
    equal(baseline.binding.gateDigest, digest(gate));
  }
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SELECT set_config('statement_timeout','15000',true),set_config('lock_timeout','1000',true),set_config('TimeZone','UTC',true),set_config('DateStyle','ISO, YMD',true),set_config('extra_float_digits','3',true),set_config('search_path','pg_catalog',true)");
    const identity = (await client.query(IDENTITY_SQL)).rows[0]; validateIdentity(identity);
    validateAdditionReference(reference, sourceCommit, identity.version); requireTrue(digest(reference) === gate.additionCatalogSha256);
    const tables = (await client.query(TABLE_SQL)).rows;
    equal(tables.map(table => table.name), phase === "before" ? PRESERVED_TABLES : [...PRESERVED_TABLES, ...NEW_TABLES].sort());
    tables.forEach(validateTable);
    const history = (await client.query(HISTORY_SQL)).rows; validateHistory(history, phase);
    const schema = (await client.query(SCHEMA_SQL)).rows[0];
    requireTrue(schema.owner === RUNTIME_OWNER_ROLE && HEX.test(schema.aclDigest) && HEX.test(schema.defaultsDigest));
    const indexes = (await client.query(INDEX_SQL)).rows, constraints = (await client.query(CONSTRAINT_SQL)).rows;
    const sequences = (await client.query(SEQUENCE_SQL)).rows;
    for (const seq of sequences) {
      requireTrue(seq.owner === RUNTIME_OWNER_ROLE && seq.can_select === true && seq.can_use === true && seq.can_update === false && HEX.test(seq.definitionDigest));
      seq.stateDigest = (await client.query(`SELECT encode(sha256(convert_to(jsonb_build_array(last_value,is_called)::text,'UTF8')),'hex') AS digest FROM public.${identifier(seq.name)}`)).rows[0].digest;
      requireTrue(HEX.test(seq.stateDigest));
    }
    const rows = {};
    const byName = uniqueMap(tables, "name");
    for (const table of PRESERVED_TABLES) {
      const columns = (phase === "before" ? byName.get(table).columns : baseline.tables.find(item => item.name === table)?.columns)?.map(col => col.name);
      const params = table === "schema_migration" ? [OLD_MIGRATIONS] : [];
      const where = table === "schema_migration" ? " WHERE name = ANY($1::text[])" : "";
      const count = Number((await client.query(`SELECT count(*)::text AS count FROM (SELECT 1 FROM public.${identifier(table)}${where} LIMIT ${MAX_ROWS + 1}) bounded`, params)).rows[0].count);
      requireTrue(Number.isSafeInteger(count) && count >= 0 && count <= MAX_ROWS);
      rows[table] = rowEvidence((await client.query(projectionSql(table, columns), params)).rows[0]);
      requireTrue(rows[table].count === count);
    }
    const result = { schemaVersion: 1, kind: "runtime-preservation", phase, binding: { sourceCommit, toolSourceCommit, sharedHelperSha256, acceptedImage: gate.acceptedImage, previousImage: gate.previousImage, backupCiphertextSha256: gate.backupCiphertextSha256, databaseName: RUNTIME_DATABASE, gateDigest: digest(gate), migrationManifestSha256: digest(MIGRATIONS), additionCatalogSha256: digest(reference), backupManifestSha256: gate.backupManifestSha256 }, identity, tables, history, schema, indexes, constraints, sequences, rows };
    if (phase === "after") {
      result.newTableCounts = {};
      for (const table of NEW_TABLES) result.newTableCounts[table] = Number((await client.query(`SELECT count(*)::text AS count FROM public.${identifier(table)}`)).rows[0].count);
      result.coveragePristineCount = Number((await client.query("SELECT count(*)::text AS count FROM public.analytics_coverage WHERE singleton=true AND started_at IS NULL AND last_cleanup_at IS NULL")).rows[0].count);
      result.legacyNotificationInvalidCount = Number((await client.query("SELECT count(*)::text AS count FROM public.notification_message WHERE audience IS DISTINCT FROM 'customer' OR kind IS DISTINCT FROM 'legacy.order_update' OR order_id IS NOT NULL OR source_event_id IS NOT NULL OR required_permission IS NOT NULL")).rows[0].count);
      result.acceptance = compareRuntimeObservations(baseline, result, reference);
    }
    return result;
  } finally { await client.query("ROLLBACK"); }
}

// Evidence contains identifiers, counts and digests, never row values. Keep it
// root-private anyway: even counts may reveal sensitive business information.
async function privatePath(path, exists) {
  requireTrue(isAbsolute(path) && /^\/srv\/morphiume\/staging\/runtime\/preservation\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(before\.json|after\.json|cutover-gates\.json|addition-catalog\.json)$/u.test(path));
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
export async function verifyRuntimeBackupFiles(directory, gate) {
  requireTrue(isAbsolute(directory) && /^\/srv\/morphiume\/staging\/runtime\/backups\/\d{8}T\d{6}Z-[0-9a-f]{8}$/u.test(directory));
  // Same protected-parent checks as evidence, without creating or changing paths.
  for (let current = directory; current !== "/"; current = dirname(current)) {
    const stat = await lstat(current);
    requireTrue(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o022) === 0);
  }
  requireTrue((await lstat(directory)).mode % 512 === 0o700 && await realpath(directory) === directory);
  equal((await readdir(directory)).sort(), ["backup-manifest.json", ...CIPHERTEXT_NAMES].sort());
  async function file(name, maximum) {
    const path = join(directory, name), stat = await lstat(path);
    requireTrue(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o777) === 0o600 && stat.nlink === 1 && stat.size > 0 && stat.size <= maximum);
    return path;
  }
  const path = await file("backup-manifest.json", 4 * 1024 * 1024);
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let manifest;
  try { const bytes = await fd.readFile(); requireTrue(hash(bytes) === gate.backupManifestSha256); manifest = JSON.parse(bytes.toString("utf8")); }
  finally { await fd.close(); }
  validateRuntimeBackupManifest(manifest, gate);
  for (const name of CIPHERTEXT_NAMES) {
    const cipher = await file(name, Number.MAX_SAFE_INTEGER);
    const stream = createReadStream(cipher, { flags: constants.O_RDONLY | constants.O_NOFOLLOW });
    const { createHash } = await import("node:crypto");
    const accumulator = createHash("sha256"); let prefix = Buffer.alloc(0);
    for await (const chunk of stream) { accumulator.update(chunk); if (prefix.length < 22) prefix = Buffer.concat([prefix, chunk.subarray(0, 22 - prefix.length)]); }
    requireTrue(prefix.toString("ascii").startsWith("age-encryption.org/v1\n") && accumulator.digest("hex") === gate.backupCiphertextSha256[name]);
  }
  return { verified: true, backupManifestSha256: gate.backupManifestSha256 };
}
async function main() {
  requireTrue(process.platform === "linux" && process.getuid() === 0);
  const args = process.argv.slice(2), options = {};
  const allowed = ["phase", "runtime-source-commit", "runtime-tool-source-commit", "runtime-tool-sha256", "shared-helper-sha256", "migration-dir", "gate", "gate-sha256", "addition-catalog", "addition-catalog-sha256", "backup-directory", "output", "baseline", "baseline-sha256"];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/u, "");
    requireTrue(args[i]?.startsWith("--") && allowed.includes(key) && typeof args[i + 1] === "string" && !Object.hasOwn(options, key)); options[key] = args[i + 1];
  }
  requireTrue(["before", "after"].includes(options.phase) && COMMIT.test(options["runtime-source-commit"]) && COMMIT.test(options["runtime-tool-source-commit"]));
  for (const key of ["runtime-tool-sha256", "shared-helper-sha256", "gate-sha256", "addition-catalog-sha256"]) requireTrue(HEX.test(options[key]));
  requireTrue(hash(await readFile(fileURLToPath(import.meta.url))) === options["runtime-tool-sha256"]);
  requireTrue(hash(await readFile(fileURLToPath(new URL("./upgrade-original-observation.mjs", import.meta.url)))) === options["shared-helper-sha256"]);
  requireTrue(isAbsolute(options["migration-dir"])); await verifyMigrationFiles(options["migration-dir"]);
  await privatePath(options.output, false); requireTrue(options.output.endsWith("/" + options.phase + ".json"));
  requireTrue(dirname(options.gate) === dirname(options.output) && options.gate.endsWith("/cutover-gates.json"));
  const gate = await privateJson(options.gate, options["gate-sha256"]); validateRuntimeGate(gate, options["runtime-source-commit"]);
  requireTrue(dirname(options["addition-catalog"]) === dirname(options.output) && options["addition-catalog"].endsWith("/addition-catalog.json"));
  const reference = await privateJson(options["addition-catalog"], options["addition-catalog-sha256"]);
  requireTrue(digest(reference) === gate.additionCatalogSha256);
  await verifyRuntimeBackupFiles(options["backup-directory"], gate);
  let baseline;
  if (options.phase === "after") {
    requireTrue(HEX.test(options["baseline-sha256"]) && dirname(options.baseline) === dirname(options.output) && options.baseline.endsWith("/before.json")); baseline = await privateJson(options.baseline, options["baseline-sha256"]);
  } else requireTrue(!options.baseline && !options["baseline-sha256"]);
  let stdin = ""; for await (const chunk of process.stdin) { stdin += chunk.toString(); requireTrue(Buffer.byteLength(stdin) <= 16 * 1024); }
  const config = JSON.parse(stdin), target = validateRuntimeConfiguration(config);
  const { default: pg } = await import("pg");
  const password = decodeURIComponent(new URL(config.DATABASE_URL).password);
  const client = new pg.Client({ ...target, password, ssl: false, options: "", connectionTimeoutMillis: 5000, application_name: "morphiume-runtime-readonly-preservation" });
  let connectionFailed = false; client.on("error", () => { connectionFailed = true; });
  for (const [key, value] of Object.entries(target)) requireTrue(client.connectionParameters[key] === value);
  await client.connect(); let result;
  try { result = await captureRuntimeObservation(client, { phase: options.phase, sourceCommit: options["runtime-source-commit"], toolSourceCommit: options["runtime-tool-source-commit"], sharedHelperSha256: options["shared-helper-sha256"], gate, baseline, reference }); requireTrue(!connectionFailed); }
  finally { await client.end(); }
  const bytes = JSON.stringify(result) + "\n", fd = await open(options.output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
  console.log(JSON.stringify({ schemaVersion: 1, kind: "runtime-preservation", databaseName: RUNTIME_DATABASE, completed: true, tableCount: result.tables.length, migrationCount: result.history.length, evidenceSha256: hash(bytes), preservationAccepted: result.acceptance?.accepted ?? false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Runtime read-only preservation failed; preserve private evidence and stop cutover."); process.exitCode = 1; });
}
