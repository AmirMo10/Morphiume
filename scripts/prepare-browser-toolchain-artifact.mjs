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
const digest = /^[a-f0-9]{64}$/u;
function requireSafe(condition) { if (!condition) throw new Error("Browser toolchain contract rejected."); }

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

export function validateEntryPath(path, allowedRoots, limits = TOOLCHAIN_LIMITS) {
  requireSafe(typeof path === "string" && Buffer.byteLength(path) <= limits.pathBytes && !/[\\\x00-\x1f\x7f]/u.test(path));
  const parts = path.split("/");
  requireSafe(parts.length <= limits.depth && parts.every(part => part && part !== "." && part !== ".." && !forbiddenSegments.test(part)));
  requireSafe(allowedRoots.includes(parts[0]) && parts.every(part => !part.startsWith(".")));
  return path;
}

export function validateEntries(entries, roots, limits = TOOLCHAIN_LIMITS) {
  requireSafe(Array.isArray(entries) && entries.length > 0 && entries.length <= limits.members);
  const names = roots.map(root => root.directory), seen = new Map(); let bytes = 0;
  for (const entry of entries) {
    requireSafe(entry && typeof entry === "object" && !Array.isArray(entry));
    validateEntryPath(entry.path, names, limits); requireSafe(!seen.has(entry.path)); seen.set(entry.path, entry);
    requireSafe(["file", "directory", "symlink"].includes(entry.type));
    requireSafe(Number.isInteger(entry.mode) && entry.mode >= 0 && entry.mode <= 0o777);
    if (entry.type !== "symlink") requireSafe((entry.mode & 0o022) === 0 && (entry.mode & 0o400) !== 0);
    if (entry.type === "file") {
      requireSafe(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= limits.fileBytes && typeof entry.sha256 === "string" && digest.test(entry.sha256));
      bytes += entry.bytes; requireSafe(bytes <= limits.bytes);
    } else requireSafe(entry.bytes === 0);
    if (entry.type === "symlink") {
      requireSafe(typeof entry.target === "string" && entry.target && Buffer.byteLength(entry.target) <= limits.pathBytes && !/[\\\x00-\x1f\x7f]/u.test(entry.target) && !posix.isAbsolute(entry.target));
      const destination = posix.normalize(posix.join(posix.dirname(entry.path), entry.target));
      validateEntryPath(destination, names, limits); requireSafe(destination.split("/")[0] === entry.path.split("/")[0]);
    }
  }
  for (const entry of entries) {
    const parts = entry.path.split("/");
    for (let length = 1; length < parts.length; length++) requireSafe(seen.get(parts.slice(0, length).join("/"))?.type === "directory");
    if (entry.type !== "symlink") continue;
    let current = entry.path; const visited = new Set();
    while (seen.get(current)?.type === "symlink") {
      requireSafe(!visited.has(current)); visited.add(current);
      current = posix.normalize(posix.join(posix.dirname(current), seen.get(current).target));
    }
    requireSafe(seen.has(current));
  }
  requireSafe(requiredEngines.every(engine => entries.some(entry => entry.path === roots.find(root => root.engine === engine)?.directory && entry.type === "directory")));
  return { memberCount: entries.length, totalBytes: bytes, fileCount: entries.filter(entry => entry.type === "file").length, symlinkCount: entries.filter(entry => entry.type === "symlink").length };
}

async function fileHash(path) {
  const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex");
}

export async function inspectBrowserCache(cacheDir, metadata, limits = TOOLCHAIN_LIMITS) {
  const absolute = resolve(cacheDir), rootStat = await lstat(absolute);
  requireSafe(rootStat.isDirectory() && !rootStat.isSymbolicLink() && (rootStat.mode & 0o7000) === 0 && await realpath(absolute) === absolute);
  const roots = browserRoots(metadata), allowed = roots.map(root => root.directory), entries = []; let excludedRegistryLinks = false, runningBytes = 0;
  const top = await readdir(absolute);
  for (const name of top) {
    if (name === ".links") { const info = await lstat(resolve(absolute, name)); requireSafe(info.isDirectory() && !info.isSymbolicLink()); excludedRegistryLinks = true; continue; }
    requireSafe(allowed.includes(name));
  }
  requireSafe(requiredEngines.every(engine => top.includes(roots.find(root => root.engine === engine).directory)));
  const presentRoots = roots.filter(root => top.includes(root.directory));
  async function walk(path) {
    validateEntryPath(path, allowed, limits); requireSafe(entries.length < limits.members);
    const full = resolve(absolute, path); requireSafe(relative(absolute, full) !== ".." && !relative(absolute, full).startsWith(`..${sep}`));
    const info = await lstat(full); requireSafe((info.mode & 0o7000) === 0);
    const mode = info.mode & 0o777;
    if (info.isDirectory()) {
      entries.push({ path, type: "directory", mode, bytes: 0 });
      for (const child of (await readdir(full)).sort()) await walk(`${path}/${child}`);
    } else if (info.isSymbolicLink()) entries.push({ path, type: "symlink", mode, bytes: 0, target: await readlink(full) });
    else {
      requireSafe(info.isFile() && info.nlink === 1 && info.size <= limits.fileBytes);
      runningBytes += info.size; requireSafe(runningBytes <= limits.bytes);
      const sha256 = await fileHash(full), after = await lstat(full);
      requireSafe(info.size === after.size && info.mtimeMs === after.mtimeMs && info.ino === after.ino);
      entries.push({ path, type: "file", mode, bytes: info.size, sha256 });
    }
  }
  for (const root of presentRoots.sort((a, b) => a.directory.localeCompare(b.directory))) await walk(root.directory);
  const counts = validateEntries(entries, roots, limits);
  const licenseFiles = entries.filter(entry => entry.type === "file" && /^(?:ABOUT|LICENSE.*|LICENCE.*|COPYING.*|NOTICE.*|THIRD[-_ ]PARTY.*)$/iu.test(posix.basename(entry.path))).map(entry => entry.path);
  requireSafe(licenseFiles.length > 0);
  return { roots: presentRoots, entries, counts, licenseFiles, excludedRegistryLinks };
}

export async function exportBrowserToolchain({ cacheDir, outputDir, metadata, sourceCommit, lockfileSha256, exporterSha256, limits = TOOLCHAIN_LIMITS }) {
  requireSafe(/^[a-f0-9]{40}$/u.test(sourceCommit) && digest.test(lockfileSha256) && digest.test(exporterSha256));
  const cache = resolve(cacheDir), output = resolve(outputDir); requireSafe(output !== cache && !output.startsWith(cache + sep));
  await mkdir(output, { mode: 0o700 }); requireSafe(await realpath(output) === output && !(await lstat(output)).isSymbolicLink());
  const snapshot = await inspectBrowserCache(cache, metadata, limits), archiveName = "browser-toolchain-ubuntu24.04-x64-playwright1.64.0.tar.gz";
  const list = resolve(output, "members-private.list"); await writeFile(list, snapshot.entries.map(entry => entry.path + "\0").join(""), { mode: 0o600 });
  const archive = resolve(output, archiveName);
  await run("tar", ["--create", "--gzip", "--file", archive, "--format=posix", "--owner=0", "--group=0", "--numeric-owner", "--mtime=@0", "--pax-option=delete=atime,delete=ctime", "--directory", cache, "--no-recursion", "--null", "--files-from", list], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 });
  const archiveInfo = await stat(archive); requireSafe(archiveInfo.size > 0 && archiveInfo.size <= limits.bytes);
  const after = await inspectBrowserCache(cache, metadata, limits); requireSafe(JSON.stringify(after.entries) === JSON.stringify(snapshot.entries));
  const manifest = { schemaVersion: 1, sourceCommit, platform: TOOLCHAIN_PLATFORM, versions, lockfileSha256, exporterSha256, archive: { file: archiveName, bytes: archiveInfo.size, sha256: await fileHash(archive) }, roots: snapshot.roots, counts: snapshot.counts, excludedRegistryLinks: snapshot.excludedRegistryLinks, licenseFiles: snapshot.licenseFiles, entries: snapshot.entries };
  await writeFile(resolve(output, "browser-toolchain.manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  await writeFile(resolve(output, "browser-toolchain.sha256"), `${manifest.archive.sha256}  ${archiveName}\n`, { mode: 0o600 });
  return manifest;
}

async function main() {
  requireSafe(process.platform === "linux" && process.arch === "x64" && process.versions.node === versions.node);
  const release = await readFile("/etc/os-release", "utf8"); requireSafe(/^ID=ubuntu$/mu.test(release) && /^VERSION_ID="24\.04"$/mu.test(release));
  const args = process.argv.slice(2); requireSafe(args.length === 6 && args[0] === "--cache-dir" && args[2] === "--output-dir" && args[4] === "--source-commit");
  const sourceCommit = args[5], actualCommit = (await run("git", ["rev-parse", "HEAD"], { maxBuffer: 4096 })).stdout.trim(); requireSafe(sourceCommit === actualCommit);
  const packageInfo = JSON.parse(await readFile("package.json", "utf8")); requireSafe(packageInfo.packageManager === `pnpm@${versions.pnpm}` && packageInfo.devDependencies?.["@playwright/test"] === versions.playwright);
  const core = resolve("node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core"); requireSafe(JSON.parse(await readFile(resolve(core, "package.json"), "utf8")).version === versions.playwright);
  const manifest = await exportBrowserToolchain({ cacheDir: args[1], outputDir: args[3], sourceCommit, metadata: JSON.parse(await readFile(resolve(core, "browsers.json"), "utf8")), lockfileSha256: await fileHash("pnpm-lock.yaml"), exporterSha256: await fileHash(process.argv[1]) });
  console.log(JSON.stringify({ state: "exported", sourceCommit, platform: manifest.platform, roots: manifest.roots.map(root => root.engine), ...manifest.counts, archiveBytes: manifest.archive.bytes, archiveSha256: manifest.archive.sha256, manifestSha256: await fileHash(resolve(args[3], "browser-toolchain.manifest.json")) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Browser toolchain export failed; no raw paths, environment or logs exported."); process.exitCode = 1; });
}
