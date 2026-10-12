import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor, CollectionInput, ProductInput } from "../../../src/contracts/commerce";
import { normalizeSearch } from "../../../src/lib/persian";
import { createCommerce, type Commerce } from "../../../src/server/commerce/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";
import { createIsolatedDatabase } from "./isolated-database";

config({path:".env.local",quiet:true});
const runtime=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,owner=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
describe.skipIf(!runtime || !owner || !["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? ""))("PostgreSQL aliases and bounded collections",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,commerce:Commerce,admin:Actor,main:string;
  const prefix=`TEST-COLLECTION-${randomUUID().slice(0,8)}`,products:string[]=Array.from({length:301},()=>randomUUID()),observed:string[]=[];
  let hook:((sql:string)=>Promise<void>)|undefined;
  async function actor(){const userId=randomUUID(),sessionId=randomUUID();await pool.query('INSERT INTO "user"(id,name,email,email_verified,two_factor_enabled) VALUES($1,\'TEST collection fixture\',$2,true,true)',[userId,`${userId}@fixture.invalid`]);await pool.query("INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,randomUUID(),userId]);await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[userId]);await pool.query("INSERT INTO admin_grant(session_id,expires_at) VALUES($1,now()+interval '1 hour')",[sessionId]);return {userId,sessionId,kind:"admin" as const};}
  function input(slug:string):ProductInput{return {name:`TEST alias ${slug}`,slug,description:"TEST alias fixture",family:"TEST",concentration:"TEST",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:"/assets/sample-perfume.svg",variants:[{sku:`TEST-${randomUUID()}`,volumeMl:50,priceToman:"1000",initialStock:2}]};}
  async function product(slug=`test-alias-${randomUUID()}`){const value=input(slug),p=await commerce.createProduct(admin,value);return {value,p:await commerce.publishProduct(admin,p.id,p.version)};}
  async function collection(slug=`test-collection-${randomUUID()}`,productIds=[products[0]!],published=true){const value:CollectionInput={name:`TEST collection ${slug}`,slug,description:"TEST controlled collection",published,productIds};const row=await commerce.saveCollection(admin,value);return {value,row};}
  beforeAll(async()=>{
    isolated=await createIsolatedDatabase(runtime!,owner!);pool=isolated.pool;
    const wrapped=new WeakSet<pg.PoolClient>();pool.on("acquire",client=>{if(wrapped.has(client))return;wrapped.add(client);const original=client.query.bind(client);client.query=new Proxy(original,{apply(target,thisArg,args){const sql=String(args[0]);observed.push(sql);const result=Reflect.apply(target,thisArg,args);const current=hook;if(current)return (result as Promise<unknown>).then(async value=>{await current(sql);return value;});return result;}}) as typeof client.query;});
    commerce=createCommerce({pool,payments:new MockPaymentProvider(pool,"test","http://127.0.0.1:3000"),deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000"});admin=await actor();
    const rows=products.map((id,index)=>({id,name:`TEST member ${String(index).padStart(3,"0")}`,slug:`test-member-${id}`,search:normalizeSearch(`TEST member ${index}`),price:10000+index*10}));
    await pool.query("INSERT INTO product(id,name,slug,description,family,concentration,top_notes,status,search_key) SELECT id,name,slug,'TEST collection fixture','TEST member family','TEST concentration','[\"TEST note\"]','published',search FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,name text,slug text,search text)",[JSON.stringify(rows)]);
    await pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) SELECT gen_random_uuid(),id,'TEST-'||id,50,price FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,price bigint)",[JSON.stringify(rows)]);
    await pool.query("INSERT INTO inventory_balance(variant_id,on_hand) SELECT id,2 FROM variant");await pool.query("INSERT INTO product_image(product_id,position,url,alt) SELECT id,0,'/assets/sample-perfume.svg','TEST collection fixture' FROM product");
    await pool.query("UPDATE inventory_balance SET on_hand=0 WHERE variant_id=(SELECT id FROM variant WHERE product_id=$1)",[products[0]]);const trap=randomUUID();await pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,100,20000)",[trap,products[0],`TEST-TRAP-${trap}`]);await pool.query("INSERT INTO inventory_balance(variant_id,on_hand) VALUES($1,2)",[trap]);
    const index=Array.from({length:120},(_,i)=>({id:randomUUID(),name:`${prefix} ${String(i).padStart(3,"0")}`,slug:`test-index-${prefix.slice(-8)}-${i}`}));await pool.query("INSERT INTO collection(id,name,slug,published) SELECT id,name,slug,true FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,name text,slug text)",[JSON.stringify(index)]);
    main=String((await collection(undefined,products.slice(0,300).reverse())).row.id);
  },120000);
  afterAll(async()=>{if(isolated)await isolated.close();});
  it("retains product rename history in one hop, permits own old slug and keeps archived claims reserved",async()=>{
    const {p,value}=await product(),old=p.slug,next=`test-renamed-${randomUUID()}`,latest=`test-latest-${randomUUID()}`;
    const changed=await commerce.updateProduct(admin,p.id,{...value,slug:next},p.version),again=await commerce.updateProduct(admin,p.id,{...value,slug:latest},changed.version);
    for(const slug of [old,next]){const resolved=await commerce.resolveProductRoute(slug);expect(resolved).toMatchObject({canonicalSlug:latest,redirect:true,product:{id:p.id,slug:latest}});}
    expect((await commerce.getProduct(p.id)).slug).toBe(latest);const reclaimed=await commerce.updateProduct(admin,p.id,{...value,slug:old},again.version);expect((await commerce.resolveProductRoute(old)).redirect).toBe(false);
    const dry=await commerce.importProducts(admin,[input(next)],true);expect(dry.issues).toHaveLength(1);
    await commerce.archiveProduct(admin,p.id,reclaimed.version);await expect(commerce.resolveProductRoute(next)).rejects.toMatchObject({code:"NOT_FOUND"});await expect(commerce.createProduct(admin,input(next))).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("rolls back stale/colliding edits and arbitrates concurrent historical-slug claims",async()=>{
    const a=await product(),b=await product(),changed=await commerce.updateProduct(admin,a.p.id,{...a.value,slug:`test-a-new-${randomUUID()}`},a.p.version);
    const stale=`test-stale-${randomUUID()}`;await expect(commerce.updateProduct(admin,a.p.id,{...a.value,slug:stale},a.p.version)).rejects.toMatchObject({code:"CONFLICT"});expect((await pool.query("SELECT slug FROM product_slug_claim WHERE slug=$1",[stale])).rows).toHaveLength(0);
    await expect(commerce.updateProduct(admin,b.p.id,{...b.value,slug:a.p.slug},b.p.version)).rejects.toMatchObject({code:"CONFLICT"});expect((await commerce.getProduct(b.p.id)).version).toBe(b.p.version);
    const shared=`test-shared-${randomUUID()}`,results=await Promise.allSettled([commerce.updateProduct(admin,a.p.id,{...a.value,slug:shared},changed.version),commerce.updateProduct(admin,b.p.id,{...b.value,slug:shared},b.p.version)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);expect((await pool.query("SELECT product_id FROM product_slug_claim WHERE slug=$1",[shared])).rows).toHaveLength(1);
  });
  it("rejects new UUID-shaped slugs and makes claim ownership immutable even for raw fixture SQL",async()=>{
    await expect(commerce.createProduct(admin,input(randomUUID()))).rejects.toMatchObject({code:"VALIDATION"});await expect(collection(randomUUID())).rejects.toMatchObject({code:"VALIDATION"});
    await expect(pool.query("UPDATE product_slug_claim SET product_id=$1 WHERE slug=(SELECT slug FROM product WHERE id=$2)",[products[1],products[0]])).rejects.toMatchObject({code:"55000"});await expect(pool.query("DELETE FROM product_slug_claim WHERE product_id=$1",[products[0]])).rejects.toMatchObject({code:"55000"});
  });
  it("resolves collection aliases and reserves both namespaces independently",async()=>{
    const {row,value}=await collection(),renamed={...value,id:String(row.id),slug:`test-new-collection-${randomUUID()}`,expectedVersion:Number(row.version)};
    const next=await commerce.saveCollection(admin,renamed);expect(await commerce.getCollectionPage(value.slug)).toMatchObject({canonicalSlug:renamed.slug,redirect:true,collection:{id:row.id}});
    await expect(collection(value.slug)).rejects.toMatchObject({code:"CONFLICT"});await expect(commerce.saveCollection(admin,{...renamed,slug:`test-stale-collection-${randomUUID()}`})).rejects.toMatchObject({code:"CONFLICT"});
    await product(value.slug);const restored=await commerce.saveCollection(admin,{...renamed,slug:value.slug,expectedVersion:Number(next.version)});expect((await commerce.getCollectionPage(value.slug)).redirect).toBe(false);
    await commerce.saveCollection(admin,{...value,id:String(row.id),published:false,expectedVersion:Number(restored.version)});for(const slug of [value.slug,renamed.slug,"test-unknown-collection"])await expect(commerce.getCollectionPage(slug)).rejects.toMatchObject({code:"NOT_FOUND"});
  });
  it("arbitrates concurrent collection claims without changing the losing membership/version",async()=>{
    const a=await collection(),b=await collection(undefined,[products[1]!]),slug=`test-raced-collection-${randomUUID()}`;
    const results=await Promise.allSettled([commerce.saveCollection(admin,{...a.value,id:String(a.row.id),slug,expectedVersion:Number(a.row.version)}),commerce.saveCollection(admin,{...b.value,id:String(b.row.id),slug,expectedVersion:Number(b.row.version)})]);
    expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
    for(const [index,original] of [a,b].entries()){const current=await commerce.getAdminCollection(admin,String(original.row.id));expect(current.productIds).toEqual(original.value.productIds);expect(current.version).toBe(Number(original.row.version)+(results[index]!.status==="fulfilled" ? 1 : 0));}
  });
  it("paginates more than one hundred collection summaries with bounded deterministic queries",async()=>{
    const ids:string[]=[];for(const page of [1,2]){observed.length=0;const result=await commerce.listCollectionsPage({search:prefix,page,pageSize:100});expect(result.totalItems).toBe(120);expect(result.totalPages).toBe(2);ids.push(...result.items.map(x=>x.id));expect(result.items.every(x=>typeof x.updatedAt==="string" && x.productCount===0 && !("products" in x))).toBe(true);expect(observed.filter(sql=>sql.startsWith("SELECT")).length).toBe(3);}
    expect(new Set(ids).size).toBe(120);expect((await commerce.listCollectionsPage({search:prefix,page:3,pageSize:100})).items).toEqual([]);await expect(commerce.listCollectionsPage({pageSize:101})).rejects.toMatchObject({code:"VALIDATION"});
  });
  it("paginates all three hundred members in configured order with six batched reads and scoped facets",async()=>{
    const ids:string[]=[];for(const page of [1,2,3]){observed.length=0;const result=await commerce.getCollectionPage(main,{page,pageSize:100});expect(result.collection.productCount).toBe(300);expect(result.products.totalItems).toBe(300);ids.push(...result.products.items.map(x=>x.id));expect(observed.filter(sql=>sql.startsWith("SELECT") || sql.startsWith("WITH")).length).toBe(6);expect(result.products.facets.families).toEqual(["TEST member family"]);}
    expect(ids).toEqual(products.slice(0,300).reverse());const adminDetail=await commerce.getAdminCollection(admin,main);expect(adminDetail.productIds).toEqual(ids);expect(adminDetail.members.every(x=>x.active && x.status==="published")).toBe(true);expect(JSON.stringify(adminDetail)).not.toContain("amountIrr");
  });
  it("keeps collection volume/stock/price filters on one variant and sorts matching prices",async()=>{
    const exact=await commerce.getCollectionPage(main,{volumeMl:50,available:true,minPriceToman:"۱۰۰۰",maxPriceToman:"١٠٠٠"});expect(exact.products.totalItems).toBe(0);expect(exact.products.facets.notes).toEqual(["TEST note"]);
    const matched=await commerce.getCollectionPage(main,{volumeMl:100,available:true,minPriceToman:"۲۰۰۰",maxPriceToman:"2000",sort:"price_desc"});expect(matched.products.items.map(x=>x.id)).toEqual([products[0]]);expect(matched.products.items[0]!.variants).toHaveLength(2);
    const descending=await commerce.getCollectionPage(main,{sort:"price_desc",pageSize:100});expect(descending.products.items[0]!.id).toBe(products[299]);await expect(commerce.getCollectionPage(main,{minPriceToman:"2",maxPriceToman:"1"})).rejects.toMatchObject({code:"VALIDATION"});
  });
  it("retains withdrawn stored members but rejects new hidden attachments and draft publication",async()=>{
    const owned=await product(),other=await product(),saved=await collection(undefined,[owned.p.id]);await commerce.archiveProduct(admin,owned.p.id,owned.p.version);await commerce.archiveProduct(admin,other.p.id,other.p.version);
    const detail=await commerce.getAdminCollection(admin,String(saved.row.id));expect(detail.productIds).toEqual([owned.p.id]);expect(detail.members[0]).toMatchObject({status:"archived",active:true});
    const renamed=await commerce.saveCollection(admin,{...saved.value,id:detail.id,name:"TEST retained hidden",expectedVersion:detail.version});expect((await commerce.getCollectionPage(saved.value.slug)).collection.productCount).toBe(0);expect((await commerce.getAdminCollection(admin,detail.id)).productIds).toEqual([owned.p.id]);
    await expect(commerce.saveCollection(admin,{...saved.value,id:detail.id,productIds:[owned.p.id,other.p.id],expectedVersion:Number(renamed.version)})).rejects.toMatchObject({code:"VALIDATION"});
    const draft=await collection(undefined,[other.p.id],false);await expect(commerce.saveCollection(admin,{...draft.value,id:String(draft.row.id),published:true,expectedVersion:Number(draft.row.version)})).rejects.toMatchObject({code:"VALIDATION"});
  });
  it("holds one read snapshot across rename/withdrawal between identity and members",async()=>{
    const member=await product(),saved=await collection(undefined,[member.p.id]),slug=`test-snapshot-new-${randomUUID()}`;
    hook=async sql=>{if(!sql.startsWith("SELECT c.*,(SELECT count"))return;hook=undefined;await commerce.saveCollection(admin,{...saved.value,id:String(saved.row.id),slug,expectedVersion:Number(saved.row.version)});await commerce.archiveProduct(admin,member.p.id,member.p.version);};
    try{const during=await commerce.getCollectionPage(saved.value.slug);expect(during.canonicalSlug).toBe(saved.value.slug);expect(during.products.items.map(x=>x.id)).toEqual([member.p.id]);const after=await commerce.getCollectionPage(saved.value.slug);expect(after.canonicalSlug).toBe(slug);expect(after.products.totalItems).toBe(0);}finally{hook=undefined;}
  });
  it("checks retained versus new membership after concurrent withdrawal row waits",async()=>{
    const retained=await product(),newMember=await product(),saved=await collection(undefined,[retained.p.id]);
    async function withdrawal(memberId:string,work:()=>Promise<unknown>){const blocker=await pool.connect();await blocker.query("BEGIN");await blocker.query("UPDATE product SET status='archived' WHERE id=$1",[memberId]);let done=false;const pending=work().then(value=>({value,error:undefined}),(error:unknown)=>({value:undefined,error})).finally(()=>{done=true;});try{let waiting=false;const deadline=Date.now()+2400;while(Date.now()<deadline && !done){const activity=await pool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT p.id,p.status,%FOR SHARE OF p'",[`TEST-isolated-${isolated.schema}`]);if(activity.rowCount){waiting=true;break;}}expect(waiting).toBe(true);await blocker.query("COMMIT");return await pending;}finally{await blocker.query("ROLLBACK");blocker.release();await pending;}}
    const accepted=await withdrawal(retained.p.id,()=>commerce.saveCollection(admin,{...saved.value,id:String(saved.row.id),name:"TEST retention race",expectedVersion:Number(saved.row.version)}));expect(accepted.error).toBeUndefined();const current=await commerce.getAdminCollection(admin,String(saved.row.id));expect(current.productIds).toEqual([retained.p.id]);expect(current.members[0]!.status).toBe("archived");
    const denied=await withdrawal(newMember.p.id,()=>commerce.saveCollection(admin,{...saved.value,id:current.id,productIds:[retained.p.id,newMember.p.id],expectedVersion:current.version}));expect(denied.error).toMatchObject({code:"VALIDATION"});expect((await commerce.getAdminCollection(admin,current.id)).version).toBe(current.version);expect((await commerce.getCollectionPage(saved.value.slug)).products.totalItems).toBe(0);
  });
  it("provides lightweight bounded sitemap rows and rechecks revoked collection authorization",async()=>{
    observed.length=0;const rows=await commerce.listSitemapCollections();expect(rows.length).toBeGreaterThan(100);expect(observed.filter(sql=>sql.startsWith("SELECT")).length).toBe(2);expect(rows.every(x=>Object.keys(x).sort().join()==="id,slug,updatedAt")).toBe(true);await expect(commerce.listSitemapCollections(100)).rejects.toMatchObject({code:"CONFLICT"});
    const revoked=await actor();await pool.query("DELETE FROM admin_grant WHERE session_id=$1",[revoked.sessionId]);await expect(commerce.getAdminCollection(revoked,main)).rejects.toMatchObject({code:"FORBIDDEN"});await expect(commerce.listAdminCollectionsPage(revoked)).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("rejects both legacy array ceilings explicitly without truncating or hydrating excessive members",async()=>{
    await expect(commerce.listCollections()).rejects.toMatchObject({code:"CONFLICT"});await expect(commerce.listCollections(admin)).rejects.toMatchObject({code:"CONFLICT"});
    const added:string[]=[];await pool.query("UPDATE collection SET published=false WHERE name LIKE $1",[`${prefix}%`]);
    try{for(let i=0;i<3;i++)added.push(String((await collection(undefined,products.slice(0,300))).row.id));observed.length=0;await expect(commerce.listCollections()).rejects.toMatchObject({code:"CONFLICT"});expect(observed.some(sql=>sql.startsWith("SELECT v.*") || sql.includes("SELECT pi.*"))).toBe(false);}
    finally{await pool.query("UPDATE collection SET published=false WHERE id=ANY($1::uuid[])",[added]);await pool.query("UPDATE collection SET published=true WHERE name LIKE $1",[`${prefix}%`]);}
  });
});
