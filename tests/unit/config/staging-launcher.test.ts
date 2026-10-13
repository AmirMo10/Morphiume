import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function launch(extra:Record<string,unknown>,inherited="true") {
  // Retained temporary synthetic inputs; no actual application credentials.
  const directory=mkdtempSync(join(tmpdir(),"morphiume-launcher-")),file=join(directory,"config.json");
  writeFileSync(file,JSON.stringify({DATABASE_URL:"postgresql://synthetic.invalid/test",PAYMENT_PROVIDER:"mock",SMS_PROVIDER:"mock",...extra}),{flag:"wx",mode:0o600});
  return spawnSync(process.execPath,[resolve("deploy/staging/runtime.mjs"),process.execPath,"-e","process.stdout.write(JSON.stringify({capture:process.env.ANONYMOUS_ANALYTICS_ENABLED}))"],{env:{...process.env,DEPLOYMENT_ENV:"staging",MORPHIUME_RUNTIME_CONFIG:file,ANONYMOUS_ANALYTICS_ENABLED:inherited},encoding:"utf8",timeout:10000,windowsHide:true});
}
describe("actual staging launcher controlled analytics switch",()=>{
  it("keeps legacy configs disabled despite inherited host opt-in",()=>{
    const result=launch({});expect(result.status).toBe(0);expect(JSON.parse(result.stdout)).toEqual({capture:"false"});
  });
  it.each(["true","false"])("passes only explicit private config switch%s to child",capture=>{
    const result=launch({ANONYMOUS_ANALYTICS_ENABLED:capture},"false");expect(result.status).toBe(0);expect(JSON.parse(result.stdout)).toEqual({capture});
  });
  it.each([true,"yes","TRUE",1,null])("rejects unsupported activation value%j before spawning",value=>{
    const result=launch({ANONYMOUS_ANALYTICS_ENABLED:value});expect(result.status).toBe(1);expect(result.stdout).toBe("");expect(result.stderr).toContain("Invalid anonymous analytics activation setting.");
  });
  it("retains unknown-key rejection without exposing its value",()=>{
    const result=launch({EXTRA_PRIVATE_FIELD:"TEST-private-config-value-canary"});expect(result.status).toBe(1);expect(result.stdout).toBe("");expect(result.stderr).not.toContain("TEST-private-config-value-canary");
  });
});
