export type HttpResponseStage = "shipping-read" | "shipping-write" | "collection-save" | "product-create" | "product-update" | "product-publish" | "product-read" | "product-import" | "product-export" | "product-lock-revocation" | "role-revoke" | "admin-session-read" | "admin-http-session-read";
export type HttpResponseEvidence = { stage: HttpResponseStage; status: number; serverRequestId: string | null };
export const HTTP_RESPONSE_STAGES: readonly HttpResponseStage[];
export function httpResponseEvidence(stage: HttpResponseStage, status: number, requestId: unknown): HttpResponseEvidence;
export function safeHttpResponseAnnotations(annotations: unknown): HttpResponseEvidence[];
