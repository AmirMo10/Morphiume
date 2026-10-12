import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CommerceError } from "../../../src/contracts/commerce";
import { api, boundedAuthRequest, boundedBody, success } from "../../../src/server/http";
import { finishRequest, recordCommerceResponse, recordJobEvent, requestContext, unexpectedFailureCategory, withRequestContext } from "../../../src/server/observability";

afterEach(() => vi.restoreAllMocks());
function capture() {
  const records: Record<string, unknown>[] = [];
  const read = (value: unknown) => { records.push(JSON.parse(String(value))); };
  vi.spyOn(console, "log").mockImplementation(read);
  vi.spyOn(console, "error").mockImplementation(read);
  return records;
}
describe("request correlation and bounded private-data logging", () => {
  it("categorizes unexpected database failures without emitting SQLSTATE or private error fields", async () => {
    const records = capture(), canary = "private-error-query-contact-token-canary";
    for (const [code, category] of [["40P01", "database_deadlock"], ["40001", "database_serialization"], ["23505", "database_constraint"], ["08006", "database_connection"], ["42P01", "database_schema"], ["57014", "database_timeout"], [canary, "unexpected"]]) {
      const error = Object.assign(new Error(canary), { code, detail: canary, query: canary, schema: canary, constraint: canary });
      const response = await api(async () => { throw error; })(new NextRequest("http://localhost:3000/api/admin/collections"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: "INTERNAL", message: "درخواست انجام نشد. دوباره تلاش کنید." } });
      expect(records.at(-1)).toMatchObject({ route: "admin.catalog", errorCode: "INTERNAL", failureCategory: category });
    }
    expect(JSON.stringify(records)).not.toContain(canary);
    expect(JSON.stringify(records)).not.toMatch(/40P01|23505|08006|42P01|57014/);
    const getter = Object.defineProperty({}, "code", { get() { throw new Error(canary); } });
    expect(unexpectedFailureCategory(getter)).toBe("unexpected");
  });
  it("correlates durable jobs without serializing arbitrary types, payload or errors", () => {
    const records = capture(), jobId = randomUUID(), orderId = randomUUID(), paymentAttemptId = randomUUID();
    const canary = "private-provider-reference-09123456789-OTP987654";
    recordJobEvent({ state: "started", jobId, type: "payment.reconcile", attemptNumber: 2, orderId, paymentAttemptId });
    recordJobEvent({ state: "dead", jobId, type: canary, attemptNumber: 12, orderId: canary, paymentAttemptId: canary });
    recordJobEvent({ state: "retry", jobId: canary, type: "payment.reconcile", attemptNumber: 3 });
    recordJobEvent({ state: "retry", jobId, type: "payment.reconcile", attemptNumber: 13 });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ event: "job.started", jobId, jobType: "payment.reconcile", attemptNumber: 2, orderId, paymentAttemptId });
    expect(records[1]).toMatchObject({ event: "job.dead", jobId, jobType: "domain.other", attemptNumber: 12 });
    expect(Object.keys(records[1]!).sort()).toEqual(["time", "event", "jobId", "jobType", "attemptNumber"].sort());
    expect(JSON.stringify(records)).not.toContain(canary);
  });
  it("isolates concurrent async operations and ignores client-supplied correlation IDs", async () => {
    const records = capture();
    const results = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const orderId = randomUUID(), paymentAttemptId = randomUUID();
      const request = new Request(`http://localhost:3000/api/orders/${orderId}?secret=never-log`, { headers: { "X-Request-ID": "untrusted-client-id" } });
      const response = await withRequestContext(request, async () => {
        const before = requestContext()?.requestId;
        await new Promise(resolve => setTimeout(resolve, (20 - index) % 5));
        expect(requestContext()?.requestId).toBe(before);
        recordCommerceResponse("order.response", { orderId, paymentAttemptId, outcome: "confirmed" });
        return finishRequest(Response.json({ ok: true }));
      });
      return { requestId: response.headers.get("X-Request-ID"), orderId, paymentAttemptId };
    }));
    expect(requestContext()).toBeUndefined();
    expect(new Set(results.map(result => result.requestId)).size).toBe(20);
    for (const result of results) {
      expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
      const completed = records.find(record => record.event === "request.completed" && record.requestId === result.requestId);
      expect(completed).toMatchObject({ route: "orders", method: "GET", status: 200, orderId: result.orderId, paymentAttemptId: result.paymentAttemptId });
      expect(completed?.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(JSON.stringify(records)).not.toMatch(/never-log|untrusted-client-id/);
  });
  it("never serializes query, bodies, credentials, contact data, error text or arbitrary event fields", async () => {
    const records = capture(), canary = "PRIVATE-CANARY-09123456789-OTP987654-token-bank-reference-address@example.invalid";
    const request = new NextRequest(`http://localhost:3000/api/private-${canary}?search=${canary}`, {
      method: "POST", headers: { Cookie: canary, Authorization: canary }, body: JSON.stringify({ phone: canary, address: canary }),
    });
    const handler = api(async () => {
      recordCommerceResponse("order.response", { orderId: canary, paymentAttemptId: canary, outcome: canary });
      const failure = new Error(canary); failure.name = canary; throw failure;
    });
    const response = await handler(request);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "INTERNAL" } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ route: "api.other", method: "POST", status: 500, errorCode: "INTERNAL" });
    expect(JSON.stringify(records)).not.toContain(canary);
    expect(Object.keys(records[0]!).sort()).toEqual(["durationMs", "errorCode", "failureCategory", "event", "method", "requestId", "route", "status", "time"].sort());
  });
  it("retains redirects, cookie headers and private caching when responses are wrapped", async () => {
    capture();
    const request = new NextRequest("http://localhost:3000/api/payments/mock/callback?Authority=private-authority");
    const response = await api(async () => {
      const original = NextResponse.redirect("http://localhost:3000/orders/test", 303);
      original.cookies.set("session-test", "controlled-cookie", { httpOnly: true, sameSite: "lax", path: "/" });
      original.cookies.set("second-test", "second-cookie", { httpOnly: true, path: "/" });
      original.headers.set("Cache-Control", "private, no-store");
      return original;
    })(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/orders/test");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()[0]).toContain("HttpOnly");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("preserves domain, syntax and schema errors with safe status correlation", async () => {
    const records = capture();
    const errors = [new CommerceError("FORBIDDEN", "مجاز نیست.", 403), new CommerceError("MFA_REQUIRED", "تأیید دوباره لازم است.", 403), new SyntaxError("private-parser-input"), z.string().safeParse(1).error!];
    for (const error of errors) {
      const response = await api(async () => { throw error; })(new NextRequest("http://localhost:3000/api/admin/orders"));
      expect(response.status).toBe(error instanceof CommerceError ? 403 : 400);
      expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(records.map(record => record.errorCode)).toEqual(["FORBIDDEN", "MFA_REQUIRED", "VALIDATION", "VALIDATION"]);
    expect(JSON.stringify(records)).not.toContain("private-parser-input");
  });
  it("does not fail a successful operation when the log sink throws", async () => {
    vi.spyOn(console, "log").mockImplementation(() => { throw new Error("sink unavailable"); });
    const response = await api(async () => success({ committed: true }, 201))(new NextRequest("http://localhost:3000/api/checkout"));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { committed: true } });
  });
  it("bounds streamed JSON independently of content-length", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(70)); controller.enqueue(new Uint8Array(70)); controller.close(); } });
    const request = new Request("http://localhost:3000/api/auth/phone-number/send-otp", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(boundedBody(request, 128)).rejects.toMatchObject({ status: 413 });
  });
  it("limits every authentication POST before dispatch and preserves request credentials for the maintained library", async () => {
    const tooLarge = new NextRequest("http://localhost:3000/api/admin/auth/sign-in/email", { method: "POST", body: "x".repeat(128001) });
    await expect(boundedAuthRequest(tooLarge)).rejects.toMatchObject({ status: 413 });
    const request = new NextRequest("http://localhost:3000/api/auth/phone-number/verify-phone-number", { method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", Cookie: "controlled=synthetic", "Content-Length": "100" },
      body: JSON.stringify({ code: "۱۲۳۴۵۶", phoneNumber: "synthetic" }) });
    const bounded = await boundedAuthRequest(request, data => ({ ...data, code: "123456" }));
    expect(bounded.headers.get("Content-Length")).toBeNull();
    expect(bounded.headers.get("Cookie")).toBe("controlled=synthetic");
    expect(bounded.headers.get("Origin")).toBe("http://localhost:3000");
    expect(await bounded.json()).toEqual({ code: "123456", phoneNumber: "synthetic" });
  });
  it("rejects malformed, null and array authentication JSON before normalization", async () => {
    for (const body of ["null", "[]", "123", '"string"']) {
      await expect(boundedAuthRequest(new NextRequest("http://localhost:3000/api/auth/phone-number/send-otp", { method: "POST", body }), data => data)).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
    }
    await expect(boundedAuthRequest(new NextRequest("http://localhost:3000/api/auth/phone-number/send-otp", { method: "POST", body: "{" }), data => data)).rejects.toBeInstanceOf(SyntaxError);
  });
});
