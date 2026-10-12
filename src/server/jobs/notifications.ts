import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CommerceError, type DeploymentEnvironment } from "../../contracts/commerce";

const TITLES:ReadonlyMap<string,string>=new Map([
  ["order.created","سفارش آزمایشی ثبت شد."],
  ["order.paid","پرداخت آزمایشی تأیید شد."],
  ["payment.succeeded","پرداخت آزمایشی تأیید شد."],
  ["shipment.updated","وضعیت ارسال آزمایشی به‌روز شد."],
  ["shipment.shipped","سفارش آزمایشی ارسال شد."],
  ["shipment.delivered","سفارش آزمایشی تحویل داده شد."],
]);
const BODY="وضعیت سفارش آزمایشی شما به‌روز شد. جزئیات را در بخش سفارش‌ها ببینید.";

export async function notifyOrderEvent(pool:Pool,deploymentEnv:DeploymentEnvironment,type:string,payload:Record<string,unknown>,dedupeKey:string):Promise<void>{
  if(deploymentEnv!=="test" && deploymentEnv!=="staging")throw new CommerceError("CONFIGURATION","اعلان آزمایشی در محیط واقعی مجاز نیست.",503);
  if(!payload || typeof payload!=="object" || Array.isArray(payload))return;
  const title=TITLES.get(type),orderId=payload.orderId;
  if(!title || typeof orderId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId) || typeof dedupeKey!=="string" || !dedupeKey || dedupeKey.length>256)return;
  const order=await pool.query<{user_id:string}>("SELECT user_id FROM orders WHERE id=$1",[orderId]);
  if(!order.rows[0])return;
  // Actor/recipient/amount fields in event payload never determine delivery or message text.
  await pool.query("INSERT INTO notification_message(id,user_id,event_key,title,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING",[randomUUID(),order.rows[0].user_id,dedupeKey,title,BODY]);
}
