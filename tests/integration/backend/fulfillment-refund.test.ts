import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../../../src/contracts/commerce";
import { createCommerce } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const enabled=!!databaseUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL fulfillment and refund boundaries",()=>{
  const applicationName=`TEST-financial-boundary-${randomUUID()}`;
  const pool=new pg.Pool({connectionString:databaseUrl,max:5,application_name:applicationName}),mock=new MockPaymentProvider(pool,"test","http://127.0.0.1:3000");
  const commerce=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000"});
  const users:string[]=[],products:string[]=[];
  let admin:Actor,customer:Actor,orderId:string,receiptId:string,variantId:string;
  const shipped={carrier:"TEST carrier",trackingCode:"TEST tracking",status:"shipped" as const},delivered={...shipped,status:"delivered" as const};
  async function actor(kind:Actor["kind"]){
    const userId=randomUUID(),sessionId=randomUUID();users.push(userId);
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number,phone_number_verified,two_factor_enabled) VALUES($1,\'TEST boundary fixture\',$2,true,$3,true,$4)',[userId,`${userId}@fixture.invalid`,`+989${String(randomInt(0,1_000_000_000)).padStart(9,"0")}`,kind==="admin"]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);
    if(kind==="admin"){await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[userId]);await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);}
    return {userId,sessionId,kind};
  }
  async function fresh(){await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp() WHERE session_id=$1",[admin.sessionId]);}
  async function stale(){await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[admin.sessionId]);}
  async function snapshot(){
    const shipment=(await pool.query("SELECT status,carrier,tracking_code,shipped_at,updated_at FROM shipment WHERE order_id=$1",[orderId])).rows;
    const order=(await pool.query("SELECT status,payment_status,updated_at FROM orders WHERE id=$1",[orderId])).rows;
    const balance=(await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[variantId])).rows;
    const counts=(await pool.query("SELECT (SELECT count(*)::int FROM audit_event WHERE entity_type='order' AND entity_id=$1 AND action='shipment.updated') AS audits,(SELECT count(*)::int FROM order_event WHERE order_id=$1::uuid AND type LIKE 'shipment.%') AS events,(SELECT count(*)::int FROM outbox_job WHERE payload->>'orderId'=$1 AND type='shipment.updated') AS jobs",[orderId])).rows;
    return {shipment,order,balance,counts};
  }
  async function expiresWhileLocked<T>(lockSql:string,lockId:string,waitingPattern:string,work:()=>Promise<T>){
    const blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query(lockSql,[lockId]);
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '297.5 seconds' WHERE session_id=$1",[admin.sessionId]);
    let done=false;const pending=work().then((value)=>({value,error:undefined}),(error:unknown)=>({value:undefined,error})).finally(()=>{done=true;});
    try{
      let waiting=false;const deadline=Date.now()+2400;
      while(Date.now()<deadline && !done){const rows=(await pool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2",[applicationName,waitingPattern])).rows;if(rows.length){waiting=true;break;}}
      expect(waiting).toBe(true);
      const seconds=(await blocker.query<{seconds:string}>("SELECT greatest(0,extract(epoch FROM factor_verified_at+interval '5 minutes'-clock_timestamp()))::text AS seconds FROM admin_grant WHERE session_id=$1",[admin.sessionId])).rows[0]!.seconds;
      await blocker.query("SELECT pg_sleep($1)",[Number(seconds)+0.1]);await blocker.query("COMMIT");return await pending;
    }finally{await blocker.query("ROLLBACK");blocker.release();await pending;}
  }
  beforeEach(async()=>{
    admin=await actor("admin");customer=await actor("customer");const suffix=randomUUID();
    const p=await commerce.createProduct(admin,{name:`TEST fulfillment ${suffix}`,slug:`test-fulfillment-${suffix}`,description:"TEST controlled financial fixture",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-FIN-${suffix}`,volumeMl:50,priceToman:"1000",initialStock:3}]});products.push(p.id);await commerce.publishProduct(admin,p.id,p.version);variantId=p.variants[0]!.id;
    const {cart,guestToken}=await commerce.createCart(),filled=await commerce.setCartItem(cart.id,guestToken,variantId,1,cart.version),quote=await commerce.quoteCheckout(customer,guestToken,cart.id);
    const checkout=await commerce.createCheckout(customer,guestToken,{cartId:cart.id,cartVersion:filled.version,address:{recipient:"TEST recipient",phone:"09121234567",province:"TEST",city:"TEST",address:"TEST address",plaque:"1",postalCode:"1234567890"},shippingMethodId:"standard",quoteFingerprint:quote.fingerprint,policyVersion:quote.policyVersion},randomUUID());orderId=checkout.orderId;
    const authority=(await pool.query<{authority:string}>("SELECT authority FROM payment_attempt WHERE id=$1",[checkout.paymentAttemptId])).rows[0]!.authority;await mock.complete(authority,"paid");await commerce.verifyPayment(authority);receiptId=(await commerce.listReceipts(admin,orderId))[0]!.id;
  });
  afterAll(async()=>{await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])",[products]);await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])',[users]);await pool.query("DELETE FROM admin_grant WHERE session_id IN (SELECT id FROM session WHERE user_id=ANY($1::text[]))",[users]);await pool.end();});
  it("rejects delivered to shipped with no order, stock, tracking or history effects",async()=>{
    await commerce.recordShipment(admin,orderId,shipped);await commerce.recordShipment(admin,orderId,delivered);const before=await snapshot();
    await expect(commerce.recordShipment(admin,orderId,{...shipped,trackingCode:"TEST forbidden regression"})).rejects.toMatchObject({code:"NOT_ELIGIBLE"});expect(await snapshot()).toEqual(before);
    expect((await commerce.getOrder(customer,orderId)).status).toBe("completed");
  });
  it("keeps forward transitions and exact replays without extra audit or timestamp writes",async()=>{
    await expect(commerce.recordShipment(admin,orderId,delivered)).rejects.toMatchObject({code:"NOT_ELIGIBLE"});
    const sent=await commerce.recordShipment(admin,orderId,shipped);expect(sent.shipment?.status).toBe("shipped");const beforeSent=await snapshot();expect(await commerce.recordShipment(admin,orderId,shipped)).toEqual(sent);expect(await snapshot()).toEqual(beforeSent);
    const received=await commerce.recordShipment(admin,orderId,delivered);expect(received.status).toBe("completed");const beforeReceived=await snapshot();expect(await commerce.recordShipment(admin,orderId,delivered)).toEqual(received);expect(await snapshot()).toEqual(beforeReceived);
    const refund=await commerce.requestRefund(admin,orderId,receiptId,"10000","TEST later full refund",randomUUID());await commerce.completeManualRefund(admin,refund.id,"TEST controlled full refund evidence");const afterRefund=await snapshot();expect((await commerce.recordShipment(admin,orderId,delivered)).paymentStatus).toBe("refunded");expect(await snapshot()).toEqual(afterRefund);
  });
  it("never resurrects a cancelled shipment",async()=>{
    const request=await commerce.requestReturn(customer,orderId,"cancel","TEST pre-shipment cancellation");await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST accepted cancellation"});const before=await snapshot();
    for(const input of [shipped,delivered])await expect(commerce.recordShipment(admin,orderId,input)).rejects.toMatchObject({code:"NOT_ELIGIBLE"});expect(await snapshot()).toEqual(before);expect(before.balance[0]).toEqual({on_hand:3,reserved:0});
  });
  it("requires fresh proof for new/refund replay/completion while preserving stored results",async()=>{
    const key=randomUUID(),refund=await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST refund",key);await stale();
    await expect(commerce.requestRefund(admin,orderId,receiptId,"1000","TEST refund",key)).rejects.toMatchObject({code:"FORBIDDEN"});await expect(commerce.requestRefund(admin,orderId,receiptId,"1000","TEST other refund",randomUUID())).rejects.toMatchObject({code:"FORBIDDEN"});await expect(commerce.completeManualRefund(admin,refund.id,"TEST controlled evidence")).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await pool.query("SELECT id,status,evidence FROM refund WHERE order_id=$1",[orderId])).rows).toEqual([{id:refund.id,status:"pending",evidence:null}]);await fresh();expect(await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST refund",key)).toEqual(refund);await commerce.completeManualRefund(admin,refund.id,"TEST controlled evidence");
    const completed=(await pool.query("SELECT status,evidence FROM refund WHERE id=$1",[refund.id])).rows;await stale();await expect(commerce.completeManualRefund(admin,refund.id,"TEST controlled evidence")).rejects.toMatchObject({code:"FORBIDDEN"});expect((await pool.query("SELECT status,evidence FROM refund WHERE id=$1",[refund.id])).rows).toEqual(completed);await fresh();await commerce.completeManualRefund(admin,refund.id,"TEST controlled evidence");expect((await pool.query("SELECT id FROM audit_event WHERE entity_id=$1 AND action='refund.completed'",[refund.id])).rows).toHaveLength(1);
  });
  it("binds refund request replay to its actor and completion replay to exact evidence",async()=>{
    const key=randomUUID(),refund=await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST actor-bound refund",key),other=await actor("admin");await pool.query("UPDATE role_membership SET role='finance' WHERE user_id=$1",[other.userId]);
    await expect(commerce.requestRefund(other,orderId,receiptId,"1000","TEST actor-bound refund",key)).rejects.toMatchObject({code:"CONFLICT"});expect(await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST actor-bound refund",key)).toEqual(refund);
    const evidence="TEST exact transfer evidence";await commerce.completeManualRefund(admin,refund.id,evidence);const saved=(await pool.query("SELECT actor_id,status,evidence FROM refund WHERE id=$1",[refund.id])).rows;
    await commerce.completeManualRefund(admin,refund.id,evidence);await expect(commerce.completeManualRefund(admin,refund.id,"TEST different transfer evidence")).rejects.toMatchObject({code:"CONFLICT"});expect((await pool.query("SELECT actor_id,status,evidence FROM refund WHERE id=$1",[refund.id])).rows).toEqual(saved);expect(saved[0]).toEqual({actor_id:admin.userId,status:"succeeded",evidence});expect((await pool.query("SELECT id FROM audit_event WHERE entity_id=$1 AND action='refund.completed'",[refund.id])).rows).toHaveLength(1);
  });
  it("rejects an orphaned grant when the account factor is disabled for refunds and bulk commits",async()=>{
    const key=randomUUID(),refund=await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST factor-disabled refund",key);
    const product=(await pool.query<{version:number}>("SELECT version FROM product WHERE id=(SELECT product_id FROM variant WHERE id=$1)",[variantId])).rows[0]!;
    const operationKey=randomUUID(),bulk={operations:[{variantId,expectedProductVersion:product.version,inventoryDelta:1}],reason:"TEST factor-disabled bulk",operationKey,dryRun:false};
    const balance=(await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[variantId])).rows;
    await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1',[admin.userId]);
    expect((await pool.query("SELECT expires_at>clock_timestamp() AS active,factor_verified_at>clock_timestamp()-interval '5 minutes' AS fresh FROM admin_grant WHERE session_id=$1",[admin.sessionId])).rows[0]).toEqual({active:true,fresh:true});
    await expect(commerce.requestRefund(admin,orderId,receiptId,"1000","TEST factor-disabled refund",key)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(commerce.requestRefund(admin,orderId,receiptId,"1000","TEST other factor-disabled refund",randomUUID())).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(commerce.completeManualRefund(admin,refund.id,"TEST factor-disabled evidence")).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(commerce.bulkEdit(admin,bulk)).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await pool.query("SELECT id,status,evidence FROM refund WHERE order_id=$1",[orderId])).rows).toEqual([{id:refund.id,status:"pending",evidence:null}]);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[variantId])).rows).toEqual(balance);
    expect((await pool.query("SELECT id FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,operationKey])).rows).toHaveLength(0);
    await pool.query('UPDATE "user" SET two_factor_enabled=true WHERE id=$1',[admin.userId]);await fresh();
    expect(await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST factor-disabled refund",key)).toEqual(refund);expect((await commerce.bulkEdit(admin,bulk)).operationId).toBeTruthy();
  });
  it("rejects proof expiring while a new refund waits on its order",async()=>{
    const key=randomUUID(),result=await expiresWhileLocked("SELECT id FROM orders WHERE id=$1 FOR UPDATE",orderId,"SELECT * FROM orders WHERE id=%FOR UPDATE",()=>commerce.requestRefund(admin,orderId,receiptId,"1000","TEST locked order",key));expect(result.error).toMatchObject({code:"FORBIDDEN"});expect((await pool.query("SELECT id FROM refund WHERE order_id=$1",[orderId])).rows).toHaveLength(0);
    await fresh();expect((await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST locked order",key)).status).toBe("pending");
  });
  it("rejects proof expiring while a new refund waits on its receipt",async()=>{
    const result=await expiresWhileLocked("SELECT id FROM payment_receipt WHERE id=$1 FOR UPDATE",receiptId,"SELECT * FROM payment_receipt WHERE id=%FOR UPDATE",()=>commerce.requestRefund(admin,orderId,receiptId,"1000","TEST locked receipt",randomUUID()));expect(result.error).toMatchObject({code:"FORBIDDEN"});expect((await pool.query("SELECT id FROM refund WHERE order_id=$1",[orderId])).rows).toHaveLength(0);
  });
  it("rejects proof expiring while completion waits on the refund row",async()=>{
    const refund=await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST completion wait",randomUUID());const result=await expiresWhileLocked("SELECT id FROM refund WHERE id=$1 FOR UPDATE",refund.id,"SELECT * FROM refund WHERE id=%FOR UPDATE",()=>commerce.completeManualRefund(admin,refund.id,"TEST controlled evidence"));expect(result.error).toMatchObject({code:"FORBIDDEN"});
    expect((await pool.query("SELECT status,evidence FROM refund WHERE id=$1",[refund.id])).rows[0]).toEqual({status:"pending",evidence:null});expect((await commerce.getOrder(customer,orderId)).paymentStatus).toBe("paid");
  });
  it("rechecks proof after authorization waits before saved refund replay",async()=>{
    const key=randomUUID(),refund=await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST refund replay wait",key);const result=await expiresWhileLocked("SELECT role FROM role_membership WHERE user_id=$1 FOR UPDATE",admin.userId,"SELECT role FROM role_membership%FOR SHARE",()=>commerce.requestRefund(admin,orderId,receiptId,"1000","TEST refund replay wait",key));expect(result.error).toMatchObject({code:"FORBIDDEN"});
    expect((await pool.query("SELECT id,status FROM refund WHERE order_id=$1",[orderId])).rows).toEqual([{id:refund.id,status:"pending"}]);await fresh();expect(await commerce.requestRefund(admin,orderId,receiptId,"1000","TEST refund replay wait",key)).toEqual(refund);
  });
});
