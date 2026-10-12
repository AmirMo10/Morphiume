import { expect, test, type Page } from "@playwright/test";

export const publicMetadataRoutes = [
  { alias: "products", path: "/products", expectedTitle: "عطرها | Morphiume" },
  { alias: "account", path: "/account", expectedTitle: "حساب کاربری | Morphiume" },
  { alias: "admin-login", path: "/admin/login", expectedTitle: "مدیریت فروشگاه | Morphiume" },
] as const;
export type PublicMetadataAlias = typeof publicMetadataRoutes[number]["alias"];
export type PublicMetadataPhase = "navigation" | "sort-asc" | "sort-desc" | "before-axe" | "after-axe";
type PublicMetadataStatus = {
  alias: PublicMetadataAlias; phase: PublicMetadataPhase; httpStatus: number | null;
  titlePresent: boolean; expectedTitleMatches: boolean;
  readyState: "loading" | "interactive" | "complete"; readiness: "observed" | "ready" | "failed";
};
const observations = new WeakMap<Page, PublicMetadataStatus[]>();
export function publicMetadataStatuses(page: Page) { return [...(observations.get(page) ?? [])]; }

export async function assertPublicMetadata(page: Page, alias: PublicMetadataAlias, httpStatus: number | null, phase: PublicMetadataPhase) {
  const expectedTitle = publicMetadataRoutes.find(route => route.alias === alias)!.expectedTitle;
  async function record(readiness: PublicMetadataStatus["readiness"]) {
    const snapshot = await page.evaluate(expected => ({ titlePresent: document.title.trim().length > 0, expectedTitleMatches: document.title === expected, readyState: document.readyState }), expectedTitle);
    const status: PublicMetadataStatus = { alias, phase, httpStatus, readiness, ...snapshot };
    const history = observations.get(page) ?? []; history.push(status); observations.set(page, history);
    console.info(`[public-metadata-status] ${JSON.stringify(status)}`);
    try { test.info().annotations.push({ type: "public-metadata-status", description: JSON.stringify(status) }); }
    catch { /* Standalone readonly observation has no Playwright test info. */ }
  }
  await record("observed");
  try {
    expect(httpStatus, `Public ${alias} document HTTP status`).toBe(200);
    // H1/selected option can be ready before a route's head metadata settles.
    // Require this route's exact semantic title; never accept a blank/fallback.
    await expect(page).toHaveTitle(expectedTitle);
  } catch (error) { await record("failed"); throw error; }
  await record("ready");
}
