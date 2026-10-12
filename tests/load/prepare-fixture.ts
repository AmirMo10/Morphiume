import { randomUUID, randomInt } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
import { FixtureSetupBudget, FixtureSetupFailure, FIXTURE_SETUP_BUDGET_MS, nativeFixtureOtpPair, safeFixtureFailure, type FixturePhonePath } from "./native-fixture-actions";

config({ path: ".env.local", quiet: true });
const base = process.env.LOAD_BASE_URL ?? process.env.APP_BASE_URL;
const database = controlledQaDatabase(process.env).toString();
if (!base || !database || !process.env.MOCK_CONTROL_SECRET || !["test", "staging"].includes(process.env.DEPLOYMENT_ENV ?? "") || process.env.PAYMENT_PROVIDER !== "mock" || process.env.SMS_PROVIDER !== "mock") throw new Error("Load fixtures require controlled isolated test/staging configuration");
const suppliedCommit = process.env.LOAD_APP_COMMIT;
if (suppliedCommit !== undefined && !/^[0-9a-f]{40}$/iu.test(suppliedCommit)) throw new Error("LOAD_APP_COMMIT must be an explicit accepted 40-hex source revision");
const appCommit = suppliedCommit?.toLowerCase() ?? null;
const pool = new pg.Pool({ connectionString: database, max: 2, connectionTimeoutMillis: 5000, query_timeout: 60_000, statement_timeout: 60_000 });
const budget = new FixtureSetupBudget();
const fixtureId = randomUUID(), productId = randomUUID(), variantId = randomUUID(), productIds: string[] = [], users: { userId: string; cookies: { name: string; value: string }[] }[] = [];
const progress = {
  formatVersion: 1, fixtureId, createdAt: new Date().toISOString(), completedAt: null as string | null, updatedAt: new Date().toISOString(), setupBudgetMs: FIXTURE_SETUP_BUDGET_MS,
  appCommit, environment: process.env.DEPLOYMENT_ENV!, baseURL: base,
  state: "preparing" as "preparing" | "complete" | "partial", failure: null as ReturnType<typeof safeFixtureFailure> | null,
  reconciliationRequired: false, products: [] as { id: string; variantId: string; phase: "planned" | "created" }[],
  accounts: [] as { phone: string; userId: string | null; phase: "planned" | "sending" | "verifying" | "verified" | "session-ready" }[],
};
const progressPath = `.local/load-setup-progress-${fixtureId}.json`;
let authPool: pg.Pool | undefined;
async function privateAtomicJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(".local", { recursive: true, mode: 0o700 });
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}
async function persistProgress() {
  try {
    progress.updatedAt = new Date().toISOString();
    await privateAtomicJson(progressPath, progress);
    await privateAtomicJson(".local/load-setup-latest.json", { formatVersion: 1, fixtureId, state: progress.state, reconciliationRequired: progress.reconciliationRequired, createdAt: progress.createdAt, completedAt: progress.completedAt, updatedAt: progress.updatedAt, appCommit, environment: progress.environment, baseURL: base });
  }
  catch { throw new FixtureSetupFailure("fixture-progress-failed"); }
}
async function uniqueSyntheticPhone() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const prior = await budget.run(() => pool.query('SELECT id FROM "user" WHERE phone_number=$1', [phone]));
    if (!prior.rowCount && !progress.accounts.some(account => account.phone === phone)) return phone;
  }
  throw new FixtureSetupFailure("fixture-session-invalid");
}
try {
  await budget.run(() => persistProgress());
  const { customerAuth } = await import("../../src/server/auth/index");
  const { readMockOtp } = await import("../../src/server/auth/otp");
  authPool = (await import("../../src/server/db")).pool;
  const nativeBase = process.env.APP_BASE_URL!;
  const nativeRequest = (path: FixturePhonePath, body: { phoneNumber: string; code?: string }, signal: AbortSignal) => customerAuth.handler(new Request(`${nativeBase}/api/auth${path}`, { method: "POST", signal, headers: { Origin: new URL(nativeBase).origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const health = await budget.run(signal => fetch(`${base}/api/health/live`, { signal }));
  const healthData = await budget.run(() => health.json());
  const environment = healthData?.data?.environment;
  if (!health.ok || !["test", "staging"].includes(environment) || environment !== progress.environment) throw new FixtureSetupFailure("fixture-target-invalid");
  // Explicitly synthetic data for load testing, not a commercial product.
  for (let i = 0; i < 200; i++) {
    const product = i === 0 ? productId : randomUUID(), variant = i === 0 ? variantId : randomUUID(), stock = i === 0 ? 100000 : 1000;
    const entry = { id: product, variantId: variant, phase: "planned" as "planned" | "created" };
    progress.products.push(entry); productIds.push(product);
    await budget.run(() => persistProgress());
    await budget.run(() => pool.query("INSERT INTO product(id,name,slug,description,concentration,family,image_url,status,search_key) VALUES($1,$2,$3,$4,'QA','آزمایشی','/assets/sample-perfume.svg','published','آزمون ظرفیت qa')", [product, `آزمون ظرفیت QA ${fixtureId.slice(0, 8)} ${i + 1}`, `load-${fixtureId}-${i}`, "دادهٔ مصنوعی آزمون ظرفیت؛ برای فروش واقعی معتبر نیست."]));
    await budget.run(() => pool.query("INSERT INTO product_image(product_id,position,url,alt) VALUES($1,0,'/assets/sample-perfume.svg','تصویر مصنوعی آزمون ظرفیت QA')", [product]));
    await budget.run(() => pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,50,10000)", [variant, product, `LOAD-${fixtureId}-${i}`]));
    await budget.run(() => pool.query("INSERT INTO inventory_balance(variant_id,on_hand,reserved) VALUES($1,$2,0)", [variant, stock]));
    await budget.run(() => pool.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,0,'QA synthetic load dataset')", [randomUUID(), variant, `load-seed:${fixtureId}:${i}`, stock]));
    entry.phase = "created";
    await budget.run(() => persistProgress());
  }
  for (let i = 0; i < 200; i++) {
    const phone = await uniqueSyntheticPhone();
    const account = { phone, userId: null as string | null, phase: "planned" as "planned" | "sending" | "verifying" | "verified" | "session-ready" };
    progress.accounts.push(account);
    await budget.run(() => persistProgress());
    // The maintained handler retains its real shared per-path fallback buckets.
    // No trusted IP, native session, factor grant or rate counter is invented.
    const verified = await nativeFixtureOtpPair(phone, budget, nativeRequest, () => readMockOtp(phone), evidence => console.log(JSON.stringify({ event: "fixture-native-status", ...evidence })), async phase => {
      account.phase = phase; await persistProgress();
    });
    const response = await budget.run(() => verified.json());
    if (typeof response?.user?.id !== "string" || !response.user.id || response.user.id.length > 128 || response.user.phoneNumber !== phone || response.user.phoneNumberVerified !== true) throw new FixtureSetupFailure("fixture-session-invalid");
    account.userId = response.user.id; account.phase = "verified";
    await budget.run(() => persistProgress());
    const cookies = verified.headers.getSetCookie().filter(c => c.startsWith("morphiume-customer.")).map(line => { const pair = line.split(";", 1)[0]!, offset = pair.indexOf("="); return { name: pair.slice(0, offset), value: pair.slice(offset + 1) }; });
    if (!cookies.length || cookies.some(cookie => !cookie.name || !cookie.value)) throw new FixtureSetupFailure("fixture-session-invalid");
    users.push({ userId: response.user.id, cookies });
    if (i === 0) {
      const preflight = await budget.run(signal => fetch(`${base}/api/auth/get-session`, { signal, headers: { Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ") } }));
      const actualSession = await budget.run(() => preflight.json());
      if (!preflight.ok || actualSession?.user?.id !== response.user.id) throw new FixtureSetupFailure("fixture-target-invalid");
    }
    account.phase = "session-ready";
    await budget.run(() => persistProgress());
    if ((i + 1) % 10 === 0) console.log(JSON.stringify({ event: "fixture-setup-progress", state: "preparing", productsCreated: progress.products.filter(item => item.phase === "created").length, accountsReady: users.length }));
  }
  progress.completedAt = new Date().toISOString();
  await budget.run(() => privateAtomicJson(".local/load-fixture.json", { fixtureId, createdAt: progress.createdAt, completedAt: progress.completedAt, setupStatus: "complete", reconciliationRequired: false, appCommit, environment, baseURL: base, productId, productIds, variantId, initialStock: 100000, users }));
  progress.state = "complete";
  await budget.run(() => persistProgress());
  console.log(JSON.stringify({ event: "fixture-setup-progress", state: "complete", productsCreated: 200, accountsReady: 200, setupBudgetMs: FIXTURE_SETUP_BUDGET_MS }));
} catch (error) {
  progress.state = "partial"; progress.failure = safeFixtureFailure(error); progress.reconciliationRequired = true;
  // No cancellation or automatic cleanup is inferred for an unknown native/DB outcome.
  try { await persistProgress(); }
  catch { progress.failure = safeFixtureFailure(new FixtureSetupFailure("fixture-progress-failed")); }
  console.error(JSON.stringify({ event: "fixture-setup-progress", state: "partial", failure: progress.failure, productsPlanned: progress.products.length, productsCreated: progress.products.filter(item => item.phase === "created").length, accountsPlanned: progress.accounts.length, accountsReady: users.length, reconciliationRequired: true }));
  process.exitCode = 1;
} finally {
  // Bound shutdown; termination does not prove whether a native transaction committed.
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const shutdown = Promise.allSettled([pool.end(), ...(authPool ? [authPool.end()] : [])]);
    const finished = await Promise.race([shutdown.then(() => true), new Promise<false>(resolve => { shutdownTimer = setTimeout(() => resolve(false), 5000); })]);
    if (!finished) {
      progress.state = "partial"; progress.reconciliationRequired = true;
      progress.failure ??= safeFixtureFailure(new FixtureSetupFailure("deadline"));
      try { await persistProgress(); } catch { /* No raw filesystem error is printed. */ }
      console.error(JSON.stringify({ event: "fixture-setup-progress", state: "partial", failure: progress.failure, reconciliationRequired: true }));
      process.exit(1);
    }
  } finally { if (shutdownTimer !== undefined) clearTimeout(shutdownTimer); }
}
