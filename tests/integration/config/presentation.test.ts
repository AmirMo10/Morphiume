import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import type { Actor, Role } from "../../../src/contracts/commerce";
import { createPresentationStore,readCheckoutEnabled } from "../../../src/server/presentation";
import { defaultPresentation } from "../../../src/server/presentation-schema";
import { createIsolatedDatabase } from "../backend/isolated-database";

config({path:".env.local",quiet:true});
const runtime=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL,ownerUrl=process.env.TEST_MIGRATION_DATABASE_URL??process.env.MIGRATION_DATABASE_URL;
describe.skipIf(!runtime || !ownerUrl)("isolated PostgreSQL editable presentation",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,store:ReturnType<typeof createPresentationStore>,owner:Actor,editor:Actor;
  async function fixture(role:Role):Promise<Actor> {
    const userId=randomUUID(),sessionId=randomUUID();
    // These are controlled domain grants, not proof of native MFA issuance.
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,two_factor_enabled) VALUES($1,\'TEST presentation fixture\',$2,true,true)',[userId,`${userId}@fixture.invalid`]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)",[userId,role]);
    await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);
    return {userId,sessionId,kind:"admin"};
  }
  function input(){return {...structuredClone(defaultPresentation),expectedVersion:1,reason:"TEST approved display edit"};}
  beforeAll(async()=>{isolated=await createIsolatedDatabase(runtime!,ownerUrl!);pool=isolated.pool;store=createPresentationStore(pool);owner=await fixture("owner");editor=await fixture("product_manager");});
  beforeEach(async()=>{
    await pool.query("DELETE FROM store_setting WHERE key='presentation'");
    await pool.query('UPDATE "user" SET disabled=false,two_factor_enabled=true WHERE id=ANY($1::text[])',[[owner.userId,editor.userId]]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner'),($2,'product_manager') ON CONFLICT DO NOTHING",[owner.userId,editor.userId]);
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour' WHERE session_id=ANY($1::text[])",[[owner.sessionId,editor.sessionId]]);
  });
  afterAll(async()=>{await isolated?.close();});
  it("starts with no invented service/banner/brand claim and saves one versioned audited content edit",async()=>{
    const initial=await store.getPresentation();expect(initial).toMatchObject({configured:false,version:1,banner:null,services:[],maintenance:{enabled:false,message:null}});
    const updated=await store.savePresentation(editor,{...input(),heroTitle:"TEST approved heading",heroDescription:"TEST approved description"});
    expect(updated).toMatchObject({version:2,configured:true,heroTitle:"TEST approved heading"});
    await expect(store.savePresentation(editor,{...input(),heroTitle:"TEST stale overwrite"})).rejects.toMatchObject({code:"CONFLICT",status:409});
    expect((await store.getPresentation()).heroTitle).toBe("TEST approved heading");
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_event WHERE action='presentation.updated' AND actor_id=$1",[editor.userId])).rows[0].count).toBe(1);
  });
  it("requires an owner for any maintenance change and rejects stale/revoked/disabled proof without a setting effect",async()=>{
    const changed={...input(),maintenance:{enabled:true,message:"TEST maintenance"}};
    await expect(store.savePresentation(editor,changed)).rejects.toMatchObject({code:"FORBIDDEN"});
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[owner.sessionId]);
    await expect(store.savePresentation(owner,changed)).rejects.toMatchObject({code:"MFA_REQUIRED",status:403});
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp() WHERE session_id=$1",[owner.sessionId]);
    await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1',[owner.userId]);
    await expect(store.savePresentation(owner,changed)).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await store.getPresentation()).configured).toBe(false);
  });
  it("keeps unavailable historical selections editable while public reads remove them and new hidden targets are denied",async()=>{
    const productId=randomUUID(),variantId=randomUUID(),slug=`test-presentation-${randomUUID()}`,pageSlug=`test-policy-${randomUUID()}`;
    await pool.query("INSERT INTO product(id,name,slug,status) VALUES($1,'TEST featured fixture',$2,'published')",[productId,slug]);
    await pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,50,1000)",[variantId,productId,`TEST-${randomUUID()}`]);
    await pool.query("INSERT INTO content_page(slug,title,body,status) VALUES($1,'TEST approved policy','TEST policy fixture','published')",[pageSlug]);
    const value={...input(),featuredProductIds:[productId],footerLinks:[{label:"TEST policy",href:`/pages/${pageSlug}`}],heroAction:{label:"TEST featured",href:`/products/${slug}`}};
    const saved=await store.savePresentation(owner,value);expect(saved.unavailableProductIds).toEqual([]);
    await pool.query("UPDATE product SET status='archived' WHERE id=$1",[productId]);await pool.query("UPDATE content_page SET status='draft' WHERE slug=$1",[pageSlug]);
    const visible=await store.getPresentation();expect(visible.featuredProductIds).toEqual([]);expect(visible.footerLinks).toEqual([]);expect(visible.heroAction).toBeNull();
    const editable=await store.getAdminPresentation(owner);expect(editable.featuredProductIds).toEqual([productId]);expect(editable.unavailableProductIds).toEqual([productId]);expect(editable.unavailableLinks).toHaveLength(2);
    const retained=await store.savePresentation(owner,{...value,expectedVersion:saved.version,heroTitle:"TEST renamed heading"});expect(retained.featuredProductIds).toEqual([productId]);
    await expect(store.savePresentation(owner,{...value,expectedVersion:retained.version,footerLinks:[{label:"TEST hidden new",href:"/pages/unpublished-new-policy"}]})).rejects.toMatchObject({code:"VALIDATION"});
  });
  async function observedWait() {
    for(let count=0;count<50;count++) {
      const waiting=await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[`TEST-isolated-${isolated.schema}`]);
      if(waiting.rows[0].count>0)return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error("Expected real presentation lock wait was not observed");
  }
  it("serializes a missing maintenance row with an active checkout transaction and rejects concurrent stale writes",async()=>{
    const reader=await pool.connect();await reader.query("BEGIN");
    let pending:Promise<unknown>|undefined;
    try {
      expect(await readCheckoutEnabled(reader)).toBe(true);
      pending=store.savePresentation(owner,{...input(),maintenance:{enabled:true,message:"TEST controlled pause"}});
      await observedWait();expect((await store.getPresentation()).configured).toBe(false);
      await reader.query("COMMIT");await pending;
      expect((await store.getPresentation()).maintenance.enabled).toBe(true);
      await expect(store.savePresentation(owner,{...input(),heroTitle:"TEST stale concurrent writer"})).rejects.toMatchObject({code:"CONFLICT"});
    }finally{await reader.query("ROLLBACK");reader.release();await pending?.catch(()=>{});}
  });
  it("uses wall-clock proof after a real authorization wait and makes revoked-role denial win over old factor age",async()=>{
    for(const revoke of [false,true]) {
      await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner') ON CONFLICT DO NOTHING",[owner.userId]);
      await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '299 seconds' WHERE session_id=$1",[owner.sessionId]);
      const blocker=await pool.connect();await blocker.query("BEGIN");
      await blocker.query(revoke?"DELETE FROM role_membership WHERE user_id=$1":"UPDATE role_membership SET role=role WHERE user_id=$1",[owner.userId]);
      const pending=store.savePresentation(owner,{...input(),maintenance:{enabled:true,message:"TEST paused"}}).then(()=>"unexpected_success",error=>String((error as {code?:string}).code));
      try {await observedWait();await new Promise(resolve=>setTimeout(resolve,1500));await blocker.query("COMMIT");expect(await pending).toBe(revoke?"FORBIDDEN":"MFA_REQUIRED");}
      finally{await blocker.query("ROLLBACK");blocker.release();await pending;}
      expect((await store.getPresentation()).configured).toBe(false);
    }
  });
});
