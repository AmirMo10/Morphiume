import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolCreation=vi.hoisted(()=>vi.fn());
vi.mock("pg",()=>({default:{Pool:class {
  constructor(){poolCreation();throw new Error("Database pool creation is forbidden in guard tests");}
}}}));
import { createIsolatedDatabase } from "../../integration/backend/isolated-database";

describe("isolated fixture guards before database access",()=>{
  const runtime="postgresql://fixture_runtime:fixture@127.0.0.1:15433/morphiume_staging",owner="postgresql://fixture_owner:fixture@127.0.0.1:15433/morphiume_staging";
  beforeEach(()=>{poolCreation.mockClear();vi.stubEnv("DEPLOYMENT_ENV","test");vi.stubEnv("PAYMENT_PROVIDER","mock");vi.stubEnv("SMS_PROVIDER","mock");});
  afterEach(()=>vi.unstubAllEnvs());
  it.each([
    ["live deployment",{DEPLOYMENT_ENV:"live"},runtime,owner],
    ["external database",{},runtime.replace("127.0.0.1","database.invalid"),owner.replace("127.0.0.1","database.invalid")],
    ["live database name",{},runtime.replace("morphiume_staging","morphiume_live"),owner.replace("morphiume_staging","morphiume_live")],
    ["real payment provider",{PAYMENT_PROVIDER:"zarinpal"},runtime,owner],
    ["real SMS provider",{SMS_PROVIDER:"external"},runtime,owner],
    ["different owner database",{},runtime,owner.replace("morphiume_staging","other_staging")],
    ["different owner address",{},runtime,owner.replace("127.0.0.1","database.invalid")],
    ["malformed database URL",{},"not a database URL",owner],
  ] as const)("rejects %s before even constructing a pool",async(_label,environment,url,migrationUrl)=>{
    for(const [key,value] of Object.entries(environment))vi.stubEnv(key,value);
    await expect(createIsolatedDatabase(url,migrationUrl)).rejects.not.toThrow("Database pool creation is forbidden in guard tests");expect(poolCreation).not.toHaveBeenCalled();
  });
  it("admits the canonical local mock staging target without performing database access",async()=>{
    await expect(createIsolatedDatabase(runtime,owner)).rejects.toThrow("Database pool creation is forbidden in guard tests");expect(poolCreation).toHaveBeenCalledTimes(1);
  });
});
