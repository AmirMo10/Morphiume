import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CI_APP_ROLE, CI_OWNER_ROLE, CI_DATABASE, CI_OWNER_URL, createCiSettings } from "../../../scripts/ci-config.mjs";
import { validateCiDatabaseConfiguration, initializeCiRuntimeRole, grantCiRuntimeDml } from "../../../scripts/ci-runtime-role.mjs";

const environment = { CI: "true", GITHUB_ACTIONS: "true" };
function settings() { let index = 0; return createCiSettings({ environment, cwd: resolve("."), secret: () => (++index).toString(16).repeat(64) }); }
const role = () => ({ role: CI_APP_ROLE, login: true, memberships: 0, connect: true, usage: true, superuser: false, createdb: false, createrole: false, inherit: false, replication: false, bypassrls: false, database_create: false, temporary: false, schema_create: false });
const identity = app => ({ database: CI_DATABASE, role: app ? CI_APP_ROLE : CI_OWNER_ROLE, session_role: app ? CI_APP_ROLE : CI_OWNER_ROLE, version: 180006, superuser: !app });
const defaultRows = () => ["r:DELETE", "r:INSERT", "r:SELECT", "r:UPDATE", "S:SELECT", "S:USAGE"].map(value => { const [type, privilege] = value.split(":"); return { type, privilege }; });
function client({ app = false, ownerChange = {}, roleChange = {}, objects = 0, roles = 0, tableCount = 53, tableInvalid = 0, sequenceInvalid = 0, defaults = defaultRows(), fail } = {}) {
  const calls = [];
  return { calls, async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (fail && sql.includes(fail)) throw new Error("synthetic-private-driver-error");
    if (sql.includes("session_user AS session_role")) return { rows: [{ ...identity(app), ...ownerChange }] };
    if (sql.includes("AS objects,")) return { rows: [{ objects, roles }] };
    if (sql.includes("AS memberships,")) return { rows: [{ ...role(), ...roleChange }] };
    if (sql.includes("FROM pg_default_acl")) return { rows: defaults };
    if (sql.includes("AS invalid") && sql.includes("relkind IN ('r','p')")) return { rows: [{ count: tableCount, invalid: tableInvalid }] };
    if (sql.includes("AS invalid") && sql.includes("relkind='S'")) return { rows: [{ count: 1, invalid: sequenceInvalid }] };
    return { rows: [] };
  } };
}
test("CI settings split bootstrap migrations from five independently supplied synthetic secrets", () => {
  const value = settings(); assert.equal(value.MIGRATION_DATABASE_URL, CI_OWNER_URL);
  const url = new URL(value.DATABASE_URL); assert.equal(url.username, CI_APP_ROLE); assert.equal(url.pathname, `/${CI_DATABASE}`);
  assert.notEqual(value.DATABASE_URL, value.MIGRATION_DATABASE_URL);
  assert.equal(new Set([url.password, value.AUTH_SECRET, value.ADMIN_AUTH_SECRET, value.MOCK_CONTROL_SECRET, value.BOOTSTRAP_ADMIN_PASSWORD]).size, 5);
});
test("environment is checked before a supplied secret generator can run", () => {
  for (const invalid of [{}, { CI: "true" }, { CI: "false", GITHUB_ACTIONS: "true" }]) {
    let calls = 0; assert.throws(() => createCiSettings({ environment: invalid, cwd: resolve("."), secret: () => { calls++; return "1".repeat(64); } })); assert.equal(calls, 0);
  }
});
test("short, reused or malformed synthetic secret inputs are rejected without echo", () => {
  for (const value of ["short", "x".repeat(64), "1".repeat(64)]) assert.throws(() => createCiSettings({ environment, cwd: resolve("."), secret: () => value }), /Independent CI secrets required/u);
});
test("safe validation result contains no URL, password or other private configuration", () => {
  const config = settings(), actual = validateCiDatabaseConfiguration(config, environment);
  assert.deepEqual(actual, { host: "127.0.0.1", port: 5432, database: CI_DATABASE, runtimeRole: CI_APP_ROLE, migrationRole: CI_OWNER_ROLE });
  assert.ok(!JSON.stringify(actual).includes(new URL(config.DATABASE_URL).password));
});
for (const [name, mutate] of Object.entries({
  bootstrapRuntime: c => c.DATABASE_URL = c.MIGRATION_DATABASE_URL,
  actualLocalTunnel: c => c.DATABASE_URL = c.DATABASE_URL.replace(":5432/", ":15433/"),
  originalAppRole: c => c.DATABASE_URL = c.DATABASE_URL.replace(CI_APP_ROLE, "morphiume_staging_app"),
  deployedRuntime: c => c.DATABASE_URL += "_runtime",
  remoteHost: c => c.DATABASE_URL = c.DATABASE_URL.replace("127.0.0.1", "192.168.240.51"),
  queryOverride: c => c.DATABASE_URL += "?user=morphiume_ci",
  ownerOverride: c => c.MIGRATION_DATABASE_URL = c.DATABASE_URL,
  live: c => c.DEPLOYMENT_ENV = "live",
  realProvider: c => c.SMS_PROVIDER = "external",
  pathNormalization: c => c.DATABASE_URL = c.DATABASE_URL.replace(`/${CI_DATABASE}`, `/other/../${CI_DATABASE}`),
})) test("rejects " + name + " before owner queries", async () => {
  const config = settings(); mutate(config); const owner = client();
  await assert.rejects(initializeCiRuntimeRole(owner, config, environment)); assert.equal(owner.calls.length, 0);
});
test("fresh initialize atomically creates only the limited app role and default grants", async () => {
  const owner = client(), config = settings(), result = await initializeCiRuntimeRole(owner, config, environment);
  assert.equal(result.initialized, true); assert.equal(owner.calls[0].sql, "BEGIN"); assert.equal(owner.calls.at(-1).sql, "COMMIT");
  const command = owner.calls.find(c => c.sql.startsWith("DO $ci_role$")).sql;
  assert.match(command, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/u);
  assert.match(command, /format\('CREATE ROLE/u); assert.ok(!command.includes(new URL(config.DATABASE_URL).password));
  assert.match(command, /END; \$ci_role\$$/u);
  const passwordCalls = owner.calls.filter(c => c.parameters); assert.equal(passwordCalls.length, 1);
  assert.equal(passwordCalls[0].sql, "SELECT set_config('morphiume.ci_app_password',$1,true)");
  assert.deepEqual(passwordCalls[0].parameters, [new URL(config.DATABASE_URL).password]);
  assert.ok(owner.calls.some(c => c.sql === `REVOKE ALL ON DATABASE ${CI_DATABASE} FROM PUBLIC`));
  assert.ok(!owner.calls.some(c => /ALTER ROLE|DROP ROLE|GRANT.*morphiume_ci TO/u.test(c.sql)));
});
for (const [name, options] of Object.entries({ existingRole: { roles: 1 }, existingTables: { objects: 53 }, wrongOwner: { ownerChange: { role: CI_APP_ROLE } }, wrongDatabase: { ownerChange: { database: "morphiume_staging_runtime" } }, wrongVersion: { ownerChange: { version: 170000 } } })) test("initialize rejects " + name + " without resetting state", async () => {
  const owner = client(options); await assert.rejects(initializeCiRuntimeRole(owner, settings(), environment));
  assert.equal(owner.calls.at(-1).sql, "ROLLBACK"); assert.ok(!owner.calls.some(c => c.sql.startsWith("DO $ci_role$")));
});
test("post-migration grants and repeated grants preserve sequence and future-table defaults", async () => {
  const owner = client(), app = client({ app: true }), config = settings();
  for (let i = 0; i < 2; i++) assert.deepEqual(await grantCiRuntimeDml(owner, app, config, environment), { phase: "grants", database: CI_DATABASE, runtimeRole: CI_APP_ROLE, tableCount: 53, sequenceCount: 1, authenticatedRuntimeVerified: true });
  assert.equal(owner.calls.filter(c => c.sql.startsWith("ALTER DEFAULT PRIVILEGES") && c.sql.includes("ON TABLES")).length, 2);
  assert.equal(owner.calls.filter(c => c.sql.startsWith("GRANT USAGE,SELECT ON ALL SEQUENCES")).length, 2);
  assert.equal(owner.calls.filter(c => c.sql.startsWith("DO ") || c.sql.startsWith("ALTER ROLE")).length, 0);
  assert.equal(app.calls.filter(c => c.sql.includes("session_user AS session_role")).length, 2);
  assert.ok(app.calls.every(c => c.sql.startsWith("SELECT")));
});
for (const property of ["superuser", "createdb", "createrole", "inherit", "replication", "bypassrls", "database_create", "temporary", "schema_create"]) test("grants reject actual role capability " + property, async () => {
  const owner = client({ roleChange: { [property]: true } }); await assert.rejects(grantCiRuntimeDml(owner, client({ app: true }), settings(), environment));
  assert.equal(owner.calls.at(-1).sql, "ROLLBACK"); assert.ok(!owner.calls.some(c => c.sql.startsWith("GRANT")));
});
test("owner membership is denied even for a nonsuperuser app role", async () => {
  const owner = client({ roleChange: { memberships: 1 } }); await assert.rejects(grantCiRuntimeDml(owner, client({ app: true }), settings(), environment)); assert.equal(owner.calls.at(-1).sql, "ROLLBACK");
});
for (const [name, options] of Object.entries({ missingDmlOrTruncate: { tableInvalid: 1 }, sequenceUpdate: { sequenceInvalid: 1 }, extraDefaultPrivilege: { defaults: [...defaultRows(), { type: "r", privilege: "TRUNCATE" }] }, emptySchema: { tableCount: 0 }, oversizedCatalog: { tableCount: 101 }, queryFailure: { fail: "GRANT SELECT" } })) test("grant readback rolls back " + name, async () => {
  const owner = client(options), app = client({ app: true }); await assert.rejects(grantCiRuntimeDml(owner, app, settings(), environment));
  assert.equal(owner.calls.at(-1).sql, "ROLLBACK"); assert.equal(app.calls.length, 0);
});
test("a real app session cannot be substituted by a bootstrap, owner or stale-role readback", async () => {
  for (const app of [client(), client({ app: true, ownerChange: { session_role: CI_OWNER_ROLE } }), client({ app: true, roleChange: { memberships: 1 } })]) {
    const owner = client(); await assert.rejects(grantCiRuntimeDml(owner, app, settings(), environment)); assert.equal(owner.calls.at(-1).sql, "COMMIT");
  }
});
test("CLI invalid arguments reject before any private file/PG access and redact ambient secrets", () => {
  const marker = "synthetic-sensitive-marker", child = spawnSync(process.execPath, [resolve("scripts/ci-runtime-role.mjs"), "--unknown", marker], { encoding: "utf8", env: { ...process.env, ...environment, DATABASE_URL: marker, MIGRATION_DATABASE_URL: marker }, timeout: 5000 });
  assert.equal(child.status, 1); assert.equal(child.stdout, ""); assert.equal(child.stderr.trim(), "CI database identity preparation failed; private state retained."); assert.ok(!child.stderr.includes(marker));
});
