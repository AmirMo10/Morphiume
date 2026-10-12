import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Correlation = { orderId?: string; paymentAttemptId?: string };
type RequestContext = Correlation & { requestId: string; route: string; method: string; startedAt: number };
const context = new AsyncLocalStorage<RequestContext>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const routePatterns: readonly [RegExp, string][] = [
  [/^\/api\/(?:admin\/)?auth(?:\/|$)/, "auth"],
  [/^\/api\/health\/(?:live|ready)$/, "health"],
  [/^\/api\/catalog\/(?:page|resolve)$/, "catalog"],
  [/^\/api\/products(?:\/[^/]+)?$/, "products"],
  [/^\/api\/collections(?:\/page|\/[^/]+\/page)?$/, "collections"],
  [/^\/api\/(?:settings|shipping|presentation)$/, "settings"],
  [/^\/api\/content\/[^/]+$/, "content"],
  [/^\/api\/cart(?:\/items|\/coupon)?$/, "cart"],
  [/^\/api\/checkout(?:\/quote)?$/, "checkout"],
  [/^\/api\/orders(?:\/page|\/[^/]+(?:\/retry-payment|\/returns)?)?$/, "orders"],
  [/^\/api\/(?:addresses|wishlist|sessions|notifications)(?:\/[^/]+)?$/, "account"],
  [/^\/api\/test\/payments\/[^/]+$/, "test.payment"],
  [/^\/api\/payments\/[^/]+\/callback$/, "payment.callback"],
  [/^\/api\/admin\/(?:products|variants|collections)(?:\/[^/]+){0,2}$/, "admin.catalog"],
  [/^\/api\/admin\/inventory(?:\/[^/]+){0,2}$/, "admin.inventory"],
  [/^\/api\/admin\/orders(?:\/[^/]+){0,2}$/, "admin.orders"],
  [/^\/api\/admin\/(?:refunds|returns)(?:\/[^/]+){0,2}$/, "admin.returns"],
  [/^\/api\/admin\/(?:settings|shipping|presentation|content|coupons)(?:\/[^/]+)?$/, "admin.settings"],
  [/^\/api\/admin\/(?:session|reports|audit|roles|customers)(?:\/[^/]+)?$/, "admin.directory"],
  [/^\/api\/admin\/(?:exports|imports)(?:\/[^/]+)?$/, "admin.csv"],
  [/^\/api\/admin\/media(?:\/[^/]+)?$/, "admin.media"],
];
const responseEvents = new Set(["checkout.response", "payment.verification.response", "order.response", "shipment.response", "refund.decision.response"]);
export type CommerceResponseEvent = "checkout.response" | "payment.verification.response" | "order.response" | "shipment.response" | "refund.decision.response";
const outcomes = new Set(["created", "pending", "processing", "unknown", "succeeded", "failed", "paid", "partially_refunded", "refunded", "confirmed", "completed", "cancelled", "payment_exception", "awaiting_payment", "shipped", "delivered"]);

function safeIds(ids: Correlation): Correlation {
  const result: Correlation = {};
  if (typeof ids.orderId === "string" && uuid.test(ids.orderId)) result.orderId = ids.orderId.toLowerCase();
  if (typeof ids.paymentAttemptId === "string" && uuid.test(ids.paymentAttemptId)) result.paymentAttemptId = ids.paymentAttemptId.toLowerCase();
  return result;
}
function write(record: Record<string, unknown>, failure = false) {
  // Logging cannot turn a committed business operation into a failed response.
  // Build each record from an allowlist; never spread arbitrary request/errors.
  try { (failure ? console.error : console.log)(JSON.stringify({ time: new Date().toISOString(), ...record })); }
  catch { /* The health/worker monitors remain independent of this log sink. */ }
}
export function requestContext() { const current = context.getStore(); return current ? { ...current } : undefined; }
export function withRequestContext<T>(request: Request, handler: () => Promise<T>): Promise<T> {
  const pathname = new URL(request.url).pathname;
  return context.run({ requestId: randomUUID(), route: routePatterns.find(([pattern]) => pattern.test(pathname))?.[1] ?? "api.other",
    method: methods.has(request.method) ? request.method : "OTHER", startedAt: performance.now() }, handler);
}
export function recordCommerceResponse(event: CommerceResponseEvent, ids: Correlation & { outcome?: string }) {
  if (!responseEvents.has(event)) return;
  const current = context.getStore(), safe = safeIds(ids);
  if (!current || (!safe.orderId && !safe.paymentAttemptId)) return;
  Object.assign(current, safe);
  write({ event, requestId: current.requestId, route: current.route, ...safe,
    ...(typeof ids.outcome === "string" && outcomes.has(ids.outcome) ? { outcome: ids.outcome } : {}) });
}
export type JobObservation = { state: "started" | "completed" | "retry" | "dead"; jobId: string; type: string; attemptNumber: number; orderId?: string; paymentAttemptId?: string };
const jobStates = new Set(["started", "completed", "retry", "dead"]);
const jobTypes = new Set(["payment.initialize", "payment.reconcile", "order.created", "order.paid", "payment.succeeded", "payment.exception", "shipment.updated", "shipment.shipped", "shipment.delivered", "return.requested", "return.decided", "refund.requested", "refund.succeeded", "refund.failed"]);
export function recordJobEvent(observation: JobObservation) {
  if (!jobStates.has(observation.state) || typeof observation.jobId !== "string" || !uuid.test(observation.jobId)) return;
  if (!Number.isInteger(observation.attemptNumber) || observation.attemptNumber < 1 || observation.attemptNumber > 12) return;
  write({ event: `job.${observation.state}`, jobId: observation.jobId.toLowerCase(),
    jobType: jobTypes.has(observation.type) ? observation.type : "domain.other", attemptNumber: observation.attemptNumber,
    ...safeIds(observation) }, observation.state === "dead");
}
export function finishRequest(response: Response, errorCode?: string): Response {
  const current = context.getStore();
  if (!current) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", current.requestId);
  const allowedCodes = new Set(["VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "MFA_REQUIRED", "NOT_FOUND", "CONFLICT", "OUT_OF_STOCK", "PRICE_CHANGED", "PAYMENT_UNKNOWN", "NOT_ELIGIBLE", "CONFIGURATION", "INTERNAL"]);
  write({ event: "request.completed", requestId: current.requestId, route: current.route, method: current.method,
    status: response.status, durationMs: Math.max(0, Math.round(performance.now() - current.startedAt)), ...safeIds(current),
    ...(errorCode && allowedCodes.has(errorCode) ? { errorCode } : {}) }, response.status >= 500);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
