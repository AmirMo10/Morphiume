import { open, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Keep these aliases synchronized by review with server/observability.ts.
// Never derive an alias by retaining a raw request path or query.
export const SERVER_ROUTE_ALIASES = Object.freeze([
  "auth", "health", "catalog", "products", "collections", "settings", "content",
  "cart", "cart.claim", "checkout", "orders", "account", "analytics", "test.payment", "payment.callback",
  "admin.catalog", "admin.inventory", "admin.orders", "admin.returns",
  "admin.settings", "admin.directory", "admin.csv", "admin.media", "admin.analytics", "admin.notifications", "api.other",
]);
export const SERVER_FAILURE_CATEGORIES = Object.freeze([
  "database_deadlock", "database_serialization", "database_constraint",
  "database_connection", "database_schema", "database_timeout", "database_data",
  "runtime_type", "runtime_reference", "unexpected",
]);
export const SERVER_NATIVE_AUTH_STATUSES = Object.freeze([400, 401, 403, 404, 408, 429, 500, 502, 503]);
export const SERVER_EVIDENCE_LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, lineBytes: 16384, lines: 50000, events: 1000, durationMs: 3600000 });
const sources = new Set(["verify-runtime", "image-runtime"]);
const routes = new Set(SERVER_ROUTE_ALIASES), categories = new Set(SERVER_FAILURE_CATEGORIES);
const nativeStatuses = new Set(SERVER_NATIVE_AUTH_STATUSES);
const serverUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const utcTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const dockerTimePrefix = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z /;

function validTime(value) {
  if (typeof value !== "string" || !utcTime.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/** Parse one private line; build output from individual validated fields only. */
export function safeServerFailureRecord(line) {
  if (typeof line !== "string" || Buffer.byteLength(line, "utf8") > SERVER_EVIDENCE_LIMITS.lineBytes) return null;
  let record;
  try { record = JSON.parse(line.trim().replace(dockerTimePrefix, "")); } catch { return null; }
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  if (record.event !== "request.completed" || record.status !== 500 || !routes.has(record.route)) return null;
  if (typeof record.requestId !== "string" || !serverUuid.test(record.requestId) || !validTime(record.time)) return null;
  if (!Number.isInteger(record.durationMs) || record.durationMs < 0 || record.durationMs > SERVER_EVIDENCE_LIMITS.durationMs) return null;
  const result = { event: "request.completed", time: record.time, requestId: record.requestId.toLowerCase(), route: record.route, status: 500, durationMs: record.durationMs };
  if (record.errorCode === "INTERNAL") {
    result.errorCode = "INTERNAL";
    if (categories.has(record.failureCategory)) result.failureCategory = record.failureCategory;
    if (typeof record.requestAborted === "boolean") result.requestAborted = record.requestAborted;
    if (Number.isInteger(record.nativeAuthStatus) && nativeStatuses.has(record.nativeAuthStatus)) result.nativeAuthStatus = record.nativeAuthStatus;
  }
  return result;
}

/** Pure bounded extraction; never return input text or a parse error. */
export function collectServerFailureEvidence(text, source) {
  if (!sources.has(source)) throw new Error("Unsupported server evidence source.");
  if (typeof text !== "string") throw new Error("Server evidence input must be text.");
  const bytes = Buffer.from(text, "utf8"), byteLimitReached = bytes.length > SERVER_EVIDENCE_LIMITS.bytes;
  let bounded = bytes.subarray(0, SERVER_EVIDENCE_LIMITS.bytes).toString("utf8");
  // A cut final line is not a complete event, even if its prefix contains JSON.
  if (byteLimitReached) bounded = bounded.slice(0, bounded.lastIndexOf("\n") + 1);
  const lines = bounded.split(/\r?\n/), events = [];
  if (lines.at(-1) === "") lines.pop();
  const lineLimitReached = lines.length > SERVER_EVIDENCE_LIMITS.lines;
  let linesScanned = 0, eventLimitReached = false;
  for (const line of lines.slice(0, SERVER_EVIDENCE_LIMITS.lines)) {
    if (events.length >= SERVER_EVIDENCE_LIMITS.events) { eventLimitReached = true; break; }
    linesScanned++;
    const record = safeServerFailureRecord(line);
    if (record) events.push(record);
  }
  return { schemaVersion: 1, source, state: "collected", linesScanned, eventCount: events.length, byteLimitReached, lineLimitReached, eventLimitReached, events };
}

function unavailable(source, state) {
  return { schemaVersion: 1, source, state, linesScanned: 0, eventCount: 0, byteLimitReached: false, lineLimitReached: false, eventLimitReached: false, events: [] };
}

/** Read at most the byte cap plus one sentinel byte, including growing logs. */
export async function readServerFailureEvidence(source, workspace = process.cwd()) {
  if (!sources.has(source)) throw new Error("Unsupported server evidence source.");
  const file = source === "verify-runtime" ? ".local/ci-server.log" : ".local/image-app.log";
  let handle;
  try {
    handle = await open(resolve(workspace, file), "r");
    const buffer = Buffer.alloc(SERVER_EVIDENCE_LIMITS.bytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    return collectServerFailureEvidence(buffer.subarray(0, length).toString("utf8"), source);
  } catch (error) {
    return unavailable(source, error?.code === "ENOENT" ? "missing" : "unreadable");
  } finally {
    // Closing a log must not emit its name, raw filesystem error or credentials.
    if (handle) await handle.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2];
  if (!sources.has(source) || process.argv.length !== 3) {
    console.error("Usage: sanitize-server-log.mjs verify-runtime|image-runtime");
    process.exitCode = 1;
  } else {
    try {
      const evidence = await readServerFailureEvidence(source);
      const output = source === "verify-runtime" ? ".local/server-failures-verify.json" : ".local/server-failures-image.json";
      await mkdir(".local", { recursive: true });
      await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
      console.log(`Sanitized ${evidence.eventCount} HTTP500 server events; source=${source}; state=${evidence.state}.`);
    } catch {
      console.error("Safe server evidence could not be written.");
      process.exitCode = 1;
    }
  }
}
