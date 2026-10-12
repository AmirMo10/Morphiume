import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import * as schema from "../../../db/schema";
import { db, pool } from "../db";
import { getConfig } from "../config";
import { normalizePhone } from "../../lib/persian";
import { enforceRateLimit, otpDigest, sendOtp, verifyOtp } from "./otp";

function createAuth() {
const settings = getConfig();
const shared = {
  appName: "Morphiume",
  baseURL: settings.APP_BASE_URL,
  trustedOrigins: [settings.APP_BASE_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  user: { additionalFields: { disabled: { type: "boolean" as const, defaultValue: false, input: false } } },
  rateLimit: { enabled: true, storage: "database" as const, window: 60, max: 600, modelName: "rateLimit" },
  advanced: {
    useSecureCookies: settings.APP_BASE_URL.startsWith("https:"),
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" as const, path: "/" },
  },
};

const customerAuth = betterAuth({
  ...shared,
  secret: settings.AUTH_SECRET,
  basePath: "/api/auth",
  emailAndPassword: { enabled: false },
  session: { expiresIn: 7 * 24 * 3600, updateAge: 24 * 3600, cookieCache: { enabled: false } },
  advanced: { ...shared.advanced, cookiePrefix: "morphiume-customer" },
  plugins: [phoneNumber({
    otpLength: 6, expiresIn: 180, allowedAttempts: 5, requireVerification: true,
    phoneNumberValidator: (phone) => { try { return normalizePhone(phone) === phone; } catch { return false; } },
    sendOTP: ({ phoneNumber: phone, code }) => sendOtp(phone, code),
    verifyOTP: ({ phoneNumber: phone, code }) => verifyOtp(phone, code),
    signUpOnVerification: { getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@customers.morphiume.invalid`, getTempName: () => "مشتری" },
  })],
  databaseHooks: {
    verification: { create: { before: async (value) => {
      if (/^\+989\d{9}$/.test(value.identifier) && /^\d{6}:\d+$/.test(value.value)) {
        return { data: { ...value, value: `${otpDigest(value.identifier, value.value.split(":")[0]!)}:0` } };
      }
      return { data: value };
    } } },
    session: { create: { before: async (value) => {
      const active = await pool.query("SELECT id FROM \"user\" WHERE id=$1 AND NOT disabled", [value.userId]);
      return active.rowCount ? { data: value } : false;
    } } },
  },
});

const adminAuth = betterAuth({
  ...shared,
  secret: settings.ADMIN_AUTH_SECRET,
  basePath: "/api/admin/auth",
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 14, revokeSessionsOnPasswordReset: true },
  session: { expiresIn: 8 * 3600, updateAge: 1800, cookieCache: { enabled: false } },
  advanced: { ...shared.advanced, cookiePrefix: "morphiume-admin" },
  plugins: [twoFactor({ issuer: "Morphiume", totpOptions: { digits: 6, period: 30 }, backupCodeOptions: { amount: 10, length: 12 } })],
  databaseHooks: {
    session: { create: { before: async (value) => {
      const active = await pool.query("SELECT u.id FROM \"user\" u JOIN role_membership r ON r.user_id=u.id WHERE u.id=$1 AND NOT u.disabled LIMIT 1", [value.userId]);
      return active.rowCount ? { data: value } : false;
    } } },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      await enforceRateLimit("admin-auth:global", 200, 60);
      if (ctx.path === "/sign-up/email" || ctx.path.startsWith("/phone-number/")) throw new APIError("FORBIDDEN", { message: "این روش ورود برای مدیریت فعال نیست." });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(ctx.path)) return;
      const returned = ctx.context.returned;
      if (returned instanceof APIError || !returned || typeof returned !== "object" || !("token" in returned)) return;
      const proof = ctx.context.newSession ?? ctx.context.session;
      if (!proof?.session || !proof.user) return;
      await pool.query(
        `INSERT INTO admin_grant(session_id,factor_verified_at,expires_at)
         SELECT s.id,now(),LEAST(s.expires_at,now()+interval '8 hours') FROM session s JOIN "user" u ON u.id=s.user_id
         WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>now() AND u.two_factor_enabled AND NOT u.disabled
         ON CONFLICT(session_id) DO UPDATE SET factor_verified_at=now(),expires_at=EXCLUDED.expires_at`,
        [proof.session.id, proof.user.id],
      );
    }),
  },
});
return {customerAuth,adminAuth};
}
let instance: ReturnType<typeof createAuth> | undefined;
function getAuth() { return instance ??= createAuth(); }
export const customerAuth = new Proxy({} as ReturnType<typeof createAuth>["customerAuth"], {get(_target,key) {return Reflect.get(getAuth().customerAuth,key);},has(_target,key) {return key in getAuth().customerAuth;}});
export const adminAuth = new Proxy({} as ReturnType<typeof createAuth>["adminAuth"], {get(_target,key) {return Reflect.get(getAuth().adminAuth,key);},has(_target,key) {return key in getAuth().adminAuth;}});
