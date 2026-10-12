import { expect, test, type Page, type Response } from "@playwright/test";

export type NativeAuthStage = "password-sign-in" | "mfa-enable" | "totp-enrollment" | "totp-renewal";
type NativeAuthCategory = "admin-sign-in-email" | "admin-two-factor-enable" | "admin-two-factor-verify-totp";
export type NativeAuthStatus = {
  stage: NativeAuthStage; category: NativeAuthCategory; attempt: number; status: number;
  retryAfterSeconds: number | null; retryAfterHeader: "retry-after" | "x-retry-after" | "absent";
};
const categories: Record<NativeAuthStage, { path: string; category: NativeAuthCategory }> = {
  "password-sign-in": { path: "/api/admin/auth/sign-in/email", category: "admin-sign-in-email" },
  "mfa-enable": { path: "/api/admin/auth/two-factor/enable", category: "admin-two-factor-enable" },
  "totp-enrollment": { path: "/api/admin/auth/two-factor/verify-totp", category: "admin-two-factor-verify-totp" },
  "totp-renewal": { path: "/api/admin/auth/two-factor/verify-totp", category: "admin-two-factor-verify-totp" },
};
const statuses = new WeakMap<Page, NativeAuthStatus[]>();
export function nativeAuthStatuses(page: Page): NativeAuthStatus[] { return [...(statuses.get(page) ?? [])]; }

function retryInterval(response: Response): Pick<NativeAuthStatus, "retryAfterSeconds" | "retryAfterHeader"> {
  for (const header of ["retry-after", "x-retry-after"] as const) {
    const value = response.headers()[header];
    if (value === undefined) continue;
    const seconds = /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
    // A response must not be able to request an unbounded delay or publish an
    // arbitrary header value. Native rules here are10s; the app-wide guard is60s.
    expect(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60).toBe(true);
    return { retryAfterSeconds: Math.ceil(seconds), retryAfterHeader: header };
  }
  return { retryAfterSeconds: null, retryAfterHeader: "absent" };
}

export async function nativeAuthAction(page: Page, stage: NativeAuthStage, action: () => Promise<unknown>): Promise<Response> {
  const route = categories[stage];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const observed = page.waitForResponse(response => new URL(response.url()).pathname === route.path && response.request().method() === "POST");
    await action();
    const response = await observed;
    const interval = retryInterval(response);
    const status: NativeAuthStatus = { stage, category: route.category, attempt, status: response.status(), ...interval };
    const history = statuses.get(page) ?? []; history.push(status); statuses.set(page, history);
    // This whitelist contains no URL/query, body, cookie, credentials or code.
    console.info(`[native-auth-status] ${JSON.stringify(status)}`);
    try { test.info().annotations.push({ type: "native-auth-status", description: JSON.stringify(status) }); }
    catch { /* A standalone controlled reproduction has no Playwright test info. */ }
    if (response.status() === 429 && attempt === 1) {
      // BetterAuth1.7.7 uses PER-PATH/IP max3/window10 and X-Retry-After.
      // Missing timing can come from the app's global60s guard: use its full
      // known window conservatively. Never clear rows or invent another IP.
      await page.waitForTimeout((interval.retryAfterSeconds ?? 60) * 1000 + 250);
      continue;
    }
    expect(response.status(), `Native ${stage} HTTP status`).toBe(200);
    return response;
  }
  throw new Error("Native authentication retry bound exhausted");
}
