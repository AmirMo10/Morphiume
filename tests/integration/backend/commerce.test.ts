import { config } from "dotenv";
import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCommerce } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";
import { createJobs } from "../../../src/server/jobs/service";
import { notifyOrderEvent } from "../../../src/server/jobs/notifications";
import type { Actor, BulkEditInput, CheckoutInput, ProductInput } from "../../../src/contracts/commerce";
import type { PaymentProvider } from "../../../src/server/payments/provider";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const enabled=!!databaseUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL commerce invariants",()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:8});
  const mock=new MockPaymentProvider(pool,"test","http://127.0.0.1:3000");
  const commerce=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",shippingFeeIrr:100n,policyVersion:"test-policy"});
  let admin:Actor,customerA:Actor,customerB:Actor;const fixtureUsers:string[]=[];const productIds:string[]=[];
  async function actor(kind:"customer"|"admin"):Promise<Actor>{const id=randomUUID(),sessionId=randomUUID();fixtureUsers.push(id);await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number,phone_number_verified) VALUES($1,\'TEST fixture\',$2,true,$3,true)',[id,`${id}@fixture.invalid`,`+989${String(randomInt(0,1_000_000_000)).padStart(9,"0")}`]);await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),id]);if(kind==="admin"){await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[id]);await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);}return {userId:id,sessionId,kind};}
  async function product(stock=1){const suffix=randomUUID();const input:ProductInput={name:`TEST fixture ${suffix}`,slug:`test-${suffix}`,description:"Clearly marked integration fixture",concentration:"TEST",family:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-${suffix}`,volumeMl:50,priceToman:"1000",initialStock:stock}]};const created=await commerce.createProduct(admin,input);productIds.push(created.id);return commerce.publishProduct(admin,created.id,created.version);}
  async function checkout(actor:Actor,variantId:string,coupon?:string){const {cart,guestToken}=await commerce.createCart();let filled=await commerce.setCartItem(cart.id,guestToken,variantId,1,cart.version);if(coupon)filled=await commerce.setCartCoupon(cart.id,guestToken,coupon,filled.version);const quote=await commerce.quoteCheckout(actor,guestToken,cart.id);const input:CheckoutInput={cartId:cart.id,cartVersion:filled.version,address:{recipient:"TEST recipient",phone:"09121234567",province:"TEST",city:"TEST",address:"TEST address",plaque:"1",postalCode:"1234567890"},shippingMethodId:"standard",quoteFingerprint:quote.fingerprint,policyVersion:quote.policyVersion};return {input,guestToken,key:randomUUID()};}
  async function authority(attemptId:string){return (await pool.query<{authority:string}>("SELECT authority FROM payment_attempt WHERE id=$1",[attemptId])).rows[0]!.authority;}
  beforeAll(async()=>{admin=await actor("admin");});
  beforeEach(async()=>{customerA=await actor("customer");customerB=await actor("customer");});
  afterAll(async()=>{await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])",[productIds]);await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])',[fixtureUsers]);await pool.query("DELETE FROM admin_grant WHERE session_id IN (SELECT id FROM session WHERE user_id=ANY($1::text[]))",[fixtureUsers]);await pool.end();});

  it("races the last unit and accepts only one reservation",async()=>{
    const p=await product(1);const a=await checkout(customerA,p.variants[0]!.id),b=await checkout(customerB,p.variants[0]!.id);
    const results=await Promise.allSettled([commerce.createCheckout(customerA,a.guestToken,a.input,a.key),commerce.createCheckout(customerB,b.guestToken,b.input,b.key)]);
    expect(results.filter((r)=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter((r)=>r.status==="rejected")).toHaveLength(1);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0]).toEqual({on_hand:1,reserved:1});
  });
  it("binds checkout retry to payload/actor and rejects cross-owner reads",async()=>{
    const p=await product(3);const c=await checkout(customerA,p.variants[0]!.id);const first=await commerce.createCheckout(customerA,c.guestToken,c.input,c.key);const second=await commerce.createCheckout(customerA,c.guestToken,c.input,c.key);expect(second.orderId).toBe(first.orderId);
    const updatedPolicy=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",shippingFeeIrr:100n,policyVersion:"updated-test-policy"});expect((await updatedPolicy.createCheckout(customerA,c.guestToken,c.input,c.key)).orderId).toBe(first.orderId);
    await expect(commerce.createCheckout(customerA,c.guestToken,{...c.input,address:{...c.input.address,recipient:"Different"}},c.key)).rejects.toMatchObject({code:"CONFLICT"});
    await expect(commerce.getOrder(customerB,first.orderId)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(commerce.getCart(c.input.cartId,"wrong-secret",customerB)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(commerce.getCart(c.input.cartId,c.guestToken,customerB)).rejects.toMatchObject({code:"NOT_FOUND"});
    const other=await checkout(customerB,p.variants[0]!.id);const own=await commerce.createCheckout(customerB,other.guestToken,other.input,c.key);expect(own.orderId).not.toBe(first.orderId);
  });
  it("ignores forged callback evidence, preserves repeated and distinct receipts with one shipment",async()=>{
    const p=await product(3),c=await checkout(customerB,p.variants[0]!.id);const first=await commerce.createCheckout(customerB,c.guestToken,c.input,c.key),auth=await authority(first.paymentAttemptId);
    expect((await commerce.verifyPayment(auth)).status).toBe("unknown");expect((await commerce.getOrder(customerB,first.orderId)).paymentStatus).toBe("unknown");
    await mock.complete(auth,"paid");await Promise.all([commerce.verifyPayment(auth),commerce.verifyPayment(auth)]);await commerce.verifyPayment(auth);
    const extraId=randomUUID();await pool.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr) VALUES($1,$2,'mock','controlled-mock',$3)",[extraId,first.orderId,first.total.amountIrr]);
    const extra=await mock.create({attemptId:extraId,orderId:first.orderId,amountIrr:BigInt(first.total.amountIrr),currency:"IRR",merchantKey:"controlled-mock",callbackUrl:"http://127.0.0.1:3000/api/payments/mock/callback"});if(extra.kind!=="created")throw new Error("fixture create failed");await pool.query("UPDATE payment_attempt SET authority=$1,status='pending' WHERE id=$2",[extra.authority,extraId]);await mock.complete(extra.authority,"paid");await commerce.verifyPayment(extra.authority);
    expect((await pool.query("SELECT count(*)::int AS count FROM payment_receipt WHERE order_id=$1",[first.orderId])).rows[0].count).toBe(2);
    expect((await pool.query("SELECT count(*)::int AS count FROM shipment WHERE order_id=$1",[first.orderId])).rows[0].count).toBe(1);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0]).toEqual({on_hand:2,reserved:0});
    const extraReceipt=(await commerce.listReceipts(admin,first.orderId)).find((receipt)=>receipt.disposition==="extra")!;
    const refund=await commerce.requestRefund(admin,first.orderId,extraReceipt.id,extraReceipt.amount.amountIrr,"TEST extra receipt refund",randomUUID());
    await commerce.completeManualRefund(admin,refund.id,"TEST controlled refund evidence");
    expect((await commerce.getOrder(customerB,first.orderId)).paymentStatus).toBe("paid");
    await commerce.recordShipment(admin,first.orderId,{carrier:"TEST carrier",trackingCode:"TEST-TRACKING",status:"shipped"});expect((await commerce.getOrder(customerB,first.orderId)).shipment?.trackingCode).toBe("TEST-TRACKING");
  });
  it("records a late receipt without overselling after stock is consumed elsewhere",async()=>{
    const p=await product(1),c=await checkout(customerB,p.variants[0]!.id);const late=await commerce.createCheckout(customerB,c.guestToken,c.input,c.key),auth=await authority(late.paymentAttemptId);
    await pool.query("UPDATE inventory_reservation SET expires_at=now()-interval '1 second' WHERE order_id=$1",[late.orderId]);await commerce.expireReservations();
    await commerce.adjustInventory(admin,p.variants[0]!.id,-1,"TEST simulated competing allocation",randomUUID());await mock.complete(auth,"paid");await commerce.verifyPayment(auth);
    expect((await commerce.getOrder(customerB,late.orderId)).status).toBe("payment_exception");expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0]).toEqual({on_hand:0,reserved:0});
  });
  it("serializes pending refund budgets per real receipt",async()=>{
    const p=await product(2),c=await checkout(customerB,p.variants[0]!.id);const order=await commerce.createCheckout(customerB,c.guestToken,c.input,c.key),auth=await authority(order.paymentAttemptId);await mock.complete(auth,"paid");await commerce.verifyPayment(auth);const receipt=(await pool.query<{id:string}>("SELECT id FROM payment_receipt WHERE order_id=$1",[order.orderId])).rows[0]!;
    const results=await Promise.allSettled([commerce.requestRefund(admin,order.orderId,receipt.id,"8000","TEST refund A",randomUUID()),commerce.requestRefund(admin,order.orderId,receipt.id,"8000","TEST refund B",randomUUID())]);expect(results.filter((r)=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter((r)=>r.status==="rejected")).toHaveLength(1);
  });
  it("rejects a provider amount mismatch and retries the same order only after known failure",async()=>{
    const p=await product(2),c=await checkout(customerA,p.variants[0]!.id);const first=await commerce.createCheckout(customerA,c.guestToken,c.input,c.key),auth=await authority(first.paymentAttemptId);
    await mock.complete(auth,"paid");
    await expect(commerce.retryPayment(customerA,first.orderId,randomUUID())).rejects.toMatchObject({code:"PAYMENT_UNKNOWN"});
    await pool.query("UPDATE mock_provider_transaction SET amount_irr=amount_irr+10 WHERE authority=$1",[auth]);
    expect((await commerce.verifyPayment(auth)).status).toBe("failed");
    expect((await pool.query("SELECT count(*)::int AS count FROM payment_receipt WHERE order_id=$1",[first.orderId])).rows[0].count).toBe(0);
    const next=await commerce.retryPayment(customerA,first.orderId,randomUUID());expect(next.orderId).toBe(first.orderId);expect(next.paymentAttemptId).not.toBe(first.paymentAttemptId);
  });
  it("retains unknown create outcomes and never resends create for the same operation",async()=>{
    let createCalls=0;
    const provider:PaymentProvider={name:"mock",environment:"test",capabilities:{reverse:false,generalRefund:false,partialRefund:false},create:async()=>{createCalls++;return {kind:"unknown",code:"simulated_timeout"};},verify:async()=>({kind:"unknown",code:"unused"}),inquiry:async()=>({kind:"unknown",code:"unused"})};
    const unknownCommerce=createCommerce({pool,payments:provider,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",shippingFeeIrr:100n,policyVersion:"test-policy"});
    const p=await product(2),c=await checkout(customerB,p.variants[0]!.id);const first=await unknownCommerce.createCheckout(customerB,c.guestToken,c.input,c.key),again=await unknownCommerce.createCheckout(customerB,c.guestToken,c.input,c.key);
    expect(first.paymentStatus).toBe("unknown");expect(again.orderId).toBe(first.orderId);expect(createCalls).toBe(1);
    await pool.query("UPDATE outbox_job SET available_at=now()-interval '365 days' WHERE dedupe_key=$1",[`initialize:${first.paymentAttemptId}`]);await createJobs({pool,commerce:unknownCommerce}).tick();expect(createCalls).toBe(1);expect((await pool.query("SELECT status FROM outbox_job WHERE dedupe_key=$1",[`initialize:${first.paymentAttemptId}`])).rows[0].status).toBe("completed");
    await expect(unknownCommerce.retryPayment(customerB,first.orderId,randomUUID())).rejects.toMatchObject({code:"PAYMENT_UNKNOWN"});
  });
  it("serializes the last coupon quota and rejects stale product versions",async()=>{
    const p=await product(4),code=`TEST${randomUUID().replaceAll("-","")}`.toUpperCase();await pool.query("INSERT INTO coupon(code,basis_points,usage_limit,expires_at) VALUES($1,1000,1,now()+interval '1 hour')",[code]);const a=await checkout(customerA,p.variants[0]!.id,code),b=await checkout(customerB,p.variants[0]!.id,code);
    const results=await Promise.allSettled([commerce.createCheckout(customerA,a.guestToken,a.input,a.key),commerce.createCheckout(customerB,b.guestToken,b.input,b.key)]);expect(results.filter((r)=>r.status==="fulfilled")).toHaveLength(1);
    await expect(commerce.publishProduct(admin,p.id,p.version-1)).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("recovers a leased outbox job after restart and denies a revoked grant",async()=>{
    const key=`TEST-restart-${randomUUID()}`;await pool.query("INSERT INTO outbox_job(id,dedupe_key,type,payload,status,locked_until,available_at) VALUES($1,$2,'TEST.notification','{}','running',now()-interval '1 second',now()-interval '365 days')",[randomUUID(),key]);const jobs=createJobs({pool,commerce});await jobs.tick();await jobs.tick();expect((await pool.query("SELECT status,attempts FROM outbox_job WHERE dedupe_key=$1",[key])).rows[0]).toEqual({status:"completed",attempts:1});
    const isolated=await actor("admin");await pool.query("DELETE FROM admin_grant WHERE session_id=$1",[isolated.sessionId]);await expect(commerce.listAdminProducts(isolated)).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("applies owned return review and quality-approved restock once without inventing a refund",async()=>{
    const p=await product(3),c=await checkout(customerA,p.variants[0]!.id);const order=await commerce.createCheckout(customerA,c.guestToken,c.input,c.key),auth=await authority(order.paymentAttemptId);await mock.complete(auth,"paid");await commerce.verifyPayment(auth);
    await expect(commerce.requestReturn(customerB,order.orderId,"cancel","TEST foreign order")).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(commerce.requestReturn(customerA,order.orderId,"return","TEST before delivery")).rejects.toMatchObject({code:"NOT_ELIGIBLE"});
    await commerce.recordShipment(admin,order.orderId,{carrier:"TEST",trackingCode:"TEST",status:"shipped"});await commerce.recordShipment(admin,order.orderId,{carrier:"TEST",trackingCode:"TEST",status:"delivered"});
    const request=await commerce.requestReturn(customerA,order.orderId,"return","TEST return request");await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST review approved"});await commerce.decideReturn(admin,request.id,{status:"received",reason:"TEST quality approved",restock:true});await commerce.decideReturn(admin,request.id,{status:"received",reason:"TEST repeated",restock:true});
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0]).toEqual({on_hand:3,reserved:0});expect((await commerce.getOrder(customerA,order.orderId)).paymentStatus).toBe("paid");
  });
  it("releases prepayment cancellation then records late funds without reactivating fulfillment",async()=>{
    const p=await product(1),c=await checkout(customerA,p.variants[0]!.id);const order=await commerce.createCheckout(customerA,c.guestToken,c.input,c.key),auth=await authority(order.paymentAttemptId);const request=await commerce.requestReturn(customerA,order.orderId,"cancel","TEST cancellation");await commerce.decideReturn(admin,request.id,{status:"approved",reason:"TEST cancellation accepted"});expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0]).toEqual({on_hand:1,reserved:0});
    await mock.complete(auth,"paid");await commerce.verifyPayment(auth);const observed=await commerce.getOrder(customerA,order.orderId);expect(observed.status).toBe("payment_exception");expect(observed.shipment).toBeNull();expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0].on_hand).toBe(1);
  });
  it("keeps admin content/collection/coupon edits optimistic and import dry runs atomic",async()=>{
    const p=await product(3),suffix=randomUUID();
    const coupon=await commerce.saveCoupon(admin,{code:`TEST${suffix.replaceAll("-","")}`,basisPoints:1000,usageLimit:10,perUserLimit:2,minimumIrr:"0",expiresAt:new Date(Date.now()+3600_000).toISOString(),active:true});expect(coupon.version).toBe(1);
    const content=await commerce.saveContent(admin,{slug:`test-${suffix}`,title:"TEST content",body:"Plain text",status:"draft"});expect(content.version).toBe(1);await commerce.saveContent(admin,{slug:`test-${suffix}`,title:"TEST content",body:"Published plain text",status:"published",expectedVersion:1});await expect(commerce.saveContent(admin,{slug:`test-${suffix}`,title:"TEST stale",body:"Stale",status:"draft",expectedVersion:1})).rejects.toMatchObject({code:"CONFLICT"});
    const collection=await commerce.saveCollection(admin,{name:"TEST collection",slug:`test-${suffix}`,description:"TEST",published:true,productIds:[p.id]});expect(collection.version).toBe(1);await expect(commerce.saveCollection(admin,{id:String(collection.id),name:"TEST stale",slug:`test-${suffix}`,description:"TEST",published:true,productIds:[p.id],expectedVersion:0})).rejects.toMatchObject({code:"CONFLICT"});
    const input:ProductInput={name:"TEST import",slug:`test-import-${suffix}`,description:"TEST",concentration:"TEST",family:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`IMP-${suffix}`,volumeMl:10,priceToman:"100"}]};
    const invalid=await commerce.importProducts(admin,[input,{...input,slug:`test-invalid-${suffix}`,variants:[{...input.variants[0]!,priceToman:"-1"}]}],false);expect(invalid.imported).toBe(0);expect(invalid.issues).toHaveLength(1);expect((await pool.query("SELECT id FROM product WHERE slug=$1",[input.slug])).rows).toHaveLength(0);
    expect((await commerce.importProducts(admin,[input],true)).imported).toBe(0);expect((await commerce.importProducts(admin,[input],false)).imported).toBe(1);const imported=await pool.query<{id:string;status:string}>("SELECT id,status FROM product WHERE slug=$1",[input.slug]);productIds.push(imported.rows[0]!.id);expect(imported.rows[0]!.status).toBe("draft");
  });
  it("does not consume coupon quota a second time for a late payment after release",async()=>{
    const p=await product(5),code=`TEST${randomUUID().replaceAll("-","")}`.toUpperCase();await pool.query("INSERT INTO coupon(code,basis_points,usage_limit,expires_at) VALUES($1,1000,1,now()+interval '1 hour')",[code]);const a=await checkout(customerA,p.variants[0]!.id,code),first=await commerce.createCheckout(customerA,a.guestToken,a.input,a.key),auth=await authority(first.paymentAttemptId);await pool.query("UPDATE inventory_reservation SET expires_at=now()-interval '1 second' WHERE order_id=$1",[first.orderId]);await commerce.expireReservations();const b=await checkout(customerB,p.variants[0]!.id,code);await commerce.createCheckout(customerB,b.guestToken,b.input,b.key);await mock.complete(auth,"paid");await commerce.verifyPayment(auth);
    expect((await commerce.getOrder(customerA,first.orderId)).status).toBe("payment_exception");expect((await pool.query("SELECT count(*)::int AS count FROM coupon_redemption WHERE coupon_code=$1 AND status IN ('reserved','consumed')",[code])).rows[0].count).toBe(1);
  });
  it("retries failed notification delivery from the durable outbox",async()=>{
    const key=`TEST-retry-${randomUUID()}`;await pool.query("INSERT INTO outbox_job(id,dedupe_key,type,payload,available_at) VALUES($1,$2,'TEST.notification','{}',now()-interval '365 days')",[randomUUID(),key]);let calls=0;const jobs=createJobs({pool,commerce,notify:async(_type,_payload,dedupeKey)=>{if(dedupeKey===key && ++calls===1)throw new Error("TEST transport failure");}});await jobs.tick();expect((await pool.query("SELECT status,attempts FROM outbox_job WHERE dedupe_key=$1",[key])).rows[0]).toEqual({status:"pending",attempts:1});await pool.query("UPDATE outbox_job SET available_at=now()-interval '365 days' WHERE dedupe_key=$1",[key]);await jobs.tick();expect((await pool.query("SELECT status,attempts FROM outbox_job WHERE dedupe_key=$1",[key])).rows[0]).toEqual({status:"completed",attempts:2});
  });
  it("requires inventory permission for initial stock even with product edit permission",async()=>{
    const manager=await actor("admin");await pool.query("DELETE FROM role_membership WHERE user_id=$1",[manager.userId]);await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'product_manager')",[manager.userId]);const suffix=randomUUID();const input:ProductInput={name:"TEST permission",slug:`test-permission-${suffix}`,description:"TEST",concentration:"TEST",family:"TEST",topNotes:[],heartNotes:[],baseNotes:[],variants:[{sku:`PERM-${suffix}`,volumeMl:10,priceToman:"100",initialStock:1}]};await expect(commerce.createProduct(manager,input)).rejects.toMatchObject({code:"FORBIDDEN"});expect((await pool.query("SELECT id FROM product WHERE slug=$1",[input.slug])).rows).toHaveLength(0);const draft=await commerce.createProduct(manager,{...input,variants:[{...input.variants[0]!,initialStock:0}]});productIds.push(draft.id);expect(draft.variants[0]!.available).toBe(0);
  });
  it("previews bulk edits without effects then commits/replays one durable operation",async()=>{
    const a=await product(5),b=await product(7),key=randomUUID();
    const input:BulkEditInput={operations:[{variantId:b.variants[0]!.id,expectedProductVersion:b.version,priceToman:"۲۰۰۰",inventoryDelta:3},{variantId:a.variants[0]!.id,expectedProductVersion:a.version,priceToman:"3000",inventoryDelta:-2}],reason:"TEST bulk approved change",operationKey:key,dryRun:true};
    const beforeLedgers=(await pool.query("SELECT count(*)::int AS count FROM inventory_ledger WHERE variant_id=ANY($1::uuid[])",[[a.variants[0]!.id,b.variants[0]!.id]])).rows[0].count;
    const preview=await commerce.bulkEdit(admin,input);expect(preview.dryRun).toBe(true);expect(preview.operationId).toBeUndefined();expect(preview.changes.find((row)=>row.variantId===a.variants[0]!.id)).toMatchObject({currentStock:5,nextStock:3,nextPrice:{amountIrr:"30000",currency:"IRR"}});
    expect((await commerce.getProduct(a.id,admin)).version).toBe(a.version);expect((await commerce.getProduct(b.id,admin)).variants[0]!.price.amountIrr).toBe("10000");expect((await pool.query("SELECT count(*)::int AS count FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,key])).rows[0].count).toBe(0);expect((await pool.query("SELECT count(*)::int AS count FROM inventory_ledger WHERE variant_id=ANY($1::uuid[])",[[a.variants[0]!.id,b.variants[0]!.id]])).rows[0].count).toBe(beforeLedgers);
    const [committed,concurrentReplay]=await Promise.all([commerce.bulkEdit(admin,{...input,dryRun:false}),commerce.bulkEdit(admin,{...input,dryRun:false})]);expect(concurrentReplay).toEqual(committed);expect(committed.operationId).toBeTruthy();expect(committed.dryRun).toBe(false);expect((await commerce.getProduct(a.id,admin)).version).toBe(a.version+1);expect((await commerce.getProduct(b.id,admin)).variants[0]!.price.amountIrr).toBe("20000");
    const replay=await commerce.bulkEdit(admin,{...input,operations:[...input.operations].reverse(),dryRun:false});expect(replay).toEqual(committed);expect((await pool.query("SELECT count(*)::int AS count FROM inventory_ledger WHERE operation_key LIKE $1",[`bulk:${committed.operationId}:%`])).rows[0].count).toBe(2);expect((await pool.query("SELECT count(*)::int AS count FROM audit_event WHERE entity_id=$1 AND action='catalog.bulk_edited'",[committed.operationId])).rows[0].count).toBe(1);
    await expect(commerce.bulkEdit(admin,{...input,dryRun:false,reason:"TEST different payload"})).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("rolls back the entire bulk operation for a stale row or stock below active reservations",async()=>{
    const a=await product(5),b=await product(5);const reserved=await checkout(customerA,b.variants[0]!.id);await commerce.createCheckout(customerA,reserved.guestToken,reserved.input,reserved.key);
    const key=randomUUID(),input:BulkEditInput={operations:[{variantId:a.variants[0]!.id,expectedProductVersion:a.version,priceToman:"5000"},{variantId:b.variants[0]!.id,expectedProductVersion:b.version,inventoryDelta:-5}],reason:"TEST illegal reserved reduction",operationKey:key,dryRun:false};
    await expect(commerce.bulkEdit(admin,input)).rejects.toMatchObject({code:"CONFLICT"});expect((await commerce.getProduct(a.id,admin)).variants[0]!.price.amountIrr).toBe("10000");expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1",[b.variants[0]!.id])).rows[0]).toEqual({on_hand:5,reserved:1});expect((await pool.query("SELECT count(*)::int AS count FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2",[admin.userId,key])).rows[0].count).toBe(0);
    await expect(commerce.bulkEdit(admin,{...input,operations:[input.operations[0]!,{...input.operations[1]!,inventoryDelta:1,expectedProductVersion:b.version-1}]})).rejects.toMatchObject({code:"CONFLICT"});expect((await commerce.getProduct(a.id,admin)).version).toBe(a.version);
    await expect(commerce.bulkEdit(admin,{...input,operations:[{...input.operations[0]!,priceToman:"100000001"}]})).rejects.toMatchObject({code:"VALIDATION"});expect((await commerce.getProduct(a.id,admin)).variants[0]!.price.amountIrr).toBe("10000");
  });
  it("allows bulk price and stock permissions independently and binds records to the actor",async()=>{
    const p=await product(5),manager=await actor("admin"),warehouse=await actor("admin");await pool.query("DELETE FROM role_membership WHERE user_id=ANY($1::text[])",[[manager.userId,warehouse.userId]]);await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'product_manager'),($2,'fulfillment')",[manager.userId,warehouse.userId]);const key=randomUUID();
    const priceInput:BulkEditInput={operations:[{variantId:p.variants[0]!.id,expectedProductVersion:p.version,priceToman:"2000"}],reason:"TEST catalog price",operationKey:key,dryRun:false};const priced=await commerce.bulkEdit(manager,priceInput);expect(priced.operationId).toBeTruthy();const updated=await commerce.getProduct(p.id);expect(updated.version).toBe(p.version+1);
    await expect(commerce.bulkEdit(manager,{...priceInput,operationKey:randomUUID(),operations:[{variantId:p.variants[0]!.id,expectedProductVersion:updated.version,inventoryDelta:1}]})).rejects.toMatchObject({code:"FORBIDDEN"});await expect(commerce.bulkEdit(warehouse,{...priceInput,operationKey:randomUUID(),operations:[{...priceInput.operations[0]!,expectedProductVersion:updated.version}]})).rejects.toMatchObject({code:"FORBIDDEN"});
    const stock=await commerce.bulkEdit(warehouse,{operations:[{variantId:p.variants[0]!.id,expectedProductVersion:updated.version,inventoryDelta:1}],reason:"TEST warehouse stock",operationKey:key,dryRun:false});expect(stock.operationId).not.toBe(priced.operationId);expect(stock.changes[0]!.nextStock).toBe(6);expect((await commerce.listInventory(warehouse)).find((row)=>row.variant_id===p.variants[0]!.id)?.product_version).toBe(updated.version+1);
  });
  it("serializes concurrent bulk keys using one product version and one price effect",async()=>{
    const p=await product(5),first:BulkEditInput={operations:[{variantId:p.variants[0]!.id,expectedProductVersion:p.version,priceToman:"2000",inventoryDelta:1}],reason:"TEST concurrent bulk",operationKey:randomUUID(),dryRun:false};const results=await Promise.allSettled([commerce.bulkEdit(admin,first),commerce.bulkEdit(admin,{...first,operationKey:randomUUID(),operations:[{...first.operations[0]!,priceToman:"3000"}]})]);expect(results.filter((result)=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter((result)=>result.status==="rejected")).toHaveLength(1);expect((await commerce.getProduct(p.id)).version).toBe(p.version+1);expect((await pool.query("SELECT on_hand FROM inventory_balance WHERE variant_id=$1",[p.variants[0]!.id])).rows[0].on_hand).toBe(6);
  });
  it("quotes free shipping inclusively after the exact rounded discount",async()=>{
    const p=await product(5),code=`TEST${randomUUID().replaceAll("-","")}`.toUpperCase();await pool.query("INSERT INTO coupon(code,basis_points,usage_limit,per_user_limit,expires_at) VALUES($1,3333,10,10,now()+interval '1 hour')",[code]);const c=await checkout(customerA,p.variants[0]!.id,code);
    const atThreshold=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",shippingFeeIrr:100n,freeShippingThresholdIrr:6670n,policyVersion:"test-policy"}),belowThreshold=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",shippingFeeIrr:100n,freeShippingThresholdIrr:6680n,policyVersion:"test-policy"});
    const free=await atThreshold.quoteCheckout(customerA,c.guestToken,c.input.cartId),paid=await belowThreshold.quoteCheckout(customerA,c.guestToken,c.input.cartId),baseline=await commerce.quoteCheckout(customerA,c.guestToken,c.input.cartId);expect(free.discount.amountIrr).toBe("3330");expect(free.shipping.amountIrr).toBe("0");expect(free.total.amountIrr).toBe("6670");expect(paid.shipping.amountIrr).toBe("100");expect(paid.total.amountIrr).toBe("6770");expect(baseline.total).toEqual(paid.total);expect(paid.fingerprint).not.toBe(free.fingerprint);
    const order=await atThreshold.createCheckout(customerA,c.guestToken,{...c.input,quoteFingerprint:free.fingerprint},c.key);expect(order.total).toEqual(free.total);expect((await pool.query("SELECT amount_irr,currency FROM payment_attempt WHERE id=$1",[order.paymentAttemptId])).rows[0]).toEqual({amount_irr:"6670",currency:"IRR"});
    expect(()=>createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",freeShippingThresholdIrr:1n})).toThrow();expect(()=>createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",freeShippingThresholdIrr:-10n})).toThrow();
  });
  it("delivers one controlled in-app notification only to the persisted order owner",async()=>{
    const p=await product(5),c=await checkout(customerA,p.variants[0]!.id),order=await commerce.createCheckout(customerA,c.guestToken,c.input,c.key),key=`TEST-inbox-${randomUUID()}`;
    const payload={orderId:order.orderId,userId:customerB.userId,recipient:"TEST forged recipient",phone:"09121234567",amount:"999999"};
    await Promise.all([notifyOrderEvent(pool,"test","order.created",payload,key),notifyOrderEvent(pool,"test","order.created",payload,key)]);
    const rows=(await pool.query<{user_id:string;title:string;body:string}>("SELECT user_id,title,body FROM notification_message WHERE event_key=$1",[key])).rows;expect(rows).toHaveLength(1);expect(rows[0]!.user_id).toBe(customerA.userId);expect(rows[0]!.title).toBe("سفارش آزمایشی ثبت شد.");expect(rows[0]!.body).not.toContain("09121234567");expect(rows[0]!.body).not.toContain("999999");expect((await pool.query("SELECT id FROM notification_message WHERE event_key=$1 AND user_id=$2",[key,customerB.userId])).rows).toHaveLength(0);
  });
  it("ignores unknown notification types/payloads and blocks the test inbox in live",async()=>{
    const key=`TEST-ignore-${randomUUID()}`;
    await notifyOrderEvent(pool,"test","unknown.type",{orderId:randomUUID()},key);
    await notifyOrderEvent(pool,"test","toString",{orderId:randomUUID()},key);
    await notifyOrderEvent(pool,"test","order.created",null as unknown as Record<string,unknown>,key);
    await notifyOrderEvent(pool,"test","order.created",{orderId:"invalid"},key);
    await notifyOrderEvent(pool,"test","order.created",{orderId:randomUUID()},key);
    expect((await pool.query("SELECT id FROM notification_message WHERE event_key=$1",[key])).rows).toHaveLength(0);
    await expect(notifyOrderEvent(pool,"live","order.created",{orderId:randomUUID()},key)).rejects.toMatchObject({code:"CONFIGURATION"});
  });
});
