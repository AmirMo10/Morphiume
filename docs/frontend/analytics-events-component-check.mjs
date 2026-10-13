// Actual catalog/product/commerce/native client and helper. All HTTP is synthetic/intercepted.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { chromium, webkit, expect } from "@playwright/test";

const origin="http://192.0.2.1",productId="00000000-0000-4000-8000-000000000011",otherId="00000000-0000-4000-8000-000000000012",variantId="00000000-0000-4000-8000-000000000051";
const price={amountIrr:"1000000",currency:"IRR"},zero={amountIrr:"0",currency:"IRR"};
const product={id:productId,name:"محصول کنترل‌شده الف",slug:"controlled-a",description:"توضیح مصنوعی آزمون",shortDescription:"",careInstructions:"",approvedWarnings:"",family:"",concentration:"",topNotes:[],heartNotes:[],baseNotes:[],imageUrl:null,images:[],status:"published",version:1,variants:[{id:variantId,sku:"CONTROLLED-50",volumeMl:50,price,available:8},{id:"00000000-0000-4000-8000-000000000052",sku:"CONTROLLED-100",volumeMl:100,price,available:8}]};
const other={...product,id:otherId,name:"محصول کنترل‌شده ب",slug:"controlled-b"};
const navigation=`import React from'react';const listeners=new Set(),notify=()=>listeners.forEach(fn=>fn()),router={replace(url){history.replaceState(null,'',url);notify()},push(url){history.pushState(null,'',url);notify()}};const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};export function useRouter(){return router}export function usePathname(){return React.useSyncExternalStore(subscribe,()=>location.pathname,()=>'/products/controlled-a')}export function useSearchParams(){return new URLSearchParams(React.useSyncExternalStore(subscribe,()=>location.search,()=>''))}`;
const link="import React from'react';import{useRouter}from'next/navigation';export default function Link({href,children,...props}){const router=useRouter();return React.createElement('a',{...props,href,onClick(event){event.preventDefault();router.push(href)}},children)}";
const routerPlugin={name:"navigation-only",setup(builder){builder.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:"fixture"}));builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="next/link"?link:navigation,loader:"js",resolveDir:process.cwd()}));}};
const source=`import React,{StrictMode,useState}from'react';import{createRoot}from'react-dom/client';import{usePathname,useRouter}from'next/navigation';import{CommerceProvider,useCommerce}from'./src/components/commerce-client';import{useCustomerSession}from'./src/components/customer-session';import{ProductView,Catalog}from'./src/components/catalog';const a=${JSON.stringify(product)},b=${JSON.stringify(other)};function Probe(){const identity=useCustomerSession(),commerce=useCommerce();window.__nativeCheck=identity.revalidate;window.__scope={pending:identity.pending,owner:identity.ownerId,ready:commerce.ready};return null}function App(){const path=usePathname(),router=useRouter(),[revision,setRevision]=useState(0);window.__navigate=router.push;window.__refreshProduct=()=>setRevision(value=>value+1);const selected=path==='/products/controlled-b'?b:a;return <CommerceProvider><main className='page'><Probe/>{path==='/products'?<><h1>کاتالوگ کنترل‌شده</h1><Catalog/></>:path==='/products/missing'?<ProductView id='missing' observe/>:<ProductView key={selected.id} id={selected.id} initialProduct={{...selected,version:selected.version+revision}} observe={path!=='/private-preview'}/>}</main></CommerceProvider>}createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);`;
const built=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins:[routerPlugin]});
// Actual canonical SSR route, with explicitly controlled public resolver/config/Next interrupt shims.
const ssrSource=`import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{CommerceProvider}from'./src/components/commerce-client';import ProductPage from'./src/app/products/[id]/page';export async function render(id){const tree=await ProductPage({params:Promise.resolve({id})});const observed=tree.props.children.find(child=>child?.props?.initialProduct)?.props.observe;return{observed,html:renderToStaticMarkup(<CommerceProvider>{tree}</CommerceProvider>)}}`;
const ssr=await build({stdin:{contents:ssrSource,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins:[{name:"controlled-server-only",setup(builder){
  builder.onResolve({filter:/^next\/(headers|navigation|link)$|^@\/server\/(runtime|config)$/},args=>({path:args.path,namespace:"controlled-server"}));
  builder.onLoad({filter:/.*/,namespace:"controlled-server"},args=>({contents:args.path==="next/headers"?"export async function headers(){return new Headers({'x-nonce':'controlled-nonce'})}":args.path==="next/navigation"?"export function notFound(){throw new Error('CONTROLLED_NOT_FOUND')}export function permanentRedirect(path){throw new Error('CONTROLLED_REDIRECT:'+path)}export function useRouter(){return{}}export function useSearchParams(){return new URLSearchParams()}":args.path==="next/link"?"import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}":args.path==="@/server/config"?`export function getConfig(){return {APP_BASE_URL:'${origin}'}}`:`import{CommerceError}from'./src/contracts/commerce';export function getCommerce(){return{async resolveProductRoute(id){if(id==='missing')throw new CommerceError('NOT_FOUND','controlled');return{product:${JSON.stringify(product)},canonicalSlug:'controlled-a',redirect:id==='old-a'}}}}`,loader:"js",resolveDir:process.cwd()}));
}}]});
const module={exports:{}};let ssrCalls=0;runInNewContext(ssr.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),console,process,Buffer,URL,URLSearchParams,Request,Response,Headers,TextEncoder,TextDecoder,AbortController,queueMicrotask,setTimeout,clearTimeout,setImmediate,clearImmediate,ReadableStream,fetch(){ssrCalls++;throw new Error("No SSR network");}});
const canonical=await module.exports.render("controlled-a");assert.equal(canonical.observed,true);assert.ok(canonical.html.includes(product.name));assert.equal(ssrCalls,0);await assert.rejects(()=>module.exports.render("old-a"),/CONTROLLED_REDIRECT:\/products\/controlled-a/);await assert.rejects(()=>module.exports.render("missing"),/CONTROLLED_NOT_FOUND/);
const css=(await readFile("public/brand/tokens.css","utf8"))+(await readFile("src/styles/globals.css","utf8")).replace(/^@import[^\n]*\n/gm,""),font=await readFile("public/brand/fonts/Vazirmatn[wght].woff2"),mark=await readFile("public/brand/morphiume-mark.svg");
const html='<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون رخداد کنترل‌شده</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const results=[{case:"canonical-SSR-opt-in-alias-missing-interrupt-controls",passed:true,SSRtransport:0}];
for(const[engine,launch]of[["Chromium",()=>chromium.launch({channel:"chrome"})],["WebKit",()=>webkit.launch()]]){
  const browser=await launch();
  async function fixture({initialActor=null,capture=true}={}){
    const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);
    let actor=initialActor,quantity=0,version=1,holdAdd=false,addFailure=false,readFailure=false,holdCatalog=false,catalogFailure=false,totalItems=12;
    const events=[],errors=[],heldAdds=[],heldCatalog=[],catalogQueries=[],configRequests=[],nativeRequests=[];
    const cart=()=>({id:actor==="B"?"00000000-0000-4000-8000-000000000099":"00000000-0000-4000-8000-000000000098",version,couponCode:null,subtotal:quantity?price:zero,items:quantity&&actor!=="B"?[{variantId,productId,name:product.name,volumeMl:50,quantity,unitPrice:price,available:8,published:true}]:[]});
    const native=()=>actor?{user:{id:`controlled-${actor}`,name:"حساب کنترل‌شده",email:"fixture@example.invalid",phoneNumber:"+989120000000",phoneNumberVerified:true,emailVerified:false,createdAt:"2026-10-12T09:00:00Z",updatedAt:"2026-10-12T09:00:00Z"},session:{id:`controlled-session-${actor}`,userId:`controlled-${actor}`,expiresAt:"2099-01-01T00:00:00Z",createdAt:"2026-10-12T09:00:00Z",updatedAt:"2026-10-12T09:00:00Z"}}:null;
    page.on("pageerror",error=>errors.push(error.message));
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;assert.equal(url.origin,origin);
      if(path==="/fixture.js")return route.fulfill({contentType:"application/javascript",body:built.outputFiles[0].text});if(path==="/fixture.css")return route.fulfill({contentType:"text/css",body:css});if(path.endsWith(".woff2"))return route.fulfill({contentType:"font/woff2",body:font});if(path==="/brand/morphiume-mark.svg")return route.fulfill({contentType:"image/svg+xml",body:mark});
      if(path==="/api/analytics/config"){configRequests.push(request);return route.fulfill({json:{data:{captureEnabled:capture}}});}
      if(path==="/api/analytics/events"){events.push({body:request.postDataJSON(),headers:await request.allHeaders()});return route.fulfill({status:202,json:{data:{ok:true}}});}
      if(path==="/api/auth/get-session"){nativeRequests.push(path);return route.fulfill({json:native()});}
      if(path==="/api/cart"&&request.method()==="POST"){
        if(addFailure)return route.fulfill({status:409,json:{error:{code:"OUT_OF_STOCK",message:"افزودن کنترل‌شده پذیرفته نشد."}}});quantity++;version++;if(holdAdd){heldAdds.push(route);return;}return route.fulfill({json:{data:cart()}});
      }
      if(path==="/api/cart"&&request.method()==="GET")return readFailure?route.fulfill({status:503,json:{error:{code:"NETWORK",message:"بازخوانی کنترل‌شده انجام نشد."}}}):route.fulfill({json:{data:cart()}});
      if(path==="/api/cart/claim")return route.fulfill({json:{data:cart()}});
      if(path==="/api/wishlist")return route.fulfill({json:{data:[]}});
      if(path==="/api/products/missing")return route.fulfill({status:404,json:{error:{code:"NOT_FOUND",message:"محصول کنترل‌شده موجود نیست."}}});
      if(path==="/api/catalog/page"){
        catalogQueries.push(Object.fromEntries(url.searchParams));const data={items:totalItems?[product]:[],page:Number(url.searchParams.get("page")??1),pageSize:24,totalItems,totalPages:totalItems?Math.ceil(totalItems/24):0,facets:{families:[],concentrations:[],volumesMl:[50,100],notes:[]},facetLimit:100,facetsTruncated:false};
        if(catalogFailure)return route.fulfill({status:400,json:{error:{code:"VALIDATION",message:"نتیجهٔ کنترل‌شده دریافت نشد."}}});if(holdCatalog){heldCatalog.push({route,data});return;}return route.fulfill({json:{data}});
      }
      assert.ok(!path.startsWith("/api/"),`Unexpected controlled boundary ${path}`);return route.fulfill({contentType:"text/html",body:html});
    });
    const releaseAdds=async()=>{holdAdd=false;for(const route of heldAdds.splice(0))await route.fulfill({json:{data:cart()}}).catch(()=>{});};
    const releaseCatalog=async()=>{holdCatalog=false;for(const item of heldCatalog.splice(0))await item.route.fulfill({json:{data:item.data}}).catch(()=>{});};
    return{context,page,events,errors,configRequests,catalogQueries,heldAdds,heldCatalog,releaseAdds,releaseCatalog,quantity:()=>quantity,setActor(value){actor=value;},holdAdds(){holdAdd=true;},failAdd(value){addFailure=value;},failRead(value){readFailure=value;},catalog(value){totalItems=value;},holdCatalog(){holdCatalog=true;},failCatalog(value){catalogFailure=value;}};
  }
  const count=(sample,kind)=>sample.events.filter(event=>event.body.kind===kind).length;
  try{
    const productSample=await fixture();
    try{
      await productSample.page.goto(`${origin}/products/controlled-a`);await expect.poll(()=>count(productSample,"product_view")).toBe(1);assert.equal(await productSample.page.evaluate(()=>isSecureContext),false);
      await productSample.page.locator('.volume-picker input[type="radio"]').nth(1).check();await productSample.page.evaluate(()=>window.__refreshProduct());await expect(productSample.page.getByRole("button",{name:"افزودن به سبد خرید",exact:true})).toBeEnabled();assert.equal(count(productSample,"product_view"),1);
      productSample.holdAdds();await productSample.page.getByRole("button",{name:"افزودن به سبد خرید",exact:true}).click();await expect.poll(()=>productSample.heldAdds.length).toBe(1);assert.equal(count(productSample,"add_to_cart"),0);await productSample.page.locator(".purchase-panel button.full-width").dispatchEvent("click");assert.equal(productSample.quantity(),1);productSample.failRead(true);await productSample.releaseAdds();await expect(productSample.page.locator(".purchase-panel").getByText("محصول به سبد خرید افزوده شد.",{exact:false})).toBeVisible();await expect.poll(()=>count(productSample,"add_to_cart")).toBe(1);await expect(productSample.page.getByText("کالا به سبد افزوده شد؛ سبد تازه دریافت نشد.",{exact:false})).toBeVisible();assert.equal(productSample.quantity(),1);
      productSample.failRead(false);await productSample.page.evaluate(()=>window.__navigate('/products/controlled-b'));await expect.poll(()=>count(productSample,"product_view")).toBe(2);await productSample.page.evaluate(()=>window.__navigate('/products/controlled-a'));await expect.poll(()=>count(productSample,"product_view")).toBe(3);
      assert.equal(new Set(productSample.events.map(event=>event.body.eventId)).size,productSample.events.length);assert.deepEqual(productSample.errors,[]);results.push({engine,case:"strict-canonical-render-volume-content-navigation-one-add-after200-refresh-failure",passed:true,views:3,additions:1,cartDelta:1});
    }finally{await productSample.releaseAdds();await productSample.context.close();}

    for(const scenario of["failed-add","late-A-B","disabled"]){
      const sample=await fixture({initialActor:scenario==="late-A-B"?"A":null,capture:scenario!=="disabled"});
      try{
        await sample.page.goto(`${origin}/products/controlled-a`);const add=sample.page.getByRole("button",{name:"افزودن به سبد خرید",exact:true});await expect(add).toBeEnabled();
        if(scenario==="failed-add"){sample.failAdd(true);await add.click();await expect(sample.page.getByText("افزودن کنترل‌شده پذیرفته نشد.",{exact:true})).toBeVisible();assert.equal(sample.quantity(),0);}
        else if(scenario==="late-A-B"){sample.holdAdds();await add.click();await expect.poll(()=>sample.heldAdds.length).toBe(1);sample.setActor("B");await sample.page.evaluate(()=>window.__nativeCheck());await expect.poll(()=>sample.page.evaluate(()=>window.__scope.owner)).toBe("controlled-B");await expect.poll(()=>sample.page.evaluate(()=>window.__scope.ready)).toBe(true);await sample.releaseAdds();await expect(sample.page.locator(".purchase-panel").getByText("محصول به سبد خرید افزوده شد.",{exact:false})).toHaveCount(0);assert.equal(sample.quantity(),1);}
        else{await add.click();await expect(sample.page.locator(".purchase-panel").getByText("محصول به سبد خرید افزوده شد.",{exact:false})).toBeVisible();assert.equal(sample.quantity(),1);assert.equal(sample.events.length,0);}
        assert.equal(count(sample,"add_to_cart"),0);assert.deepEqual(sample.errors,[]);results.push({engine,case:scenario,passed:true,addEvents:0,cartDelta:sample.quantity()});
      }finally{await sample.releaseAdds();await sample.context.close();}
    }

    const privateSample=await fixture();try{await privateSample.page.goto(`${origin}/private-preview`);await expect(privateSample.page.getByRole("heading",{name:product.name,exact:true})).toBeVisible();assert.equal(privateSample.events.length,0);assert.equal(privateSample.configRequests.length,0);await privateSample.page.evaluate(()=>window.__navigate('/products/missing'));await expect(privateSample.page.getByRole("alert")).toContainText("محصول کنترل‌شده موجود نیست.");assert.equal(privateSample.events.length,0);assert.deepEqual(privateSample.errors,[]);results.push({engine,case:"private-preview-and-failed-product-no-view",passed:true});}finally{await privateSample.context.close();}

    const search=await fixture();
    try{
      search.catalog(0);
      await search.page.goto(`${origin}/products`);await expect(search.page.locator(".result-bar")).toBeVisible();assert.equal(search.events.length,0);assert.equal(search.configRequests.length,0);
      const submit=async text=>{await search.page.getByLabel("جست‌وجوی عطر",{exact:true}).fill(text);await search.page.getByRole("button",{name:"جست‌وجو",exact:true}).click();};
      for(const[total,bucket,text]of[[0,"zero",""],[10,"1_10","PRIVATE_SEARCH_WORDS_A"],[11,"11_100","PRIVATE_SEARCH_WORDS_B"],[101,"over_100","PRIVATE_SEARCH_WORDS_C"]]){const before=count(search,"search");search.catalog(total);await submit(text);await expect.poll(()=>count(search,"search")).toBe(before+1);const payload=search.events.at(-1).body;assert.equal(payload.resultBucket,bucket);assert.equal(payload.hasQuery,!!text);assert.deepEqual(Object.keys(payload).sort(),["eventId","hasQuery","kind","resultBucket"]);}
      const completed=count(search,"search");await search.page.getByRole("combobox",{name:/مرتب‌سازی/}).selectOption("price_asc");await expect(search.page.locator(".result-bar")).toBeVisible();assert.equal(count(search,"search"),completed);
      await search.page.getByLabel("حداقل قیمت (تومان)",{exact:true}).fill("200");await search.page.getByLabel("حداکثر قیمت (تومان)",{exact:true}).fill("100");await search.page.getByRole("button",{name:"جست‌وجو",exact:true}).click();await expect(search.page.getByText("بازهٔ قیمت را بررسی کنید؛ مقدارهای واردشده حفظ شده‌اند.",{exact:true})).toBeVisible();assert.equal(count(search,"search"),completed);await search.page.getByLabel("حداقل قیمت (تومان)",{exact:true}).fill("");await search.page.getByLabel("حداکثر قیمت (تومان)",{exact:true}).fill("");
      search.failCatalog(true);await submit("PRIVATE_FAILED_SEARCH");await expect(search.page.getByRole("alert")).toContainText("نتیجهٔ کنترل‌شده دریافت نشد.");assert.equal(count(search,"search"),completed);search.failCatalog(false);await search.page.getByRole("button",{name:"تلاش دوباره",exact:true}).click();await expect.poll(()=>count(search,"search")).toBe(completed+1);
      search.holdCatalog();await submit("PRIVATE_SUPERSEDED_SEARCH");await expect.poll(()=>search.heldCatalog.length).toBe(1);const beforeSuperseded=count(search,"search");await submit("PRIVATE_CURRENT_SEARCH");await expect.poll(()=>search.heldCatalog.length).toBe(2);const newest=search.heldCatalog.pop();await newest.route.fulfill({json:{data:newest.data}});await expect.poll(()=>count(search,"search")).toBe(beforeSuperseded+1);await search.releaseCatalog();assert.equal(count(search,"search"),beforeSuperseded+1);
      for(const event of search.events){assert.equal(event.headers.cookie,undefined);assert.equal(event.headers.referer,undefined);assert.equal(event.headers.authorization,undefined);assert.ok(!JSON.stringify(event.body).includes("PRIVATE_"));assert.ok(Buffer.byteLength(JSON.stringify(event.body))<=1024);}
      assert.deepEqual(search.errors,[]);results.push({engine,case:"completed-search-four-buckets-no-typing-filter-invalid-failed-stale-events",passed:true,searchEvents:count(search,"search"),anonymousScalarsOnly:true});
    }finally{await search.releaseCatalog();await search.context.close();}
  }finally{await browser.close();}
}
console.log(JSON.stringify({result:"PASS",scope:"actual canonical SSR route/catalog/product/commerce/native library; intercepted HTTP only; no actual server/native-auth/PG",results},null,2));
