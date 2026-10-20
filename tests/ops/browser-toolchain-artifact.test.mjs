import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdtemp, mkdir, writeFile, symlink, link, readFile, rm, chmod, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { browserRoots, validateEntryPath, validateEntries, inspectBrowserCache, exportBrowserToolchain, safeExportFailure, TOOLCHAIN_LIMITS, TOOLCHAIN_VERSIONS, TOOLCHAIN_BROWSER_METADATA_SHA256 } from "../../scripts/prepare-browser-toolchain-artifact.mjs";

const run = promisify(execFile);
const metadata = { browsers: [{ name: "chromium", revision: "1248", browserVersion: "156.0.8078.4" }, { name: "firefox", revision: "1555", browserVersion: "157.0" }, { name: "webkit", revision: "2370", browserVersion: "27.2" }, { name: "ffmpeg", revision: "1013" }, { name: "chromium-headless-shell", revision: "1248", browserVersion: "156.0.8078.4" }] };
const roots = browserRoots(metadata), required = roots.filter(root => ["chromium", "firefox", "webkit"].includes(root.engine));
const sha = createHash("sha256").update("official-fixture-license").digest("hex");
const directory = path => ({ path, type: "directory", mode: 0o755, bytes: 0 });
const file = path => ({ path, type: "file", mode: 0o644, bytes: 24, sha256: sha });
const entries = () => required.flatMap(root => [directory(root.directory), file(`${root.directory}/LICENSE`)]);
const rejected = action => assert.throws(action, /^Error: Browser toolchain contract rejected\.$/u);

test("current exporter binds the selected versions and actual installed vendor browser descriptors", async () => {
  assert.deepEqual(TOOLCHAIN_VERSIONS, { node: "24.22.0", pnpm: "12.14.0", playwright: "1.64.1" });
  const packageInfo = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(packageInfo.packageManager, `pnpm@${TOOLCHAIN_VERSIONS.pnpm}`);
  assert.equal(packageInfo.devDependencies["@playwright/test"], TOOLCHAIN_VERSIONS.playwright);
  const core = new URL(`../../node_modules/.pnpm/playwright-core@${TOOLCHAIN_VERSIONS.playwright}/node_modules/playwright-core/`, import.meta.url);
  assert.equal(JSON.parse(await readFile(new URL("package.json", core), "utf8")).version, TOOLCHAIN_VERSIONS.playwright);
  const vendorMetadata = await readFile(new URL("browsers.json", core));
  assert.equal(createHash("sha256").update(vendorMetadata).digest("hex"), TOOLCHAIN_BROWSER_METADATA_SHA256);
  const actualRoots = browserRoots(JSON.parse(vendorMetadata.toString("utf8")));
  assert.deepEqual(actualRoots.sort((a, b) => a.engine.localeCompare(b.engine)), [...roots].sort((a, b) => a.engine.localeCompare(b.engine)));
});

test("required official engines and Ubuntu revision override are bound precisely", () => {
  assert.equal(roots.length, 5);
  const copy = structuredClone(metadata); copy.browsers[2].revisionOverrides = { "ubuntu24.04-x64": "2371", "ubuntu24.04-arm64": "9999" };
  const overridden = browserRoots(copy).find(root => root.engine === "webkit");
  assert.equal(overridden.directory, "webkit_ubuntu24.04_x64_special-2371");
  assert.equal(Object.hasOwn(overridden, "browserVersion"), false);
  rejected(() => browserRoots({ browsers: metadata.browsers.filter(root => root.name !== "firefox") }));
  rejected(() => browserRoots({ browsers: [...metadata.browsers, metadata.browsers[0]] }));
  copy.browsers[0].revision = "1248/../../private"; rejected(() => browserRoots(copy));
});

test("path boundaries reject traversal, prefixes, controls and secret/profile canaries", () => {
  const known = roots.map(root => root.directory);
  assert.equal(validateEntryPath("chromium-1248/LICENSE", known), "chromium-1248/LICENSE");
  for (const path of ["/chromium-1248/LICENSE", "chromium-1248/../private", "chromium-1248//LICENSE", "chromium-1248\\LICENSE", "chromium-1248/LICENSE\nprivate", "chromium-12480/LICENSE", "unlisted-1248/LICENSE", "chromium-1248/.env", "chromium-1248/.local/file", "chromium-1248/Default/Cookies", "chromium-1248/User Data/file", "chromium-1248/GITHUB_TOKEN", "chromium-1248/storage-state.json", "firefox-1555/Login Data"]) rejected(() => validateEntryPath(path, known));
});

test("only six exact pinned Firefox GTK branding members bypass the Default segment guard", () => {
  const known = roots.map(root => root.directory), base = "firefox-1555/firefox/browser/chrome/icons/default", descriptor = roots.find(root => root.engine === "firefox");
  const validate = path => validateEntryPath(path, known, TOOLCHAIN_LIMITS, descriptor);
  assert.equal(validate(base), base);
  for (const size of [16, 32, 48, 64, 128]) assert.equal(validate(`${base}/default${size}.png`), `${base}/default${size}.png`);
  for (const path of [base.replace("1555", "1556"), base.replace("default", "Default"), `${base}/Cookies`, `${base}/default256.png`, `${base}/default16.png/child`, `${base}/.env`, "firefox-1555/Default/Cookies", "firefox-1555/firefox/browser/Default", "chromium-1248/browser/chrome/icons/default"]) rejected(() => validate(path));
  rejected(() => validateEntryPath(base, known));
  for (const patch of [{ engine: "chromium" }, { revision: "1556" }, { browserVersion: "158.0" }, { directory: "firefox-1556" }]) rejected(() => validateEntryPath(base, known, TOOLCHAIN_LIMITS, { ...descriptor, ...patch }));
  rejected(() => validateEntryPath(base, known.filter(root => root !== "firefox-1555")));
  const parents = ["firefox-1555/firefox", "firefox-1555/firefox/browser", "firefox-1555/firefox/browser/chrome", "firefox-1555/firefox/browser/chrome/icons", base].map(directory);
  const valid = [...entries(), ...parents, file(`${base}/default16.png`)];
  assert.equal(validateEntries(valid, roots).fileCount, 4);
  for (const path of [base, `${base}/default16.png`]) rejected(() => validateEntries(valid.map(entry => entry.path === path ? { ...entry, type: "symlink", bytes: 0, target: "LICENSE" } : entry), roots));
  rejected(() => validateEntries([...valid, { path: "firefox-1555/icon-alias", type: "symlink", mode: 0o777, bytes: 0, target: "firefox/browser/chrome/icons/default/default16.png" }], roots));
  rejected(() => validateEntries(valid.map(entry => entry.path === base ? { ...entry, mode: 0o777 } : entry), roots));
});

test("real pinned Firefox branding files export without admitting profile data or icon symlinks", { skip: process.platform !== "linux" ? "Unix filesystem contract runs on Linux." : false }, async () => {
  await fixture(async ({ cache, root }) => {
    const base = join(cache, "firefox-1555/firefox/browser/chrome/icons/default");
    await mkdir(base, { recursive: true, mode: 0o755 });
    for (const size of [16, 32, 48, 64, 128]) await writeFile(join(base, `default${size}.png`), "official-branding-fixture", { mode: 0o644 });
    const manifest = await exportBrowserToolchain({ cacheDir: cache, outputDir: join(root, "branding-export"), metadata, sourceCommit: "a".repeat(40), lockfileSha256: "b".repeat(64), exporterSha256: "c".repeat(64) });
    assert.equal(manifest.entries.filter(entry => entry.path.includes("/icons/default/")).length, 5);
    await writeFile(join(base, "Cookies"), "private-profile-canary");
    await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
  await fixture(async ({ cache }) => {
    const parent = join(cache, "firefox-1555/firefox/browser/chrome/icons"); await mkdir(parent, { recursive: true, mode: 0o755 });
    await symlink("../../../../LICENSE", join(parent, "default"));
    await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
});

test("pinned default application preferences admit only the packaged directory and three named source files", () => {
  const known = roots.map(root => root.directory), descriptor = roots.find(root => root.engine === "firefox"), base = "firefox-1555/firefox/browser/defaults/preferences";
  const validate = path => validateEntryPath(path, known, TOOLCHAIN_LIMITS, descriptor);
  assert.equal(validate(base), base);
  for (const name of ["debugger.js", "firefox.js", "firefox-branding.js"]) assert.equal(validate(`${base}/${name}`), `${base}/${name}`);
  for (const path of [base.replace("preferences", "Preferences"), `${base}/prefs.js`, `${base}/user.js`, `${base}/Cookies`, `${base}/credentials.json`, `${base}/firefox.js/child`, "firefox-1555/Preferences", "firefox-1555/Default/Preferences", base.replace("1555", "1556")]) rejected(() => validate(path));
  rejected(() => validateEntryPath(base, known));
  const parents = ["firefox-1555/firefox", "firefox-1555/firefox/browser", "firefox-1555/firefox/browser/defaults", base].map(directory);
  const valid = [...entries(), ...parents, file(`${base}/firefox.js`)];
  assert.equal(validateEntries(valid, roots).fileCount, 4);
  for (const path of [base, `${base}/firefox.js`]) rejected(() => validateEntries(valid.map(entry => entry.path === path ? { ...entry, type: "symlink", bytes: 0, target: "LICENSE" } : entry), roots));
  rejected(() => validateEntries([...valid, { path: "firefox-1555/pref-alias", type: "symlink", mode: 0o777, bytes: 0, target: "firefox/browser/defaults/preferences/firefox.js" }], roots));
});

test("real vendor preferences retain normal mode/hash checks and reject user preference names", { skip: process.platform !== "linux" ? "Unix filesystem contract runs on Linux." : false }, async () => {
  await fixture(async ({ cache, root }) => {
    const base = join(cache, "firefox-1555/firefox/browser/defaults/preferences"); await mkdir(base, { recursive: true, mode: 0o755 });
    for (const name of ["debugger.js", "firefox.js", "firefox-branding.js"]) await writeFile(join(base, name), "official-default-preference-fixture", { mode: 0o644 });
    const manifest = await exportBrowserToolchain({ cacheDir: cache, outputDir: join(root, "preferences-export"), metadata, sourceCommit: "a".repeat(40), lockfileSha256: "b".repeat(64), exporterSha256: "c".repeat(64) });
    assert.equal(manifest.entries.filter(entry => entry.path.includes("/defaults/preferences/")).length, 3);
    await chmod(join(base, "firefox.js"), 0o666); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
  await fixture(async ({ cache }) => {
    const base = join(cache, "firefox-1555/firefox/browser/defaults/preferences"); await mkdir(base, { recursive: true, mode: 0o755 });
    await writeFile(join(base, "prefs.js"), "private-user-preference-canary", { mode: 0o644 }); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
});

test("exact official Playwright preference source is required in addition to path and metadata", async () => {
  const bytes = await readFile(new URL("../fixtures/firefox-playwright-preferences-1.64.1.txt", import.meta.url));
  const digest = createHash("sha256").update(bytes).digest("hex"), base = "firefox-1555/firefox/browser/defaults/preferences", path = `${base}/00-playwright-prefs.js`;
  assert.equal(bytes.length, 160); assert.equal(digest, "8c2d32801a924f2c2b133f1191d01213513c86e8d1e42e144e9cb1015ea71084");
  const parents = ["firefox-1555/firefox", "firefox-1555/firefox/browser", "firefox-1555/firefox/browser/defaults", base].map(directory);
  const asset = { ...file(path), bytes: bytes.length, sha256: digest }, valid = [...entries(), ...parents, asset];
  assert.equal(validateEntries(valid, roots).fileCount, 4);
  for (const patch of [{ bytes: 159 }, { bytes: 161 }, { sha256: "a".repeat(64) }, { type: "symlink", bytes: 0, target: "LICENSE" }]) rejected(() => validateEntries([...entries(), ...parents, { ...asset, ...patch }], roots));
  rejected(() => validateEntries(valid, roots.map(root => root.engine === "firefox" ? { ...root, browserVersion: "158.0" } : root)));
});

test("real source-bound preference emits only a closed alias/content boolean on tampering", { skip: process.platform !== "linux" ? "Unix filesystem contract runs on Linux." : false }, async () => {
  await fixture(async ({ cache, root }) => {
    const base = join(cache, "firefox-1555/firefox/browser/defaults/preferences"), path = join(base, "00-playwright-prefs.js");
    await mkdir(base, { recursive: true, mode: 0o755 });
    const bytes = await readFile(new URL("../fixtures/firefox-playwright-preferences-1.64.1.txt", import.meta.url));
    await writeFile(path, bytes, { mode: 0o644 });
    const manifest = await exportBrowserToolchain({ cacheDir: cache, outputDir: join(root, "source-bound-export"), metadata, sourceCommit: "a".repeat(40), lockfileSha256: "b".repeat(64), exporterSha256: "c".repeat(64) });
    assert.equal(manifest.entries.find(entry => entry.path.endsWith("/00-playwright-prefs.js"))?.bytes, 160);
    const changed = Buffer.from(bytes); changed[0] ^= 1; await writeFile(path, changed);
    await assert.rejects(inspectBrowserCache(cache, metadata), error => {
      const record = safeExportFailure(error, "cache-inspection"); assert.equal(record.code, "entry-vendor-content");
      assert.equal(record.entry.reviewedVendorAlias, "firefox-playwright-default-preferences"); assert.equal(record.entry.vendorContentMatches, false);
      assert.equal(JSON.stringify(record).includes("00-playwright-prefs.js"), false); assert.equal(JSON.stringify(record).includes(cache), false); return true;
    });
    await writeFile(path, Buffer.concat([bytes, Buffer.from("\n")])); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
});

test("member identity, parent directories, types and permission modes are fail closed", () => {
  assert.deepEqual(validateEntries(entries(), roots), { memberCount: 6, totalBytes: 72, fileCount: 3, symlinkCount: 0 });
  rejected(() => validateEntries([...entries(), file("chromium-1248/LICENSE")], roots));
  rejected(() => validateEntries([...entries(), file("chromium-1248/missing-parent/file")], roots));
  for (const patch of [{ type: "fifo" }, { mode: 0o666 }, { mode: 0o4755 }, { sha256: "not-a-digest" }, { bytes: -1 }]) {
    const copy = entries(); copy[1] = { ...copy[1], ...patch }; rejected(() => validateEntries(copy, roots));
  }
});

test("entry count, total bytes, per-file bytes and name bounds stop oversized inputs", () => {
  for (const limits of [{ ...TOOLCHAIN_LIMITS, members: 5 }, { ...TOOLCHAIN_LIMITS, bytes: 71 }, { ...TOOLCHAIN_LIMITS, fileBytes: 23 }]) rejected(() => validateEntries(entries(), roots, limits));
  rejected(() => validateEntryPath("chromium-1248/" + "a".repeat(1024), roots.map(root => root.directory)));
  rejected(() => validateEntryPath("chromium-1248/" + "a/".repeat(32) + "file", roots.map(root => root.directory)));
});

test("links retain bounded relative targets and reject escape, cross-engine, cycle or dangling data", () => {
  const link = { path: "chromium-1248/license-link", type: "symlink", mode: 0o777, bytes: 0, target: "LICENSE" };
  assert.equal(validateEntries([...entries(), link], roots).symlinkCount, 1);
  for (const target of ["/etc/passwd", "../../private", "../firefox-1555/LICENSE", "missing", "license-link", "LICENSE\nprivate"]) rejected(() => validateEntries([...entries(), { ...link, target }], roots));
  rejected(() => validateEntries([...entries(), { ...link, target: "second" }, { ...link, path: "chromium-1248/second", target: "license-link" }], roots));
});

async function fixture(callback) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, "browser-toolchain-contract-")); const cache = join(root, "cache");
  try {
    await mkdir(cache, { mode: 0o700 });
    for (const item of required) { await mkdir(join(cache, item.directory), { mode: 0o755 }); await writeFile(join(cache, item.directory, "LICENSE"), "official-fixture-license", { mode: 0o644 }); }
    return await callback({ root, cache });
  } finally {
    const target = resolve(root);
    assert.equal(dirname(target), parent, "Fixture cleanup must remain a direct child of the verified temporary directory.");
    assert.equal(basename(target).startsWith("browser-toolchain-contract-"), true);
    assert.equal(await realpath(target), target, "A replaced/symlinked fixture root must never be recursively removed.");
    await rm(target, { recursive: true, force: true });
  }
}
const linuxOnly = { skip: process.platform !== "linux" ? "Real Unix mode/link/tar contract runs on the Linux generator/CI." : false };

test("failure evidence retains only closed stages/codes and bounded metadata, never canary error or fields", () => {
  const canary = "PRIVATE-AUTH-BODY-CANARY";
  const ordinary = new Error(canary); ordinary.path = canary;
  assert.deepEqual(safeExportFailure(ordinary, canary, null), { event: "browser-toolchain.export.failed", stage: "unknown", code: "unexpected-operation", cache: { state: "unavailable" } });
  let rejectedPath;
  try { validateEntryPath("chromium-1248/Cookies", roots.map(root => root.directory)); } catch (error) { rejectedPath = error; }
  rejectedPath.safeEntry = { engine: "chromium", type: "file", mode: 0o100644, index: 3, pathBytes: 21, pathDepth: 2, path: canary, target: canary, body: canary };
  const result = safeExportFailure(rejectedPath, "cache-inspection", { state: "collected", topEntryCount: 6, topEntryLimitReached: false, registryLinksPresent: true, knownRoots: [{ engine: "chromium", present: true, path: canary }, { engine: canary, present: true }], environment: canary });
  assert.equal(result.code, "entry-path-private-or-traversal"); assert.equal(result.entry.engine, "chromium"); assert.deepEqual(result.cache.knownRoots, [{ engine: "chromium", present: true }]);
  assert.equal(JSON.stringify(result).includes(canary), false);
  rejectedPath.safeCode = canary; rejectedPath.safeEntry.index = -1; rejectedPath.safeEntry.mode = 1e9;
  const tampered = safeExportFailure(rejectedPath, "identity", []); assert.equal(tampered.code, "unexpected-operation"); assert.equal(Object.hasOwn(tampered.entry, "index"), false); assert.equal(Object.hasOwn(tampered.entry, "mode"), false);
});

test("real rejected vendor-shaped mode fixture emits exact guard/engine/metrics without a filename", linuxOnly, async () => {
  await fixture(async ({ cache }) => {
    await chmod(join(cache, "chromium-1248", "LICENSE"), 0o666);
    await assert.rejects(inspectBrowserCache(cache, metadata), error => {
      const result = safeExportFailure(error, "cache-inspection"); assert.equal(result.code, "entry-mode"); assert.equal(result.entry.engine, "chromium"); assert.equal(result.entry.type, "file"); assert.equal(result.entry.mode & 0o777, 0o666);
      assert.equal(JSON.stringify(result).includes("LICENSE"), false); assert.equal(JSON.stringify(result).includes(cache), false); return true;
    });
  });
});

test("real filesystem collector excludes only registry links and rejects unknown/profile members", linuxOnly, async () => {
  await fixture(async ({ cache }) => {
    await mkdir(join(cache, ".links")); await writeFile(join(cache, ".links", "installer-pointer"), "not-exported-private-path-canary");
    const result = await inspectBrowserCache(cache, metadata); assert.equal(result.excludedRegistryLinks, true); assert.equal(result.entries.some(entry => entry.path.includes(".links")), false);
    await writeFile(join(cache, "unknown-secret-file"), "private-canary"); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
  await fixture(async ({ cache }) => { await writeFile(join(cache, "chromium-1248", "Cookies"), "private-canary"); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u); });
  await fixture(async ({ cache }) => { await chmod(join(cache, "chromium-1248", "LICENSE"), 0o4755); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u); });
});

test("real cache link escape is rejected without following the outside target", linuxOnly, async () => {
  await fixture(async ({ root, cache }) => {
    await writeFile(join(root, "outside-secret"), "private-canary"); await symlink("../../outside-secret", join(cache, "chromium-1248", "escape"));
    await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u);
  });
  await fixture(async ({ root, cache }) => { await symlink(root, join(cache, ".links")); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u); });
  await fixture(async ({ root, cache }) => { await writeFile(join(root, "outside-secret"), "private-canary"); await link(join(root, "outside-secret"), join(cache, "chromium-1248", "hardlink")); await assert.rejects(inspectBrowserCache(cache, metadata), /contract rejected/u); });
});

test("bounded fixture archive preserves licenses/hash/modes/relative links and no identities or registry pointers", linuxOnly, async () => {
  await fixture(async ({ root, cache }) => {
    await mkdir(join(cache, ".links")); await writeFile(join(cache, ".links", "pointer"), "private-canary");
    await symlink("LICENSE", join(cache, "chromium-1248", "license-link"));
    const output = join(root, "export"), manifest = await exportBrowserToolchain({ cacheDir: cache, outputDir: output, metadata, sourceCommit: "a".repeat(40), lockfileSha256: "b".repeat(64), exporterSha256: "c".repeat(64) });
    assert.deepEqual(manifest.versions, { node: "24.22.0", pnpm: "12.14.0", playwright: "1.64.1" });
    assert.equal(manifest.archive.file, "browser-toolchain-ubuntu24.04-x64-playwright1.64.1.tar.gz");
    const bytes = await readFile(join(output, manifest.archive.file)); assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.archive.sha256);
    assert.equal(manifest.counts.fileCount, 3); assert.equal(manifest.counts.symlinkCount, 1); assert.equal(manifest.licenseFiles.length, 3);
    const listing = (await run("tar", ["--list", "--gzip", "--file", join(output, manifest.archive.file)])).stdout;
    assert.equal(listing.includes(".links"), false); assert.equal(listing.includes("private-canary"), false); assert.equal(listing.includes("license-link"), true);
    const verbose = (await run("tar", ["--list", "--verbose", "--numeric-owner", "--gzip", "--file", join(output, manifest.archive.file)])).stdout;
    assert.match(verbose, /0\/0/u); assert.doesNotMatch(verbose, /runner|private-canary/u);
    const tarBytes = gunzipSync(bytes);
    for (let offset = 0; offset + 512 <= tarBytes.length; ) {
      const header = tarBytes.subarray(offset, offset + 512);
      if (header.every(byte => byte === 0)) break;
      const field = (start, length) => header.subarray(start, start + length).toString().replaceAll("\0", "").trim();
      assert.equal(Number.parseInt(field(108, 8) || "0", 8), 0);
      assert.equal(Number.parseInt(field(116, 8) || "0", 8), 0);
      assert.equal(field(265, 32), ""); assert.equal(field(297, 32), "");
      const size = Number.parseInt(field(124, 12) || "0", 8);
      assert.equal(Number.isFinite(size), true); offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.equal(JSON.stringify(manifest).includes(root), false);
    await assert.rejects(exportBrowserToolchain({ cacheDir: cache, outputDir: join(cache, "inside"), metadata, sourceCommit: "a".repeat(40), lockfileSha256: "b".repeat(64), exporterSha256: "c".repeat(64) }), /contract rejected/u);
  });
});
