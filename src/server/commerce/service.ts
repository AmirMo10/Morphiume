import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { CommerceError, type Actor, type AddressInput, type AdminProductPageInput, type BulkEditDto, type BulkEditInput, type CartDto, type CatalogPageDto, type CheckoutDto, type CheckoutInput, type DeploymentEnvironment, type OrderDto, type OrdersPageInput, type PageDto, type Permission, type ProductDto, type ProductImage, type ProductInput, type ProductPageInput, type ProductResolutionDto, type QuoteDto, type Role, type SitemapProductDto, type VariantDto, type VariantPageInput } from "../../contracts/commerce";
import type { PaymentProvider, PaymentContext } from "../payments/provider";
import { MAX_MONEY_IRR, moneyDto, normalizeDigits, normalizeIranPhone, percentageDiscount, parseIrr, tomanToIrr } from "./money";
import { ROLE_PERMISSIONS } from "./permissions";
import { normalizeSearch } from "../../lib/persian";
import { tomanToIrr as rangeTomanToIrr } from "../../lib/money";

type Row = Record<string, unknown>;
type Connection = Pool | PoolClient;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (row: Row, key: string) => String(row[key]);
const number = (row: Row, key: string) => Number(row[key]);
const date = (value: unknown) => new Date(String(value)).toISOString();
function fail(code: ConstructorParameters<typeof CommerceError>[0], message: string, status = 400): never { throw new CommerceError(code,message,status); }
const query = async (db: Connection, sql: string, values: unknown[] = []) => (await db.query<Row>(sql, values)).rows;
const one = async (db: Connection, sql: string, values: unknown[] = []) => (await query(db,sql,values))[0];
function boundedString(value: unknown, label: string, max: number, min = 1): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) return fail("VALIDATION",`${label} معتبر نیست.`);
  return value.trim();
}
function pagination(input: { page?: number; pageSize?: number }) {
  const page=input.page ?? 1,pageSize=input.pageSize ?? 24;
  if(!Number.isSafeInteger(page) || page<1 || page>1_000_000 || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>100)fail("VALIDATION","شمارهٔ صفحه یا تعداد نتایج معتبر نیست.");
  return {page,pageSize,offset:(page-1)*pageSize};
}
function pageDto<T>(items:T[],page:number,pageSize:number,totalItems:number):PageDto<T>{return {items,page,pageSize,totalItems,totalPages:Math.ceil(totalItems/pageSize)};}
function exportLimit(maximum:number){if(!Number.isSafeInteger(maximum) || maximum<1 || maximum>10_000)fail("VALIDATION","سقف خروجی باید بین یک و ده‌هزار باشد.");return maximum;}
function searchInput(value:unknown):string{return value===undefined ? "" : normalizeSearch(boundedString(value,"جست‌وجو",120,0));}
function literalSearch(value:string):string{return value.replace(/[\\%_]/g,"\\$&");}
function addressInput(input: AddressInput): AddressInput {
  const postalCode = normalizeDigits(input.postalCode ?? "");
  if (!/^[0-9]{10}$/.test(postalCode)) fail("VALIDATION","کدپستی باید ده رقم باشد.");
  return { recipient: boundedString(input.recipient,"نام گیرنده",120), phone: normalizeIranPhone(input.phone), province: boundedString(input.province,"استان",80), city: boundedString(input.city,"شهر",80), address: boundedString(input.address,"نشانی",1000), plaque: boundedString(input.plaque,"پلاک",20), unit: input.unit ? boundedString(input.unit,"واحد",20) : undefined, postalCode };
}
function validateProduct(input: ProductInput) {
  boundedString(input.name,"نام محصول",160); boundedString(input.description,"توضیح",10000,0);
  boundedString(input.concentration,"غلظت",80,0);boundedString(input.family,"خانوادهٔ رایحه",80,0);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 160) fail("VALIDATION","نشانی محصول معتبر نیست.");
  if (!input.variants?.length || input.variants.length > 20) fail("VALIDATION","حداقل یک حجم و حداکثر بیست حجم لازم است.");
  for (const variant of input.variants) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(variant.sku) || !Number.isInteger(variant.volumeMl) || variant.volumeMl <= 0 || variant.volumeMl > 5000) fail("VALIDATION","حجم یا شناسهٔ کالا معتبر نیست.");
    tomanToIrr(variant.priceToman);
    if (variant.initialStock !== undefined && (!Number.isInteger(variant.initialStock) || variant.initialStock < 0 || variant.initialStock > 100000)) fail("VALIDATION","موجودی معتبر نیست.");
  }
  for (const notes of [input.topNotes,input.heartNotes,input.baseNotes]) if (!Array.isArray(notes) || notes.length > 30 || notes.some((note) => typeof note !== "string" || note.length > 120)) fail("VALIDATION","نت‌های رایحه معتبر نیستند.");
  if(input.images!==undefined){
    if(!Array.isArray(input.images) || input.images.length>10)fail("VALIDATION","حداکثر ده تصویر برای محصول انتخاب کنید.");
    for(const image of input.images){
      if(!image || typeof image!=="object")fail("VALIDATION","تصویر معتبر نیست.");
      boundedString(image.url,"نشانی تصویر",128);boundedString(image.alt,"توضیح تصویر",240);
      if(image.variantSku!==undefined && image.variantSku!==null && (typeof image.variantSku!=="string" || !input.variants.some((variant)=>variant.sku===image.variantSku)))fail("VALIDATION","تصویر را به یکی از حجم‌های همین محصول متصل کنید.");
    }
  }
}

export type CommerceQueryable = Pick<PoolClient,"query">;
export type CommerceShippingPolicy = { shippingFeeIrr: bigint; freeShippingThresholdIrr?: bigint; policyVersion: string };
function validateShippingPolicy(policy:CommerceShippingPolicy):CommerceShippingPolicy {
  if(!policy || typeof policy.shippingFeeIrr!=="bigint" || policy.shippingFeeIrr<0n || policy.shippingFeeIrr>MAX_MONEY_IRR || policy.shippingFeeIrr%10n)fail("CONFIGURATION","هزینهٔ ارسال معتبر نیست.",503);
  const threshold=policy.freeShippingThresholdIrr;
  if(threshold!==undefined && (typeof threshold!=="bigint" || threshold<0n || threshold>MAX_MONEY_IRR || threshold%10n))fail("CONFIGURATION","آستانهٔ ارسال رایگان معتبر نیست.",503);
  if(typeof policy.policyVersion!=="string" || !policy.policyVersion.trim() || policy.policyVersion.length>128)fail("CONFIGURATION","نسخهٔ سیاست ارسال معتبر نیست.",503);
  return {shippingFeeIrr:policy.shippingFeeIrr,freeShippingThresholdIrr:threshold,policyVersion:policy.policyVersion};
}
export interface CommerceOptions {
  pool: Pool; payments: PaymentProvider; deploymentEnv: DeploymentEnvironment; appBaseUrl: string;
  merchantKey?: string; reservationMinutes?: number; shippingFeeIrr?: bigint; freeShippingThresholdIrr?: bigint; policyVersion?: string;
  readShippingPolicy?: (queryable: CommerceQueryable) => Promise<CommerceShippingPolicy>;
}
export function createCommerce(options: CommerceOptions) {
  const { pool, payments, deploymentEnv } = options;
  if (deploymentEnv === "live" && payments.name === "mock") fail("CONFIGURATION","درگاه آزمایشی در محیط واقعی مجاز نیست.",503);
  const staticShippingPolicy=validateShippingPolicy({shippingFeeIrr:options.shippingFeeIrr ?? 0n,freeShippingThresholdIrr:options.freeShippingThresholdIrr,policyVersion:options.policyVersion ?? "staging-policy-v1"});
  async function shippingPolicy(db:PoolClient){return options.readShippingPolicy ? validateShippingPolicy(await options.readShippingPolicy(db)) : staticShippingPolicy;}
  const reservationMinutes = options.reservationMinutes ?? 15;
  if (!Number.isInteger(reservationMinutes) || reservationMinutes < 1 || reservationMinutes > 60) fail("CONFIGURATION","زمان رزرو معتبر نیست.",503);
  const merchantKey = options.merchantKey ?? (payments.name === "mock" ? "controlled-mock" : "");
  if (!merchantKey) fail("CONFIGURATION","پذیرندهٔ پرداخت تنظیم نشده است.",503);
  const appBaseUrl = new URL(options.appBaseUrl).origin;

  async function transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const db = await pool.connect();
      try { await db.query("BEGIN"); await db.query("SET LOCAL lock_timeout = '3s'"); const result = await work(db); await db.query("COMMIT"); return result; }
      catch (error) {
        await db.query("ROLLBACK");
        const code = (error as { code?: string }).code;
        if (attempt < 2 && (code === "40P01" || code === "40001")) continue;
        if (code === "23505") throw new CommerceError("CONFLICT","این مقدار پیش‌تر ثبت شده است.",409);
        throw error;
      } finally { db.release(); }
    }
  }
  async function readSnapshot<T>(work:(db:PoolClient)=>Promise<T>):Promise<T>{
    const db=await pool.connect();
    try{await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");await db.query("SET LOCAL lock_timeout = '3s'");const result=await work(db);await db.query("COMMIT");return result;}
    catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  async function assertActor(db: Connection, actor: Actor, permission?: Permission) {
    const active = await one(db,'SELECT u.id FROM "user" u JOIN session s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.expires_at>now() AND NOT u.disabled AND ($3::boolean OR (u.phone_number_verified AND u.phone_number IS NOT NULL))', [actor.userId,actor.sessionId,actor.kind==="admin"]);
    if (!active) fail("UNAUTHENTICATED","دوباره وارد حساب شوید.",401);
    if (!permission) return;
    if (actor.kind !== "admin") fail("FORBIDDEN","اجازهٔ انجام این کار را ندارید.",403);
    const grant = await one(db,"SELECT session_id FROM admin_grant WHERE session_id=$1 AND expires_at>now()",[actor.sessionId]);
    const roles = await query(db,"SELECT role FROM role_membership WHERE user_id=$1",[actor.userId]);
    if (!grant || !roles.some((row) => ROLE_PERMISSIONS[text(row,"role") as Role]?.includes(permission))) fail("FORBIDDEN","اجازهٔ انجام این کار را ندارید.",403);
  }
  async function assertFreshAdmin(db:PoolClient,actor:Actor,requiredPermissions:readonly Permission[],lock=false){
    // now() is fixed at transaction start; use wall-clock time across financial/auth lock waits.
    const freshSql="SELECT s.id FROM session s JOIN \"user\" u ON u.id=s.user_id JOIN admin_grant g ON g.session_id=s.id WHERE s.id=$1 AND u.id=$2 AND NOT u.disabled AND u.two_factor_enabled AND s.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp() AND g.factor_verified_at>clock_timestamp()-interval '5 minutes'";
    const fresh=await one(db,freshSql+(lock ? " FOR SHARE OF s,u,g" : ""),[actor.sessionId,actor.userId]);
    if(actor.kind!=="admin" || !fresh)fail("FORBIDDEN","برای این عملیات، تأیید دومرحله‌ای تازه لازم است.",403);
    const roles=await query(db,`SELECT role FROM role_membership WHERE user_id=$1${lock ? " FOR SHARE" : ""}`,[actor.userId]);
    const permissions=new Set(roles.flatMap((row)=>ROLE_PERMISSIONS[text(row,"role") as Role] ?? []));
    if(!requiredPermissions.every((permission)=>permissions.has(permission)))fail("FORBIDDEN","اجازهٔ ثبت این تغییر را ندارید.",403);
    // Locking SELECT predicates can run before their wait; recheck after all auth locks return.
    if(lock && !await one(db,freshSql,[actor.sessionId,actor.userId]))fail("FORBIDDEN","برای این عملیات، تأیید دومرحله‌ای تازه لازم است.",403);
  }
  async function audit(db: Connection, actor: Actor, action: string, entityType: string, entityId: string, reason: string) {
    await db.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),actor.userId,action,entityType,entityId,reason]);
  }
  async function event(db: Connection, orderId: string, type: string, key: string, actorId?: string) {
    await db.query("INSERT INTO order_event(id,order_id,event_key,type,actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING",[randomUUID(),orderId,key,type,actorId ?? null]);
  }
  async function enqueue(db: Connection, type: string, key: string, payload: object) {
    await db.query("INSERT INTO outbox_job(id,type,dedupe_key,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(dedupe_key) DO NOTHING",[randomUUID(),type,key,JSON.stringify(payload)]);
  }
  const readyGallerySql="SELECT pi.*,v.sku AS variant_sku FROM product_image pi LEFT JOIN variant v ON v.id=pi.variant_id LEFT JOIN media m ON m.id=pi.media_id WHERE pi.product_id=ANY($1::uuid[]) AND ($2::boolean OR pi.media_id IS NOT NULL) AND (pi.media_id IS NULL OR (m.status='ready' AND m.mime_type='image/webp')) ORDER BY pi.product_id,pi.position";
  async function productDto(db: Connection, row: Row,loadedVariants?:Row[],loadedImages?:Row[]): Promise<ProductDto> {
    const variants = loadedVariants ?? await query(db,"SELECT v.*,i.on_hand-i.reserved AS available FROM variant v JOIN inventory_balance i ON i.variant_id=v.id WHERE v.product_id=$1 AND v.active ORDER BY v.volume_ml",[row.id]);
    const imageRows=loadedImages ?? await query(db,readyGallerySql,[[row.id],deploymentEnv!=="live"]);
    const images:ProductImage[]=imageRows.map((image)=>({url:text(image,"url"),alt:text(image,"alt"),variantSku:image.variant_sku as string|null}));
    const primary=images.find((image)=>!image.variantSku) ?? images[0];
    return { id:text(row,"id"), name:text(row,"name"), slug:text(row,"slug"), description:text(row,"description"), concentration:text(row,"concentration"), family:text(row,"family"), topNotes:row.top_notes as string[], heartNotes:row.heart_notes as string[], baseNotes:row.base_notes as string[], imageUrl:primary?.url ?? null,images, status:row.status as ProductDto["status"], version:number(row,"version"), variants:variants.map((variant)=>({id:text(variant,"id"),sku:text(variant,"sku"),volumeMl:number(variant,"volume_ml"),price:moneyDto(text(variant,"price_irr")),available:number(variant,"available")})) };
  }
  async function productsDto(db:Connection,rows:Row[]):Promise<ProductDto[]>{
    if(!rows.length)return [];
    const variants=await query(db,"SELECT v.*,i.on_hand-i.reserved AS available FROM variant v JOIN inventory_balance i ON i.variant_id=v.id WHERE v.product_id=ANY($1::uuid[]) AND v.active ORDER BY v.product_id,v.volume_ml,v.id",[rows.map((row)=>row.id)]);
    const images=await query(db,readyGallerySql,[rows.map((row)=>row.id),deploymentEnv!=="live"]);
    function grouped(children:Row[]){const groups=new Map<unknown,Row[]>();for(const child of children){const group=groups.get(child.product_id) ?? [];group.push(child);groups.set(child.product_id,group);}return groups;}
    const byProduct={variants:grouped(variants),images:grouped(images)};
    return Promise.all(rows.map((row)=>productDto(db,row,byProduct.variants.get(row.id) ?? [],byProduct.images.get(row.id) ?? [])));
  }
  async function listProducts(filter: { search?: string; family?: string; available?: boolean } = {}): Promise<ProductDto[]> {
    const search = normalizeSearch(filter.search ?? "").slice(0,120);
    const rows = await query(pool,"SELECT p.* FROM product p WHERE p.status='published' AND ($1='' OR p.search_key ILIKE '%' || $1 || '%') AND ($2='' OR p.family=$2) AND (NOT $3::boolean OR EXISTS(SELECT 1 FROM variant v JOIN inventory_balance i ON i.variant_id=v.id WHERE v.product_id=p.id AND v.active AND i.on_hand>i.reserved)) ORDER BY p.created_at DESC LIMIT 300",[search,filter.family ?? "",filter.available ?? false]);
    return productsDto(pool,rows);
  }
  async function listAdminProducts(actor: Actor): Promise<ProductDto[]> {
    await assertActor(pool,actor,"catalog.write"); return productsDto(pool,await query(pool,"SELECT * FROM product ORDER BY created_at DESC LIMIT 300"));
  }
  function productPageFilter(input:AdminProductPageInput,admin:boolean){
    const {page,pageSize,offset}=pagination(input),search=literalSearch(searchInput(input.search));
    const family=input.family===undefined ? "" : boundedString(input.family,"خانوادهٔ رایحه",80,0);
    const concentration=input.concentration===undefined ? "" : boundedString(input.concentration,"غلظت",80,0);
    if(input.note!==undefined && (typeof input.note!=="string" || input.note.length>120))fail("VALIDATION","نت رایحه معتبر نیست.");
    const note=input.note ?? "";
    function priceBound(value:unknown):bigint|null{
      if(value===undefined)return null;
      const amount=boundedString(value,"بازهٔ قیمت",40);
      try{return rangeTomanToIrr(amount);}catch{return fail("VALIDATION","بازهٔ قیمت را به تومان کامل، نامنفی و در محدودهٔ مجاز وارد کنید.");}
    }
    const minimum=priceBound(input.minPriceToman),maximum=priceBound(input.maxPriceToman);
    if(minimum!==null && maximum!==null && minimum>maximum)fail("VALIDATION","حداقل قیمت نباید از حداکثر بیشتر باشد.");
    if(input.available!==undefined && typeof input.available!=="boolean")fail("VALIDATION","فیلتر موجودی معتبر نیست.");
    if(input.volumeMl!==undefined && (!Number.isInteger(input.volumeMl) || input.volumeMl<1 || input.volumeMl>5000))fail("VALIDATION","فیلتر حجم معتبر نیست.");
    const sort=input.sort ?? "name";
    if(!["name","price_asc","price_desc"].includes(sort))fail("VALIDATION","ترتیب نتایج معتبر نیست.");
    if(input.status!==undefined && !["draft","published","archived"].includes(input.status))fail("VALIDATION","وضعیت محصول معتبر نیست.");
    const values:unknown[]=[admin ? input.status ?? "" : "published",search,family,concentration,input.volumeMl ?? null,input.available ?? false,note,minimum?.toString() ?? null,maximum?.toString() ?? null];
    const matchingVariant="v.product_id=p.id AND v.active AND ($5::integer IS NULL OR v.volume_ml=$5) AND (NOT $6::boolean OR i.on_hand>i.reserved) AND ($8::bigint IS NULL OR v.price_irr>=$8) AND ($9::bigint IS NULL OR v.price_irr<=$9)";
    const where=`($1='' OR p.status=$1) AND ($2='' OR p.search_key ILIKE '%' || $2 || '%') AND ($3='' OR p.family=$3) AND ($4='' OR p.concentration=$4) AND (($5::integer IS NULL AND NOT $6::boolean AND $8::bigint IS NULL AND $9::bigint IS NULL) OR EXISTS(SELECT 1 FROM variant v JOIN inventory_balance i ON i.variant_id=v.id WHERE ${matchingVariant})) AND ($7='' OR p.top_notes @> jsonb_build_array($7::text) OR p.heart_notes @> jsonb_build_array($7::text) OR p.base_notes @> jsonb_build_array($7::text))`;
    const sortSql=sort==="name" ? "p.name ASC,p.id ASC" : `(SELECT min(v.price_irr) FROM variant v JOIN inventory_balance i ON i.variant_id=v.id WHERE ${matchingVariant}) ${sort==="price_asc" ? "ASC" : "DESC"} NULLS LAST,p.name ASC,p.id ASC`;
    return {page,pageSize,offset,values,where,sortSql};
  }
  async function productPage(db:PoolClient,input:AdminProductPageInput,admin:boolean):Promise<PageDto<ProductDto>>{
    const {page,pageSize,offset,values,where,sortSql}=productPageFilter(input,admin);
    const count=(await one(db,`SELECT count(*)::text AS count FROM product p WHERE ${where}`,values))!;
    const rows=await query(db,`SELECT p.* FROM product p WHERE ${where} ORDER BY ${sortSql} LIMIT $10 OFFSET $11`,[...values,pageSize,offset]);
    return pageDto(await productsDto(db,rows),page,pageSize,number(count,"count"));
  }
  async function listProductsPage(input:ProductPageInput={}):Promise<CatalogPageDto>{
    return readSnapshot(async(db)=>{
      const page=await productPage(db,input,false);
      // One extra value detects truncation without returning an unbounded facet response.
      const facets=(await one(db,"SELECT ARRAY(SELECT DISTINCT family FROM product WHERE status='published' AND family<>'' ORDER BY family LIMIT 101) AS families,ARRAY(SELECT DISTINCT concentration FROM product WHERE status='published' AND concentration<>'' ORDER BY concentration LIMIT 101) AS concentrations,ARRAY(SELECT DISTINCT v.volume_ml FROM variant v JOIN product p ON p.id=v.product_id WHERE p.status='published' AND v.active ORDER BY v.volume_ml LIMIT 101) AS volumes,ARRAY(SELECT DISTINCT note FROM product p CROSS JOIN LATERAL jsonb_array_elements_text(p.top_notes || p.heart_notes || p.base_notes) AS n(note) WHERE p.status='published' AND note<>'' ORDER BY note LIMIT 101) AS notes"))!;
      const families=facets.families as string[],concentrations=facets.concentrations as string[],volumes=facets.volumes as number[],notes=facets.notes as string[];
      return {...page,facets:{families:families.slice(0,100),concentrations:concentrations.slice(0,100),volumesMl:volumes.slice(0,100),notes:notes.slice(0,100)},facetLimit:100,facetsTruncated:[families,concentrations,volumes,notes].some((values)=>values.length>100)};
    });
  }
  async function listAdminProductsPage(actor:Actor,input:AdminProductPageInput={}):Promise<PageDto<ProductDto>>{return readSnapshot(async(db)=>{await assertActor(db,actor,"catalog.write");return productPage(db,input,true);});}
  async function resolvePublishedProducts(ids:string[]):Promise<ProductResolutionDto>{
    if(!Array.isArray(ids) || ids.length>1000)fail("VALIDATION","فهرست محصول‌ها معتبر نیست.");
    const normalized=[...new Set(ids.map((id)=>{
      if(typeof id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()))fail("VALIDATION","شناسهٔ محصول معتبر نیست.");
      return id.trim().toLowerCase();
    }))];
    if(normalized.length>100)fail("VALIDATION","حداکثر صد محصول را هم‌زمان بررسی کنید.");
    return readSnapshot(async(db)=>{
      if(!normalized.length)return {products:[],unavailableIds:[]};
      const rows=await query(db,"SELECT p.* FROM product p WHERE p.id=ANY($1::uuid[]) AND p.status='published' AND EXISTS(SELECT 1 FROM variant v WHERE v.product_id=p.id AND v.active)",[normalized]);
      const products=await productsDto(db,rows),byId=new Map(products.map((product)=>[product.id,product]));
      return {products:normalized.flatMap((id)=>byId.has(id) ? [byId.get(id)!] : []),unavailableIds:normalized.filter((id)=>!byId.has(id))};
    });
  }
  async function listExportProducts(actor:Actor,maximum=10_000):Promise<ProductDto[]>{
    exportLimit(maximum);
    return readSnapshot(async(db)=>{
      await assertActor(db,actor,"catalog.write");const count=(await one(db,"SELECT count(*)::text AS count FROM product"))!;
      if(number(count,"count")>maximum)fail("CONFLICT","تعداد محصولات از سقف خروجی بیشتر است؛ خروجی کامل تهیه نشد.",409);
      return productsDto(db,await query(db,"SELECT * FROM product ORDER BY created_at DESC,id DESC LIMIT $1",[maximum]));
    });
  }
  async function listSitemapProducts(maximum=10_000):Promise<SitemapProductDto[]>{
    exportLimit(maximum);
    return readSnapshot(async(db)=>{
      const where="p.status='published' AND EXISTS(SELECT 1 FROM variant v WHERE v.product_id=p.id AND v.active)";
      const count=(await one(db,`SELECT count(*)::text AS count FROM product p WHERE ${where}`))!;
      if(number(count,"count")>maximum)fail("CONFLICT","تعداد محصولات از سقف فهرست سایت بیشتر است؛ فهرست کامل تهیه نشد.",409);
      const rows=await query(db,`SELECT p.id,p.slug,p.updated_at FROM product p WHERE ${where} ORDER BY p.slug,p.id LIMIT $1`,[maximum]);
      return rows.map((row)=>({id:text(row,"id"),slug:text(row,"slug"),updatedAt:date(row.updated_at)}));
    });
  }
  async function listVariantsPage(actor:Actor,input:VariantPageInput={}):Promise<PageDto<VariantDto>>{
    const {page,pageSize,offset}=pagination(input),search=literalSearch(searchInput(input.search));
    return readSnapshot(async(db)=>{
      await assertActor(db,actor);if(actor.kind!=="admin")fail("FORBIDDEN","اجازهٔ مشاهدهٔ حجم‌ها را ندارید.",403);
      const grant=await one(db,"SELECT session_id FROM admin_grant WHERE session_id=$1 AND expires_at>now()",[actor.sessionId]);
      const roles=await query(db,"SELECT role FROM role_membership WHERE user_id=$1",[actor.userId]);
      const permissions=new Set(roles.flatMap((row)=>ROLE_PERMISSIONS[text(row,"role") as Role] ?? []));
      const catalog=permissions.has("catalog.write"),inventory=permissions.has("inventory.write");
      if(!grant || (!catalog && !inventory))fail("FORBIDDEN","اجازهٔ مشاهدهٔ حجم‌ها را ندارید.",403);
      const normalizedName="regexp_replace(translate(normalize(p.name,NFKC),'يك۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','یک01234567890123456789'),'[‌[:space:]]+',' ','g')";
      const from=`FROM variant v JOIN product p ON p.id=v.product_id JOIN inventory_balance i ON i.variant_id=v.id WHERE ($1='' OR v.sku ILIKE '%' || $1 || '%' OR ${normalizedName} ILIKE '%' || $1 || '%')`;
      const count=(await one(db,`SELECT count(*)::text AS count ${from}`,[search]))!;
      const columns=`v.id,v.sku,v.volume_ml,v.active,p.name,p.status,p.version,i.on_hand-i.reserved AS available${catalog ? ",v.price_irr::text AS price_irr" : ""}${inventory ? ",i.on_hand,i.reserved" : ""}`;
      const rows=await query(db,`SELECT ${columns} ${from} ORDER BY p.name,v.volume_ml,v.sku,v.id LIMIT $2 OFFSET $3`,[search,pageSize,offset]);
      return pageDto(rows.map((row)=>({id:text(row,"id"),sku:text(row,"sku"),productName:text(row,"name"),productStatus:row.status as ProductDto["status"],active:row.active===true,volumeMl:number(row,"volume_ml"),productVersion:number(row,"version"),available:number(row,"available"),...(catalog ? {price:moneyDto(text(row,"price_irr"))} : {}),...(inventory ? {onHand:number(row,"on_hand"),reserved:number(row,"reserved")} : {})})),page,pageSize,number(count,"count"));
    });
  }
  async function getProduct(slugOrId: string, actor?: Actor): Promise<ProductDto> {
    const row = await one(pool,"SELECT * FROM product WHERE slug=$1 OR id::text=$1",[slugOrId]);
    if (!row) return fail("NOT_FOUND","محصول پیدا نشد.",404);
    if (row.status !== "published") { if (!actor) return fail("NOT_FOUND","محصول پیدا نشد.",404); await assertActor(pool,actor,"catalog.write"); }
    return productDto(pool,row);
  }
  async function writeProduct(db: PoolClient, actor: Actor, id: string, input: ProductInput, existing?: Row) {
    const images:ProductImage[]=input.images===undefined ? (input.imageUrl ? [{url:input.imageUrl,alt:input.name.trim(),variantSku:null}] : []) : input.images.map((image)=>({url:image.url,alt:image.alt.trim(),variantSku:image.variantSku ?? null}));
    if(existing?.status==="published" && (!images.length || !input.description.trim() || !input.concentration.trim() || !input.family.trim()))fail("VALIDATION","برای حذف تصویر یا اطلاعات ضروری، ابتدا محصول را از انتشار خارج کنید.");
    const mediaUrls=[...new Set(images.filter((image)=>image.url!=="/assets/sample-perfume.svg").map((image)=>image.url))].sort();
    for(const image of images){
      if(image.url==="/assets/sample-perfume.svg"){if(deploymentEnv==="live")fail("VALIDATION","تصویر آزمایشی در محیط واقعی مجاز نیست.");}
      else if(!/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(image.url))fail("VALIDATION","یک تصویر پردازش‌شدهٔ فروشگاه انتخاب کنید.");
    }
    const readyMedia=await query(db,"SELECT id,public_path,created_by FROM media WHERE public_path=ANY($1::text[]) AND status='ready' AND mime_type='image/webp' ORDER BY id FOR SHARE",[mediaUrls]);
    const approved=existing ? await query(db,"SELECT url FROM product_image WHERE product_id=$1",[id]) : [];
    const owner=await one(db,"SELECT user_id FROM role_membership WHERE user_id=$1 AND role='owner'",[actor.userId]);
    for(const image of images){
      if(image.url==="/assets/sample-perfume.svg")continue;
      const media=readyMedia.find((row)=>row.public_path===image.url && image.url===`/media/${text(row,"id")}.webp`);
      if(!media)fail("VALIDATION","تصویر آماده یا متعلق به رسانه‌های فروشگاه نیست.");
      if(!owner && media.created_by!==actor.userId && !approved.some((row)=>row.url===image.url))fail("FORBIDDEN","برای افزودن تصویر جدید، تصویر خودتان را بارگذاری کنید.",403);
    }
    const primary=images.find((image)=>!image.variantSku) ?? images[0];
    const searchKey = normalizeSearch([input.name,input.family,input.description,...input.topNotes,...input.heartNotes,...input.baseNotes].join(" "));
    const values = [input.name.trim(),input.slug,input.description,input.concentration,input.family,JSON.stringify(input.topNotes),JSON.stringify(input.heartNotes),JSON.stringify(input.baseNotes),primary?.url ?? null,searchKey,id];
    if (existing) await db.query("UPDATE product SET name=$1,slug=$2,description=$3,concentration=$4,family=$5,top_notes=$6::jsonb,heart_notes=$7::jsonb,base_notes=$8::jsonb,image_url=$9,search_key=$10,version=version+1,updated_at=now() WHERE id=$11",values);
    else await db.query("INSERT INTO product(name,slug,description,concentration,family,top_notes,heart_notes,base_notes,image_url,search_key,id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11)",values);
    const prior = await query(db,"SELECT * FROM variant WHERE product_id=$1",[id]);
    for (const variant of input.variants) {
      const old = prior.find((row)=>row.sku === variant.sku); const variantId = old ? text(old,"id") : randomUUID();
      if (old) await db.query("UPDATE variant SET volume_ml=$1,price_irr=$2,active=true WHERE id=$3",[variant.volumeMl,tomanToIrr(variant.priceToman).toString(),variantId]);
      else {
        if((variant.initialStock ?? 0)>0)await assertActor(db,actor,"inventory.write");
        await db.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,$4,$5)",[variantId,id,variant.sku,variant.volumeMl,tomanToIrr(variant.priceToman).toString()]);
        await db.query("INSERT INTO inventory_balance(variant_id,on_hand) VALUES($1,$2)",[variantId,variant.initialStock ?? 0]);
        await db.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason,actor_id) VALUES($1,$2,$3,$4,0,'initial_stock',$5)",[randomUUID(),variantId,`initial:${variantId}`,variant.initialStock ?? 0,actor.userId]);
      }
    }
    for (const variant of prior) if (!input.variants.some((v)=>v.sku === variant.sku)) await db.query("UPDATE variant SET active=false WHERE id=$1",[variant.id]);
    const activeVariants=await query(db,"SELECT id,sku FROM variant WHERE product_id=$1 AND active",[id]);
    await db.query("DELETE FROM product_image WHERE product_id=$1",[id]);
    for(const [position,image] of images.entries()){
      const variant=image.variantSku ? activeVariants.find((row)=>row.sku===image.variantSku) : undefined;
      if(image.variantSku && !variant)fail("VALIDATION","حجم مرتبط با تصویر معتبر نیست.");
      const media=readyMedia.find((row)=>row.public_path===image.url);
      await db.query("INSERT INTO product_image(product_id,position,url,alt,variant_id,media_id) VALUES($1,$2,$3,$4,$5,$6)",[id,position,image.url,image.alt,variant?.id ?? null,media?.id ?? null]);
    }
    await audit(db,actor,existing ? "product.updated" : "product.created","product",id,"admin form");
    return productDto(db,(await one(db,"SELECT * FROM product WHERE id=$1",[id]))!);
  }
  async function createProduct(actor: Actor,input: ProductInput) { validateProduct(input); return transaction(async(db)=>{ await assertActor(db,actor,"catalog.write"); return writeProduct(db,actor,randomUUID(),input); }); }
  async function updateProduct(actor: Actor,id: string,input: ProductInput,expectedVersion: number) {
    validateProduct(input); return transaction(async(db)=>{ await assertActor(db,actor,"catalog.write"); const row=await one(db,"SELECT * FROM product WHERE id=$1 FOR UPDATE",[id]); if (!row) return fail("NOT_FOUND","محصول پیدا نشد.",404); if (row.version !== expectedVersion) fail("CONFLICT","محصول تغییر کرده است. نسخهٔ تازه را بررسی کنید.",409); return writeProduct(db,actor,id,input,row); });
  }
  async function publishProduct(actor: Actor,id: string,expectedVersion: number) {
    return transaction(async(db)=>{ await assertActor(db,actor,"catalog.write"); const row=await one(db,"SELECT * FROM product WHERE id=$1 FOR UPDATE",[id]); if (!row) return fail("NOT_FOUND","محصول پیدا نشد.",404); if (row.version!==expectedVersion) fail("CONFLICT","نسخهٔ محصول تغییر کرده است.",409); const variants=await query(db,"SELECT id FROM variant WHERE product_id=$1 AND active",[id]); const images=await query(db,readyGallerySql,[[id],deploymentEnv!=="live"]); if (!row.description || !row.concentration || !row.family || !images.length || !variants.length) fail("VALIDATION","اطلاعات محصول و تصویر را پیش از انتشار کامل کنید."); await db.query("UPDATE product SET status='published',version=version+1,updated_at=now() WHERE id=$1",[id]); await audit(db,actor,"product.published","product",id,"publish"); return productDto(db,(await one(db,"SELECT * FROM product WHERE id=$1",[id]))!); });
  }
  async function cartAccess(db: Connection,id: string,guestToken: string,actor?: Actor,lock=false) {
    if (actor) await assertActor(db,actor);
    const row=await one(db,`SELECT * FROM cart WHERE id=$1 AND ((user_id IS NULL AND guest_token_digest=$2) OR user_id=$3)${lock ? " FOR UPDATE" : ""}`,[id,digest(guestToken),actor?.userId ?? null]);
    if (!row) return fail("NOT_FOUND","سبد پیدا نشد.",404); return row;
  }
  async function cartDto(db: Connection,row: Row): Promise<CartDto> {
    const items=await query(db,"SELECT ci.*,v.product_id,v.volume_ml,v.price_irr,v.active,p.name,p.status,i.on_hand-i.reserved AS available FROM cart_item ci JOIN variant v ON v.id=ci.variant_id JOIN product p ON p.id=v.product_id JOIN inventory_balance i ON i.variant_id=v.id WHERE ci.cart_id=$1 ORDER BY ci.variant_id",[row.id]);
    const subtotal=items.reduce((sum,item)=>sum+BigInt(text(item,"price_irr"))*BigInt(number(item,"quantity")),0n);
    return {id:text(row,"id"),version:number(row,"version"),couponCode:row.coupon_code as string|null,subtotal:moneyDto(subtotal),items:items.map((item)=>({variantId:text(item,"variant_id"),productId:text(item,"product_id"),name:text(item,"name"),volumeMl:number(item,"volume_ml"),quantity:number(item,"quantity"),unitPrice:moneyDto(text(item,"price_irr")),available:number(item,"available"),published:item.status==="published" && item.active===true}))};
  }
  async function createCart() { const id=randomUUID(); const guestToken=randomBytes(32).toString("base64url"); await pool.query("INSERT INTO cart(id,guest_token_digest) VALUES($1,$2)",[id,digest(guestToken)]); return {guestToken,cart:await getCart(id,guestToken)}; }
  async function getCart(id: string,guestToken: string,actor?: Actor) { return cartDto(pool,await cartAccess(pool,id,guestToken,actor)); }
  async function setCartItem(id: string,guestToken: string,variantId: string,quantity: number,expectedVersion: number,actor?: Actor) {
    if (!Number.isInteger(quantity) || quantity<0 || quantity>20) fail("VALIDATION","تعداد کالا معتبر نیست.");
    return transaction(async(db)=>{ const row=await cartAccess(db,id,guestToken,actor,true); if (row.version!==expectedVersion) fail("CONFLICT","سبد تغییر کرده است.",409); const variant=await one(db,"SELECT v.id FROM variant v JOIN product p ON p.id=v.product_id WHERE v.id=$1 AND v.active AND p.status='published'",[variantId]); if (!variant && quantity>0) fail("NOT_FOUND","این حجم در دسترس نیست.",404); if (quantity===0) await db.query("DELETE FROM cart_item WHERE cart_id=$1 AND variant_id=$2",[id,variantId]); else await db.query("INSERT INTO cart_item(cart_id,variant_id,quantity) VALUES($1,$2,$3) ON CONFLICT(cart_id,variant_id) DO UPDATE SET quantity=$3",[id,variantId,quantity]); await db.query("UPDATE cart SET version=version+1,updated_at=now() WHERE id=$1",[id]); return cartDto(db,(await one(db,"SELECT * FROM cart WHERE id=$1",[id]))!); });
  }
  async function setCartCoupon(id:string,guestToken:string,code:string|null,expectedVersion:number,actor?:Actor) {
    const normalized=code ? boundedString(code.toUpperCase(),"کد تخفیف",40) : null;
    return transaction(async(db)=>{const row=await cartAccess(db,id,guestToken,actor,true);if(row.version!==expectedVersion)fail("CONFLICT","سبد تغییر کرده است.",409);if(normalized && !await one(db,"SELECT code FROM coupon WHERE code=$1 AND active AND expires_at>now()",[normalized]))fail("VALIDATION","کد تخفیف معتبر نیست.");await db.query("UPDATE cart SET coupon_code=$1,version=version+1,updated_at=now() WHERE id=$2",[normalized,id]);return cartDto(db,(await one(db,"SELECT * FROM cart WHERE id=$1",[id]))!);});
  }
  async function calculateQuote(db: Connection,cart: CartDto,userId: string,policy:CommerceShippingPolicy,lockCoupon=false): Promise<QuoteDto> {
    if (!cart.items.length) fail("VALIDATION","سبد خرید خالی است.");
    if (cart.items.some((item)=>!item.published || item.available<item.quantity)) fail("OUT_OF_STOCK","این حجم فعلاً موجود نیست.",409);
    const subtotal=BigInt(cart.subtotal.amountIrr); let discount=0n;
    if (cart.couponCode) {
      const coupon=await one(db,`SELECT * FROM coupon WHERE code=$1 AND active AND expires_at>now()${lockCoupon ? " FOR UPDATE" : ""}`,[cart.couponCode]);
      if (!coupon || subtotal<BigInt(text(coupon,"minimum_irr"))) fail("VALIDATION","کد تخفیف برای این سبد قابل استفاده نیست.");
      const counts=await one(db,"SELECT count(*)::int AS total,count(*) FILTER(WHERE user_id=$2)::int AS own FROM coupon_redemption WHERE coupon_code=$1 AND status IN ('reserved','consumed')",[cart.couponCode,userId]);
      if (number(counts!,"total")>=number(coupon,"usage_limit") || number(counts!,"own")>=number(coupon,"per_user_limit")) fail("CONFLICT","ظرفیت این کد تخفیف تکمیل شده است.",409);
      discount=percentageDiscount(subtotal,number(coupon,"basis_points"));
    }
    const payableSubtotal=subtotal-discount;
    const quotedShipping=policy.freeShippingThresholdIrr!==undefined && payableSubtotal>=policy.freeShippingThresholdIrr ? 0n : policy.shippingFeeIrr;
    const total=payableSubtotal+quotedShipping;parseIrr(total.toString(),false);
    const fingerprint=digest(JSON.stringify({cartId:cart.id,version:cart.version,items:cart.items.map((item)=>[item.variantId,item.quantity,item.unitPrice.amountIrr]),coupon:cart.couponCode,discount:discount.toString(),shipping:quotedShipping.toString(),shippingFee:policy.shippingFeeIrr.toString(),freeShippingThreshold:policy.freeShippingThresholdIrr?.toString() ?? null,policyVersion:policy.policyVersion}));
    return {cartId:cart.id,cartVersion:cart.version,subtotal:moneyDto(subtotal),discount:moneyDto(discount),shipping:moneyDto(quotedShipping),tax:moneyDto(0n),total:moneyDto(total),fingerprint,policyVersion:policy.policyVersion,shippingMethodId:"standard",expiresAt:new Date(Date.now()+5*60_000).toISOString()};
  }
  async function quoteCheckout(actor: Actor,guestToken: string,cartId: string) {
    // Ordinary short transaction permits the settings reader's shared row/advisory locks.
    return transaction(async(db)=>{const row=await cartAccess(db,cartId,guestToken,actor);const policy=await shippingPolicy(db);return calculateQuote(db,await cartDto(db,row),actor.userId,policy);});
  }
  function paymentContext(row: Row): PaymentContext {return {attemptId:text(row,"id"),orderId:text(row,"order_id"),amountIrr:BigInt(text(row,"amount_irr")),currency:"IRR",merchantKey:text(row,"merchant_key"),callbackUrl:`${appBaseUrl}/api/payments/${payments.name}/callback`};}
  async function checkoutDto(orderId:string,attemptId:string): Promise<CheckoutDto> { const row=await one(pool,"SELECT p.*,o.order_number FROM payment_attempt p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND o.id=$2",[attemptId,orderId]);if(!row)return fail("NOT_FOUND","پرداخت پیدا نشد.",404);return {orderId,orderNumber:text(row,"order_number"),paymentAttemptId:attemptId,paymentStatus:row.status as CheckoutDto["paymentStatus"],redirectUrl:row.redirect_url as string|null,total:moneyDto(text(row,"amount_irr"))}; }
  async function initializeAttempt(attemptId:string) {
    // Claim external creation before leaving transaction. Concurrent retries do not issue a second request.
    const claimed=await transaction(async(db)=>{
      const row=await one(db,"UPDATE payment_attempt SET status='unknown',updated_at=now() WHERE id=$1 AND status='created' RETURNING *",[attemptId]);
      if(row){await db.query("UPDATE orders SET payment_status='unknown',updated_at=now() WHERE id=$1 AND committed_at IS NULL AND payment_status<>'paid'",[row.order_id]);await enqueue(db,"payment.reconcile",`reconcile:${attemptId}`,{attemptId});}
      return row;
    });
    if (!claimed) return;
    let result;try{result=await payments.create(paymentContext(claimed));}catch{result={kind:"unknown" as const,code:"transport"};}
    await transaction(async(db)=>{await db.query("UPDATE payment_attempt SET status=$1,authority=$2,redirect_url=$3,updated_at=now() WHERE id=$4",[result.kind==="created" ? "pending" : result.kind==="rejected" ? "failed" : "unknown",result.kind==="created" ? result.authority : null,result.kind==="created" ? result.redirectUrl : null,attemptId]);await db.query("UPDATE orders SET payment_status=$1,updated_at=now() WHERE id=$2 AND committed_at IS NULL AND payment_status<>'paid'",[result.kind==="created" ? "pending" : result.kind==="rejected" ? "failed" : "unknown",claimed.order_id]);if(result.kind==="unknown")await enqueue(db,"payment.reconcile",`reconcile:${attemptId}`,{attemptId});if(result.kind==="rejected")await event(db,text(claimed,"order_id"),"payment.failed",`failed:${attemptId}`);});
  }
  async function createCheckout(actor: Actor,guestToken: string,input: CheckoutInput,idempotencyKey: string): Promise<CheckoutDto> {
    const key=boundedString(idempotencyKey,"شناسهٔ درخواست",128,8);const address=addressInput(input.address);
    if(input.shippingMethodId!=="standard")fail("PRICE_CHANGED","اطلاعات ارسال را دوباره بررسی کنید.",409);
    const fingerprint=digest(JSON.stringify({cartId:input.cartId,cartVersion:input.cartVersion,address,shippingMethodId:input.shippingMethodId,quoteFingerprint:input.quoteFingerprint,policyVersion:input.policyVersion}));
    const ids=await transaction(async(db)=>{
      await assertActor(db,actor);
      // Serialize per-customer reservation budgets across distinct carts/idempotency keys.
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[actor.userId]);
      await db.query("INSERT INTO checkout_idempotency(user_id,operation,key,fingerprint) VALUES($1,'checkout',$2,$3) ON CONFLICT DO NOTHING",[actor.userId,key,fingerprint]);
      const idem=(await one(db,"SELECT * FROM checkout_idempotency WHERE user_id=$1 AND operation='checkout' AND key=$2 FOR UPDATE",[actor.userId,key]))!;
      if(idem.fingerprint!==fingerprint)fail("CONFLICT","شناسهٔ درخواست برای اطلاعات دیگری استفاده شده است.",409);
      if(idem.order_id)return {orderId:text(idem,"order_id"),attemptId:text(idem,"attempt_id")};
      const policy=await shippingPolicy(db);
      if(input.policyVersion!==policy.policyVersion)fail("PRICE_CHANGED","سیاست فروش را دوباره بررسی کنید.",409);
      const row=await cartAccess(db,input.cartId,guestToken,actor,true);if(row.version!==input.cartVersion)fail("CONFLICT","سبد تغییر کرده است.",409);
      const cart=await cartDto(db,row);const quote=await calculateQuote(db,cart,actor.userId,policy,true);
      if(quote.fingerprint!==input.quoteFingerprint)fail("PRICE_CHANGED","قیمت تغییر کرده است. مبلغ به‌روز را پیش از پرداخت بررسی کنید.",409);
      const active=await one(db,"SELECT count(*)::int AS count FROM orders o WHERE o.user_id=$1 AND EXISTS(SELECT 1 FROM inventory_reservation r WHERE r.order_id=o.id AND r.status='active')",[actor.userId]);if(number(active!,"count")>=3)fail("CONFLICT","ابتدا وضعیت پرداخت‌های قبلی را بررسی کنید.",409);
      const balances=await query(db,"SELECT * FROM inventory_balance WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE",[cart.items.map((item)=>item.variantId)]);
      for(const item of cart.items){const balance=balances.find((b)=>b.variant_id===item.variantId);if(!balance || number(balance,"on_hand")-number(balance,"reserved")<item.quantity)fail("OUT_OF_STOCK","این حجم فعلاً موجود نیست.",409);}
      const orderId=randomUUID(),attemptId=randomUUID(),orderNumber=`M-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
      await db.query("INSERT INTO orders(id,order_number,user_id,subtotal_irr,discount_irr,shipping_irr,tax_irr,total_irr,address_snapshot,policy_version,shipping_method_id,coupon_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)",[orderId,orderNumber,actor.userId,quote.subtotal.amountIrr,quote.discount.amountIrr,quote.shipping.amountIrr,quote.tax.amountIrr,quote.total.amountIrr,JSON.stringify(address),quote.policyVersion,"standard",cart.couponCode]);
      for(const item of cart.items){const variant=(await one(db,"SELECT sku FROM variant WHERE id=$1",[item.variantId]))!;await db.query("INSERT INTO order_item(id,order_id,variant_id,name,sku,volume_ml,quantity,unit_price_irr,line_total_irr) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[randomUUID(),orderId,item.variantId,item.name,variant.sku,item.volumeMl,item.quantity,item.unitPrice.amountIrr,(BigInt(item.unitPrice.amountIrr)*BigInt(item.quantity)).toString()]);await db.query("UPDATE inventory_balance SET reserved=reserved+$1 WHERE variant_id=$2",[item.quantity,item.variantId]);await db.query("INSERT INTO inventory_reservation(id,order_id,variant_id,quantity,expires_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 minute')",[randomUUID(),orderId,item.variantId,item.quantity,reservationMinutes]);await db.query("INSERT INTO inventory_ledger(id,variant_id,order_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,0,$5,'checkout_reserve')",[randomUUID(),item.variantId,orderId,`reserve:${orderId}:${item.variantId}`,item.quantity]);}
      if(cart.couponCode)await db.query("INSERT INTO coupon_redemption(id,coupon_code,user_id,order_id,status) VALUES($1,$2,$3,$4,'reserved')",[randomUUID(),cart.couponCode,actor.userId,orderId]);
      await db.query("UPDATE cart SET user_id=$1,guest_token_digest=$2 WHERE id=$3",[actor.userId,digest(randomBytes(32).toString("base64url")),cart.id]);
      await db.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr) VALUES($1,$2,$3,$4,$5)",[attemptId,orderId,payments.name,merchantKey,quote.total.amountIrr]);
      await enqueue(db,"payment.initialize",`initialize:${attemptId}`,{attemptId});
      await db.query("UPDATE checkout_idempotency SET order_id=$1,attempt_id=$2 WHERE user_id=$3 AND operation='checkout' AND key=$4",[orderId,attemptId,actor.userId,key]);
      await event(db,orderId,"order.created",`created:${orderId}`,actor.userId);await enqueue(db,"order.created",`order-created:${orderId}`,{orderId});return {orderId,attemptId};
    });
    await initializeAttempt(ids.attemptId);return checkoutDto(ids.orderId,ids.attemptId);
  }

  async function verifyPayment(authority:string): Promise<{orderId:string;status:string}> {
    if(!authority || authority.length>160)return fail("VALIDATION","شناسهٔ پرداخت معتبر نیست.");
    const attempt=await one(pool,"SELECT * FROM payment_attempt WHERE provider=$1 AND merchant_key=$2 AND authority=$3",[payments.name,merchantKey,authority]);
    if(!attempt)return fail("NOT_FOUND","پرداخت پیدا نشد.",404);
    let verification;try{verification=await payments.verify({...paymentContext(attempt),authority});}catch{verification={kind:"unknown" as const,code:"transport"};}
    if(verification.kind!=="verified"){
      const result=verification;
      await transaction(async(db)=>{await db.query("UPDATE payment_attempt SET status=$1,updated_at=now() WHERE id=$2 AND status<>'succeeded'",[result.kind==="unknown" ? "unknown" : "failed",attempt.id]);await db.query("UPDATE orders SET payment_status=$1,updated_at=now() WHERE id=$2 AND committed_at IS NULL AND payment_status<>'paid'",[result.kind==="unknown" ? "unknown" : "failed",attempt.order_id]);await db.query("INSERT INTO payment_event(id,attempt_id,event_key,type,code) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING",[randomUUID(),attempt.id,`${result.kind}:${attempt.id}:${result.code}`,result.kind,result.code]);if(result.kind==="unknown")await enqueue(db,"payment.reconcile",`reconcile:${attempt.id}`,{attemptId:attempt.id});});
      return {orderId:text(attempt,"order_id"),status:result.kind==="unknown" ? "unknown" : "failed"};
    }
    const receipt=verification;
    return transaction(async(db)=>{
      const order=(await one(db,"SELECT * FROM orders WHERE id=$1 FOR UPDATE",[attempt.order_id]))!;
      const prior=await one(db,"SELECT * FROM payment_receipt WHERE provider=$1 AND merchant_key=$2 AND provider_ref=$3",[payments.name,merchantKey,receipt.providerRef]);
      if(prior){if(prior.order_id!==order.id || prior.attempt_id!==attempt.id)fail("CONFLICT","شناسهٔ تراکنش با سفارش تطبیق ندارد.",409);return {orderId:text(order,"id"),status:text(order,"payment_status")};}
      let disposition="extra";
      if(!order.committed_at){
        let couponAvailable=true;
        if(order.coupon_code){
          const coupon=await one(db,"SELECT * FROM coupon WHERE code=$1 FOR UPDATE",[order.coupon_code]);
          const redemption=await one(db,"SELECT * FROM coupon_redemption WHERE order_id=$1 FOR UPDATE",[order.id]);
          if(redemption?.status==="released"){
            const counts=await one(db,"SELECT count(*)::int AS total,count(*) FILTER(WHERE user_id=$2)::int AS own FROM coupon_redemption WHERE coupon_code=$1 AND status IN ('reserved','consumed')",[order.coupon_code,order.user_id]);
            couponAvailable=!!coupon && number(counts!,"total")<number(coupon,"usage_limit") && number(counts!,"own")<number(coupon,"per_user_limit");
          }
        }
        const reservations=await query(db,"SELECT * FROM inventory_reservation WHERE order_id=$1 ORDER BY variant_id FOR UPDATE",[order.id]);
        const balances=await query(db,"SELECT * FROM inventory_balance WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE",[reservations.map((r)=>r.variant_id)]);
        const canCommit=reservations.every((reservation)=>{const balance=balances.find((b)=>b.variant_id===reservation.variant_id)!;return reservation.status==="active" ? number(balance,"on_hand")>=number(reservation,"quantity") : number(balance,"on_hand")-number(balance,"reserved")>=number(reservation,"quantity");});
        if(canCommit && couponAvailable && order.status!=="cancelled"){
          for(const reservation of reservations){const reserved=reservation.status==="active" ? number(reservation,"quantity") : 0;await db.query("UPDATE inventory_balance SET on_hand=on_hand-$1,reserved=reserved-$2 WHERE variant_id=$3",[reservation.quantity,reserved,reservation.variant_id]);await db.query("UPDATE inventory_reservation SET status='consumed' WHERE id=$1",[reservation.id]);await db.query("INSERT INTO inventory_ledger(id,variant_id,order_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,$5,$6,'payment_commit') ON CONFLICT(operation_key) DO NOTHING",[randomUUID(),reservation.variant_id,order.id,`commit:${order.id}:${reservation.variant_id}`,-number(reservation,"quantity"),-reserved]);}
          await db.query("UPDATE orders SET status='confirmed',payment_status='paid',committed_at=now(),updated_at=now() WHERE id=$1",[order.id]);await db.query("UPDATE coupon_redemption SET status='consumed' WHERE order_id=$1",[order.id]);await db.query("INSERT INTO shipment(id,order_id) VALUES($1,$2) ON CONFLICT(order_id) DO NOTHING",[randomUUID(),order.id]);disposition="primary";
          await event(db,text(order,"id"),"payment.verified",`paid:${order.id}`);await enqueue(db,"order.paid",`order-paid:${order.id}`,{orderId:order.id});
        }else{disposition="inventory_exception";await db.query("UPDATE orders SET status='payment_exception',payment_status='paid',updated_at=now() WHERE id=$1",[order.id]);await event(db,text(order,"id"),"payment.inventory_exception",`exception:${attempt.id}`);await enqueue(db,"payment.exception",`exception:${attempt.id}`,{orderId:order.id,attemptId:attempt.id});}
      }else{await event(db,text(order,"id"),"payment.extra_receipt",`extra:${attempt.id}:${receipt.providerRef}`);await enqueue(db,"payment.exception",`extra:${attempt.id}:${receipt.providerRef}`,{orderId:order.id,attemptId:attempt.id});}
      await db.query("INSERT INTO payment_receipt(id,attempt_id,order_id,provider,merchant_key,provider_ref,amount_irr,currency,disposition) VALUES($1,$2,$3,$4,$5,$6,$7,'IRR',$8)",[randomUUID(),attempt.id,order.id,payments.name,merchantKey,receipt.providerRef,attempt.amount_irr,disposition]);
      await db.query("UPDATE payment_attempt SET status='succeeded',updated_at=now() WHERE id=$1",[attempt.id]);await db.query("INSERT INTO payment_event(id,attempt_id,event_key,type,code) VALUES($1,$2,$3,'verified',$4) ON CONFLICT(event_key) DO NOTHING",[randomUUID(),attempt.id,`verified:${attempt.id}:${receipt.providerRef}`,receipt.alreadyVerified ? "101" : "100"]);
      return {orderId:text(order,"id"),status:"paid"};
    });
  }
  function orderDto(row:Row,items:Row[],shipment:Row|undefined,events:Row[],returns:Row[],refunds:Row[]):OrderDto{
    return {id:text(row,"id"),orderNumber:text(row,"order_number"),createdAt:date(row.created_at),status:text(row,"status"),paymentStatus:text(row,"payment_status"),subtotal:moneyDto(text(row,"subtotal_irr")),discount:moneyDto(text(row,"discount_irr")),shipping:moneyDto(text(row,"shipping_irr")),tax:moneyDto(text(row,"tax_irr")),total:moneyDto(text(row,"total_irr")),address:row.address_snapshot as AddressInput,policyVersion:text(row,"policy_version"),items:items.map((item)=>({name:text(item,"name"),sku:text(item,"sku"),volumeMl:number(item,"volume_ml"),quantity:number(item,"quantity"),unitPrice:moneyDto(text(item,"unit_price_irr")),lineTotal:moneyDto(text(item,"line_total_irr"))})),shipment:shipment ? {status:text(shipment,"status"),carrier:shipment.carrier as string|null,trackingCode:shipment.tracking_code as string|null,shippedAt:shipment.shipped_at ? date(shipment.shipped_at) : null} : null,events:events.map((e)=>({type:text(e,"type"),createdAt:date(e.created_at)})),returns:returns.map((r)=>({id:text(r,"id"),kind:text(r,"kind"),reason:text(r,"reason"),status:text(r,"status"),createdAt:date(r.created_at)})),refunds:refunds.map((r)=>({id:text(r,"id"),amount:moneyDto(text(r,"amount_irr")),status:text(r,"status"),reason:text(r,"reason")}))};
  }
  async function ordersDto(db:Connection,rows:Row[]):Promise<OrderDto[]>{
    if(!rows.length)return [];
    const ids=[rows.map((row)=>row.id)];
    const items=await query(db,"SELECT * FROM order_item WHERE order_id=ANY($1::uuid[]) ORDER BY order_id,id",ids);
    const shipments=await query(db,"SELECT * FROM shipment WHERE order_id=ANY($1::uuid[])",ids);
    const events=await query(db,"SELECT * FROM order_event WHERE order_id=ANY($1::uuid[]) ORDER BY order_id,created_at,id",ids);
    const returns=await query(db,"SELECT * FROM return_request WHERE order_id=ANY($1::uuid[]) ORDER BY order_id,created_at,id",ids);
    const refunds=await query(db,"SELECT * FROM refund WHERE order_id=ANY($1::uuid[]) ORDER BY order_id,created_at,id",ids);
    function grouped(children:Row[]){const groups=new Map<unknown,Row[]>();for(const child of children){const group=groups.get(child.order_id) ?? [];group.push(child);groups.set(child.order_id,group);}return groups;}
    const byOrder={items:grouped(items),shipments:grouped(shipments),events:grouped(events),returns:grouped(returns),refunds:grouped(refunds)};
    return rows.map((row)=>orderDto(row,byOrder.items.get(row.id) ?? [],byOrder.shipments.get(row.id)?.[0],byOrder.events.get(row.id) ?? [],byOrder.returns.get(row.id) ?? [],byOrder.refunds.get(row.id) ?? []));
  }
  async function getOrder(actor:Actor,id:string):Promise<OrderDto>{
    await assertActor(pool,actor,actor.kind==="admin" ? "orders.read" : undefined);
    const row=await one(pool,"SELECT * FROM orders WHERE (id::text=$1 OR order_number=$1) AND ($2::boolean OR user_id=$3)",[id,actor.kind==="admin",actor.userId]);if(!row)return fail("NOT_FOUND","سفارش پیدا نشد.",404);
    return (await ordersDto(pool,[row]))[0]!;
  }
  async function listOrders(actor:Actor){await assertActor(pool,actor,actor.kind==="admin" ? "orders.read" : undefined);const rows=await query(pool,"SELECT id FROM orders WHERE $1::boolean OR user_id=$2 ORDER BY created_at DESC LIMIT 100",[actor.kind==="admin",actor.userId]);return Promise.all(rows.map((row)=>getOrder(actor,text(row,"id"))));}
  async function listOrdersPage(actor:Actor,input:OrdersPageInput={}):Promise<PageDto<OrderDto>>{
    const {page,pageSize,offset}=pagination(input),search=literalSearch(searchInput(input.search));
    if(input.status!==undefined && !["awaiting_payment","confirmed","payment_exception","cancelled","completed"].includes(input.status))fail("VALIDATION","وضعیت سفارش معتبر نیست.");
    if(input.paymentStatus!==undefined && !["pending","paid","partially_refunded","refunded","failed","unknown"].includes(input.paymentStatus))fail("VALIDATION","وضعیت پرداخت معتبر نیست.");
    return readSnapshot(async(db)=>{
      await assertActor(db,actor,actor.kind==="admin" ? "orders.read" : undefined);
      const values:unknown[]=[actor.kind==="admin",actor.userId,search,input.status ?? "",input.paymentStatus ?? ""];
      const where="($1::boolean OR user_id=$2) AND ($3='' OR order_number ILIKE '%' || $3 || '%') AND ($4='' OR status=$4) AND ($5='' OR payment_status=$5)";
      const count=(await one(db,`SELECT count(*)::text AS count FROM orders WHERE ${where}`,values))!;
      const rows=await query(db,`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT $6 OFFSET $7`,[...values,pageSize,offset]);
      return pageDto(await ordersDto(db,rows),page,pageSize,number(count,"count"));
    });
  }
  async function listExportOrders(actor:Actor,maximum=10_000):Promise<OrderDto[]>{
    exportLimit(maximum);
    return readSnapshot(async(db)=>{
      await assertActor(db,actor,"orders.read");const count=(await one(db,"SELECT count(*)::text AS count FROM orders"))!;
      if(number(count,"count")>maximum)fail("CONFLICT","تعداد سفارش‌ها از سقف خروجی بیشتر است؛ خروجی کامل تهیه نشد.",409);
      return ordersDto(db,await query(db,"SELECT * FROM orders ORDER BY created_at DESC,id DESC LIMIT $1",[maximum]));
    });
  }
  async function recordShipment(actor:Actor,orderId:string,input:{carrier:string;trackingCode:string;status:"shipped"|"delivered"}){
    const carrier=boundedString(input.carrier,"شرکت ارسال",100),trackingCode=boundedString(input.trackingCode,"کد رهگیری",100);
    if(!["shipped","delivered"].includes(input.status))fail("VALIDATION","وضعیت ارسال معتبر نیست.");
    await transaction(async(db)=>{
      await assertActor(db,actor,"orders.fulfill");const order=await one(db,"SELECT * FROM orders WHERE id=$1 FOR UPDATE",[orderId]);
      if(!order || !order.committed_at || order.status==="cancelled")fail("NOT_ELIGIBLE","این سفارش آمادهٔ ارسال نیست.",409);
      const shipment=await one(db,"SELECT * FROM shipment WHERE order_id=$1 FOR UPDATE",[orderId]);
      if(!shipment || shipment.status==="cancelled" || (shipment.status==="delivered" && input.status==="shipped") || (input.status==="delivered" && shipment.status!=="shipped" && shipment.status!=="delivered"))fail("NOT_ELIGIBLE","وضعیت ارسال اجازهٔ این تغییر را نمی‌دهد.",409);
      if(shipment.status===input.status && shipment.carrier===carrier && shipment.tracking_code===trackingCode)return;
      if(!["paid","partially_refunded"].includes(text(order,"payment_status")))fail("NOT_ELIGIBLE","این سفارش آمادهٔ ارسال نیست.",409);
      await db.query("UPDATE shipment SET carrier=$1,tracking_code=$2,status=$3,shipped_at=coalesce(shipped_at,now()),updated_at=now() WHERE order_id=$4",[carrier,trackingCode,input.status,orderId]);
      if(input.status==="delivered")await db.query("UPDATE orders SET status='completed',updated_at=now() WHERE id=$1",[orderId]);
      await event(db,orderId,`shipment.${input.status}`,`shipment:${orderId}:${input.status}`,actor.userId);await enqueue(db,"shipment.updated",`shipment:${orderId}:${input.status}`,{orderId});await audit(db,actor,"shipment.updated","order",orderId,input.status);
    });return getOrder(actor,orderId);
  }
  async function adjustInventory(actor:Actor,variantId:string,delta:number,reason:string,operationKey:string){if(!Number.isInteger(delta) || Math.abs(delta)>100000)fail("VALIDATION","تغییر موجودی معتبر نیست.");boundedString(reason,"دلیل",500);boundedString(operationKey,"شناسهٔ عملیات",128,8);return transaction(async(db)=>{await assertActor(db,actor,"inventory.write");const prior=await one(db,"SELECT * FROM inventory_ledger WHERE operation_key=$1",[operationKey]);if(prior){if(prior.variant_id!==variantId || prior.on_hand_delta!==delta || prior.reason!==reason)fail("CONFLICT","شناسهٔ عملیات برای تغییر دیگری استفاده شده است.",409);return;}const balance=await one(db,"SELECT * FROM inventory_balance WHERE variant_id=$1 FOR UPDATE",[variantId]);if(!balance)return fail("NOT_FOUND","کالا پیدا نشد.",404);if(number(balance,"on_hand")+delta<number(balance,"reserved"))fail("CONFLICT","موجودی از رزروهای فعال کمتر می‌شود.",409);await db.query("UPDATE inventory_balance SET on_hand=on_hand+$1 WHERE variant_id=$2",[delta,variantId]);await db.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason,actor_id) VALUES($1,$2,$3,$4,0,$5,$6)",[randomUUID(),variantId,operationKey,delta,reason,actor.userId]);await audit(db,actor,"inventory.adjusted","variant",variantId,reason);});}
  async function requestReturn(actor:Actor,orderId:string,kind:"cancel"|"return",reason:string){boundedString(reason,"دلیل",1000);return transaction(async(db)=>{await assertActor(db,actor);const order=await one(db,"SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",[orderId,actor.userId]);if(!order)return fail("NOT_FOUND","سفارش پیدا نشد.",404);const shipment=await one(db,"SELECT * FROM shipment WHERE order_id=$1",[orderId]);if(kind==="cancel" && (shipment?.status==="shipped" || shipment?.status==="delivered" || order.status==="cancelled"))fail("NOT_ELIGIBLE","این سفارش قابل درخواست لغو نیست.",409);if(kind==="return" && shipment?.status!=="delivered")fail("NOT_ELIGIBLE","درخواست مرجوعی پس از تحویل بررسی می‌شود.",409);if(!["return","cancel"].includes(kind))fail("VALIDATION","نوع درخواست معتبر نیست.");const id=randomUUID();await db.query("INSERT INTO return_request(id,order_id,user_id,kind,reason) VALUES($1,$2,$3,$4,$5)",[id,orderId,actor.userId,kind,reason]);await event(db,orderId,`request.${kind}`,`return:${id}`,actor.userId);return {id,status:"pending"};});}
  async function requestRefund(actor:Actor,orderId:string,receiptId:string,amountIrr:string,reason:string,operationKey:string){
    const amount=parseIrr(amountIrr,false);if(amount%10n)fail("VALIDATION","مبلغ بازپرداخت باید تومان کامل باشد.");boundedString(reason,"دلیل",1000);boundedString(operationKey,"شناسهٔ عملیات",128,8);
    return transaction(async(db)=>{
      await assertActor(db,actor,"refunds.write");await assertFreshAdmin(db,actor,["refunds.write"]);
      const order=await one(db,"SELECT * FROM orders WHERE id=$1 FOR UPDATE",[orderId]);if(!order)return fail("NOT_FOUND","سفارش پیدا نشد.",404);
      const prior=await one(db,"SELECT * FROM refund WHERE operation_key=$1 FOR UPDATE",[operationKey]);
      if(prior){
        await assertFreshAdmin(db,actor,["refunds.write"],true);
        if(prior.actor_id!==actor.userId || prior.order_id!==orderId || prior.receipt_id!==receiptId || text(prior,"amount_irr")!==amount.toString() || prior.reason!==reason)fail("CONFLICT","شناسهٔ درخواست برای بازپرداخت دیگری استفاده شده است.",409);
        return {id:text(prior,"id"),status:text(prior,"status")};
      }
      const receipt=await one(db,"SELECT * FROM payment_receipt WHERE id=$1 AND order_id=$2 FOR UPDATE",[receiptId,orderId]);if(!receipt)return fail("NOT_FOUND","دریافت پرداخت پیدا نشد.",404);
      const refunded=await one(db,"SELECT coalesce(sum(amount_irr),0)::text AS amount FROM refund WHERE receipt_id=$1 AND status IN ('pending','processing','succeeded')",[receiptId]);
      if(amount>BigInt(text(receipt,"amount_irr"))-BigInt(text(refunded!,"amount")))fail("CONFLICT","مبلغ از ماندهٔ قابل بازپرداخت بیشتر است.",409);
      await assertFreshAdmin(db,actor,["refunds.write"],true);
      const id=randomUUID();await db.query("INSERT INTO refund(id,order_id,receipt_id,amount_irr,reason,operation_key,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,orderId,receiptId,amount.toString(),reason,operationKey,actor.userId]);await audit(db,actor,"refund.requested","refund",id,reason);await event(db,orderId,"refund.pending",`refund:${id}`,actor.userId);return {id,status:"pending"};
    });
  }
  async function completeManualRefund(actor:Actor,refundId:string,evidence:string){
    boundedString(evidence,"مدرک بازپرداخت",1000);
    return transaction(async(db)=>{
      await assertActor(db,actor,"refunds.write");await assertFreshAdmin(db,actor,["refunds.write"]);
      const hint=await one(db,"SELECT order_id FROM refund WHERE id=$1",[refundId]);
      if(!hint)return fail("NOT_FOUND","بازپرداخت پیدا نشد.",404);
      const order=await one(db,"SELECT * FROM orders WHERE id=$1 FOR UPDATE",[hint.order_id]);
      const refund=await one(db,"SELECT * FROM refund WHERE id=$1 FOR UPDATE",[refundId]);
      if(refund!.status==="succeeded"){
        await assertFreshAdmin(db,actor,["refunds.write"],true);
        if(refund!.evidence!==evidence)fail("CONFLICT","مدرک این بازپرداخت قبلاً با اطلاعات دیگری ثبت شده است.",409);
        return;
      }
      if(refund!.status!=="pending" && refund!.status!=="processing")fail("NOT_ELIGIBLE","این بازپرداخت قابل تأیید نیست.",409);
      await assertFreshAdmin(db,actor,["refunds.write"],true);
      await db.query("UPDATE refund SET status='succeeded',evidence=$1 WHERE id=$2",[evidence,refundId]);
      // Refunding an extra receipt must not label the primary purchase refunded.
      const total=await one(db,"SELECT coalesce(sum(r.amount_irr),0)::text AS amount FROM refund r JOIN payment_receipt p ON p.id=r.receipt_id WHERE r.order_id=$1 AND r.status='succeeded' AND p.disposition IN ('primary','inventory_exception')",[hint.order_id]);
      const amount=BigInt(text(total!,"amount"));
      const status=amount===0n ? "paid" : amount>=BigInt(text(order!,"total_irr")) ? "refunded" : "partially_refunded";
      await db.query("UPDATE orders SET payment_status=$1,updated_at=now() WHERE id=$2",[status,hint.order_id]);
      await audit(db,actor,"refund.completed","refund",refundId,"manual evidence recorded");
      await event(db,text(hint,"order_id"),"refund.completed",`refund-complete:${refundId}`,actor.userId);
    });
  }
  async function listReceipts(actor:Actor,orderId:string){
    await assertActor(pool,actor,"refunds.write");
    return (await query(pool,"SELECT id,provider,provider_ref,amount_irr,currency,disposition,created_at FROM payment_receipt WHERE order_id=$1 ORDER BY created_at",[orderId])).map((row)=>({id:text(row,"id"),provider:text(row,"provider"),providerRef:text(row,"provider_ref"),amount:moneyDto(text(row,"amount_irr")),disposition:text(row,"disposition"),createdAt:date(row.created_at)}));
  }
  async function archiveProduct(actor:Actor,id:string,expectedVersion:number){
    return transaction(async(db)=>{await assertActor(db,actor,"catalog.write");const row=await one(db,"SELECT * FROM product WHERE id=$1 FOR UPDATE",[id]);if(!row)return fail("NOT_FOUND","محصول پیدا نشد.",404);if(row.version!==expectedVersion)fail("CONFLICT","نسخهٔ محصول تغییر کرده است.",409);await db.query("UPDATE product SET status='archived',version=version+1,updated_at=now() WHERE id=$1",[id]);await audit(db,actor,"product.archived","product",id,"archive retains order history");return productDto(db,(await one(db,"SELECT * FROM product WHERE id=$1",[id]))!);});
  }
  async function retryPayment(actor:Actor,orderId:string,idempotencyKey:string):Promise<CheckoutDto>{
    const key=boundedString(idempotencyKey,"شناسهٔ درخواست",128,8),fingerprint=digest(JSON.stringify({orderId}));
    const attemptId=await transaction(async(db)=>{
      await assertActor(db,actor);
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[actor.userId]);
      await db.query("INSERT INTO checkout_idempotency(user_id,operation,key,fingerprint) VALUES($1,'payment_retry',$2,$3) ON CONFLICT DO NOTHING",[actor.userId,key,fingerprint]);
      const idem=(await one(db,"SELECT * FROM checkout_idempotency WHERE user_id=$1 AND operation='payment_retry' AND key=$2 FOR UPDATE",[actor.userId,key]))!;
      if(idem.fingerprint!==fingerprint)fail("CONFLICT","شناسهٔ درخواست برای سفارش دیگری استفاده شده است.",409);
      if(idem.attempt_id)return text(idem,"attempt_id");
      const order=await one(db,"SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",[orderId,actor.userId]);
      if(!order)return fail("NOT_FOUND","سفارش پیدا نشد.",404);
      if(order.status!=="awaiting_payment" || order.committed_at)fail("NOT_ELIGIBLE","این سفارش به پرداخت دوباره نیاز ندارد.",409);
      const active=await one(db,"SELECT count(*)::int AS count FROM orders o WHERE o.user_id=$1 AND o.id<>$2 AND EXISTS(SELECT 1 FROM inventory_reservation r WHERE r.order_id=o.id AND r.status='active')",[actor.userId,orderId]);
      if(number(active!,"count")>=3)fail("CONFLICT","ابتدا وضعیت پرداخت‌های قبلی را بررسی کنید.",409);
      const unresolved=await one(db,"SELECT id FROM payment_attempt WHERE order_id=$1 AND status IN ('created','pending','unknown','succeeded')",[orderId]);
      if(unresolved)fail("PAYMENT_UNKNOWN","ابتدا نتیجهٔ پرداخت قبلی را بررسی کنید.",409);
      const reservations=await query(db,"SELECT * FROM inventory_reservation WHERE order_id=$1 ORDER BY variant_id FOR UPDATE",[orderId]);
      if(order.coupon_code){
        const coupon=await one(db,"SELECT * FROM coupon WHERE code=$1 FOR UPDATE",[order.coupon_code]);
        const redemption=await one(db,"SELECT * FROM coupon_redemption WHERE order_id=$1 FOR UPDATE",[orderId]);
        if(redemption?.status==="released"){
          const counts=await one(db,"SELECT count(*)::int AS total,count(*) FILTER(WHERE user_id=$2)::int AS own FROM coupon_redemption WHERE coupon_code=$1 AND status IN ('reserved','consumed')",[order.coupon_code,actor.userId]);
          if(!coupon || number(counts!,"total")>=number(coupon,"usage_limit") || number(counts!,"own")>=number(coupon,"per_user_limit"))fail("CONFLICT","ظرفیت کد تخفیف تکمیل شده است.",409);
          await db.query("UPDATE coupon_redemption SET status='reserved' WHERE order_id=$1",[orderId]);
        }
      }
      const balances=await query(db,"SELECT * FROM inventory_balance WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE",[reservations.map((r)=>r.variant_id)]);
      const id=randomUUID();
      for(const reservation of reservations){
        if(reservation.status==="released"){
          const balance=balances.find((b)=>b.variant_id===reservation.variant_id)!;
          if(number(balance,"on_hand")-number(balance,"reserved")<number(reservation,"quantity"))fail("OUT_OF_STOCK","این حجم فعلاً موجود نیست.",409);
          await db.query("UPDATE inventory_balance SET reserved=reserved+$1 WHERE variant_id=$2",[reservation.quantity,reservation.variant_id]);
          await db.query("INSERT INTO inventory_ledger(id,variant_id,order_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,0,$5,'payment_retry_reserve')",[randomUUID(),reservation.variant_id,orderId,`retry-reserve:${id}:${reservation.variant_id}`,reservation.quantity]);
        }
        await db.query("UPDATE inventory_reservation SET status='active',expires_at=now()+$1*interval '1 minute' WHERE id=$2",[reservationMinutes,reservation.id]);
      }
      await db.query("INSERT INTO payment_attempt(id,order_id,provider,merchant_key,amount_irr) VALUES($1,$2,$3,$4,$5)",[id,orderId,payments.name,merchantKey,order.total_irr]);
      await enqueue(db,"payment.initialize",`initialize:${id}`,{attemptId:id});
      await db.query("UPDATE checkout_idempotency SET order_id=$1,attempt_id=$2 WHERE user_id=$3 AND operation='payment_retry' AND key=$4",[orderId,id,actor.userId,key]);
      await event(db,orderId,"payment.retry",`payment-retry:${id}`,actor.userId);return id;
    });
    await initializeAttempt(attemptId);return checkoutDto(orderId,attemptId);
  }
  async function saveAddress(actor:Actor,input:AddressInput,id?:string){
    const address=addressInput(input);return transaction(async(db)=>{await assertActor(db,actor);const addressId=id ?? randomUUID();if(id){const prior=await one(db,"SELECT id FROM address WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,actor.userId]);if(!prior)return fail("NOT_FOUND","نشانی پیدا نشد.",404);await db.query("UPDATE address SET data=$1::jsonb WHERE id=$2",[JSON.stringify(address),id]);}else await db.query("INSERT INTO address(id,user_id,data) VALUES($1,$2,$3::jsonb)",[addressId,actor.userId,JSON.stringify(address)]);return {id:addressId,...address};});
  }
  async function listAddresses(actor:Actor){await assertActor(pool,actor);return (await query(pool,"SELECT id,data FROM address WHERE user_id=$1 ORDER BY created_at",[actor.userId])).map((row)=>({id:text(row,"id"),...row.data as AddressInput}));}
  async function deleteAddress(actor:Actor,id:string){await assertActor(pool,actor);await pool.query("DELETE FROM address WHERE id=$1 AND user_id=$2",[id,actor.userId]);}
  async function setWishlist(actor:Actor,productId:string,selected:boolean){await assertActor(pool,actor);if(selected){if(!await one(pool,"SELECT id FROM product WHERE id=$1 AND status='published'",[productId]))return fail("NOT_FOUND","محصول پیدا نشد.",404);await pool.query("INSERT INTO wishlist_item(user_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[actor.userId,productId]);}else await pool.query("DELETE FROM wishlist_item WHERE user_id=$1 AND product_id=$2",[actor.userId,productId]);}
  async function listWishlist(actor:Actor){await assertActor(pool,actor);return productsDto(pool,await query(pool,"SELECT p.* FROM product p JOIN wishlist_item w ON w.product_id=p.id WHERE w.user_id=$1 AND p.status='published' ORDER BY p.created_at DESC",[actor.userId]));}
  async function listCoupons(actor:Actor){await assertActor(pool,actor,"catalog.write");return query(pool,"SELECT code,basis_points,usage_limit,per_user_limit,minimum_irr::text,expires_at,active,version FROM coupon ORDER BY code");}
  async function saveCoupon(actor:Actor,input:{code:string;basisPoints:number;usageLimit:number;perUserLimit:number;minimumIrr:string;expiresAt:string;active:boolean;expectedVersion?:number}){
    const code=boundedString(input.code.toUpperCase(),"کد تخفیف",40);const minimum=parseIrr(input.minimumIrr);if(!Number.isInteger(input.basisPoints)||input.basisPoints<1||input.basisPoints>10000||!Number.isInteger(input.usageLimit)||input.usageLimit<1||!Number.isInteger(input.perUserLimit)||input.perUserLimit<1||!Number.isFinite(Date.parse(input.expiresAt)))fail("VALIDATION","تنظیمات تخفیف معتبر نیست.");
    return transaction(async(db)=>{await assertActor(db,actor,"catalog.write");const prior=await one(db,"SELECT * FROM coupon WHERE code=$1 FOR UPDATE",[code]);if(prior && prior.version!==input.expectedVersion)fail("CONFLICT","تنظیمات تخفیف تغییر کرده است.",409);const counts=await one(db,"SELECT count(*)::int AS total,coalesce(max(own),0)::int AS maximum FROM (SELECT count(*) OVER() AS total,count(*) OVER(PARTITION BY user_id) AS own FROM coupon_redemption WHERE coupon_code=$1 AND status IN ('reserved','consumed')) usage",[code]);if(number(counts!,"total")>input.usageLimit || number(counts!,"maximum")>input.perUserLimit)fail("CONFLICT","سقف جدید از مصرف فعلی کمتر است.",409);await db.query("INSERT INTO coupon(code,basis_points,usage_limit,per_user_limit,minimum_irr,expires_at,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET basis_points=$2,usage_limit=$3,per_user_limit=$4,minimum_irr=$5,expires_at=$6,active=$7,version=coupon.version+1",[code,input.basisPoints,input.usageLimit,input.perUserLimit,minimum.toString(),input.expiresAt,input.active]);await audit(db,actor,"coupon.saved","coupon",code,"admin configuration");return (await one(db,"SELECT code,version FROM coupon WHERE code=$1",[code]))!;});
  }
  async function listContent(actor?:Actor){if(actor)await assertActor(pool,actor,"content.write");return query(pool,"SELECT slug,title,body,status,version FROM content_page WHERE $1::boolean OR status='published' ORDER BY slug",[!!actor]);}
  async function saveContent(actor:Actor,input:{slug:string;title:string;body:string;status:"draft"|"published";expectedVersion?:number}){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || !["draft","published"].includes(input.status))fail("VALIDATION","صفحه معتبر نیست.");boundedString(input.title,"عنوان",160);boundedString(input.body,"متن",50000,0);
    return transaction(async(db)=>{await assertActor(db,actor,"content.write");const prior=await one(db,"SELECT * FROM content_page WHERE slug=$1 FOR UPDATE",[input.slug]);if(prior && prior.version!==input.expectedVersion)fail("CONFLICT","نسخهٔ صفحه تغییر کرده است.",409);await db.query("INSERT INTO content_page(slug,title,body,status) VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO UPDATE SET title=$2,body=$3,status=$4,version=content_page.version+1,updated_at=now()",[input.slug,input.title,input.body,input.status]);await audit(db,actor,"content.saved","content",input.slug,"plain text content");return (await one(db,"SELECT slug,title,body,status,version FROM content_page WHERE slug=$1",[input.slug]))!;});
  }
  async function listInventory(actor:Actor){await assertActor(pool,actor,"inventory.write");return query(pool,"SELECT v.id AS variant_id,v.sku,v.volume_ml,p.name,p.version AS product_version,i.on_hand,i.reserved,i.on_hand-i.reserved AS available FROM variant v JOIN product p ON p.id=v.product_id JOIN inventory_balance i ON i.variant_id=v.id ORDER BY p.name,v.volume_ml");}
  async function bulkEdit(actor:Actor,input:BulkEditInput):Promise<BulkEditDto>{
    const reason=boundedString(input.reason,"دلیل تغییر",500),operationKey=boundedString(input.operationKey,"شناسهٔ عملیات",128,8);
    if(!Array.isArray(input.operations) || input.operations.length<1 || input.operations.length>100 || typeof input.dryRun!=="boolean")fail("VALIDATION","تعداد عملیات یا پیش‌نمایش معتبر نیست.");
    const operations=input.operations.map((operation)=>{
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation.variantId) || !Number.isSafeInteger(operation.expectedProductVersion) || operation.expectedProductVersion<1)fail("VALIDATION","شناسه یا نسخهٔ کالا معتبر نیست.");
      if(operation.priceToman===undefined && operation.inventoryDelta===undefined)fail("VALIDATION","قیمت یا تغییر موجودی را وارد کنید.");
      if(operation.inventoryDelta!==undefined && (!Number.isSafeInteger(operation.inventoryDelta) || Math.abs(operation.inventoryDelta)>100000))fail("VALIDATION","تغییر موجودی معتبر نیست.");
      return {variantId:operation.variantId.toLowerCase(),expectedProductVersion:operation.expectedProductVersion,priceIrr:operation.priceToman===undefined ? undefined : tomanToIrr(operation.priceToman).toString(),inventoryDelta:operation.inventoryDelta};
    }).sort((left,right)=>left.variantId.localeCompare(right.variantId));
    if(new Set(operations.map((operation)=>operation.variantId)).size!==operations.length)fail("VALIDATION","هر حجم را فقط یک بار انتخاب کنید.");
    const fingerprint=digest(JSON.stringify({operations,reason}));
    const requiredPermissions:Permission[]=[];
    if(operations.some((operation)=>operation.priceIrr!==undefined))requiredPermissions.push("catalog.write");
    if(operations.some((operation)=>operation.inventoryDelta!==undefined))requiredPermissions.push("inventory.write");
    const assertFreshCommit=(db:PoolClient,lock=false)=>assertFreshAdmin(db,actor,requiredPermissions,lock);
    return transaction(async(db)=>{
      if(operations.some((operation)=>operation.priceIrr!==undefined))await assertActor(db,actor,"catalog.write");
      if(operations.some((operation)=>operation.inventoryDelta!==undefined))await assertActor(db,actor,"inventory.write");
      let operationId:string|undefined;
      if(!input.dryRun){
        await assertFreshCommit(db);
        await db.query("INSERT INTO bulk_operation(id,actor_id,operation_key,fingerprint,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(actor_id,operation_key) DO NOTHING",[randomUUID(),actor.userId,operationKey,fingerprint,reason]);
      }
      const prior=await one(db,"SELECT * FROM bulk_operation WHERE actor_id=$1 AND operation_key=$2 FOR UPDATE",[actor.userId,operationKey]);
      if(!input.dryRun)await assertFreshCommit(db,true);
      if(prior){
        if(prior.fingerprint!==fingerprint)fail("CONFLICT","شناسهٔ عملیات برای تغییر دیگری استفاده شده است.",409);
        if(prior.result){const saved=prior.result as BulkEditDto;return input.dryRun ? {dryRun:true,changes:saved.changes} : saved;}
        operationId=text(prior,"id");
      }
      const variantsBefore=await query(db,"SELECT id,product_id FROM variant WHERE id=ANY($1::uuid[])",[operations.map((operation)=>operation.variantId)]);
      if(variantsBefore.length!==operations.length)fail("NOT_FOUND","یک یا چند حجم پیدا نشد.",404);
      const productIds=[...new Set(variantsBefore.map((row)=>text(row,"product_id")))].sort();
      const products=await query(db,"SELECT id,name,version FROM product WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[productIds]);
      const variants=await query(db,"SELECT id,product_id,sku,price_irr FROM variant WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[operations.map((operation)=>operation.variantId)]);
      const balances=await query(db,"SELECT variant_id,on_hand,reserved FROM inventory_balance WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE",[operations.map((operation)=>operation.variantId)]);
      const changes:BulkEditDto["changes"]=operations.map((operation)=>{
        const variant=variants.find((row)=>row.id===operation.variantId)!;
        const product=products.find((row)=>row.id===variant.product_id)!;
        const balance=balances.find((row)=>row.variant_id===operation.variantId);
        if(!balance)fail("NOT_FOUND","موجودی کالا پیدا نشد.",404);
        if(number(product,"version")!==operation.expectedProductVersion)fail("CONFLICT","نسخهٔ یک یا چند محصول تغییر کرده است. دوباره پیش‌نمایش بگیرید.",409);
        const currentStock=number(balance,"on_hand"),nextStock=currentStock+(operation.inventoryDelta ?? 0);
        if(nextStock<number(balance,"reserved") || nextStock<0 || nextStock>2147483647)fail("CONFLICT","موجودی جدید از رزروهای فعال کمتر یا خارج از محدوده است.",409);
        return {variantId:operation.variantId,sku:text(variant,"sku"),productName:text(product,"name"),currentPrice:moneyDto(text(variant,"price_irr")),nextPrice:moneyDto(operation.priceIrr ?? text(variant,"price_irr")),currentStock,nextStock};
      });
      if(input.dryRun)return {dryRun:true,changes};
      if(!operationId)throw new Error("Bulk operation record unavailable");
      await assertFreshCommit(db,true);
      for(const operation of operations){
        if(operation.priceIrr!==undefined)await db.query("UPDATE variant SET price_irr=$1 WHERE id=$2",[operation.priceIrr,operation.variantId]);
        if(operation.inventoryDelta!==undefined){
          await db.query("UPDATE inventory_balance SET on_hand=on_hand+$1 WHERE variant_id=$2",[operation.inventoryDelta,operation.variantId]);
          await db.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason,actor_id) VALUES($1,$2,$3,$4,0,$5,$6)",[randomUUID(),operation.variantId,`bulk:${operationId}:${operation.variantId}`,operation.inventoryDelta,reason,actor.userId]);
        }
      }
      await db.query("UPDATE product SET version=version+1,updated_at=now() WHERE id=ANY($1::uuid[])",[productIds]);
      const result:BulkEditDto={dryRun:false,changes,operationId};
      await db.query("UPDATE bulk_operation SET result=$1::jsonb WHERE id=$2",[JSON.stringify(result),operationId]);
      await audit(db,actor,"catalog.bulk_edited","bulk_operation",operationId,reason);
      return result;
    });
  }
  async function getInventoryLedger(actor:Actor,variantId:string){await assertActor(pool,actor,"inventory.write");return query(pool,"SELECT id,operation_key,on_hand_delta,reserved_delta,reason,actor_id,created_at FROM inventory_ledger WHERE variant_id=$1 ORDER BY created_at DESC LIMIT 200",[variantId]);}
  async function listCollections(actor?:Actor){
    if(actor)await assertActor(pool,actor,"catalog.write");
    const collections=await query(pool,"SELECT * FROM collection WHERE $1::boolean OR published ORDER BY name",[!!actor]);
    return Promise.all(collections.map(async(row)=>({...row,products:await productsDto(pool,await query(pool,"SELECT p.* FROM collection_product cp JOIN product p ON p.id=cp.product_id WHERE cp.collection_id=$1 AND ($2::boolean OR p.status='published') ORDER BY cp.position",[row.id,!!actor]))})));
  }
  async function saveCollection(actor:Actor,input:{id?:string;name:string;slug:string;description:string;published:boolean;productIds:string[];expectedVersion?:number}){
    boundedString(input.name,"نام مجموعه",160);boundedString(input.description,"توضیح",5000,0);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.productIds.length>300 || new Set(input.productIds).size!==input.productIds.length)fail("VALIDATION","مجموعه معتبر نیست.");
    return transaction(async(db)=>{await assertActor(db,actor,"catalog.write");const id=input.id ?? randomUUID();if(input.id){const prior=await one(db,"SELECT * FROM collection WHERE id=$1 FOR UPDATE",[id]);if(!prior)return fail("NOT_FOUND","مجموعه پیدا نشد.",404);if(prior.version!==input.expectedVersion)fail("CONFLICT","نسخهٔ مجموعه تغییر کرده است.",409);}const products=await query(db,"SELECT id,status FROM product WHERE id=ANY($1::uuid[])",[input.productIds]);if(products.length!==input.productIds.length || (input.published && products.some((p)=>p.status!=="published")))fail("VALIDATION","محصول‌های منتشرشده را برای مجموعه انتخاب کنید.");await db.query("INSERT INTO collection(id,name,slug,description,published) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=$2,slug=$3,description=$4,published=$5,version=collection.version+1",[id,input.name,input.slug,input.description,input.published]);await db.query("DELETE FROM collection_product WHERE collection_id=$1",[id]);for(const [position,productId]of input.productIds.entries())await db.query("INSERT INTO collection_product(collection_id,product_id,position) VALUES($1,$2,$3)",[id,productId,position]);await audit(db,actor,"collection.saved","collection",id,"admin configuration");return (await one(db,"SELECT * FROM collection WHERE id=$1",[id]))!;});
  }
  async function importProducts(actor:Actor,rows:ProductInput[],dryRun=true){
    await assertActor(pool,actor,"catalog.write");if(!Array.isArray(rows) || !rows.length || rows.length>300)fail("VALIDATION","تعداد ردیف‌ها معتبر نیست.");
    const issues:{row:number;message:string}[]=[],slugs=new Set<string>(),skus=new Set<string>();
    for(const [index,input]of rows.entries()){
      try{validateProduct(input);if(slugs.has(input.slug))throw new Error("نشانی محصول تکراری است.");slugs.add(input.slug);for(const variant of input.variants){if(skus.has(variant.sku))throw new Error("شناسهٔ کالا تکراری است.");skus.add(variant.sku);}if(await one(pool,"SELECT id FROM product WHERE slug=$1",[input.slug]))throw new Error("نشانی محصول از پیش وجود دارد.");if(await one(pool,"SELECT id FROM variant WHERE sku=ANY($1::text[])",[input.variants.map((v)=>v.sku)]))throw new Error("شناسهٔ کالا از پیش وجود دارد.");}
      catch(error){issues.push({row:index+1,message:error instanceof Error ? error.message : "ردیف معتبر نیست."});}
    }
    if(dryRun || issues.length)return {dryRun,issues,imported:0};
    return transaction(async(db)=>{await assertActor(db,actor,"catalog.write");for(const input of rows)await writeProduct(db,actor,randomUUID(),input);return {dryRun:false,issues:[],imported:rows.length};});
  }
  async function decideReturn(actor:Actor,returnId:string,input:{status:"approved"|"rejected"|"received"|"closed";reason:string;restock?:boolean}){
    boundedString(input.reason,"دلیل تصمیم",1000);
    return transaction(async(db)=>{
      await assertActor(db,actor,"orders.fulfill");const hint=await one(db,"SELECT order_id FROM return_request WHERE id=$1",[returnId]);if(!hint)return fail("NOT_FOUND","درخواست پیدا نشد.",404);
      const order=(await one(db,"SELECT * FROM orders WHERE id=$1 FOR UPDATE",[hint.order_id]))!;
      const request=(await one(db,"SELECT * FROM return_request WHERE id=$1 FOR UPDATE",[returnId]))!;
      const allowed:Record<string,string[]>={pending:["approved","rejected"],approved:["received","closed"],received:["closed"],rejected:[],closed:[]};
      if(request.status===input.status)return {id:returnId,status:input.status};
      if(!allowed[text(request,"status")]?.includes(input.status))fail("NOT_ELIGIBLE","این تغییر وضعیت مجاز نیست.",409);
      const cancelling=request.kind==="cancel" && input.status==="approved";
      const shipment=await one(db,"SELECT * FROM shipment WHERE order_id=$1 FOR UPDATE",[order.id]);
      if(cancelling && ["shipped","delivered"].includes(String(shipment?.status)))fail("NOT_ELIGIBLE","سفارش ارسال‌شده قابل لغو مستقیم نیست.",409);
      if(input.restock && (request.kind!=="return" || input.status!=="received"))fail("VALIDATION","بازگشت موجودی پس از دریافت و بررسی کیفیت انجام می‌شود.");
      if(cancelling || input.restock){
        await assertActor(db,actor,"inventory.write");
        const items=await query(db,"SELECT * FROM order_item WHERE order_id=$1 ORDER BY variant_id",[order.id]);
        await query(db,"SELECT variant_id FROM inventory_balance WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE",[items.map((item)=>item.variant_id)]);
        for(const item of items){
          const reservation=await one(db,"SELECT * FROM inventory_reservation WHERE order_id=$1 AND variant_id=$2 FOR UPDATE",[order.id,item.variant_id]);
          const onHandDelta=order.committed_at ? number(item,"quantity") : 0,reservedDelta=reservation?.status==="active" ? -number(item,"quantity") : 0;
          await db.query("UPDATE inventory_balance SET on_hand=on_hand+$1,reserved=reserved+$2 WHERE variant_id=$3",[onHandDelta,reservedDelta,item.variant_id]);
          if(reservation?.status==="active")await db.query("UPDATE inventory_reservation SET status='released' WHERE id=$1",[reservation.id]);
          await db.query("INSERT INTO inventory_ledger(id,variant_id,order_id,operation_key,on_hand_delta,reserved_delta,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),item.variant_id,order.id,`return-stock:${returnId}:${item.variant_id}`,onHandDelta,reservedDelta,input.reason,actor.userId]);
        }
      }
      if(cancelling){await db.query("UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1",[order.id]);await db.query("UPDATE shipment SET status='cancelled',updated_at=now() WHERE order_id=$1",[order.id]);await db.query("UPDATE coupon_redemption SET status='released' WHERE order_id=$1 AND status='reserved'",[order.id]);}
      await db.query("UPDATE return_request SET status=$1 WHERE id=$2",[input.status,returnId]);await audit(db,actor,"return.reviewed","return",returnId,input.reason);await event(db,text(order,"id"),`request.${input.status}`,`return:${returnId}:${input.status}`,actor.userId);return {id:returnId,status:input.status};
    });
  }
  async function expireReservations(){return transaction(async(db)=>{const orders=await query(db,"SELECT o.id FROM orders o WHERE EXISTS(SELECT 1 FROM inventory_reservation r WHERE r.order_id=o.id AND r.status='active' AND r.expires_at<=now()) ORDER BY o.id FOR UPDATE SKIP LOCKED LIMIT 50");let count=0;for(const order of orders){const reservations=await query(db,"SELECT * FROM inventory_reservation WHERE order_id=$1 AND status='active' ORDER BY variant_id FOR UPDATE",[order.id]);await query(db,"SELECT variant_id FROM inventory_balance WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE",[reservations.map((r)=>r.variant_id)]);for(const reservation of reservations){await db.query("UPDATE inventory_balance SET reserved=reserved-$1 WHERE variant_id=$2",[reservation.quantity,reservation.variant_id]);await db.query("UPDATE inventory_reservation SET status='released' WHERE id=$1",[reservation.id]);await db.query("INSERT INTO inventory_ledger(id,variant_id,order_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,0,$5,'reservation_expired') ON CONFLICT(operation_key) DO NOTHING",[randomUUID(),reservation.variant_id,order.id,`release:${reservation.id}`,-number(reservation,"quantity")]);count++;}await db.query("UPDATE coupon_redemption SET status='released' WHERE order_id=$1 AND status='reserved'",[order.id]);await event(db,text(order,"id"),"reservation.expired",`expired:${order.id}`);}return count;});}
  async function reconcileAttempt(attemptId:string){const attempt=await one(pool,"SELECT * FROM payment_attempt WHERE id=$1",[attemptId]);if(!attempt || attempt.status==="succeeded" || attempt.status==="failed")return;if(!attempt.authority)throw new Error("create result unknown; provider support reconciliation required");const inquiry=await payments.inquiry({...paymentContext(attempt),authority:text(attempt,"authority")});if(inquiry.kind==="unknown")throw new Error(`inquiry unknown: ${inquiry.code}`);if(inquiry.status==="PAID" || inquiry.status==="VERIFIED"){const verified=await verifyPayment(text(attempt,"authority"));if(verified.status==="unknown")throw new Error("verify remains unknown");}else if(inquiry.status==="IN_BANK")throw new Error("payment in progress");else if(inquiry.status==="FAILED")await pool.query("UPDATE payment_attempt SET status='failed',updated_at=now() WHERE id=$1 AND status<>'succeeded'",[attemptId]);}
  return {listProducts,listProductsPage,listAdminProducts,listAdminProductsPage,listExportProducts,listSitemapProducts,listVariantsPage,resolvePublishedProducts,getProduct,createProduct,updateProduct,publishProduct,archiveProduct,bulkEdit,createCart,getCart,setCartItem,setCartCoupon,quoteCheckout,createCheckout,retryPayment,initializeAttempt,verifyPayment,getOrder,listOrders,listOrdersPage,listExportOrders,recordShipment,adjustInventory,listInventory,getInventoryLedger,requestReturn,decideReturn,requestRefund,completeManualRefund,listReceipts,saveAddress,listAddresses,deleteAddress,setWishlist,listWishlist,listCoupons,saveCoupon,listContent,saveContent,listCollections,saveCollection,importProducts,expireReservations,reconcileAttempt};
}
export type Commerce = ReturnType<typeof createCommerce>;
