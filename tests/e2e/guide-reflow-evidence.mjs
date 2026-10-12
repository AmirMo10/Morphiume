export const GUIDE_ELEMENT_ALIASES = Object.freeze([
  "body", "main", "site-header", "guide-controls", "guide-control-label",
  "guide-control-select", "guide-facet-notice", "guide-results", "guide-grid",
  "guide-grid-item", "guide-product-tile", "guide-product-copy", "guide-match-copy",
  "guide-match-isolate", "guide-pagination",
]);
const aliases = new Set(GUIDE_ELEMENT_ALIASES);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const unsigned = value => Number.isInteger(value) && value >= 0 && value <= 100_000;
const coordinate = value => Number.isInteger(value) && value >= -100_000 && value <= 100_000;

/** Unknown properties are discarded; invalid geometry is never published. */
export function guideReflowEvidence(value) {
  if (!object(value) || value.surface !== "guide" || !unsigned(value.viewportWidth) || value.viewportWidth === 0 || !unsigned(value.documentWidth) || !Array.isArray(value.elements)) return null;
  const elements = [];
  for (const element of value.elements.slice(0, 24)) {
    if (!object(element) || !aliases.has(element.alias) || !Number.isInteger(element.index) || element.index < 0 || element.index > 99) continue;
    if (![element.width, element.clientWidth, element.scrollWidth].every(unsigned) || ![element.left, element.right].every(coordinate)) continue;
    elements.push({ alias: element.alias, index: element.index, left: element.left, right: element.right, width: element.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth });
  }
  return { surface: "guide", viewportWidth: value.viewportWidth, documentWidth: value.documentWidth, elements };
}
export function safeGuideReflowAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  const records = [];
  for (const annotation of annotations.slice(0, 1000)) {
    if (!object(annotation) || annotation.type !== "guide-reflow-status" || typeof annotation.description !== "string" || annotation.description.length > 8192) continue;
    try {
      const record = guideReflowEvidence(JSON.parse(annotation.description));
      if (record) records.push(record);
    } catch { /* Raw annotation text is never published. */ }
    if (records.length === 10) break;
  }
  return records;
}
