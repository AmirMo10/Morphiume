import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const fixture = JSON.parse(open(__ENV.LOAD_FIXTURE));
const users = new SharedArray("isolated native customer sessions", () => fixture.users);
const base = __ENV.LOAD_BASE_URL || fixture.baseURL;
const mode = __ENV.LOAD_MODE || "vu";
const runId = __ENV.LOAD_RUN_ID || "inspection-only";
const unexpected = new Rate("unexpected_errors");
const business = new Counter("expected_business_conflicts");
const reads = new Trend("read_duration", true);
const checkoutDuration = new Trend("checkout_duration", true);
const paid = new Counter("controlled_paid_orders");
const common = { "Content-Type": "application/json", Origin: base.replace(/\/$/, "") };
export const options = {
  scenarios: mode === "rps" ? { saturation: { executor: "ramping-arrival-rate", startRate: 10, timeUnit: "1s", preAllocatedVUs: 100, maxVUs: 200, stages: [{ target: 20, duration: "2m" }, { target: 40, duration: "3m" }, { target: 80, duration: "3m" }, { target: 120, duration: "3m" }, { target: 0, duration: "1m" }] } } : { journeys: { executor: "ramping-vus", startVUs: 0, stages: mode === "smoke" ? [{ target: 2, duration: "10s" }, { target: 2, duration: "30s" }, { target: 0, duration: "10s" }] : [{ target: 50, duration: "1m" }, { target: 200, duration: "2m" }, { target: 200, duration: "20m" }, { target: 0, duration: "2m" }], gracefulRampDown: "30s" } },
  thresholds: { unexpected_errors: ["rate<0.005"], read_duration: ["p(95)<500"], ...(mode !== "rps" ? { checkout_duration: ["p(95)<1000"] } : {}) },
  summaryTrendStats: ["avg", "min", "med", "p(50)", "p(95)", "p(99)", "max"],
  discardResponseBodies: false,
};
export function setup() {
  const health = http.get(`${base}/api/health/live`, { tags: { name: "GET health" } });
  if (health.status !== 200 || !["test", "staging"].includes(health.json("data.environment"))) throw new Error("Load test target must be an isolated test/staging app");
  if (users.length !== 200 || fixture.productIds?.length !== 200) throw new Error("Load fixture must have exactly 200 native accounts and 200 synthetic products");
}
function responseOk(response, read = false) {
  const expected = response.status === 409;
  if (expected) business.add(1);
  unexpected.add(response.status >= 400 && !expected);
  check(response, { "HTTP success or classified business conflict": r => r.status >= 200 && r.status < 300 || r.status === 409 });
  if (read) reads.add(response.timings.duration);
  return response.status >= 200 && response.status < 300;
}
function get(path, name) { const response = http.get(`${base}${path}`, { tags: { name } }); responseOk(response, true); return response; }
export default function () {
  // RPS scenario is independent request arrival; one HTTP request per iteration.
  if (mode === "rps") { get("/api/catalog/page?pageSize=24", "GET catalog page"); return; }
  const started = Date.now();
  const user = users[(__VU - 1) % users.length];
  const product = fixture.productIds[Math.floor(Math.random() * fixture.productIds.length)];
  for (const cookie of user.cookies) http.cookieJar().set(base, cookie.name, cookie.value);
  const choice = mode === "smoke" && __ITER === 0 ? 1 : Math.random();
  if (choice < 0.8) {
    const page = 1 + Math.floor(Math.random() * 9);
    get(`/api/catalog/page?pageSize=24&page=${page}`, "GET catalog page"); get(`/api/products/${product}`, "GET product"); get("/api/settings", "GET public settings");
  } else if (choice < 0.9) {
    get("/api/catalog/page?pageSize=24&search=QA", "GET search page"); get(`/api/products/${product}`, "GET product"); get("/api/settings", "GET public settings");
  } else {
    const currentResponse = get("/api/cart", "GET own cart");
    if (currentResponse.status < 200 || currentResponse.status >= 300) return;
    const current = currentResponse.json("data");
    const claimedResponse = http.post(`${base}/api/cart/claim`, JSON.stringify({ cartId: current.id, expectedVersion: current.version }), { headers: common, tags: { name: "POST claim own cart" } });
    if (!responseOk(claimedResponse)) return;
    const claimed = claimedResponse.json("data");
    const update = http.put(`${base}/api/cart/items`, JSON.stringify({ cartId: claimed.id, expectedVersion: claimed.version, variantId: fixture.variantId, quantity: 1 }), { headers: common, tags: { name: "PUT cart item" } });
    if (!responseOk(update)) return;
    const cart = update.json("data");
    if (choice >= 0.98) {
      const address = { recipient: "گیرندهٔ آزمایشی ظرفیت QA", phone: "09121234567", province: "QA", city: "QA", address: "QA synthetic address only", plaque: "1", postalCode: "1234567890" };
      const quoted = http.post(`${base}/api/checkout/quote`, JSON.stringify({ cartId: cart.id, cartVersion: cart.version, address, shippingMethodId: "standard" }), { headers: common, tags: { name: "POST quote" } });
      if (!responseOk(quoted)) return;
      const quote = quoted.json("data");
      const created = http.post(`${base}/api/checkout`, JSON.stringify({ cartId: cart.id, cartVersion: quote.cartVersion, address, shippingMethodId: quote.shippingMethodId, quoteFingerprint: quote.fingerprint, policyVersion: quote.policyVersion }), { headers: { ...common, "Idempotency-Key": `load-${runId}-${mode}-${__VU}-${__ITER}` }, tags: { name: "POST checkout" } });
      checkoutDuration.add(created.timings.duration);
      if (!responseOk(created)) return;
      const order = created.json("data");
      if (!order.redirectUrl || !order.redirectUrl.includes("/test/payments/MOCK-")) throw new Error("Load test refuses nonmock payment redirect");
      const authority = order.redirectUrl.split("/").pop();
      const completed = http.post(`${base}/api/test/payments/${authority}`, JSON.stringify({ outcome: "succeeded" }), { headers: common, tags: { name: "POST controlled mock verify" } });
      if (responseOk(completed)) { paid.add(1); get(`/api/orders/${order.orderId}`, "GET owned order"); }
    }
  }
  // Around one navigation/15 s. Request time is included instead of unbounded fast loops.
  sleep(Math.max(1, 15 - (Date.now() - started) / 1000));
}
export function handleSummary(data) { return { [__ENV.LOAD_SUMMARY]: JSON.stringify({ mode, generatedAt: new Date().toISOString(), fixtureId: fixture.fixtureId, appCommit: __ENV.LOAD_APP_COMMIT || "unrecorded", metrics: data.metrics, rootGroup: data.root_group, options: data.options }, null, 2) }; }
