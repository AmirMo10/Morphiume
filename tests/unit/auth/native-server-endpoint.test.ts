import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { afterAll, expect, it, vi } from "vitest";
import { TestCookies } from "../../integration/auth/helpers";

const rate = vi.hoisted(() => vi.fn(async () => {}));
const state = vi.hoisted(() => ({ root: "", data: { user: [] as Record<string, unknown>[], session: [], account: [] as Record<string, unknown>[], verification: [], rateLimit: [], twoFactor: [] } }));
vi.mock("../../../src/server/db", () => ({ db: {}, pool: { query: vi.fn(async () => ({ rowCount: 1, rows: [] })) } }));
vi.mock("@better-auth/drizzle-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(state.data) };
});
vi.mock("../../../src/server/config", () => ({ getConfig: () => ({
  DEPLOYMENT_ENV: "staging", APP_BASE_URL: "http://192.168.240.51", SMS_PROVIDER: "mock", PAYMENT_PROVIDER: "mock", MEDIA_ROOT: state.root,
  AUTH_SECRET: randomBytes(32).toString("hex"), ADMIN_AUTH_SECRET: randomBytes(32).toString("hex"),
}) }));
vi.mock("../../../src/server/auth/otp", () => ({ enforceRateLimit: rate, otpDigest: vi.fn(), sendOtp: vi.fn(), verifyOtp: vi.fn() }));
import { adminAuth } from "../../../src/server/auth/index";

it("runs a genuine BetterAuth server-only endpoint through admin hooks", async () => {
  const result = await adminAuth.api.generateTOTP({ body: { secret: "JBSWY3DPEHPK3PXP" } });
  expect(result.code).toMatch(/^\d{6}$/);
  expect(rate).toHaveBeenCalledWith("admin-auth:global", 200, 60);
});

it("completes pending native TOTP enrollment into a private server lease", async () => {
  const userId = randomUUID(), email = "private-preview@morphiume.invalid", password = randomBytes(32).toString("hex"), now = new Date();
  state.root = await mkdtemp(path.join(os.tmpdir(), "morphiume-native-memory-"));
  state.data.user.push({ id: userId, name: "Native shared preview fixture", email, emailVerified: true, disabled: false, twoFactorEnabled: false, createdAt: now, updatedAt: now });
  state.data.account.push({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: await hashPassword(password), createdAt: now, updatedAt: now });
  const jar = new TestCookies();
  async function request(endpoint: string, body: object) {
    const response = await adminAuth.handler(new Request(`http://192.168.240.51/api/admin/auth${endpoint}`, { method: "POST", headers: { Origin: "http://192.168.240.51", Cookie: jar.header(), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    expect(response.status).toBe(200); jar.collect(response); return response.json();
  }
  await request("/sign-in/email", { email, password });
  const enrollment = await request("/two-factor/enable", { password });
  await request("/sign-out", {});
  const directory = path.join(state.root, ".private-preview-access"); await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(directory, "config.json"), JSON.stringify({ version: 1, origin: "http://192.168.240.51", email, userId, password, totpURI: enrollment.totpURI }), { mode: 0o600 });
  const { privatePreviewHeaders } = await import("../../../src/server/auth/private-preview");
  const headers = await privatePreviewHeaders();
  expect(headers).toBeInstanceOf(Headers);
  const proof = await adminAuth.api.getSession({ headers: headers! });
  expect(proof?.user.id).toBe(userId);
  expect(proof?.user.twoFactorEnabled).toBe(true);
});
afterAll(async () => { if (state.root) await rm(state.root, { recursive: true, force: true }); });
