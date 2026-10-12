import { open } from "node:fs/promises";
import { resolve } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const commit = /^[0-9a-f]{40}$/iu;
const refuse = () => { throw new Error("Load fixture is not a complete matching latest preparation; reconcile private records before running"); };
function origin(value) {
  try {
    if (typeof value !== "string" || value !== value.trim()) return refuse();
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || /[?#]/u.test(value)) return refuse();
    return url.origin;
  } catch { return refuse(); }
}
function sameIds(values, expected) {
  return Array.isArray(values) && values.length === 200 && new Set(values).size === 200 && values.every((id, index) => typeof id === "string" && uuid.test(id) && id === expected[index]);
}

// Only fixed errors leave this boundary: private cookies/phones never enter diagnostics.
export function validateLoadFixtureState(fixture, progress, latest, configuration) {
  if (!fixture || !progress || !latest || !configuration) return refuse();
  const revision = configuration.LOAD_APP_COMMIT;
  const target = configuration.LOAD_BASE_URL ?? configuration.APP_BASE_URL;
  if (typeof revision !== "string" || !commit.test(revision) || !["test", "staging"].includes(configuration.DEPLOYMENT_ENV) || configuration.PAYMENT_PROVIDER !== "mock" || configuration.SMS_PROVIDER !== "mock") return refuse();
  if (typeof fixture.fixtureId !== "string" || !uuid.test(fixture.fixtureId) || fixture.setupStatus !== "complete" || fixture.reconciliationRequired !== false) return refuse();
  const metadata = [fixture, progress, latest];
  if (metadata.some(record => record.fixtureId !== fixture.fixtureId || record.environment !== configuration.DEPLOYMENT_ENV || record.appCommit !== revision.toLowerCase() || record.baseURL !== fixture.baseURL || record.reconciliationRequired !== false || record.createdAt !== fixture.createdAt || record.completedAt !== fixture.completedAt)) return refuse();
  if (origin(fixture.baseURL) !== origin(target) || progress.formatVersion !== 1 || latest.formatVersion !== 1 || progress.state !== "complete" || latest.state !== "complete" || progress.failure !== null || progress.setupBudgetMs !== 1_800_000) return refuse();
  if (typeof fixture.createdAt !== "string" || typeof fixture.completedAt !== "string" || !Number.isFinite(Date.parse(fixture.createdAt)) || !Number.isFinite(Date.parse(fixture.completedAt)) || Date.parse(fixture.completedAt) < Date.parse(fixture.createdAt)) return refuse();
  if (!Array.isArray(fixture.productIds) || !sameIds(fixture.productIds, fixture.productIds) || fixture.productId !== fixture.productIds[0] || !uuid.test(fixture.variantId ?? "") || !Number.isSafeInteger(fixture.initialStock) || fixture.initialStock < 1) return refuse();
  if (!Array.isArray(progress.products) || !sameIds(progress.products.map(product => product?.id), fixture.productIds) || progress.products.some(product => product.phase !== "created" || !uuid.test(product.variantId ?? "")) || progress.products[0].variantId !== fixture.variantId) return refuse();
  if (!Array.isArray(fixture.users) || !Array.isArray(progress.accounts) || fixture.users.length !== 200 || progress.accounts.length !== 200) return refuse();
  const ids = fixture.users.map(user => user?.userId);
  if (new Set(ids).size !== 200 || ids.some(id => typeof id !== "string" || !id || id.length > 256)) return refuse();
  if (progress.accounts.some((account, index) => account?.phase !== "session-ready" || account.userId !== ids[index])) return refuse();
  if (fixture.users.some(user => !Array.isArray(user.cookies) || user.cookies.length < 1 || user.cookies.length > 32 || user.cookies.some(cookie => typeof cookie?.name !== "string" || !cookie.name || cookie.name.length > 256 || typeof cookie.value !== "string" || !cookie.value || cookie.value.length > 8192))) return refuse();
  return fixture;
}

async function privateJson(path, limit) {
  let handle;
  try {
    handle = await open(path, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > limit) return refuse();
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length <= limit) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > limit) return refuse();
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } catch { return refuse(); }
  finally { await handle?.close(); }
}

export async function readLoadFixtureState(fixturePath, configuration, privateDirectory = resolve(".local")) {
  const fixture = await privateJson(fixturePath, 2 * 1024 * 1024);
  if (typeof fixture?.fixtureId !== "string" || !uuid.test(fixture.fixtureId)) return refuse();
  const progress = await privateJson(resolve(privateDirectory, `load-setup-progress-${fixture.fixtureId}.json`), 256 * 1024);
  const latest = await privateJson(resolve(privateDirectory, "load-setup-latest.json"), 8 * 1024);
  return validateLoadFixtureState(fixture, progress, latest, configuration);
}
