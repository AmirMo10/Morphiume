import { describe, expect, it } from "vitest";
import { guideReflowEvidence, safeGuideReflowAnnotations } from "../../e2e/guide-reflow-evidence.mjs";

const geometry = { surface: "guide", viewportWidth: 320, documentWidth: 723, elements: [{ alias: "guide-match-isolate", index: 1, left: -403, right: 320, width: 723, clientWidth: 723, scrollWidth: 723 }] };
describe("bounded guide reflow evidence preserves geometry while omitting page content", () => {
  it("keeps a negative RTL boundary and overflowing inline isolate for diagnosis", () => {
    expect(guideReflowEvidence(geometry)).toEqual(geometry);
  });
  it("never publishes content, selectors, credentials or URLs injected alongside valid geometry", () => {
    const output = guideReflowEvidence({ ...geometry, url: "PRIVATE", title: "PRIVATE", headers: { cookie: "PRIVATE" }, elements: [{ ...geometry.elements[0], text: "PRIVATE", selector: "PRIVATE", attributes: { value: "PRIVATE" } }] });
    expect(output).toEqual(geometry);
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
  });
  it("rejects dynamic aliases and malformed or excessive coordinates without serializing canaries", () => {
    const output = guideReflowEvidence({ ...geometry, elements: [
      { ...geometry.elements[0], alias: "PRIVATE" }, { ...geometry.elements[0], index: 100 },
      { ...geometry.elements[0], left: -100001 }, { ...geometry.elements[0], right: Infinity },
      { ...geometry.elements[0], width: -1 }, { ...geometry.elements[0], clientWidth: "320" },
      { ...geometry.elements[0], scrollWidth: NaN },
    ] });
    expect(output).toEqual({ ...geometry, elements: [] });
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
  });
  it.each([null, [], false, "PRIVATE", { ...geometry, viewportWidth: 0 }, { ...geometry, documentWidth: 100001 }, { ...geometry, elements: null }])("rejects invalid envelope %#", value => {
    expect(guideReflowEvidence(value)).toBeNull();
  });
  it("caps elements and annotation envelopes independently", () => {
    expect(guideReflowEvidence({ ...geometry, elements: Array(100).fill(geometry.elements[0]) })?.elements).toHaveLength(24);
    const annotation = { type: "guide-reflow-status", description: JSON.stringify(geometry) };
    expect(safeGuideReflowAnnotations(Array(1001).fill(annotation))).toHaveLength(10);
  });
  it("drops raw/malformed/oversized annotation text and ignores unknown annotation properties", () => {
    const annotations = ["PRIVATE", "null", "[]", "false", "x".repeat(8193)].map(description => ({ type: "guide-reflow-status", description }));
    expect(safeGuideReflowAnnotations(annotations)).toEqual([]);
    expect(safeGuideReflowAnnotations(null)).toEqual([]);
    expect(safeGuideReflowAnnotations([{ type: "guide-reflow-status", description: JSON.stringify(geometry), private: "PRIVATE" }])).toEqual([geometry]);
  });
});
