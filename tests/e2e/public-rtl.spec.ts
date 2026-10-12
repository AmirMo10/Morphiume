import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test("T20: public Persian pages remain usable at 320px with keyboard and reduced motion", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.name));
  for (const route of ["/products", "/account", "/admin/login"]) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (route === "/products") {
      await page.getByRole("combobox", { name: "مرتب‌سازی", exact: true }).selectOption("price_asc");
      await expect(page.getByRole("combobox", { name: "مرتب‌سازی", exact: true })).toHaveValue("price_asc");
      await page.getByRole("combobox", { name: "مرتب‌سازی", exact: true }).selectOption("price_desc");
      await expect(page.getByRole("combobox", { name: "مرتب‌سازی", exact: true })).toHaveValue("price_desc");
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  expect(failures).toEqual([]);
  await page.goto("/products");
  await mkdir("docs/qa/screenshots", { recursive: true });
  await page.screenshot({ path: `docs/qa/screenshots/catalog-${info.project.name}-320.png`, fullPage: true });
});
