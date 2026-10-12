import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import sharp from "sharp";
import { loginAdmin } from "./acceptance-fixtures";

test("T01/T05/T17/T20: real gallery upload, reorder, SKU selection and archive retain pending edits", async ({ browser, page, baseURL }) => {
  const database = new URL(process.env.DATABASE_URL!);
  if (!["test", "staging"].includes(process.env.DEPLOYMENT_ENV ?? "") || !database.pathname.endsWith("morphiume_staging")) throw new Error("Gallery QA requires the isolated synthetic database");
  const pool = new pg.Pool({ connectionString: database.toString(), max: 2 });
  const fixture = randomUUID(), adminId = randomUUID(), email = `qa-gallery-${fixture}@fixture.invalid`;
  const password = `Qa-${randomUUID()}-Password!`, name = `گالری آزمایشی Morphiume ${fixture.slice(0, 8)}`;
  const description = "این داده فقط برای آزمون مستقل گالری است و محصول قابل فروش واقعی نیست.";
  const firstSku = `QA-GALLERY-${fixture}-50`, secondSku = `QA-GALLERY-${fixture}-100`;
  const visitor = await browser.newContext({ baseURL, viewport: { width: 320, height: 740 }, reducedMotion: "reduce" });
  const publicPage = await visitor.newPage();
  let productId: string | undefined;
  try {
    await pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,\'QA gallery admin\',$2,true)', [adminId, email]);
    await pool.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)", [randomUUID(), adminId, await hashPassword(password)]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')", [adminId]);
    await loginAdmin(page, { email, password });
    await page.goto("/admin/products/new");
    await page.getByLabel("نام محصول", { exact: true }).fill(name);
    await page.getByLabel("نامک صفحه", { exact: true }).fill(`qa-gallery-${fixture}`);
    await page.getByLabel("غلظت عطر", { exact: true }).fill("آزمایشی");
    await page.getByLabel("خانوادهٔ رایحه", { exact: true }).fill("آزمون QA");
    await page.getByLabel("توضیح محصول", { exact: true }).fill(description);
    await page.getByLabel("شناسهٔ تنوع (SKU)", { exact: true }).fill(firstSku);
    await page.getByLabel("حجم (میلی‌لیتر)", { exact: true }).fill("۵۰");
    await page.getByLabel("قیمت (تومان)", { exact: true }).fill("۱۲۳۴۵۶");
    await page.getByLabel("موجودی اولیه (عدد)", { exact: true }).fill("۳");
    await page.getByRole("button", { name: "افزودن حجم", exact: true }).click();
    await page.getByLabel("شناسهٔ تنوع (SKU)", { exact: true }).nth(1).fill(secondSku);
    await page.getByLabel("حجم (میلی‌لیتر)", { exact: true }).nth(1).fill("۱۰۰");
    await page.getByLabel("قیمت (تومان)", { exact: true }).nth(1).fill("۲۳۴۵۶۷");
    await page.getByLabel("موجودی اولیه (عدد)", { exact: true }).nth(1).fill("۳");
    const alt = ["تصویر عمومی قرمز آزمایشی QA", "تصویر آبی حجم پنجاه آزمایشی QA", "تصویر سبز قابل حذف آزمایشی QA"];
    for (const [index, background] of ["#B13333", "#3355B1", "#338855"].entries()) {
      const png = await sharp({ create: { width: 16, height: 20, channels: 3, background } }).png().toBuffer();
      await page.getByLabel("بارگذاری تصویر واقعی محصول", { exact: true }).setInputFiles({ name: `qa-gallery-${index}.png`, mimeType: "image/png", buffer: png });
      await expect(page.locator(".gallery-editor-list > li")).toHaveCount(index + 1);
      await page.locator(".gallery-editor-list > li").nth(index).getByRole("textbox").fill(alt[index]!);
    }
    await page.getByLabel("حجم مرتبط با تصویر ۲", { exact: true }).selectOption(firstSku);
    const firstUrl = await page.locator(".gallery-image-path bdi").nth(0).textContent();
    const secondUrl = await page.locator(".gallery-image-path bdi").nth(1).textContent();
    expect(firstUrl).toMatch(/^\/media\/[0-9a-f-]{36}\.webp$/);
    expect(secondUrl).toMatch(/^\/media\/[0-9a-f-]{36}\.webp$/);
    expect(firstUrl).not.toBe(secondUrl);
    await page.getByRole("button", { name: "تصویر ۲؛ انتقال به جایگاه قبل", exact: true }).click();
    await expect(page.getByLabel("توضیح تصویر ۱", { exact: true })).toHaveValue(alt[1]!);
    await expect(page.getByLabel("حجم مرتبط با تصویر ۱", { exact: true })).toHaveValue(firstSku);
    await page.getByRole("button", { name: "حذف تصویر ۳ از گالری", exact: true }).click();
    await expect(page.locator(".gallery-editor-list > li")).toHaveCount(2);
    await expect(page.getByLabel("نام محصول", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("توضیح محصول", { exact: true })).toHaveValue(description);
    await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
    productId = page.url().split("/").at(-1)!;
    const images = (await pool.query("SELECT pi.position,pi.url,pi.alt,v.sku AS variant_sku FROM product_image pi LEFT JOIN variant v ON v.id=pi.variant_id WHERE pi.product_id=$1 ORDER BY pi.position", [productId])).rows;
    expect(images).toEqual([
      { position: 0, url: secondUrl, alt: alt[1], variant_sku: firstSku },
      { position: 1, url: firstUrl, alt: alt[0], variant_sku: null },
    ]);
    await page.reload();
    await expect(page.getByLabel("نام محصول", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("توضیح محصول", { exact: true })).toHaveValue(description);
    await expect(page.getByLabel("توضیح تصویر ۱", { exact: true })).toHaveValue(alt[1]!);
    await page.getByRole("button", { name: "انتشار محصول", exact: true }).click();
    await expect(page.getByText("محصول منتشر شد.", { exact: true })).toBeVisible();
    await publicPage.goto(`/products/${productId}`);
    const gallery = publicPage.getByRole("group", { name: "تصاویر محصول", exact: true });
    await expect(gallery.locator(".gallery-thumbnail")).toHaveCount(2);
    await expect(gallery.getByRole("img", { name: alt[1], exact: true })).toHaveAttribute("src", secondUrl!);
    await expect(gallery.locator(".gallery-thumbnail").nth(0)).toHaveAttribute("aria-pressed", "true");
    await gallery.locator(".gallery-thumbnail").nth(1).click();
    await expect(gallery.locator(".gallery-thumbnail").nth(0)).toHaveAttribute("aria-pressed", "false");
    await expect(gallery.locator(".gallery-thumbnail").nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(gallery.getByRole("img", { name: alt[0], exact: true })).toHaveAttribute("src", firstUrl!);
    await publicPage.getByRole("radio", { name: /۱۰۰.*میلی‌لیتر/ }).check();
    await expect(gallery.locator(".gallery-thumbnail")).toHaveCount(0);
    await expect(gallery.getByRole("img", { name: alt[0], exact: true })).toHaveAttribute("src", firstUrl!);
    await expect(gallery.locator(`img[src="${secondUrl}"]`)).toHaveCount(0);
    await expect.poll(() => publicPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page: publicPage }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);

    // A failed save must keep pending edits. Archive changes status only, then the draft can be saved.
    const changedName = `${name} — ویرایش حفظ‌شده`, changedDescription = `${description} ویرایش حفظ‌شده پس از بایگانی.`;
    await page.getByLabel("نام محصول", { exact: true }).fill(changedName);
    await page.getByLabel("توضیح محصول", { exact: true }).fill(changedDescription);
    await page.getByRole("button", { name: "حذف تصویر ۱ از گالری", exact: true }).click();
    await page.getByRole("button", { name: "حذف تصویر ۱ از گالری", exact: true }).click();
    await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
    await expect(page.getByText("برای خالی‌کردن گالری، ابتدا محصول را بایگانی کنید.", { exact: true }).last()).toBeVisible();
    expect((await pool.query("SELECT status,name FROM product WHERE id=$1", [productId])).rows[0]).toEqual({ status: "published", name });
    expect((await pool.query("SELECT count(*)::int AS n FROM product_image WHERE product_id=$1", [productId])).rows[0].n).toBe(2);
    await page.getByRole("button", { name: "بایگانی محصول", exact: true }).click();
    await page.getByRole("button", { name: "تأیید بایگانی", exact: true }).click();
    await expect(page.getByText("محصول بایگانی شد.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("نام محصول", { exact: true })).toHaveValue(changedName);
    await expect(page.getByLabel("توضیح محصول", { exact: true })).toHaveValue(changedDescription);
    await expect(page.locator(".gallery-editor-list > li")).toHaveCount(0);
    await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
    await expect(page.getByText("تغییرات محصول ذخیره شد.", { exact: true })).toBeVisible();
    expect((await pool.query("SELECT status,name,description FROM product WHERE id=$1", [productId])).rows[0]).toEqual({ status: "archived", name: changedName, description: changedDescription });
    expect((await pool.query("SELECT count(*)::int AS n FROM product_image WHERE product_id=$1", [productId])).rows[0].n).toBe(0);
    expect((await visitor.request.get(`/api/products/${productId}`)).status()).toBe(404);
  } finally {
    if (productId) await pool.query("UPDATE product SET status='archived' WHERE id=$1", [productId]);
    await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [adminId]);
    await pool.query("DELETE FROM session WHERE user_id=$1", [adminId]);
    await visitor.close();
    await pool.end();
  }
});
