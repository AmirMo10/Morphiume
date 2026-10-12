import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { APIError } from "better-auth/api";
import { pool } from "../db";
import { getConfig } from "../config";
import { normalizePhone } from "../../lib/persian";

export function otpDigest(phone: string, code: string): string {
  return createHmac("sha256", getConfig().AUTH_SECRET).update(`phone-otp:${phone}:${code}`).digest("hex");
}

export async function enforceRateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
  const opaque = createHmac("sha256", getConfig().AUTH_SECRET).update(key).digest("hex");
  const result = await pool.query<{ count: number }>(
    `INSERT INTO auth_rate_limit(key,count,last_request) VALUES($1,1,$2)
     ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limit.last_request=$2 THEN auth_rate_limit.count+1 ELSE 1 END,last_request=$2 RETURNING count`,
    [`app:${opaque}`, windowStart],
  );
  if ((result.rows[0]?.count ?? max + 1) > max) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + windowSeconds * 1000 - Date.now()) / 1000));
    throw new APIError("TOO_MANY_REQUESTS", { message: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید." }, { "Retry-After": String(retryAfter) });
  }
}

export async function sendOtp(phoneInput: string, code: string): Promise<void> {
  const settings = getConfig();
  if (settings.DEPLOYMENT_ENV === "live" || settings.SMS_PROVIDER !== "mock") throw new APIError("SERVICE_UNAVAILABLE", { message: "سرویس پیامک هنوز فعال نشده است." });
  const phone = normalizePhone(phoneInput);
  await enforceRateLimit("sms:global", 500, 3600);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`otp:${phone}`]);
    const previous = await client.query<{ attempts: number; send_count: number; window_started_at: Date; resend_after: Date }>("SELECT * FROM verification_challenge WHERE phone=$1 FOR UPDATE", [phone]);
    const old = previous.rows[0];
    const reset = !old || old.window_started_at.getTime() < Date.now() - 15 * 60_000;
    const attempts = reset ? 0 : old.attempts;
    const sends = reset ? 0 : old.send_count;
    if ((!reset && old.resend_after.getTime() > Date.now()) || attempts >= 5 || sends >= 5) throw new APIError("TOO_MANY_REQUESTS", { message: "برای درخواست کد تازه کمی صبر کنید." });
    await client.query(
      `INSERT INTO verification_challenge(phone,code_hash,expires_at,consumed_at,attempts,window_started_at,resend_after,send_count,last_sent_at)
       VALUES($1,$2,now()+interval '3 minutes',NULL,$3,$4,now()+interval '60 seconds',$5,now())
       ON CONFLICT(phone) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,consumed_at=NULL,attempts=EXCLUDED.attempts,
       window_started_at=EXCLUDED.window_started_at,resend_after=EXCLUDED.resend_after,send_count=EXCLUDED.send_count,last_sent_at=now()`,
      [phone, otpDigest(phone, code), attempts, reset ? new Date() : old.window_started_at, sends + 1],
    );
    const ciphertext = await symmetricEncrypt({ key: settings.AUTH_SECRET, data: code });
    await client.query("INSERT INTO mock_sms_delivery(phone,ciphertext,expires_at) VALUES($1,$2,now()+interval '3 minutes') ON CONFLICT(phone) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,expires_at=EXCLUDED.expires_at", [phone, ciphertext]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function verifyOtp(phoneInput: string, inputCode: string): Promise<boolean> {
  const phone = normalizePhone(phoneInput);
  if (!/^\d{6}$/.test(inputCode)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ code_hash: string; expires_at: Date; consumed_at: Date | null; attempts: number }>("SELECT code_hash,expires_at,consumed_at,attempts FROM verification_challenge WHERE phone=$1 FOR UPDATE", [phone]);
    const row = result.rows[0];
    if (!row || row.consumed_at || row.expires_at.getTime() <= Date.now() || row.attempts >= 5) { await client.query("COMMIT"); return false; }
    const expected = Buffer.from(row.code_hash, "hex");
    const actual = Buffer.from(otpDigest(phone, inputCode), "hex");
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
    await client.query("UPDATE verification_challenge SET attempts=attempts+1,consumed_at=CASE WHEN $2 THEN now() ELSE consumed_at END WHERE phone=$1", [phone, matches]);
    if (matches) await client.query("DELETE FROM mock_sms_delivery WHERE phone=$1", [phone]);
    await client.query("COMMIT");
    return matches;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function readMockOtp(phoneInput: string): Promise<string | null> {
  if (getConfig().DEPLOYMENT_ENV === "live") throw new Error("Mock inbox is unavailable in live.");
  const rows = await pool.query<{ ciphertext: string }>("SELECT ciphertext FROM mock_sms_delivery WHERE phone=$1 AND expires_at>now()", [normalizePhone(phoneInput)]);
  return rows.rows[0] ? symmetricDecrypt({ key: getConfig().AUTH_SECRET, data: rows.rows[0].ciphertext }) : null;
}
