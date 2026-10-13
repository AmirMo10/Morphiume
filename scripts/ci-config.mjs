import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CI_DATABASE = "morphiume_staging";
export const CI_OWNER_ROLE = "morphiume_ci";
export const CI_APP_ROLE = "morphiume_ci_app";
export const CI_HOST = "127.0.0.1";
export const CI_PORT = 5432;
// Public synthetic service credential from verify.yml, never a local/live URL.
export const CI_OWNER_URL = "postgresql://morphiume_ci:ephemeral-ci-only@127.0.0.1:5432/morphiume_staging";
export function assertCiEnvironment(environment) {
  if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true") throw new Error("GitHub CI-only synthetic configuration");
}
export function createCiSettings({ environment, cwd, secret = () => randomBytes(32).toString("hex") }) {
  assertCiEnvironment(environment);
  if (!isAbsolute(cwd) || /[\r\n\0]/u.test(cwd)) throw new Error("Invalid CI workspace");
  const values = Array.from({ length: 5 }, () => secret());
  if (values.some(value => typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) || new Set(values).size !== values.length) throw new Error("Independent CI secrets required");
  const [password, auth, adminAuth, control, bootstrap] = values;
  const app = new URL(CI_OWNER_URL); app.username = CI_APP_ROLE; app.password = password;
  return { DEPLOYMENT_ENV: "test", APP_BASE_URL: "http://localhost:3000", DATABASE_URL: app.toString(), MIGRATION_DATABASE_URL: CI_OWNER_URL, AUTH_SECRET: auth, ADMIN_AUTH_SECRET: adminAuth, MOCK_CONTROL_SECRET: control, PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock", ANONYMOUS_ANALYTICS_ENABLED: "true", ANONYMOUS_ANALYTICS_PG_TESTS: "true", NOTIFICATION_EVENTS_PG_TESTS: "true", NOTIFICATION_INTEGRATION_PG_TESTS: "true", MEDIA_ROOT: join(cwd, ".local/media"), BOOTSTRAP_ADMIN_EMAIL: "owner@morphiume.test", BOOTSTRAP_ADMIN_PASSWORD: bootstrap };
}
async function main() {
  assertCiEnvironment(process.env);
  if (process.platform !== "linux") throw new Error("Linux CI configuration required");
  const settings = createCiSettings({ environment: process.env, cwd: process.cwd() });
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const directory = await lstat(".local");
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== process.getuid()) throw new Error("Unsafe CI private directory");
  await chmod(".local", 0o700);
  await writeFile(".env.local", Object.entries(settings).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
  console.log("Isolated CI owner/app configuration generated; credentials omitted.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("CI configuration preparation failed; private state retained."); process.exitCode = 1; });
}
