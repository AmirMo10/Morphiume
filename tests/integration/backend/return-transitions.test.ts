import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createIsolatedDatabase } from "./isolated-database";
import { commerceFixture, observeLock } from "./commerce-fixture";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL kind-aware full-order returns",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,fixture:Awaited<ReturnType<typeof commerceFixture>>;
  async function balance(){return (await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[fixture.variantId])).rows[0];}
  async function state(orderId:string){return {
    requests:(await pool.query("SELECT * FROM return_request WHERE order_id=$1 ORDER BY id",[orderId])).rows,
    order:(await pool.query("SELECT status,payment_status,updated_at FROM orders WHERE id=$1",[orderId])).rows,
    stock:await balance(),
    ledger:(await pool.query("SELECT * FROM inventory_ledger WHERE order_id=$1 ORDER BY id",[orderId])).rows,
    events:(await pool.query("SELECT * FROM order_event WHERE order_id=$1 ORDER BY id",[orderId])).rows,
    audits:(await pool.query("SELECT * FROM audit_event WHERE entity_id=ANY(SELECT id::text FROM return_request WHERE order_id=$1) ORDER BY id",[orderId])).rows,
    decisions:(await pool.query("SELECT d.* FROM return_decision d JOIN return_request r ON r.id=d.request_id WHERE r.order_id=$1 ORDER BY d.request_id,d.target_status",[orderId])).rows,
  };}
  async function approvedReturn(){
    const {commerce,customer,admin}=fixture,purchase=await fixture.purchase(true),request=await commerce.requestReturn(customer,purchase.checkout.orderId,"return","TEST full return");
    await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST return approved"});return {...purchase,request};
  }
  async function decisionWait(lockSql:string,lockId:string,pattern:string,work:()=>Promise<unknown>,revoke:()=>Promise<void>){
    const blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query(lockSql,[lockId]);
    const pending=work().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
    try{await observeLock(pool,`TEST-isolated-${isolated.schema}`,pattern);await revoke();await blocker.query("COMMIT");}finally{await blocker.query("ROLLBACK");blocker.release();}
    return pending;
  }
  beforeAll(async()=>{isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;},60000);
  beforeEach(async()=>{fixture=await commerceFixture(pool);});
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("never moves an approved cancellation into received",async()=>{
    const {commerce,customer,admin}=fixture,{checkout}=await fixture.purchase(),request=await commerce.requestReturn(customer,checkout.orderId,"cancel","TEST cancellation");
    await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST cancellation approved"});const before=await state(checkout.orderId);
    await expect(commerce.decideReturn(admin,request.id,{status:"received",reason:"TEST invalid cancellation receipt"})).rejects.toMatchObject({code:"NOT_ELIGIBLE"});expect(await state(checkout.orderId)).toEqual(before);
  });
  it("cannot restore the same committed line through two distinct full-return requests",async()=>{
    const {commerce,customer,admin}=fixture,{checkout}=await fixture.purchase(true),request=await commerce.requestReturn(customer,checkout.orderId,"return","TEST first full return");
    await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST first approved"});await commerce.decideReturn(admin,request.id,{status:"received",reason:"TEST first quality approved",restock:true});await commerce.decideReturn(admin,request.id,{status:"closed",reason:"TEST first closed"});
    let second:{id:string}|undefined;
    try{second=await commerce.requestReturn(customer,checkout.orderId,"return","TEST duplicate full return");}catch(error){expect(error).toMatchObject({code:"NOT_ELIGIBLE"});}
    if(second){await commerce.decideReturn(admin,second.id,{status:"approved",reason:"TEST second approved"});await commerce.decideReturn(admin,second.id,{status:"received",reason:"TEST second quality approved",restock:true});}
    expect(await balance()).toEqual({on_hand:10,reserved:0});expect(second).toBeUndefined();
  });
  it("serializes concurrent active full-order requests under the order lock",async()=>{
    const {checkout}=await fixture.purchase(true),results=await Promise.allSettled([fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST simultaneous A"),fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST simultaneous B")]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter(result=>result.status==="rejected").map(result=>result.reason)).toEqual([expect.objectContaining({code:"CONFLICT"})]);
    expect((await pool.query("SELECT id FROM return_request WHERE order_id=$1",[checkout.orderId])).rows).toHaveLength(1);expect(await balance()).toEqual({on_hand:9,reserved:0});
  });
  it("restocks one concurrent decision and binds replay to normalized actor and exact effect",async()=>{
    const {checkout,request}=await approvedReturn(),input={status:"received" as const,reason:"TEST approved quality",restock:true},before=await state(checkout.orderId);
    const results=await Promise.all([fixture.commerce.decideReturn(fixture.admin,request.id,input),fixture.commerce.decideReturn(fixture.admin,request.id,{...input,reason:`  ${input.reason}  `})]);expect(results[0]).toEqual(results[1]);expect(await balance()).toEqual({on_hand:10,reserved:0});
    const after=await state(checkout.orderId);expect(after.decisions).toHaveLength(2);expect(after.ledger.length-before.ledger.length).toBe(1);expect(after.audits.length-before.audits.length).toBe(1);
    for(const patch of [{reason:"TEST different quality"},{restock:false}])await expect(fixture.commerce.decideReturn(fixture.admin,request.id,{...input,...patch})).rejects.toMatchObject({code:"CONFLICT"});
    const other=await fixture.actor("admin");await expect(fixture.commerce.decideReturn(other,request.id,input)).rejects.toMatchObject({code:"CONFLICT"});expect(await state(checkout.orderId)).toEqual(after);
    await fixture.commerce.decideReturn(fixture.admin,request.id,{status:"closed",reason:"TEST reviewed closed"});const closed=await state(checkout.orderId);expect(await fixture.commerce.decideReturn(fixture.admin,request.id,input)).toEqual(results[0]);expect(await state(checkout.orderId)).toEqual(closed);
    await expect(pool.query("UPDATE return_decision SET restock=false WHERE request_id=$1 AND target_status='received'",[request.id])).rejects.toMatchObject({code:"55000"});
  });
  it("requires a manual quality choice and prevents another full receipt even when stock is not sellable",async()=>{
    const {checkout,request}=await approvedReturn(),before=await state(checkout.orderId);
    await expect(fixture.commerce.decideReturn(fixture.admin,request.id,{status:"received",reason:"TEST missing review"})).rejects.toMatchObject({code:"VALIDATION"});expect(await state(checkout.orderId)).toEqual(before);
    await fixture.commerce.decideReturn(fixture.admin,request.id,{status:"received",reason:"TEST quality not approved",restock:false});expect(await balance()).toEqual({on_hand:9,reserved:0});
    await fixture.commerce.decideReturn(fixture.admin,request.id,{status:"closed",reason:"TEST closed after receipt"});await expect(fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST duplicate physical return")).rejects.toMatchObject({code:"NOT_ELIGIBLE"});
    expect((await fixture.commerce.getOrder(fixture.customer,checkout.orderId)).paymentStatus).toBe("paid");
  });
  it("permits renewed review after a rejected request or a recorded closure without physical receipt",async()=>{
    const {checkout}=await fixture.purchase(true),first=await fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST first request");
    await fixture.commerce.decideReturn(fixture.admin,first.id,{status:"rejected",reason:"TEST initial review declined"});const second=await fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST second review");
    await fixture.commerce.decideReturn(fixture.admin,second.id,{status:"approved",reason:"TEST second approved"});await fixture.commerce.decideReturn(fixture.admin,second.id,{status:"closed",reason:"TEST no goods received"});
    const third=await fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST reopened review");expect(third.status).toBe("pending");expect(await balance()).toEqual({on_hand:9,reserved:0});
  });
  it("preserves ambiguous legacy closures and rejects replay without invented decision evidence",async()=>{
    const {checkout}=await fixture.purchase(true),id=randomUUID();await pool.query("INSERT INTO return_request(id,order_id,user_id,kind,reason,status) VALUES($1,$2,$3,'return','TEST legacy ambiguous','closed')",[id,checkout.orderId,fixture.customer.userId]);const before=await state(checkout.orderId);
    await expect(fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST duplicate unknown history")).rejects.toMatchObject({code:"NOT_ELIGIBLE"});await expect(fixture.commerce.decideReturn(fixture.admin,id,{status:"closed",reason:"TEST invented legacy replay"})).rejects.toMatchObject({code:"CONFLICT"});expect(await state(checkout.orderId)).toEqual(before);
  });
  it("uses real historical received events and positive legacy ledger restoration as duplicate evidence",async()=>{
    const {checkout}=await fixture.purchase(true),legacyId=randomUUID();await pool.query("INSERT INTO return_request(id,order_id,user_id,kind,reason,status) VALUES($1,$2,$3,'return','TEST legacy closed','closed')",[legacyId,checkout.orderId,fixture.customer.userId]);
    await pool.query("INSERT INTO order_event(id,order_id,event_key,type) VALUES($1,$2,$3,'request.received')",[randomUUID(),checkout.orderId,`return:${legacyId}:received`]);await expect(fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST received duplicate")).rejects.toMatchObject({code:"NOT_ELIGIBLE"});
    await pool.query("INSERT INTO inventory_ledger(id,variant_id,order_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,1,0,'TEST historical restore')",[randomUUID(),fixture.variantId,checkout.orderId,`return-stock:${legacyId}:${fixture.variantId}`]);await pool.query("UPDATE inventory_balance SET on_hand=on_hand+1 WHERE variant_id=$1",[fixture.variantId]);
    const second=randomUUID();await pool.query("INSERT INTO return_request(id,order_id,user_id,kind,reason,status) VALUES($1,$2,$3,'return','TEST direct duplicate fixture','approved')",[second,checkout.orderId,fixture.customer.userId]);const before=await state(checkout.orderId);
    await expect(fixture.commerce.decideReturn(fixture.admin,second,{status:"received",reason:"TEST duplicate quality",restock:true})).rejects.toMatchObject({code:"CONFLICT"});expect(await state(checkout.orderId)).toEqual(before);expect(await balance()).toEqual({on_hand:10,reserved:0});
  });
  it("requires a current ordinary MFA grant for stock/replay while retaining the nonfinancial factor-age rule",async()=>{
    const {checkout,request}=await approvedReturn(),input={status:"received" as const,reason:"TEST ordinary reviewed return",restock:true};await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[fixture.admin.sessionId]);
    await fixture.commerce.decideReturn(fixture.admin,request.id,input);const after=await state(checkout.orderId);await pool.query("UPDATE role_membership SET role='support' WHERE user_id=$1",[fixture.admin.userId]);await expect(fixture.commerce.decideReturn(fixture.admin,request.id,input)).rejects.toMatchObject({code:"FORBIDDEN"});
    await pool.query("UPDATE role_membership SET role='owner' WHERE user_id=$1",[fixture.admin.userId]);await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1',[fixture.admin.userId]);await expect(fixture.commerce.decideReturn(fixture.admin,request.id,input)).rejects.toMatchObject({code:"FORBIDDEN"});expect(await state(checkout.orderId)).toEqual(after);
  });
  it("rejects role revocation while waiting for order or inventory before decisions/stock effects",async()=>{
    const {checkout,request}=await approvedReturn(),input={status:"received" as const,reason:"TEST revoked return",restock:true};
    for(const [sql,id,pattern] of [["SELECT id FROM orders WHERE id=$1 FOR UPDATE",checkout.orderId,"SELECT * FROM orders WHERE id=$1 FOR UPDATE%"],["SELECT variant_id FROM inventory_balance WHERE variant_id=$1 FOR UPDATE",fixture.variantId,"SELECT variant_id FROM inventory_balance WHERE variant_id=ANY%"]]){
      const before=await state(checkout.orderId),result=await decisionWait(sql!,id!,pattern!,()=>fixture.commerce.decideReturn(fixture.admin,request.id,input),async()=>{await pool.query("UPDATE role_membership SET role='support' WHERE user_id=$1",[fixture.admin.userId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state(checkout.orderId)).toEqual(before);await pool.query("UPDATE role_membership SET role='owner' WHERE user_id=$1",[fixture.admin.userId]);
    }
  });
  it("rechecks grant expiry after a saved decision lock before exact replay",async()=>{
    const {checkout,request}=await approvedReturn(),input={status:"received" as const,reason:"TEST replay after wait",restock:true};await fixture.commerce.decideReturn(fixture.admin,request.id,input);const before=await state(checkout.orderId);
    const result=await decisionWait("SELECT request_id FROM return_decision WHERE request_id=$1 AND target_status='received' FOR UPDATE",request.id,"SELECT * FROM return_decision WHERE request_id=$1 AND target_status=$2 FOR SHARE%",()=>fixture.commerce.decideReturn(fixture.admin,request.id,input),async()=>{await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[fixture.admin.sessionId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state(checkout.orderId)).toEqual(before);
  });
  it("preserves automatic paid and prepayment cancellation stock restoration and exact replay",async()=>{
    const {commerce,customer,admin}=fixture,c=await fixture.cart(),checkout=await commerce.createCheckout(customer,c.guestToken,c.input,c.key),request=await commerce.requestReturn(customer,checkout.orderId,"cancel","TEST unpaid cancel"),input={status:"approved" as const,reason:"TEST approved unpaid cancel"};
    await commerce.decideReturn(admin,request.id,input);expect(await balance()).toEqual({on_hand:10,reserved:0});const before=await state(checkout.orderId);expect(await commerce.decideReturn(admin,request.id,input)).toEqual({id:request.id,status:"approved"});expect(await state(checkout.orderId)).toEqual(before);await commerce.decideReturn(admin,request.id,{status:"closed",reason:"TEST cancel closed"});
    await fixture.mock.complete(await fixture.authority(checkout.paymentAttemptId),"paid");await commerce.verifyPayment(await fixture.authority(checkout.paymentAttemptId));expect((await commerce.getOrder(customer,checkout.orderId)).status).toBe("payment_exception");expect(await balance()).toEqual({on_hand:10,reserved:0});
    const paid=await fixture.purchase(),paidRequest=await commerce.requestReturn(customer,paid.checkout.orderId,"cancel","TEST paid unshipped cancel");await commerce.decideReturn(admin,paidRequest.id,{status:"approved",reason:"TEST approved paid cancel"});expect(await balance()).toEqual({on_hand:10,reserved:0});
  });
  it("never reactivates fulfillment after two distinct late receipts for an approved cancellation",async()=>{
    const coupon=`TEST${randomUUID().replaceAll("-","")}`.toUpperCase();await pool.query("INSERT INTO coupon(code,basis_points,usage_limit,expires_at) VALUES($1,1000,10,now()+interval '1 hour')",[coupon]);
    const {commerce,customer,admin}=fixture,c=await fixture.cart(coupon),checkout=await commerce.createCheckout(customer,c.guestToken,c.input,c.key),request=await commerce.requestReturn(customer,checkout.orderId,"cancel","TEST late receipts cancel");await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST cancellation approved"});await commerce.decideReturn(admin,request.id,{status:"closed",reason:"TEST cancellation closed"});
    const cancelled=await state(checkout.orderId),first=await fixture.authority(checkout.paymentAttemptId);await fixture.mock.complete(first,"paid");await commerce.verifyPayment(first);expect((await commerce.getOrder(customer,checkout.orderId)).status).toBe("payment_exception");
    const attemptId=randomUUID();await pool.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr) VALUES($1,$2,'mock','controlled-mock',$3)",[attemptId,checkout.orderId,checkout.total.amountIrr]);const created=await fixture.mock.create({attemptId,orderId:checkout.orderId,amountIrr:BigInt(checkout.total.amountIrr),currency:"IRR",merchantKey:"controlled-mock",callbackUrl:"http://127.0.0.1:3000/api/payments/mock/callback"});if(created.kind!=="created")throw new Error("TEST mock setup failed");await pool.query("UPDATE payment_attempt SET authority=$1,status='pending' WHERE id=$2",[created.authority,attemptId]);await fixture.mock.complete(created.authority,"paid");await commerce.verifyPayment(created.authority);await commerce.verifyPayment(created.authority);
    const order=await commerce.getOrder(customer,checkout.orderId);expect(order.status).toBe("payment_exception");expect(order.shipment).toBeNull();expect(await balance()).toEqual({on_hand:10,reserved:0});expect((await state(checkout.orderId)).ledger).toEqual(cancelled.ledger);
    expect((await pool.query("SELECT disposition FROM payment_receipt WHERE order_id=$1 ORDER BY id",[checkout.orderId])).rows).toEqual([{disposition:"inventory_exception"},{disposition:"inventory_exception"}]);expect((await pool.query("SELECT id FROM order_event WHERE order_id=$1 AND type='payment.inventory_exception'",[checkout.orderId])).rows).toHaveLength(2);
    expect((await pool.query("SELECT status FROM coupon_redemption WHERE order_id=$1",[checkout.orderId])).rows).toEqual([{status:"released"}]);
    await expect(commerce.requestReturn(customer,checkout.orderId,"cancel","TEST duplicate cancelled exception")).rejects.toMatchObject({code:"NOT_ELIGIBLE"});
  });
  it("honors an exact legacy cancellation event but never treats generic return approval as cancellation",async()=>{
    for(const kind of ["cancel","return"] as const){
      const c=await fixture.cart(),checkout=await fixture.commerce.createCheckout(fixture.customer,c.guestToken,c.input,c.key),requestId=randomUUID();await pool.query("INSERT INTO return_request(id,order_id,user_id,kind,reason,status) VALUES($1,$2,$3,$4,'TEST legacy approval','closed')",[requestId,checkout.orderId,fixture.customer.userId,kind]);
      await pool.query("INSERT INTO order_event(id,order_id,event_key,type) VALUES($1,$2,$3,'request.approved')",[randomUUID(),checkout.orderId,`return:${requestId}:approved`]);await pool.query("UPDATE orders SET status='payment_exception' WHERE id=$1",[checkout.orderId]);
      const auth=await fixture.authority(checkout.paymentAttemptId);await fixture.mock.complete(auth,"paid");await fixture.commerce.verifyPayment(auth);const order=await fixture.commerce.getOrder(fixture.customer,checkout.orderId);
      expect(order.status).toBe(kind==="cancel" ? "payment_exception" : "confirmed");expect((await pool.query("SELECT disposition FROM payment_receipt WHERE order_id=$1",[checkout.orderId])).rows[0].disposition).toBe(kind==="cancel" ? "inventory_exception" : "primary");
    }
    expect(await balance()).toEqual({on_hand:9,reserved:1});
  });
  it("records the actual received source when closing a legacy received row",async()=>{
    const {checkout}=await fixture.purchase(true),id=randomUUID();await pool.query("INSERT INTO return_request(id,order_id,user_id,kind,reason,status) VALUES($1,$2,$3,'return','TEST legacy received','received')",[id,checkout.orderId,fixture.customer.userId]);await fixture.commerce.decideReturn(fixture.admin,id,{status:"closed",reason:"TEST documented legacy closure"});
    expect((await pool.query("SELECT source_status,target_status FROM return_decision WHERE request_id=$1",[id])).rows).toEqual([{source_status:"received",target_status:"closed"}]);await expect(fixture.commerce.requestReturn(fixture.customer,checkout.orderId,"return","TEST duplicate legacy receipt")).rejects.toMatchObject({code:"NOT_ELIGIBLE"});expect(await balance()).toEqual({on_hand:9,reserved:0});
  });
});
