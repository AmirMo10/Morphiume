import { createHash, createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIResponse, type Response } from "@playwright/test";
import type pg from "pg";
import sharp from "sharp";
import type { ProductDto, ProductInput } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin } from "./acceptance-fixtures";
import { archiveFixtureProducts } from "./next-acceptance-fixtures";
import { openAdminProductForm } from "./admin-readiness";
import { readSuccessObject, recordSafeHttpResponse } from "./safe-response";
import type { HttpResponseStage } from "./http-response-evidence.mjs";

const requiredCsv = ["name", "slug", "description", "concentration", "family", "imageUrl", "sku", "volumeMl", "priceToman", "initialStock", "topNotes", "heartNotes", "baseNotes"];
const supplementalCsv = ["shortDescription", "careInstructions", "approvedWarnings"];
const supplied = {
  shortDescription: "QA معرفی مصنوعی <strong>متن ساده</strong>",
  careInstructions: "QA نگهداری مصنوعی <img src=x onerror=alert(1)>",
  approvedWarnings: "QA هشدار مصنوعی <script>window.__qaContentExecuted=true</script>",
};
function oldInput(product: ProductDto): ProductInput {
  // Deliberately omit the three new keys: the compatibility assertion must
  // exercise absence, rather than resubmit the existing supplemental values.
  return { name: product.name, slug: product.slug, description: product.description, concentration: product.concentration, family: product.family, topNotes: product.topNotes, heartNotes: product.heartNotes, baseNotes: product.baseNotes, images: product.images, variants: product.variants.map(variant => ({ sku: variant.sku, volumeMl: variant.volumeMl, priceToman: (BigInt(variant.price.amountIrr) / 10n).toString() })) };
}
async function productResponse(response: APIResponse | Response, stage: HttpResponseStage, status = 200) {
  const value = await readSuccessObject(response, stage, status);
  expect(typeof value.id === "string" && /^[0-9a-f-]{36}$/u.test(value.id), "A persisted product UUID must be returned").toBe(true);
  return value as ProductDto;
}
async function fixtureState(pool: pg.Pool, id: string) {
  const statements = {
    product: "SELECT * FROM product WHERE id=$1",
    images: "SELECT * FROM product_image WHERE product_id=$1 ORDER BY position",
    variants: "SELECT * FROM variant WHERE product_id=$1 ORDER BY id",
    balances: "SELECT b.* FROM inventory_balance b JOIN variant v ON v.id=b.variant_id WHERE v.product_id=$1 ORDER BY b.variant_id",
    ledger: "SELECT l.* FROM inventory_ledger l JOIN variant v ON v.id=l.variant_id WHERE v.product_id=$1 ORDER BY l.id",
    claims: "SELECT * FROM product_slug_claim WHERE product_id=$1 ORDER BY slug",
    audits: "SELECT * FROM audit_event WHERE entity_type='product' AND entity_id=$1 ORDER BY id",
  };
  const result: Record<string, string> = {};
  for (const [name, sql] of Object.entries(statements)) result[name] = createHash("sha256").update(JSON.stringify((await pool.query(sql, [id])).rows)).digest("hex");
  return result;
}
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

test("T01/T05/T20: native product copy creates, previews, publishes, preserves absent fields and imports optional CSV", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), marker = randomUUID(), admin = await createAdmin(pool);
  const products: string[] = [], slug = `qa-copy-${marker}`, importedSlug = `qa-copy-import-${marker}`;
  const visitor = await browser.newContext({ baseURL, viewport: { width: 320, height: 740 } }), publicPage = await visitor.newPage();
  const name = `متن محصول مصنوعی QA ${marker.slice(0, 8)}`, description = "QA توضیح کامل قدیمی؛ دادهٔ مصنوعی است و برای فروش واقعی نیست.";
  try {
    await loginAdmin(page, admin); await openAdminProductForm(page);
    await page.getByRole("textbox", { name: "نام محصول", exact: true }).fill(name);
    await page.getByRole("textbox", { name: "نامک صفحه", exact: true }).fill(slug);
    await page.getByRole("textbox", { name: "توضیح محصول", exact: true }).fill(description);
    await page.getByRole("textbox", { name: "غلظت عطر", exact: true }).fill("آزمایشی");
    await page.getByRole("textbox", { name: "خانوادهٔ رایحه", exact: true }).fill("QA");
    await page.getByLabel("شناسهٔ تنوع (SKU)", { exact: true }).fill(`QA-COPY-${marker}`);
    await page.getByLabel("حجم (میلی‌لیتر)", { exact: true }).fill("۵۰");
    await page.getByLabel("قیمت (تومان)", { exact: true }).fill("۱۲۳۴۵۶");
    await page.getByLabel("موجودی اولیه (عدد)", { exact: true }).fill("۲");
    const png = await sharp({ create: { width: 16, height: 20, channels: 3, background: "#3355B1" } }).png().toBuffer();
    await page.getByLabel("بارگذاری تصویر واقعی محصول", { exact: true }).setInputFiles({ name: "qa-copy-synthetic.png", mimeType: "image/png", buffer: png });
    await expect(page.locator(".gallery-editor-list > li")).toHaveCount(1);
    await page.getByRole("textbox", { name: "توضیح تصویر ۱", exact: true }).fill("رنگ آبی مصنوعی QA؛ عکس محصول واقعی نیست.");
    const creating = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/products" && response.request().method() === "POST");
    await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
    let product = await productResponse(await creating, "product-create", 201); products.push(product.id);
    expect(product).toMatchObject({ status: "draft", shortDescription: "", careInstructions: "", approvedWarnings: "" });
    await expect(page).toHaveURL(new RegExp(`/admin/products/${product.id}$`));
    await expect(page.getByRole("textbox", { name: "نام محصول", exact: true })).toHaveValue(name);
    await page.getByRole("button", { name: "پیش‌نمایش", exact: true }).click();
    await expect(page.locator(".private-preview .product-intro")).toHaveText(description);
    expect((await visitor.request.get(`/api/products/${product.id}`)).status()).toBe(404);

    for (const [key, label] of [["shortDescription", "توضیح کوتاه"], ["careInstructions", "راهنمای نگهداری"], ["approvedWarnings", "نکات و هشدارهای محصول"]] as const) {
      await page.getByRole("textbox", { name: label, exact: true }).fill(supplied[key]);
      await expect(page.getByRole("textbox", { name: label, exact: true })).toHaveAttribute("dir", "auto");
    }
    await expect(page.locator(".private-preview .product-intro")).toHaveText(supplied.shortDescription);
    await expect(page.locator(".private-preview").getByRole("region", { name: "راهنمای نگهداری", exact: true })).toContainText(supplied.careInstructions);
    await expect(page.locator(".private-preview").getByRole("region", { name: "نکات و هشدارهای محصول", exact: true })).toContainText(supplied.approvedWarnings);
    expect(await page.locator(".private-preview img[src=x]").count()).toBe(0);
    const updating = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/products/${product.id}` && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
    product = await productResponse(await updating, "product-update"); expect(product).toMatchObject(supplied);
    await expect(page.getByText("تغییرات محصول ذخیره شد.", { exact: true })).toBeVisible();
    const publishing = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/products/${product.id}/publish` && response.request().method() === "POST");
    await page.getByRole("button", { name: "انتشار محصول", exact: true }).click();
    product = await productResponse(await publishing, "product-publish"); expect(product.status).toBe("published");
    const document = await visitor.request.get(`/products/${product.id}`); expect(document.status()).toBe(200);
    const html = await document.text();
    expect(html.includes("&lt;strong&gt;متن ساده&lt;/strong&gt;"), "Actual SSR escapes the supplied short copy").toBe(true);
    expect(html.includes("&lt;img src=x onerror=alert(1)&gt;"), "Actual SSR escapes supplied care copy").toBe(true);
    expect(html.includes("&lt;script&gt;window.__qaContentExecuted=true&lt;/script&gt;"), "Actual SSR escapes supplied warning copy").toBe(true);
    expect(html.includes("<script>window.__qaContentExecuted=true</script>"), "Supplied plain text must not become an executable tag").toBe(false);
    expect((await publicPage.goto(`/products/${product.id}`))?.status()).toBe(200);
    await expect(publicPage.locator(".product-intro")).toHaveText(supplied.shortDescription);
    await expect(publicPage.getByRole("region", { name: "توضیح محصول", exact: true })).toContainText(description);
    await expect(publicPage.getByRole("region", { name: "راهنمای نگهداری", exact: true })).toContainText(supplied.careInstructions);
    await expect(publicPage.getByRole("region", { name: "نکات و هشدارهای محصول", exact: true })).toContainText(supplied.approvedWarnings);
    expect(await publicPage.locator(".product-intro strong, img[src=x]").count()).toBe(0);
    expect(await publicPage.evaluate(() => "__qaContentExecuted" in window)).toBe(false);

    const priorVersion = product.version;
    product = await productResponse(await page.request.patch(`/api/admin/products/${product.id}`, { headers: { Origin: baseURL! }, data: { ...oldInput(product), name: `${name} ویرایش قدیمی`, expectedVersion: product.version } }), "product-update");
    expect(product).toMatchObject(supplied); expect(product.version).toBe(priorVersion + 1);
    const beforeConflict = await fixtureState(pool, product.id);
    const conflict = await page.request.patch(`/api/admin/products/${product.id}`, { headers: { Origin: baseURL! }, data: { ...oldInput(product), shortDescription: "QA forbidden stale copy", expectedVersion: priorVersion } });
    expect(recordSafeHttpResponse(conflict, "product-update").status).toBe(409);
    expect(await fixtureState(pool, product.id)).toEqual(beforeConflict);

    // Inspect the real blank template, then exercise the actual browser parser
    // and native admin create-only import with supplemental English columns.
    await page.goto("/admin/import");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "دریافت الگوی خالی CSV", exact: true }).click();
    const download = await downloading, stream = await download.createReadStream();
    expect(stream !== null, "The actual CSV template download exists").toBe(true);
    const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const header = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/u, "").trim().split(",");
    expect(header).toEqual([...requiredCsv, ...supplementalCsv]);
    const importName = `محصول CSV مصنوعی QA ${marker.slice(0, 8)}`;
    const row = [importName, importedSlug, description, "آزمایشی", "QA", product.imageUrl!, `QA-COPY-IMPORT-${marker}`, "50", "1000", "0", "", "", "", supplied.shortDescription, supplied.careInstructions, supplied.approvedWarnings];
    const csv = header.join(",") + "\r\n" + row.map(csvCell).join(",") + "\r\n";
    const uploadCsv = () => page.getByLabel("فایل CSV محصولات", { exact: true }).setInputFiles({ name: "qa-copy-import.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await uploadCsv();
    await page.getByText(`متن‌های محصول ${importName}`, { exact: true }).click();
    await expect(page.locator("details[open]").getByRole("region", { name: "نکات و هشدارهای محصول", exact: true })).toContainText(supplied.approvedWarnings);
    const dryRun = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/import" && response.request().method() === "POST");
    await page.getByRole("button", { name: "بررسی آزمایشی فایل", exact: true }).click();
    expect(await readSuccessObject(await dryRun, "product-import")).toMatchObject({ dryRun: true, issues: [], imported: 0 });
    await expect(page.getByText("بررسی آزمایشی انجام شد. خطایی گزارش نشده است.", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "پیش‌نمایش را بررسی کرده‌ام و ۱ محصول به صورت پیش‌نویس ثبت شود.", exact: true }).check();
    const importing = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/import" && response.request().method() === "POST");
    await page.getByRole("button", { name: "ثبت همهٔ پیش‌نویس‌ها", exact: true }).click();
    expect(await readSuccessObject(await importing, "product-import")).toMatchObject({ dryRun: false, issues: [], imported: 1 });
    const importedId = (await pool.query<{ id: string }>("SELECT id FROM product WHERE slug=$1", [importedSlug])).rows[0]?.id;
    expect(typeof importedId === "string", "One owned CSV product was actually persisted").toBe(true); products.push(importedId!);
    const imported = await productResponse(await page.request.get(`/api/admin/products/${importedId}`), "product-read");
    expect(imported).toMatchObject({ ...supplied, status: "draft", version: 1 });
    expect((await visitor.request.get(`/api/products/${importedId}`)).status()).toBe(404);
    const beforeDuplicate = await fixtureState(pool, importedId!);
    await uploadCsv();
    const duplicate = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/import" && response.request().method() === "POST");
    await page.getByRole("button", { name: "بررسی آزمایشی فایل", exact: true }).click();
    const duplicateResult = await readSuccessObject(await duplicate, "product-import");
    expect(duplicateResult.imported).toBe(0); expect(Array.isArray(duplicateResult.issues) && duplicateResult.issues.length > 0).toBe(true);
    expect(await fixtureState(pool, importedId!)).toEqual(beforeDuplicate);
    expect((await pool.query("SELECT count(*)::int AS n FROM product WHERE slug=$1", [importedSlug])).rows[0].n).toBe(1);

    const exported = await page.request.get("/api/admin/export?kind=products");
    expect(recordSafeHttpResponse(exported, "product-export").status).toBe(200); expect(exported.headers()["cache-control"]).toContain("no-store");
    const exportedText = await exported.text(), exportedHeader = exportedText.replace(/^\uFEFF/u, "").split("\r\n")[0]!;
    expect(exportedHeader.split(",").map(cell => cell.slice(1, -1))).toEqual(["نام", "نامک", "شناسهٔ تنوع", "حجم میلی‌لیتر", "قیمت تومان", "موجودی قابل فروش", "وضعیت", "توضیح کوتاه", "روش نگه‌داری", "هشدارهای فروشنده"]);
    for (const text of Object.values(supplied)) expect(exportedText.includes(csvCell(text)), "Owned supplied metadata survives CSV escaping").toBe(true);
    await page.getByLabel("فایل CSV محصولات", { exact: true }).setInputFiles({ name: "qa-summary-not-import-template.csv", mimeType: "text/csv", buffer: Buffer.from(exportedHeader + "\r\n", "utf8") });
    await expect(page.getByText("ستون‌های فایل با الگوی ورود محصولات یکسان نیستند. فایل خلاصهٔ خروجی فروشگاه، الگوی ورود نیست.", { exact: true })).toBeVisible();

    product = await productResponse(await page.request.patch(`/api/admin/products/${product.id}`, { headers: { Origin: baseURL! }, data: { ...oldInput(product), shortDescription: "", careInstructions: "", approvedWarnings: "", expectedVersion: product.version } }), "product-update");
    expect(product).toMatchObject({ shortDescription: "", careInstructions: "", approvedWarnings: "" });
    await publicPage.reload();
    await expect(publicPage.locator(".product-intro")).toHaveText(description);
    await expect(publicPage.getByRole("heading", { name: "توضیح محصول", exact: true })).toHaveCount(0);
    await expect(publicPage.getByRole("heading", { name: "راهنمای نگهداری", exact: true })).toHaveCount(0);
    await expect(publicPage.getByRole("heading", { name: "نکات و هشدارهای محصول", exact: true })).toHaveCount(0);
    expect(await publicPage.locator(".plain-copy").filter({ hasText: description }).count()).toBe(1);
  } finally {
    const owned = (await pool.query<{ id: string }>("SELECT id FROM product WHERE slug=ANY($1::text[])", [[slug, importedSlug]])).rows.map(row => row.id);
    await archiveFixtureProducts(pool, [...new Set([...products, ...owned])]); await disableUsers(pool, [admin.userId]); await visitor.close(); await pool.end();
  }
});

test("T12/T19:205 native authenticated internal session reads preserve quota; actual HTTP get-session remains charged", async ({ page }) => {
  const pool = isolatedPool(), admin = await createAdmin(pool);
  type Counter = { count: number; last_request: string };
  try {
    await loginAdmin(page, admin);
    const secret = process.env.AUTH_SECRET;
    expect(typeof secret === "string" && secret.length > 0, "Controlled auth configuration exists privately").toBe(true);
    const key = `app:${createHmac("sha256", secret!).update("admin-auth:global").digest("hex")}`;
    const readCounter = async () => (await pool.query<Counter>("SELECT count,last_request::text FROM auth_rate_limit WHERE key=$1", [key])).rows[0];
    const api = page.context().request;
    // Stop background page activity without changing any real native cookies.
    await page.close();
    const before = await readCounter(); expect(!!before, "Native login created a global auth counter").toBe(true);
    for (let index = 0; index < 205; index++) {
      const response = await api.get("/api/admin/session");
      if (index === 0 || index === 204 || response.status() !== 200) recordSafeHttpResponse(response, "admin-session-read");
      expect(response.status(), "Every authenticated internal session read succeeds").toBe(200);
      const data = (await response.json()).data;
      expect(data?.mfaVerified === true && data?.roles?.includes("owner"), "Each read retains the actual native MFA/owner proof").toBe(true);
    }
    expect(await readCounter(), "Internal reads do not change global count or last-request window").toEqual(before);
    let beforeHttp = await readCounter(); expect(!!beforeHttp).toBe(true);
    // Do not intentionally fill an already nearly exhausted application bucket.
    if (beforeHttp!.count >= 199 && Number(beforeHttp!.last_request) + 60000 > Date.now()) {
      await new Promise(resolve => setTimeout(resolve, Number(beforeHttp!.last_request) + 60000 - Date.now() + 250));
      beforeHttp = await readCounter();
    }
    const response = await api.get("/api/admin/auth/get-session");
    expect(recordSafeHttpResponse(response, "admin-http-session-read").status).toBe(200);
    expect((await response.json()).user?.id === admin.userId, "Actual HTTP endpoint returns the enrolled fixture account").toBe(true);
    const afterHttp = await readCounter(); expect(!!afterHttp).toBe(true);
    if (afterHttp!.last_request === beforeHttp!.last_request) expect(afterHttp!.count).toBe(beforeHttp!.count + 1);
    else { expect(Number(afterHttp!.last_request) > Number(beforeHttp!.last_request)).toBe(true); expect(Number(afterHttp!.last_request) % 60000).toBe(0); expect(afterHttp!.count).toBe(1); }
  } finally { await disableUsers(pool, [admin.userId]); await pool.end(); }
});

test("T19/T20:native role revocation during a product row-lock wait returns403 without product effects", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), subject = await createAdmin(pool), owner = await createAdmin(pool), marker = randomUUID();
  const ownerContext = await browser.newContext({ baseURL }), ownerPage = await ownerContext.newPage();
  let productId: string | undefined, blocker: pg.PoolClient | undefined;
  let pending: Promise<{ response?: APIResponse; transportFailed: boolean }> | undefined;
  try {
    await loginAdmin(page, subject); await loginAdmin(ownerPage, owner);
    const product = await createProduct(page, baseURL!, `copy-proof-${marker}`); productId = product.id;
    const before = await fixtureState(pool, product.id);
    blocker = await pool.connect(); await blocker.query("BEGIN"); await blocker.query("SELECT id FROM product WHERE id=$1 FOR UPDATE", [product.id]);
    const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    pending = page.request.patch(`/api/admin/products/${product.id}`, { headers: { Origin: baseURL! }, data: { ...oldInput(product), careInstructions: "QA denied copy after live-role revocation", expectedVersion: product.version } }).then(response => ({ response, transportFailed: false }), () => ({ transportFailed: true }));
    await expect.poll(async () => (await pool.query<{ waiting: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.application_name='morphiume-app' AND a.wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(a.pid))) AS waiting", [blockerPid])).rows[0]!.waiting, { message: "Actual native product HTTP mutation waits on the owned product row", timeout: 5000 }).toBe(true);
    const revoked = await ownerContext.request.post("/api/admin/roles", { headers: { Origin: baseURL! }, data: { userId: subject.userId, roles: ["support"], disabled: false, reason: "QA explicit native catalog-role revocation during controlled product wait" } });
    expect(recordSafeHttpResponse(revoked, "role-revoke").status).toBe(200);
    await blocker.query("COMMIT"); blocker.release(); blocker = undefined;
    const result = await pending;
    expect(result.transportFailed, "Mutation completed with a real HTTP response").toBe(false); expect(!!result.response).toBe(true);
    expect(recordSafeHttpResponse(result.response!, "product-lock-revocation").status).toBe(403);
    const after = await fixtureState(pool, product.id);
    for (const key of Object.keys(before)) expect(after[key] === before[key], `No ${key} effects follow revoked current permission`).toBe(true);
    expect((await pool.query("SELECT role FROM role_membership WHERE user_id=$1", [subject.userId])).rows).toEqual([{ role: "support" }]);
  } finally {
    if (blocker) { await blocker.query("ROLLBACK"); blocker.release(); }
    if (pending) await pending;
    if (productId) await archiveFixtureProducts(pool, [productId]);
    await disableUsers(pool, [subject.userId, owner.userId]); await ownerContext.close(); await pool.end();
  }
});
