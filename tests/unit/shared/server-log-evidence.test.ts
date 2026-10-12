import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { collectServerFailureEvidence, readServerFailureEvidence, safeServerFailureRecord, SERVER_EVIDENCE_LIMITS, SERVER_FAILURE_CATEGORIES, SERVER_ROUTE_ALIASES } from "../../e2e/sanitize-server-log.mjs";

const event = { event: "request.completed", time: "2026-10-12T17:51:46.123Z", requestId: "F31D0302-438A-4C69-AC73-A558AAC07729", route: "admin.catalog", status: 500, durationMs: 17, errorCode: "INTERNAL", failureCategory: "database_constraint" };
const line = (changes: Record<string, unknown> = {}) => JSON.stringify({ ...event, ...changes });
async function removeSyntheticWorkspace(workspace: string) {
  const target = resolve(workspace);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("morphiume-log-")) throw new Error("Refusing unsafe synthetic log cleanup.");
  await rm(target, { recursive: true, force: true });
}

describe("private runtime log evidence has a fixed publication allowlist", () => {
  it("drops contact, SQL, auth, commerce correlations and arbitrary nested values", () => {
    const secret = "PRIVATE_FIXTURE_SENTINEL";
    const output = safeServerFailureRecord(line({ email: secret, phone: secret, password: secret, cookie: secret, token: secret, code: secret, sql: secret, detail: secret, constraint: secret, query: secret, orderId: secret, paymentAttemptId: secret, headers: { Authorization: secret }, message: secret, nested: [secret], method: secret }));
    expect(output).toEqual({ ...event, requestId: event.requestId.toLowerCase() });
    expect(JSON.stringify(output)).not.toContain(secret);
    expect(Object.keys(output!).sort()).toEqual(["durationMs", "errorCode", "event", "failureCategory", "requestId", "route", "status", "time"]);
  });
  it.each(SERVER_ROUTE_ALIASES)("retains only the reviewed route alias %s", route => {
    expect(safeServerFailureRecord(line({ route }))?.route).toBe(route);
  });
  it.each(["/api/admin/collections/private", "admin.catalog?token=PRIVATE", "admin.user@example.invalid", "unknown"])("does not publish raw or unknown route %s", route => {
    expect(safeServerFailureRecord(line({ route }))).toBeNull();
  });
  it.each(SERVER_FAILURE_CATEGORIES)("retains the fixed failure category %s without raw PG identity", failureCategory => {
    expect(safeServerFailureRecord(line({ failureCategory }))?.failureCategory).toBe(failureCategory);
  });
  it("does not infer a category from SQLSTATE or text, or attach one to an unknown error code", () => {
    const output = safeServerFailureRecord(line({ failureCategory: "23505 PRIVATE", code: "23505", error: "PRIVATE SQL" }));
    expect(output).not.toHaveProperty("failureCategory");
    expect(JSON.stringify(output)).not.toMatch(/23505|PRIVATE/u);
    const foreignCode = safeServerFailureRecord(line({ errorCode: "PRIVATE_AUTH_ERROR" }));
    expect(foreignCode).not.toHaveProperty("errorCode");
    expect(foreignCode).not.toHaveProperty("failureCategory");
  });
  it.each([undefined, null, 500, "", "not JSON", "null", "[]", "true", '"request.completed"', '{"event":'])("ignores malformed and non-record lines %#", value => {
    expect(safeServerFailureRecord(value)).toBeNull();
  });
  it.each([
    { event: "job.dead" }, { event: "refund.decision.response" }, { status: 429 }, { status: 503 }, { status: "500" },
    { durationMs: -1 }, { durationMs: 0.1 }, { durationMs: "17" }, { durationMs: null }, { durationMs: SERVER_EVIDENCE_LIMITS.durationMs + 1 },
    { requestId: "private-token" }, { requestId: "f31d0302-438a-1c69-ac73-a558aac07729" }, { requestId: "f31d0302-438a-4c69-7c73-a558aac07729" },
    { time: "2026-02-30T17:51:46.123Z" }, { time: "2026-10-12T17:51:46.123+00:00" }, { time: "PRIVATE" }, { time: null },
  ])("rejects an unsafe or out-of-contract required field %#", changes => {
    expect(safeServerFailureRecord(line(changes))).toBeNull();
  });
  it("accepts exact Docker UTC prefixes but discards their value and every unrelated prefix", () => {
    expect(safeServerFailureRecord("2026-10-12T17:51:47.123456789Z " + line())?.time).toBe(event.time);
    expect(safeServerFailureRecord("PRIVATE " + line())).toBeNull();
    expect(safeServerFailureRecord("2026-10-12T17:51:47.123Z PRIVATE " + line())).toBeNull();
  });
  it("caps event and line counts rather than exporting unlimited failures", () => {
    const events = collectServerFailureEvidence(Array(SERVER_EVIDENCE_LIMITS.events + 1).fill(line()).join("\n"), "verify-runtime");
    expect(events.events).toHaveLength(SERVER_EVIDENCE_LIMITS.events); expect(events.eventLimitReached).toBe(true);
    const lines = collectServerFailureEvidence(Array(SERVER_EVIDENCE_LIMITS.lines + 1).fill("null").join("\n"), "image-runtime");
    expect(lines.linesScanned).toBe(SERVER_EVIDENCE_LIMITS.lines); expect(lines.lineLimitReached).toBe(true); expect(lines.events).toEqual([]);
  });
  it("bounds bytes and line size and never parses a cut final line", () => {
    expect(safeServerFailureRecord(line({ message: "ع".repeat(SERVER_EVIDENCE_LIMITS.lineBytes) }))).toBeNull();
    const text = "null\n" + "x".repeat(SERVER_EVIDENCE_LIMITS.bytes) + "\n" + line();
    const output = collectServerFailureEvidence(text, "verify-runtime");
    expect(output.byteLimitReached).toBe(true); expect(output.events).toEqual([]); expect(output.linesScanned).toBe(1);
  });
  it("has no generic source/path channel for publishing caller-provided values", () => {
    expect(() => collectServerFailureEvidence(line(), "PRIVATE" as "verify-runtime")).toThrow("Unsupported server evidence source.");
  });
});

describe("bounded evidence file adapter uses only disposable synthetic logs", () => {
  it("distinguishes missing/unreadable logs from collected zero-event evidence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "morphiume-log-unit-"));
    try {
      expect((await readServerFailureEvidence("verify-runtime", workspace)).state).toBe("missing");
      await mkdir(join(workspace, ".local", "ci-server.log"), { recursive: true });
      expect((await readServerFailureEvidence("verify-runtime", workspace)).state).toBe("unreadable");
      await writeFile(join(workspace, ".local", "image-app.log"), "PRIVATE unrelated log\n");
      const collected = await readServerFailureEvidence("image-runtime", workspace);
      expect(collected.state).toBe("collected"); expect(collected.events).toEqual([]);
      expect(JSON.stringify(collected)).not.toContain(workspace);
    } finally { await removeSyntheticWorkspace(workspace); }
  });
  it("executes the CLI on a synthetic image log, publishing no raw data or paths", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "morphiume-log-cli-"));
    try {
      await mkdir(join(workspace, ".local"));
      await writeFile(join(workspace, ".local", "image-app.log"), "PRIVATE auth body\n" + line({ headers: { cookie: "PRIVATE" }, sql: "PRIVATE" }) + "\n");
      const script = fileURLToPath(new URL("../../e2e/sanitize-server-log.mjs", import.meta.url));
      const stdout = execFileSync(process.execPath, [script, "image-runtime"], { cwd: workspace, encoding: "utf8" });
      const text = await readFile(join(workspace, ".local", "server-failures-image.json"), "utf8"), published = JSON.parse(text);
      expect(published.eventCount).toBe(1); expect(published.source).toBe("image-runtime");
      expect(published.events[0].failureCategory).toBe("database_constraint");
      expect(text + stdout).not.toContain("PRIVATE"); expect(text + stdout).not.toContain(workspace);
    } finally { await removeSyntheticWorkspace(workspace); }
  });
  it("reads only the fixed byte budget of an oversized real synthetic log file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "morphiume-log-bounded-"));
    try {
      await mkdir(join(workspace, ".local"));
      await writeFile(join(workspace, ".local", "ci-server.log"), line() + "\n" + "x".repeat(SERVER_EVIDENCE_LIMITS.bytes) + "\n" + line({ durationMs: 99 }));
      const output = await readServerFailureEvidence("verify-runtime", workspace);
      expect(output.byteLimitReached).toBe(true); expect(output.eventCount).toBe(1); expect(output.events).toHaveLength(1);
      const first = output.events[0]!;
      expect(first.durationMs).toBe(17); expect(output.linesScanned).toBe(1);
    } finally { await removeSyntheticWorkspace(workspace); }
  });
});
