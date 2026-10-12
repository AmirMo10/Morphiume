import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor, BulkEditInput, ProductDto } from "../../../src/contracts/commerce";
import { createCommerce, type Commerce } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";
import { createIsolatedDatabase } from "./isolated-database";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL committed bulk fresh proof",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,commerce:Commerce,applicationName:string;
  beforeAll(async()=>{isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;applicationName=`TEST-isolated-${isolated.schema}`;commerce=createCommerce({pool,payments:new MockPaymentProvider(pool,"test","http://127.0.0.1:3000"),deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000"});},60000);
  const users:string[]=[],products:string[]=[];
  let admin:Actor,product:ProductDto,input:BulkEditInput;
  beforeEach(async()=>{
    const userId=randomUUID(),sessionId=randomUUID(),suffix=randomUUID();users.push(userId);admin={userId,sessionId,kind:"admin"};
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number,phone_number_verified,two_factor_enabled) VALUES($1,\'TEST bulk MFA fixture\',$2,true,$3,true,true)',[userId,`${userId}@fixture.invalid`,`+989${String(randomInt(0,1_000_000_000)).padStart(9,"0")}`]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);
    await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[userId]);await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);
    product=await commerce.createProduct(admin,{name:`TEST bulk MFA ${suffix}`,slug:`test-bulk-mfa-${suffix}`,description:"TEST authorization fixture",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-MFA-${suffix}`,volumeMl:50,priceToman:"1000",initialStock:5}]});products.push(product.id);
    input={operations:[{variantId:product.variants[0]!.id,expectedProductVersion:product.version,priceToman:"2000",inventoryDelta:1}],reason:"TEST fresh proof",operationKey:randomUUID(),dryRun:false};
  });
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("permits an ordinary-grant preview but rejects stale proof before commit effects",async()=>{
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[admin.sessionId]);
    expect((await commerce.bulkEdit(admin,{...input,dryRun:true})).dryRun).toBe(true);await expect(commerce.bulkEdit(admin,input)).rejects.toMatchObject({code:"MFA_REQUIRED",status:403});
    expect((await commerce.getProduct(product.id,admin)).version).toBe(product.version);expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1",[product.variants[0]!.id])).rows[0].on_hand).toBe(5);
    expect((await pool.query("SELECT id FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,input.operationKey])).rows).toHaveLength(0);
  });
  it("preserves the saved result while replay requires current permission and fresh proof",async()=>{
    const committed=await commerce.bulkEdit(admin,input);await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[admin.sessionId]);
    await expect(commerce.bulkEdit(admin,input)).rejects.toMatchObject({code:"MFA_REQUIRED"});expect((await commerce.bulkEdit(admin,{...input,dryRun:true})).changes).toEqual(committed.changes);
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp() WHERE session_id=$1",[admin.sessionId]);expect(await commerce.bulkEdit(admin,input)).toEqual(committed);
    await pool.query("UPDATE role_membership SET role='support' WHERE user_id=$1",[admin.userId]);await expect(commerce.bulkEdit(admin,input)).rejects.toMatchObject({code:"FORBIDDEN"});
    const saved=(await pool.query("SELECT result FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,input.operationKey])).rows[0].result;expect(saved).toEqual(committed);
    expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1",[product.variants[0]!.id])).rows[0].on_hand).toBe(6);expect((await pool.query("SELECT id FROM inventory_ledger WHERE operation_key=$1",[`bulk:${committed.operationId}:${product.variants[0]!.id}`])).rows).toHaveLength(1);
  });
  it("rejects proof that ages out during a real product-lock wait using wall-clock time",async()=>{
    const blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query("SELECT id FROM product WHERE id=$1 FOR UPDATE",[product.id]);
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '297.5 seconds' WHERE session_id=$1",[admin.sessionId]);
    let done=false;const pending=commerce.bulkEdit(admin,input).then((value)=>({value,error:undefined}),(error:unknown)=>({value:undefined,error})).finally(()=>{done=true;});
    try{
      let waiting=false;const deadline=Date.now()+2400;
      while(Date.now()<deadline && !done){const rows=(await pool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id,name,version FROM product%'",[applicationName])).rows;if(rows.length){waiting=true;break;}}
      expect(waiting).toBe(true);
      const remaining=(await blocker.query<{seconds:string}>("SELECT greatest(0,extract(epoch FROM factor_verified_at+interval '5 minutes'-clock_timestamp()))::text AS seconds FROM admin_grant WHERE session_id=$1",[admin.sessionId])).rows[0]!.seconds;
      await blocker.query("SELECT pg_sleep($1)",[Number(remaining)+0.1]);await blocker.query("COMMIT");
      expect((await pending).error).toMatchObject({code:"MFA_REQUIRED"});expect((await commerce.getProduct(product.id,admin)).version).toBe(product.version);
      expect((await pool.query("SELECT id FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,input.operationKey])).rows).toHaveLength(0);expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1",[product.variants[0]!.id])).rows[0].on_hand).toBe(5);
    }finally{await blocker.query("ROLLBACK");blocker.release();await pending;}
  });
  it("rechecks proof after authorization locks before returning a saved replay",async()=>{
    const committed=await commerce.bulkEdit(admin,input),blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query("SELECT role FROM role_membership WHERE user_id=$1 FOR UPDATE",[admin.userId]);
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '297.5 seconds' WHERE session_id=$1",[admin.sessionId]);
    let done=false;const pending=commerce.bulkEdit(admin,input).then((value)=>({value,error:undefined}),(error:unknown)=>({value:undefined,error})).finally(()=>{done=true;});
    try{
      let waiting=false;const deadline=Date.now()+2400;
      while(Date.now()<deadline && !done){const rows=(await pool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT role FROM role_membership%FOR SHARE'",[applicationName])).rows;if(rows.length){waiting=true;break;}}
      expect(waiting).toBe(true);
      const remaining=(await blocker.query<{seconds:string}>("SELECT greatest(0,extract(epoch FROM factor_verified_at+interval '5 minutes'-clock_timestamp()))::text AS seconds FROM admin_grant WHERE session_id=$1",[admin.sessionId])).rows[0]!.seconds;
      await blocker.query("SELECT pg_sleep($1)",[Number(remaining)+0.1]);await blocker.query("COMMIT");expect((await pending).error).toMatchObject({code:"MFA_REQUIRED"});
      expect((await pool.query("SELECT result FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,input.operationKey])).rows[0].result).toEqual(committed);
      expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1",[product.variants[0]!.id])).rows[0].on_hand).toBe(6);
      await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp() WHERE session_id=$1",[admin.sessionId]);expect(await commerce.bulkEdit(admin,input)).toEqual(committed);
    }finally{await blocker.query("ROLLBACK");blocker.release();await pending;}
  });
});
