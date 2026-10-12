import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { config } from "dotenv";
import { createAdmin, disableUsers, isolatedPool } from "./acceptance-fixtures";
import { nativeAuthAction, nativeAuthStatuses } from "./native-auth-actions";

async function main() {
  config({ path: ".env.local", quiet: true });
  const baseURL = process.env.E2E_BASE_URL ?? process.env.APP_BASE_URL!;
  expect(new URL(baseURL).hostname).toBe("localhost");
  const pool = isolatedPool();
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const users: string[] = [];
  const preparationStatuses: { category: string; status: number; retryAfterSeconds: number | null }[] = [];
  let result: Record<string, unknown> | undefined;
  try {
    const admins = [];
    for (let index = 0; index < 4; index++) { const admin = await createAdmin(pool); admins.push(admin); users.push(admin.userId); }
    // Three distinct real valid accounts share the actual per-path IP/fallback
    // bucket. Do not change forwarding, limits, existing rows, or browser time.
    for (const admin of admins.slice(0, 3)) {
      const response = await context.request.post("/api/admin/auth/sign-in/email", { headers: { Origin: baseURL }, data: { email: admin.email, password: admin.password } });
      const raw = response.headers()["retry-after"] ?? response.headers()["x-retry-after"];
      const retryAfterSeconds = raw && /^\d+$/u.test(raw) ? Number(raw) : null;
      preparationStatuses.push({ category: "admin-sign-in-email", status: response.status(), retryAfterSeconds });
      expect([200, 429]).toContain(response.status());
      if (response.status() === 429) break;
    }
    // A separate browser context starts without any prior account's auth cookie.
    await context.clearCookies();
    const target = admins[3]!;
    await page.goto("/admin/login");
    const submit = async () => {
      await page.getByLabel("ایمیل مدیر", { exact: true }).fill(target.email);
      await page.getByLabel("رمز عبور", { exact: true }).fill(target.password);
      await page.getByRole("button", { name: "ورود و ادامه", exact: true }).click();
    };
    const blockedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/auth/sign-in/email" && response.request().method() === "POST");
    await submit();
    const blocked = await blockedResponse;
    expect(blocked.status()).toBe(429);
    const header = blocked.headers()["retry-after"] ?? blocked.headers()["x-retry-after"];
    const blockedRetryAfterSeconds = header && /^\d+$/u.test(header) ? Number(header) : null;
    expect(await page.getByRole("heading", { name: "راه‌اندازی تأیید دومرحله‌ای", exact: true }).count()).toBe(0);
    await nativeAuthAction(page, "password-sign-in", submit);
    await expect(page.getByRole("heading", { name: "راه‌اندازی تأیید دومرحله‌ای", exact: true })).toBeVisible();
    result = {
      generatedAt: new Date().toISOString(), browserVersion: browser.version(), betterAuthVersion: "1.7.7",
      scope: "Controlled Windows local mechanism reproduction; does not establish causes of all original Linux CI failures",
      preparationStatuses, firstUiSignIn: { category: "admin-sign-in-email", status: blocked.status(), retryAfterSeconds: blockedRetryAfterSeconds, mfaSetupHeadingCount: 0 },
      correctedAction: nativeAuthStatuses(page), nativeMfaSetupReached: true,
      controls: "No runtime/limit/limiter-row/IP/time modification; four genuine synthetic credential accounts; observed429-only bounded retry",
    };
  } finally {
    await disableUsers(pool, users);
    const remaining = (await pool.query("SELECT count(*)::int AS n FROM session WHERE user_id=ANY($1::text[])", [users])).rows[0].n as number;
    expect(remaining).toBe(0);
    if (result) {
      result.cleanup = { syntheticUsersDisabled: users.length, remainingFixtureSessions: remaining, limiterRecordsPreserved: true };
      await mkdir("docs/qa", { recursive: true });
      await writeFile("docs/qa/native-auth-rate-window-reproduction.json", JSON.stringify(result, null, 2) + "\n");
    }
    await context.close(); await browser.close(); await pool.end();
  }
  console.log("Controlled native429 prevented the MFA heading; bounded observed-response waiting restored native setup. Four fixture accounts disabled, no sessions remain.");
}
main().catch((error: unknown) => { console.error(`Controlled native reproduction failed (${error instanceof Error ? error.name : "unknown"}); no credential-bearing error output emitted.`); process.exitCode = 1; });
