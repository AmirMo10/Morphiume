import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { ProductDto, ProductInput } from "../../../src/contracts/commerce";
import { createIsolatedDatabase } from "./isolated-database";
import { commerceFixture, observeLock } from "./commerce-fixture";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL optional product copy",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,fixture:Awaited<ReturnType<typeof commerceFixture>>;
  function input():ProductInput{
    const suffix=randomUUID();return {name:`TEST content ${suffix}`,slug:`test-content-${suffix}`,description:"TEST full product copy",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-CONTENT-${suffix}`,volumeMl:50,priceToman:"1000",initialStock:2}]};
  }
  const supplied={shortDescription:"TEST short introduction",careInstructions:"TEST supplied care copy",approvedWarnings:"TEST seller supplied warning"};
  function edit(product:ProductDto):ProductInput{return {name:product.name,slug:product.slug,description:product.description,family:product.family,concentration:product.concentration,topNotes:product.topNotes,heartNotes:product.heartNotes,baseNotes:product.baseNotes,images:product.images,variants:product.variants.map(variant=>({sku:variant.sku,volumeMl:variant.volumeMl,priceToman:(BigInt(variant.price.amountIrr)/10n).toString()}))};}
  async function snapshot(id:string){return {
    row:(await pool.query("SELECT * FROM product WHERE id=$1",[id])).rows,
    variants:(await pool.query("SELECT * FROM variant WHERE product_id=$1 ORDER BY id",[id])).rows,
    images:(await pool.query("SELECT * FROM product_image WHERE product_id=$1 ORDER BY position",[id])).rows,
    audits:(await pool.query("SELECT * FROM audit_event WHERE entity_id=$1 ORDER BY id",[id])).rows,
  };}
  beforeAll(async()=>{isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;},60000);
  beforeEach(async()=>{fixture=await commerceFixture(pool);});
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("stores supplied supplemental copy without inventing values",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,{...input(),shortDescription:`  ${supplied.shortDescription}  `,careInstructions:`\n${supplied.careInstructions}\n`,approvedWarnings:supplied.approvedWarnings});expect(product).toMatchObject(supplied);
    const published=await fixture.commerce.publishProduct(fixture.admin,product.id,product.version);expect(await fixture.commerce.getProduct(product.id)).toEqual(published);
    const literal="<script>TEST literal content</script>";const saved=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(published),approvedWarnings:literal},published.version);expect(saved.approvedWarnings).toBe(literal);expect((await fixture.commerce.getProduct(product.id)).approvedWarnings).toBe(literal); // Rendering escape is independently frontend-owned.
  });
  it("keeps blank legacy creation/defaults and allows publication without invented optional facts",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,input());expect(product).toMatchObject({shortDescription:"",careInstructions:"",approvedWarnings:""});await fixture.commerce.publishProduct(fixture.admin,product.id,product.version);
    const id=randomUUID();await pool.query("INSERT INTO product(id,name,slug,description,concentration,family,search_key) VALUES($1,'TEST fd74961 SQL',$2,'TEST legacy full','TEST','TEST','test legacy')",[id,`test-legacy-content-${id}`]);
    const legacy=(await pool.query("SELECT * FROM product WHERE id=$1",[id])).rows[0];expect(legacy).toMatchObject({short_description:"",care_instructions:"",approved_warnings:""});expect(await fixture.commerce.getProduct(id,fixture.admin)).toMatchObject({shortDescription:"",careInstructions:"",approvedWarnings:""});
  });
  it("preserves absent legacy update fields and permits explicit blank clearing with one version/audit",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,{...input(),...supplied}),before=await snapshot(product.id);const preserved=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),name:`${product.name} edited`},product.version);expect(preserved).toMatchObject(supplied);expect(preserved.version).toBe(product.version+1);expect((await snapshot(product.id)).audits.length-before.audits.length).toBe(1);
    const cleared=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(preserved),shortDescription:"",careInstructions:"  ",approvedWarnings:""},preserved.version);expect(cleared).toMatchObject({shortDescription:"",careInstructions:"",approvedWarnings:""});expect(cleared.version).toBe(preserved.version+1);
  });
  it("preserves the values read after a product-row wait rather than prefetched caller values",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,{...input(),...supplied}),blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query("SELECT id FROM product WHERE id=$1 FOR UPDATE",[product.id]);await blocker.query("UPDATE product SET short_description='TEST newest locked copy',version=version+1 WHERE id=$1",[product.id]);
    // Controlled fixture withholds an already-known next version behind a lock.
    const pending=fixture.commerce.updateProduct(fixture.admin,product.id,edit(product),product.version+1);
    try{await observeLock(pool,`TEST-isolated-${isolated.schema}`,"SELECT * FROM product WHERE id=$1 FOR UPDATE%");await blocker.query("COMMIT");}finally{await blocker.query("ROLLBACK");blocker.release();}
    expect(await pending).toMatchObject({shortDescription:"TEST newest locked copy",careInstructions:supplied.careInstructions,approvedWarnings:supplied.approvedWarnings,version:product.version+2});
  });
  it("rejects oversized/nonstring/NUL values before new rows and enforces exact limits in database",async()=>{
    const before=(await pool.query("SELECT count(*)::int AS count FROM product")).rows[0].count;
    for(const [field,limit] of [["shortDescription",600],["careInstructions",4000],["approvedWarnings",4000]] as const){
      for(const invalid of [null,42,{},[],true,"x".repeat(limit+1)," ".repeat(limit+1),"TEST\0bad"]){await expect(fixture.commerce.createProduct(fixture.admin,{...input(),[field]:invalid} as unknown as ProductInput)).rejects.toMatchObject({code:"VALIDATION"});}
    }
    expect((await pool.query("SELECT count(*)::int AS count FROM product")).rows[0].count).toBe(before);
    const exact=await fixture.commerce.createProduct(fixture.admin,{...input(),shortDescription:"ش".repeat(600),careInstructions:"ک".repeat(4000),approvedWarnings:"ه".repeat(4000)});expect(exact.shortDescription).toHaveLength(600);expect(exact.careInstructions).toHaveLength(4000);expect(exact.approvedWarnings).toHaveLength(4000);
    for(const [column,limit] of [["short_description",600],["care_instructions",4000],["approved_warnings",4000]] as const)await expect(pool.query(`UPDATE product SET ${column}=$1 WHERE id=$2`,["x".repeat(limit+1),exact.id])).rejects.toMatchObject({code:"23514"});
  });
  it("rolls stale and invalid-gallery edits back without partial copy, version or audit changes",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,{...input(),...supplied}),saved=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),shortDescription:"TEST newest"},product.version),before=await snapshot(product.id);
    await expect(fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),...{shortDescription:"TEST stale overwrite"}},product.version)).rejects.toMatchObject({code:"CONFLICT"});
    await expect(fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(saved),shortDescription:"TEST must rollback",images:[{url:`/media/${randomUUID()}.webp`,alt:"TEST nonexistent media"}]},saved.version)).rejects.toMatchObject({code:"VALIDATION"});expect(await snapshot(product.id)).toEqual(before);
    const raced=await Promise.allSettled([fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(saved),shortDescription:"TEST writer A"},saved.version),fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(saved),shortDescription:"TEST writer B"},saved.version)]);expect(raced.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(raced.filter(result=>result.status==="rejected").map(result=>result.reason)).toEqual([expect.objectContaining({code:"CONFLICT"})]);
  });
  it("saves text and reordered gallery atomically and retains paid snapshots and inventory",async()=>{
    const {checkout}=await fixture.purchase(),product=await fixture.commerce.getProduct((await pool.query("SELECT product_id FROM variant WHERE id=$1",[fixture.variantId])).rows[0].product_id,fixture.admin),beforeOrder=await fixture.commerce.getOrder(fixture.customer,checkout.orderId),beforeStock=(await pool.query("SELECT * FROM inventory_balance WHERE variant_id=$1",[fixture.variantId])).rows;
    const gallery=[{url:"/assets/sample-perfume.svg",alt:"TEST second",variantSku:product.variants[0]!.sku},{url:"/assets/sample-perfume.svg",alt:"TEST first generic"}],saved=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(product),...supplied,images:gallery},product.version);expect(saved).toMatchObject(supplied);expect(saved.images).toEqual(gallery.map(image=>({...image,variantSku:image.variantSku ?? null})));
    const moved=await fixture.commerce.updateProduct(fixture.admin,product.id,{...edit(saved),images:[gallery[1]!,gallery[0]!]},saved.version);expect(moved).toMatchObject(supplied);expect(moved.images.map(image=>image.alt)).toEqual(["TEST first generic","TEST second"]);expect(await fixture.commerce.getOrder(fixture.customer,checkout.orderId)).toEqual(beforeOrder);expect((await pool.query("SELECT * FROM inventory_balance WHERE variant_id=$1",[fixture.variantId])).rows).toEqual(beforeStock);
  });
  it("indexes normalized short copy in bounded public batch pages without indexing care/warnings",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,{...input(),shortDescription:"TEST ي۱۲ ك",careInstructions:"TEST not searchable care ONLYCARE",approvedWarnings:"TEST not searchable warnings ONLYWARN"});await fixture.commerce.publishProduct(fixture.admin,product.id,product.version);
    const client=await pool.connect(),spy=vi.spyOn(client,"query");client.release();
    try{const page=await fixture.commerce.listProductsPage({search:"ی12 ک",pageSize:100});expect(page.items.map(row=>row.id)).toEqual([product.id]);expect(page.items[0]).toMatchObject({shortDescription:"TEST ي۱۲ ك"});expect(spy.mock.calls.filter(([sql])=>typeof sql==="string" && sql.trim().startsWith("SELECT"))).toHaveLength(5);}
    finally{spy.mockRestore();}
    expect((await fixture.commerce.listProductsPage({search:"ONLYCARE"})).totalItems).toBe(0);expect((await fixture.commerce.listProductsPage({search:"ONLYWARN"})).totalItems).toBe(0);
  });
  it("validates create-only imports/dry runs and never overwrites colliding legacy content",async()=>{
    const existing=await fixture.commerce.createProduct(fixture.admin,{...input(),...supplied}),before=await snapshot(existing.id),rows=[{...input(),...supplied},input()];expect(await fixture.commerce.importProducts(fixture.admin,rows,true)).toEqual({dryRun:true,issues:[],imported:0});expect((await pool.query("SELECT id FROM product WHERE slug=ANY($1::text[])",[rows.map(row=>row.slug)])).rows).toHaveLength(0);
    expect(await fixture.commerce.importProducts(fixture.admin,rows,false)).toEqual({dryRun:false,issues:[],imported:2});const imported=(await fixture.commerce.listAdminProducts(fixture.admin)).filter(product=>rows.some(row=>row.slug===product.slug));expect(imported.find(product=>product.slug===rows[0]!.slug)).toMatchObject(supplied);expect(imported.find(product=>product.slug===rows[1]!.slug)).toMatchObject({shortDescription:"",careInstructions:"",approvedWarnings:""});
    const collision=await fixture.commerce.importProducts(fixture.admin,[{...edit(existing),shortDescription:undefined}],false);expect(collision.imported).toBe(0);expect(collision.issues).toHaveLength(1);expect(await snapshot(existing.id)).toEqual(before);
    const invalid=await fixture.commerce.importProducts(fixture.admin,[{...input(),careInstructions:"x".repeat(4001)}],true);expect(invalid.issues).toHaveLength(1);expect(invalid.imported).toBe(0);
  });
  it("keeps legacy fd74961 explicit-column reads/writes compatible without claiming image execution",async()=>{
    const product=await fixture.commerce.createProduct(fixture.admin,{...input(),...supplied}),legacyFields=["id","name","slug","description","concentration","family","top_notes","heart_notes","base_notes","image_url","search_key","status","version","created_at","updated_at"];
    const star=(await pool.query("SELECT * FROM product WHERE id=$1",[product.id])).rows[0],explicit=(await pool.query(`SELECT ${legacyFields.join(",")} FROM product WHERE id=$1`,[product.id])).rows[0];expect(Object.fromEntries(legacyFields.map(field=>[field,star[field]]))).toEqual(explicit);
    await pool.query("UPDATE product SET name=$1,version=version+1,updated_at=now() WHERE id=$2",[`TEST legacy name ${product.id}`,product.id]);expect((await fixture.commerce.getProduct(product.id,fixture.admin))).toMatchObject(supplied);
    const denied=await fixture.actor("admin");await pool.query("UPDATE role_membership SET role='fulfillment' WHERE user_id=$1",[denied.userId]);await expect(fixture.commerce.updateProduct(denied,product.id,edit(product),product.version)).rejects.toMatchObject({code:"FORBIDDEN"});
  });
});
