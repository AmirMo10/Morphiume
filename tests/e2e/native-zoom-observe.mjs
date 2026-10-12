import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
assert.equal(new URL(baseURL).hostname, "localhost", "Zoom observation is restricted to local synthetic QA");
await mkdir(".local", { recursive: true });
const runDirectory = await mkdtemp(join(resolve(".local"), "qa-native-zoom-"));
const runs = [];
// Chromium's ChromeZoomLevelPrefs maps the default (empty) partition to "x"
// and initializes HostZoomMap from partition.default_zoom_level. Blink converts
// zoom level to factor as 1.2 ** level. Only these fresh QA profiles are written.
for (const factor of [1, 2]) {
  const level = Math.log(factor) / Math.log(1.2);
  const profile = join(runDirectory, `factor-${factor}`);
  await mkdir(join(profile, "Default"), { recursive: true });
  const preferences = join(profile, "Default", "Preferences");
  await writeFile(preferences, JSON.stringify({ partition: { default_zoom_level: { x: level } } }), { mode: 0o600 });
  const context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: true, viewport: null });
  const page = context.pages()[0] ?? await context.newPage();
  const observations = [];
  const browserVersion = context.browser()?.version();
  try {
    for (const path of ["/products", "/account", "/admin/login", "/guide"]) {
      const response = await page.goto(`${baseURL}${path}`);
      assert.equal(response?.status(), 200, `${path}: public response must succeed`);
      await page.locator("main h1").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        outerWidth, outerHeight, innerWidth, innerHeight, devicePixelRatio,
        screenWidth: screen.width, screenHeight: screen.height,
        visualViewportScale: visualViewport?.scale,
        rootCssZoom: getComputedStyle(document.documentElement).zoom,
        lang: document.documentElement.lang, direction: document.documentElement.dir,
        clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.equal(metrics.lang, "fa"); assert.equal(metrics.direction, "rtl");
      assert.equal(metrics.rootCssZoom, "1", "CSS zoom must remain unchanged");
      assert.equal(metrics.visualViewportScale, 1, "Pinch/page scale must remain unchanged");
      assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${path}: horizontal document overflow`);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      assert.equal(axe.violations.length, 0, `${path}: axe violations ${JSON.stringify(axe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })))}`);
      const skip = page.getByRole("link", { name: "رفتن به محتوای اصلی", exact: true });
      await page.keyboard.press("Tab");
      assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY", `${path}: keyboard focus must reach a control`);
      if (await skip.count()) await assert.doesNotReject(() => skip.evaluate(element => {
        if (element !== document.activeElement) throw new Error("Keyboard skip link was not focused");
      }));
      observations.push({ path, metrics, axeViolationCount: axe.violations.length });
    }
  } finally { await context.close(); }
  const saved = JSON.parse(await readFile(preferences, "utf8"));
  assert.equal(saved.partition.default_zoom_level.x, level, "Native profile zoom preference must persist");
  runs.push({ factor, nativePreferenceKey: "partition.default_zoom_level.x", savedZoomLevel: level, browserVersion, headless: true, viewportEmulation: false, observations });
}
for (let index = 0; index < runs[0].observations.length; index++) {
  const baseline = runs[0].observations[index].metrics, zoomed = runs[1].observations[index].metrics;
  for (const key of ["outerWidth", "outerHeight", "screenWidth", "screenHeight"]) assert.equal(zoomed[key], baseline[key], `Physical ${key} must remain unchanged`);
  assert.ok(Math.abs(baseline.innerWidth / zoomed.innerWidth - 2) < 0.02);
  assert.ok(Math.abs(baseline.innerHeight / zoomed.innerHeight - 2) < 0.02);
  assert.ok(Math.abs(zoomed.devicePixelRatio / baseline.devicePixelRatio - 2) < 0.02);
}
await writeFile("docs/qa/native-zoom-observations.json", JSON.stringify({
  generatedAt: new Date().toISOString(), method: "Chromium persisted native page zoom in fresh QA profiles", axeTags: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
  controls: "No CSS zoom, DPR override, viewport emulation, pinch/page-scale call, custom browser flags or user-profile modification",
  sources: [
    "https://chromium.googlesource.com/chromium/src/+/lkgr/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc",
    "https://chromium.googlesource.com/chromium/src/+/938b37a6d2886bf8335fc7db792f1eb46c65b2ae/third_party/blink/common/page/page_zoom.cc",
    "https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context",
  ], runs,
}, null, 2) + "\n");
console.log("Actual Chrome native200% page zoom verified against unchanged physical geometry; four public pages passed reflow/axe in both native profiles.");
