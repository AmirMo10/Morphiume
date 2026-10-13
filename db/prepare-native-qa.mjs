import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, mkdir, open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve, join, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const remoteFile = join(workspace, "db", "prepare-native-qa-remote.py");
const suffixPattern = /^[a-f0-9]{16}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const allowedModes = new Set(["plan", "prepare", "execute"]);
const aclScript = '$ErrorActionPreference="Stop";try{$v=ConvertFrom-Json([Console]::In.ReadToEnd());$i=Get-Item -LiteralPath $v.path -Force;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){exit 1};$a=Get-Acl -LiteralPath $v.path;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$ok=@("S-1-5-18",$sid);if(!$a.AreAccessRulesProtected -or $ok -notcontains ($a.GetOwner([Security.Principal.SecurityIdentifier]).Value)){exit 1};$seen=@();foreach($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){$s=$r.IdentityReference.Value;if($ok -notcontains $s -or $r.IsInherited -or $r.AccessControlType -ne "Allow" -or ($r.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl){exit 1};$seen+=$s};if(($ok | Where-Object{$seen -notcontains $_}).Count){exit 1};[Console]::Out.Write("protected")}catch{exit 1}';

export class ProvisionError extends Error {
  constructor(code) { super("Native QA preparation stopped; private/partial state is retained."); this.code = code; }
}
const reject = code => { throw new ProvisionError(code); };
export function qaSpec(suffix) {
  if (typeof suffix !== "string" || !suffixPattern.test(suffix)) reject("INVALID_ARGUMENT");
  return { suffix, database: `morphiume_staging_qa_${suffix}`, ownerRole: `morphiume_staging_qa_owner_${suffix}`, appRole: `morphiume_staging_qa_app_${suffix}` };
}
export function parseArguments(argv) {
  const value = { mode: "plan", windowOpen: false };
  const fields = new Map([["--suffix", "suffix"], ["--plan-file", "planFile"], ["--expected-remote-sha256", "expectedSha256"]]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (seen.has(key)) reject("INVALID_ARGUMENT"); seen.add(key);
    if (key === "--prepare" || key === "--execute") { if (value.mode !== "plan") reject("INVALID_ARGUMENT"); value.mode = key.slice(2); }
    else if (key === "--quiescent-window-open") value.windowOpen = true;
    else if (fields.has(key) && typeof argv[index + 1] === "string" && !argv[index + 1].startsWith("--")) value[fields.get(key)] = argv[++index];
    else reject("INVALID_ARGUMENT");
  }
  if (!allowedModes.has(value.mode)) reject("INVALID_ARGUMENT");
  if (value.mode !== "execute") qaSpec(value.suffix);
  if (value.mode === "plan" && (value.planFile || value.expectedSha256 || value.windowOpen)) reject("INVALID_ARGUMENT");
  if (value.mode === "prepare" && (value.planFile || value.expectedSha256 || value.windowOpen)) reject("INVALID_ARGUMENT");
  if (value.mode === "execute" && (!value.planFile || value.suffix || !value.windowOpen || !shaPattern.test(value.expectedSha256 ?? ""))) reject("INVALID_ARGUMENT");
  return value;
}
export function credentialPlan(suffix, sourceSha256, entropy = () => randomBytes(32).toString("hex")) {
  if (!shaPattern.test(sourceSha256)) reject("SOURCE_CHANGED");
  const spec = qaSpec(suffix), ownerPassword = entropy(), appPassword = entropy();
  if (!shaPattern.test(ownerPassword) || !shaPattern.test(appPassword) || ownerPassword === appPassword) reject("INVALID_PLAN");
  return { schemaVersion: 1, phase: "prepared-local", ...spec, remoteSourceSha256: sourceSha256,
    credentials: { ownerPassword, appPassword },
    connections: { databaseUrl: `postgresql://${spec.appRole}:${appPassword}@127.0.0.1:15433/${spec.database}`, migrationDatabaseUrl: `postgresql://${spec.ownerRole}:${ownerPassword}@127.0.0.1:15433/${spec.database}` },
    boundary: { deploymentEnv: "test", paymentProvider: "mock", smsProvider: "mock", appBaseUrl: "http://localhost:3004" } };
}
export function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || plan.schemaVersion !== 1 || plan.phase !== "prepared-local") reject("INVALID_PLAN");
  const spec = qaSpec(plan.suffix);
  if (["database", "ownerRole", "appRole"].some(key => plan[key] !== spec[key]) || !shaPattern.test(plan.remoteSourceSha256 ?? "")) reject("INVALID_PLAN");
  const credentials = plan.credentials;
  if (!credentials || !shaPattern.test(credentials.ownerPassword ?? "") || !shaPattern.test(credentials.appPassword ?? "") || credentials.ownerPassword === credentials.appPassword) reject("INVALID_PLAN");
  const canonical = credentialPlan(spec.suffix, plan.remoteSourceSha256, (() => { const list = [credentials.ownerPassword, credentials.appPassword]; return () => list.shift(); })());
  if (JSON.stringify(plan) !== JSON.stringify(canonical)) reject("INVALID_PLAN");
  return plan;
}
export function planPath(suffix, base = workspace) { return join(base, ".local", "native-qa", qaSpec(suffix).suffix, "plan.json"); }
export function buildSshInvocation(plan, source, expectedSha256) {
  validatePlan(plan);
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  if (!shaPattern.test(expectedSha256 ?? "") || sourceSha256 !== plan.remoteSourceSha256 || sourceSha256 !== expectedSha256) reject("SOURCE_CHANGED");
  // This is a fixed remote command. Dynamic input and credentials use stdin only.
  const bootstrap = `import sys,json,base64,hashlib; e=json.load(sys.stdin); s=base64.b64decode(e["source"],validate=True); assert hashlib.sha256(s).hexdigest()=="${sourceSha256}"; n={"__name__":"native_qa_dispatch"}; exec(compile(s,"reviewed-native-qa","exec"),n); n["dispatch"](e["plan"])`;
  if (bootstrap.includes("'")) reject("SOURCE_CHANGED");
  return { command: "ssh", argv: ["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "morphiume-deploy", "python3", "-c", `'${bootstrap}'`],
    input: JSON.stringify({ source: Buffer.from(source).toString("base64"), plan }) };
}
export function acceptedRemoteEvidence(value, plan) {
  const keys = ["schemaVersion", "mode", "suffix", "database", "ownerRole", "appRole", "remoteSourceSha256", "roleIsolationVerified", "appDmlVerified", "originalBusinessAccessDenied", "applicationStarted", "canonicalMigrationsApplied"];
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
    && value.schemaVersion === 1 && value.mode === "provisioned" && ["suffix", "database", "ownerRole", "appRole", "remoteSourceSha256"].every(key => value[key] === plan[key])
    && value.roleIsolationVerified === true && value.appDmlVerified === true && value.originalBusinessAccessDenied === true && value.applicationStarted === false && value.canonicalMigrationsApplied === false;
}
export function childEnvironment(env = process.env) {
  const names = new Set(["PATH", "SYSTEMROOT", "WINDIR", "PROGRAMDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SSH_AUTH_SOCK", "TEMP", "TMP", "COMSPEC"]);
  return Object.fromEntries(Object.entries(env).filter(([key]) => names.has(key.toUpperCase())));
}
function run(command, argv, input = "", timeout = 180_000) {
  return new Promise((fulfil, fail) => {
    const child = spawn(command, argv, { shell: false, windowsHide: true, env: childEnvironment(), stdio: ["pipe", "pipe", "pipe"] });
    let output = "", size = 0, finished = false;
    const stop = () => { if (!finished) { finished = true; child.kill(); fail(new ProvisionError("PROCESS_FAILED")); } };
    const timer = setTimeout(stop, timeout);
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 1_048_576) stop(); else output += chunk.toString("utf8"); });
    child.stderr.on("data", chunk => { size += chunk.length; if (size > 1_048_576) stop(); }); // Never print child error text.
    child.on("error", stop); child.stdin.on("error", stop);
    child.on("close", code => { clearTimeout(timer); if (finished) return; finished = true; if (code !== 0) fail(new ProvisionError("PROCESS_FAILED")); else fulfil(output); });
    child.stdin.end(input);
  });
}
async function protectedAcl(path) {
  if (process.platform !== "win32") reject("LOCAL_ACL_REQUIRED");
  const output = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", aclScript], JSON.stringify({ path }), 15_000);
  if (output !== "protected") reject("LOCAL_ACL_REQUIRED");
}
async function protect(path) {
  const sid = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", '[Console]::Out.Write([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)'], "", 15_000);
  if (!/^S-\d+-\d+(?:-\d+){1,15}$/.test(sid)) reject("LOCAL_ACL_REQUIRED");
  const inherited = (await lstat(path)).isDirectory() ? "(OI)(CI)" : "";
  // Newly created paths retain their creator owner; reject unexpected ownership
  // in the checker instead of requesting take-ownership/elevation privileges.
  await run("icacls", [path, "/inheritance:r", "/grant:r", `*${sid}:${inherited}F`, `*S-1-5-18:${inherited}F`], "", 15_000);
  await protectedAcl(path);
}
async function privateWrite(path, value) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await protect(path); await file.writeFile(JSON.stringify(value) + "\n"); await file.sync(); } finally { await file.close(); }
}
const defaultIo = { platform: process.platform, readFile, mkdir, lstat, protectedAcl, protect, privateWrite, run };
export async function provisionCli(argv, io = defaultIo, base = workspace) {
  const args = parseArguments(argv);
  // No files, entropy generation, subprocesses, network or database work on this branch.
  if (args.mode === "plan") return { mode: "unexecuted-plan", ...qaSpec(args.suffix), serverMutation: false, credentialsCreated: false };
  if (io.platform !== "win32") reject("LOCAL_ACL_REQUIRED");
  if (args.mode === "prepare") {
    const source = await io.readFile(remoteFile), sha = createHash("sha256").update(source).digest("hex");
    const path = planPath(args.suffix, base), parent = dirname(path), root = dirname(parent);
    await io.mkdir(join(base, ".local"), { recursive: true });
    if ((await io.lstat(join(base, ".local"))).isSymbolicLink()) reject("INVALID_PLAN");
    try { await io.mkdir(root); await io.protect(root); } catch (error) { if (error?.code !== "EEXIST") throw error; await io.protectedAcl(root); }
    await io.mkdir(parent); await io.protect(parent); // Existing suffix is never reused or reset.
    const plan = credentialPlan(args.suffix, sha);
    await io.privateWrite(path, plan);
    return { mode: "prepared-local", ...qaSpec(args.suffix), remoteSourceSha256: sha, serverMutation: false };
  }
  const path = resolve(args.planFile);
  if (!win32.isAbsolute(args.planFile) && process.platform === "win32") reject("INVALID_PLAN");
  const directory = dirname(path), suffix = directory.slice(directory.lastIndexOf(process.platform === "win32" ? "\\" : "/") + 1);
  if (path !== planPath(suffix, base)) reject("INVALID_PLAN");
  if ((await io.lstat(join(base, ".local"))).isSymbolicLink()) reject("INVALID_PLAN");
  for (const item of [dirname(directory), directory, path]) { if ((await io.lstat(item)).isSymbolicLink()) reject("INVALID_PLAN"); await io.protectedAcl(item); }
  const raw = await io.readFile(path);
  if (raw.length > 16_384) reject("INVALID_PLAN");
  let plan; try { plan = validatePlan(JSON.parse(raw.toString("utf8"))); } catch { reject("INVALID_PLAN"); }
  const invocation = buildSshInvocation(plan, await io.readFile(remoteFile), args.expectedSha256);
  await io.privateWrite(join(directory, "attempt.json"), { schemaVersion: 1, phase: "dispatched-unknown-until-evidence", suffix, remoteSourceSha256: plan.remoteSourceSha256 });
  let evidence; try { evidence = JSON.parse(await io.run(invocation.command, invocation.argv, invocation.input)); } catch { reject("DISPATCH_FAILED"); }
  if (!acceptedRemoteEvidence(evidence, plan)) reject("EVIDENCE_REJECTED");
  await io.privateWrite(join(directory, "evidence.json"), evidence);
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await provisionCli(process.argv.slice(2)))); }
  catch { console.error("Native QA preparation stopped. Preserve the protected plan and any partial state; no automatic retry, drop or credential reset."); process.exitCode = 1; }
}
