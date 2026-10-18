import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestCookies, totpForUri } from "./helpers";

config({ path: ".env.local", quiet: true });
const enabled = process.env.DEPLOYMENT_ENV === "test" && process.env.PAYMENT_PROVIDER === "mock" && !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("native BetterAuth with actual isolated PostgreSQL", () => {
  let auth: typeof import("../../../src/server/auth/index");
  let otp: typeof import("../../../src/server/auth/otp");
  let actors: typeof import("../../../src/server/auth/actors");
  let pool: typeof import("../../../src/server/db")["pool"];
  const users: string[] = [], phones: string[] = [];
  const base = process.env.APP_BASE_URL!;
  const fixturePhone = () => { const phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`; phones.push(phone); return phone; };
  async function request(kind: "customer" | "admin", endpoint: string, body?: object | (() => object), jar = new TestCookies()) {
    const path = kind === "admin" ? "/api/admin/auth" : "/api/auth";
    for (let attempt = 0; attempt < 2; attempt++) {
      const value = typeof body === "function" ? body() : body;
      const response = await (kind === "admin" ? auth.adminAuth : auth.customerAuth).handler(new Request(`${base}${path}${endpoint}`, {
        method: value ? "POST" : "GET",
        headers: { Origin: base, "Content-Type": "application/json", Cookie: jar.header() },
        ...(value ? { body: JSON.stringify(value) } : {}),
      }));
      if (kind === "admin" && response.status === 429 && attempt === 0) {
        const header = response.headers.get("X-Retry-After") ?? response.headers.get("Retry-After");
        // Native two-factor attempts also use the inspected3/10s window.
        const seconds = header === null && endpoint.startsWith("/two-factor/") ? 10 : Number(header);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 15) throw new Error("Unexpected native authentication retry interval");
        await response.body?.cancel();
        console.info(JSON.stringify({ event: "native_auth_qa_rate_wait", endpoint, waitMs: seconds * 1000 + 100 }));
        await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100));
        continue;
      }
      jar.collect(response);
      return { response, data: await response.json() as Record<string, unknown>, jar };
    }
    throw new Error("Native authentication retry bound exhausted");
  }
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("morphiume_staging")) throw new Error("QA auth refuses nonisolated fixture database");
    auth = await import("../../../src/server/auth/index");
    otp = await import("../../../src/server/auth/otp");
    actors = await import("../../../src/server/auth/actors");
    ({ pool } = await import("../../../src/server/db"));
  });
  afterAll(async () => {
    if (!pool) return;
    for (const phone of phones) {
      const found = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE phone_number=$1', [phone]);
      if (found.rows[0]) users.push(found.rows[0].id);
      await pool.query("DELETE FROM mock_sms_delivery WHERE phone=$1", [phone]);
      await pool.query("DELETE FROM verification_challenge WHERE phone=$1", [phone]);
      await pool.query("DELETE FROM verification WHERE identifier=$1", [phone]);
    }
    if (users.length) {
      await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])', [users]);
      await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])", [users]);
    }
    await pool.end();
  });
  it("creates a verified customer through real OTP and keeps sessions distinct from admin", async () => {
    const phone = fixturePhone();
    const sent = await request("customer", "/phone-number/send-otp", { phoneNumber: phone });
    expect(sent.response.status).toBe(200);
    const code = await otp.readMockOtp(phone);
    expect(code).toMatch(/^\d{6}$/);
    const stored = (await pool.query("SELECT code_hash FROM verification_challenge WHERE phone=$1", [phone])).rows[0]!;
    expect(stored.code_hash).not.toBe(code);
    const native = (await pool.query("SELECT value FROM verification WHERE identifier=$1", [phone])).rows[0]!;
    expect(native.value).not.toContain(code!);
    const verified = await request("customer", "/phone-number/verify", { phoneNumber: phone, code }, sent.jar);
    expect(verified.response.status).toBe(200);
    const session = await request("customer", "/get-session", undefined, sent.jar);
    expect((session.data.user as Record<string, unknown>).phoneNumberVerified).toBe(true);
    const admin = await request("admin", "/get-session", undefined, sent.jar);
    expect(admin.data).toBeNull();
    expect(await otp.verifyOtp(phone, code!)).toBe(false);
  });
  it("consumes exactly one OTP in a concurrent verify and rejects expired codes", async () => {
    const phone = fixturePhone(), code = "314159";
    await otp.sendOtp(phone, code);
    const concurrent = await Promise.all([otp.verifyOtp(phone, code), otp.verifyOtp(phone, code)]);
    expect(concurrent.filter(Boolean)).toHaveLength(1);
    const expired = fixturePhone();
    await otp.sendOtp(expired, "271828");
    await pool.query("UPDATE verification_challenge SET expires_at=now()-interval '1 second' WHERE phone=$1", [expired]);
    expect(await otp.verifyOtp(expired, "271828")).toBe(false);
  });
  it("native concurrent OTP requests issue only one session and repeat login uses one customer identity", async () => {
    const phone = fixturePhone();
    const sent = await request("customer", "/phone-number/send-otp", { phoneNumber: phone });
    expect(sent.response.status).toBe(200);
    const code = await otp.readMockOtp(phone);
    const concurrent = await Promise.all([request("customer", "/phone-number/verify", { phoneNumber: phone, code }), request("customer", "/phone-number/verify", { phoneNumber: phone, code })]);
    expect(concurrent.filter(result => result.response.status === 200)).toHaveLength(1);
    const identity = (await pool.query<{ id: string }>('SELECT id FROM "user" WHERE phone_number=$1', [phone])).rows;
    expect(identity).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM session WHERE user_id=$1", [identity[0]!.id])).rows[0].n).toBe(1);
    await pool.query("UPDATE verification_challenge SET resend_after=now()-interval '1 second' WHERE phone=$1", [phone]);
    expect((await request("customer", "/phone-number/send-otp", { phoneNumber: phone })).response.status).toBe(200);
    const nextCode = await otp.readMockOtp(phone);
    expect((await request("customer", "/phone-number/verify", { phoneNumber: phone, code: nextCode })).response.status).toBe(200);
    expect((await pool.query('SELECT count(*)::int AS n FROM "user" WHERE phone_number=$1', [phone])).rows[0].n).toBe(1);
  });
  it("retains the failed-attempt budget across resend and never reopens a locked code", async () => {
    const phone = fixturePhone();
    await otp.sendOtp(phone, "161803");
    for (let i = 0; i < 4; i++) expect(await otp.verifyOtp(phone, "000000")).toBe(false);
    await pool.query("UPDATE verification_challenge SET resend_after=now()-interval '1 second' WHERE phone=$1", [phone]);
    await otp.sendOtp(phone, "141421");
    expect((await pool.query("SELECT attempts,send_count FROM verification_challenge WHERE phone=$1", [phone])).rows[0]).toEqual({ attempts: 4, send_count: 2 });
    expect(await otp.verifyOtp(phone, "000000")).toBe(false);
    expect(await otp.verifyOtp(phone, "141421")).toBe(false);
    await pool.query("UPDATE verification_challenge SET resend_after=now()-interval '1 second' WHERE phone=$1", [phone]);
    await expect(otp.sendOtp(phone, "173205")).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
  });
  it("grants admin access only after genuine native TOTP enrollment and denies a revoked role", async () => {
    const id = randomUUID(), email = `qa-${id}@fixture.invalid`, password = `Qa-${randomUUID()}-Password!`;
    users.push(id);
    await pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,\'QA isolated admin\',$2,true)', [id, email]);
    await pool.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)", [randomUUID(), id, await hashPassword(password)]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')", [id]);
    const jar = new TestCookies();
    const login = await request("admin", "/sign-in/email", { email, password }, jar);
    expect(login.response.status).toBe(200);
    const pending = await actors.adminSession(new Headers({ cookie: jar.header() }));
    expect(pending?.mfaVerified).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS n FROM admin_grant WHERE session_id IN(SELECT id FROM session WHERE user_id=$1)", [id])).rows[0].n).toBe(0);
    const enable = await request("admin", "/two-factor/enable", { password }, jar);
    expect(enable.response.status).toBe(200);
    const uri = String(enable.data.totpURI);
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    const verified = await request("admin", "/two-factor/verify-totp", () => ({ code: totpForUri(uri), trustDevice: false }), jar);
    expect(verified.response.status).toBe(200);
    const approved = await actors.adminSession(new Headers({ cookie: jar.header() }));
    expect(approved?.mfaVerified).toBe(true);
    expect(approved?.permissions).toContain("catalog.write");
    const customer = await request("customer", "/get-session", undefined, jar);
    expect(customer.data).toBeNull();
    expect((await request("admin", "/sign-out", {}, jar)).response.status).toBe(200);
    const recoveryJar = new TestCookies();
    const challenge = await request("admin", "/sign-in/email", { email, password }, recoveryJar);
    expect(challenge.response.status).toBe(200);
    expect(challenge.data.twoFactorRedirect).toBe(true);
    const backupCode = (enable.data.backupCodes as string[])[0]!;
    const recovered = await request("admin", "/two-factor/verify-backup-code", { code: backupCode, trustDevice: false }, recoveryJar);
    expect(recovered.response.status).toBe(200);
    expect((await actors.adminSession(new Headers({ cookie: recoveryJar.header() }))).mfaVerified).toBe(true);
    expect((await request("admin", "/two-factor/verify-backup-code", { code: backupCode, trustDevice: false }, recoveryJar)).response.status).toBeGreaterThanOrEqual(400);
    await pool.query("DELETE FROM role_membership WHERE user_id=$1", [id]);
    await expect(actors.adminSession(new Headers({ cookie: recoveryJar.header() }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
