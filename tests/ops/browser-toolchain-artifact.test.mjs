import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdtemp, mkdir, writeFile, symlink, link, readFile, rm, chmod, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { browserRoots, validateEntryPath, validateEntries, inspectBrowserCache, exportBrowserToolchain, TOOLCHAIN_LIMITS } from "../../scripts/prepare-browser-toolchain-artifact.mjs";

const run = promisify(execFile);
const metadata = { browsers: [{ name: "chromium", revision: "1248", browserVersion: "156.0.8078.4" }, { name: "firefox", revision: "1555", browserVersion: "157.0" }, { name: "webkit", revision: "2370", browserVersion: "27.2" }, { name: "ffmpeg", revision: "1011" }, { name: "chromium-headless-shell", revision: "1248", browserVersion: "156.0.8078.4" }] };
const roots = browserRoots(metadata), required = roots.filter(root => ["chromium", "firefox", "webkit"].includes(root.engine));
const sha = createHash("sha256").update("official-fixture-license").digest("hex");
const directory = path => ({ path, type: "directory", mode: 0o755, bytes: 0 });
const file = path => ({ path, type: "file", mode: 0o644, bytes: 24, sha256: sha });
const entries = () => required.flatMap(root => [directory(root.directory), file(`${root.directory}/LICENSE`)]);
const rejected = action => assert.throws(action, /^Error: Browser toolchain contract rejected\.$/u);

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
