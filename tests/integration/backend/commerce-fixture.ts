import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";
import type { Actor, CheckoutInput } from "../../../src/contracts/commerce";
import { createCommerce, type CommerceOptions } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";

/** Controlled domain authorization fixtures; these do not authenticate through native MFA. */
export async function commerceFixture(pool:pg.Pool,extra:Partial<CommerceOptions>={}){
  const mock=new MockPaymentProvider(pool,"test","http://127.0.0.1:3000");
  const options:CommerceOptions={pool,payments:mock,deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000",...extra};
  const commerce=createCommerce(options);
  async function actor(kind:Actor["kind"]):Promise<Actor>{
    const userId=randomUUID(),sessionId=randomUUID();
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number,phone_number_verified,two_factor_enabled) VALUES($1,\'TEST domain fixture\',$2,true,$3,true,$4)',[userId,`${userId}@fixture.invalid`,`+989${String(randomInt(0,1_000_000_000)).padStart(9,"0")}`,kind==="admin"]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);
    if(kind==="admin"){
      await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[userId]);
      await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);
    }
    return {userId,sessionId,kind};
  }
  const admin=await actor("admin"),customer=await actor("customer"),suffix=randomUUID();
  const product=await commerce.createProduct(admin,{name:`TEST domain ${suffix}`,slug:`test-domain-${suffix}`,description:"TEST controlled fixture",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-${suffix}`,volumeMl:50,priceToman:"1000",initialStock:10}]});
  await commerce.publishProduct(admin,product.id,product.version);
  const variantId=product.variants[0]!.id;
  async function cart(coupon?:string){
    const {cart,guestToken}=await commerce.createCart();let filled=await commerce.setCartItem(cart.id,guestToken,variantId,1,cart.version);
    if(coupon)filled=await commerce.setCartCoupon(cart.id,guestToken,coupon,filled.version);
    const quote=await commerce.quoteCheckout(customer,guestToken,cart.id);
    const input:CheckoutInput={cartId:cart.id,cartVersion:filled.version,address:{recipient:"TEST recipient",phone:"09121234567",province:"TEST",city:"TEST",address:"TEST address",plaque:"1",postalCode:"1234567890"},shippingMethodId:"standard",quoteFingerprint:quote.fingerprint,policyVersion:quote.policyVersion};
    return {guestToken,input,key:randomUUID()};
  }
  async function authority(attemptId:string){return (await pool.query<{authority:string}>("SELECT authority FROM payment_attempt WHERE id=$1",[attemptId])).rows[0]!.authority;}
  async function purchase(deliver=false){
    const c=await cart(),checkout=await commerce.createCheckout(customer,c.guestToken,c.input,c.key),auth=await authority(checkout.paymentAttemptId);
    await mock.complete(auth,"paid");await commerce.verifyPayment(auth);
    if(deliver){const shipment={carrier:"TEST carrier",trackingCode:"TEST tracking"};await commerce.recordShipment(admin,checkout.orderId,{...shipment,status:"shipped"});await commerce.recordShipment(admin,checkout.orderId,{...shipment,status:"delivered"});}
    return {c,checkout,auth};
  }
  return {pool,mock,options,commerce,admin,customer,variantId,actor,cart,authority,purchase};
}

export async function observeLock(pool:pg.Pool,applicationName:string,pattern:string){
  const deadline=Date.now()+2200;
  while(Date.now()<deadline){
    if((await pool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2",[applicationName,pattern])).rowCount)return;
  }
  throw new Error(`TEST expected lock wait was not observed: ${pattern}`);
}
