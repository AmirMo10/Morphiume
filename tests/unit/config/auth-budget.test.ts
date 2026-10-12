import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "@/server/auth/otp";
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db", () => ({ pool: { query: state.query } }));
vi.mock("@/server/config", async () => {
  const { randomBytes } = await import("node:crypto");
  const settings = { AUTH_SECRET: randomBytes(32).toString("hex") };
  return { getConfig: () => settings };
});
beforeEach(() => state.query.mockReset());
afterEach(() => vi.restoreAllMocks());
describe("fixed-window authentication budget response", () => {
  it("retains the inclusive existing200-request threshold and opaque key", async () => {
    vi.spyOn(Date, "now").mockReturnValue(60001);
    state.query.mockResolvedValue({ rows: [{ count: 200 }] });
    await enforceRateLimit("admin-auth:global", 200, 60);
    expect(state.query.mock.calls[0]![1]).toEqual([expect.stringMatching(/^app:[a-f0-9]{64}$/), 60000]);
  });
  it("reports the actual remaining fixed window on request201", async () => {
    vi.spyOn(Date, "now").mockReturnValue(60001);
    state.query.mockResolvedValue({ rows: [{ count: 201 }] });
    await expect(enforceRateLimit("admin-auth:global", 200, 60)).rejects.toMatchObject({ statusCode: 429, headers: { "Retry-After": "60" } });
  });
  it("keeps SMS500/hour distinct and reports its remaining window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4200100);
    state.query.mockResolvedValue({ rows: [{ count: 501 }] });
    await expect(enforceRateLimit("sms:global", 500, 3600)).rejects.toMatchObject({ statusCode: 429, headers: { "Retry-After": "3000" } });
  });
  it("returns a positive retry when the query crosses a window boundary", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(60001).mockReturnValueOnce(120001);
    state.query.mockResolvedValue({ rows: [{ count: 201 }] });
    await expect(enforceRateLimit("admin-auth:global", 200, 60)).rejects.toMatchObject({ statusCode: 429, headers: { "Retry-After": "1" } });
  });
});
