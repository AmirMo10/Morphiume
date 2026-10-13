"use client";
import type { BrowserAnalyticsInput } from "@/contracts/analytics";
import { operationId } from "./operation-id";

export type AnalyticsObservation =
  | { kind: "product_view" | "add_to_cart"; productId: string; eventId?: string }
  | { kind: "search"; hasQuery: boolean; resultBucket: "zero" | "1_10" | "11_100" | "over_100"; eventId?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deadlineMs = 1000;
let configuration: Promise<boolean> | undefined;
function endpoint(path: "/api/analytics/config" | "/api/analytics/events") {
  // Fixed paths on this window's origin; a document base URL cannot redirect capture.
  return new URL(path, window.location.origin).href;
}

/** Ephemeral observation ID, never an auth token. A caller may keep it for one logical action. */
export function createAnalyticsEventId(): string | null {
  if (typeof window === "undefined") return null;
  try { const id = operationId(); return uuid.test(id) ? id.toLowerCase() : null; } catch { return null; }
}
function payload(input: AnalyticsObservation): BrowserAnalyticsInput | null {
  // Reconstruct only scalar allowlisted fields; reject metadata, accessors and nested objects.
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== "string") || Object.values(descriptors).some(field => !Object.hasOwn(field, "value") || !field.enumerable)) return null;
  const value = Object.fromEntries(Object.entries(descriptors).map(([key, field]) => [key, field.value])) as Record<string, unknown>;
  const kind = value.kind, fields = kind === "search" ? ["kind", "eventId", "hasQuery", "resultBucket"] : ["kind", "eventId", "productId"];
  if (Object.keys(value).some(key => !fields.includes(key))) return null;
  const eventId = value.eventId === undefined ? createAnalyticsEventId() : value.eventId;
  if (typeof eventId !== "string" || !uuid.test(eventId)) return null;
  if (kind === "product_view" || kind === "add_to_cart") {
    if (typeof value.productId !== "string" || !uuid.test(value.productId)) return null;
    return { kind, eventId: eventId.toLowerCase(), productId: value.productId.toLowerCase() };
  }
  if (kind === "search" && typeof value.hasQuery === "boolean" && typeof value.resultBucket === "string" && ["zero", "1_10", "11_100", "over_100"].includes(value.resultBucket)) {
    return { kind, eventId: eventId.toLowerCase(), hasQuery: value.hasQuery, resultBucket: value.resultBucket as Extract<BrowserAnalyticsInput, { kind: "search" }>["resultBucket"] };
  }
  return null;
}
function enabled() {
  // One bounded attempt per document. Failure/Basic401 disables capture until a fresh document.
  return configuration ??= (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const response = await fetch(endpoint("/api/analytics/config"), { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", mode: "cors", redirect: "error", signal: controller.signal });
      if (!response.ok) return false;
      const config: unknown = await response.json();
      if (controller.signal.aborted || !config || typeof config !== "object") return false;
      const data = (config as { data?: unknown }).data;
      return !!data && typeof data === "object" && (data as { captureEnabled?: unknown }).captureEnabled === true;
    } catch { return false; } finally { clearTimeout(timer); }
  })();
}
/** Call after successful rendering/results/cart mutation. Never await this for commerce. */
export function captureAnalytics(input: AnalyticsObservation): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof globalThis.crypto?.randomUUID !== "function" && typeof globalThis.crypto?.getRandomValues !== "function") return;
    const event = payload(input);
    if (!event) return;
    const body = JSON.stringify(event);
    // The allowlist is ASCII only, so code-unit length equals the UTF-8 transport size.
    if (body.length > 1024) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deadlineMs);
    void (async () => {
      try {
        if (!await enabled() || controller.signal.aborted) return;
        await fetch(endpoint("/api/analytics/events"), { method: "POST", body, headers: { "Content-Type": "application/json" }, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", mode: "cors", redirect: "error", signal: controller.signal });
      } catch { /* Advisory observation loss must never change purchase results or auth state. */ }
      finally { clearTimeout(timer); }
    })();
  } catch { /* Invalid/unsupported observations are dropped without affecting their caller. */ }
}
