import {spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from "node:fs";
import {resolve,dirname,sep} from "node:path";

const executable=process.argv[2];
if(!executable)throw new Error("Pass the verified Gitleaks binary path");
const privateRoot=resolve(".local");mkdirSync(privateRoot,{recursive:true});
const directory=mkdtempSync(resolve(privateRoot,"gitleaks-policy-"));
if(!directory.startsWith(privateRoot+sep))throw new Error("Private test boundary");
const configuration=resolve(".gitleaks.toml");
const profile="3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c";
const cases=[
  {name:"public-profile-js",file:"tests/ops/restore-business-contract.mjs",value:profile,expected:0},
  {name:"public-profile-python",file:"tests/ops/restore-business-remote.py",value:profile,expected:0},
  {name:"public-worker-report",file:"docs/ops/WORKER_ALERT_DRILL_591.json",value:profile,expected:0},
  {name:"other-value-same-js-path",file:"tests/ops/restore-business-contract.mjs",value:randomBytes(32).toString("hex"),expected:1},
  {name:"other-value-same-python-path",file:"tests/ops/restore-business-remote.py",value:randomBytes(32).toString("hex"),expected:1},
  {name:"same-public-value-other-path",file:"unrelated-config.txt",value:profile,expected:1},
  {name:"one-character-mutation",file:"tests/ops/restore-business-contract.mjs",value:"4"+profile.slice(1),expected:1},
];
for(const [index,item] of cases.entries()){
  const input=resolve(directory,"case"+index);mkdirSync(input);
  const path=resolve(input,item.file);if(!path.startsWith(input+sep))throw new Error("Canary boundary");
  mkdirSync(dirname(path),{recursive:true});
  // These are generated noncredential canaries, never real service credentials.
  writeFileSync(path,`accessProfileSha256: '${item.value}'\n`,{flag:"wx"});
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
console.log(JSON.stringify({mode:"exact-public-profile-exception-verified",cases:cases.length,passed:cases.length,realCredentialsUsed:false,otherValuesAndPathsDetected:true,defaultGenericRuleRetained:true}));
