import http from "k6/http";
import encoding from "k6/encoding";
import exec from "k6/execution";
import { Counter, Gauge, Rate, Trend } from "k6/metrics";

const appCommit = "e4bed691dc938a9c0f79022696d24f063ad97724";
const profileSha256 = "a6988f3f27309c198e378e307ca856643686ae1c3fb49617bed9a770634e50ed";
const origin = "http://192.168.240.51";
const rates = [120, 240, 480, 960, 1920, 3200];
const rampSeconds = 15, plateauSeconds = 60, downSeconds = 15;
const summaryPath = (__ENV.SATURATION_SUMMARY || "").replace(/\\/g, "/");
if (__ENV.SATURATION_GO !== "1" || __ENV.SATURATION_BASE_URL !== origin ||
  __ENV.SATURATION_APP_COMMIT !== appCommit || __ENV.SATURATION_PROFILE_SHA256 !== profileSha256 ||
  __ENV.DEPLOYMENT_ENV !== "staging" || __ENV.PAYMENT_PROVIDER !== "mock" || __ENV.SMS_PROVIDER !== "mock" ||
  !/^[A-Za-z0-9_-]{1,64}$/.test(__ENV.SATURATION_BASIC_USERNAME || "") ||
  !/^[a-f0-9]{64}$/.test(__ENV.SATURATION_BASIC_PASSWORD || "") ||
  !/^S:\/Morphiume\/\.local\/e4-saturation-\d{8}T\d{6}Z-[a-f0-9]{8}\/summary\.json$/.test(summaryPath) ||
  __ENV.K6_HTTP_DEBUG || __ENV.K6_OUT || __ENV.DATABASE_URL || __ENV.MIGRATION_DATABASE_URL || __ENV.LOAD_FIXTURE)
  throw new Error("SATURATION_TARGET_GUARD");

const authorization = `Basic ${encoding.b64encode(`${__ENV.SATURATION_BASIC_USERNAME}:${__ENV.SATURATION_BASIC_PASSWORD}`)}`;
const requests = new Counter("catalog_requests");
const faults = new Counter("catalog_critical_faults");
const faultTypes = { transport: new Counter("catalog_transport_faults"), server: new Counter("catalog_server_faults"),
  perimeter: new Counter("catalog_perimeter_faults"), response: new Counter("catalog_response_faults") };
const unexpected = new Rate("catalog_unexpected");
const reads = new Trend("catalog_read_duration", true);
const datasetCount = new Gauge("catalog_total_items");
const thresholds = {
  catalog_critical_faults: [{ threshold: "count==0", abortOnFail: true }],
  catalog_unexpected: [{ threshold: "rate<0.005", abortOnFail: true, delayAbortEval: "15s" }],
  catalog_read_duration: [{ threshold: "p(95)<500", abortOnFail: true, delayAbortEval: "30s" }],
  dropped_iterations: [{ threshold: "count==0", abortOnFail: true, delayAbortEval: "10s" }],
};
for (let i = 0; i < rates.length; i++) {
  const phase = `p${rates[i]}`, start = i * (rampSeconds + plateauSeconds) + rampSeconds;
  thresholds[`catalog_read_duration{phase:${phase}}`] = [{ threshold: "p(95)<500", abortOnFail: true, delayAbortEval: `${start + 15}s` }];
  thresholds[`catalog_unexpected{phase:${phase}}`] = [{ threshold: "rate<0.005", abortOnFail: true, delayAbortEval: `${start + 15}s` }];
  thresholds[`catalog_requests{phase:${phase}}`] = [`count>=${Math.floor(rates[i] * plateauSeconds * 0.99)}`];
}
export const options = {
  scenarios: { catalog: { executor: "ramping-arrival-rate", startRate: 60, timeUnit: "1s", preAllocatedVUs: 400, maxVUs: 400,
    stages: [...rates.flatMap(target => [{ target, duration: `${rampSeconds}s` }, { target, duration: `${plateauSeconds}s` }]), { target: 0, duration: `${downSeconds}s` }], gracefulStop: "5s" } },
  thresholds, setupTimeout: "15s", discardResponseBodies: true, maxRedirects: 0,
  summaryTrendStats: ["avg", "min", "med", "p(50)", "p(95)", "p(99)", "max"],
  systemTags: ["status", "method", "name", "scenario", "expected_response"],
};
function abort(code, category = "response") { faults.add(1); faultTypes[category].add(1); exec.test.abort(code); }
function params(phase, body = false) {
  return { headers: { Authorization: authorization, Accept: "application/json" }, jar: new http.CookieJar(),
    tags: { name: "GET catalog saturation", phase }, timeout: "2s", redirects: 0, responseType: body ? "text" : "none" };
}
function publicJson(response) {
  const entries = Object.entries(response.headers || {});
  return entries.some(([key, value]) => key.toLowerCase() === "content-type" && String(value).toLowerCase().startsWith("application/json")) &&
    !entries.some(([key]) => key.toLowerCase() === "set-cookie");
}
export function setup() {
  if (exec.test.options.httpDebug) abort("SATURATION_DEBUG_GUARD");
  const health = http.get(`${origin}/api/health/live`, params("setup", true));
  let environment;
  try { environment = health.json("data.environment"); } catch { /* Reject malformed bodies without exporting them. */ }
  if (health.status !== 200 || !publicJson(health) || environment !== "staging") abort("SATURATION_HEALTH_GUARD");
  const catalog = http.get(`${origin}/api/catalog/page?pageSize=24`, params("setup", true));
  let data;
  try { data = catalog.json("data"); } catch { /* Reject malformed bodies without exporting them. */ }
  if (catalog.status !== 200 || !publicJson(catalog) || typeof catalog.body !== "string" || catalog.body.length > 1024 * 1024 ||
    !data || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 24 ||
    !Number.isSafeInteger(data.totalItems) || data.totalItems < data.items.length || data.page !== 1 || data.pageSize !== 24) abort("SATURATION_CATALOG_GUARD");
  datasetCount.add(data.totalItems); faults.add(0); Object.values(faultTypes).forEach(counter => counter.add(0));
}
export function phaseAt(elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return "outside";
  const index = Math.floor(elapsedSeconds / (rampSeconds + plateauSeconds));
  if (index >= rates.length) return "down";
  return elapsedSeconds % (rampSeconds + plateauSeconds) < rampSeconds ? `r${rates[index]}` : `p${rates[index]}`;
}
export default function () {
  const phase = phaseAt((Date.now() - exec.scenario.startTime) / 1000);
  if (phase === "outside") { abort("SATURATION_CLOCK_GUARD"); return; }
  let response;
  try { response = http.get(`${origin}/api/catalog/page?pageSize=24`, params(phase)); }
  catch { unexpected.add(true, { phase }); requests.add(1, { phase }); abort("SATURATION_TRANSPORT_FAILURE", "transport"); return; }
  const valid = response.status === 200 && publicJson(response);
  requests.add(1, { phase }); unexpected.add(!valid, { phase }); reads.add(response.timings.duration, { phase });
  if (!valid) {
    if (response.status === 0) abort("SATURATION_TRANSPORT_FAILURE", "transport");
    else if (response.status >= 500) abort("SATURATION_SERVER_5XX", "server");
    else if ([401, 403].includes(response.status)) abort("SATURATION_PERIMETER_DENIAL", "perimeter");
    else abort("SATURATION_RESPONSE_GUARD");
  }
}
export function handleSummary(data) {
  const metrics = {};
  for (const [name, metric] of Object.entries(data.metrics || {})) {
    if (!/^(?:http_reqs|http_req_duration|http_req_failed|iterations|iteration_duration|vus|vus_max|dropped_iterations|data_received|data_sent|catalog_total_items|catalog_critical_faults|catalog_transport_faults|catalog_server_faults|catalog_perimeter_faults|catalog_response_faults|catalog_requests|catalog_unexpected|catalog_read_duration)(?:\{phase:p(?:120|240|480|960|1920|3200)\})?$/.test(name)) continue;
    const values = Object.fromEntries(Object.entries(metric.values || {}).filter(([key, value]) =>
      /^(?:count|rate|value|min|avg|med|p\(50\)|p\(95\)|p\(99\)|max|passes|fails)$/.test(key) && typeof value === "number" && Number.isFinite(value)));
    const thresholdResults = Object.entries(metric.thresholds || {}).filter(([expression, value]) =>
      /^(?:rate<0\.005|p\(95\)<500|count==0|count>=\d+)$/.test(expression) && typeof value?.ok === "boolean").map(([expression, value]) => ({ expression, passed: value.ok }));
    metrics[name] = { values, thresholdResults };
  }
  return { [summaryPath]: JSON.stringify({ schemaVersion: 1, scope: "bounded-private-ip-catalog-saturation", generatedAt: new Date().toISOString(),
    appCommit, profileSha256, rates, rampSeconds, plateauSeconds, downSeconds, preAllocatedVUs: 400, maxVUs: 400,
    metrics, resultRequiresOperatorReview: true, generatorValidityProvedByScript: false, saturationBoundaryProvedByScript: false }, null, 2) + "\n" };
}
