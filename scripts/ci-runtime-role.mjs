import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CI_DATABASE, CI_OWNER_ROLE, CI_APP_ROLE, CI_HOST, CI_PORT, CI_OWNER_URL, assertCiEnvironment } from "./ci-config.mjs";

function requireTrue(value) { if (!value) throw new Error("CI database identity contract rejected"); }
export function validateCiDatabaseConfiguration(settings, environment = process.env) {
  assertCiEnvironment(environment);
  requireTrue(settings?.DEPLOYMENT_ENV === "test" && settings.PAYMENT_PROVIDER === "mock" && settings.SMS_PROVIDER === "mock" && settings.MIGRATION_DATABASE_URL === CI_OWNER_URL);
  requireTrue(typeof settings.DATABASE_URL === "string" && !/[\s\0?#]/u.test(settings.DATABASE_URL));
  let url; try { url = new URL(settings.DATABASE_URL); } catch { requireTrue(false); }
  requireTrue(url.protocol === "postgresql:" && url.hostname === CI_HOST && url.port === String(CI_PORT) && url.pathname === `/${CI_DATABASE}` && url.username === CI_APP_ROLE);
  requireTrue(new RegExp(`^postgresql://${CI_APP_ROLE}:[0-9a-f]{64}@127\\.0\\.0\\.1:${CI_PORT}/${CI_DATABASE}$`, "u").test(settings.DATABASE_URL));
  return { host: CI_HOST, port: CI_PORT, database: CI_DATABASE, runtimeRole: CI_APP_ROLE, migrationRole: CI_OWNER_ROLE };
}
const OWNER_IDENTITY = `SELECT current_database() AS database,current_user AS role,session_user AS session_role,current_setting('server_version_num')::integer AS version,r.rolsuper AS superuser FROM pg_roles r WHERE r.rolname=current_user`;
const ROLE_IDENTITY = `SELECT r.rolname AS role,r.rolcanlogin AS login,r.rolsuper AS superuser,r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolinherit AS inherit,r.rolreplication AS replication,r.rolbypassrls AS bypassrls,(SELECT count(*)::integer FROM pg_auth_members m WHERE m.member=r.oid) AS memberships,has_database_privilege(r.oid,'${CI_DATABASE}','CONNECT') AS connect,has_database_privilege(r.oid,'${CI_DATABASE}','CREATE') AS database_create,has_database_privilege(r.oid,'${CI_DATABASE}','TEMP') AS temporary,has_schema_privilege(r.oid,'public','USAGE') AS usage,has_schema_privilege(r.oid,'public','CREATE') AS schema_create FROM pg_roles r WHERE r.rolname='${CI_APP_ROLE}'`;
const DEFAULTS = [
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${CI_OWNER_ROLE} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${CI_APP_ROLE}`,
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${CI_OWNER_ROLE} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${CI_APP_ROLE}`,
];
const TABLE_PRIVILEGES = `SELECT count(*)::integer AS count,count(*) FILTER(WHERE pg_get_userbyid(c.relowner)<>'${CI_OWNER_ROLE}' OR NOT has_table_privilege('${CI_APP_ROLE}',c.oid,'SELECT') OR NOT has_table_privilege('${CI_APP_ROLE}',c.oid,'INSERT') OR NOT has_table_privilege('${CI_APP_ROLE}',c.oid,'UPDATE') OR NOT has_table_privilege('${CI_APP_ROLE}',c.oid,'DELETE') OR has_table_privilege('${CI_APP_ROLE}',c.oid,'TRUNCATE') OR has_table_privilege('${CI_APP_ROLE}',c.oid,'REFERENCES') OR has_table_privilege('${CI_APP_ROLE}',c.oid,'TRIGGER') OR EXISTS(SELECT FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee='${CI_APP_ROLE}'::regrole AND a.privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE')))::integer AS invalid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')`;
const SEQUENCE_PRIVILEGES = `SELECT count(*)::integer AS count,count(*) FILTER(WHERE pg_get_userbyid(c.relowner)<>'${CI_OWNER_ROLE}' OR NOT has_sequence_privilege('${CI_APP_ROLE}',c.oid,'SELECT') OR NOT has_sequence_privilege('${CI_APP_ROLE}',c.oid,'USAGE') OR has_sequence_privilege('${CI_APP_ROLE}',c.oid,'UPDATE'))::integer AS invalid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'`;
const DEFAULT_PRIVILEGES = `SELECT d.defaclobjtype AS type,a.privilege_type AS privilege FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='${CI_OWNER_ROLE}'::regrole AND d.defaclnamespace='public'::regnamespace AND a.grantee='${CI_APP_ROLE}'::regrole ORDER BY d.defaclobjtype,a.privilege_type`;
function validRole(role) {
  requireTrue(role?.role === CI_APP_ROLE && role.login === true && role.memberships === 0 && role.connect === true && role.usage === true);
  for (const key of ["superuser", "createdb", "createrole", "inherit", "replication", "bypassrls", "database_create", "temporary", "schema_create"]) requireTrue(role[key] === false);
}
async function ownerIdentity(client) {
  const row = (await client.query(OWNER_IDENTITY)).rows[0];
  requireTrue(row?.database === CI_DATABASE && row.role === CI_OWNER_ROLE && row.session_role === CI_OWNER_ROLE && row.version === 180006 && row.superuser === true);
}
async function defaults(client) {
  for (const sql of DEFAULTS) await client.query(sql);
  const actual = (await client.query(DEFAULT_PRIVILEGES)).rows.map(row => `${row.type}:${row.privilege}`).sort();
  requireTrue(JSON.stringify(actual) === JSON.stringify(["r:DELETE", "r:INSERT", "r:SELECT", "r:UPDATE", "S:SELECT", "S:USAGE"].sort()));
}
async function transaction(client, work) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)");
    const result = await work(); await client.query("COMMIT"); return result;
  } catch { await client.query("ROLLBACK"); throw new Error("CI database identity preparation failed"); }
}
export async function initializeCiRuntimeRole(client, settings, environment) {
  validateCiDatabaseConfiguration(settings, environment);
  return transaction(client, async () => {
    await ownerIdentity(client);
    const fresh = (await client.query(`SELECT (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')) AS objects,(SELECT count(*)::integer FROM pg_roles WHERE rolname='${CI_APP_ROLE}') AS roles`)).rows[0];
    requireTrue(fresh?.objects === 0 && fresh.roles === 0);
    // Utility password DDL cannot bind $1. Use a transaction-local private GUC,
    // then PostgreSQL format(%L); the command text contains no password.
    await client.query("SELECT set_config('morphiume.ci_app_password',$1,true)", [new URL(settings.DATABASE_URL).password]);
    await client.query(`DO $ci_role$ BEGIN EXECUTE format('CREATE ROLE ${CI_APP_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',current_setting('morphiume.ci_app_password')); END; $ci_role$`);
    await client.query("SELECT set_config('morphiume.ci_app_password','',true)");
    await client.query(`REVOKE ALL ON DATABASE ${CI_DATABASE} FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${CI_DATABASE} TO ${CI_APP_ROLE}`);
    await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await client.query(`GRANT USAGE ON SCHEMA public TO ${CI_APP_ROLE}`);
    await defaults(client); validRole((await client.query(ROLE_IDENTITY)).rows[0]);
    return { phase: "initialize", initialized: true, runtimeRole: CI_APP_ROLE, database: CI_DATABASE };
  });
}
export async function grantCiRuntimeDml(owner, app, settings, environment) {
  validateCiDatabaseConfiguration(settings, environment);
  const result = await transaction(owner, async () => {
    await ownerIdentity(owner); validRole((await owner.query(ROLE_IDENTITY)).rows[0]);
    await defaults(owner);
    await owner.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${CI_APP_ROLE}`);
    await owner.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${CI_APP_ROLE}`);
    const tables = (await owner.query(TABLE_PRIVILEGES)).rows[0], sequences = (await owner.query(SEQUENCE_PRIVILEGES)).rows[0];
    requireTrue(Number.isInteger(tables?.count) && tables.count > 0 && tables.count <= 100 && tables.invalid === 0);
    requireTrue(Number.isInteger(sequences?.count) && sequences.count >= 0 && sequences.count <= 100 && sequences.invalid === 0);
    return { phase: "grants", database: CI_DATABASE, runtimeRole: CI_APP_ROLE, tableCount: tables.count, sequenceCount: sequences.count };
  });
  // Fresh app authentication is independent of owner assertions, after grants commit.
  const identity = (await app.query(OWNER_IDENTITY)).rows[0];
  requireTrue(identity?.database === CI_DATABASE && identity.role === CI_APP_ROLE && identity.session_role === CI_APP_ROLE && identity.version === 180006 && identity.superuser === false);
  validRole((await app.query(ROLE_IDENTITY)).rows[0]);
  return { ...result, authenticatedRuntimeVerified: true };
}
async function main() {
  assertCiEnvironment(process.env); requireTrue(process.platform === "linux");
  const args = process.argv.slice(2); requireTrue(args.length === 2 && args[0] === "--phase" && ["initialize", "grants"].includes(args[1]));
  const path = resolve(".env.local"), stat = await lstat(path);
  requireTrue(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600 && stat.nlink === 1 && stat.size <= 32 * 1024);
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes; try { bytes = await fd.readFile(); } finally { await fd.close(); }
  const { parse } = await import("dotenv"), settings = parse(bytes); validateCiDatabaseConfiguration(settings, process.env);
  const { default: pg } = await import("pg");
  const options = { host: CI_HOST, port: CI_PORT, database: CI_DATABASE, ssl: false, options: "", connectionTimeoutMillis: 5000 };
  const owner = new pg.Client({ ...options, user: CI_OWNER_ROLE, password: new URL(CI_OWNER_URL).password });
  const app = new pg.Client({ ...options, user: CI_APP_ROLE, password: new URL(settings.DATABASE_URL).password });
  let driverFailed = false; for (const client of [owner, app]) client.on("error", () => { driverFailed = true; });
  let result;
  try {
    await owner.connect();
    if (args[1] === "initialize") result = await initializeCiRuntimeRole(owner, settings, process.env);
    else { await app.connect(); result = await grantCiRuntimeDml(owner, app, settings, process.env); }
    requireTrue(!driverFailed);
  } finally { await owner.end(); await app.end(); }
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("CI database identity preparation failed; private state retained."); process.exitCode = 1; });
}
