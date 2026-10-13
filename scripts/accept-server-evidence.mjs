import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const files = new Map([
  ["verify-runtime", ".local/server-failures-verify.json"],
  ["image-runtime", ".local/server-failures-image.json"],
]);

// Browser assertions alone cannot establish that the server had no unexpected
// failures. Missing or capped evidence never substitutes for a clean run.
export function serverEvidenceAccepted(value, source) {
  if (!files.has(source) || !value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.schemaVersion === 1 && value.source === source && value.state === "collected"
    && Number.isSafeInteger(value.linesScanned) && value.linesScanned > 0
    && value.byteLimitReached === false && value.lineLimitReached === false
    && value.eventLimitReached === false && value.eventCount === 0
    && Array.isArray(value.events) && value.events.length === 0;
}

export async function acceptServerEvidence(source, workspace = process.cwd()) {
  const file = files.get(source);
  if (!file) return false;
  try {
    const input = await readFile(resolve(workspace, file), "utf8");
    if (Buffer.byteLength(input, "utf8") > 1024 * 1024) return false;
    return serverEvidenceAccepted(JSON.parse(input), source);
  } catch {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2];
  if (process.argv.length !== 3 || !files.has(source)) {
    console.error("Usage: accept-server-evidence.mjs verify-runtime|image-runtime");
    process.exitCode = 1;
  } else if (await acceptServerEvidence(source)) {
    console.log(`Server acceptance passed: source=${source}; uncapped allowlisted evidence; zero captured wrapper HTTP500.`);
  } else {
    console.error(`Server acceptance failed: source=${source}; evidence missing, incomplete, invalid or contains HTTP500.`);
    process.exitCode = 1;
  }
}
