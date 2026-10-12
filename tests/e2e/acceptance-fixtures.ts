import { randomInt, randomUUID } from "node:crypto";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import type { ProductDto, Role } from "../../src/contracts/commerce";
import { totpForUri } from "../integration/auth/helpers";
import { nativeAuthAction } from "./native-auth-actions";

export function isolatedPool() {
  const target = new URL(process.env.DATABASE_URL!);
  if (!["test", "staging"].includes(process.env.DEPLOYMENT_ENV ?? "") || process.env.PAYMENT_PROVIDER !== "mock" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("morphiume_staging")) throw new Error("Acceptance fixtures refuse a nonisolated database");
  return new pg.Pool({ connectionString: target.toString(), max: 3 });
}

export async function createAdmin(pool: pg.Pool, role: Role = "owner") {
  const userId = randomUUID(), email = `qa-acceptance-${userId}@fixture.invalid`, password = `Qa-${randomUUID()}-Password!`;
  await pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,\'QA independent acceptance\',$2,true)', [userId, email]);
  await pool.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)", [randomUUID(), userId, await hashPassword(password)]);
  await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)", [userId, role]);
  return { userId, email, password };
}

export async function verifyAdminTotp(page: Page, uri: string, codeLabel = "کد رمزساز برای تأیید دوباره", buttonName = "تأیید دوباره", scope?: Locator) {
  const controls = scope ?? page;
  await nativeAuthAction(page, buttonName === "تأیید و ورود به مدیریت" ? "totp-enrollment" : "totp-renewal", async () => {
    // Regenerate from the real enrolled secret immediately before every attempt.
    await controls.getByLabel(codeLabel, { exact: true }).fill(totpForUri(uri));
    await controls.getByRole("button", { name: buttonName, exact: true }).click();
  });
}

export async function loginAdmin(page: Page, credentials: { email: string; password: string }) {
  await page.goto("/admin/login");
  await nativeAuthAction(page, "password-sign-in", async () => {
    await page.getByLabel("ایمیل مدیر", { exact: true }).fill(credentials.email);
    await page.getByLabel("رمز عبور", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "ورود و ادامه", exact: true }).click();
  });
  await expect(page.getByRole("heading", { name: "راه‌اندازی تأیید دومرحله‌ای" })).toBeVisible();
  await nativeAuthAction(page, "mfa-enable", () => page.getByRole("button", { name: "ساخت کلید رمزساز", exact: true }).click());
  const secret = await page.getByLabel("کلید حساب", { exact: true }).inputValue();
  const uri = `otpauth://totp/Morphiume?secret=${secret}`;
  await verifyAdminTotp(page, uri, "کد شش‌رقمی برنامهٔ رمزساز", "تأیید و ورود به مدیریت");
  await expect(page).toHaveURL(/\/admin$/);
  return uri;
}

export async function loginCustomer(context: BrowserContext, baseURL: string) {
  const phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
  await nativeAuthAction(context.request, "customer-otp-send", () => context.request.post("/api/auth/phone-number/send-otp", { headers: { Origin: baseURL }, data: { phoneNumber: phone } }));
  await nativeAuthAction(context.request, "customer-otp-verify", async () => {
    const code = await controlledCustomerOtp(context, phone);
    return context.request.post("/api/auth/phone-number/verify", { headers: { Origin: baseURL }, data: { phoneNumber: phone, code } });
  });
  const session = await context.request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  const value = await session.json();
  expect(value.user.phoneNumberVerified).toBe(true);
  return { phone, userId: value.user.id as string };
}

export async function controlledCustomerOtp(context: BrowserContext, phone: string): Promise<string> {
  const inbox = await context.request.get(`/api/test/otp?phone=${encodeURIComponent(phone)}`, { headers: { "x-morphiume-test-secret": process.env.MOCK_CONTROL_SECRET! } });
  expect(inbox.status()).toBe(200);
  const code = (await inbox.json()).data.code as string;
  expect(typeof code === "string" && /^\d{6}$/u.test(code), "A current controlled OTP must exist; no implicit resend is allowed").toBe(true);
  return code;
}

export async function disableUsers(pool: pg.Pool, ids: string[]) {
  if (!ids.length) return;
  await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])', [ids]);
  await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])", [ids]);
}

export async function createProduct(page: Page, baseURL: string, marker: string, priceToman = "123456") {
  const input = { name: `آزمون مستقل Morphiume ${marker}`, slug: `qa-${marker}`, description: "کالای مصنوعی QA، برای فروش یا ارسال واقعی ساخته نشده است.", concentration: "آزمایشی", family: "QA", topNotes: ["آزمایشی"], heartNotes: [], baseNotes: [], images: [{ url: "/assets/sample-perfume.svg", alt: "تصویر دارای برچسب نمونهٔ آزمایشی", variantSku: null }], variants: [{ sku: `QA-${marker}`, volumeMl: 50, priceToman, initialStock: 4 }] };
  const created = await page.request.post("/api/admin/products", { headers: { Origin: baseURL }, data: input });
  expect(created.status()).toBe(201);
  const product = (await created.json()).data as ProductDto;
  const published = await page.request.post(`/api/admin/products/${product.id}/publish`, { headers: { Origin: baseURL }, data: { expectedVersion: product.version } });
  expect(published.status()).toBe(200);
  return (await published.json()).data as ProductDto;
}
