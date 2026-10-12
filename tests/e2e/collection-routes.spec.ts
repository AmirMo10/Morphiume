import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createAdmin, disableUsers, isolatedPool, loginAdmin } from "./acceptance-fixtures";
import { archiveFixtureProducts } from "./next-acceptance-fixtures";
import type { AdminCollectionDetailDto, CollectionDetailPageDto, CollectionInput } from "../../src/contracts/commerce";
import { recordSafeHttpResponse } from "./safe-response";

test("T05/T09/T20: collection SSR without JavaScript preserves paging/filter identity and real308/404", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), marker = randomUUID(), products: string[] = [], collections: string[] = [], users: string[] = [];
  const noJs = await browser.newContext({ baseURL, userAgent: await page.evaluate(() => navigator.userAgent), javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  try {
    const admin = await createAdmin(pool); users.push(admin.userId); await loginAdmin(page, admin);
    // Only clearly synthetic read fixtures use SQL; collection edits use real
    // native-admin HTTP and public SSR executes the actual DB-backed service.
    for (let index = 0; index < 27; index++) {
      const id = randomUUID(); products.push(id);
      const name = `QA collection ${marker} ${String(index).padStart(2, "0")}`;
      await pool.query("INSERT INTO product(id,name,slug,description,concentration,family,status,search_key,top_notes) VALUES($1,$2,$3,'دادهٔ مصنوعی QA؛ فروش واقعی نیست.','آزمایشی','QA','published',$2,$4::jsonb)", [id, name, `qa-collection-product-${marker}-${index}`, JSON.stringify(["اسطوخودوس"])]);
      for (const volume of index < 3 ? [50, 100] : [50]) {
        const variant = randomUUID(), price = index === 0 && volume === 50 || index === 1 && volume === 100 ? "10000" : index === 2 && volume === 100 ? "200000" : "100000";
        const stock = index === 0 && volume === 50 || index === 1 && volume === 100 ? 0 : 4;
        await pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,$4,$5)", [variant, id, `QA-COL-${marker}-${index}-${volume}`, volume, price]);
        await pool.query("INSERT INTO inventory_balance(variant_id,on_hand,reserved) VALUES($1,$2,0)", [variant, stock]);
      }
    }
    const input: CollectionInput = { name: `مجموعهٔ مصنوعی QA ${marker}`, slug: `qa-collection-${marker}`, description: "مجموعهٔ مصنوعی برای آزمون مستقل؛ بدون عرضهٔ واقعی.", published: true, productIds: products.slice(0, 26) };
    const save = async (value: CollectionInput) => {
      const response = await page.request.post("/api/admin/collections", { headers: { Origin: baseURL! }, data: value });
      recordSafeHttpResponse(response, "collection-save");
      return response;
    };
    const created = await save(input); expect(created.status()).toBe(200);
    const row = (await created.json()).data as { id: string; version: number }; collections.push(row.id);
    await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])", [[products[25], products[26]]]);
    const retained = await save({ ...input, id: row.id, expectedVersion: row.version, description: "عضو پنهان قدیمی حفظ می‌شود." });
    expect(retained.status()).toBe(200);
    const current = (await retained.json()).data as { id: string; version: number };
    const forbiddenNewHidden = await save({ ...input, id: row.id, expectedVersion: current.version, productIds: products });
    expect(forbiddenNewHidden.status()).toBe(400);
    const stale = await save({ ...input, id: row.id, expectedVersion: row.version }); expect(stale.status()).toBe(409);
    const detail = (await (await page.request.get(`/api/admin/collections/${row.id}`)).json()).data as AdminCollectionDetailDto;
    expect(detail.productIds).toContain(products[25]); expect(detail.members.find(item => item.id === products[25])?.status).toBe("archived");
    // Check wire semantics before any later filter-widget assertion.
    const canonicalSlug = `${input.slug}-renamed`;
    const renamed = await save({ ...input, id: row.id, expectedVersion: current.version, slug: canonicalSlug }); expect(renamed.status()).toBe(200);
    const redirect = await noJs.request.get(`/collections/${input.slug}?page=2&pageSize=13`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location === `/collections/${canonicalSlug}?page=2&pageSize=13`, "Canonical alias preserves nondefault page parameters").toBe(true);
    const missing = await noJs.request.get(`/collections/qa-never-created-${marker}`, { maxRedirects: 0 }); expect(missing.status()).toBe(404);
    const publicDetail = async (query: string) => {
      const response = await noJs.request.get(`/api/collections/${input.slug}/page${query}`); expect(response.status()).toBe(200);
      return (await response.json()).data as CollectionDetailPageDto;
    };
    const first = await publicDetail("?pageSize=24"), second = await publicDetail("?pageSize=24&page=2");
    expect(first.products.totalItems).toBe(25); expect(first.products.items).toHaveLength(24); expect(second.products.items).toHaveLength(1);
    expect(new Set([...first.products.items, ...second.products.items].map(item => item.id)).size).toBe(25);
    expect(first.products.items.some(item => item.id === products[25])).toBe(false);
    const filtered = await publicDetail("?volumeMl=100&available=true&minPriceToman=9000&maxPriceToman=11000&note=" + encodeURIComponent("اسطوخودوس"));
    expect(filtered.products.items.map(item => item.id)).toEqual([products[0]]);
    const visitor = await noJs.newPage();
    const document = await visitor.goto(`/collections/${canonicalSlug}?pageSize=24`); expect(document?.status()).toBe(200);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(input.name);
    await expect(visitor).toHaveTitle(`${input.name} | Morphiume`);
    expect(await visitor.locator(".product-tile").count()).toBe(24);
    await visitor.getByRole("navigation", { name: "صفحه‌های محصولات مجموعه", exact: true }).getByRole("link", { name: "صفحهٔ بعد", exact: true }).click();
    expect(await visitor.locator(".product-tile").count()).toBe(1);
    await visitor.getByRole("combobox", { name: "حجم", exact: true }).selectOption("100");
    await visitor.getByLabel("فقط موجودها", { exact: true }).check();
    await visitor.getByLabel("حداقل قیمت (تومان)", { exact: true }).fill("۹۰۰۰");
    await visitor.getByLabel("حداکثر قیمت (تومان)", { exact: true }).fill("۱۱۰۰۰");
    await visitor.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    expect(await visitor.locator(".product-tile").count()).toBe(1);
    await expect(visitor.locator(".product-tile h3")).toHaveText(first.products.items.find(item => item.id === products[0])!.name);
    const draft = await save({ ...input, name: `پیش‌نویس ${marker}`, slug: `${input.slug}-private`, published: false, productIds: [products[25]!] }); expect(draft.status()).toBe(200);
    const draftId = (await draft.json()).data.id as string; collections.push(draftId);
    expect((await noJs.request.get(`/collections/${input.slug}-private`, { maxRedirects: 0 })).status()).toBe(404);
    const index = await noJs.request.get(`/api/collections/page?search=${encodeURIComponent(marker)}&pageSize=1`);
    expect(index.status()).toBe(200); expect((await index.json()).data.items.map((item: { id: string }) => item.id)).toEqual([row.id]);
    await page.goto(`/collections/${canonicalSlug}`); await page.setViewportSize({ width: 320, height: 740 });
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  } finally {
    if (collections.length) await pool.query("UPDATE collection SET published=false WHERE id=ANY($1::uuid[])", [collections]);
    await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await noJs.close(); await pool.end();
  }
});
