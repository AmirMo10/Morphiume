import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { CommerceError, type Actor } from "../contracts/commerce";
import { MAX_AMOUNT_IRR, moneyDto, tomanToIrr } from "../lib/money";
import { pool } from "./db";

type Queryable=Pick<PoolClient,"query">;
const stored=z.object({shippingFeeIrr:z.string().regex(/^\d{1,10}$/),freeShippingThresholdIrr:z.string().regex(/^\d{1,10}$/).nullable()}).strict();
const input=z.object({shippingFeeToman:z.string().max(40),freeShippingThresholdToman:z.string().max(40).nullable(),expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(1000)}).strict();
const financialAuthorization='SELECT s.id FROM session s JOIN "user" u ON u.id=s.user_id JOIN admin_grant g ON g.session_id=s.id JOIN role_membership r ON r.user_id=u.id WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>clock_timestamp() AND NOT u.disabled AND u.two_factor_enabled AND g.expires_at>clock_timestamp() AND g.factor_verified_at>clock_timestamp()-interval \'5 minutes\' AND r.role IN (\'owner\',\'finance\') FOR SHARE OF s,u,g,r';
async function requireFinancialProof(db:Queryable,actor:Actor) {
  const authorized=await db.query(financialAuthorization,[actor.sessionId,actor.userId]);
  if(!authorized.rowCount) throw new CommerceError("FORBIDDEN","برای تغییر مبلغ ارسال، مجوز مالی و تأیید دومرحله‌ای تازه لازم است.",403);
}

function policy(row?:{value:unknown;version:number}) {
  const parsed=stored.safeParse(row?.value ?? {shippingFeeIrr:"0",freeShippingThresholdIrr:null});
  if(!parsed.success) throw new CommerceError("CONFIGURATION","تنظیمات مبلغ ارسال معتبر نیست.",503);
  const value=parsed.data;
  const shippingFeeIrr=BigInt(value.shippingFeeIrr);
  const freeShippingThresholdIrr=value.freeShippingThresholdIrr===null ? undefined : BigInt(value.freeShippingThresholdIrr);
  for(const amount of [shippingFeeIrr,freeShippingThresholdIrr]) if(amount!==undefined && (amount>MAX_AMOUNT_IRR || amount%10n)) throw new CommerceError("CONFIGURATION","تنظیمات مبلغ ارسال معتبر نیست.",503);
  return {shippingFeeIrr,freeShippingThresholdIrr,policyVersion:row?`shipping-v${row.version}`:"staging-policy-v1",version:row?.version??1,configured:!!row};
}

export async function readShippingPolicy(db:Queryable) {
  // Writer takes the exclusive lock too, so the missing default row cannot
  // change underneath a checkout. Quote/checkout callers use ordinary DB txs.
  await db.query("SELECT pg_advisory_xact_lock_shared(818002)");
  const result=await db.query<{value:unknown;version:number}>("SELECT value,version FROM store_setting WHERE key='shipping' FOR SHARE");
  const value=policy(result.rows[0]);
  return {shippingFeeIrr:value.shippingFeeIrr,freeShippingThresholdIrr:value.freeShippingThresholdIrr,policyVersion:value.policyVersion};
}

export async function getShippingSettings() {
  const result=await pool.query<{value:unknown;version:number}>("SELECT value,version FROM store_setting WHERE key='shipping'");
  const value=policy(result.rows[0]);
  return {shippingFee:moneyDto(value.shippingFeeIrr),freeShippingThreshold:value.freeShippingThresholdIrr===undefined?null:moneyDto(value.freeShippingThresholdIrr),policyVersion:value.policyVersion,version:value.version,configured:value.configured};
}

export async function saveShippingSettings(actor:Actor,raw:unknown) {
  const data=input.parse(raw);
  if(actor.kind!=="admin") throw new CommerceError("FORBIDDEN","مجوز تغییر هزینهٔ ارسال را ندارید.",403);
  let fee:bigint,threshold:bigint|undefined;
  try { fee=tomanToIrr(data.shippingFeeToman); threshold=data.freeShippingThresholdToman===null?undefined:tomanToIrr(data.freeShippingThresholdToman); }
  catch { throw new CommerceError("VALIDATION","هزینه و آستانهٔ ارسال را به تومان کامل و در محدودهٔ مجاز وارد کنید."); }
  const db=await pool.connect();
  try {
    await db.query("BEGIN");
    await requireFinancialProof(db,actor);
    await db.query("SELECT pg_advisory_xact_lock(818002)");
    // PostgreSQL now() is frozen at BEGIN. A blocked writer must still have a
    // recent genuine proof at the actual mutation boundary.
    await requireFinancialProof(db,actor);
    const prior=await db.query<{version:number}>("SELECT version FROM store_setting WHERE key='shipping' FOR UPDATE");
    if((prior.rows[0]?.version??1)!==data.expectedVersion) throw new CommerceError("CONFLICT","هزینهٔ ارسال تغییر کرده است. نسخهٔ تازه را بررسی کنید.",409);
    const value={shippingFeeIrr:fee.toString(),freeShippingThresholdIrr:threshold?.toString()??null};
    const next=await db.query<{version:number}>("INSERT INTO store_setting(key,value,version,updated_by) VALUES('shipping',$1::jsonb,2,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=store_setting.version+1,updated_at=now(),updated_by=excluded.updated_by RETURNING version",[JSON.stringify(value),actor.userId]);
    await db.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,'shipping.policy_updated','setting','shipping',$3)",[randomUUID(),actor.userId,`${data.reason}\nنسخهٔ تنظیمات: ${next.rows[0]!.version}`]);
    await db.query("COMMIT");
    return getShippingSettings();
  } catch(error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
