import { cp, lstat, mkdir, readdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

// Next tracing covers the web server. The external CLI bundles need their own
// dependency closure, without bringing tsx/esbuild or the whole install along.
const base = process.cwd();
const args = process.argv.slice(2);
let output = ".next/standalone";
if (args[0] === "--output") {
  output = args[1];
  args.splice(0, 2);
}
if (!output) throw new Error("A trace output directory is required");
const destination = resolve(base, output);
const destinationRelative = relative(base, destination);
if (!destinationRelative || destinationRelative.startsWith(`..${sep}`) || isAbsolute(destinationRelative) || destinationRelative.startsWith("node_modules")) {
  throw new Error("Trace output must be a separate directory inside the build context");
}
const entries = args.length ? args : ["dist-runtime/worker.mjs", "dist-runtime/migrate.mjs", "dist-runtime/seed.mjs", "dist-runtime/private-preview-operator.mjs"];
const require = createRequire(resolve(base, "package.json"));
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
const { fileList, warnings, reasons } = await nodeFileTrace(entries.map(file => resolve(base, file)), {
  base, processCwd: base, conditions: ["node", "react-server", "production"],
});
const optionalImports = ["pg-native", "cloudflare:sockets", "@opentelemetry/api (BetterAuth optional instrumentation only)"];
const unresolved = [...warnings].filter(warning => {
  if (/^Failed to resolve dependency "pg-native":/.test(warning.message)) return false;
  // BetterAuth core1.7.7 declares this peer optional and catches its import,
  // falling back to instrumentation/noop.mjs. Do not exempt other importers.
  if (/^Failed to resolve dependency "@opentelemetry\/api":/.test(warning.message) && warning.message.replaceAll("\\", "/").includes("/@better-auth/core/dist/instrumentation/api.mjs")) return false;
  return !(/^Failed to resolve dependency "cloudflare:sockets":/.test(warning.message) && warning.message.includes("pg-cloudflare"));
});
if (unresolved.length) {
  for (const warning of unresolved) console.error(warning.message);
  throw new Error("Runtime tracing has unresolved dependencies");
}
// BetterAuth telemetry probes node_modules/*/package.json with fs, so NFT
// conservatively includes development-package manifests and their import links.
// These are version-discovery metadata, not executable dependencies. Omit only
// tsx/esbuild metadata proven to come exclusively from that optional detector.
// Any executable tool file or another importer remains a hard packaging error.
const toolPackage = /(?:^|\/)node_modules\/(tsx|esbuild)(?:\/|$)/;
for (const file of fileList) {
  const normalized = file.replaceAll("\\", "/");
  if (!toolPackage.test(normalized)) continue;
  const parents = [...(reasons.get(file)?.parents ?? [])];
  if (!/\/node_modules\/(?:tsx|esbuild)(?:\/package\.json)?$/.test(`/${normalized}`)
    || !parents.length || !parents.every(parent => parent.replaceAll("\\", "/").endsWith("/node_modules/@better-auth/telemetry/dist/node.mjs"))) {
    throw new Error(`Executable build tool or unreviewed dependency in runtime trace: ${file}`);
  }
  fileList.delete(file);
}
// pg-native is optional and pg-cloudflare selects its socket only when the
// detected runtime is Cloudflare Workers. This image uses Node's net/tls driver.
// All other unresolved imports fail above; the real DB smoke validates the path.
const serverOnlyLink = resolve(base, "node_modules/server-only");
const serverOnlyRoot = dirname(await realpath(require.resolve("server-only")));
fileList.add(relative(base, serverOnlyLink));
for (const file of ["package.json", "index.js", "empty.js"]) fileList.add(relative(base, resolve(serverOnlyRoot, file)));
// NFT on Windows can resolve junctions without retaining their intermediate
// pnpm import links. Recover only links whose real package has traced files.
// This also makes copied CLI imports work without access to the original install.
const tracedPaths = [...fileList].map(file => resolve(base, file));
const packageModules = new Set([resolve(base, "node_modules")]);
for (const path of tracedPaths) {
  const match = relative(base, path).replaceAll("\\", "/").match(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//);
  if (match) packageModules.add(resolve(base, match[0]));
}
async function collectLinks(directory, scoped = false) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (!scoped && entry.name.startsWith("@") && entry.isDirectory()) {
      await collectLinks(path, true);
    } else if ((await lstat(path)).isSymbolicLink()) {
      const actual = await realpath(path);
      if (tracedPaths.some(file => file === actual || file.startsWith(`${actual}${sep}`))) fileList.add(relative(base, path));
    }
  }
}
for (const directory of packageModules) await collectLinks(directory);
const files = [...fileList].filter(file => file.replaceAll("\\", "/").startsWith("node_modules/")).sort();
if (files.some(file => toolPackage.test(file.replaceAll("\\", "/")))) throw new Error("Build tool survived runtime trace filtering");
const traced = [];
for (const file of files) {
  const source = resolve(base, file);
  const sourceRelative = relative(base, source);
  if (sourceRelative.startsWith(`..${sep}`) || isAbsolute(sourceRelative)) throw new Error("Trace escaped build context");
  const info = await lstat(source);
  if (info.isDirectory()) throw new Error(`Unexpected directory trace: ${file}`);
  traced.push({ file, source, target: resolve(destination, file), info });
}
// Rebase links before copying files, including Windows pnpm junctions. No link
// may point back to the build install tree or outside the /app dependency tree.
for (const { file, source, target, info } of traced.filter(item => item.info.isSymbolicLink())) {
  const sourceTarget = await realpath(source);
  const inside = relative(base, sourceTarget);
  if (!inside.replaceAll("\\", "/").startsWith("node_modules/")) throw new Error(`Dependency link escaped node_modules: ${file}`);
  const mappedTarget = resolve(destination, inside);
  await mkdir(dirname(target), { recursive: true });
  try {
    const existing = await lstat(target);
    if (!existing.isSymbolicLink()) throw new Error(`Dependency link conflicts with a regular file: ${file}`);
    await unlink(target);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await symlink(relative(dirname(target), mappedTarget), target, process.platform === "win32" ? "junction" : undefined);
}
for (const { source, target, info } of traced.filter(item => !item.info.isSymbolicLink())) {
  await mkdir(dirname(target), { recursive: true });
  if (!info.isFile()) throw new Error("Runtime closure contains a non-file entry");
  await cp(source, target, { force: true });
}
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, "morphiume-runtime-files.json"), `${JSON.stringify({ entries, files, optionalImports }, null, 2)}\n`);
console.log(`CLI runtime dependency closure copied: ${files.length} files; no install tree or build tools copied.`);
