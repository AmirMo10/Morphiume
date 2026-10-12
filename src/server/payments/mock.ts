import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CommerceError, type DeploymentEnvironment } from "../../contracts/commerce";
import type { CreatedPayment, PaymentContext, PaymentInquiry, PaymentProvider, VerifiedPayment } from "./provider";

export class MockPaymentProvider implements PaymentProvider {
  readonly name="mock" as const;
  readonly capabilities={reverse:false,partialRefund:false,generalRefund:false} as const;
  constructor(private pool:Pool,readonly environment:DeploymentEnvironment,private appBaseUrl:string){if(environment==="live")throw new CommerceError("CONFIGURATION","درگاه آزمایشی در محیط واقعی مجاز نیست.",503);}
  async create(context:PaymentContext):Promise<CreatedPayment>{
    const authority=`MOCK-${randomUUID()}`;
    const result=await this.pool.query<{authority:string}>("INSERT INTO mock_provider_transaction(authority,attempt_id,amount_irr) VALUES($1,$2,$3) ON CONFLICT(attempt_id) DO UPDATE SET attempt_id=excluded.attempt_id RETURNING authority",[authority,context.attemptId,context.amountIrr.toString()]);
    return {kind:"created",authority:result.rows[0]!.authority,redirectUrl:`${new URL(this.appBaseUrl).origin}/test/payments/${encodeURIComponent(result.rows[0]!.authority)}`};
  }
  async complete(authority:string,outcome:"paid"|"failed"|"timeout"){
    if(this.environment==="live")throw new CommerceError("CONFIGURATION","درگاه آزمایشی غیرفعال است.",503);
    if(!["paid","failed","timeout"].includes(outcome))throw new CommerceError("VALIDATION","نتیجهٔ آزمایش معتبر نیست.");
    await this.pool.query("UPDATE mock_provider_transaction SET status=$1,provider_ref=CASE WHEN $1='paid' THEN coalesce(provider_ref,$2) ELSE provider_ref END WHERE authority=$3 AND NOT verified",[outcome,`MR-${randomUUID()}`,authority]);
  }
  async verify(context:PaymentContext & {authority:string}):Promise<VerifiedPayment>{
    const client=await this.pool.connect();try{await client.query("BEGIN");const result=await client.query<{amount_irr:string;status:string;provider_ref:string;verified:boolean}>("SELECT * FROM mock_provider_transaction WHERE authority=$1 AND attempt_id=$2 FOR UPDATE",[context.authority,context.attemptId]);const row=result.rows[0];let output:VerifiedPayment;
      if(!row || BigInt(row.amount_irr)!==context.amountIrr || context.currency!=="IRR")output={kind:"rejected",code:"-50"};
      else if(row.status==="timeout" || row.status==="pending")output={kind:"unknown",code:"mock_pending"};
      else if(row.status!=="paid")output={kind:"rejected",code:"-51"};
      else{output={kind:"verified",providerRef:row.provider_ref,alreadyVerified:row.verified};await client.query("UPDATE mock_provider_transaction SET verified=true WHERE authority=$1",[context.authority]);}
      await client.query("COMMIT");return output;
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
  async inquiry(context:PaymentContext & {authority:string}):Promise<PaymentInquiry>{const result=await this.pool.query<{status:string;verified:boolean}>("SELECT status,verified FROM mock_provider_transaction WHERE authority=$1 AND attempt_id=$2",[context.authority,context.attemptId]);const row=result.rows[0];if(!row)return {kind:"unknown",code:"-54"};if(row.status==="timeout")return {kind:"unknown",code:"mock_timeout"};return {kind:"known",status:row.verified ? "VERIFIED" : row.status==="paid" ? "PAID" : row.status==="failed" ? "FAILED" : "IN_BANK"};}
}
