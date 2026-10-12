import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { CatalogPageDto, OrderDto, PageDto } from "../../src/contracts/commerce";
import { normalizeSearch } from "../../src/lib/persian";
import { createAdmin, disableUsers, isolatedPool, loginAdmin, loginCustomer, verifyAdminTotp } from "./acceptance-fixtures";

test("T01/T20/T21: HTTP paging exceeds legacy limits, selected-volume price agrees with guide, CSV and staging SEO", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), marker = `qa-paging-${randomUUID()}`, orderMarker = `QA-READ-${randomUUID()}`;
  const admin = await createAdmin(pool), ids: string[] = [], variantIds: string[] = [], orderIds: string[] = [];
  const users: string[] = [admin.userId];
  const family = `${marker}-matching`, note = `${marker}-note`;
  const customer = await browser.newContext({ baseURL });
  const visitor = await browser.newContext({ baseURL, viewport: { width: 320, height: 740 }, reducedMotion: "reduce" });
  try {
    const adminUri = await loginAdmin(page, admin);
    const fixture = Array.from({ length: 305 }, (_, index) => {
      const id = randomUUID(), first = randomUUID(), second = index < 3 ? randomUUID() : null;
      ids.push(id); variantIds.push(first); if (second) variantIds.push(second);
      return { id, first, second, name: `${index === 304 ? "=" : ""}${marker} ${String(index).padStart(3, "0")}`, slug: `${marker}-${index}`, family: index < 3 ? family : `${marker}-catalog-${index % 101}`, note: index < 3 ? note : `${marker}-other`, index };
    });
    // Read-only paging fixtures are inserted in bulk; the write path is separately covered by T25.
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO product(id,name,slug,description,concentration,family,top_notes,heart_notes,base_notes,image_url,status,search_key) SELECT x.id::uuid,x.name,x.slug,'Synthetic QA paging fixture','QA',x.family,jsonb_build_array(x.note),'[]'::jsonb,'[]'::jsonb,'/assets/sample-perfume.svg','published',x.search FROM jsonb_to_recordset($1::jsonb) AS x(id text,name text,slug text,family text,note text,search text)", [JSON.stringify(fixture.map(value => ({ ...value, search: normalizeSearch(value.name) }))) ]);
      const variants = fixture.flatMap(value => [{ id: value.first, product: value.id, sku: `${marker}-${value.index}-50`, volume: 50, price: [200000, 500000, 300000][value.index] ?? 1000000, stock: value.index === 0 ? 0 : 5 }, ...(value.second ? [{ id: value.second, product: value.id, sku: `${marker}-${value.index}-100`, volume: 100, price: value.index === 2 ? 900000 : 100000, stock: 5 }] : [])]);
      await db.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) SELECT x.id::uuid,x.product::uuid,x.sku,x.volume,x.price FROM jsonb_to_recordset($1::jsonb) AS x(id text,product text,sku text,volume integer,price bigint)", [JSON.stringify(variants)]);
      await db.query("INSERT INTO inventory_balance(variant_id,on_hand,reserved) SELECT x.id::uuid,x.stock,0 FROM jsonb_to_recordset($1::jsonb) AS x(id text,stock integer)", [JSON.stringify(variants)]);
      await db.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason) SELECT gen_random_uuid(),x.id::uuid,'qa-read:'||x.id,x.stock,0,'Synthetic QA paging fixture' FROM jsonb_to_recordset($1::jsonb) AS x(id text,stock integer)", [JSON.stringify(variants)]);
      await db.query("INSERT INTO product_image(product_id,position,url,alt) SELECT id,0,'/assets/sample-perfume.svg','Synthetic QA paging image' FROM product WHERE id=ANY($1::uuid[])", [ids]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const seen: string[] = [];
    for (let index = 1; index <= 4; index++) {
      const response = await visitor.request.get(`/api/catalog/page?search=${marker}&pageSize=100&page=${index}`);
      expect(response.status()).toBe(200);
      const data = (await response.json()).data as CatalogPageDto;
      expect(data).toMatchObject({ page: index, pageSize: 100, totalItems: 305, totalPages: 4 });
      expect(data.items).toHaveLength(index === 4 ? 5 : 100);
      seen.push(...data.items.map(product => product.id));
    }
    expect(new Set(seen).size).toBe(305);
    expect([...new Set(seen)].sort()).toEqual([...ids].sort());
    expect((await visitor.request.get("/api/catalog/page?pageSize=101")).status()).toBe(400);
    const adminPage = await page.request.get(`/api/admin/products/page?search=${marker}&page=4&pageSize=100`);
    expect(adminPage.status()).toBe(200);
    expect((await adminPage.json()).data).toMatchObject({ totalItems: 305, totalPages: 4 });
    const filtered = await visitor.request.get(`/api/catalog/page?search=${marker}&family=${family}&note=${note}&volumeMl=50&available=true&sort=price_asc`);
    const match = (await filtered.json()).data as CatalogPageDto;
    expect(match.totalItems).toBe(2);
    expect(match.items.map(product => product.id)).toEqual([fixture[2]!.id, fixture[1]!.id]);
    expect(match.facetLimit).toBe(100);
    expect(match.facetsTruncated).toBe(true);
    expect(match.facets.families).toHaveLength(100);
    expect(match.facets.notes).toContain(note);
    expect(match.facets.volumesMl).toEqual(expect.arrayContaining([50, 100]));
    const baseFilter = `/api/catalog/page?search=${marker}&family=${family}&note=${note}&volumeMl=50&available=true`;
    const boundary = await visitor.request.get(`${baseFilter}&minPriceToman=30000&maxPriceToman=50000&sort=price_asc`);
    expect(boundary.status()).toBe(200);
    expect((await boundary.json()).data.items.map((item: { id: string }) => item.id)).toEqual([fixture[2]!.id, fixture[1]!.id]);
    const unavailableRange = await visitor.request.get(`${baseFilter}&minPriceToman=10000&maxPriceToman=25000`);
    expect(unavailableRange.status()).toBe(200);
    expect((await unavailableRange.json()).data.totalItems).toBe(0); // cheap 50ml is unavailable; stocked100ml cannot satisfy it
    expect((await visitor.request.get(`${baseFilter}&minPriceToman=60000&maxPriceToman=10000`)).status()).toBe(400);

    await page.goto(`/products?search=${marker}&page=۴&pageSize=۱۰۰`);
    await expect(page.locator(".product-tile")).toHaveCount(5);
    await expect(page.getByRole("navigation", { name: "صفحه‌های نتایج", exact: true })).toContainText("۳۰۵");
    await page.goto(`/products?search=${marker}&family=${family}&note=${note}&volume=50&stock=1&sort=price_asc`);
    await expect(page.locator(".product-tile")).toHaveCount(2);
    await expect(page.locator(".product-tile .price").nth(0)).toHaveText("۳۰٬۰۰۰ تومان");
    await expect(page.locator(".product-tile .price").nth(1)).toHaveText("۵۰٬۰۰۰ تومان");
    await expect(page.locator(".product-tile").nth(0)).toContainText("۵۰ میلی‌لیتر");
    await page.getByRole("combobox", { name: "مرتب‌سازی", exact: true }).selectOption("price_desc");
    await expect(page.locator(".product-tile .price").nth(0)).toHaveText("۵۰٬۰۰۰ تومان");
    await expect(page.locator(".product-tile .price").nth(1)).toHaveText("۳۰٬۰۰۰ تومان");
    await page.getByLabel("حداقل قیمت (تومان)", { exact: true }).fill("۳۰٬۰۰۰");
    await page.getByLabel("حداکثر قیمت (تومان)", { exact: true }).fill("۳۰٬۰۰۰");
    await page.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    await expect(page.locator(".product-tile")).toHaveCount(1);
    await expect(page.locator(".product-tile .price")).toHaveText("۳۰٬۰۰۰ تومان");
    const guide = await visitor.newPage();
    await guide.goto(`/guide?family=${family}&note=${note}&volume=50&sort=price_asc`);
    await expect(guide.locator(".product-tile")).toHaveCount(2);
    await expect(guide.locator(".product-tile .price").nth(0)).toHaveText("۳۰٬۰۰۰ تومان");
    await expect(guide.locator(".product-tile .price").nth(1)).toHaveText("۵۰٬۰۰۰ تومان");
    await expect(guide.locator(".helper").filter({ hasText: "همهٔ گزینه‌های فیلتر نمایش داده نمی‌شوند." })).toBeVisible();
    await expect.poll(() => guide.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page: guide }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await guide.close();

    await pool.query("UPDATE admin_grant SET factor_verified_at=now()-interval '6 minutes' WHERE session_id IN(SELECT id FROM session WHERE user_id=$1)", [admin.userId]);
    expect((await page.request.get("/api/admin/export?kind=products")).status()).toBe(403);
    await page.goto(`/admin/products?search=${marker}`);
    await verifyAdminTotp(page, adminUri); // native renewal; only observed429 permits a bounded retry
    await expect(page.locator(".reauth-panel [role=status]")).toContainText("کد تأیید شد.");
    const csv = await page.request.get("/api/admin/export?kind=products");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["cache-control"]).toContain("no-store");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const rows = (await csv.text()).split("\r\n");
    const escaped = rows.find(row => row.includes(`${marker}-304-50`));
    expect(escaped?.startsWith(`"'=${marker}`)).toBe(true);
    expect(rows.filter(row => row.includes(marker))).toHaveLength(308);
    const sitemap = await visitor.request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect((await sitemap.text()).includes(marker)).toBe(false);
    const robots = await visitor.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Disallow: /");

    const buyer = await loginCustomer(customer, baseURL!); users.push(buyer.userId);
    const address = { recipient: "QA read fixture", phone: buyer.phone, province: "تهران", city: "تهران", address: "نشانی مصنوعی و غیرقابل ارسال QA", plaque: "1", postalCode: "1234567890" };
    const orders = Array.from({ length: 125 }, (_, index) => { const id = randomUUID(); orderIds.push(id); return { id, number: `${orderMarker}-${String(index).padStart(3, "0")}` }; });
    await pool.query("INSERT INTO orders(id,order_number,user_id,subtotal_irr,discount_irr,shipping_irr,tax_irr,total_irr,address_snapshot,policy_version,shipping_method_id) SELECT x.id::uuid,x.number,$2,10000,0,0,0,10000,$3::jsonb,'QA synthetic read fixture','standard' FROM jsonb_to_recordset($1::jsonb) AS x(id text,number text)", [JSON.stringify(orders), buyer.userId, JSON.stringify(address)]);
    for (const context of [customer, page.context()]) {
      const route = context === customer ? "/api/orders/page" : "/api/admin/orders/page";
      const response = await context.request.get(`${route}?search=${orderMarker}&pageSize=100&page=2`);
      expect(response.status()).toBe(200);
      const data = (await response.json()).data as PageDto<OrderDto>;
      expect(data).toMatchObject({ totalItems: 125, totalPages: 2, page: 2 });
      expect(data.items).toHaveLength(25);
      expect(data.items.every(order => orderIds.includes(order.id))).toBe(true);
    }
    await page.goto(`/admin/orders?search=${orderMarker}&pageSize=100&page=2`);
    await expect(page.getByRole("table", { name: "سفارش‌ها", exact: true }).locator("tbody tr")).toHaveCount(25);
    await expect(page.getByRole("navigation", { name: "صفحه‌های سفارش‌ها", exact: true })).toContainText("۱۲۵");
    const orderCsv = await page.request.get("/api/admin/export?kind=orders");
    expect(orderCsv.status()).toBe(200);
    expect((await orderCsv.text()).split("\r\n").filter(row => row.includes(orderMarker))).toHaveLength(125);
    const ownedOrders = await customer.newPage();
    await ownedOrders.goto(`/account?search=${orderMarker}&pageSize=100&page=2`);
    await expect(ownedOrders.getByRole("table", { name: "سفارش‌ها", exact: true }).locator("tbody tr")).toHaveCount(25);
    await expect(ownedOrders.getByRole("navigation", { name: "صفحه‌های سفارش‌ها", exact: true })).toContainText("۱۲۵");
    await ownedOrders.close();
  } finally {
    // These empty read fixtures never had a payment/reservation; real checkout history is retained elsewhere.
    if (orderIds.length) await pool.query("DELETE FROM orders WHERE id=ANY($1::uuid[])", [orderIds]);
    if (ids.length) await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])", [ids]);
    await disableUsers(pool, users);
    await customer.close(); await visitor.close(); await pool.end();
  }
});
