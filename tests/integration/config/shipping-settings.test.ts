import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { TestCookies,totpForUri } from "../auth/helpers";
import type { Actor } from "../../../src/contracts/commerce";

config({path:".env.local",quiet:true});
const enabled=process.env.DEPLOYMENT_ENV==="test" && process.env.PAYMENT_PROVIDER==="mock" && !!process.env.DATABASE_URL;
describe.skipIf(!enabled)("shipping configuration with native MFA and real isolated PostgreSQL",()=>{
  let pool:typeof import("../../../src/server/db")["pool"];
  let shipping:typeof import("../../../src/server/shipping");
  let auth:typeof import("../../../src/server/auth/index");
  let actors:typeof import("../../../src/server/auth/actors");
  let original:Record<string,unknown>|undefined;
  const users:string[]=[];
  let owner:Actor,finance:Actor,support:Actor;
  const settings=(version:number)=>({shippingFeeToman:"۴۰٬۰۰۰",freeShippingThresholdToman:"۱۵۰٬۰۰۰",expectedVersion:version,reason:"تنظیمات مصنوعی برای آزمون مستقل؛ پس از اجرا بازگردانده می‌شود."});
  async function authenticated(role:"owner"|"finance"|"support") {
    const id=randomUUID(),email=`qa-shipping-${id}@fixture.invalid`,password=`Qa-${randomUUID()}-Password!`,jar=new TestCookies();
    users.push(id);
    await pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,\'QA shipping admin\',$2,true)',[id,email]);
    await pool.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)",[randomUUID(),id,await hashPassword(password)]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)",[id,role]);
    async function request(path:string,body:unknown|(()=>unknown)) {
      for(let attempt=0;attempt<3;attempt++) {
        const value=typeof body==="function"?body():body;
        const response=await auth.adminAuth.handler(new Request(`${process.env.APP_BASE_URL}/api/admin/auth${path}`,{method:"POST",headers:{Origin:process.env.APP_BASE_URL!,"Content-Type":"application/json",Cookie:jar.header()},body:JSON.stringify(value)}));
        if(response.status===429 && attempt<2) {
          // BetterAuth's sensitive sign-in rule is 3 requests/10s. Respect the
          // actual response; never clear limiter rows or invent another IP.
          const retryHeader=response.headers.get("X-Retry-After")??response.headers.get("Retry-After");
          // Inspected BetterAuth1.7.7 two-factor plugin: max3 requests/10s;
          // unlike sensitive sign-in, it can omit Retry-After on429.
          const seconds=retryHeader===null && path.startsWith("/two-factor/") ? 10 : Number(retryHeader);
          if(!Number.isInteger(seconds) || seconds<1 || seconds>15) throw new Error("Unexpected native fixture rate-limit retry interval");
          await new Promise(resolve=>setTimeout(resolve,seconds*1000+100));
          continue;
        }
        jar.collect(response);expect(response.status).toBe(200);return response.json();
      }
      throw new Error("Native fixture rate limit did not clear after permitted waits");
    }
    await request("/sign-in/email",{email,password});
    const enrolled=await request("/two-factor/enable",{password}) as {totpURI:string};
    await request("/two-factor/verify-totp",()=>({code:totpForUri(enrolled.totpURI),trustDevice:false}));
    return (await actors.adminSession(new Headers({cookie:jar.header()}))).actor;
  }
  beforeAll(async()=>{
    const target=new URL(process.env.DATABASE_URL!);
    if(!["localhost","127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("morphiume_staging")) throw new Error("Shipping tests refuse a nonisolated database");
    ({pool}=await import("../../../src/server/db"));shipping=await import("../../../src/server/shipping");auth=await import("../../../src/server/auth/index");actors=await import("../../../src/server/auth/actors");
    original=(await pool.query("SELECT * FROM store_setting WHERE key='shipping'")).rows[0];
    await pool.query("DELETE FROM store_setting WHERE key='shipping'");
    owner=await authenticated("owner");finance=await authenticated("finance");support=await authenticated("support");
  },60000);
  afterAll(async()=>{
    if(!pool)return;
    if(original) await pool.query("INSERT INTO store_setting(key,value,version,updated_by,updated_at) VALUES('shipping',$1::jsonb,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at",[JSON.stringify(original.value),original.version,original.updated_by,original.updated_at]);
    else await pool.query("DELETE FROM store_setting WHERE key='shipping'");
    if(users.length){await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])',[users]);await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])",[users]);}
    await pool.end();
  });
  it("uses an explicit unconfigured test default and converts Persian Toman exactly once",async()=>{
    expect(await shipping.getShippingSettings()).toMatchObject({configured:false,version:1,policyVersion:"staging-policy-v1",shippingFee:{amountIrr:"0",currency:"IRR"},freeShippingThreshold:null});
    const saved=await shipping.saveShippingSettings(owner,settings(1));
    expect(saved).toMatchObject({configured:true,version:2,policyVersion:"shipping-v2",shippingFee:{amountIrr:"400000",currency:"IRR"},freeShippingThreshold:{amountIrr:"1500000",currency:"IRR"}});
    expect((await pool.query("SELECT actor_id,reason FROM audit_event WHERE action='shipping.policy_updated' AND actor_id=$1",[owner.userId])).rows).toHaveLength(1);
  });
  it("rejects support, a revoked role and a stale factor inside the mutation transaction",async()=>{
    const version=(await shipping.getShippingSettings()).version;
    await expect(shipping.saveShippingSettings(support,settings(version))).rejects.toMatchObject({code:"FORBIDDEN"});
    await pool.query("UPDATE admin_grant SET factor_verified_at=now()-interval '6 minutes' WHERE session_id=$1",[owner.sessionId]);
    await expect(shipping.saveShippingSettings(owner,settings(version))).rejects.toMatchObject({code:"MFA_REQUIRED"});
    await pool.query("DELETE FROM role_membership WHERE user_id=$1",[owner.userId]);
    await pool.query("UPDATE admin_grant SET factor_verified_at=now() WHERE session_id=$1",[owner.sessionId]);
    await expect(shipping.saveShippingSettings(owner,settings(version))).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await shipping.getShippingSettings()).version).toBe(version);
  });
  it("allows finance with native proof, detects stale versions and can disable the free threshold",async()=>{
    const saved=await shipping.saveShippingSettings(finance,{...settings(2),shippingFeeToman:"۳۵۰۰۰",freeShippingThresholdToman:null});
    expect(saved).toMatchObject({version:3,shippingFee:{amountIrr:"350000",currency:"IRR"},freeShippingThreshold:null});
    await expect(shipping.saveShippingSettings(finance,settings(2))).rejects.toMatchObject({code:"CONFLICT"});
    for(const amount of ["-1","1.5","100000001"]) await expect(shipping.saveShippingSettings(finance,{...settings(3),shippingFeeToman:amount})).rejects.toMatchObject({code:"VALIDATION"});
    expect((await shipping.getShippingSettings()).version).toBe(3);
  });
  it("serializes settings changes against an active transaction even when the policy row is absent",async()=>{
    await pool.query("DELETE FROM store_setting WHERE key='shipping'");
    const reader=await pool.connect();
    try {
      await reader.query("BEGIN");expect(await shipping.readShippingPolicy(reader)).toMatchObject({shippingFeeIrr:0n,policyVersion:"staging-policy-v1"});
      let completed=false;
      const change=shipping.saveShippingSettings(finance,settings(1)).then(result=>{completed=true;return result;});
      await expect.poll(async()=>Number((await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=818002 AND mode='ExclusiveLock' AND NOT granted")).rows[0].n)).toBe(1);
      expect(completed).toBe(false);
      await reader.query("COMMIT");
      expect((await change).version).toBe(2);
    } finally {await reader.query("ROLLBACK");reader.release();}
  });
  it("rejects a genuine proof that expires while the settings writer waits for a lock",async()=>{
    const reader=await pool.connect();
    try {
      await reader.query("BEGIN");await shipping.readShippingPolicy(reader);
      // Age this fixture's existing native proof; no proof is granted/refreshed.
      await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '4 minutes 59 seconds' WHERE session_id=$1",[finance.sessionId]);
      const version=(await shipping.getShippingSettings()).version;
      const result=shipping.saveShippingSettings(finance,settings(version)).then(()=>"committed",error=>error.code as string);
      await expect.poll(async()=>Number((await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=818002 AND mode='ExclusiveLock' AND NOT granted")).rows[0].n)).toBe(1);
      await new Promise(resolve=>setTimeout(resolve,1500));
      await reader.query("COMMIT");
      expect(await result).toBe("MFA_REQUIRED");
      expect((await shipping.getShippingSettings()).version).toBe(version);
    } finally {await reader.query("ROLLBACK");reader.release();}
  });
});
