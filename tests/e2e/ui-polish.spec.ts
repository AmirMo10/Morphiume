import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import type { ProductDto } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { nativeAuthAction } from "./native-auth-actions";

async function accessibleViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}

test("UI polish: search continuity, mobile navigation, truthful errors, native favorites and original media", async ({ page, browser, baseURL }, info) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), marker = randomUUID();
  const visitor = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const buyer = await visitor.newPage();
  let product: ProductDto | undefined, customerId: string | undefined;
  try {
    await loginAdmin(page, admin);
    product = await createProduct(page, baseURL!, `polish-${marker}`);
    const uploaded: string[] = [];
    for (const [width, height] of [[16, 20], [320, 400]]) {
      const buffer = await sharp({ create: { width: width!, height: height!, channels: 3, background: "#8B5346" } }).png().toBuffer();
      const response = await page.request.post("/api/admin/media", { headers: { Origin: baseURL! }, multipart: { file: { name: `qa-polish-${width}.png`, mimeType: "image/png", buffer } } });
      expect(response.status()).toBe(201);
      const media = (await response.json()).data as { url: string; width: number; height: number };
      expect([media.width, media.height]).toEqual([width, height]);
      uploaded.push(media.url);
    }
    const lowAlt = "تصویر کوچک آزمایشی، نه تصویر کالای واقعی", highAlt = "تصویر بزرگ آزمایشی حجم صد";
    const first = product.variants[0]!, secondSku = `QA-POLISH-${marker}-100`;
    const patched = await page.request.patch(`/api/admin/products/${product.id}`, { headers: { Origin: baseURL! }, data: {
      expectedVersion: product.version, name: product.name, slug: product.slug, description: product.description,
      family: product.family, concentration: product.concentration, topNotes: product.topNotes, heartNotes: product.heartNotes, baseNotes: product.baseNotes,
      images: [{ url: uploaded[0]!, alt: lowAlt, variantSku: first.sku }, { url: uploaded[1]!, alt: highAlt, variantSku: secondSku }],
      variants: [{ sku: first.sku, volumeMl: 50, priceToman: "123456", initialStock: 0 }, { sku: secondSku, volumeMl: 100, priceToman: "234567", initialStock: 3 }],
    } });
    expect(patched.status()).toBe(200);
    product = (await patched.json()).data as ProductDto;

    await buyer.goto(`/products?search=${marker}&family=QA&sort=price_desc&page=2`);
    await buyer.getByRole("button", { name: "بازکردن جست‌وجوی عطر", exact: true }).click();
    const search = buyer.getByRole("dialog", { name: "جست‌وجوی عطر", exact: true });
    await expect(search.getByRole("searchbox")).toHaveValue(marker);
    await expect(search.getByRole("searchbox")).toBeFocused();
    await search.getByRole("button", { name: /نمایش نتایج/ }).click();
    await expect(buyer).toHaveURL(url => url.pathname === "/products" && !url.searchParams.has("page") && url.searchParams.get("search") === marker && url.searchParams.get("family") === "QA" && url.searchParams.get("sort") === "price_desc");
    const card = buyer.locator("article.product-tile").filter({ has: buyer.getByRole("heading", { name: product.name, exact: true }) });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "ذخیره در علاقه‌مندی‌ها", exact: true }).click();
    await expect(card.getByRole("button", { name: "حذف از علاقه‌مندی‌ها", exact: true })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "حذف از علاقه‌مندی‌ها", exact: true }).click();
    await expect(card.getByRole("button", { name: "ذخیره در علاقه‌مندی‌ها", exact: true })).toHaveAttribute("aria-pressed", "false");

    const menu = buyer.getByRole("button", { name: "بازکردن فهرست", exact: true });
    await menu.click();
    await buyer.locator('.header-actions a[href="/cart"]').click();
    await expect(buyer).toHaveURL(/\/cart$/);
    await expect(buyer.locator("#mobile-menu")).toHaveCount(0);
    await menu.click();
    await buyer.keyboard.press("Escape");
    await expect(buyer.locator("#mobile-menu")).toHaveCount(0);
    await expect(menu).toBeFocused();

    await buyer.goto("/products?minPriceToman=-1");
    const count = buyer.locator('.sf-catalog-toolbar [role="status"]');
    await expect(count).toHaveCount(1);
    await expect(count).toHaveText("برای نمایش عطرها، بازهٔ قیمت را اصلاح کنید.");
    await expect(buyer.getByText("در حال دریافت عطرها…", { exact: true })).toHaveCount(0);

    await buyer.goto(`/products/${product.slug}`);
    const gallery = buyer.getByRole("group", { name: "تصاویر محصول", exact: true });
    const low = gallery.getByRole("img", { name: lowAlt, exact: true });
    await expect(low).toHaveAttribute("src", uploaded[0]!);
    await expect.poll(() => low.evaluate(async (image: HTMLImageElement) => { await image.decode(); return [image.naturalWidth, image.naturalHeight]; })).toEqual([16, 20]);
    await expect(gallery.getByText("تصویر با وضوح محدود", { exact: true })).toBeVisible();
    await expect(gallery.locator(".sf-media-quality-mark")).toHaveAttribute("aria-hidden", "true");
    await buyer.reload();
    await expect(gallery.getByText("تصویر با وضوح محدود", { exact: true })).toBeVisible();
    await expect(low).toHaveAttribute("src", uploaded[0]!);
    await buyer.getByRole("radio", { name: /۱۰۰.*میلی‌لیتر/ }).check();
    const high = gallery.getByRole("img", { name: highAlt, exact: true });
    await expect(high).toHaveAttribute("src", uploaded[1]!);
    await expect.poll(() => high.evaluate(async (image: HTMLImageElement) => { await image.decode(); return [image.naturalWidth, image.naturalHeight]; })).toEqual([320, 400]);
    await expect(gallery.getByText("تصویر با وضوح محدود", { exact: true })).toHaveCount(0);
    await expect(gallery.locator(".sf-media-quality-mark")).toHaveCount(0);
    await accessibleViewport(buyer);
    await buyer.screenshot({ path: info.outputPath("polish-product-mobile.png"), fullPage: true });

    await buyer.goto("/account");
    const phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    await buyer.getByLabel("شمارهٔ همراه", { exact: true }).fill(phone);
    await nativeAuthAction(buyer, "customer-otp-send", () => buyer.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click());
    await expect(buyer.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeFocused();
    await buyer.getByRole("button", { name: "ویرایش شماره", exact: true }).click();
    await expect(buyer.getByLabel("شمارهٔ همراه", { exact: true })).toBeFocused();
    await expect(buyer.getByLabel("شمارهٔ همراه", { exact: true })).toHaveValue(phone);

    customerId = (await loginCustomer(visitor, baseURL!)).userId;
    let injected = 0;
    await visitor.route("**/api/wishlist", async route => {
      if (route.request().method() === "GET" && injected === 0) { injected++; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "خطای کنترل‌شدهٔ آزمون دریافت علاقه‌مندی" } }) }); }
      else await route.continue();
    });
    await buyer.goto(`/products?search=${marker}`);
    const failed = card.getByRole("button", { name: "بررسی علاقه‌مندی انجام نشد", exact: true });
    await expect(failed).toBeDisabled();
    expect(await failed.getAttribute("aria-pressed")).toBeNull();
    const retry = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/wishlist" && response.request().method() === "GET" && response.status() === 200);
    await card.getByRole("button", { name: "تلاش دوباره", exact: true }).click();
    await retry;
    await card.getByRole("button", { name: "ذخیره در علاقه‌مندی‌ها", exact: true }).click();
    await expect(card.getByRole("button", { name: "حذف از علاقه‌مندی‌ها", exact: true })).toHaveAttribute("aria-pressed", "true");
    const persisted = await visitor.request.get("/api/wishlist");
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).data.map((item: ProductDto) => item.id)).toContain(product.id);
    expect(injected).toBe(1);
    await accessibleViewport(buyer);
  } finally {
    if (product) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [product.id]);
    await disableUsers(pool, [admin.userId, ...(customerId ? [customerId] : [])]);
    await visitor.close(); await pool.end();
  }
});

test("UI polish: bounded native admin navigation, usable table actions and preserved filter intent", async ({ page, baseURL }, info) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), marker = randomUUID();
  let product: ProductDto | undefined;
  try {
    await loginAdmin(page, admin);
    await expect(page.getByRole("heading", { name: "نمای کلی فروشگاه", exact: true })).toBeVisible();
    product = await createProduct(page, baseURL!, `polish-admin-${marker}`);
    await page.setViewportSize({ width: 320, height: 844 });
    const toggle = page.locator(".admin-menu-toggle"), panel = page.locator("#admin-navigation");
    await toggle.click();
    await expect(panel.locator('nav a[aria-current="page"]')).toBeFocused();
    const dimensions = await panel.evaluate(e => ({ height: e.getBoundingClientRect().height, viewport: innerHeight, client: e.clientHeight, scroll: e.scrollHeight, overflow: getComputedStyle(e).overflowY }));
    expect(dimensions.height).toBeLessThan(dimensions.viewport);
    expect(["auto", "scroll"]).toContain(dimensions.overflow);
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await toggle.click();
    await panel.getByRole("button", { name: "بستن فهرست", exact: true }).click();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await panel.getByRole("link", { name: "رفتن به محتوای صفحه", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("main#main")).toBeFocused();

    await page.goto(`/admin/products?search=${marker}&status=published&page=2&pageSize=50`);
    await page.getByRole("combobox", { name: "نمایش در هر صفحه", exact: true }).selectOption("25");
    await expect(page).toHaveURL(url => url.pathname === "/admin/products" && !url.searchParams.has("page") && url.searchParams.get("search") === marker && url.searchParams.get("status") === "published" && url.searchParams.get("pageSize") === "25");
    const row = page.getByRole("row").filter({ hasText: product.name });
    await expect(row).toBeVisible();
    const thumbnail = row.locator(".admin-product-thumbnail");
    await expect(thumbnail).toHaveAttribute("aria-hidden", "true");
    await expect(thumbnail.locator("img")).toHaveAttribute("alt", "");
    const action = row.locator("td a.text-link").first();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await action.scrollIntoViewIfNeeded();
      const target = await action.evaluate(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, whiteSpace: getComputedStyle(e).whiteSpace }));
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.whiteSpace).toBe("nowrap");
      await accessibleViewport(page);
    }
    await page.screenshot({ path: info.outputPath("polish-admin-products-mobile.png"), fullPage: false, mask: [page.locator(".admin-session")] });
    await page.goto(`/admin/products/${product.id}`);
    const breadcrumb = page.getByRole("navigation", { name: "مسیر مدیریت", exact: true });
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("ویرایش محصول");
    expect(await breadcrumb.getByRole("link", { name: "محصولات", exact: true }).getAttribute("aria-current")).toBeNull();

    await page.goto("/admin/inventory");
    const search = page.getByLabel("جست‌وجوی نام یا شناسهٔ تنوع", { exact: true });
    await search.fill(`absent-${marker}`);
    await page.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    await expect(page.getByRole("heading", { name: "تنوعی با این جست‌وجو پیدا نشد.", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ثبت اصلاح موجودی", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "نمایش همهٔ تنوع‌ها", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("region", { name: "موجودی تنوع‌های محصول", exact: true })).toBeVisible();
    await accessibleViewport(page);
  } finally {
    if (product) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [product.id]);
    await disableUsers(pool, [admin.userId]); await pool.end();
  }
});
