import { afterEach, describe, expect, it, vi } from "vitest";
import { symmetricDecrypt, verifyPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";

// Public, synthetic fixtures only. Generated 2026-10-20T06:39:14.791Z using
// unmodified better-auth@1.7.7 crypto exports and @better-auth/utils@0.4.2
// Node/OTP exports, from integrity-checked official npm archives. The Noble
// 2.4.0/Jose 6.2.12 closure matches the pre-upgrade lockfile. Provenance and
// scope: docs/qa/VPS_MIGRATION_READINESS.md. No real account or factor is used.
const legacy = {
  password: "TEST-only! Morphiume legacy \uFF21e\u0301 ۱۴۰۵",
  passwordHash: "bf2fb17389c62dfeb9cefb8aa151ed72:0ed64ae0fbe00309aa9f1e8b4d9f3d923bf9f55593dd814faba2951d74a308600c25e022468d0bfe710768a5f23f926bb93869f36c098e988a00039d0f964c17",
  authSecret: "TEST-only-Morphiume-legacy-admin-auth-secret-20261020",
  totpSecret: "TESTOnlyMorphiumeLegacyTotpSecret",
  encryptedTotp: "62f973cfa6da733dc7d3a488e36623f391b8e3bdc4ef4a134ac313a1521637e91e62f5034fabb303dbfc94fa012dddc6b59a73db93e41a276417fb4765c9c3eced7f53b2a2575bd7d2",
  versionedTotp: "$ba$2$54fcc432d48dc61c73a59b844aaf068fe78413aab9adc7e48f097d7ec9a3228b00f38fff984705fd86f1af44fdfe37ec51368113f7c715c6009ec9ee1c7b101b3ae13289d3e057f12b",
  timestamp: 1795542240000,
  totpCode: "800160",
} as const;

afterEach(() => vi.restoreAllMocks());

describe("retained credential formats from BetterAuth 1.7.7", () => {
  it("verifies the previous library's persisted password hash", async () => {
    expect(await verifyPassword({ hash: legacy.passwordHash, password: legacy.password })).toBe(true);
  });

  it("retains password normalization while rejecting a different password", async () => {
    expect(await verifyPassword({ hash: legacy.passwordHash, password: legacy.password.normalize("NFKC") })).toBe(true);
    expect(await verifyPassword({ hash: legacy.passwordHash, password: `${legacy.password}!wrong` })).toBe(false);
  });

  it("decrypts a previous bare-hex MFA secret with the preserved auth key", async () => {
    expect(await symmetricDecrypt({ key: legacy.authSecret, data: legacy.encryptedTotp })).toBe(legacy.totpSecret);
  });

  it("rejects a different auth key and modified retained MFA ciphertext", async () => {
    await expect(symmetricDecrypt({ key: `${legacy.authSecret}-wrong`, data: legacy.encryptedTotp })).rejects.toThrow();
    const modified = `${legacy.encryptedTotp.slice(0, -1)}${legacy.encryptedTotp.endsWith("0") ? "1" : "0"}`;
    await expect(symmetricDecrypt({ key: legacy.authSecret, data: modified })).rejects.toThrow();
  });

  it("reads a previous versioned MFA envelope only with its matching key", async () => {
    const key = { currentVersion: 2, keys: new Map([[2, legacy.authSecret]]) };
    expect(await symmetricDecrypt({ key, data: legacy.versionedTotp })).toBe(legacy.totpSecret);
    await expect(symmetricDecrypt({ key: { currentVersion: 3, keys: new Map([[3, legacy.authSecret]]) }, data: legacy.versionedTotp })).rejects.toThrow();
  });

  it("requires an explicit legacy key when reading bare ciphertext through a key ring", async () => {
    const key = { currentVersion: 3, keys: new Map([[3, "TEST-only-different-current-auth-secret"]]) };
    expect(await symmetricDecrypt({ key: { ...key, legacySecret: legacy.authSecret }, data: legacy.encryptedTotp })).toBe(legacy.totpSecret);
    await expect(symmetricDecrypt({ key, data: legacy.encryptedTotp })).rejects.toThrow();
  });

  it("verifies the previous library's TOTP code after decrypting its stored secret", async () => {
    vi.spyOn(Date, "now").mockReturnValue(legacy.timestamp);
    const secret = await symmetricDecrypt({ key: legacy.authSecret, data: legacy.encryptedTotp });
    const otp = createOTP(secret, { digits: 6, period: 30 });
    expect(await otp.totp()).toBe(legacy.totpCode);
    expect(await otp.verify(legacy.totpCode, { window: 0 })).toBe(true);
    expect(await otp.verify("000000", { window: 0 })).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(legacy.timestamp + 120000);
    expect(await otp.verify(legacy.totpCode, { window: 0 })).toBe(false);
  });
});
