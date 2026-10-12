import { expect, type Page } from "@playwright/test";
export async function readyDraftScreenshot(page: Page, productName: string) {
  await expect(page.getByLabel("نام محصول", { exact: true })).toHaveValue(productName);
  await expect(page.getByRole("button", { name: "انتشار محصول", exact: true })).toBeVisible();
  expect(await page.locator('input[type="password"]').count()).toBe(0);
  expect(await page.getByLabel("کلید حساب", { exact: true }).count()).toBe(0);
  expect(await page.evaluate(() => document.body.innerText.includes("otpauth://"))).toBe(false);
}
