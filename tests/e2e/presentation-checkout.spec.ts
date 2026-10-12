import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type pg from "pg";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer, verifyAdminTotp } from "./acceptance-fixtures";
import { archiveFixtureProducts, assertPrivateOrderCounts, controlledCheckout, editablePresentation, payControlledCheckout } from "./next-acceptance-fixtures";
import type { AdminPresentationDto } from "../../src/contracts/presentation";

type PresentationRow = { value: unknown; version: number; updated_by: string | null; updated_at: Date };
async function restorePresentation(pool: pg.Pool, prior: PresentationRow | undefined, ownerId: string) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN"); await connection.query("SET LOCAL lock_timeout='5s'"); await connection.query("SELECT pg_advisory_xact_lock(818003)");
    if (prior) await connection.query("UPDATE store_setting SET value=$1::jsonb,version=$2,updated_by=$3,updated_at=$4 WHERE key='presentation' AND updated_by=$5", [JSON.stringify(prior.value), prior.version, prior.updated_by, prior.updated_at, ownerId]);
    else await connection.query("DELETE FROM store_setting WHERE key='presentation' AND updated_by=$1", [ownerId]);
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; } finally { connection.release(); }
}

test("T09/T12/T19/T25: native owner presentation pause refuses new checkout but preserves exact replay and callback", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), marker = randomUUID(), users: string[] = [], products: string[] = [];
  const customer = await browser.newContext({ baseURL }), editor = await browser.newContext({ baseURL });
  let priorRow: PresentationRow | undefined, snapshotTaken = false, ownerId = "";
  try {
    const owner = await createAdmin(pool); ownerId = owner.userId; users.push(ownerId);
    const ownerUri = await loginAdmin(page, owner);
    const originalResponse = await page.request.get("/api/admin/presentation"); expect(originalResponse.status()).toBe(200);
    const original = (await originalResponse.json()).data as AdminPresentationDto;
    expect(original.maintenance.enabled, "Controlled precondition: order acceptance is enabled before pause fixture").toBe(false);
    priorRow = (await pool.query("SELECT value,version,updated_by,updated_at FROM store_setting WHERE key='presentation'")).rows[0]; snapshotTaken = true;
    const product = await createProduct(page, baseURL!, `presentation-${marker}`); products.push(product.id);
    const buyer = await loginCustomer(customer, baseURL!); users.push(buyer.userId);
    const pending = await controlledCheckout(customer, baseURL!, product.variants[0]!.id, `qa-pause-existing-${marker}`);
    const manager = await createAdmin(pool, "product_manager"); users.push(manager.userId);
    const managerPage = await editor.newPage(); await loginAdmin(managerPage, manager);
    const forbiddenPause = await managerPage.request.put("/api/admin/presentation", { headers: { Origin: baseURL! }, data: { ...editablePresentation(original), expectedVersion: original.version, maintenance: { enabled: true, message: "توقف مصنوعی QA" }, reason: "QA owner-only pause" } });
    expect(forbiddenPause.status()).toBe(403);
    await pool.query("UPDATE admin_grant SET factor_verified_at=now()-interval '6 minutes' WHERE session_id IN(SELECT id FROM session WHERE user_id=$1)", [ownerId]);
    const stalePause = await page.request.put("/api/admin/presentation", { headers: { Origin: baseURL! }, data: { ...editablePresentation(original), expectedVersion: original.version, maintenance: { enabled: true, message: "توقف مصنوعی QA" }, reason: "QA stale pause" } });
    expect(stalePause.status()).toBe(403); expect((await stalePause.json()).error.code).toBe("MFA_REQUIRED");
    await page.goto("/admin/presentation");
    const title = `صفحهٔ اصلی مصنوعی QA ${marker}`, pauseMessage = `توقف کنترل‌شدهٔ QA ${marker}؛ سفارش واقعی ثبت نکنید.`;
    await page.getByLabel("عنوان صفحهٔ اصلی", { exact: true }).fill(title);
    await page.getByLabel("ثبت سفارش تازه متوقف شود.", { exact: true }).check();
    await page.getByLabel("پیام توقف سفارش‌گیری", { exact: true }).fill(pauseMessage);
    await page.getByLabel("دلیل تغییر نمایش فروشگاه", { exact: true }).fill(`QA native pause ${marker}`);
    await page.getByRole("button", { name: "بررسی و ذخیرهٔ نمایش فروشگاه", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "بررسی تغییر توقف سفارش‌گیری", exact: true });
    await expect(dialog.getByRole("button", { name: "تأیید و ثبت نمایش فروشگاه", exact: true })).toBeDisabled();
    await verifyAdminTotp(page, ownerUri, "کد رمزساز برای تغییر توقف سفارش‌گیری", "تأیید دوباره", dialog);
    await dialog.getByRole("button", { name: "تأیید و ثبت نمایش فروشگاه", exact: true }).click();
    await expect(page.getByText("نمایش فروشگاه ذخیره شد.", { exact: true })).toBeVisible();
    const published = (await (await customer.request.get("/api/presentation")).json()).data as AdminPresentationDto;
    expect(published.heroTitle).toBe(title); expect(published.maintenance).toEqual({ enabled: true, message: pauseMessage });
    const publicPage = await customer.newPage(); expect((await publicPage.goto("/"))?.status()).toBe(200);
    await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(title); await expect(publicPage.getByText(pauseMessage, { exact: true })).toBeVisible();
    const newCheckout = await customer.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": `qa-pause-new-${marker}` }, data: pending.input });
    expect(newCheckout.status()).toBe(503); expect((await newCheckout.json()).error.code).toBe("NOT_ELIGIBLE");
    const replay = await customer.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": pending.operationKey }, data: pending.input });
    expect(replay.status()).toBe(201); expect((await replay.json()).data.orderId).toBe(pending.checkout.orderId);
    await payControlledCheckout(customer, baseURL!, pending.authority, pending.checkout.orderId);
    const callback = await customer.request.get(`/api/payments/mock/callback?Authority=${encodeURIComponent(pending.authority)}`, { maxRedirects: 0 });
    expect(callback.status()).toBe(303); expect(callback.headers().location).toBe(`${baseURL}/orders/${pending.checkout.orderId}`);
    await assertPrivateOrderCounts(pool, pending.checkout.orderId);
    expect((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1", [buyer.userId])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [product.variants[0]!.id])).rows[0]).toEqual({ on_hand: 3, reserved: 0 });
    const conflicting = await page.request.put("/api/admin/presentation", { headers: { Origin: baseURL! }, data: { ...editablePresentation(published), expectedVersion: original.version, reason: `QA version conflict ${marker}` } }); expect(conflicting.status()).toBe(409);
    const settings = await page.request.get("/api/admin/settings"); expect(settings.status()).toBe(200); expect(settings.headers()["cache-control"]).toContain("no-store");
  } finally {
    // Restore only the exact shared row captured before this fixture and only
    // while its current writer is ours. Preserve any external writer and audit.
    try { if (snapshotTaken && ownerId) await restorePresentation(pool, priorRow, ownerId); }
    finally { await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await customer.close(); await editor.close(); await pool.end(); }
  }
});
