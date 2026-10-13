import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CommerceError } from "@/contracts/commerce";
import { parseBrowserAnalyticsInput } from "@/server/commerce/analytics";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/[...segments]/route";

const state = vi.hoisted(() => ({ enabled: false, customer: vi.fn(), admin: vi.fn(), capture: vi.fn(), report: vi.fn(), database: vi.fn(), createCheckout: vi.fn(), createCart: vi.fn() }));
vi.mock("@/server/runtime", () => ({ getCommerce: () => state, getMockPayments: vi.fn() }));
vi.mock("@/server/auth/actors", () => ({ customerActor: state.customer, adminActor: state.admin, adminSession: vi.fn() }));
vi.mock("@/server/db", () => ({ pool: { query: state.database } }));
vi.mock("@/server/config", () => ({ getConfig: () => ({ APP_BASE_URL: "http://localhost:3000", DEPLOYMENT_ENV: "test" }) }));
vi.mock("@/server/analytics-runtime", () => ({ analyticsCaptureEnabled: () => state.enabled, getAnalyticsRuntime: () => ({ captureBrowserEvent: state.capture }) }));
vi.mock("@/server/analytics", () => ({ getAnalytics: state.report }));
vi.mock("@/server/auth/otp", () => ({ readMockOtp: vi.fn() }));
vi.mock("@/server/admin", () => ({ getSettings: vi.fn(), saveSettings: vi.fn(), adminDirectory: vi.fn() }));
vi.mock("@/server/media", () => ({ uploadMedia: vi.fn() }));
vi.mock("@/server/shipping", () => ({ getShippingSettings: vi.fn(), saveShippingSettings: vi.fn() }));
vi.mock("@/server/presentation", () => ({ getPresentation: vi.fn(), getAdminPresentation: vi.fn(), savePresentation: vi.fn() }));
vi.mock("@/server/notifications", () => ({ getNotificationFeed: vi.fn() }));
vi.mock("@/server/observability", () => ({ withRequestContext: (_request: Request, run: () => unknown) => run(), finishRequest: (response: Response) => response, unexpectedFailureCategory: () => "unexpected", recordCommerceResponse: vi.fn() }));

function request(path: string, method = "GET", body?: string, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method, headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body }) });
}
const actor = { kind: "admin", userId: randomUUID(), sessionId: randomUUID() };
const search = () => ({ eventId: randomUUID(), kind: "search", hasQuery: true, resultBucket: "zero" });
beforeEach(() => {
  state.enabled = false;
  for (const value of Object.values(state)) if (typeof value === "function") value.mockReset();
  state.database.mockImplementation(() => { throw new Error("No database in controlled ingress test"); });
  state.capture.mockImplementation(async input => { parseBrowserAnalyticsInput(input); return { ok: true }; });
  state.admin.mockResolvedValue(actor);
  state.report.mockResolvedValue({ server: { checkoutStarted: "9007199254740993" } });
});
function noCommerceOrIdentity() {
  expect(state.customer).not.toHaveBeenCalled(); expect(state.admin).not.toHaveBeenCalled();
  expect(state.createCheckout).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  expect(state.database).not.toHaveBeenCalled();
}
describe("bounded anonymous analytics ingress and native report delegation", () => {
  it.each([false, true])("exposes only the explicit capture switch (%s) without identity/cookies", async enabled => {
    state.enabled = enabled;
    const response = await GET(request("analytics/config", "GET", undefined, { Cookie: "synthetic-ignored-cookie" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: { captureEnabled: enabled } });
    expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(state.capture).not.toHaveBeenCalled(); noCommerceOrIdentity();
  });
  it.each(["product_view", "add_to_cart", "search"])("accepts only scalar %s observations with neutral202", async kind => {
    const input = kind === "search" ? search() : { eventId: randomUUID(), kind, productId: randomUUID() };
    const response = await POST(request("analytics/events", "POST", JSON.stringify(input), { Cookie: "synthetic-ignored-cookie", "Content-Type": "application/json; charset=utf-8" }));
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ data: { ok: true } });
    expect(state.capture).toHaveBeenCalledExactlyOnceWith(input); expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store"); noCommerceOrIdentity();
  });
  it.each(["text/plain", "application/jsonp", "application/json-extra"])("rejects MIME %s before capture", async contentType => {
    expect((await POST(request("analytics/events", "POST", JSON.stringify(search()), { "Content-Type": contentType }))).status).toBe(415);
    expect(state.capture).not.toHaveBeenCalled(); noCommerceOrIdentity();
  });
  it.each<Record<string, string>>([{}, { Origin: "http://foreign.invalid" }, { "Sec-Fetch-Site": "cross-site" }])("rejects missing or foreign origin/site before capture: %j", async headers => {
    const input = request("analytics/events", "POST", JSON.stringify(search()), headers);
    if (!Object.keys(headers).length) input.headers.delete("Origin");
    expect((await POST(input)).status).toBe(403); expect(state.capture).not.toHaveBeenCalled(); noCommerceOrIdentity();
  });
  it.each(["declared", "streamed"])("bounds a %s body at1024 bytes", async mode => {
    const response = await POST(request("analytics/events", "POST", JSON.stringify({ ...search(), raw: "x".repeat(1100) }), mode === "declared" ? { "Content-Length": "1300" } : {}));
    expect(response.status).toBe(413); expect(state.capture).not.toHaveBeenCalled(); noCommerceOrIdentity();
  });
  it.each([{ query: "TEST-private-query" }, { customerId: "TEST-private-owner" }, { amountIrr: "999" }, { url: "https://fixture.invalid/private" }])("rejects extra private/financial fields without business effect: %j", async extra => {
    const response = await POST(request("analytics/events", "POST", JSON.stringify({ ...search(), ...extra })));
    expect(response.status).toBe(400); expect(JSON.stringify(await response.json())).not.toContain(Object.values(extra)[0]); noCommerceOrIdentity();
  });
  it("rejects malformed JSON without capture or reflected input", async () => {
    const response = await POST(request("analytics/events", "POST", "{TEST-private-canary"));
    expect(response.status).toBe(400); expect(JSON.stringify(await response.json())).not.toContain("TEST-private-canary");
    expect(state.capture).not.toHaveBeenCalled(); noCommerceOrIdentity();
  });
  it.each([["GET", GET], ["PUT", PUT], ["PATCH", PATCH], ["DELETE", DELETE]] as const)("does not capture through unsupported%s", async (method, handler) => {
    const response = await handler(request("analytics/events", method));
    expect(response.status).toBe(404); expect(state.capture).not.toHaveBeenCalled(); noCommerceOrIdentity();
  });
  it("delegates report access to native analytics.read and preserves decimal counts/no-store", async () => {
    const response = await GET(request("admin/analytics/period?from=2026-10-01&to=2026-10-12"));
    expect(response.status).toBe(200); expect(state.admin.mock.calls[0]?.[1]).toBe("analytics.read");
    expect(state.report).toHaveBeenCalledExactlyOnceWith(actor, { from: "2026-10-01", to: "2026-10-12" });
    expect(await response.json()).toEqual({ data: { server: { checkoutStarted: "9007199254740993" } } });
    expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(state.customer).not.toHaveBeenCalled();
  });
  it("withholds reports when native admin actor denies permission", async () => {
    state.admin.mockRejectedValue(new CommerceError("FORBIDDEN", "مجوز مشاهده ندارید.", 403));
    const response = await GET(request("admin/analytics/period"));
    expect(response.status).toBe(403); expect(state.report).not.toHaveBeenCalled(); expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each(["userId=TEST-private-owner","from=2026-10-01&from=2026-10-02"])("rejects unknown/repeated period authority fields%s before report",async query=>{
    const response=await GET(request(`admin/analytics/period?${query}`));expect(response.status).toBe(400);expect(state.report).not.toHaveBeenCalled();
  });
});
