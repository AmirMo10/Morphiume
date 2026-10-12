import { expect, test, type Page } from "@playwright/test";
type AdminAlias = "admin-home" | "admin-products-new" | "admin-login" | "other";
const roles = ["owner", "product_manager", "fulfillment", "support", "finance"];
function currentAlias(page: Page): AdminAlias {
  const pathname = new URL(page.url()).pathname;
  return pathname === "/admin" ? "admin-home" : pathname === "/admin/products/new" ? "admin-products-new" : pathname === "/admin/login" ? "admin-login" : "other";
}
export async function assertAdminReady(page: Page, expectedAlias: "admin-home" | "admin-products-new", documentHttpStatus: number | null = null) {
  const response = await page.request.get("/api/admin/session");
  const sessionHttpStatus = response.status();
  let mfaVerified = false, roleAllowed = false;
  try {
    const session = (await response.json()).data;
    mfaVerified = session?.mfaVerified === true;
    const allowed = expectedAlias === "admin-products-new" ? ["owner", "product_manager"] : roles;
    roleAllowed = Array.isArray(session?.roles) && session.roles.some((role: unknown) => typeof role === "string" && allowed.includes(role));
  } catch { /* Invalid/non-JSON response remains a failed semantic proof. */ }
  async function record(readiness: "observed" | "ready" | "failed") {
    const formPresent = expectedAlias === "admin-products-new" ? await page.getByLabel("نام محصول", { exact: true }).isVisible() : null;
    const status = { expectedAlias, actualAlias: currentAlias(page), documentHttpStatus, sessionHttpStatus, mfaVerified, roleAllowed, formPresent, readiness };
    console.info(`[admin-readiness-status] ${JSON.stringify(status)}`);
    try { test.info().annotations.push({ type: "admin-readiness-status", description: JSON.stringify(status) }); } catch { /* Standalone controlled probes lack test info. */ }
  }
  await record("observed");
  try {
    expect(sessionHttpStatus).toBe(200); expect(mfaVerified).toBe(true); expect(roleAllowed).toBe(true);
    if (expectedAlias === "admin-products-new") expect(documentHttpStatus).toBe(200);
    await expect.poll(() => currentAlias(page)).toBe(expectedAlias);
    if (expectedAlias === "admin-products-new") await expect(page.getByLabel("نام محصول", { exact: true })).toBeVisible();
  } catch (error) { await record("failed"); throw error; }
  await record("ready");
}
export async function openAdminProductForm(page: Page) {
  const response = await page.goto("/admin/products/new");
  await assertAdminReady(page, "admin-products-new", response?.status() ?? null);
}
