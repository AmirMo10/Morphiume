import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, relative, sep, posix } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
export const TOOLCHAIN_LIMITS = Object.freeze({ members: 50000, bytes: 4 * 1024 ** 3, fileBytes: 1024 ** 3, pathBytes: 1024, depth: 32 });
export const TOOLCHAIN_PLATFORM = "ubuntu24.04-x64";
const versions = Object.freeze({ node: "24.21.0", pnpm: "11.25.0", playwright: "1.64.0" });
const knownEngines = new Set(["chromium", "chromium-headless-shell", "firefox", "webkit", "ffmpeg"]);
const requiredEngines = ["chromium", "firefox", "webkit"];
const forbiddenSegments = /^(?:Default|Profile(?:\s+.*)?|User Data|user_data|user-data|Cookies(?:-journal)?|History(?:-journal)?|Login Data|Web Data|Preferences|Local State|Session Storage|Local Storage|IndexedDB|GPUCache|Crash Reports|Cache|Network|SingletonCookie|SingletonLock|SingletonSocket|GITHUB_TOKEN|tokens?\.json|auth\.json|storage-state\.json|\.env(?:\..*)?|\.local|\.git|\.ssh|node_modules|id_rsa|id_ed25519|credentials(?:\.json)?|.*\.(?:pem|p12))$/iu;
// Exact branding and default application preferences at the pinned revision.
// These are distribution assets, not a
// browser profile. See docs/qa/FIREFOX_VENDOR_CACHE_REVIEW.md for provenance.
const firefoxIcons = "firefox-1555/firefox/browser/chrome/icons/default";
const firefoxPreferences = "firefox-1555/firefox/browser/defaults/preferences";
const playwrightPreferences = `${firefoxPreferences}/00-playwright-prefs.js`;
const playwrightPreferenceBytes = 160;
const playwrightPreferenceSha256 = "8c2d32801a924f2c2b133f1191d01213513c86e8d1e42e144e9cb1015ea71084";
function vendorDistributionType(path, roots, descriptor) {
  if (!roots.includes("firefox-1555") || descriptor?.engine !== "firefox" || descriptor.directory !== "firefox-1555" || descriptor.revision !== "1555" || descriptor.browserVersion !== "157.0") return null;
  if (path === firefoxIcons) return "directory";
  if (path === firefoxPreferences) return "directory";
  if (path === playwrightPreferences) return "file";
  if (/^firefox-1555\/firefox\/browser\/defaults\/preferences\/(?:debugger|firefox|firefox-branding)\.js$/u.test(path)) return "file";
  return /^firefox-1555\/firefox\/browser\/chrome\/icons\/default\/default(?:16|32|48|64|128)\.png$/u.test(path) ? "file" : null;
}
const digest = /^[a-f0-9]{64}$/u;
const failureCodes = new Set([
  "contract-rejected", "runtime-identity", "source-identity", "cache-root-type", "cache-root-canonical", "cache-top-unexpected", "cache-links-type", "cache-required-engine",
  "entry-path-format", "entry-path-private-or-traversal", "entry-path-root", "entry-parent", "entry-type", "entry-mode", "entry-special-mode", "entry-member-cap", "entry-file-cap", "entry-byte-cap", "entry-hardlink", "entry-mutated", "entry-vendor-content",
  "entry-link-format", "entry-link-cross-root", "entry-link-cycle", "entry-link-missing", "cache-license-missing", "cache-io", "archive-command", "unexpected-operation",
]);
const failureStages = new Set(["runtime", "identity", "cache-inspection", "archive-create", "archive-stability", "manifest-write", "unknown"]);
const execution = { stage: "runtime", cacheDir: null, metadata: null };
class ToolchainContractError extends Error {
  constructor(code) { super("Browser toolchain contract rejected."); this.safeCode = failureCodes.has(code) ? code : "contract-rejected"; }
}
function requireSafe(condition, code = "contract-rejected") { if (!condition) throw new ToolchainContractError(code); }

/** Closed diagnostic envelope: never retain error text/stack, paths or link values. */
export function safeExportFailure(error, stage, metadata = {}) {
  const record = { event: "browser-toolchain.export.failed", stage: failureStages.has(stage) ? stage : "unknown", code: error instanceof ToolchainContractError && failureCodes.has(error.safeCode) ? error.safeCode : "unexpected-operation" };
  if (error instanceof ToolchainContractError && error.safeEntry) {
    const input = error.safeEntry, output = {};
    if (knownEngines.has(input.engine)) output.engine = input.engine;
    if (["file", "directory", "symlink", "unsupported", "unknown"].includes(input.type)) output.type = input.type;
    if (input.reviewedVendorAlias === "firefox-playwright-default-preferences") output.reviewedVendorAlias = input.reviewedVendorAlias;
    if (typeof input.vendorContentMatches === "boolean") output.vendorContentMatches = input.vendorContentMatches;
    for (const [key, max] of [["index", TOOLCHAIN_LIMITS.members], ["mode", 0o177777], ["pathBytes", TOOLCHAIN_LIMITS.pathBytes + 1], ["pathDepth", TOOLCHAIN_LIMITS.depth + 1]]) if (Number.isInteger(input[key]) && input[key] >= 0 && input[key] <= max) output[key] = input[key];
    record.entry = output;
  }
  metadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const cache = { state: metadata.state === "collected" ? "collected" : "unavailable" };
  if (cache.state === "collected") {
    if (Number.isInteger(metadata.topEntryCount) && metadata.topEntryCount >= 0 && metadata.topEntryCount <= 16) cache.topEntryCount = metadata.topEntryCount;
    if (typeof metadata.topEntryLimitReached === "boolean") cache.topEntryLimitReached = metadata.topEntryLimitReached;
    if (typeof metadata.registryLinksPresent === "boolean") cache.registryLinksPresent = metadata.registryLinksPresent;
    cache.knownRoots = Array.isArray(metadata.knownRoots) ? metadata.knownRoots.slice(0, 5).filter(root => knownEngines.has(root?.engine) && typeof root.present === "boolean").map(root => ({ engine: root.engine, present: root.present })) : [];
  }
  record.cache = cache; return record;
}

async function diagnosticCacheMetadata(cacheDir, metadata) {
  try {
    if (!cacheDir || !metadata) return {};
    const absolute = resolve(cacheDir), info = await lstat(absolute);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(absolute) !== absolute) return {};
    const roots = browserRoots(metadata), top = await readdir(absolute);
    return { state: "collected", topEntryCount: Math.min(top.length, 16), topEntryLimitReached: top.length > 16, registryLinksPresent: top.includes(".links"), knownRoots: roots.map(root => ({ engine: root.engine, present: top.includes(root.directory) })) };
  } catch { return {}; }
}

export function browserRoots(metadata) {
  requireSafe(metadata && typeof metadata === "object" && Array.isArray(metadata.browsers));
  const roots = [];
  for (const item of metadata.browsers) {
    if (!knownEngines.has(item?.name)) continue;
    const override = item.revisionOverrides?.[TOOLCHAIN_PLATFORM];
    const revision = override ?? item.revision;
    requireSafe(typeof revision === "string" && /^[1-9][0-9]{0,5}$/u.test(revision));
    requireSafe(!roots.some(root => root.engine === item.name));
    requireSafe(item.browserVersion === undefined || typeof item.browserVersion === "string" && /^[0-9]+(?:\.[0-9]+){1,3}$/u.test(item.browserVersion));
    // Match pinned registry.readDescriptors: special host override directories
    // do not carry the default binary's browserVersion.
    const prefix = override === undefined ? item.name : `${item.name}_${TOOLCHAIN_PLATFORM}_special`;
    roots.push({ engine: item.name, directory: `${prefix.replaceAll("-", "_")}-${revision}`, revision, ...(override === undefined && item.browserVersion ? { browserVersion: item.browserVersion } : {}) });
  }
  requireSafe(requiredEngines.every(name => roots.some(root => root.engine === name)));
  return roots;
}

export function validateEntryPath(path, allowedRoots, limits = TOOLCHAIN_LIMITS, firefoxDescriptor = null) {
  requireSafe(typeof path === "string" && Buffer.byteLength(path) <= limits.pathBytes && !/[\\\x00-\x1f\x7f]/u.test(path), "entry-path-format");
  const parts = path.split("/");
  const vendorAsset = vendorDistributionType(path, allowedRoots, firefoxDescriptor);
  requireSafe(parts.length <= limits.depth && parts.every((part, index) => part && part !== "." && part !== ".." && (!forbiddenSegments.test(part) || vendorAsset && (index === 5 && part === "default" || index === 4 && part === "preferences"))), "entry-path-private-or-traversal");
  requireSafe(allowedRoots.includes(parts[0]) && parts.every(part => !part.startsWith(".")), "entry-path-root");
  return path;
}

export function validateEntries(entries, roots, limits = TOOLCHAIN_LIMITS) {
  requireSafe(Array.isArray(entries) && entries.length > 0 && entries.length <= limits.members);
  const names = roots.map(root => root.directory), firefoxDescriptor = roots.find(root => root.engine === "firefox"), seen = new Map(); let bytes = 0;
  for (const entry of entries) {
    requireSafe(entry && typeof entry === "object" && !Array.isArray(entry));
    validateEntryPath(entry.path, names, limits, firefoxDescriptor); requireSafe(!seen.has(entry.path)); seen.set(entry.path, entry);
    requireSafe(["file", "directory", "symlink"].includes(entry.type), "entry-type");
    const vendorType = vendorDistributionType(entry.path, names, firefoxDescriptor);
    if (vendorType) requireSafe(entry.type === vendorType, "entry-type");
    requireSafe(Number.isInteger(entry.mode) && entry.mode >= 0 && entry.mode <= 0o777);
    if (entry.type !== "symlink") requireSafe((entry.mode & 0o022) === 0 && (entry.mode & 0o400) !== 0, "entry-mode");
    if (entry.type === "file") {
      requireSafe(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= limits.fileBytes && typeof entry.sha256 === "string" && digest.test(entry.sha256));
      if (entry.path === playwrightPreferences) requireSafe(entry.bytes === playwrightPreferenceBytes && entry.sha256 === playwrightPreferenceSha256, "entry-vendor-content");
      bytes += entry.bytes; requireSafe(bytes <= limits.bytes, "entry-byte-cap");
    } else requireSafe(entry.bytes === 0);
    if (entry.type === "symlink") {
      requireSafe(typeof entry.target === "string" && entry.target && Buffer.byteLength(entry.target) <= limits.pathBytes && !/[\\\x00-\x1f\x7f]/u.test(entry.target) && !posix.isAbsolute(entry.target), "entry-link-format");
      const destination = posix.normalize(posix.join(posix.dirname(entry.path), entry.target));
      requireSafe(!vendorDistributionType(destination, names, firefoxDescriptor), "entry-link-format");
      validateEntryPath(destination, names, limits, firefoxDescriptor); requireSafe(destination.split("/")[0] === entry.path.split("/")[0], "entry-link-cross-root");
    }
  }
  for (const entry of entries) {
    const parts = entry.path.split("/");
    for (let length = 1; length < parts.length; length++) requireSafe(seen.get(parts.slice(0, length).join("/"))?.type === "directory", "entry-parent");
    if (entry.type !== "symlink") continue;
    let current = entry.path; const visited = new Set();
    while (seen.get(current)?.type === "symlink") {
      requireSafe(!visited.has(current), "entry-link-cycle"); visited.add(current);
      current = posix.normalize(posix.join(posix.dirname(current), seen.get(current).target));
    }
    requireSafe(seen.has(current), "entry-link-missing");
  }
  requireSafe(requiredEngines.every(engine => entries.some(entry => entry.path === roots.find(root => root.engine === engine)?.directory && entry.type === "directory")));
  return { memberCount: entries.length, totalBytes: bytes, fileCount: entries.filter(entry => entry.type === "file").length, symlinkCount: entries.filter(entry => entry.type === "symlink").length };
}

async function fileHash(path) {
  const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex");
}

export async function inspectBrowserCache(cacheDir, metadata, limits = TOOLCHAIN_LIMITS) {
  const absolute = resolve(cacheDir), rootStat = await lstat(absolute);
  requireSafe(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "cache-root-type"); requireSafe((rootStat.mode & 0o7000) === 0, "entry-special-mode"); requireSafe(await realpath(absolute) === absolute, "cache-root-canonical");
  const roots = browserRoots(metadata), allowed = roots.map(root => root.directory), firefoxDescriptor = roots.find(root => root.engine === "firefox"), entries = []; let excludedRegistryLinks = false, runningBytes = 0;
  const top = await readdir(absolute);
  for (const name of top) {
    if (name === ".links") { const info = await lstat(resolve(absolute, name)); requireSafe(info.isDirectory() && !info.isSymbolicLink(), "cache-links-type"); excludedRegistryLinks = true; continue; }
    requireSafe(allowed.includes(name), "cache-top-unexpected");
  }
  requireSafe(requiredEngines.every(engine => top.includes(roots.find(root => root.engine === engine).directory)), "cache-required-engine");
  const presentRoots = roots.filter(root => top.includes(root.directory));
  async function walk(path) {
    const context = { engine: roots.find(root => root.directory === path.split("/")[0])?.engine, index: entries.length, pathBytes: Math.min(Buffer.byteLength(path), TOOLCHAIN_LIMITS.pathBytes + 1), pathDepth: Math.min(path.split("/").length, TOOLCHAIN_LIMITS.depth + 1), type: "unknown" };
    if (path === playwrightPreferences && vendorDistributionType(path, allowed, firefoxDescriptor)) context.reviewedVendorAlias = "firefox-playwright-default-preferences";
    try {
    validateEntryPath(path, allowed, limits, firefoxDescriptor); requireSafe(entries.length < limits.members, "entry-member-cap");
    const full = resolve(absolute, path); requireSafe(relative(absolute, full) !== ".." && !relative(absolute, full).startsWith(`..${sep}`));
    const info = await lstat(full); context.mode = info.mode; context.type = info.isDirectory() ? "directory" : info.isSymbolicLink() ? "symlink" : info.isFile() ? "file" : "unsupported"; requireSafe((info.mode & 0o7000) === 0, "entry-special-mode");
    const vendorType = vendorDistributionType(path, allowed, firefoxDescriptor);
    if (vendorType) requireSafe(context.type === vendorType, "entry-type");
    const mode = info.mode & 0o777;
    if (!info.isSymbolicLink()) requireSafe((mode & 0o022) === 0 && (mode & 0o400) !== 0, "entry-mode");
    if (info.isDirectory()) {
      entries.push({ path, type: "directory", mode, bytes: 0 });
      for (const child of (await readdir(full)).sort()) await walk(`${path}/${child}`);
    } else if (info.isSymbolicLink()) entries.push({ path, type: "symlink", mode, bytes: 0, target: await readlink(full) });
    else {
      requireSafe(info.isFile(), "entry-type"); requireSafe(info.nlink === 1, "entry-hardlink"); requireSafe(info.size <= limits.fileBytes, "entry-file-cap");
      if (path === playwrightPreferences && info.size !== playwrightPreferenceBytes) { context.vendorContentMatches = false; throw new ToolchainContractError("entry-vendor-content"); }
      runningBytes += info.size; requireSafe(runningBytes <= limits.bytes, "entry-byte-cap");
      const sha256 = await fileHash(full), after = await lstat(full);
      if (path === playwrightPreferences) { context.vendorContentMatches = info.size === playwrightPreferenceBytes && sha256 === playwrightPreferenceSha256; requireSafe(context.vendorContentMatches, "entry-vendor-content"); }
      requireSafe(info.size === after.size && info.mtimeMs === after.mtimeMs && info.ino === after.ino, "entry-mutated");
      entries.push({ path, type: "file", mode, bytes: info.size, sha256 });
    }
    } catch (error) { const safe = error instanceof ToolchainContractError ? error : new ToolchainContractError("cache-io"); safe.safeEntry ??= context; throw safe; }
  }
  for (const root of presentRoots.sort((a, b) => a.directory.localeCompare(b.directory))) await walk(root.directory);
  const counts = validateEntries(entries, roots, limits);
  const licenseFiles = entries.filter(entry => entry.type === "file" && /^(?:ABOUT|LICENSE.*|LICENCE.*|COPYING.*|NOTICE.*|THIRD[-_ ]PARTY.*)$/iu.test(posix.basename(entry.path))).map(entry => entry.path);
  requireSafe(licenseFiles.length > 0, "cache-license-missing");
  return { roots: presentRoots, entries, counts, licenseFiles, excludedRegistryLinks };
}

export async function exportBrowserToolchain({ cacheDir, outputDir, metadata, sourceCommit, lockfileSha256, exporterSha256, limits = TOOLCHAIN_LIMITS }) {
  requireSafe(/^[a-f0-9]{40}$/u.test(sourceCommit) && digest.test(lockfileSha256) && digest.test(exporterSha256));
  const cache = resolve(cacheDir), output = resolve(outputDir); requireSafe(output !== cache && !output.startsWith(cache + sep));
  await mkdir(output, { mode: 0o700 }); requireSafe(await realpath(output) === output && !(await lstat(output)).isSymbolicLink());
  execution.stage = "cache-inspection";
  const snapshot = await inspectBrowserCache(cache, metadata, limits), archiveName = "browser-toolchain-ubuntu24.04-x64-playwright1.64.0.tar.gz";
  const list = resolve(output, "members-private.list"); await writeFile(list, snapshot.entries.map(entry => entry.path + "\0").join(""), { mode: 0o600 });
  const archive = resolve(output, archiveName);
  execution.stage = "archive-create";
  try { await run("tar", ["--create", "--gzip", "--file", archive, "--format=posix", "--owner=0", "--group=0", "--numeric-owner", "--mtime=@0", "--pax-option=delete=atime,delete=ctime", "--directory", cache, "--no-recursion", "--null", "--files-from", list], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 }); } catch { throw new ToolchainContractError("archive-command"); }
  const archiveInfo = await stat(archive); requireSafe(archiveInfo.size > 0 && archiveInfo.size <= limits.bytes);
  execution.stage = "archive-stability";
  const after = await inspectBrowserCache(cache, metadata, limits); requireSafe(JSON.stringify(after.entries) === JSON.stringify(snapshot.entries), "entry-mutated");
  const manifest = { schemaVersion: 1, sourceCommit, platform: TOOLCHAIN_PLATFORM, versions, lockfileSha256, exporterSha256, archive: { file: archiveName, bytes: archiveInfo.size, sha256: await fileHash(archive) }, roots: snapshot.roots, counts: snapshot.counts, excludedRegistryLinks: snapshot.excludedRegistryLinks, licenseFiles: snapshot.licenseFiles, entries: snapshot.entries };
  execution.stage = "manifest-write";
  await writeFile(resolve(output, "browser-toolchain.manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  await writeFile(resolve(output, "browser-toolchain.sha256"), `${manifest.archive.sha256}  ${archiveName}\n`, { mode: 0o600 });
  return manifest;
}

async function main() {
  requireSafe(process.platform === "linux" && process.arch === "x64" && process.versions.node === versions.node, "runtime-identity");
  const release = await readFile("/etc/os-release", "utf8"); requireSafe(/^ID=ubuntu$/mu.test(release) && /^VERSION_ID="24\.04"$/mu.test(release));
  const args = process.argv.slice(2); requireSafe(args.length === 6 && args[0] === "--cache-dir" && args[2] === "--output-dir" && args[4] === "--source-commit");
  execution.stage = "identity"; execution.cacheDir = args[1];
  const sourceCommit = args[5], actualCommit = (await run("git", ["rev-parse", "HEAD"], { maxBuffer: 4096 })).stdout.trim(); requireSafe(sourceCommit === actualCommit, "source-identity");
  const packageInfo = JSON.parse(await readFile("package.json", "utf8")); requireSafe(packageInfo.packageManager === `pnpm@${versions.pnpm}` && packageInfo.devDependencies?.["@playwright/test"] === versions.playwright);
  const core = resolve("node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core"); requireSafe(JSON.parse(await readFile(resolve(core, "package.json"), "utf8")).version === versions.playwright);
  execution.metadata = JSON.parse(await readFile(resolve(core, "browsers.json"), "utf8"));
  const manifest = await exportBrowserToolchain({ cacheDir: args[1], outputDir: args[3], sourceCommit, metadata: execution.metadata, lockfileSha256: await fileHash("pnpm-lock.yaml"), exporterSha256: await fileHash(process.argv[1]) });
  console.log(JSON.stringify({ state: "exported", sourceCommit, platform: manifest.platform, roots: manifest.roots.map(root => root.engine), ...manifest.counts, archiveBytes: manifest.archive.bytes, archiveSha256: manifest.archive.sha256, manifestSha256: await fileHash(resolve(args[3], "browser-toolchain.manifest.json")) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(async error => { console.error(JSON.stringify(safeExportFailure(error, execution.stage, await diagnosticCacheMetadata(execution.cacheDir, execution.metadata)))); console.error("Browser toolchain export failed; no raw paths, environment or logs exported."); process.exitCode = 1; });
}
