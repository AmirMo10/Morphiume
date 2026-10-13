import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { qaSpec, parseArguments, credentialPlan, validatePlan, buildSshInvocation, acceptedRemoteEvidence, childEnvironment, provisionCli, planPath } from "../../../db/prepare-native-qa.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pythonSource = readFileSync(resolve(root, "db/prepare-native-qa-remote.py"));
const digest = createHash("sha256").update(pythonSource).digest("hex");
const suffix = "0123456789abcdef";
function plan() { let counter = 0; return credentialPlan(suffix, digest, () => String(++counter).repeat(64)); }
function evidence(value = plan()) { return { schemaVersion: 1, mode: "provisioned", ...qaSpec(value.suffix), remoteSourceSha256: value.remoteSourceSha256, roleIsolationVerified: true, appDmlVerified: true, originalBusinessAccessDenied: true, applicationStarted: false, canonicalMigrationsApplied: false }; }
function memoryIo(value = plan()) {
  const calls = [], files = new Map(), base = resolve(root, ".local", "unit-mocked-only"), path = planPath(suffix, base);
  return { calls, files, base, path, platform: "win32",
    async readFile(file) { calls.push(["read", file]); return file === path ? Buffer.from(JSON.stringify(value)) : pythonSource; },
    async mkdir(file) { calls.push(["mkdir", file]); },
    async lstat(file) { calls.push(["stat", file]); return { isSymbolicLink: () => false }; },
    async protectedAcl(file) { calls.push(["acl-verified", file]); },
    async protect(file) { calls.push(["protect", file]); },
    async privateWrite(file, body) { calls.push(["private-write", file]); if (files.has(file)) throw Object.assign(new Error("Already exists"), { code: "EEXIST" }); files.set(file, body); },
    async run(command, argv, input) { calls.push(["run", command, argv, input]); return JSON.stringify(evidence(value)); } };
}

test("dry plan performs zero file/process/network calls and creates no credentials", async () => {
  const io = new Proxy({}, { get() { throw new Error("Dry plan accessed an IO dependency"); } });
  const result = await provisionCli(["--suffix", suffix], io);
  assert.deepEqual(result, { mode: "unexecuted-plan", ...qaSpec(suffix), serverMutation: false, credentialsCreated: false });
});
test("strict fresh suffix rejects traversal, quoting, shell syntax and existing DB names", () => {
  for (const value of ["", "A".repeat(16), "a".repeat(15), "a".repeat(17), "../original", "abc;drop", "morphiume_staging", "$(secret)", "0123456789abcdef\n"]) assert.throws(() => qaSpec(value));
  assert.equal(qaSpec(suffix).database, "morphiume_staging_qa_0123456789abcdef");
});
test("execute requires a separate exact source digest and explicit quiet-window flag", () => {
  for (const argv of [[], ["--execute"], ["--prepare", "--execute"], ["--suffix", suffix, "--suffix", suffix], ["--suffix", suffix, "--quiescent-window-open"], ["--execute", "--plan-file", "x", "--expected-remote-sha256", digest], ["--execute", "--plan-file", "x", "--quiescent-window-open", "--expected-remote-sha256", "bad"], ["--password", "private"]]) assert.throws(() => parseArguments(argv));
});
test("credentials are cryptorandom by default, distinct and retained only in private plan", () => {
  const value = credentialPlan(suffix, digest);
  assert.match(value.credentials.ownerPassword, /^[a-f0-9]{64}$/); assert.notEqual(value.credentials.ownerPassword, value.credentials.appPassword);
  assert.equal(validatePlan(value), value);
  assert.throws(() => credentialPlan(suffix, digest, () => "1".repeat(64)));
});
test("tampered role, provider, origin, URL options and plan keys are rejected", () => {
  const patches = [{ ownerRole: "postgres" }, { appRole: "morphiume_staging_app" }, { database: "morphiume_staging" }, { phase: "ready" }, { privateExtra: true }, { boundary: { ...plan().boundary, smsProvider: "live" } }, { connections: { ...plan().connections, databaseUrl: plan().connections.databaseUrl + "?options=x" } }];
  for (const patch of patches) assert.throws(() => validatePlan({ ...plan(), ...patch }));
});
test("SSH argv is fixed, strict and contains neither password nor URL nor private JSON", () => {
  const value = plan(), call = buildSshInvocation(value, pythonSource, digest);
  assert.deepEqual(call.argv.slice(0, 10), ["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "morphiume-deploy", "python3", "-c"]);
  for (const secret of Object.values(value.credentials)) assert.equal(JSON.stringify(call.argv).includes(secret), false);
  assert.equal(JSON.stringify(call.argv).includes("postgresql://"), false);
  const input = JSON.parse(call.input); assert.deepEqual(input.plan, value); assert.deepEqual(Buffer.from(input.source, "base64"), pythonSource);
  assert.throws(() => buildSshInvocation(value, Buffer.from("changed source"), digest));
  assert.throws(() => buildSshInvocation(value, pythonSource, "a".repeat(64)));
});
test("native Windows SSH keeps ProgramData with parent casing while excluding database/auth/GitHub/API tokens", () => {
  const environment = { Path: "bin", SystemRoot: "system", ProgramData: "C:/ProgramData", USERPROFILE: "profile", DATABASE_URL: "private", DB_URL: "private", AUTH_SECRET: "private", ADMIN_AUTH_SECRET: "private", PGPASSWORD: "private", SMS_TOKEN: "private", GH_TOKEN: "private", GITHUB_TOKEN: "private", API_TOKEN: "private", OPENAI_API_KEY: "private" };
  assert.deepEqual(childEnvironment(environment), { Path: "bin", SystemRoot: "system", ProgramData: "C:/ProgramData", USERPROFILE: "profile" });
  assert.deepEqual(childEnvironment({ PROGRAMDATA: "C:/ProgramData", AUTH_SECRET: "private" }), { PROGRAMDATA: "C:/ProgramData" });
});
test("prepare protects new directories before privately writing credentials and never dispatches", async () => {
  const io = memoryIo(); const result = await provisionCli(["--prepare", "--suffix", suffix], io, io.base);
  assert.equal(result.mode, "prepared-local"); assert.equal(JSON.stringify(result).includes("postgresql://"), false);
  assert.equal(io.calls.some(call => call[0] === "run"), false);
  const written = [...io.files.entries()][0]; assert.equal(written[0], io.path); validatePlan(written[1]);
  assert.ok(io.calls.findIndex(call => call[0] === "protect" && call[1] === dirname(io.path)) < io.calls.findIndex(call => call[0] === "private-write"));
});
test("an existing suffix stops preparation without overwriting, password reset or SSH", async () => {
  const io = memoryIo(); io.mkdir = async file => { if (file === dirname(io.path)) throw Object.assign(new Error("private failure canary"), { code: "EEXIST" }); };
  await assert.rejects(provisionCli(["--prepare", "--suffix", suffix], io, io.base));
  assert.equal(io.files.size, 0); assert.equal(io.calls.some(call => call[0] === "run"), false);
});
test("execute verifies local ACLs and creates an exclusive attempt before SSH", async () => {
  const io = memoryIo(); const result = await provisionCli(["--execute", "--plan-file", io.path, "--expected-remote-sha256", digest, "--quiescent-window-open"], io, io.base);
  assert.deepEqual(result, evidence());
  assert.ok(io.calls.findIndex(call => call[0] === "private-write") < io.calls.findIndex(call => call[0] === "run"));
  assert.equal(io.files.size, 2);
  const count = io.calls.filter(call => call[0] === "run").length;
  await assert.rejects(provisionCli(["--execute", "--plan-file", io.path, "--expected-remote-sha256", digest, "--quiescent-window-open"], io, io.base));
  assert.equal(io.calls.filter(call => call[0] === "run").length, count);
});
test("ACL/reparse/source failures stop before attempt marker or remote invocation", async () => {
  for (const kind of ["acl", "link", "source"]) {
    const io = memoryIo();
    if (kind === "acl") io.protectedAcl = async () => { throw new Error("ACL failed"); };
    if (kind === "link") io.lstat = async () => ({ isSymbolicLink: () => true });
    const expected = kind === "source" ? "a".repeat(64) : digest;
    await assert.rejects(provisionCli(["--execute", "--plan-file", io.path, "--expected-remote-sha256", expected, "--quiescent-window-open"], io, io.base));
    assert.equal(io.files.size, 0); assert.equal(io.calls.some(call => call[0] === "run"), false);
  }
});
test("private child errors become fixed failures while the attempt is retained", async () => {
  const io = memoryIo(); io.run = async () => { throw new Error("TEST-secret-password-and-private-SQL"); };
  await assert.rejects(provisionCli(["--execute", "--plan-file", io.path, "--expected-remote-sha256", digest, "--quiescent-window-open"], io, io.base), error => error.code === "DISPATCH_FAILED" && !String(error).includes("TEST-secret"));
  assert.equal(io.files.size, 1);
});
test("malformed/private output or missing actual isolation proof is never accepted", () => {
  for (const value of [null, "TEST-private", { ...evidence(), applicationStarted: true }, { ...evidence(), appDmlVerified: false }, { ...evidence(), originalBusinessAccessDenied: false }, { ...evidence(), ownerRole: "postgres" }, { ...evidence(), password: "private" }]) assert.equal(Boolean(acceptedRemoteEvidence(value, plan())), false);
});

const python = process.env.MORPHIUME_TEST_PYTHON ?? (process.platform === "win32" ? "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" : "python3");
function pythonCheck(body) {
  const harness = 'import json,sys\nnamespace={"__name__":"unit_fixture"}\nexec(compile(sys.stdin.read(),"prepared-source","exec"),namespace)\n' + body;
  const output = execFileSync(python, ["-B", "-c", harness], { input: pythonSource, encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(output.trim(), "checked");
}
test("remote container guard rejects wrong image, mount, project and public/extra bindings", () => {
  pythonCheck(String.raw`
import copy
item={"State":{"Running":True,"Health":{"Status":"healthy"}},"Config":{"Image":namespace["PG_IMAGE"],"Labels":{"com.docker.compose.project":"morphiume-staging","com.docker.compose.service":"db"},"Env":["PGDATA=/var/lib/postgresql/18/docker"]},"Mounts":[{"Type":"bind","Source":"/srv/morphiume/staging/postgres","Destination":"/var/lib/postgresql"}],"NetworkSettings":{"Ports":{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"5433"}]}},"HostConfig":{"PortBindings":{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"5433"}]}}}
namespace["validate_container"](item)
for kind in ("image","mount","overlay","project","port","extra","health"):
    bad=copy.deepcopy(item)
    if kind=="image":bad["Config"]["Image"]="postgres:latest"
    if kind=="mount":bad["Mounts"][0]["Source"]="/srv/morphiume/postgres"
    if kind=="overlay":bad["Mounts"].append({"Type":"volume","Source":"old","Destination":"/var/lib/postgresql/18/docker"})
    if kind=="project":bad["Config"]["Labels"]["com.docker.compose.project"]="morphiume"
    if kind=="port":bad["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostIp"]="0.0.0.0"
    if kind=="extra":bad["HostConfig"]["PortBindings"]["6432/tcp"]=[{"HostIp":"127.0.0.1","HostPort":"6432"}]
    if kind=="health":bad["State"]["Health"]["Status"]="unhealthy"
    try:namespace["validate_container"](bad)
    except namespace["Stopped"]:pass
    else:raise AssertionError(kind)
print("checked")
`);
});
test("remote existing DB/role guard stops before private writes or CREATE", () => {
  pythonCheck(String.raw`
p=json.loads(${JSON.stringify(JSON.stringify(plan()))})
namespace["os"].geteuid=lambda:0
namespace["validate_container"]=lambda item:None
namespace["run"]=lambda argv,*a,**k:"[{}]"
for existing in ({"database":True,"roles":0,"oldDatabases":[]},{"database":False,"roles":1,"oldDatabases":[]}):
    calls=[]
    def psql(db,sql):
        calls.append(sql)
        if "server_version_num" in sql:return json.dumps({"role":"postgres","superuser":True,"version":180006,"recovery":False})
        return json.dumps(existing)
    namespace["psql"]=psql
    try:namespace["provision"](p)
    except namespace["Stopped"]:pass
    else:raise AssertionError("existing target reused")
    assert not any("CREATE" in sql for sql in calls)
print("checked")
`);
});
test("remote authenticated proof uses stdin secret and validates no app DDL, original CONNECT and memberships", () => {
  pythonCheck(String.raw`
p=json.loads(${JSON.stringify(JSON.stringify(plan()))})
calls=[]
namespace["run"]=lambda argv,input_text=None,timeout=30:(calls.append((argv,input_text)) or "{}")
namespace["authenticated"](p,False,"SELECT 1;")
assert p["credentials"]["appPassword"] not in str(calls[0][0])
assert calls[0][1].startswith(p["credentials"]["appPassword"]+"\n")
namespace["authenticated"]=lambda *args:json.dumps({"database":p["database"],"role":p["appRole"],"schemaCreate":True,"databaseCreate":False,"schemaUsage":True,"temporary":False})
try:namespace["identity_readback"](p,False)
except namespace["Stopped"]:pass
else:raise AssertionError("app DDL accepted")
namespace["psql"]=lambda *args:json.dumps({"connect":True,"objects":0,"sequences":0,"ownership":0})
try:namespace["original_boundary"](p,["morphiume_staging"])
except namespace["Stopped"]:pass
else:raise AssertionError("original CONNECT accepted")
namespace["psql"]=lambda *args:json.dumps({"roles":[],"memberships":1,"ownedDatabases":[p["database"]]})
try:namespace["role_readback"](p)
except namespace["Stopped"]:pass
else:raise AssertionError("role membership accepted")
print("checked")
`);
});
test("remote SCRAM verifier carries no plaintext and fresh DML probe failures stop before DROP", () => {
  pythonCheck(String.raw`
p=json.loads(${JSON.stringify(JSON.stringify(plan()))})
verifier=namespace["scram"](p["credentials"]["ownerPassword"])
assert verifier.startswith("SCRAM-SHA-256$4096:") and p["credentials"]["ownerPassword"] not in verifier
calls=[]
def authenticated(plan,owner,sql):
    calls.append(sql)
    return "" if "CREATE TABLE" in sql else json.dumps({"count":1,"value":1,"role":plan["appRole"]})
namespace["authenticated"]=authenticated
try:namespace["dml_readback"](p)
except namespace["Stopped"]:pass
else:raise AssertionError("DML mismatch accepted")
assert not any("DROP" in sql for sql in calls)
source=open(${JSON.stringify(resolve(root, "db/prepare-native-qa-remote.py"))},encoding="utf8").read()
assert "DROP DATABASE" not in source and "DROP ROLE" not in source and "ALTER ROLE" not in source
print("checked")
`);
});
test("remote SQL targets only new roles/database; failure retains pending evidence and never drops or resets", () => {
  pythonCheck(String.raw`
import tempfile
from pathlib import Path
p=json.loads(${JSON.stringify(JSON.stringify(plan()))})
namespace["os"].geteuid=lambda:0
namespace["validate_container"]=lambda item:None
namespace["private_directory"]=lambda path:None
namespace["run"]=lambda argv,*a,**k:"[{}]"
for fail in (False,True):
    with tempfile.TemporaryDirectory(prefix="morphiume-provision-unit-") as directory:
        namespace["PRIVATE_ROOT"]=Path(directory)/"new-only"
        writes={};queries=[]
        namespace["write_private"]=lambda path,value,replace=False:writes.update({path.name:dict(value)})
        def psql(db,sql):
            queries.append((db,sql))
            if "server_version_num" in sql:return json.dumps({"role":"postgres","superuser":True,"version":180006,"recovery":False})
            if "oldDatabases" in sql:return json.dumps({"database":False,"roles":0,"oldDatabases":["morphiume_staging"]})
            if "CREATE ROLE" in sql:
                assert writes["pending.json"]["phase"]=="pending"
                assert "NOSUPERUSER" in sql and "NOCREATEDB" in sql and "NOCREATEROLE" in sql and "NOREPLICATION" in sql and "NOBYPASSRLS" in sql and "NOINHERIT" in sql
                assert all(secret not in sql for secret in p["credentials"].values())
                if fail:raise namespace["Stopped"]("TEST-private-SQL-error")
            return ""
        namespace["psql"]=psql
        boundaries=[]
        namespace["original_boundary"]=lambda plan,databases:boundaries.append(databases)
        namespace["role_readback"]=lambda plan:None
        namespace["identity_readback"]=lambda *args:None
        namespace["dml_readback"]=lambda plan:None
        if fail:
            try:namespace["provision"](p)
            except namespace["Stopped"]:pass
            else:raise AssertionError("failure accepted")
            assert writes["pending.json"]["phase"]=="failed-review-required" and "evidence.json" not in writes
        else:
            evidence=namespace["provision"](p)
            assert evidence["canonicalMigrationsApplied"] is False and evidence["applicationStarted"] is False
            assert writes["pending.json"]["phase"]=="provisioned" and len(boundaries)==2
            assert any(db==p["database"] and "ALTER SCHEMA public" in sql for db,sql in queries)
            assert all(db in ("postgres",p["database"]) for db,sql in queries)
        assert not any("DROP" in sql or "ALTER ROLE" in sql for db,sql in queries)
print("checked")
`);
});
test("Windows ACL checker syntax parses without running file or permission operations", { skip: process.platform !== "win32" }, () => {
  const source = readFileSync(resolve(root, "db/prepare-native-qa.mjs"), "utf8");
  const script = source.match(/const aclScript = '([^']+)';/)[1];
  const check = '$errors=$null;$tokens=$null;[void][Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors);if($errors.Count){exit 1};[Console]::Out.Write("checked")';
  assert.equal(execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", check], { input: script, encoding: "utf8", windowsHide: true }).trim(), "checked");
});
test("local ACL policy derives only actual process SID plus SYSTEM, without group/env/user identity", () => {
  const source = readFileSync(resolve(root, "db/prepare-native-qa.mjs"), "utf8");
  assert.ok(source.includes("WindowsIdentity]::GetCurrent().User.Value"));
  assert.ok(source.includes('const sid = await run("powershell"'));
  assert.ok(source.includes('$ok=@("S-1-5-18",$sid)'));
  assert.equal(source.includes("S-1-5-32-544"), false);
  assert.equal(source.includes("USERNAME"), false);
  assert.equal(source.includes("process.env.SID"), false);
});
