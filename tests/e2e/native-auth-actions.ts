import { expect, test, type APIRequestContext, type APIResponse, type Page, type Response } from "@playwright/test";

export type NativeAuthStage = "password-sign-in" | "mfa-enable" | "totp-enrollment" | "totp-renewal" | "customer-otp-send" | "customer-otp-verify" | "customer-otp-wrong-code";
type NativeAuthCategory = "admin-sign-in-email" | "admin-two-factor-enable" | "admin-two-factor-verify-totp" | "customer-phone-send-otp" | "customer-phone-verify";
export type NativeAuthStatus = {
  stage: NativeAuthStage; category: NativeAuthCategory; attempt: number; status: number;
  retryAfterSeconds: number | null; retryAfterHeader: "retry-after" | "x-retry-after" | "absent";
};
const categories: Record<NativeAuthStage, { path: string; category: NativeAuthCategory }> = {
  "password-sign-in": { path: "/api/admin/auth/sign-in/email", category: "admin-sign-in-email" },
  "mfa-enable": { path: "/api/admin/auth/two-factor/enable", category: "admin-two-factor-enable" },
  "totp-enrollment": { path: "/api/admin/auth/two-factor/verify-totp", category: "admin-two-factor-verify-totp" },
  "totp-renewal": { path: "/api/admin/auth/two-factor/verify-totp", category: "admin-two-factor-verify-totp" },
  "customer-otp-send": { path: "/api/auth/phone-number/send-otp", category: "customer-phone-send-otp" },
  "customer-otp-verify": { path: "/api/auth/phone-number/verify", category: "customer-phone-verify" },
  "customer-otp-wrong-code": { path: "/api/auth/phone-number/verify", category: "customer-phone-verify" },
};
const statuses = new WeakMap<Page | APIRequestContext, NativeAuthStatus[]>();
export function nativeAuthStatuses(target: Page | APIRequestContext): NativeAuthStatus[] { return [...(statuses.get(target) ?? [])]; }

function retryInterval(response: Response | APIResponse): Pick<NativeAuthStatus, "retryAfterSeconds" | "retryAfterHeader"> {
  for (const header of ["retry-after", "x-retry-after"] as const) {
    const value = response.headers()[header];
    if (value === undefined) continue;
    const seconds = /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
    // A response must not be able to request an unbounded delay or publish an
    // arbitrary header value. Admin rules are10s; phone and global guards60s.
    expect(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60).toBe(true);
    return { retryAfterSeconds: Math.ceil(seconds), retryAfterHeader: header };
  }
  return { retryAfterSeconds: null, retryAfterHeader: "absent" };
}

export function nativeAuthAction(target: Page, stage: NativeAuthStage, action: () => Promise<unknown>, expectedStatus?: number): Promise<Response>;
export function nativeAuthAction(target: APIRequestContext, stage: NativeAuthStage, action: () => Promise<APIResponse>, expectedStatus?: number): Promise<APIResponse>;
export async function nativeAuthAction(target: Page | APIRequestContext, stage: NativeAuthStage, action: () => Promise<unknown>, expectedStatus = 200): Promise<Response | APIResponse> {
  const route = categories[stage];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response | APIResponse;
    if ("waitForResponse" in target) {
      const observed = target.waitForResponse(response => new URL(response.url()).pathname === route.path && response.request().method() === "POST");
      observed.catch(() => {}); // Avoid a detached observer rejection if the UI action itself fails.
      await action();
      response = await observed;
    } else {
      response = await action() as APIResponse;
    }
    const interval = retryInterval(response);
    const status: NativeAuthStatus = { stage, category: route.category, attempt, status: response.status(), ...interval };
    const history = statuses.get(target) ?? []; history.push(status); statuses.set(target, history);
    // This whitelist contains no URL/query, body, cookie, credentials or code.
    console.info(`[native-auth-status] ${JSON.stringify(status)}`);
    try { test.info().annotations.push({ type: "native-auth-status", description: JSON.stringify(status) }); }
    catch { /* A standalone controlled reproduction has no Playwright test info. */ }
    if (response.status() === 429 && attempt === 1) {
      // BetterAuth1.7.7 uses PER-PATH/IP admin3/10s and phone10/60s.
      // Missing timing can come from the app's global60s guard: use its full
      // known window conservatively. Never clear rows or invent another IP.
      await new Promise(resolve => setTimeout(resolve, (interval.retryAfterSeconds ?? 60) * 1000 + 250));
      continue;
    }
    expect(response.status(), `Native ${stage} HTTP status`).toBe(expectedStatus);
    return response;
  }
  throw new Error("Native authentication retry bound exhausted");
}
