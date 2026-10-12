export const HTTP_RESPONSE_STAGES = Object.freeze([
  "shipping-read", "shipping-write", "collection-save", "product-create",
  "product-update", "product-publish", "product-read", "product-import",
  "product-export", "product-lock-revocation", "role-revoke",
  "admin-session-read", "admin-http-session-read",
]);
const stages = new Set(HTTP_RESPONSE_STAGES);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function httpResponseEvidence(stage, status, requestId) {
  if (!stages.has(stage) || !Number.isInteger(status) || status < 100 || status > 599) throw new Error("Invalid safe HTTP response evidence.");
  return { stage, status, serverRequestId: typeof requestId === "string" && uuid.test(requestId) ? requestId.toLowerCase() : null };
}
export function safeHttpResponseAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  const records = [];
  for (const annotation of annotations.slice(0, 1000)) {
    if (!annotation || typeof annotation !== "object" || annotation.type !== "http-response-status" || typeof annotation.description !== "string" || annotation.description.length > 4096) continue;
    try {
      const record = JSON.parse(annotation.description);
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      records.push(httpResponseEvidence(record.stage, record.status, record.serverRequestId));
    } catch { /* No invalid annotation text is published. */ }
  }
  return records;
}
