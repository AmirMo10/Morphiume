import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, expect } from "@playwright/test";
import sharp from "sharp";
import { createAdmin, disableUsers, isolatedPool, loginAdmin } from "./acceptance-fixtures";
import { archiveFixtureProducts } from "./next-acceptance-fixtures";
import { readyDraftScreenshot } from "./draft-readiness";

async function main() {
  const startedAt = new Date().toISOString(), started = performance.now();
  const baseURL = process.env.E2E_BASE_URL ?? process.env.APP_BASE_URL!;
  if (new URL(baseURL).origin !== "http://localhost:3000") throw new Error("This bounded visual probe requires the released local QA runtime");
  const results: unknown[] = [], pool = isolatedPool();
  try {
    await mkdir("docs/qa/screenshots", { recursive: true });
    for (const engine of ["chromium", "webkit"] as const) {
      const browser = engine === "chromium" ? await chromium.launch({ channel: "chrome" }) : await webkit.launch();
      const users: string[] = [], products: string[] = [];
      try {
        const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } }), page = await context.newPage();
        const admin = await createAdmin(pool); users.push(admin.userId); await loginAdmin(page, admin);
        const marker = randomUUID(), name = `پیش‌نویس تصویری مصنوعی Morphiume ${marker.slice(0, 8)}`;
        const png = await sharp({ create: { width: 16, height: 20, channels: 4, background: "#3355B1" } }).png().toBuffer();
        const media = await page.request.post("/api/admin/media", { headers: { Origin: baseURL }, multipart: { file: { name: "qa-visual-fixture.png", mimeType: "image/png", buffer: png } } }); expect(media.status()).toBe(201);
        const image = (await media.json()).data as { url: string };
        const response = await page.request.post("/api/admin/products", { headers: { Origin: baseURL }, data: { name, slug: `qa-visual-${marker}`, description: "پیش‌نویس مصنوعی صرفاً برای شاهد تصویری QA؛ محصول فروش واقعی یا عکس واقعی عطر نیست.", concentration: "آزمایشی", family: "QA", topNotes: [], heartNotes: [], baseNotes: [], images: [{ url: image.url, alt: "رنگ آبی مصنوعی شاهد QA؛ عکس محصول واقعی نیست." }], variants: [{ sku: `QA-VISUAL-${marker}`, volumeMl: 50, priceToman: "123456", initialStock: 3 }] } }); expect(response.status()).toBe(201);
        const id = (await response.json()).data.id as string; products.push(id);
        const document = await page.goto(`/admin/products/${id}`); expect(document?.status()).toBe(200);
        await readyDraftScreenshot(page, name);
        const draftImage = page.locator(".gallery-editor-list img").first();
        await draftImage.scrollIntoViewIfNeeded(); await expect.poll(() => draftImage.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `docs/qa/screenshots/admin-product-draft-${engine}.png`, fullPage: true });
        await context.close();
        const publicContext = await browser.newContext({ baseURL, viewport: { width: 320, height: 640 }, reducedMotion: "reduce" });
        // No cart/session API reaches the server during this public visual probe.
        await publicContext.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "readonly-fixture", version: 1, couponCode: null, subtotal: { amountIrr: "0", currency: "IRR" }, items: [] } }) }));
        const catalog = await publicContext.newPage(); expect((await catalog.goto("/products"))?.status()).toBe(200);
        await expect(catalog).toHaveTitle("عطرها | Morphiume");
        const images = catalog.locator(".product-tile img");
        const count = await images.count();
        for (let index = 0; index < count; index++) { const image = images.nth(index); await image.scrollIntoViewIfNeeded(); await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true); }
        await catalog.evaluate(() => scrollTo(0, 0));
        await catalog.screenshot({ path: `docs/qa/screenshots/catalog-${engine}-320.png`, fullPage: true });
        results.push({ engine, version: browser.version(), draftHttpStatus: 200, persistedNameReady: true, publishControlReady: true, authenticationFieldsAbsent: true, draftImageDecoded: true, publicHttpStatus: 200, catalogImagesDecoded: count, publicApiScope: "controlled readonly responses", checkoutCustomerPaymentCreated: false });
        await publicContext.close();
      } finally { await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await browser.close(); }
    }
  } finally { await pool.end(); }
  await writeFile("docs/qa/visual-evidence-observations.json", JSON.stringify({ startedAt, durationMs: Math.round(performance.now() - started), runtimeBuild: "89652", runtimeSession: "36884", status: "passed", scope: "separate native-admin synthetic draft fixtures plus decoded readonly catalog; not another full purchase run", results }, null, 2));
  console.log(JSON.stringify({ status: "passed", engines: 2, readyDraftScreenshots: 2, decodedCatalogScreenshots: 2 }));
}
void main().catch(error => { console.error(JSON.stringify({ status: "failed", errorType: error instanceof Error ? error.name : "Unknown" })); process.exitCode = 1; });
