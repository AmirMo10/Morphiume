import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../../../src/contracts/commerce";
import { normalizeSearch } from "../../../src/lib/persian";
import { createCommerce, type Commerce } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";
import { createIsolatedDatabase } from "./isolated-database";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL bounded pagination",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,commerce:Commerce;
  const prefix=`TESTPAGE-${randomUUID().slice(0,8)}`,outside=`TESTFACET-${randomUUID().slice(0,8)}`;
  const users:string[]=[],products:string[]=[],orders:string[]=[];
  const productRows=Array.from({length:323},(_,i)=>({id:randomUUID(),name:`${prefix}-${String(i).padStart(3,"0")}`,slug:`${prefix.toLowerCase()}-${i}`,status:i<320 ? "published" : i<322 ? "draft" : "archived",family:`${prefix}-family`,concentration:`${prefix}-concentration`}));
  const facetProduct={id:randomUUID(),name:outside,slug:outside.toLowerCase(),status:"published",family:`${outside}-family`,concentration:`${outside}-concentration`};
  const variants=productRows.flatMap((p,i)=>[50,100].map((volume)=>({id:randomUUID(),product_id:p.id,sku:`${prefix}-${i}-${volume}`,volume_ml:volume,price_irr:volume===50 ? 1000+i*10 : 5000+i*10,on_hand:volume===50 && i%2===0 ? 0 : 5})));
  let admin:Actor,customer:Actor,other:Actor;
  let afterCatalogCount:(()=>Promise<void>)|undefined;
  const observed:string[]=[];
  const wrapped=new WeakSet<pg.PoolClient>();
  function observe(client:pg.PoolClient){
    if(wrapped.has(client))return;wrapped.add(client);
    const original=client.query.bind(client);
    client.query=new Proxy(original,{apply(target,thisArg,args){
      const sql=String(args[0]);observed.push(sql);const result=Reflect.apply(target,thisArg,args);
      if(afterCatalogCount && sql.startsWith("SELECT count(*)::text AS count FROM product p")){const hook=afterCatalogCount;afterCatalogCount=undefined;return (result as Promise<unknown>).then(async(value)=>{await hook();return value;});}
      return result;
    }}) as typeof client.query;
  }
  async function actor(kind:Actor["kind"]){
    const userId=randomUUID(),sessionId=randomUUID();users.push(userId);
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,phone_number,phone_number_verified) VALUES($1,\'TEST pagination fixture\',$2,true,$3,true)',[userId,`${userId}@fixture.invalid`,`+989${String(randomInt(0,1_000_000_000)).padStart(9,"0")}`]);
    await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);
    if(kind==="admin"){await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[userId]);await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);}
    return {userId,sessionId,kind};
  }
  beforeAll(async()=>{
    isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;pool.on("acquire",observe);commerce=createCommerce({pool,payments:new MockPaymentProvider(pool,"test","http://127.0.0.1:3000"),deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000"});
    admin=await actor("admin");customer=await actor("customer");other=await actor("customer");
    const allProducts=[...productRows,facetProduct];products.push(...allProducts.map((p)=>p.id));
    await pool.query("INSERT INTO product(id,name,slug,status,family,concentration,description,search_key,created_at) SELECT id,name,slug,status,family,concentration,'TEST synthetic paging fixture',search_key,'2020-01-01T00:00:00Z' FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,name text,slug text,status text,family text,concentration text,search_key text)",[JSON.stringify(allProducts.map((p)=>({...p,search_key:normalizeSearch(p.name)})))]);
    const allVariants=[...variants,{id:randomUUID(),product_id:facetProduct.id,sku:outside,volume_ml:333,price_irr:2000,on_hand:1}];
    await pool.query("WITH v AS (INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) SELECT id,product_id,sku,volume_ml,price_irr FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,product_id uuid,sku text,volume_ml int,price_irr bigint) RETURNING id) INSERT INTO inventory_balance(variant_id,on_hand) SELECT x.id,x.on_hand FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,on_hand int) JOIN v ON v.id=x.id",[JSON.stringify(allVariants)]);
    await pool.query("INSERT INTO product_image(product_id,position,url,alt) SELECT unnest($1::uuid[]),0,'/assets/sample-perfume.svg','TEST gallery fixture'",[products]);
    await pool.query("INSERT INTO product_image(product_id,position,url,alt,variant_id) VALUES($1,1,'/assets/sample-perfume.svg','TEST variant image',$2)",[productRows[0]!.id,variants[0]!.id]);
    const rows=Array.from({length:125},(_,i)=>({id:randomUUID(),order_number:`${prefix}-ORDER-${String(i).padStart(3,"0")}`,user_id:i<120 ? customer.userId : other.userId,status:i%2 ? "confirmed" : "awaiting_payment",payment_status:i%2 ? "paid" : "pending"}));orders.push(...rows.map((o)=>o.id));
    const address={recipient:"TEST pagination recipient",phone:"+989121234567",province:"TEST",city:"TEST",address:"TEST",plaque:"1",postalCode:"1234567890"};
    await pool.query("INSERT INTO orders(id,order_number,user_id,status,payment_status,subtotal_irr,discount_irr,shipping_irr,tax_irr,total_irr,address_snapshot,policy_version,shipping_method_id,created_at) SELECT id,order_number,user_id,status,payment_status,1000,0,0,0,1000,$2::jsonb,'TEST paging policy','standard','2020-01-01T00:00:00Z' FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,order_number text,user_id text,status text,payment_status text)",[JSON.stringify(rows),JSON.stringify(address)]);
    await pool.query("INSERT INTO order_item(id,order_id,variant_id,name,sku,volume_ml,quantity,unit_price_irr,line_total_irr) SELECT gen_random_uuid(),unnest($1::uuid[]),$2,'TEST snapshot','TEST-SNAPSHOT',50,1,1000,1000",[orders,variants[0]!.id]);
    await pool.query("INSERT INTO order_event(id,order_id,event_key,type) SELECT gen_random_uuid(),id,id::text || ':paging','TEST.created' FROM orders WHERE id=ANY($1::uuid[])",[orders]);
    await pool.query("INSERT INTO shipment(id,order_id,status,carrier,tracking_code) SELECT gen_random_uuid(),id,'shipped','TEST carrier','TEST tracking' FROM orders WHERE id=ANY($1::uuid[]) AND status='confirmed'",[orders]);
  },60000);
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("traverses more than 300 published products deterministically without truncation",async()=>{
    const ids:string[]=[];
    for(let page=1;page<=4;page++){const result=await commerce.listProductsPage({search:prefix,page,pageSize:100});expect(result.totalItems).toBe(320);expect(result.totalPages).toBe(4);expect(result.page).toBe(page);expect(result.pageSize).toBe(100);ids.push(...result.items.map((p)=>p.id));}
    expect(ids).toEqual(productRows.slice(0,320).map((p)=>p.id));expect(new Set(ids).size).toBe(320);
    const beyond=await commerce.listProductsPage({search:prefix,page:9,pageSize:100});expect(beyond.items).toEqual([]);expect(beyond.totalItems).toBe(320);expect(beyond.page).toBe(9);
  });
  it("filters volume and availability on one variant and sorts its integer price",async()=>{
    const matched=await commerce.listProductsPage({search:prefix,volumeMl:50,available:true,pageSize:100,sort:"price_asc"});
    expect(matched.totalItems).toBe(160);expect(matched.items[0]!.id).toBe(productRows[1]!.id);expect(matched.items.every((p)=>p.variants.some((v)=>v.volumeMl===50 && v.available>0))).toBe(true);
    const desc=await commerce.listProductsPage({search:prefix,volumeMl:100,available:true,sort:"price_desc"});expect(desc.totalItems).toBe(320);expect(desc.items[0]!.id).toBe(productRows[319]!.id);
    const exact=await commerce.listProductsPage({search:prefix,family:`${prefix}-family`,concentration:`${prefix}-concentration`,volumeMl:50});expect(exact.totalItems).toBe(320);
    expect((await commerce.listProductsPage({search:prefix,concentration:"NO SUCH TEST VALUE"})).totalItems).toBe(0);
  });
  it("accepts inclusive localized whole-toman boundaries, zero and the maximum amount",async()=>{
    const exact=await commerce.listProductsPage({search:prefix,minPriceToman:"۱۰۰",maxPriceToman:"١٠٠"});expect(exact.totalItems).toBe(1);expect(exact.items[0]!.id).toBe(productRows[0]!.id);
    const all=await commerce.listProductsPage({search:prefix,minPriceToman:"۰",maxPriceToman:"١٠٠٠٠٠٠٠٠"});expect(all.totalItems).toBe(320);
    expect((await commerce.listProductsPage({search:prefix,maxPriceToman:"0"})).totalItems).toBe(0);expect((await commerce.listProductsPage({search:prefix,minPriceToman:"450",maxPriceToman:"499"})).totalItems).toBe(0);
    const variant=variants[1]!;await pool.query("UPDATE variant SET price_irr=1000000000 WHERE id=$1",[variant.id]);
    try{const maximum=await commerce.listProductsPage({search:prefix,minPriceToman:"100000000",maxPriceToman:"۱۰۰٬۰۰۰٬۰۰۰"});expect(maximum.totalItems).toBe(1);expect(maximum.items[0]!.id).toBe(productRows[0]!.id);expect(maximum.items[0]!.variants.find((v)=>v.id===variant.id)?.price.amountIrr).toBe("1000000000");}
    finally{await pool.query("UPDATE variant SET price_irr=$2 WHERE id=$1",[variant.id,variant.price_irr]);}
  });
  it("binds range, volume, availability and sorting to the same active variant",async()=>{
    expect((await commerce.listProductsPage({search:prefix,minPriceToman:"100",maxPriceToman:"100",available:true})).totalItems).toBe(0);
    expect((await commerce.listProductsPage({search:prefix,minPriceToman:"100",maxPriceToman:"100",volumeMl:100})).totalItems).toBe(0);
    expect((await commerce.listProductsPage({search:prefix,minPriceToman:"500",maxPriceToman:"510",volumeMl:50,available:true})).totalItems).toBe(0);
    const trapFamily=`${prefix}-range-trap`,ids=productRows.slice(0,2).map((p)=>p.id),premium=[variants[1]!,variants[3]!];
    await pool.query("UPDATE product SET family=$2 WHERE id=ANY($1::uuid[])",[ids,trapFamily]);await pool.query("UPDATE variant SET price_irr=7000 WHERE id=$1",[premium[0]!.id]);await pool.query("UPDATE variant SET price_irr=6000 WHERE id=$1",[premium[1]!.id]);
    try{
      observed.length=0;const ascending=await commerce.listProductsPage({search:prefix,family:trapFamily,volumeMl:100,available:true,minPriceToman:"600",maxPriceToman:"800",sort:"price_asc"});expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(5);expect(ascending.totalItems).toBe(2);expect(ascending.items.map((p)=>p.id)).toEqual([ids[1],ids[0]]);
      const descending=await commerce.listProductsPage({search:prefix,family:trapFamily,available:true,minPriceToman:"600",maxPriceToman:"800",sort:"price_desc"});expect(descending.items.map((p)=>p.id)).toEqual(ids);
      expect(ascending.items.every((p)=>p.variants.length===2 && p.variants.some((v)=>BigInt(v.price.amountIrr)<6000n))).toBe(true);
      await pool.query("UPDATE variant SET active=false WHERE id=$1",[premium[1]!.id]);const activeOnly=await commerce.listProductsPage({search:prefix,family:trapFamily,minPriceToman:"600",maxPriceToman:"800"});expect(activeOnly.items.map((p)=>p.id)).toEqual([ids[0]]);
    }finally{await pool.query("UPDATE product SET family=$2 WHERE id=ANY($1::uuid[])",[ids,`${prefix}-family`]);for(const v of premium)await pool.query("UPDATE variant SET price_irr=$2,active=true WHERE id=$1",[v.id,v.price_irr]);}
  });
  it("keeps ranged page counts and admin/public status scopes consistent",async()=>{
    const filter={search:prefix,volumeMl:50,minPriceToman:"200",maxPriceToman:"205",pageSize:2};const ids:string[]=[];
    for(let page=1;page<=3;page++){const result=await commerce.listProductsPage({...filter,page});expect(result.totalItems).toBe(6);expect(result.totalPages).toBe(3);ids.push(...result.items.map((p)=>p.id));}expect(ids).toEqual(productRows.slice(100,106).map((p)=>p.id));
    const beyond=await commerce.listProductsPage({...filter,page:4});expect(beyond.items).toEqual([]);expect(beyond.totalItems).toBe(6);expect((await commerce.listProductsPage({...filter,available:true})).totalItems).toBe(3);
    const privateRange={search:prefix,volumeMl:50,minPriceToman:"420",maxPriceToman:"422"};expect((await commerce.listProductsPage(privateRange)).totalItems).toBe(0);expect((await commerce.listAdminProductsPage(admin,privateRange)).totalItems).toBe(3);expect((await commerce.listAdminProductsPage(admin,{...privateRange,status:"draft"})).totalItems).toBe(2);expect((await commerce.listAdminProductsPage(admin,{...privateRange,status:"archived"})).totalItems).toBe(1);
  });
  it("rejects reversed, negative, fractional, overflow and malformed price ranges",async()=>{
    await expect(commerce.listProductsPage({minPriceToman:"101",maxPriceToman:"100"})).rejects.toMatchObject({code:"VALIDATION"});
    for(const amount of ["-1","-۱۰","1.5","۱٫۵","100000001","١٠٠٠٠٠٠٠١","1e3","Infinity",""]){await expect(commerce.listProductsPage({minPriceToman:amount})).rejects.toMatchObject({code:"VALIDATION"});await expect(commerce.listProductsPage({maxPriceToman:amount})).rejects.toMatchObject({code:"VALIDATION"});}
    await expect(commerce.listAdminProductsPage(admin,{minPriceToman:"۲۰۰",maxPriceToman:"١٠٠"})).rejects.toMatchObject({code:"VALIDATION"});
  });
  it("loads globally scoped facets and ordered galleries with a constant query budget",async()=>{
    observed.length=0;const single=await commerce.listProductsPage({search:prefix,pageSize:1});const oneBudget=observed.filter((sql)=>sql.startsWith("SELECT")).length;
    observed.length=0;const large=await commerce.listProductsPage({search:prefix,pageSize:100});const largeBudget=observed.filter((sql)=>sql.startsWith("SELECT")).length;
    expect(oneBudget).toBe(5);expect(largeBudget).toBe(5);expect(single.items[0]!.images.map((i)=>i.alt)).toEqual(["TEST gallery fixture","TEST variant image"]);expect(single.items[0]!.images[1]!.variantSku).toBe(variants[0]!.sku);
    expect(large.facets.families).toContain(facetProduct.family);expect(large.facets.concentrations).toContain(facetProduct.concentration);expect(large.facets.volumesMl).toContain(333);
    const noMatches=await commerce.listProductsPage({search:`absent-${prefix}`});expect(noMatches.facets).toEqual(large.facets);
  });
  it("paginates admin draft/archive results and rechecks fresh grants",async()=>{
    const all=await commerce.listAdminProductsPage(admin,{search:prefix,pageSize:100});expect(all.totalItems).toBe(323);
    const drafts=await commerce.listAdminProductsPage(admin,{search:prefix,status:"draft"});expect(drafts.totalItems).toBe(2);expect(drafts.items.every((p)=>p.status==="draft")).toBe(true);
    expect((await commerce.listAdminProductsPage(admin,{search:prefix,status:"archived"})).totalItems).toBe(1);
    const revoked=await actor("admin");await pool.query("DELETE FROM admin_grant WHERE session_id=$1",[revoked.sessionId]);await expect(commerce.listAdminProductsPage(revoked,{search:prefix})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("keeps count and all page reads in one snapshot during a concurrent publication",async()=>{
    const draft=productRows[320]!;
    afterCatalogCount=async()=>{await pool.query("UPDATE product SET status='published' WHERE id=$1",[draft.id]);};
    try{
      const during=await commerce.listProductsPage({search:prefix,page:4,pageSize:100});expect(during.totalItems).toBe(320);expect(during.items).toHaveLength(20);expect(during.items.some((p)=>p.id===draft.id)).toBe(false);
      const after=await commerce.listProductsPage({search:prefix,page:4,pageSize:100});expect(after.totalItems).toBe(321);expect(after.items).toHaveLength(21);expect(after.items.some((p)=>p.id===draft.id)).toBe(true);
    }finally{afterCatalogCount=undefined;await pool.query("UPDATE product SET status='draft' WHERE id=$1",[draft.id]);}
  });
  it("paginates more than 100 owned orders with scoped counts and batch children",async()=>{
    observed.length=0;const first=await commerce.listOrdersPage(customer,{search:prefix,pageSize:100});expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(8);
    const second=await commerce.listOrdersPage(customer,{search:prefix,page:2,pageSize:100});expect(first.totalItems).toBe(120);expect(second.items).toHaveLength(20);expect(new Set([...first.items,...second.items].map((o)=>o.id)).size).toBe(120);
    const expected=[...orders.slice(0,120)].sort().reverse();expect([...first.items,...second.items].map((o)=>o.id)).toEqual(expected);
    expect(first.items.every((o)=>o.items.length===1 && o.items[0]!.name==="TEST snapshot" && o.events[0]!.type==="TEST.created")).toBe(true);
    expect(first.items.filter((o)=>o.status==="confirmed").every((o)=>o.shipment?.trackingCode==="TEST tracking")).toBe(true);
    expect((await commerce.listOrdersPage(other,{search:prefix})).totalItems).toBe(5);
    expect((await commerce.listOrdersPage(customer,{search:`${prefix}-ORDER-124`})).totalItems).toBe(0);
    expect((await commerce.listOrdersPage(customer,{search:orders[0]})).totalItems).toBe(0);
    expect((await commerce.listOrdersPage(customer,{search:"TEST pagination recipient"})).totalItems).toBe(0);
    const adminPage=await commerce.listOrdersPage(admin,{search:prefix,status:"confirmed",paymentStatus:"paid",pageSize:100});expect(adminPage.totalItems).toBe(62);
    const pending=await commerce.listOrdersPage(customer,{search:prefix,status:"awaiting_payment",paymentStatus:"pending"});expect(pending.totalItems).toBe(60);
  });
  it("rejects unbounded pages, invalid filters, and wildcard expansion",async()=>{
    for(const input of [{page:0},{pageSize:101},{page:1.2},{pageSize:0},{page:1_000_001}])await expect(commerce.listProductsPage(input)).rejects.toMatchObject({code:"VALIDATION"});
    await expect(commerce.listOrdersPage(customer,{pageSize:101})).rejects.toMatchObject({code:"VALIDATION"});
    await expect(commerce.listProductsPage({volumeMl:0})).rejects.toMatchObject({code:"VALIDATION"});
    expect((await commerce.listProductsPage({search:`${prefix}%`})).totalItems).toBe(0);
    expect((await commerce.listOrdersPage(customer,{search:`${prefix}_`})).totalItems).toBe(0);
    await pool.query("UPDATE session SET expires_at=now()-interval '1 second' WHERE id=$1",[other.sessionId]);await expect(commerce.listOrdersPage(other)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  });
  it("exports full authorized snapshots or explicitly rejects the ceiling",async()=>{
    await expect(commerce.listExportProducts(admin,1)).rejects.toMatchObject({code:"CONFLICT"});await expect(commerce.listExportOrders(admin,1)).rejects.toMatchObject({code:"CONFLICT"});
    await expect(commerce.listExportProducts(admin,10_001)).rejects.toMatchObject({code:"VALIDATION"});await expect(commerce.listExportOrders(admin,0)).rejects.toMatchObject({code:"VALIDATION"});
    await expect(commerce.listExportOrders(customer)).rejects.toMatchObject({code:"FORBIDDEN"});await expect(commerce.listExportProducts(customer)).rejects.toMatchObject({code:"FORBIDDEN"});
    observed.length=0;const exportedProducts=await commerce.listExportProducts(admin);expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(7);
    expect(exportedProducts.filter((p)=>p.name.startsWith(prefix))).toHaveLength(323);expect(exportedProducts.find((p)=>p.id===productRows[0]!.id)?.images).toHaveLength(2);
    observed.length=0;const exportedOrders=await commerce.listExportOrders(admin);expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(10);
    expect(exportedOrders.filter((o)=>o.orderNumber.startsWith(prefix))).toHaveLength(125);
  });
  it("builds a complete lightweight public sitemap and excludes retired-only products",async()=>{
    observed.length=0;const indexed=await commerce.listSitemapProducts();expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(2);
    const own=indexed.filter((p)=>p.slug.startsWith(prefix.toLowerCase()));expect(own).toHaveLength(320);expect(own.every((p)=>Number.isFinite(Date.parse(p.updatedAt)))).toBe(true);
    expect(own.every((p)=>Object.keys(p).sort().join(",")==="id,slug,updatedAt")).toBe(true);
    await expect(commerce.listSitemapProducts(1)).rejects.toMatchObject({code:"CONFLICT"});await expect(commerce.listSitemapProducts(10_001)).rejects.toMatchObject({code:"VALIDATION"});
    await pool.query("UPDATE variant SET active=false WHERE product_id=$1",[productRows[0]!.id]);
    try{expect((await commerce.listSitemapProducts()).some((p)=>p.id===productRows[0]!.id)).toBe(false);}finally{await pool.query("UPDATE variant SET active=true WHERE product_id=$1",[productRows[0]!.id]);}
  });
  it("filters exact top/heart/base notes with family and same-variant availability",async()=>{
    const rose=`${prefix}-ROSE`,outsideNote=`${outside}-NOTE`,draftNote=`${prefix}-DRAFT-NOTE`;
    await pool.query("UPDATE product SET top_notes=jsonb_build_array($2::text) WHERE id=ANY($1::uuid[])",[[productRows[0]!.id,productRows[3]!.id],rose]);
    await pool.query("UPDATE product SET top_notes=jsonb_build_array($2::text) WHERE id=$1",[productRows[3]!.id,`${rose}WOOD`]);
    await pool.query("UPDATE product SET heart_notes=jsonb_build_array($2::text) WHERE id=$1",[productRows[1]!.id,rose]);
    await pool.query("UPDATE product SET base_notes=jsonb_build_array($2::text) WHERE id=$1",[productRows[2]!.id,rose]);
    await pool.query("UPDATE product SET top_notes=jsonb_build_array($2::text) WHERE id=$1",[facetProduct.id,outsideNote]);
    await pool.query("UPDATE product SET top_notes=jsonb_build_array($2::text) WHERE id=$1",[productRows[320]!.id,draftNote]);
    try{
      expect((await commerce.listProductsPage({search:prefix,note:rose})).totalItems).toBe(3);
      const available=await commerce.listProductsPage({search:prefix,note:rose,family:`${prefix}-family`,volumeMl:50,available:true});expect(available.totalItems).toBe(1);expect(available.items[0]!.id).toBe(productRows[1]!.id);
      expect((await commerce.listProductsPage({search:prefix,note:rose.toLowerCase()})).totalItems).toBe(0);
      const facets=(await commerce.listProductsPage({search:`absent-${prefix}`})).facets;expect(facets.notes).toContain(outsideNote);expect(facets.notes).not.toContain(draftNote);
    }finally{await pool.query("UPDATE product SET top_notes='[]',heart_notes='[]',base_notes='[]' WHERE id=ANY($1::uuid[])",[products]);}
  });
  it("reports facet truncation while preserving exact filtering outside visible facets",async()=>{
    for(let i=0;i<4;i++)await pool.query("UPDATE product SET top_notes=$2::jsonb WHERE id=$1",[productRows[i]!.id,JSON.stringify(Array.from({length:30},(_,j)=>`${prefix}-NOTE-${String(i*30+j).padStart(3,"0")}`))]);
    try{
      const result=await commerce.listProductsPage({search:prefix});expect(result.facetLimit).toBe(100);expect(result.facetsTruncated).toBe(true);expect(result.facets.notes).toHaveLength(100);
      const exact=await commerce.listProductsPage({search:prefix,note:`${prefix}-NOTE-119`});expect(exact.totalItems).toBe(1);expect(exact.items[0]!.id).toBe(productRows[3]!.id);
    }finally{await pool.query("UPDATE product SET top_notes='[]' WHERE id=ANY($1::uuid[])",[productRows.slice(0,4).map((p)=>p.id)]);}
  });
  it("paginates historical variants and minimizes fields by fresh role permission",async()=>{
    const warehouse=await actor("admin"),catalog=await actor("admin");await pool.query("UPDATE role_membership SET role='fulfillment' WHERE user_id=$1",[warehouse.userId]);await pool.query("UPDATE role_membership SET role='product_manager' WHERE user_id=$1",[catalog.userId]);
    await pool.query("UPDATE inventory_balance SET reserved=1 WHERE variant_id=$1",[variants[2]!.id]);
    try{
      observed.length=0;const stock=await commerce.listVariantsPage(warehouse,{search:prefix,pageSize:100});expect(stock.totalItems).toBe(646);expect(stock.totalPages).toBe(7);expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(5);expect(observed.some((sql)=>sql.includes("price_irr"))).toBe(false);
      expect(stock.items.every((v)=>v.onHand!==undefined && v.reserved!==undefined && v.price===undefined)).toBe(true);expect(JSON.stringify(stock)).not.toContain('"price"');expect(JSON.stringify(stock)).not.toContain("amountIrr");
      const next=await commerce.listVariantsPage(warehouse,{search:prefix,page:2,pageSize:100});expect(next.totalItems).toBe(646);expect(new Set([...stock.items,...next.items].map((v)=>v.id)).size).toBe(200);expect((await commerce.listVariantsPage(warehouse,{search:prefix,page:7,pageSize:100})).items).toHaveLength(46);
      const prices=await commerce.listVariantsPage(catalog,{search:`${prefix}-1-50`});expect(prices.items).toHaveLength(1);expect(prices.items[0]!.price?.amountIrr).toBe("1010");expect(prices.items[0]!.available).toBe(4);expect(prices.items[0]!.onHand).toBeUndefined();expect(prices.items[0]!.reserved).toBeUndefined();
      const retired=variants.find((v)=>v.product_id===productRows[322]!.id && v.volume_ml===50)!;await pool.query("UPDATE variant SET active=false WHERE id=$1",[retired.id]);
      try{const row=(await commerce.listVariantsPage(warehouse,{search:retired.sku})).items[0]!;expect(row.active).toBe(false);expect(row.productStatus).toBe("archived");expect(row.productVersion).toBe(1);}finally{await pool.query("UPDATE variant SET active=true WHERE id=$1",[retired.id]);}
      await pool.query("DELETE FROM admin_grant WHERE session_id=$1",[warehouse.sessionId]);await expect(commerce.listVariantsPage(warehouse,{search:prefix})).rejects.toMatchObject({code:"FORBIDDEN"});
      await pool.query("DELETE FROM role_membership WHERE user_id=$1",[catalog.userId]);await expect(commerce.listVariantsPage(catalog,{search:prefix})).rejects.toMatchObject({code:"FORBIDDEN"});await expect(commerce.listVariantsPage(customer)).rejects.toMatchObject({code:"FORBIDDEN"});
    }finally{await pool.query("UPDATE inventory_balance SET reserved=0 WHERE variant_id=$1",[variants[2]!.id]);}
  });
  it("normalizes Persian variant name/SKU search without searching description or wildcards",async()=>{
    const p=productRows[0]!;await pool.query("UPDATE product SET name=$2,search_key=$3,description=$4 WHERE id=$1",[p.id,"TEST ياس‌١٢",normalizeSearch(`${prefix} unique-description`),"unique-description"]);
    try{
      expect((await commerce.listVariantsPage(admin,{search:"یاس ۱۲"})).items).toHaveLength(2);
      expect((await commerce.listVariantsPage(admin,{search:variants[0]!.sku.replace(/50$/,"۵۰")})).items).toHaveLength(1);
      expect((await commerce.listVariantsPage(admin,{search:"unique-description"})).totalItems).toBe(0);
      expect((await commerce.listVariantsPage(admin,{search:`${prefix}%`})).totalItems).toBe(0);
      await expect(commerce.listVariantsPage(admin,{pageSize:101})).rejects.toMatchObject({code:"VALIDATION"});
    }finally{await pool.query("UPDATE product SET name=$2,search_key=$3,description='TEST synthetic paging fixture' WHERE id=$1",[p.id,p.name,normalizeSearch(p.name)]);}
  });
  it("resolves ordered favorites beyond 300 uniformly with bounded batch hydration",async()=>{
    const first=productRows[319]!.id,second=productRows[1]!.id,unknown=randomUUID(),draft=productRows[320]!.id,archived=productRows[322]!.id;
    observed.length=0;const resolved=await commerce.resolvePublishedProducts([` ${first.toUpperCase()} `,unknown,second,draft,first,archived]);
    expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(3);expect(resolved.products.map((p)=>p.id)).toEqual([first,second]);expect(resolved.unavailableIds).toEqual([unknown,draft,archived]);expect(resolved.products.every((p)=>p.images.length>0)).toBe(true);
    observed.length=0;expect((await commerce.resolvePublishedProducts(productRows.slice(0,100).map((p)=>p.id))).products).toHaveLength(100);expect(observed.filter((sql)=>sql.startsWith("SELECT")).length).toBe(3);
    await pool.query("UPDATE variant SET active=false WHERE product_id=$1",[productRows[0]!.id]);
    try{expect(await commerce.resolvePublishedProducts([productRows[0]!.id,unknown,draft,archived])).toEqual({products:[],unavailableIds:[productRows[0]!.id,unknown,draft,archived]});}finally{await pool.query("UPDATE variant SET active=true WHERE product_id=$1",[productRows[0]!.id]);}
    expect(await commerce.resolvePublishedProducts([])).toEqual({products:[],unavailableIds:[]});
    await expect(commerce.resolvePublishedProducts(productRows.slice(0,101).map((p)=>p.id))).rejects.toMatchObject({code:"VALIDATION"});await expect(commerce.resolvePublishedProducts(["not-a-uuid"])).rejects.toMatchObject({code:"VALIDATION"});
    expect((await commerce.resolvePublishedProducts(Array.from({length:101},()=>first))).products).toHaveLength(1);
  });
});
