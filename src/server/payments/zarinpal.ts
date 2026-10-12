import "server-only";
import { CommerceError, type DeploymentEnvironment } from "../../contracts/commerce";
import type { CreatedPayment, PaymentContext, PaymentInquiry, PaymentProvider, VerifiedPayment } from "./provider";
type Payload={data?:{code?:number;authority?:string;ref_id?:number|string;status?:string};errors?:{code?:number}};
export class ZarinpalPaymentProvider implements PaymentProvider {
  readonly name="zarinpal" as const;
  readonly capabilities={reverse:true,partialRefund:false,generalRefund:false} as const;
  private host:string;
  constructor(readonly environment:DeploymentEnvironment,private merchantId:string,private callbackOrigin:string,private sandbox:boolean){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantId))throw new CommerceError("CONFIGURATION","شناسهٔ پذیرندهٔ زرین‌پال معتبر نیست.",503);
    if(environment==="live" && sandbox)throw new CommerceError("CONFIGURATION","سندباکس در محیط واقعی مجاز نیست.",503);
    if(environment!=="live" && !sandbox)throw new CommerceError("CONFIGURATION","پرداخت واقعی فقط در محیط واقعی مجاز است.",503);
    this.host=sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
  }
  private async post(method:string,body:object):Promise<Payload|null>{
    try{
      const response=await fetch(`${this.host}/pg/v4/payment/${method}.json`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(12000)});
      if(!response.ok)return null;
      const raw=await response.text();if(raw.length>32768)return null;
      // Node 24 reviver context preserves an integer reference's original JSON digits.
      return JSON.parse(raw,(key:string,value:unknown,context?:{source:string})=>key==="ref_id" && typeof value==="number" && context?.source && /^[0-9]+$/.test(context.source) ? context.source : value) as Payload;
    }catch{return null;}
  }
  private context(context:PaymentContext){if(context.currency!=="IRR" || context.merchantKey!==this.merchantId || context.amountIrr<=0n || context.amountIrr>1_000_000_000n || new URL(context.callbackUrl).origin!==new URL(this.callbackOrigin).origin)throw new CommerceError("CONFIGURATION","قرارداد پرداخت تطبیق ندارد.",503);return {merchant_id:this.merchantId,amount:Number(context.amountIrr)};}
  async create(context:PaymentContext):Promise<CreatedPayment>{
    const payload=await this.post("request",{...this.context(context),currency:"IRR",callback_url:context.callbackUrl,description:`Morphiume order ${context.orderId}`,metadata:{order_id:context.orderId}});
    if(!payload)return {kind:"unknown",code:"transport"};
    if(payload.data?.code===100 && typeof payload.data.authority==="string" && /^[AS][A-Za-z0-9]{10,100}$/.test(payload.data.authority))return {kind:"created",authority:payload.data.authority,redirectUrl:`${this.host}/pg/StartPay/${encodeURIComponent(payload.data.authority)}`};
    const code=payload.errors?.code ?? payload.data?.code;
    return typeof code==="number" && code<0 ? {kind:"rejected",code:String(code)} : {kind:"unknown",code:"malformed"};
  }
  async verify(context:PaymentContext & {authority:string}):Promise<VerifiedPayment>{const payload=await this.post("verify",{...this.context(context),authority:context.authority});if(!payload)return {kind:"unknown",code:"transport"};if(payload.data?.code===100 || payload.data?.code===101){const ref=payload.data.ref_id;if(typeof ref==="number" && !Number.isSafeInteger(ref))return {kind:"unknown",code:"unsafe_ref_id"};if((typeof ref!=="string" && typeof ref!=="number") || !/^[0-9]+$/.test(String(ref)))return {kind:"unknown",code:"missing_ref_id"};return {kind:"verified",providerRef:String(ref),alreadyVerified:payload.data.code===101};}const code=payload.errors?.code ?? payload.data?.code;return code===-52 || code===undefined ? {kind:"unknown",code:String(code ?? "malformed")} : {kind:"rejected",code:String(code)};}
  async inquiry(context:PaymentContext & {authority:string}):Promise<PaymentInquiry>{this.context(context);const payload=await this.post("inquiry",{merchant_id:this.merchantId,authority:context.authority});const status=payload?.data?.status;if(payload?.data?.code===100 && ["VERIFIED","PAID","IN_BANK","FAILED","REVERSED"].includes(status ?? ""))return {kind:"known",status:status as Extract<PaymentInquiry,{kind:"known"}>["status"]};return {kind:"unknown",code:String(payload?.errors?.code ?? "transport")};}
  async reverse(context:PaymentContext & {authority:string}):Promise<{kind:"reversed"}|{kind:"rejected"|"unknown";code:string}>{this.context(context);const payload=await this.post("reverse",{merchant_id:this.merchantId,authority:context.authority});if(!payload)return {kind:"unknown",code:"transport"};return payload.data?.code===100 ? {kind:"reversed"} : {kind:"rejected",code:String(payload.errors?.code ?? payload.data?.code ?? "malformed")};}
}
