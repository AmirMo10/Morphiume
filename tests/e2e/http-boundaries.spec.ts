import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("T12/T19/T23: real native auth wrappers bound requests, preserve no-store and issue server request IDs", async ({ request, baseURL }) => {
  const requestIds = new Set<string>();
  for (const path of ["/api/auth/phone-number/send-otp", "/api/admin/auth/two-factor/verify-totp"]) {
    for (const input of [
      { data: "{", origin: baseURL!, expected: 400 },
      { data: "x".repeat(128001), origin: baseURL!, expected: 413 },
      { data: "{}", origin: "https://fixture-cross-origin.invalid", expected: 403 },
    ]) {
      const suppliedId = randomUUID();
      const response = await request.post(path, { headers: { Origin: input.origin, "Content-Type": "application/json", "X-Request-ID": suppliedId }, data: input.data });
      expect(response.status()).toBe(input.expected);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const requestId = response.headers()["x-request-id"]!;
      expect(requestId).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
      expect(requestId).not.toBe(suppliedId); expect(requestIds.has(requestId)).toBe(false); requestIds.add(requestId);
      expect((await response.json()).error.code).toBe(input.expected === 403 ? "FORBIDDEN" : "VALIDATION");
    }
  }
  const health = await request.get("/api/health/live"); expect(health.status()).toBe(200);
  expect(health.headers()["x-request-id"]).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
});
