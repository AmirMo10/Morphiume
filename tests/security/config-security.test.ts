import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(resolve("src/server/config.ts")).href;
const code = `import {getConfig} from ${JSON.stringify(moduleUrl)};try {getConfig();console.log('accepted');}catch(e){console.log(e.message);process.exitCode=17;}`;
const safe = {
  NODE_ENV: "test" as const,
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
  DEPLOYMENT_ENV: "test", APP_BASE_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1/morphiume_staging",
  AUTH_SECRET: "synthetic-customer-secret-for-config-test-only",
  ADMIN_AUTH_SECRET: "synthetic-admin-secret-for-config-test-only",
  PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock",
  MOCK_CONTROL_SECRET: "synthetic-test-control-secret-for-config-only", MEDIA_ROOT: "synthetic-media",
};
function validate(overrides: Record<string, string | undefined>) {
  const env = { ...safe, ...overrides };
  for (const key of Object.keys(env)) if (env[key as keyof typeof env] === undefined) delete env[key as keyof typeof env];
  // cwd has no .env.local: missing-variable scenarios cannot silently reload private credentials.
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", code], { cwd: resolve("tests/security"), env, encoding: "utf8" });
  if (child.error) throw child.error;
  assert.equal(child.stderr, "", "Unexpected child error, no private config printed");
  return { status: child.status, output: child.stdout.trim() };
}
test("explicit controlled test config succeeds and customer/admin secrets must differ", () => {
  assert.deepEqual(validate({}), { status: 0, output: "accepted" });
  const duplicate = validate({ ADMIN_AUTH_SECRET: safe.AUTH_SECRET });
  assert.equal(duplicate.status, 17); assert.match(duplicate.output, /must differ/);
});
test("missing environment, missing test control, and real staging SMS fail closed", () => {
  for (const overrides of [{ DEPLOYMENT_ENV: undefined }, { MOCK_CONTROL_SECRET: undefined }, { SMS_PROVIDER: "kavenegar" }]) assert.equal(validate(overrides).status, 17);
});
test("live rejects mocks, unsafe origins, missing services, bootstrap controls and activation without verified contracts", () => {
  const live = { DEPLOYMENT_ENV: "live", PAYMENT_PROVIDER: "zarinpal", SMS_PROVIDER: "kavenegar", APP_BASE_URL: "https://morphiume.example.invalid", MOCK_CONTROL_SECRET: undefined, ZARINPAL_MERCHANT_ID: "synthetic", SMS_API_KEY: "synthetic", SMS_SERVICE_TEMPLATE: "synthetic", PUBLIC_SITE_URL: "https://morphiume.example.invalid", OBJECT_STORAGE_ENDPOINT: "https://storage.example.invalid" };
  assert.match(validate({ ...live, PAYMENT_PROVIDER: "mock" }).output, /rejects mock/);
  assert.match(validate({ ...live, APP_BASE_URL: "http://morphiume.example.invalid" }).output, /trusted HTTPS/);
  assert.match(validate({ ...live, SMS_API_KEY: undefined }).output, /prerequisites/);
  assert.match(validate({ ...live, BOOTSTRAP_ADMIN_PASSWORD: "synthetic bootstrap" }).output, /rejects test\/bootstrap/);
  const gated = validate(live);
  assert.equal(gated.status, 17); assert.match(gated.output, /activation is gated/);
});
