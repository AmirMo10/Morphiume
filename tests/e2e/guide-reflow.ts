import { test, type Page } from "@playwright/test";
import { guideReflowEvidence, type GuideElementAlias } from "./guide-reflow-evidence.mjs";

/** Fixed selectors are used for collection only and are never exported. */
const targets: { alias: GuideElementAlias; selector: string }[] = [
  { alias: "body", selector: "body" },
  { alias: "main", selector: "main" },
  { alias: "site-header", selector: ".site-header" },
  { alias: "guide-controls", selector: ".guide-controls" },
  { alias: "guide-control-label", selector: ".guide-controls > label" },
  { alias: "guide-control-select", selector: ".guide-controls > label > select" },
  { alias: "guide-facet-notice", selector: ".guide-controls + .helper" },
  { alias: "guide-results", selector: ".result-bar" },
  { alias: "guide-grid", selector: ".product-grid" },
  { alias: "guide-grid-item", selector: ".product-grid > div" },
  { alias: "guide-product-tile", selector: ".product-grid .product-tile" },
  { alias: "guide-product-copy", selector: ".product-grid .product-tile .tile-meta" },
  { alias: "guide-match-copy", selector: ".product-grid > div > .helper" },
  { alias: "guide-match-isolate", selector: ".product-grid > div > .helper > bdi" },
  { alias: "guide-pagination", selector: ".pagination" },
];

export async function recordGuideReflowFailure(page: Page) {
  // Never replace the original assertion failure if the page has already closed.
  try {
    const raw = await page.evaluate(targets => {
      const viewportWidth = document.documentElement.clientWidth;
      const documentWidth = document.documentElement.scrollWidth;
      const elements = targets.flatMap(({ alias, selector }) => Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(0, 100).flatMap((element, index) => {
        const box = element.getBoundingClientRect();
        if (!box.width || !(box.left < -1 || box.right > viewportWidth + 1 || element.scrollWidth > element.clientWidth + 1)) return [];
        return [{ alias, index, left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }];
      })).slice(0, 24);
      return { surface: "guide", viewportWidth, documentWidth, elements };
    }, targets);
    const evidence = guideReflowEvidence(raw);
    if (evidence) {
      const description = JSON.stringify(evidence);
      test.info().annotations.push({ type: "guide-reflow-status", description });
      console.log(`guide-reflow-status ${description}`);
    }
  } catch { /* Preserve the original failure without logging a raw browser error. */ }
}
