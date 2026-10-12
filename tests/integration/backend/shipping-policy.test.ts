import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor, CheckoutInput, QuoteDto } from "../../../src/contracts/commerce";
import { createCommerce, type CommerceQueryable, type CommerceShippingPolicy } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const enabled=!!databaseUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL fresh shipping consent",()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:4}),key=`TEST-shipping-${randomUUID()}`;
  const mock=new MockPaymentProvider(pool,"test","http://127.0.0.1:3000");
  const users:string[]=[],productIds:string[]=[],couponCodes:string[]=[];
  let admin:Actor,customer:Actor,variantId:string,unavailable=false;
  let readerGate:(()=>Promise<void>)|undefined;
  const address={recipient:"TEST shipping fixture",phone:"09121234567",province:"TEST",city:"TEST",address:"TEST address",plaque:"1",postalCode:"1234567890"};
  async function reader(db:CommerceQueryable):Promise<CommerceShippingPolicy>{
    expect(db).not.toBe(pool);if(unavailable)throw new Error("TEST settings temporarily unavailable");
    await db.query("SELECT pg_advisory_xact_lock_shared(818002)");
    const row=(await db.query<{value:{fee:string;threshold:string|null};version:number}>("SELECT value,version FROM store_setting WHERE key=$1 FOR SHARE",[key])).rows[0];
    if(readerGate)await readerGate();
    return {shippingFeeIrr:BigInt(row?.value.fee ?? "0"),freeShippingThresholdIrr:row?.value.threshold ? BigInt(row.value.threshold) : undefined,policyVersion:row ? `TEST-shipping-v${row.version}` : "TEST-default-policy"};
  }
  const commerce=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",readShippingPolicy:reader});
  async function actor(kind:Actor["kind"]){
    const userId=randomUUID(),sessionId=randomUUID();users.push(userId);
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number,phone_number_verified) VALUES($1,\'TEST shipping fixture\',$2,true,$3,true)',[userId,`${userId}@fixture.invalid`,`+989${String(randomInt(0,1_000_000_000)).padStart(9,"0")}`]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);
    if(kind==="admin"){await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[userId]);await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);}
    return {userId,sessionId,kind};
  }
  async function write(fee:string,threshold:string|null=null){
    const db=await pool.connect();try{await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(818002)");await db.query("INSERT INTO store_setting(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=store_setting.version+1",[key,JSON.stringify({fee,threshold})]);await db.query("COMMIT");}catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  async function cart(coupon?:string){
    const {cart,guestToken}=await commerce.createCart();let filled=await commerce.setCartItem(cart.id,guestToken,variantId,1,cart.version);
    if(coupon)filled=await commerce.setCartCoupon(cart.id,guestToken,coupon,filled.version);
    return {guestToken,cartId:cart.id,cartVersion:filled.version};
  }
  function input(c:{cartId:string;cartVersion:number},quote:QuoteDto):CheckoutInput{return {...c,address,shippingMethodId:"standard",quoteFingerprint:quote.fingerprint,policyVersion:quote.policyVersion};}
  beforeAll(async()=>{
    admin=await actor("admin");const suffix=randomUUID();
    const product=await commerce.createProduct(admin,{name:`TEST shipping ${suffix}`,slug:`test-shipping-${suffix}`,description:"TEST shipping consent fixture",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-SHIP-${suffix}`,volumeMl:50,priceToman:"1003",initialStock:50}]});productIds.push(product.id);
    await commerce.publishProduct(admin,product.id,product.version);variantId=product.variants[0]!.id;
  });
  beforeEach(async()=>{readerGate=undefined;unavailable=false;customer=await actor("customer");await pool.query("DELETE FROM store_setting WHERE key=$1",[key]);});
  afterAll(async()=>{
    await pool.query("DELETE FROM store_setting WHERE key=$1",[key]);await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])",[productIds]);
    await pool.query("UPDATE coupon SET active=false WHERE code=ANY($1::text[])",[couponCodes]);await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])',[users]);
    await pool.query("DELETE FROM admin_grant WHERE session_id IN (SELECT id FROM session WHERE user_id=ANY($1::text[]))",[users]);await pool.end();
  });
  it("rejects a changed fee before effects and preserves accepted order/idempotent amounts",async()=>{
    await write("200");const c=await cart(),old=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);expect(old.shipping.amountIrr).toBe("200");
    await write("300");const operationKey=randomUUID();await expect(commerce.createCheckout(customer,c.guestToken,input(c,old),operationKey)).rejects.toMatchObject({code:"PRICE_CHANGED"});
    expect((await pool.query("SELECT count(*)::int AS count FROM orders WHERE user_id=$1",[customer.userId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM checkout_idempotency WHERE user_id=$1",[customer.userId])).rows[0].count).toBe(0);
    const fresh=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);expect(fresh.fingerprint).not.toBe(old.fingerprint);expect(fresh.policyVersion).toBe("TEST-shipping-v2");
    const accepted=await commerce.createCheckout(customer,c.guestToken,input(c,fresh),operationKey);expect(accepted.total.amountIrr).toBe("10330");
    await write("900");unavailable=true;const replay=await commerce.createCheckout(customer,c.guestToken,input(c,fresh),operationKey);expect(replay.orderId).toBe(accepted.orderId);expect(replay.total.amountIrr).toBe("10330");
    const preserved=await commerce.getOrder(customer,accepted.orderId);expect(preserved.shipping.amountIrr).toBe("300");expect(preserved.policyVersion).toBe("TEST-shipping-v2");
    expect((await pool.query("SELECT amount_irr::text FROM payment_attempt WHERE id=$1",[accepted.paymentAttemptId])).rows[0].amount_irr).toBe("10330");
  });
  it("applies an inclusive threshold after whole-toman discount rounding",async()=>{
    const code=`TESTSHIP${randomUUID().replaceAll("-","")}`.toUpperCase();couponCodes.push(code);
    await pool.query("INSERT INTO coupon(code,basis_points,usage_limit,per_user_limit,expires_at) VALUES($1,1250,10,10,now()+interval '1 hour')",[code]);
    await write("200","8780");const c=await cart(code),at=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);
    expect(at.subtotal.amountIrr).toBe("10030");expect(at.discount.amountIrr).toBe("1250");expect(at.shipping.amountIrr).toBe("0");expect(at.total.amountIrr).toBe("8780");
    await write("200","8790");const below=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);expect(below.shipping.amountIrr).toBe("200");expect(below.total.amountIrr).toBe("8980");
    await expect(commerce.createCheckout(customer,c.guestToken,input(c,at),randomUUID())).rejects.toMatchObject({code:"PRICE_CHANGED"});
    const accepted=await commerce.createCheckout(customer,c.guestToken,input(c,below),randomUUID());expect(accepted.total.amountIrr).toBe("8980");
  });
  it("holds the shared advisory lock when the default settings row is absent",async()=>{
    const c=await cart();let announce!:()=>void,release!:()=>void;const held=new Promise<void>((resolve)=>{announce=resolve;}),gate=new Promise<void>((resolve)=>{release=resolve;});
    readerGate=async()=>{announce();await gate;};const quoting=commerce.quoteCheckout(customer,c.guestToken,c.cartId);await held;
    const writer=await pool.connect();try{await writer.query("BEGIN");await writer.query("SET LOCAL lock_timeout='100ms'");await expect(writer.query("SELECT pg_advisory_xact_lock(818002)")).rejects.toMatchObject({code:"55P03"});}finally{await writer.query("ROLLBACK");writer.release();release();}
    const old=await quoting;expect(old.policyVersion).toBe("TEST-default-policy");expect(old.shipping.amountIrr).toBe("0");readerGate=undefined;
    await write("100");await expect(commerce.createCheckout(customer,c.guestToken,input(c,old),randomUUID())).rejects.toMatchObject({code:"PRICE_CHANGED"});
    const fresh=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);expect(fresh.shipping.amountIrr).toBe("100");
  });
  it("fingerprints source settings even if a writer fails to advance its version",async()=>{
    await write("200","0");const c=await cart(),old=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);
    await pool.query("UPDATE store_setting SET value=$2::jsonb WHERE key=$1",[key,JSON.stringify({fee:"300",threshold:"0"})]);
    const fresh=await commerce.quoteCheckout(customer,c.guestToken,c.cartId);expect(fresh.shipping.amountIrr).toBe("0");expect(fresh.policyVersion).toBe(old.policyVersion);expect(fresh.fingerprint).not.toBe(old.fingerprint);
    await expect(commerce.createCheckout(customer,c.guestToken,input(c,old),randomUUID())).rejects.toMatchObject({code:"PRICE_CHANGED"});
  });
  it("fails closed for invalid policy money and retains static-option compatibility",async()=>{
    const c=await cart();for(const [fee,threshold] of [["-10",null],["11",null],["1000000010",null],["0","-10"],["0","11"]] as const){await write(fee,threshold);await expect(commerce.quoteCheckout(customer,c.guestToken,c.cartId)).rejects.toMatchObject({code:"CONFIGURATION"});}
    const legacy=createCommerce({pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",shippingFeeIrr:100n,freeShippingThresholdIrr:10040n,policyVersion:"TEST-static-policy"});
    const staticQuote=await legacy.quoteCheckout(customer,c.guestToken,c.cartId);expect(staticQuote.shipping.amountIrr).toBe("100");expect(staticQuote.policyVersion).toBe("TEST-static-policy");
    const accepted=await legacy.createCheckout(customer,c.guestToken,input(c,staticQuote),randomUUID());expect(accepted.total.amountIrr).toBe("10130");
  });
});
