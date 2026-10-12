import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, readdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import tls from "node:tls";
import https from "node:https";

if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Native release audit requires Linux amd64");
const packages = { libcrypto3: "3.5.9-r0", libssl3: "3.5.9-r0", zlib: "1.3.2-r1" };
const installed = new Map((await readFile("/lib/apk/db/installed", "utf8")).split("\n\n").map(block => {
  const fields = Object.fromEntries(block.split("\n").filter(line => /^[PV]:/.test(line)).map(line => [line[0], line.slice(2)]));
  return [fields.P, fields.V];
}));
for (const [name, version] of Object.entries(packages)) {
  if (installed.get(name) !== version) throw new Error(`Required patched APK is absent: ${name}=${version}`);
}
const nativeFiles = [process.execPath];
const require = createRequire(import.meta.url);
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await collect(path);
    else if (item.isFile() && /(?:\.node$|\.so(?:\.|$))/.test(item.name)) nativeFiles.push(path);
  }
}
await collect("/app/node_modules");
if (!nativeFiles.some(path => path.includes("sharp") && path.endsWith(".node"))) throw new Error("Sharp native addon was not retained");
const libraries = nativeFiles.map(path => {
  // The musl ldd loader has no Node N-API host symbols. Loading addons inside
  // Node proves those symbols resolve; retain raw ldd status/output as evidence.
  const nodeAddon = path.endsWith(".node");
  if (nodeAddon) require(path);
  const result = spawnSync("ldd", [path], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if ((!nodeAddon && result.status !== 0) || /Error loading shared library|=>\s*not found/.test(output)) throw new Error(`Unresolved native dependency: ${relative("/app", path)}`);
  return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), lddExitCode: result.status,
    ldd: output.replace(/\(0x[0-9a-f]+\)/gi, "(ASLR address omitted)"), ...(nodeAddon ? { nodeAddonLoad: "passed" } : {}) };
});
// DTLS is not a Node SecureContext method. Do not silently enable experimental
// QUIC while Node24 still embeds OpenSSL3.5.8; that inventory is independent of APK.
for (const secureProtocol of ["DTLS_method", "DTLSv1_2_method"]) {
  let rejected = false;
  try { tls.createSecureContext({ secureProtocol }); }
  catch (error) { rejected = error.code === "ERR_TLS_INVALID_PROTOCOL_METHOD"; }
  if (!rejected) throw new Error("Unexpected DTLS surface in release runtime");
}
let quicDisabled = false;
try { await import("node:quic"); }
catch (error) { quicDisabled = error.code === "ERR_UNKNOWN_BUILTIN_MODULE"; }
if (!quicDisabled) throw new Error("Experimental QUIC is enabled in release runtime");
const privateDirectory = await mkdtemp(join(tmpdir(), "morphiume-tls-audit-"));
try {
  const keyPath = join(privateDirectory, "key.pem");
  const certPath = join(privateDirectory, "cert.pem");
  const certificate = spawnSync("openssl", ["req", "-newkey", "rsa:2048", "-x509", "-days", "1", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
  if (certificate.status !== 0) throw new Error("Synthetic TLS certificate generation failed");
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  const server = https.createServer({ key, cert, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (_request, response) => response.end("synthetic-https-smoke"));
  await new Promise((resolveReady, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveReady); });
  try {
    await new Promise((accept, reject) => {
      const request = https.get({ host: "127.0.0.1", port: server.address().port, ca: cert, servername: "localhost", minVersion: "TLSv1.3", rejectUnauthorized: true }, response => {
        let body = "";
        response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
        response.once("end", () => response.statusCode === 200 && body === "synthetic-https-smoke" ? accept() : reject(new Error("HTTPS response failed")));
      });
      request.setTimeout(5000, () => request.destroy(new Error("HTTPS smoke timeout")));
      request.once("error", reject);
      request.once("socket", socket => socket.once("secureConnect", () => {
        if (!socket.authorized || socket.getProtocol() !== "TLSv1.3") request.destroy(new Error("TLS validation failed"));
      }));
    });
  } finally { await new Promise(complete => server.close(complete)); }
  await require("sharp")({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } }).webp().toBuffer();
  const report = { node: process.versions.node, embeddedOpenSSL: process.versions.openssl, embeddedZlib: process.versions.zlib,
    sharedOpenSSL: process.config.variables.node_shared_openssl, sharedZlib: process.config.variables.node_shared_zlib,
    patchedApk: packages, protocols: { dtlsMethodsRejected: true, experimentalQuicDisabled: true, verifiedTls13HttpsClient: true },
    sharpWebpEncoder: "passed", libraries };
  await writeFile("/app/morphiume-native-audit.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Native library/version inventory, authenticated TLS1.3 and Sharp encoder passed; embedded OpenSSL=${report.embeddedOpenSSL} is recorded separately.`);
} finally {
  if (!resolve(privateDirectory).startsWith(`${resolve(tmpdir())}/morphiume-tls-audit-`)) throw new Error("Unexpected TLS temporary path");
  await rm(privateDirectory, { recursive: true, force: true });
}
