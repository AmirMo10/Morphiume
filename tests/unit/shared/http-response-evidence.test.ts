import { describe, expect, it } from "vitest";
import { httpResponseEvidence, safeHttpResponseAnnotations, HTTP_RESPONSE_STAGES } from "../../e2e/http-response-evidence.mjs";

const id = "F31D0302-438A-4C69-AC73-A558AAC07729";
describe("HTTP acceptance diagnostics disclose only a fixed stage, status and server UUID", () => {
  it.each(HTTP_RESPONSE_STAGES)("allows the reviewed %s stage", stage => {
    expect(httpResponseEvidence(stage, 500, id)).toEqual({ stage, status: 500, serverRequestId: id.toLowerCase() });
  });
  it.each(["PRIVATE cookie", "000000", "otpauth://PRIVATE", "/api/admin/private?code=PRIVATE", null, 500])("does not disclose an invalid request header %#", value => {
    const output = httpResponseEvidence("shipping-read", 429, value);
    expect(output.serverRequestId).toBeNull(); expect(JSON.stringify(output)).not.toContain("PRIVATE");
  });
  it("strips every foreign property from a parsed annotation", () => {
    const output = safeHttpResponseAnnotations([{ type: "http-response-status", description: JSON.stringify({ stage: "collection-save", status: 500, serverRequestId: id, url: "PRIVATE", body: "PRIVATE", headers: { cookie: "PRIVATE" }, error: "PRIVATE SQL", email: "PRIVATE" }) }]);
    expect(output).toEqual([{ stage: "collection-save", status: 500, serverRequestId: id.toLowerCase() }]); expect(JSON.stringify(output)).not.toContain("PRIVATE");
  });
  it("does not serialize malformed records, arbitrary stages, status strings or raw annotation text", () => {
    const records = ["null", "[]", "true", "PRIVATE", '{"stage":"PRIVATE","status":500}', '{"stage":"shipping-read","status":"500"}'];
    expect(safeHttpResponseAnnotations(records.map(description => ({ type: "http-response-status", description })))).toEqual([]);
    expect(safeHttpResponseAnnotations(null)).toEqual([]);
  });
  it("bounds the annotation count and drops an oversized text payload", () => {
    const annotation = { type: "http-response-status", description: JSON.stringify(httpResponseEvidence("shipping-read", 200, id)) };
    expect(safeHttpResponseAnnotations(Array(1001).fill(annotation))).toHaveLength(1000);
    expect(safeHttpResponseAnnotations([{ ...annotation, description: "x".repeat(4097) }])).toEqual([]);
  });
});
