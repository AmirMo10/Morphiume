import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { config } from "dotenv";
import { controlledCustomerOtp, disableUsers, isolatedPool } from "./acceptance-fixtures";
import { nativeAuthAction, nativeAuthStatuses } from "./native-auth-actions";

async function main() {
  config({ path: ".env.local", quiet: true });
  const baseURL = process.env.E2E_BASE_URL ?? process.env.APP_BASE_URL!;
  expect(new URL(baseURL).hostname).toBe("localhost");
  const pool = isolatedPool(), browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ baseURL }), page = await context.newPage();
  const phones = Array.from({ length: 11 }, () => `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`);
  const userIds: string[] = [];
  let ownedPhones = false, result: Record<string, unknown> | undefined;
  async function clearOwnedPhoneFixtures() {
    const cleanup = await pool.connect();
    try {
      await cleanup.query("BEGIN");
      await cleanup.query("DELETE FROM mock_sms_delivery WHERE phone=ANY($1::text[])", [phones]);
      await cleanup.query("DELETE FROM verification_challenge WHERE phone=ANY($1::text[])", [phones]);
      await cleanup.query("DELETE FROM verification WHERE identifier=ANY($1::text[])", [phones]);
      await cleanup.query("COMMIT");
    } catch (error) { await cleanup.query("ROLLBACK"); throw error; } finally { cleanup.release(); }
  }
  try {
    expect(new Set(phones).size).toBe(11);
    const existing = (await pool.query('SELECT (SELECT count(*)::int FROM "user" WHERE phone_number=ANY($1::text[]))+(SELECT count(*)::int FROM verification WHERE identifier=ANY($1::text[]))+(SELECT count(*)::int FROM verification_challenge WHERE phone=ANY($1::text[]))+(SELECT count(*)::int FROM mock_sms_delivery WHERE phone=ANY($1::text[])) AS n', [phones])).rows[0].n;
    expect(existing).toBe(0); ownedPhones = true;
    // Genuine distinct phones, actual native requests and actual IP semantics.
    // Respect a preexisting429 rather than clearing the bucket before preparation.
    for (const phone of phones.slice(0, 10)) await nativeAuthAction(context.request, "customer-otp-send", () => context.request.post("/api/auth/phone-number/send-otp", { headers: { Origin: baseURL }, data: { phoneNumber: phone } }));
    const phone = phones[10]!;
    await page.goto("/account");
    await page.getByLabel("شمارهٔ همراه", { exact: true }).fill(phone);
    const send = () => page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/phone-number/send-otp" && response.request().method() === "POST");
    await send(); const blocked = await pending;
    expect(blocked.status()).toBe(429);
    expect(await page.getByLabel("کد تأیید را وارد کنید.", { exact: true }).count()).toBe(0);
    await expect(page.getByLabel("شمارهٔ همراه", { exact: true })).toHaveValue(phone);
    const raw = blocked.headers()["retry-after"] ?? blocked.headers()["x-retry-after"];
    const initial = { stage: "customer-otp-send", category: "customer-phone-send-otp", status: blocked.status(), retryAfterSeconds: raw && /^\d+$/u.test(raw) ? Number(raw) : null, otpInputCount: 0, phonePreserved: true };
    await nativeAuthAction(page, "customer-otp-send", send);
    await expect(page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible();
    await nativeAuthAction(page, "customer-otp-wrong-code", async () => {
      const code = await controlledCustomerOtp(context, phone);
      await page.getByLabel("کد تأیید را وارد کنید.", { exact: true }).fill(code === "000000" ? "111111" : "000000");
      await page.getByRole("button", { name: "تأیید شماره", exact: true }).click();
    }, 400);
    await nativeAuthAction(page, "customer-otp-verify", async () => {
      await page.getByLabel("کد تأیید را وارد کنید.", { exact: true }).fill(await controlledCustomerOtp(context, phone));
      await page.getByRole("button", { name: "تأیید شماره", exact: true }).click();
    });
    const session = await context.request.get("/api/auth/get-session"); expect(session.status()).toBe(200);
    const value = await session.json(); userIds.push(value.user.id as string);
    expect(value.user.phoneNumberVerified).toBe(true);
    result = { generatedAt: new Date().toISOString(), browserVersion: browser.version(), betterAuthVersion: "1.7.7", scope: "Controlled Windows native phone mechanism; fourth original CI failure lacks captured status", firstUiSend: initial, preparation: nativeAuthStatuses(context.request), correctedUi: nativeAuthStatuses(page), customerVerified: true, phonePluginRule: { max: 10, windowSeconds: 60, key: "per-path/IP" }, noImplicitResendDuringVerification: true };
  } finally {
    await disableUsers(pool, userIds);
    if (ownedPhones) await clearOwnedPhoneFixtures();
    const remaining = (await pool.query("SELECT count(*)::int AS n FROM session WHERE user_id=ANY($1::text[])", [userIds])).rows[0].n;
    expect(remaining).toBe(0);
    if (result) {
      result.cleanup = { syntheticCustomerUsersDisabled: userIds.length, remainingFixtureSessions: remaining, isolatedPhoneFixtures: ownedPhones ? phones.length : 0, limiterRecordsPreserved: true, noQueueOrCheckoutFixtures: true };
      await mkdir("docs/qa", { recursive: true });
      await writeFile("docs/qa/customer-rate-window-reproduction.json", JSON.stringify(result, null, 2) + "\n");
    }
    await context.close(); await browser.close(); await pool.end();
  }
  console.log("Controlled native customer-send429 prevented OTP input; observed wait restored input; intentional wrong-code400 and native verified200 stayed distinct. Owned phone fixtures cleaned; no limiter reset.");
}
main().catch((error: unknown) => { console.error(`Controlled customer reproduction failed (${error instanceof Error ? error.name : "unknown"}); credential-bearing output omitted.`); process.exitCode = 1; });
