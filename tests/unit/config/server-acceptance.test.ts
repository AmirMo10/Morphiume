import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acceptServerEvidence, serverEvidenceAccepted } from "../../../scripts/accept-server-evidence.mjs";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const target = resolve(directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("morphiume-server-evidence-")) throw new Error("Temporary evidence cleanup boundary rejected");
    await rm(target, { recursive: true, force: true });
  }
});
function complete(source = "verify-runtime") {
  return { schemaVersion: 1, source, state: "collected", linesScanned: 100, eventCount: 0,
    byteLimitReached: false, lineLimitReached: false, eventLimitReached: false, events: [] };
}
describe("CI server failure acceptance", () => {
  it.each(["verify-runtime", "image-runtime"])("accepts complete empty evidence for %s", source => {
    expect(serverEvidenceAccepted(complete(source), source)).toBe(true);
  });
  it.each([
    { state: "missing" }, { state: "unreadable" }, { state: "unknown" },
    { linesScanned: 0 }, { linesScanned: -1 }, { linesScanned: 1.5 },
    { byteLimitReached: true }, { lineLimitReached: true }, { eventLimitReached: true },
    { eventCount: 1 }, { events: [{}] }, { events: null },
    { source: "image-runtime" }, { schemaVersion: 2 }, { byteLimitReached: undefined },
  ])("rejects unavailable, mismatched or incomplete evidence %#", patch => {
    expect(serverEvidenceAccepted({ ...complete(), ...patch }, "verify-runtime")).toBe(false);
  });
  it("rejects an observed internal500 regardless of its diagnostic category", () => {
    expect(serverEvidenceAccepted({ ...complete(), eventCount: 1, events: [{ status: 500, failureCategory: "unexpected" }] }, "verify-runtime")).toBe(false);
    expect(serverEvidenceAccepted(complete(), "unknown-runtime")).toBe(false);
    expect(serverEvidenceAccepted(null, "verify-runtime")).toBe(false);
  });
  it("checks fixed files, fails closed on missing/malformed evidence and accepts the actual file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "morphiume-server-evidence-")); directories.push(directory);
    expect(await acceptServerEvidence("verify-runtime", directory)).toBe(false);
    await mkdir(join(directory, ".local"));
    const path = join(directory, ".local/server-failures-verify.json");
    await writeFile(path, "TEST-private-invalid-canary");
    expect(await acceptServerEvidence("verify-runtime", directory)).toBe(false);
    await writeFile(path, JSON.stringify(complete()));
    expect(await acceptServerEvidence("verify-runtime", directory)).toBe(true);
    expect(await acceptServerEvidence("image-runtime", directory)).toBe(false);
  });
});
