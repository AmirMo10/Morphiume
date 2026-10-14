import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { ProductDto } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { faNumber } from "../../src/components/number-format";

async function noDocumentOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport + 1);
}

test("Redesign: native search, mobile filter submission, focus restoration and accessible responsive storefront", async ({ browser, page, baseURL }, info) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), marker = randomUUID();
  const visitor = await browser.newContext({ baseURL, reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const buyer = await visitor.newPage();
  let product: ProductDto | undefined;
  let secondProduct: ProductDto | undefined, customerId: string | undefined;
  try {
    await loginAdmin(page, admin);
    product = await createProduct(page, baseURL!, `redesign-${marker}`);
    const fixtureName = "عطر نمونهٔ آزمایشی برای بررسی طراحی";
    const renamed = await page.request.patch(`/api/admin/products/${product.id}`, { headers: { Origin: baseURL! }, data: { expectedVersion: product.version, name: fixtureName, slug: product.slug, description: product.description, concentration: product.concentration, family: product.family, topNotes: product.topNotes, heartNotes: product.heartNotes, baseNotes: product.baseNotes, images: [{ url: "/assets/sample-perfume.svg", alt: "تصویر دارای برچسب نمونهٔ آزمایشی", variantSku: null }], variants: product.variants.map(variant => ({ sku: variant.sku, volumeMl: variant.volumeMl, priceToman: (BigInt(variant.price.amountIrr) / 10n).toString(), initialStock: 0 })) } });
    expect(renamed.status()).toBe(200);

    await buyer.goto("/");
    const searchTrigger = buyer.getByRole("button", { name: "بازکردن جست‌وجوی عطر", exact: true });
    await searchTrigger.click();
    const searchDialog = buyer.getByRole("dialog", { name: "جست‌وجوی عطر", exact: true });
    await expect(searchDialog).toBeVisible();
    await buyer.keyboard.press("Escape");
    await expect(searchDialog).not.toBeVisible();
    await expect(searchTrigger).toBeFocused();
    await searchTrigger.click();
    await searchDialog.getByRole("searchbox", { name: "جست‌وجوی عطر", exact: true }).fill(fixtureName);
    await searchDialog.getByRole("button", { name: /نمایش نتایج/ }).click();
    await expect(buyer).toHaveURL(/\/products\?search=/);
    await expect(buyer.getByRole("heading", { name: fixtureName, exact: true })).toBeVisible();

    const filterTrigger = buyer.getByRole("button", { name: /^فیلترها/ });
    await filterTrigger.click();
    const filters = buyer.getByRole("dialog", { name: "فیلتر عطرها", exact: true });
    await filters.getByLabel("حداقل قیمت (تومان)", { exact: true }).fill("۱۲۳۰۰۰");
    await filters.getByLabel("حداکثر قیمت (تومان)", { exact: true }).fill("۱۲۴۰۰۰");
    await filters.getByRole("button", { name: /^نمایش نتیجه‌ها/ }).click();
    await expect(filters).not.toBeVisible();
    await expect(buyer).toHaveURL(/minPriceToman=/);
    expect(new URL(buyer.url()).searchParams.get("maxPriceToman")).toBe("۱۲۴۰۰۰");
    await expect(buyer.getByRole("heading", { name: fixtureName, exact: true })).toBeVisible();
    await filterTrigger.click();
    await filters.getByLabel("حداقل قیمت (تومان)", { exact: true }).fill("۲۰۰۰۰۰");
    await filters.getByRole("button", { name: /^نمایش نتیجه‌ها/ }).click();
    await expect(filters).toBeVisible();
    await expect(filters.getByRole("alert")).toBeVisible();
    await expect(filters.getByLabel("حداقل قیمت (تومان)", { exact: true })).toHaveValue("۲۰۰۰۰۰");
    await buyer.keyboard.press("Escape");
    await expect(filterTrigger).toBeFocused();
    for (const width of [320, 390, 768, 1440]) {
      await buyer.setViewportSize({ width, height: 900 });
      await noDocumentOverflow(buyer);
      const axe = await new AxeBuilder({ page: buyer }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations).toEqual([]);
    }
    await buyer.goto(`/products/${product.slug}`);
    await expect(buyer.getByRole("heading", { name: fixtureName, exact: true })).toBeVisible();
    await buyer.screenshot({ path: info.outputPath("redesign-product-desktop.png"), fullPage: true });
    await buyer.setViewportSize({ width: 390, height: 844 });
    await noDocumentOverflow(buyer);
    await buyer.screenshot({ path: info.outputPath("redesign-product-mobile.png"), fullPage: true });
    await buyer.goto("/");
    await buyer.screenshot({ path: info.outputPath("redesign-home-mobile.png"), fullPage: true });
    await buyer.setViewportSize({ width: 1440, height: 1000 });
    await buyer.screenshot({ path: info.outputPath("redesign-home-desktop.png"), fullPage: true });
    secondProduct = await createProduct(page, baseURL!, `redesign-second-${marker}`);
    const customer = await loginCustomer(visitor, baseURL!); customerId = customer.userId;
    let wishlistReads = 0;
    buyer.on("request", request => { if (request.method() === "GET" && new URL(request.url()).pathname === "/api/wishlist") wishlistReads++; });
    const read = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/wishlist" && response.request().method() === "GET");
    await buyer.goto("/products");
    expect((await read).status()).toBe(200);
    expect(await buyer.locator("article.product-tile").count()).toBeGreaterThanOrEqual(2);
    const card = buyer.locator("article.product-tile").filter({ has: buyer.getByRole("heading", { name: fixtureName, exact: true }) });
    await expect(card.getByRole("button", { name: "ذخیره در علاقه‌مندی‌ها", exact: true })).toBeEnabled();
    expect(wishlistReads).toBe(1);
    await card.getByRole("button", { name: "ذخیره در علاقه‌مندی‌ها", exact: true }).click();
    await expect(card.getByRole("button", { name: "حذف از علاقه‌مندی‌ها", exact: true })).toHaveAttribute("aria-pressed", "true");
    await buyer.locator(".site-footer").getByRole("link", { name: "علاقه‌مندی‌ها", exact: true }).click();
    await expect(buyer).toHaveURL(/\/favorites$/);
    await expect(buyer.getByRole("heading", { name: fixtureName, exact: true })).toBeVisible();
    expect(wishlistReads).toBe(2);
  } finally {
    if (product) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [product.id]);
    if (secondProduct) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [secondProduct.id]);
    await disableUsers(pool, [admin.userId, ...(customerId ? [customerId] : [])]); await visitor.close(); await pool.end();
  }
});

test("Redesign: real management counts, status queues and mobile workspace navigation", async ({ page }, info) => {
  const pool = isolatedPool(), admin = await createAdmin(pool);
  try {
    await loginAdmin(page, admin);
    await expect(page.getByRole("heading", { name: "امروز در فروشگاه", exact: true })).toBeVisible();
    await expect(page.locator(".site-header")).toHaveCount(0);
    const response = await page.request.get("/api/admin/orders/page?page=1&pageSize=1");
    expect(response.status()).toBe(200);
    const total = (await response.json()).data.totalItems as number;
    await expect(page.locator(".admin-metric").filter({ hasText: "سفارش‌های دریافت‌شده" }).locator("strong")).toHaveText(faNumber(total));
    await page.locator(".admin-queue").filter({ hasText: "استثنای پرداخت" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\?status=payment_exception/);
    await expect(page.getByRole("combobox", { name: "وضعیت سفارش", exact: true })).toHaveValue("payment_exception");
    const requested = page.waitForResponse(response => response.url().includes("/api/admin/orders/page?") && new URL(response.url()).searchParams.get("status") === "confirmed");
    await page.getByRole("combobox", { name: "وضعیت سفارش", exact: true }).selectOption("confirmed");
    expect((await requested).status()).toBe(200);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "امروز در فروشگاه", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("redesign-admin-desktop.png"), fullPage: true, mask: [page.locator(".admin-session")] });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noDocumentOverflow(page);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.locator(".admin-menu-toggle");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.locator(".admin-sidebar").getByRole("link", { name: "محصولات", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  } finally { await disableUsers(pool, [admin.userId]); await pool.end(); }
});
