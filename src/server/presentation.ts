import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor, Role } from "../contracts/commerce";
import { CommerceError } from "../contracts/commerce";
import type { AdminPresentationDto, PresentationDto, PresentationValue, StoreLink } from "../contracts/presentation";
import { pool } from "./db";
import { ROLE_PERMISSIONS } from "./commerce/permissions";
import { defaultPresentation, presentationInput, presentationValue } from "./presentation-schema";

type Queryable=Pick<PoolClient,"query">;
const settingKey="presentation", lockKey=818003;
function parseStored(row?:{value:unknown;version:number}):PresentationDto {
  const parsed=presentationValue.safeParse(row?.value ?? defaultPresentation);
  if(!parsed.success)throw new CommerceError("CONFIGURATION","تنظیمات نمایش فروشگاه معتبر نیست.",503);
  return {...parsed.data,version:row?.version??1,configured:!!row};
}
function links(value:PresentationValue):StoreLink[] {
  return [...value.headerLinks,...value.footerLinks,...(value.heroAction?[value.heroAction]:[]),...(value.banner?.link?[value.banner.link]:[]),...value.services.flatMap(service=>service.link?[service.link]:[])];
}
async function unavailableReferences(db:Queryable,value:PresentationValue) {
  const grouped={products:new Set<string>(),collections:new Set<string>(),pages:new Set<string>()};
  for(const link of links(value)) {
    const match=/^\/(products|collections|pages)\/([a-z0-9-]+)$/.exec(link.href);
    if(match)grouped[match[1] as keyof typeof grouped].add(match[2]!);
  }
  const available=new Set<string>();
  if(grouped.products.size) {
    const rows=await db.query<{slug:string}>("SELECT s.slug FROM product_slug_claim s JOIN product p ON p.id=s.product_id WHERE s.slug=ANY($1::text[]) AND p.status='published' AND EXISTS(SELECT 1 FROM variant v WHERE v.product_id=p.id AND v.active)",[[...grouped.products]]);
    for(const row of rows.rows)available.add(`/products/${row.slug}`);
  }
  if(grouped.collections.size) {
    const rows=await db.query<{slug:string}>("SELECT s.slug FROM collection_slug_claim s JOIN collection c ON c.id=s.collection_id WHERE s.slug=ANY($1::text[]) AND c.published",[[...grouped.collections]]);
    for(const row of rows.rows)available.add(`/collections/${row.slug}`);
  }
  if(grouped.pages.size) {
    const rows=await db.query<{slug:string}>("SELECT slug FROM content_page WHERE slug=ANY($1::text[]) AND status='published'",[[...grouped.pages]]);
    for(const row of rows.rows)available.add(`/pages/${row.slug}`);
  }
  const unavailableLinks=[...new Set(links(value).map(link=>link.href))].filter(href=>/^\/(products|collections|pages)\//.test(href) && !available.has(href));
  const products=value.featuredProductIds.length ? await db.query<{id:string}>("SELECT p.id FROM product p WHERE p.id=ANY($1::uuid[]) AND p.status='published' AND EXISTS(SELECT 1 FROM variant v WHERE v.product_id=p.id AND v.active)",[value.featuredProductIds]) : {rows:[]};
  const productIds=new Set(products.rows.map(row=>row.id));
  return {unavailableLinks,unavailableProductIds:value.featuredProductIds.filter(id=>!productIds.has(id))};
}
async function authorize(db:Queryable,actor:Actor,maintenanceChange=false) {
  if(actor.kind!=="admin")throw new CommerceError("FORBIDDEN","مجوز تغییر نمایش فروشگاه را ندارید.",403);
  const allowed=maintenanceChange? ["owner"] : (Object.keys(ROLE_PERMISSIONS) as Role[]).filter(role=>ROLE_PERMISSIONS[role].includes("content.write"));
  const sql=`SELECT s.id,g.factor_verified_at>clock_timestamp()-interval '5 minutes' AS factor_fresh FROM session s JOIN "user" u ON u.id=s.user_id JOIN admin_grant g ON g.session_id=s.id JOIN role_membership r ON r.user_id=u.id WHERE s.id=$1 AND u.id=$2 AND s.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp() AND NOT u.disabled AND u.two_factor_enabled AND r.role=ANY($3::text[])`;
  const values=[actor.sessionId,actor.userId,allowed];
  if(!(await db.query(`${sql} FOR SHARE OF s,u,g,r`,values)).rowCount)throw new CommerceError("FORBIDDEN","مجوز تغییر نمایش فروشگاه را ندارید.",403);
  const current=await db.query<{factor_fresh:boolean}>(sql,values);
  if(!current.rowCount)throw new CommerceError("FORBIDDEN","مجوز تغییر نمایش فروشگاه را ندارید.",403);
  if(maintenanceChange && !current.rows[0]!.factor_fresh)throw new CommerceError("MFA_REQUIRED","تغییر توقف موقت سفارش‌گیری به تأیید دومرحله‌ای تازه نیاز دارد.",403);
}
export function createPresentationStore(database:Pool) {
async function getAdminPresentation(actor:Actor):Promise<AdminPresentationDto> {
  const db=await database.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");await authorize(db,actor);
    const row=await db.query<{value:unknown;version:number}>("SELECT value,version FROM store_setting WHERE key=$1",[settingKey]);
    const value=parseStored(row.rows[0]);const unavailable=await unavailableReferences(db,value);
    await db.query("COMMIT");return {...value,...unavailable};
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
async function getPresentation():Promise<PresentationDto> {
  const db=await database.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const row=await db.query<{value:unknown;version:number}>("SELECT value,version FROM store_setting WHERE key=$1",[settingKey]);
    const value=parseStored(row.rows[0]),unavailable=await unavailableReferences(db,value);
    const allowed=(link:StoreLink)=>!unavailable.unavailableLinks.includes(link.href);
    await db.query("COMMIT");
    return {...value,headerLinks:value.headerLinks.filter(allowed),footerLinks:value.footerLinks.filter(allowed),heroAction:value.heroAction && allowed(value.heroAction)?value.heroAction:null,
      banner:value.banner?{...value.banner,link:value.banner.link && allowed(value.banner.link)?value.banner.link:null}:null,
      featuredProductIds:value.featuredProductIds.filter(id=>!unavailable.unavailableProductIds.includes(id)),services:value.services.filter(service=>service.enabled && (!service.link || allowed(service.link)))};
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
async function savePresentation(actor:Actor,raw:unknown):Promise<AdminPresentationDto> {
  const {expectedVersion,reason,...value}=presentationInput.parse(raw),db=await database.connect();
  try {
    await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock($1)",[lockKey]);
    const result=await db.query<{value:unknown;version:number}>("SELECT value,version FROM store_setting WHERE key=$1 FOR UPDATE",[settingKey]);
    const prior=parseStored(result.rows[0]),maintenanceChange=JSON.stringify(prior.maintenance)!==JSON.stringify(value.maintenance);
    await authorize(db,actor,maintenanceChange);
    if(prior.version!==expectedVersion)throw new CommerceError("CONFLICT","تنظیمات نمایش تغییر کرده است. نسخهٔ تازه را بررسی کنید.",409);
    const unavailable=await unavailableReferences(db,value),previousLinks=new Set(links(prior).map(link=>link.href));
    if(unavailable.unavailableLinks.some(href=>!previousLinks.has(href)) || unavailable.unavailableProductIds.some(id=>!prior.featuredProductIds.includes(id)))throw new CommerceError("VALIDATION","برای پیوند یا محصول تازه، مقصد منتشرشده و در دسترس انتخاب کنید.");
    await authorize(db,actor,maintenanceChange);
    await db.query("INSERT INTO store_setting(key,value,version,updated_by) VALUES($1,$2::jsonb,2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=store_setting.version+1,updated_at=now(),updated_by=excluded.updated_by",[settingKey,JSON.stringify(value),actor.userId]);
    await db.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,'presentation.updated','setting',$3,$4)",[randomUUID(),actor.userId,settingKey,reason]);
    await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  return getAdminPresentation(actor);
}
return {getPresentation,getAdminPresentation,savePresentation};
}
export const {getPresentation,getAdminPresentation,savePresentation}=createPresentationStore(pool);
// Read this at the start of the commerce transaction, before user/stock locks.
// The exclusive setting writer uses the same lock order. Existing payment
// callbacks/reconciliation and already-created idempotent orders remain usable.
export async function readCheckoutEnabled(db:Queryable):Promise<boolean> {
  await db.query("SELECT pg_advisory_xact_lock_shared($1)",[lockKey]);
  const row=await db.query<{value:unknown;version:number}>("SELECT value,version FROM store_setting WHERE key=$1",[settingKey]);
  return !parseStored(row.rows[0]).maintenance.enabled;
}
