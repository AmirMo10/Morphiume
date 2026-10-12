import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProductDto, ProductInput } from "../../../src/contracts/commerce";
import { createIsolatedDatabase } from "./isolated-database";
import { commerceFixture, observeLock } from "./commerce-fixture";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL ordinary product proof after waits",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,fixture:Awaited<ReturnType<typeof commerceFixture>>;
  function input():ProductInput{const id=randomUUID();return {name:`TEST proof ${id}`,slug:`test-proof-${id}`,description:"TEST controlled proof copy",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-PROOF-${id}`,volumeMl:50,priceToman:"1000",initialStock:0}]};}
  function edit(product:ProductDto):ProductInput{return {name:product.name,slug:product.slug,description:product.description,family:product.family,concentration:product.concentration,topNotes:product.topNotes,heartNotes:product.heartNotes,baseNotes:product.baseNotes,images:product.images,variants:product.variants.map(variant=>({sku:variant.sku,volumeMl:variant.volumeMl,priceToman:(BigInt(variant.price.amountIrr)/10n).toString()}))};}
  async function state(){return {
    products:(await pool.query("SELECT id,name,version,status,short_description,care_instructions,approved_warnings,updated_at FROM product ORDER BY id")).rows,
    images:(await pool.query("SELECT * FROM product_image ORDER BY product_id,position")).rows,
    variants:(await pool.query("SELECT * FROM variant ORDER BY id")).rows,
    balances:(await pool.query("SELECT * FROM inventory_balance ORDER BY variant_id")).rows,
    ledger:(await pool.query("SELECT * FROM inventory_ledger ORDER BY id")).rows,
    slugClaims:(await pool.query("SELECT * FROM product_slug_claim ORDER BY slug")).rows,
    audits:(await pool.query("SELECT * FROM audit_event ORDER BY id")).rows,
  };}
  async function wait(sql:string,id:string,pattern:string,work:()=>Promise<unknown>,invalidate:(blocker:pg.PoolClient)=>Promise<void>){
    const blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query(sql,[id]);const pending=work().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
    try{await observeLock(pool,`TEST-isolated-${isolated.schema}`,pattern);await invalidate(blocker);await blocker.query("COMMIT");}finally{await blocker.query("ROLLBACK");blocker.release();}return pending;
  }
  async function skuWait(sku:string,work:()=>Promise<unknown>,invalidate:()=>Promise<void>){
    const blocker=await pool.connect(),id=randomUUID();await blocker.query("BEGIN");
    await blocker.query("INSERT INTO product(id,name,slug) VALUES($1,'TEST uncommitted SKU blocker',$2)",[id,`test-proof-blocker-${id}`]);
    await blocker.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,50,1000)",[randomUUID(),id,sku]);
    const pending=work().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
    try{await observeLock(pool,`TEST-isolated-${isolated.schema}`,"INSERT INTO variant%");await invalidate();}
    finally{await blocker.query("ROLLBACK");blocker.release();}return pending;
  }
  async function media(){const id=randomUUID(),url=`/media/${id}.webp`;await pool.query("INSERT INTO media(id,public_path,private_object_key,mime_type,width,height,status,created_by) VALUES($1,$2,$3,'image/webp',100,100,'ready',$4)",[id,url,id,fixture.admin.userId]);return {id,url};}
  beforeAll(async()=>{isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;},60000);
  beforeEach(async()=>{fixture=await commerceFixture(pool);});
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("denies catalog role revoked while an update waits on its product",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input()),before=await state(),result=await wait("SELECT id FROM product WHERE id=$1 FOR UPDATE",product.id,"SELECT * FROM product WHERE id=$1 FOR UPDATE%",()=>fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),shortDescription:"TEST forbidden copy"},product.version),async()=>{await pool.query("UPDATE role_membership SET role='support' WHERE user_id=$1",[fixture.admin.userId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("denies session expiry while publication waits on its product",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input()),before=await state(),result=await wait("SELECT id FROM product WHERE id=$1 FOR UPDATE",product.id,"SELECT * FROM product WHERE id=$1 FOR UPDATE%",()=>fixture.commerce.publishProduct(fixture.admin,product.id,product.version),async()=>{await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[fixture.admin.sessionId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("denies grant expiry while an update waits without changing content/gallery/version",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input()),before=await state(),result=await wait("SELECT id FROM product WHERE id=$1 FOR UPDATE",product.id,"SELECT * FROM product WHERE id=$1 FOR UPDATE%",()=>fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),careInstructions:"TEST expired grant"},product.version),async()=>{await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[fixture.admin.sessionId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("denies disabled MFA while creation waits on ready-media authorization",async()=>{
    const ready=await media(),before=await state(),result=await wait("SELECT id FROM media WHERE id=$1 FOR UPDATE",ready.id,"SELECT id,public_path,created_by FROM media WHERE public_path=ANY%",()=>fixture.commerce.createProduct(fixture.admin,{...input(),images:[{url:ready.url,alt:"TEST controlled media"}]}),async()=>{await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1',[fixture.admin.userId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("denies an account disabled while create-only import waits on ready media",async()=>{
    const ready=await media(),before=await state(),result=await wait("SELECT id FROM media WHERE id=$1 FOR UPDATE",ready.id,"SELECT id,public_path,created_by FROM media WHERE public_path=ANY%",()=>fixture.commerce.importProducts(fixture.admin,[{...input(),images:[{url:ready.url,alt:"TEST import controlled media"}]}],false),async()=>{await pool.query('UPDATE "user" SET disabled=true WHERE id=$1',[fixture.admin.userId]);});expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("rolls back staged catalog and initial-stock effects after a SKU wait loses inventory permission",async()=>{
    const productInput=input();productInput.variants[0]!.initialStock=2;const before=await state();
    const result=await skuWait(productInput.variants[0]!.sku,()=>fixture.commerce.createProduct(fixture.admin,productInput),async()=>{await pool.query("UPDATE role_membership SET role='product_manager' WHERE user_id=$1",[fixture.admin.userId]);});
    expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("rolls back every imported row if catalog rights change during the last SKU wait",async()=>{
    const first=input(),last=input(),before=await state();
    const result=await skuWait(last.variants[0]!.sku,()=>fixture.commerce.importProducts(fixture.admin,[first,last],false),async()=>{await pool.query("UPDATE role_membership SET role='support' WHERE user_id=$1",[fixture.admin.userId]);});
    expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("rechecks wall-clock grant expiry after waiting on current authorization roles",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input()),before=await state();
    await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()+interval '1.5 seconds' WHERE session_id=$1",[fixture.admin.sessionId]);
    const result=await wait("SELECT user_id FROM role_membership WHERE user_id=$1 FOR UPDATE",fixture.admin.userId,"SELECT role FROM role_membership WHERE user_id=$1 FOR SHARE%",()=>fixture.commerce.updateProduct(fixture.admin,product.id,edit(product),product.version),async()=>{await new Promise(resolve=>setTimeout(resolve,1700));});
    expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("does not retain an owner-only foreign-media bypass after a later SKU wait",async()=>{
    const uploader=await fixture.actor("admin"),ready=await media();await pool.query("UPDATE media SET created_by=$1 WHERE id=$2",[uploader.userId,ready.id]);
    const productInput={...input(),images:[{url:ready.url,alt:"TEST foreign library image"}]},before=await state();
    const result=await skuWait(productInput.variants[0]!.sku,()=>fixture.commerce.createProduct(fixture.admin,productInput),async()=>{await pool.query("UPDATE role_membership SET role='product_manager' WHERE user_id=$1",[fixture.admin.userId]);});
    expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("allows ordinary catalog create/update/publish/import with a live factor older than five minutes",async()=>{
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[fixture.admin.sessionId]);
    const product=await fixture.commerce.createProduct(fixture.admin,input()),updated=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),shortDescription:"TEST ordinary live proof"},product.version);
    expect(await fixture.commerce.publishProduct(fixture.admin,product.id,updated.version)).toMatchObject({status:"published",shortDescription:"TEST ordinary live proof"});
    expect(await fixture.commerce.importProducts(fixture.admin,[input()],true)).toMatchObject({dryRun:true,issues:[],imported:0});
    expect(await fixture.commerce.importProducts(fixture.admin,[input()],false)).toMatchObject({dryRun:false,issues:[],imported:1});
  });
  it("denies catalog role loss while archival waits without status/version/variant/audit effects",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input()),published=await fixture.commerce.publishProduct(fixture.admin,product.id,product.version),before=await state();
    const result=await wait("SELECT id FROM product WHERE id=$1 FOR UPDATE",product.id,"SELECT * FROM product WHERE id=$1 FOR UPDATE%",()=>fixture.commerce.archiveProduct(fixture.admin,product.id,published.version),async()=>{await pool.query("UPDATE role_membership SET role='support' WHERE user_id=$1",[fixture.admin.userId]);});
    expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("denies grant expiry while archival waits on its product",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input()),before=await state();
    const result=await wait("SELECT id FROM product WHERE id=$1 FOR UPDATE",product.id,"SELECT * FROM product WHERE id=$1 FOR UPDATE%",()=>fixture.commerce.archiveProduct(fixture.admin,product.id,product.version),async()=>{await pool.query("UPDATE admin_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[fixture.admin.sessionId]);});
    expect(result.error).toMatchObject({code:"FORBIDDEN"});expect(await state()).toEqual(before);
  });
  it("allows archival with an older live factor while retaining variants and immutable paid snapshots",async()=>{
    const paid=await fixture.purchase(),order=await fixture.commerce.getOrder(fixture.customer,paid.checkout.orderId),productId=(await pool.query<{product_id:string}>("SELECT product_id FROM variant WHERE id=$1",[fixture.variantId])).rows[0]!.product_id,product=await fixture.commerce.getProduct(productId,fixture.admin),before=await state();
    await pool.query("UPDATE admin_grant SET factor_verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",[fixture.admin.sessionId]);
    expect(await fixture.commerce.archiveProduct(fixture.admin,product.id,product.version)).toMatchObject({status:"archived",version:product.version+1});
    const after=await state();expect(after.variants).toEqual(before.variants);expect(after.balances).toEqual(before.balances);expect(after.ledger).toEqual(before.ledger);expect(after.slugClaims).toEqual(before.slugClaims);expect(await fixture.commerce.getOrder(fixture.customer,paid.checkout.orderId)).toEqual(order);
  });
});
