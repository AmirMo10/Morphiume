export type GuideElementAlias = "body" | "main" | "site-header" | "guide-controls" | "guide-control-label" | "guide-control-select" | "guide-facet-notice" | "guide-results" | "guide-grid" | "guide-grid-item" | "guide-product-tile" | "guide-product-copy" | "guide-match-copy" | "guide-match-isolate" | "guide-pagination";
export type GuideReflowEvidence = { surface: "guide"; viewportWidth: number; documentWidth: number; elements: { alias: GuideElementAlias; index: number; left: number; right: number; width: number; clientWidth: number; scrollWidth: number }[] };
export const GUIDE_ELEMENT_ALIASES: readonly GuideElementAlias[];
export function guideReflowEvidence(value: unknown): GuideReflowEvidence | null;
export function safeGuideReflowAnnotations(annotations: unknown): GuideReflowEvidence[];
