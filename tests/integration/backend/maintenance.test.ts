import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCommerce, type CommerceQueryable } from "../../../src/server/commerce/service";
import type { PaymentProvider } from "../../../src/server/payments/provider";
import { createIsolatedDatabase } from "./isolated-database";
import { commerceFixture, observeLock } from "./commerce-fixture";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL transactional checkout pause",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,fixture:Awaited<ReturnType<typeof commerceFixture>>;
  const key="TEST-checkout-enabled";
  async function reader(q:CommerceQueryable){
    expect(q).not.toBe(pool);await q.query("SELECT pg_advisory_xact_lock_shared(818003)");
    const row=(await q.query<{value:boolean}>("SELECT value FROM store_setting WHERE key=$1",[key])).rows[0];return row?.value ?? true;
  }
  async function write(value:boolean){
    const q=await pool.connect();try{await q.query("BEGIN");await q.query("SELECT pg_advisory_xact_lock(818003)");await q.query("INSERT INTO store_setting(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[key,JSON.stringify(value)]);await q.query("COMMIT");}catch(e){await q.query("ROLLBACK");throw e;}finally{q.release();}
  }
  async function snapshot(){
    const id=fixture.customer.userId;
    return {
      orders:(await pool.query("SELECT id,status,payment_status FROM orders WHERE user_id=$1 ORDER BY id",[id])).rows,
      attempts:(await pool.query("SELECT p.* FROM payment_attempt p JOIN orders o ON o.id=p.order_id WHERE o.user_id=$1 ORDER BY p.id",[id])).rows,
      keys:(await pool.query("SELECT * FROM checkout_idempotency WHERE user_id=$1 ORDER BY operation,key",[id])).rows,
      reservations:(await pool.query("SELECT r.* FROM inventory_reservation r JOIN orders o ON o.id=r.order_id WHERE o.user_id=$1 ORDER BY r.id",[id])).rows,
      balance:(await pool.query("SELECT * FROM inventory_balance WHERE variant_id=$1",[fixture.variantId])).rows,
      ledger:(await pool.query("SELECT * FROM inventory_ledger WHERE variant_id=$1 ORDER BY id",[fixture.variantId])).rows,
      carts:(await pool.query("SELECT id,user_id,guest_token_digest,version FROM cart ORDER BY id")).rows,
      jobs:(await pool.query("SELECT * FROM outbox_job ORDER BY id")).rows,
    };
  }
  beforeAll(async()=>{isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;},60000);
  beforeEach(async()=>{await pool.query("DELETE FROM store_setting WHERE key=$1",[key]);fixture=await commerceFixture(pool,{readCheckoutEnabled:reader});});
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("rolls back a paused new checkout and reuses the unconsumed key after reopening",async()=>{
    const {commerce,customer}=fixture,c=await fixture.cart();await write(false);const before=await snapshot(),cart=(await pool.query("SELECT * FROM cart WHERE id=$1",[c.input.cartId])).rows;
    await expect(commerce.createCheckout(customer,c.guestToken,c.input,c.key)).rejects.toMatchObject({code:"NOT_ELIGIBLE",status:503});expect(await snapshot()).toEqual(before);expect((await pool.query("SELECT * FROM cart WHERE id=$1",[c.input.cartId])).rows).toEqual(cart);
    expect((await commerce.quoteCheckout(customer,c.guestToken,c.input.cartId)).total.amountIrr).toBe("10000");await write(true);expect((await commerce.createCheckout(customer,c.guestToken,c.input,c.key)).orderId).toBeTruthy();
  });
  it("allows saved checkout replay during pause without hiding mismatched payload or ownership",async()=>{
    const {commerce,customer}=fixture,c=await fixture.cart(),first=await commerce.createCheckout(customer,c.guestToken,c.input,c.key);await write(false);const before=await snapshot();
    expect(await commerce.createCheckout(customer,c.guestToken,c.input,c.key)).toEqual(first);expect(await snapshot()).toEqual(before);
    await expect(commerce.createCheckout(customer,c.guestToken,{...c.input,address:{...c.input.address,recipient:"TEST altered"}},c.key)).rejects.toMatchObject({code:"CONFLICT"});
    const other=await fixture.actor("customer");await expect(commerce.retryPayment(other,first.orderId,randomUUID())).rejects.toMatchObject({code:"NOT_FOUND"});
    await pool.query("DELETE FROM session WHERE id=$1",[customer.sessionId]);await expect(commerce.createCheckout(customer,c.guestToken,c.input,c.key)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  });
  it("pauses new retry reservation/attempt effects but keeps stored retry and payment completion usable",async()=>{
    const {commerce,customer}=fixture,c=await fixture.cart(),first=await commerce.createCheckout(customer,c.guestToken,c.input,c.key),auth=await fixture.authority(first.paymentAttemptId);
    await fixture.mock.complete(auth,"failed");await commerce.verifyPayment(auth);await pool.query("UPDATE inventory_reservation SET expires_at=now()-interval '1 second' WHERE order_id=$1",[first.orderId]);await commerce.expireReservations();
    await write(false);const before=await snapshot(),retryKey=randomUUID();await expect(commerce.retryPayment(customer,first.orderId,retryKey)).rejects.toMatchObject({code:"NOT_ELIGIBLE",status:503});expect(await snapshot()).toEqual(before);
    await write(true);const retry=await commerce.retryPayment(customer,first.orderId,retryKey);await write(false);const saved=await snapshot();expect(await commerce.retryPayment(customer,first.orderId,retryKey)).toEqual(retry);expect(await snapshot()).toEqual(saved);
    await fixture.mock.complete(await fixture.authority(retry.paymentAttemptId),"paid");await commerce.reconcileAttempt(retry.paymentAttemptId);expect((await commerce.getOrder(customer,first.orderId)).paymentStatus).toBe("paid");
    await commerce.recordShipment(fixture.admin,first.orderId,{status:"shipped",carrier:"TEST",trackingCode:"TEST"});expect((await commerce.getOrder(customer,first.orderId)).shipment?.status).toBe("shipped");
  });
  it("fails closed on invalid reader values or exceptions before actor row locks",async()=>{
    const c=await fixture.cart(),blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[fixture.customer.userId]);
    try{
      for(const value of [undefined,null,0,1,"true"]){const commerce=createCommerce({...fixture.options,readCheckoutEnabled:async()=>value as unknown as boolean});await expect(commerce.createCheckout(fixture.customer,c.guestToken,c.input,c.key)).rejects.toMatchObject({code:"CONFIGURATION",status:503});await expect(commerce.retryPayment(fixture.customer,randomUUID(),randomUUID())).rejects.toMatchObject({code:"CONFIGURATION",status:503});}
      const commerce=createCommerce({...fixture.options,readCheckoutEnabled:async()=>{throw new Error("TEST unavailable setting");}});await expect(commerce.createCheckout(fixture.customer,c.guestToken,c.input,c.key)).rejects.toThrow("TEST unavailable setting");
    }finally{await blocker.query("ROLLBACK");blocker.release();}
    expect((await pool.query("SELECT id FROM orders WHERE user_id=$1",[fixture.customer.userId])).rows).toHaveLength(0);
  });
  it("locks settings before actors and observes a committed pause after the writer's actor lock",async()=>{
    const c=await fixture.cart(),writer=await pool.connect();await writer.query("BEGIN");await writer.query("SELECT pg_advisory_xact_lock(818003)");
    const pending=fixture.commerce.createCheckout(fixture.customer,c.guestToken,c.input,c.key).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
    try{await observeLock(pool,`TEST-isolated-${isolated.schema}`,"SELECT pg_advisory_xact_lock_shared(818003)%");await writer.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE NOWAIT',[fixture.customer.userId]);await writer.query("INSERT INTO store_setting(key,value) VALUES($1,'false'::jsonb)",[key]);await writer.query("COMMIT");}finally{await writer.query("ROLLBACK");writer.release();}
    expect((await pending).error).toMatchObject({code:"NOT_ELIGIBLE",status:503});expect((await pool.query("SELECT id FROM orders WHERE user_id=$1",[fixture.customer.userId])).rows).toHaveLength(0);
  });
  it("holds enabled consent through checkout commit before a competing pause takes effect",async()=>{
    const c=await fixture.cart(),blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query("SELECT id FROM cart WHERE id=$1 FOR UPDATE",[c.input.cartId]);
    const pending=fixture.commerce.createCheckout(fixture.customer,c.guestToken,c.input,c.key);let paused:Promise<void>|undefined;
    try{await observeLock(pool,`TEST-isolated-${isolated.schema}`,"SELECT * FROM cart WHERE id=$1%FOR UPDATE%");paused=write(false);await observeLock(pool,`TEST-isolated-${isolated.schema}`,"SELECT pg_advisory_xact_lock(818003)%");await blocker.query("COMMIT");}finally{await blocker.query("ROLLBACK");blocker.release();}
    const created=await pending;await paused;expect(created.orderId).toBeTruthy();const next=await fixture.cart();await expect(fixture.commerce.createCheckout(fixture.customer,next.guestToken,next.input,next.key)).rejects.toMatchObject({code:"NOT_ELIGIBLE",status:503});
  });
  it("initializes a durable pre-pause attempt after provider work resumes",async()=>{
    const c=await fixture.cart();let started!:()=>void,release!:()=>void;const startedGate=new Promise<void>(resolve=>{started=resolve;}),providerGate=new Promise<void>(resolve=>{release=resolve;});
    const provider:PaymentProvider={name:"mock",environment:"test",capabilities:fixture.mock.capabilities,create:async context=>{started();await providerGate;return fixture.mock.create(context);},verify:context=>fixture.mock.verify(context),inquiry:context=>fixture.mock.inquiry(context)};
    const commerce=createCommerce({...fixture.options,payments:provider}),pending=commerce.createCheckout(fixture.customer,c.guestToken,c.input,c.key);await startedGate;
    try{await write(false);}finally{release();}
    const created=await pending;expect(created.paymentStatus).toBe("pending");await fixture.mock.complete(await fixture.authority(created.paymentAttemptId),"paid");expect((await commerce.verifyPayment(await fixture.authority(created.paymentAttemptId))).status).toBe("paid");
  });
});
