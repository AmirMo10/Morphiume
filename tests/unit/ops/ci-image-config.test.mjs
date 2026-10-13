import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { childEnvironment } from "../../../db/prepare-native-qa.mjs";

const generator = fileURLToPath(new URL("../../../scripts/ci-image-config.mjs", import.meta.url));
function synthetic() {
  const password = randomBytes(32).toString("hex");
  return { DEPLOYMENT_ENV: "test", PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock", DATABASE_URL: `postgresql://morphiume_ci_app:${password}@127.0.0.1:5432/morphiume_staging`, MIGRATION_DATABASE_URL: "postgresql://morphiume_ci:ephemeral-ci-only@127.0.0.1:5432/morphiume_staging", APP_BASE_URL: "http://localhost:3000", AUTH_SECRET: randomBytes(32).toString("hex"), ADMIN_AUTH_SECRET: randomBytes(32).toString("hex"), MOCK_CONTROL_SECRET: randomBytes(32).toString("hex"), ANONYMOUS_ANALYTICS_ENABLED: "true", BOOTSTRAP_ADMIN_EMAIL: "owner@morphiume.test", BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString("hex") };
}
async function fixture(callback) {
  const parent = await realpath(tmpdir()), root = await mkdtemp(join(parent, "morphiume-ci-image-config-"));
  try { return await callback(root); }
  finally {
    assert.equal(dirname(resolve(root)), parent); assert.equal(basename(root).startsWith("morphiume-ci-image-config-"), true); assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: true });
  }
}
async function execute(root, settings, overrides = {}) {
  await writeFile(join(root, ".env.local"), Object.entries(settings).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
  return spawnSync(process.execPath, [generator], { cwd: root, env: { ...childEnvironment(), CI: "true", GITHUB_ACTIONS: "true", ...overrides }, encoding: "utf8", timeout: 10000, maxBuffer: 16384, windowsHide: true, shell: false });
}
test("actual image config CLI separates DML runtime and minimal owner-only migration mounts", async () => fixture(async root => {
  const settings = synthetic(), result = await execute(root, settings);
  assert.equal(result.status, 0, "Synthetic configuration generator must complete");
  for (const value of [settings.DATABASE_URL, settings.MIGRATION_DATABASE_URL, settings.AUTH_SECRET, settings.BOOTSTRAP_ADMIN_PASSWORD]) assert.equal((result.stdout + result.stderr).includes(value), false);
  const runtime = JSON.parse(await readFile(join(root, ".local/image-runtime.json"), "utf8"));
  const migration = JSON.parse(await readFile(join(root, ".local/image-migration.json"), "utf8"));
  assert.equal(runtime.DATABASE_URL === settings.DATABASE_URL, true);
  assert.equal(JSON.stringify(runtime).includes(settings.MIGRATION_DATABASE_URL), false);
  for (const name of ["MIGRATION_DATABASE_URL", "BOOTSTRAP_ADMIN_PASSWORD", "BOOTSTRAP_ADMIN_EMAIL"]) assert.equal(Object.hasOwn(runtime, name), false);
  assert.deepEqual(Object.keys(migration).sort(), ["ANONYMOUS_ANALYTICS_ENABLED", "DATABASE_URL", "PAYMENT_PROVIDER", "SMS_PROVIDER"]);
  assert.equal(migration.DATABASE_URL === settings.MIGRATION_DATABASE_URL, true); assert.equal(migration.ANONYMOUS_ANALYTICS_ENABLED, "false");
  for (const name of ["AUTH_SECRET", "ADMIN_AUTH_SECRET", "MOCK_CONTROL_SECRET"]) assert.equal(Object.hasOwn(migration, name), false);
  if (process.platform !== "win32") for (const file of ["image-runtime.json", "image-migration.json", "image-env", "image-seed-env"]) assert.equal((await stat(join(root, ".local", file))).mode & 0o777, 0o600);
}));
for (const [name, change, environment] of [
  ["owner in runtime", value => { value.DATABASE_URL = value.MIGRATION_DATABASE_URL; }, {}],
  ["different database", value => { value.DATABASE_URL = value.DATABASE_URL.replace("morphiume_staging", "morphiume_live"); }, {}],
  ["non-GitHub process", () => {}, { GITHUB_ACTIONS: "false" }],
]) test(`actual image config rejects ${name} before creating mount files`, async () => fixture(async root => {
  const settings = synthetic(); change(settings); const result = await execute(root, settings, environment);
  assert.notEqual(result.status, 0); assert.deepEqual(await readdir(root), [".env.local"]);
  for (const value of [settings.DATABASE_URL, settings.MIGRATION_DATABASE_URL, settings.AUTH_SECRET]) assert.equal((result.stdout + result.stderr).includes(value), false);
}));
