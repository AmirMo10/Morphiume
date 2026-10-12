import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { NextRequest } from "next/server";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { TestCookies,totpForUri } from "../auth/helpers";
import type { Actor } from "../../../src/contracts/commerce";

config({path:".env.local",quiet:true});
const enabled=process.env.DEPLOYMENT_ENV==="test" && process.env.PAYMENT_PROVIDER==="mock" && !!process.env.DATABASE_URL;
describe.skipIf(!enabled)("native administrator proof at mutation lock boundaries",()=>{
  let pool:typeof import("../../../src/server/db")["pool"];
  let admin:typeof import("../../../src/server/admin");
  let auth:typeof import("../../../src/server/auth/index");
  let actors:typeof import("../../../src/server/auth/actors");
  const users:string[]=[];
  let owner:{actor:Actor;cookie:string},target:{actor:Actor;cookie:string};
  async function authenticated(role:"owner"|"support") {
    const id=randomUUID(),email=`qa-admin-boundary-${id}@fixture.invalid`,password=`Qa-${randomUUID()}-Password!`,jar=new TestCookies();
    users.push(id);
    await pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,\'QA admin boundary\',$2,true)',[id,email]);
    await pool.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)",[randomUUID(),id,await hashPassword(password)]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)",[id,role]);
    async function request(path:string,body:unknown|(()=>unknown)) {
      for(let attempt=0;attempt<3;attempt++) {
        const value=typeof body==="function"?body():body;
        const response=await auth.adminAuth.handler(new Request(`${process.env.APP_BASE_URL}/api/admin/auth${path}`,{method:"POST",headers:{Origin:process.env.APP_BASE_URL!,"Content-Type":"application/json",Cookie:jar.header()},body:JSON.stringify(value)}));
        if(response.status===429 && attempt<2) {
          const retryHeader=response.headers.get("X-Retry-After")??response.headers.get("Retry-After");
          // BetterAuth1.7.7's two-factor plugin can return429 without a retry
          // header; its inspected native rule is max3 in10s. Respect that
          // window only for those endpoints and recompute the TOTP body.
          const seconds=retryHeader===null && path.startsWith("/two-factor/") ? 10 : Number(retryHeader);
          if(!Number.isInteger(seconds)||seconds<1||seconds>15)throw new Error("Unexpected native retry interval");
          await new Promise(resolve=>setTimeout(resolve,seconds*1000+100));continue;
        }
        jar.collect(response);expect(response.status).toBe(200);return response.json();
      }
      throw new Error("Native fixture rate limit did not clear");
    }
    await request("/sign-in/email",{email,password});
    const enrolled=await request("/two-factor/enable",{password}) as {totpURI:string};
    await request("/two-factor/verify-totp",()=>({code:totpForUri(enrolled.totpURI),trustDevice:false}));
    return {actor:(await actors.adminSession(new Headers({cookie:jar.header()}))).actor,cookie:jar.header()};
  }
  beforeAll(async()=>{
    const database=new URL(process.env.DATABASE_URL!);
    if(!["localhost","127.0.0.1"].includes(database.hostname)||!database.pathname.endsWith("morphiume_staging"))throw new Error("Admin tests require isolated DB");
    ({pool}=await import("../../../src/server/db"));admin=await import("../../../src/server/admin");auth=await import("../../../src/server/auth/index");actors=await import("../../../src/server/auth/actors");
    owner=await authenticated("owner");target=await authenticated("support");
  },60000);
  afterAll(async()=>{
    if(!pool)return;
    if(users.length){await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])',[users]);await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])",[users]);}
    await pool.end();
  });
  it("rejects native owner proof that expires while a target account is locked",async()=>{
    const blocker=await pool.connect();
    const before=(await pool.query('SELECT disabled FROM "user" WHERE id=$1',[target.actor.userId])).rows[0];
    let pending:Promise<string>|undefined;
    try {
      await blocker.query("BEGIN");await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[target.actor.userId]);
      // Only age an existing native proof; no MFA proof is granted or refreshed.
      await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '297.5 seconds' WHERE session_id=$1",[owner.actor.sessionId]);
      const request=new NextRequest(`${process.env.APP_BASE_URL}/api/admin/roles`,{headers:{cookie:owner.cookie}});
      pending=admin.adminDirectory(request,["admin","roles"],"POST",{userId:target.actor.userId,roles:[],disabled:true,reason:"آزمون انقضای تأیید هنگام انتظار برای قفل"}).then(()=>"committed",error=>error.code as string);
      await expect.poll(async()=>Number((await pool.query("SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query='SELECT id FROM \"user\" WHERE id=$1 FOR UPDATE'")).rows[0].n)).toBeGreaterThan(0);
      const seconds=Number((await blocker.query("SELECT greatest(0,extract(epoch FROM factor_verified_at+interval '5 minutes'-clock_timestamp()))::text AS seconds FROM admin_grant WHERE session_id=$1",[owner.actor.sessionId])).rows[0].seconds);
      await blocker.query("SELECT pg_sleep($1)",[seconds+0.1]);await blocker.query("COMMIT");
      expect(await pending).toBe("MFA_REQUIRED");
      expect((await pool.query('SELECT disabled FROM "user" WHERE id=$1',[target.actor.userId])).rows[0]).toEqual(before);
      expect((await pool.query("SELECT role FROM role_membership WHERE user_id=$1",[target.actor.userId])).rows).toEqual([{role:"support"}]);
      expect((await pool.query("SELECT id FROM session WHERE id=$1",[target.actor.sessionId])).rowCount).toBe(1);
    } finally {await blocker.query("ROLLBACK");blocker.release();if(pending)await pending;}
  });
  it("rejects a revoked ordinary grant after waiting for the public-settings lock",async()=>{
    const original=await admin.getSettings(),blocker=await pool.connect();let pending:Promise<string>|undefined;
    try {
      await blocker.query("BEGIN");await blocker.query("SELECT pg_advisory_xact_lock(818001)");
      pending=admin.saveSettings(owner.actor,{contactPhone:null,email:null,address:null,shippingDescription:null,expectedVersion:original.version}).then(()=>"committed",error=>error.code as string);
      await expect.poll(async()=>Number((await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=818001 AND mode='ExclusiveLock' AND NOT granted")).rows[0].n)).toBe(1);
      await pool.query("DELETE FROM role_membership WHERE user_id=$1",[owner.actor.userId]);await blocker.query("COMMIT");
      expect(await pending).toBe("FORBIDDEN");expect(await admin.getSettings()).toEqual(original);
    } finally {await blocker.query("ROLLBACK");blocker.release();if(pending)await pending;}
  });
});
