// Explicit operator command, never invoked by application startup or seeding.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, rename } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { getConfig } from "../src/server/config";
import { pool } from "../src/server/db";
import { adminAuth } from "../src/server/auth";
import { PRIVATE_PREVIEW_EMAIL, privatePreviewHeaders, readPrivatePreviewConfig } from "../src/server/auth/private-preview";

async function main() {
  const settings = getConfig(), command = process.argv[2];
  if (settings.DEPLOYMENT_ENV !== "staging" || settings.APP_BASE_URL !== "http://192.168.240.51" || settings.PAYMENT_PROVIDER !== "mock" || settings.SMS_PROVIDER !== "mock" || !["enable", "disable", "status"].includes(command ?? "")) throw new Error("Operator target rejected");
  const directory = path.join(settings.MEDIA_ROOT, ".private-preview-access"), file = path.join(directory, "config.json");
  const current = await readPrivatePreviewConfig(settings);
  if (command === "status") { console.info(JSON.stringify({ enabled: !!current })); return; }
  if (command === "disable") {
    if (!current) throw new Error("No active preview capability");
    // First prevent new anonymous access, then revoke its private native lease.
    await rename(file, path.join(directory, `disabled-${randomUUID()}.json`));
    await pool.query('UPDATE "user" SET disabled=true WHERE id=$1 AND email=$2', [current.userId, PRIVATE_PREVIEW_EMAIL]);
    await pool.query("DELETE FROM session WHERE user_id=$1", [current.userId]);
    console.info(JSON.stringify({ enabled: false, previewSessionsRevoked: true })); return;
  }
  if (current) throw new Error("Preview already enabled; credentials will not be replaced");
  const userId = randomUUID(), password = randomBytes(32).toString("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if ((await client.query('SELECT id FROM "user" WHERE email=$1', [PRIVATE_PREVIEW_EMAIL])).rowCount) throw new Error("Reserved preview identity exists; manual review required");
    await client.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)', [userId, "حساب مشترک پیش‌نمایش آزمایشی", PRIVATE_PREVIEW_EMAIL]);
    await client.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)", [randomUUID(), userId, await hashPassword(password)]);
    await client.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')", [userId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const cookies = new Map<string, string>();
  async function native(endpoint: string, body: object) {
    const response = await adminAuth.handler(new Request(`${settings.APP_BASE_URL}/api/admin/auth${endpoint}`, { method: "POST", headers: { Origin: settings.APP_BASE_URL, "Content-Type": "application/json", Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") }, body: JSON.stringify(body) }));
    if (!response.ok) throw new Error("Native preview enrollment rejected");
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0]!, offset = pair.indexOf("="), key = pair.slice(0, offset), value = pair.slice(offset + 1);
      if (!value || /max-age=0(?:;|$)/i.test(line)) cookies.delete(key); else cookies.set(key, value);
    }
    return await response.json() as Record<string, unknown>;
  }
  try {
    await native("/sign-in/email", { email: PRIVATE_PREVIEW_EMAIL, password });
    const enrollment = await native("/two-factor/enable", { password });
    if (typeof enrollment.totpURI !== "string") throw new Error("Native enrollment missing");
    // The first genuine TOTP verification is performed by the same private
    // session service used by the app; no MFA flag/grant is written manually.
    await native("/sign-out", {});
    await mkdir(directory, { mode: 0o700 });
    const handle = await open(file, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify({ version: 1, origin: settings.APP_BASE_URL, email: PRIVATE_PREVIEW_EMAIL, userId, password, totpURI: enrollment.totpURI }) + "\n"); await handle.sync(); } finally { await handle.close(); }
    // Pending enrollment has no verified second factor yet: sign-in establishes
    // a password session and real verify-totp activates it using the native API.
    if (!await privatePreviewHeaders()) throw new Error("Preview native session unavailable");
    console.info(JSON.stringify({ enabled: true, sharedPreviewOperator: true, nativeSessionVerified: true, ownerUnchanged: true }));
  } catch {
    await pool.query('UPDATE "user" SET disabled=true WHERE id=$1 AND email=$2', [userId, PRIVATE_PREVIEW_EMAIL]);
    await pool.query("DELETE FROM session WHERE user_id=$1", [userId]);
    throw new Error("Preview setup failed closed; inspect private operator state");
  }
}
main().catch(() => { console.error("Private preview operator command failed; no credentials printed."); process.exitCode = 1; }).finally(async () => { await pool.end(); });
