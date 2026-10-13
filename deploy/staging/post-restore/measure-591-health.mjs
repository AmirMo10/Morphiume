#!/usr/bin/env node
// Default is pure plan. Only Root's explicit published/hash-bound dispatch uses SSH.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
export const SOURCE = "6130f4ed7ec090344a5a4a1937a65ef04572975b";
export const OPS = "591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db";
export const DROPINS = Object.freeze({ "591-python-cache-guard.conf": "672e07d612751b0ce919d7900ad9c32528256ff7e9c82cfce36374dd67f113f7", "591-health-budget.conf": "ff3857c5919d36c7b12716d30c72613a6de8b2f580133b378b11fc2a4c1d2234", "591-health-probe-accounting.conf": "33c359ca12b9b50f00b6198e01573fc977385a37750f8949681f9531cb798998" });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HEX = /^[a-f0-9]{64}$/u, COMMIT = /^[a-f0-9]{40}$/u, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const IDENTITY_KEYS = ["sourceCommit", "testedPlatformConfig", "candidateManifestDigest", "archiveSha256", "opsSha256", "runtimeImageId", "engineProofSha256", "accessProfileSha256"];
const EVIDENCE_KEYS = ["acceptanceSha256", "remoteResultRawSha256", "resultSemanticSha256", "localResultRawSha256", "fixtureSha256", "readyRecordSha256", "journalSha256", "restoreConfigSha256", "backupManifestSha256", "recoveryToolSourceCommit"];
function requireTrue(condition) { if (!condition) throw new Error("Scheduled health contract rejected"); }
function keys(value, expected) { requireTrue(value !== null && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())); }
export function hash(value) { return createHash("sha256").update(value).digest("hex"); }
export function sourceHash(value) { return hash(Buffer.from(value.toString().replaceAll("\r\n", "\n"))); }

export function plan() {
  return { schemaVersion: 1, mode: "unexecuted-plan", sourceCommit: SOURCE, opsSha256: OPS, serviceStartLimit: 1, healthBudget: { cpuPercent: 100, memoryBytes: 268435456, startSeconds: 50, stopSeconds: 5 }, sshExecuted: false, approvalWritten: false, timersStarted: false, backupExecuted: false, originalDatabaseWrites: false, requiresPublishedTools: true, requiresRootDispatch: true, actualScheduledCostMeasured: false };
}
export function validateRequest(request) {
  keys(request, ["schemaVersion", "action", "measurementId", "rootDispatch", "sharedDatabaseWindowReleased", "approvalAction", "identity", "publication", "evidence"]);
  requireTrue(request.schemaVersion === 1 && request.action === "measure-old591-scheduled-health" && UUID.test(request.measurementId) && request.rootDispatch === true && request.sharedDatabaseWindowReleased === true && request.approvalAction === "create-if-absent");
  keys(request.identity, IDENTITY_KEYS);
  requireTrue(request.identity.sourceCommit === SOURCE && request.identity.opsSha256 === OPS);
  for (const key of IDENTITY_KEYS.filter(key => key !== "sourceCommit")) requireTrue((key === "testedPlatformConfig" || key === "candidateManifestDigest" || key === "runtimeImageId" ? /^sha256:[a-f0-9]{64}$/u : HEX).test(request.identity[key]));
  keys(request.publication, ["toolSourceCommit", "configurationSourceCommit", "localToolSha256", "remoteToolSha256", "dropinSha256"]);
  requireTrue(COMMIT.test(request.publication.toolSourceCommit) && COMMIT.test(request.publication.configurationSourceCommit) && HEX.test(request.publication.localToolSha256) && HEX.test(request.publication.remoteToolSha256));
  keys(request.publication.dropinSha256, Object.keys(DROPINS));
  for (const [name, sha] of Object.entries(DROPINS)) requireTrue(request.publication.dropinSha256[name] === sha);
  keys(request.evidence, EVIDENCE_KEYS);
  for (const key of EVIDENCE_KEYS) requireTrue((key === "recoveryToolSourceCommit" ? COMMIT : HEX).test(request.evidence[key]));
  requireTrue(request.evidence.localResultRawSha256 === "139f916c48f32308894025d002d91f287ff175d3e33549560c29344141aa3498");
  return request;
}
export function validateSummary(value, request) {
  keys(value, ["schemaVersion", "mode", "accepted", "identity", "privateEvidenceSha256", "measurementId", "systemctlStartCount", "unitResult", "wallSeconds", "executionSeconds", "sampleCount", "sampledMemoryPeakBytes", "sampledCpuMicroseconds", "alertsCount", "appReadiness", "timersStarted", "backupExecuted", "writerStopExecuted", "sqlMutationExecuted", "originalTableEqualityMeasured"]);
  requireTrue(value.schemaVersion === 1 && ["scheduled-health-measured", "scheduled-health-failed"].includes(value.mode) && value.measurementId === request.measurementId && Number.isInteger(value.systemctlStartCount) && value.systemctlStartCount >= 0 && value.systemctlStartCount <= 1 && HEX.test(value.privateEvidenceSha256));
  keys(value.identity, IDENTITY_KEYS); for (const key of IDENTITY_KEYS) requireTrue(value.identity[key] === request.identity[key]);
  for (const key of ["timersStarted", "backupExecuted", "writerStopExecuted", "sqlMutationExecuted", "originalTableEqualityMeasured"]) requireTrue(value[key] === false);
  for (const key of ["wallSeconds", "executionSeconds", "sampleCount", "sampledMemoryPeakBytes", "sampledCpuMicroseconds", "alertsCount"]) requireTrue(value[key] === null || typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0);
  requireTrue(typeof value.accepted === "boolean" && typeof value.unitResult === "string" && ["success", "timeout", "exit-code", "signal", "oom-kill", "resources", "protocol", "start-limit-hit", "unavailable"].includes(value.unitResult));
  requireTrue(value.appReadiness === null || Number.isInteger(value.appReadiness) && value.appReadiness >= 100 && value.appReadiness <= 599 || value.appReadiness === "unavailable");
  if (value.accepted) requireTrue(value.mode === "scheduled-health-measured" && value.systemctlStartCount === 1 && value.unitResult === "success" && value.alertsCount === 0 && value.appReadiness === 200 && value.executionSeconds > 0 && value.executionSeconds <= 50);
  return value;
}

export function sshArguments() {
  return ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "morphiume-deploy", "python3 -E -B -"];
}
export function osEnvironment(parent = process.env) {
  const allowed = ["PATH", "SystemRoot", "WINDIR", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "TEMP", "TMP", "COMSPEC", "PATHEXT", "ProgramFiles", "ProgramData", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL"];
  const result = {};
  for (const key of allowed) {
    const actual = Object.keys(parent).find(name => name.toUpperCase() === key.toUpperCase());
    if (actual && typeof parent[actual] === "string") result[key] = parent[actual];
  }
  return result;
}
export function remoteBootstrap(request) {
  validateRequest(request);
  const encoded = Buffer.from(JSON.stringify(request)).toString("base64");
  // No shell-generated path, request field or credential is placed in argv.
  return `import base64,hashlib,json,os,stat\nfrom pathlib import Path\nREQUEST=json.loads(base64.b64decode('${encoded}'))\npub=REQUEST['publication']\nroot=Path('/srv/morphiume/staging/runtime/releases/${SOURCE}/tools')/pub['remoteToolSha256']\npath=root/'measure-591-health-remote.py'\nfor item in (path,*path.parents):\n info=item.lstat()\n if item.is_symlink() or item.resolve()!=item or info.st_uid!=0 or info.st_mode&0o022: raise SystemExit('Scheduled health bootstrap stopped')\ninfo=path.stat()\nif not stat.S_ISREG(info.st_mode) or info.st_gid!=0 or stat.S_IMODE(info.st_mode)!=0o644 or info.st_nlink!=1 or not 0<info.st_size<=1048576: raise SystemExit('Scheduled health bootstrap stopped')\ndata=path.read_bytes()\nif hashlib.sha256(data.replace(b'\\r\\n',b'\\n')).hexdigest()!=pub['remoteToolSha256']: raise SystemExit('Scheduled health bootstrap stopped')\nexec(compile(data,str(path),'exec'),{'__name__':'__main__','__file__':str(path),'REQUEST':REQUEST})\n`;
}

async function privateLocal(path, ackAcl) {
  const absolute = resolve(path), privateRoot = join(ROOT, ".local");
  requireTrue(dirname(absolute) === privateRoot && await realpath(privateRoot) === privateRoot);
  const parent = await lstat(privateRoot), info = await lstat(absolute);
  requireTrue(parent.isDirectory() && !parent.isSymbolicLink() && info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size > 0 && info.size <= 65536);
  if (process.platform === "win32") requireTrue(ackAcl === true);
  else requireTrue(info.uid === process.getuid() && (info.mode & 0o777) === 0o600 && (parent.mode & 0o077) === 0);
  return readFile(absolute);
}
async function verifyPublished(request) {
  const pub = request.publication;
  const show = async (commit, path) => {
    requireTrue(COMMIT.test(commit));
    const { stdout } = await executeFile("git", ["show", `${commit}:${path}`], { cwd: ROOT, encoding: "buffer", maxBuffer: 1024 * 1024, windowsHide: true, env: osEnvironment() });
    return stdout;
  };
  const local = await readFile(fileURLToPath(import.meta.url));
  const remote = await readFile(join(dirname(fileURLToPath(import.meta.url)), "measure-591-health-remote.py"));
  requireTrue(sourceHash(local) === pub.localToolSha256 && sourceHash(remote) === pub.remoteToolSha256);
  requireTrue(sourceHash(await show(pub.toolSourceCommit, "deploy/staging/post-restore/measure-591-health.mjs")) === pub.localToolSha256 && sourceHash(await show(pub.toolSourceCommit, "deploy/staging/post-restore/measure-591-health-remote.py")) === pub.remoteToolSha256);
  for (const [name, sha] of Object.entries(DROPINS)) requireTrue(sourceHash(await show(pub.configurationSourceCommit, `deploy/staging/post-restore/${name}`)) === sha);
}
async function sshCapture(input) {
  return new Promise(resolveResult => {
    const child = spawn("ssh", sshArguments(), { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: osEnvironment() });
    const stdout = [], stderr = []; let bytes = 0, timedOut = false, spawnFailed = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 240000);
    for (const [stream, target] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on("data", value => { bytes += value.length; if (bytes > 8 * 1024 * 1024) { timedOut = true; child.kill(); } else target.push(value); });
    child.on("error", () => { spawnFailed = true; });
    child.on("close", code => { clearTimeout(timer); resolveResult({ code, timedOut, spawnFailed, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }); });
    child.stdin.on("error", () => { spawnFailed = true; }); child.stdin.end(input);
  });
}
async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.length === 1 && args[0] === "--plan") { console.log(JSON.stringify(plan())); return; }
  const options = {}, switches = new Set(["--execute", "--ack-private-acl"]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; requireTrue(!Object.hasOwn(options, key));
    if (switches.has(key)) options[key] = true;
    else { requireTrue(["--request", "--request-sha256", "--tool-source", "--tool-sha256", "--remote-sha256"].includes(key) && typeof args[i + 1] === "string"); options[key] = args[++i]; }
  }
  requireTrue(options["--execute"] === true && HEX.test(options["--request-sha256"]) && COMMIT.test(options["--tool-source"]) && HEX.test(options["--tool-sha256"]) && HEX.test(options["--remote-sha256"]));
  const raw = await privateLocal(options["--request"], options["--ack-private-acl"]); requireTrue(hash(raw) === options["--request-sha256"]);
  const request = validateRequest(JSON.parse(raw));
  requireTrue(request.publication.toolSourceCommit === options["--tool-source"] && request.publication.localToolSha256 === options["--tool-sha256"] && request.publication.remoteToolSha256 === options["--remote-sha256"]);
  await verifyPublished(request);
  // Reserve private capture BEFORE SSH, retaining a visible pending artifact if
  // interrupted. Never overwrite an earlier failed/accepted measurement.
  const capturePath = join(ROOT, ".local", `scheduled-health-${request.measurementId}.json`);
  const capture = await open(capturePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let summary;
  try {
    await capture.writeFile(JSON.stringify({ mode: "pending-private-capture", requestSha256: hash(raw), sshCompleted: false }) + "\n"); await capture.sync();
    const result = await sshCapture(remoteBootstrap(request));
    try { summary = validateSummary(JSON.parse(result.stdout.trim()), request); } catch { summary = { mode: "scheduled-health-stopped", accepted: false, privateContextWithheld: true, automaticRetry: false }; }
    const record = { mode: "operator-private-capture", requestSha256: hash(raw), publication: request.publication, result, summary };
    const bytes = JSON.stringify(record) + "\n", buffer = Buffer.from(bytes); await capture.truncate(0);
    let offset = 0; while (offset < buffer.length) { const wrote = await capture.write(buffer, offset, buffer.length - offset, offset); requireTrue(wrote.bytesWritten > 0); offset += wrote.bytesWritten; } await capture.sync();
    console.log(JSON.stringify({ ...summary, localPrivateEvidenceSha256: hash(bytes) }));
    requireTrue(result.code === 0 && result.timedOut === false && result.spawnFailed === false && summary.accepted === true);
  } finally { await capture.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Scheduled health measurement stopped; retain private capture and server partial state. No retry is authorized."); process.exitCode = 1; });
}
