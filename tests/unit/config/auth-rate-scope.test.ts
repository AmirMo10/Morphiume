import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { adminAuth } from "@/server/auth";
import { api } from "@/server/http";

const state = vi.hoisted(() => ({ limiter: vi.fn(), databaseQuery: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {}, pool: { query: state.databaseQuery } }));
vi.mock("@better-auth/drizzle-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const data = { user: [], session: [], account: [], verification: [], rateLimit: [], twoFactor: [] };
  return { drizzleAdapter: () => memoryAdapter(data) };
});
vi.mock("@/server/config", async () => {
  const { randomBytes } = await import("node:crypto");
  const settings = { DEPLOYMENT_ENV: "test", APP_BASE_URL: "http://localhost:3000", AUTH_SECRET: randomBytes(32).toString("hex"), ADMIN_AUTH_SECRET: randomBytes(32).toString("hex"), SMS_PROVIDER: "mock" };
  return { getConfig: () => settings };
});
vi.mock("@/server/auth/otp", () => ({ enforceRateLimit: state.limiter, otpDigest: vi.fn(), sendOtp: vi.fn(), verifyOtp: vi.fn() }));

beforeEach(() => {
  state.limiter.mockReset(); state.databaseQuery.mockReset();
  state.databaseQuery.mockImplementation(() => { throw new Error("This native hook test must not query PostgreSQL"); });
  state.limiter.mockImplementation(async () => { throw new APIError("TOO_MANY_REQUESTS", { message: "private-error-canary" }, { "Retry-After": "17", "X-Private-Canary": "never-forward" }); });
});

describe("native admin hook scope with a controlled exhausted limiter", () => {
  it("does not charge internal credential/session reads to the public authentication quota", async () => {
    expect(await adminAuth.api.getSession({ headers: new Headers() })).toBeNull();
    expect(state.limiter).not.toHaveBeenCalled();
    expect(state.databaseQuery).not.toHaveBeenCalled();
  });
  it("keeps real HTTP authentication subject to the unchanged public quota", async () => {
    const response = await adminAuth.handler(new Request("http://localhost:3000/api/admin/auth/get-session", { headers: { Origin: "http://localhost:3000" } }));
    expect(response.status).toBe(429);
    expect(state.limiter).toHaveBeenCalledWith("admin-auth:global", 200, 60);
    expect(state.databaseQuery).not.toHaveBeenCalled();
  });
  it("keeps direct authentication mutations limited and maps their native429 safely outside the auth handler", async () => {
    const response = await api(async () => {
      await adminAuth.api.signInEmail({ headers: new Headers(), body: { email: "synthetic@fixture.invalid", password: "synthetic-not-an-account-password" } });
      return new Response(null, { status: 204 });
    })(new NextRequest("http://localhost:3000/api/admin/session"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(response.headers.has("X-Private-Canary")).toBe(false);
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED", message: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید." } });
    expect(state.limiter).toHaveBeenCalledWith("admin-auth:global", 200, 60);
    expect(state.databaseQuery).not.toHaveBeenCalled();
  });
});
