import { expect, type APIRequestContext, type APIResponse, type Page, type Request as BrowserRequest } from "@playwright/test";
import type { AnalyticsPeriodDto, BrowserAnalyticsInput } from "../../src/contracts/analytics";
import { readSuccessObject, recordSafeHttpResponse } from "./safe-response";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function tehranDates() {
  const format = (locale: string, calendar: string, separator: string) => {
    const parts = new Intl.DateTimeFormat(locale, { calendar, numberingSystem: "latn", timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join(separator);
  };
  return { iso: format("en", "gregory", "-"), jalali: format("fa-IR", "persian", "/") };
}
function exactKeys(value: object, keys: string[]) { expect(Object.keys(value).sort()).toEqual([...keys].sort()); }
export async function expectCaptureEnabled(request: APIRequestContext) {
  const response = await request.get("/api/analytics/config");
  const data = await readSuccessObject(response, "analytics-config");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  exactKeys(data, ["captureEnabled"]);
  expect(data.captureEnabled, "Coordinator must explicitly enable non-live capture in the NEW runtime; no test override or skip").toBe(true);
}
export async function readAnalyticsPeriod(request: APIRequestContext, iso: string): Promise<AnalyticsPeriodDto> {
  const response = await request.get(`/api/admin/analytics/period?from=${iso}&to=${iso}`);
  const data = await readSuccessObject(response, "analytics-period");
  expect(response.headers()["cache-control"]).toContain("no-store");
  exactKeys(data, ["period", "coverage", "observed", "server", "cohort"]);
  const report = data as unknown as AnalyticsPeriodDto;
  exactKeys(report.period, ["fromDate", "toDate", "timeZone"]);
  expect(report.period).toEqual({ fromDate: iso, toDate: iso, timeZone: "Asia/Tehran" });
  exactKeys(report.observed, ["productView", "search", "addToCart", "zeroResultSearch"]);
  exactKeys(report.server, ["checkoutStarted", "verifiedReceipts", "primaryPaidOrders", "completedOrders"]);
  exactKeys(report.cohort, ["basis", "asOf", "started", "primaryPaid", "delivered"]);
  expect(report.cohort.basis).toBe("orders_started_in_period");
  expect(Number.isFinite(Date.parse(report.cohort.asOf))).toBe(true);
  for (const count of [...Object.values(report.observed), ...Object.values(report.server), report.cohort.started, report.cohort.primaryPaid, report.cohort.delivered]) expect(count).toMatch(/^(?:0|[1-9]\d*)$/u);
  exactKeys(report.coverage, ["captureEnabled", "clientCounts", "clientDelivery", "retentionDays", "observedFrom", "observedTo", "retainedFrom", "partialRetention", "productDimensionsTruncated", "lastCleanupUtc", "cleanupPending"]);
  expect(report.coverage).toMatchObject({ captureEnabled: true, clientCounts: "advisory", clientDelivery: "best_effort_unmeasured", retentionDays: 30 });
  for (const key of ["partialRetention", "productDimensionsTruncated", "cleanupPending"] as const) expect(typeof report.coverage[key]).toBe("boolean");
  for (const key of ["observedFrom", "observedTo", "retainedFrom", "lastCleanupUtc"] as const) expect(report.coverage[key] === null || Number.isFinite(Date.parse(report.coverage[key]!))).toBe(true);
  return report;
}
export function assertUnchangedServerCounts(before: AnalyticsPeriodDto, after: AnalyticsPeriodDto) {
  expect(after.server).toEqual(before.server);
  for (const key of ["started", "primaryPaid", "delivered"] as const) expect(after.cohort[key]).toBe(before.cohort[key]);
}
export async function expectNeutralCapture(response: APIResponse) {
  expect(recordSafeHttpResponse(response, "analytics-capture").status).toBe(202);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(await response.json()).toEqual({ data: { ok: true } });
}
export async function expectDeniedAnalytics(response: APIResponse, status: 401 | 403) {
  expect(recordSafeHttpResponse(response, "analytics-denied").status).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const payload: unknown = await response.json();
  expect(!!payload && typeof payload === "object" && !Array.isArray(payload)).toBe(true);
  expect(Object.hasOwn(payload as object, "data")).toBe(false);
}
export function assertAnonymousEvent(value: unknown): asserts value is BrowserAnalyticsInput {
  expect(!!value && typeof value === "object" && !Array.isArray(value)).toBe(true);
  const body = value as Record<string, unknown>;
  expect(typeof body.eventId === "string" && uuid.test(body.eventId)).toBe(true);
  if (body.kind === "search") {
    exactKeys(body, ["eventId", "kind", "hasQuery", "resultBucket"]);
    expect(typeof body.hasQuery).toBe("boolean");
    expect(["zero", "1_10", "11_100", "over_100"]).toContain(body.resultBucket);
  } else {
    exactKeys(body, ["eventId", "kind", "productId"]);
    expect(["product_view", "add_to_cart"]).toContain(body.kind);
    expect(typeof body.productId === "string" && uuid.test(body.productId)).toBe(true);
  }
  expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThanOrEqual(1024);
}
export type BrowserCapture = { kind: "config" | "event"; headers: Record<string, string>; body: unknown; status: number | null };
/** Private in-memory wire evidence only; no request bodies/headers are logged or annotated. */
export function observeBrowserCapture(page: Page) {
  const pending: Promise<BrowserCapture>[] = [];
  let overflow = false, failed = false;
  const listener = (request: BrowserRequest) => {
    const path = new URL(request.url()).pathname;
    if (!["/api/analytics/config", "/api/analytics/events"].includes(path)) return;
    if (pending.length >= 64) { overflow = true; return; }
    const kind = path.endsWith("/config") ? "config" : "event";
    pending.push((async (): Promise<BrowserCapture> => {
      const headers = await request.allHeaders();
      const response = await request.response();
      return { kind, headers, body: kind === "event" ? request.postDataJSON() as unknown : null, status: response?.status() ?? null };
    })().catch(() => { failed = true; return { kind, headers: {}, body: null, status: null }; }));
  };
  page.on("request", listener);
  return {
    count: () => pending.length,
    snapshot: async () => { expect(overflow, "Private wire observer remains bounded").toBe(false); const records = await Promise.all(pending); expect(failed, "Private capture observation succeeded without raw error output").toBe(false); return records; },
    stop: () => page.off("request", listener),
  };
}
export function assertCookieFreeCapture(records: BrowserCapture[], origin: string) {
  expect(records.length).toBeGreaterThan(0);
  for (const record of records) {
    for (const key of ["cookie", "authorization", "referer", "x-morphiume-test-secret"]) expect(record.headers[key], `Anonymous capture omits ${key}`).toBeUndefined();
    if (record.kind === "event") { expect(record.headers.origin).toBe(origin); assertAnonymousEvent(record.body); }
  }
}
