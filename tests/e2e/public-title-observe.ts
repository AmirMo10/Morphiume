import { chromium, webkit, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { assertPublicMetadata, publicMetadataRoutes, publicMetadataStatuses } from "./public-metadata";

// Explicit readonly diagnosis only: preserve real document/RSC responses while
// intercepting all client APIs (GET /api/cart otherwise creates a guest cart).
// These controlled responses do not establish actual cart/session acceptance.
async function main() {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const observations: unknown[] = [];
  for (const engine of ["chromium", "webkit"] as const) {
    const browser = engine === "chromium" ? await chromium.launch({ channel: "chrome" }) : await webkit.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: "reduce" });
      let interceptedApi = 0, blockedMutation = 0;
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.startsWith("/api/")) {
          interceptedApi++;
          let body: unknown = { error: { code: "READONLY_FIXTURE", message: "پاسخ کنترل‌شدهٔ آزمون خواندنی" } };
          let status = 404;
          if (url.pathname === "/api/cart") { status = 200; body = { data: { id: "readonly-fixture", version: 1, couponCode: null, subtotal: { amountIrr: "0", currency: "IRR" }, items: [] } }; }
          if (url.pathname === "/api/auth/get-session") { status = 200; body = null; }
          if (url.pathname === "/api/catalog/page") {
            status = 200; body = { data: { items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0, facets: { families: [], concentrations: [], volumesMl: [], notes: [] }, facetLimit: 100, facetsTruncated: false } };
          }
          await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); return;
        }
        if (!["GET", "HEAD"].includes(request.method())) { blockedMutation++; await route.abort(); return; }
        if (url.origin !== "http://localhost:3000") { await route.abort(); return; }
        await route.continue();
      });
      const page = await context.newPage();
      const routeResults: unknown[] = [];
      for (const route of publicMetadataRoutes) {
        const response = await page.goto(`http://localhost:3000${route.path}`);
        const status = response?.status() ?? null;
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await assertPublicMetadata(page, route.alias, status, "navigation");
        if (route.alias === "products") for (const sort of ["price_asc", "price_desc"] as const) {
          await page.getByRole("combobox", { name: "مرتب‌سازی", exact: true }).selectOption(sort);
          await expect(page.getByRole("combobox", { name: "مرتب‌سازی", exact: true })).toHaveValue(sort);
          await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe(sort);
          await assertPublicMetadata(page, route.alias, status, sort === "price_asc" ? "sort-asc" : "sort-desc");
        }
        await assertPublicMetadata(page, route.alias, status, "before-axe");
        const axe = await fullAxe(page);
        await assertPublicMetadata(page, route.alias, status, "after-axe");
        routeResults.push({ alias: route.alias, httpStatus: status, violationIds: axe.violations.map(item => item.id) });
        expect(axe.violations).toEqual([]);
      }
      observations.push({ engine, version: browser.version(), scope: "real SSR/RSC; controlled client APIs", interceptedApi, blockedMutation, routeResults, metadataStatuses: publicMetadataStatuses(page) });
      await context.close();

      const fixtureContext = await browser.newContext();
      await fixtureContext.route("**/*", async route => {
        if (route.request().url() === "http://qa-title.invalid/") await route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body><main><h1>صفحهٔ کنترل‌شدهٔ آزمون</h1></main></body></html>' });
        else await route.abort();
      });
      const fixture = await fixtureContext.newPage();
      const fixtureResponse = await fixture.goto("http://qa-title.invalid/");
      await expect(fixture.getByRole("heading", { level: 1 })).toBeVisible();
      const before = await fullAxe(fixture);
      expect(before.violations.map(item => item.id)).toEqual(["document-title"]);
      const pending = assertPublicMetadata(fixture, "products", fixtureResponse?.status() ?? null, "navigation");
      await expect.poll(() => publicMetadataStatuses(fixture).some(item => item.readiness === "observed" && !item.titlePresent)).toBe(true);
      await fixture.evaluate(title => { document.title = title; }, publicMetadataRoutes[0].expectedTitle);
      await pending;
      const after = await fullAxe(fixture);
      expect(after.violations).toEqual([]);
      // Independent negative control: a persistently empty title must fail the
      // gate and remain visible to the unchanged document-title axe rule.
      await fixture.evaluate(() => { document.title = ""; });
      let blankRejected = false;
      try { await assertPublicMetadata(fixture, "products", 200, "before-axe"); } catch { blankRejected = true; }
      expect(blankRejected).toBe(true);
      const blank = await fullAxe(fixture);
      expect(blank.violations.map(item => item.id)).toEqual(["document-title"]);
      observations.push({ engine, scope: "isolated delayed-head fixture, not original Firefox reproduction", beforeViolationIds: before.violations.map(item => item.id), afterViolationIds: after.violations.map(item => item.id), blankRejected, persistentBlankViolationIds: blank.violations.map(item => item.id), metadataStatuses: publicMetadataStatuses(fixture) });
      await fixtureContext.close();
    } finally { await browser.close(); }
  }
  await mkdir("docs/qa", { recursive: true });
  await writeFile("docs/qa/public-metadata-observations.json", JSON.stringify({ startedAt, durationMs: Math.round(performance.now() - started), runtimeBuild: "24244", runtimeSession: "48583", applicationCheckpoint: "76dfcd1", status: "passed", firefoxOriginalCause: "unclassified; route not captured; Windows engine unavailable", observations }, null, 2));
  console.log(JSON.stringify({ status: "passed", engines: 2, actualPublicRoutes: 6, delayedHeadFixtures: 2, persistentBlankRejections: 2 }));
}
function fullAxe(page: Page) { return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); }
void main().catch(error => { console.error(JSON.stringify({ status: "failed", errorType: error instanceof Error ? error.name : "Unknown" })); process.exitCode = 1; });
