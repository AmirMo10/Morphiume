import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from "node:fs";
import {resolve,dirname,sep} from "node:path";

const executable=process.argv[2];
if(!executable)throw new Error("Pass the verified Gitleaks binary path");
const privateRoot=resolve(".local");mkdirSync(privateRoot,{recursive:true});
const directory=mkdtempSync(resolve(privateRoot,"gitleaks-policy-"));
if(!directory.startsWith(privateRoot+sep))throw new Error("Private test boundary");
const configuration=resolve(".gitleaks.toml");
const profile="3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c";
const privatePreviewProfile="a6988f3f27309c198e378e307ca856643686ae1c3fb49617bed9a770634e50ed";
// Synthetic detector fixtures must consistently clear the default entropy
// cutoff. An arbitrary 32-byte sample can occasionally fall below it.
function noncredentialCanary(name){
  for(let nonce=0;nonce<256;nonce++){
    const value=createHash("sha256").update(`Morphiume noncredential detector canary:${name}:${nonce}`).digest("hex");
    const counts=new Map();for(const character of value)counts.set(character,(counts.get(character)??0)+1);
    const entropy=[...counts.values()].reduce((sum,count)=>sum-(count/value.length)*Math.log2(count/value.length),0);
    if(entropy>=3.9)return value;
  }
  throw new Error("Cannot construct high-entropy noncredential detector fixture");
}
const cases=[
  {name:"public-private-preview-profile",file:"docs/qa/e4-private-preview-safe.json",value:privatePreviewProfile,expected:0},
  {name:"private-preview-other-value",file:"docs/qa/e4-private-preview-safe.json",value:noncredentialCanary("private-preview"),expected:1},
  {name:"private-preview-other-path",file:"unrelated-config.txt",value:privatePreviewProfile,expected:1},
  {name:"private-preview-mutated-digest",file:"docs/qa/e4-private-preview-safe.json",value:"b"+privatePreviewProfile.slice(1),expected:1},
  {name:"public-profile-js",file:"tests/ops/restore-business-contract.mjs",value:profile,expected:0},
  {name:"public-profile-python",file:"tests/ops/restore-business-remote.py",value:profile,expected:0},
  {name:"public-worker-report",file:"docs/ops/WORKER_ALERT_DRILL_591.json",value:profile,expected:0},
  {name:"other-value-same-js-path",file:"tests/ops/restore-business-contract.mjs",value:noncredentialCanary("legacy-js"),expected:1},
  {name:"other-value-same-python-path",file:"tests/ops/restore-business-remote.py",value:noncredentialCanary("legacy-python"),expected:1},
  {name:"same-public-value-other-path",file:"unrelated-config.txt",value:profile,expected:1},
  {name:"one-character-mutation",file:"tests/ops/restore-business-contract.mjs",value:"4"+profile.slice(1),expected:1},
];
const publicMigrationIdentities=[
  {name:"migration-filename",file:"src/server/runtime-schema.ts",value:"0005_bulk_operations.sql"},
  {name:"migration-0002-checksum",file:"deploy/staging/upgrade-original-observation.mjs",value:"e36cd53d36bb82c7af27438a350f089391475213860d7e9aee0ecf052726d524"},
  {name:"migration-0004-checksum",file:"deploy/staging/upgrade-original-observation.mjs",value:"af97c98d7a3775bad6219cfd3b381b638585acaf9f2c7e74ae1cf1bd0a0ea162"},
];
for(const identity of publicMigrationIdentities){
  cases.push(
    {...identity,marker:"api_key",expected:0},
    {...identity,name:identity.name+"-other-value",marker:"api_key",value:noncredentialCanary(identity.name),expected:1},
    {...identity,name:identity.name+"-other-path",file:"unrelated-config.txt",marker:"api_key",expected:1},
  );
}
for(const [index,item] of cases.entries()){
  const input=resolve(directory,"case"+index);mkdirSync(input);
  const path=resolve(input,item.file);if(!path.startsWith(input+sep))throw new Error("Canary boundary");
  mkdirSync(dirname(path),{recursive:true});
  // These are generated noncredential canaries, never real service credentials.
  writeFileSync(path,`${item.marker ?? "accessProfileSha256"}: '${item.value}'\n`,{flag:"wx"});
  for(const args of [["init","--quiet",input],["-C",input,"add","--",item.file],["-C",input,"-c","user.name=Morphiume canary","-c","user.email=canary@fixture.invalid","commit","--quiet","-m","Noncredential detector canary"]]){
    const prepared=spawnSync("git",args,{encoding:"utf8",windowsHide:true,timeout:10000});
    if(prepared.error||prepared.status!==0)throw new Error("Isolated detector repository setup failed");
  }
  const report=resolve(directory,"report"+index+".json");
  const result=spawnSync(executable,["git","--log-opts=-1","--config",configuration,"--redact","--no-banner","--report-format=json","--report-path="+report],{cwd:input,encoding:"utf8",windowsHide:true,timeout:20000});
  if(result.error||result.status!==item.expected)throw new Error("Detector configuration canary failed: "+item.name);
  const findings=JSON.parse(readFileSync(report,"utf8"));
  if(findings.length!==item.expected||findings.some(x=>x.RuleID!=="generic-api-key"||x.Secret!=="REDACTED"))throw new Error("Detector result mismatch: "+item.name);
}
console.log(JSON.stringify({mode:"exact-public-identity-exceptions-verified",cases:cases.length,passed:cases.length,realCredentialsUsed:false,otherValuesAndPathsDetected:true,defaultGenericRuleRetained:true}));
