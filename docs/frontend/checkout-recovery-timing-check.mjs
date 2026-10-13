// Actual Checkout/Commerce/native client. Pin the published parent key as an in-memory baseline.
// Every route is synthetic/intercepted; no running app, native-auth server or PG.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, webkit, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const origin="http://192.0.2.1",oldCart="00000000-0000-4000-8000-000000000098",newCart="00000000-0000-4000-8000-000000000099",key="00000000-0000-4000-8000-000000000088";
const input={cartId:oldCart,cartVersion:1,address:{recipient:"گیرندهٔ کنترل‌شده",phone:"+989120000000",province:"تهران",city:"تهران",address:"نشانی مصنوعی",plaque:"1",postalCode:"0123456789"},shippingMethodId:"standard",quoteFingerprint:"controlled-original",policyVersion:"controlled-policy"};
const record={version:2,kind:"pending",ownerId:"controlled-A",cartId:oldCart,key,input};
const baselineRevision="5cf694c5ed97272851ad32685fed3abd5634f005",baseline=(await promisify(execFile)("git",["show",`${baselineRevision}:src/components/checkout.tsx`],{cwd:process.cwd(),maxBuffer:1024*1024})).stdout;
assert.ok(baseline.includes('key={`${identity.generation}:${continuityCartId ?? "loading"}`}'));
const navigation="export function useRouter(){return{}}export function useSearchParams(){return new URLSearchParams()}";
const source=`import React from'react';import{createRoot}from'react-dom/client';import{CommerceProvider,useCommerce}from'./src/components/commerce-client';import{CheckoutContent}from'./src/components/checkout';import{useCustomerSession}from'./src/components/customer-session';import{saveCheckoutRecovery,loadCheckoutRecovery}from'./src/components/cart-lifecycle';if(!new URL(location.href).searchParams.has('normal'))saveCheckoutRecovery(${JSON.stringify(record)});function Probe(){const identity=useCustomerSession(),commerce=useCommerce();window.__nativeCheck=identity.revalidate;window.__refreshCart=commerce.refreshCart;window.__readRecovery=()=>identity.ownerId?loadCheckoutRecovery(identity.ownerId):null;window.__scope={owner:identity.ownerId,pending:identity.pending,ready:commerce.ready,continuity:commerce.continuityCartId};return null}createRoot(document.getElementById('root')).render(<CommerceProvider><main className='page'><h1>بازیابی کنترل‌شده</h1><Probe/><CheckoutContent/></main></CommerceProvider>);`;
async function fixtureBuild(restoreBaseline=false){return build({stdin:{contents:source,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins:[{name:"navigation-only",setup(builder){builder.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:"fixture"}));builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="next/link"?"import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}":navigation,loader:"js",resolveDir:process.cwd()}));if(restoreBaseline)builder.onLoad({filter:/[/\\]src[/\\]components[/\\]checkout\.tsx$/},()=>({contents:baseline,loader:"tsx",resolveDir:`${process.cwd()}/src/components`}));}}]});}
const built=await fixtureBuild(process.argv.includes("--baseline"));
const css=(await readFile("public/brand/tokens.css","utf8"))+(await readFile("src/styles/globals.css","utf8")).replace(/^@import[^\n]*\n/gm,""),font=await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const html='<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>بازیابی کنترل‌شده</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const results=[];
for(const[engine,launch]of[["Chromium",()=>chromium.launch({channel:"chrome"})],["WebKit",()=>webkit.launch()]]){
  const browser=await launch();
  for(const mode of["pre-dispatch","held-response","conflict-retry","owner-revoked","normal-cart-reset"]){
    if(process.argv.includes("--baseline")&&!["pre-dispatch","held-response"].includes(mode))continue;
    const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);let actor="A",pauseCart=true,currentCart=mode==="normal-cart-reset"?oldCart:newCart,checkoutStatus=mode==="conflict-retry"?409:201;
    const heldCarts=[],heldCheckouts=[],heldQuotes=[],checkoutRequests=[],quoteRequests=[],errors=[];
    const native=()=>({user:{id:`controlled-${actor}`,name:"حساب کنترل‌شده",email:"fixture@example.invalid",phoneNumber:"+989120000000",phoneNumberVerified:true,emailVerified:false,createdAt:"2026-10-12T09:00:00Z",updatedAt:"2026-10-12T09:00:00Z"},session:{id:`native-${actor}`,userId:`controlled-${actor}`,expiresAt:"2099-01-01T00:00:00Z",createdAt:"2026-10-12T09:00:00Z",updatedAt:"2026-10-12T09:00:00Z"}});
    const cart=()=>({id:currentCart,version:5,couponCode:null,items:mode==="normal-cart-reset"?[{variantId:"00000000-0000-4000-8000-000000000051",productId:"00000000-0000-4000-8000-000000000011",name:"محصول کنترل‌شده",volumeMl:50,quantity:1,unitPrice:{amountIrr:"1000000",currency:"IRR"},available:8,published:true}]:[],subtotal:{amountIrr:mode==="normal-cart-reset"?"1000000":"0",currency:"IRR"}});
    const checkout=()=>checkoutStatus===409?{status:409,json:{error:{code:"CONFLICT",message:"تعارض کنترل‌شده؛ نتیجه هنوز نامعلوم است."}}}:{status:201,json:{data:{orderId:"controlled-order",paymentAttemptId:"controlled-attempt",paymentStatus:"pending",redirectUrl:"/controlled-result"}}};
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(mode=>{const original=window.fetch;window.__checkoutFetches=[];window.__quoteFetches=[];window.__releaseDispatch=()=>{};window.fetch=(resource,options)=>{const url=new URL(typeof resource==="string"?resource:resource.url,location.href);if(!["/api/checkout","/api/checkout/quote"].includes(url.pathname))return original(resource,options);const item={aborted:options.signal.aborted};(url.pathname.endsWith("quote")?window.__quoteFetches:window.__checkoutFetches).push(item);options.signal.addEventListener("abort",()=>{item.aborted=true},{once:true});if(mode==="pre-dispatch")return new Promise(resolve=>{window.__releaseDispatch=resolve}).then(()=>original(resource,options));return original(resource,options);};},mode);
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;assert.equal(url.origin,origin);
      if(path==="/fixture.js")return route.fulfill({contentType:"application/javascript",body:built.outputFiles[0].text});if(path==="/fixture.css")return route.fulfill({contentType:"text/css",body:css});if(path.endsWith(".woff2"))return route.fulfill({contentType:"font/woff2",body:font});
      if(path==="/api/auth/get-session")return route.fulfill({json:native()});
      if(path==="/api/cart"){if(pauseCart){heldCarts.push(route);return;}return route.fulfill({json:{data:cart()}});}
      if(path==="/api/cart/claim")return route.fulfill({json:{data:cart()}});
      if(path==="/api/addresses")return route.fulfill({json:{data:[]}});
      if(path==="/api/checkout/quote"){quoteRequests.push(request.postDataJSON());heldQuotes.push(route);return;}
      if(path==="/api/checkout"){checkoutRequests.push({key:request.headers()["idempotency-key"],body:request.postDataJSON()});heldCheckouts.push(route);return;}
      if(path==="/controlled-result")return route.fulfill({contentType:"text/html",body:'<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>نتیجهٔ کنترل‌شده</title></head><body><main><h1>نتیجهٔ همان سفارش کنترل‌شده</h1></main></body></html>'});
      assert.ok(!path.startsWith("/api/"),`Unexpected controlled boundary ${path}`);return route.fulfill({contentType:"text/html",body:html});
    });
    const releaseCarts=async()=>{pauseCart=false;for(const route of heldCarts.splice(0))await route.fulfill({json:{data:cart()}}).catch(()=>{});};
    const releaseCheckouts=async()=>{for(const route of heldCheckouts.splice(0))await route.fulfill(checkout()).catch(()=>{});};
    const releaseQuotes=async()=>{for(const route of heldQuotes.splice(0)){const money={amountIrr:"1000000",currency:"IRR"},zero={amountIrr:"0",currency:"IRR"};await route.fulfill({json:{data:{cartId:oldCart,cartVersion:5,subtotal:money,discount:zero,shipping:zero,tax:zero,total:money,fingerprint:"controlled-old-quote",policyVersion:"controlled-policy",shippingMethodId:"standard",expiresAt:"2099-01-01T00:00:00Z"}}}).catch(()=>{});}};
    try{
      if(mode==="normal-cart-reset"){
        await page.goto(`${origin}/checkout?normal=1`);await expect.poll(()=>heldCarts.length).toBeGreaterThan(0);await releaseCarts();
        for(const[label,value]of[["نام گیرنده",input.address.recipient],["شمارهٔ تماس گیرنده",input.address.phone],["استان",input.address.province],["شهر",input.address.city],["نشانی کامل",input.address.address],["پلاک",input.address.plaque],["کدپستی ده‌رقمی",input.address.postalCode]])await page.getByLabel(label,{exact:true}).fill(value);
        await page.getByRole("button",{name:"ادامه و انتخاب روش ارسال",exact:true}).click();await expect.poll(()=>heldQuotes.length).toBe(1);assert.equal(quoteRequests[0].cartId,oldCart);
        currentCart=newCart;await page.evaluate(()=>window.__refreshCart());await expect.poll(()=>page.evaluate(()=>window.__scope.continuity)).toBe(newCart);await expect.poll(()=>page.evaluate(()=>window.__quoteFetches[0].aborted)).toBe(true);
        await expect(page.getByRole("heading",{name:"گیرنده و نشانی",exact:true})).toBeVisible();await expect(page.getByLabel("نام گیرنده",{exact:true})).toHaveValue("");await releaseQuotes();await expect(page.getByRole("button",{name:/^پرداخت/})).toHaveCount(0);assert.equal(checkoutRequests.length,0);assert.deepEqual(errors,[]);results.push({engine,case:mode,passed:true,cartScopedQuoteAborted:true,addressReset:true,oldPaymentControlAbsent:true,httpPosts:0});continue;
      }
      await page.goto(`${origin}/checkout`);const retry=page.getByRole("button",{name:"بررسی نتیجهٔ ثبت سفارش",exact:true});await expect(retry).toBeEnabled();await expect.poll(()=>heldCarts.length).toBeGreaterThan(0);assert.equal(await page.evaluate(()=>window.__scope.continuity),null);assert.equal(await page.evaluate(()=>window.__scope.ready),false);
      const button=await retry.elementHandle();await retry.click();await expect.poll(()=>page.evaluate(()=>window.__checkoutFetches.length)).toBe(1);
      if(mode!=="pre-dispatch")await expect.poll(()=>checkoutRequests.length).toBe(1);
      if(mode==="owner-revoked"){actor="B";await page.evaluate(()=>window.__nativeCheck());await expect.poll(()=>page.evaluate(()=>window.__scope.owner)).toBe("controlled-B");await expect.poll(()=>page.evaluate(()=>window.__checkoutFetches[0].aborted)).toBe(true);await releaseCarts();await releaseCheckouts();assert.equal(new URL(page.url()).pathname,"/checkout");await expect(page.getByText("نتیجهٔ ثبت سفارش هنوز دریافت نشده است.",{exact:true})).toHaveCount(0);assert.equal(await page.evaluate(()=>window.__readRecovery()),null);}
      else{
        await releaseCarts();await expect.poll(()=>page.evaluate(()=>window.__scope.continuity)).toBe(newCart);await expect.poll(()=>page.evaluate(()=>window.__scope.ready)).toBe(true);
        if(process.argv.includes("--baseline")){
          assert.equal(await button.evaluate(element=>element.isConnected),false);await expect.poll(()=>page.evaluate(()=>window.__checkoutFetches[0].aborted)).toBe(true);await page.evaluate(()=>window.__releaseDispatch());await releaseCheckouts();assert.equal(checkoutRequests.length,mode==="pre-dispatch"?0:1);assert.equal(new URL(page.url()).pathname,"/checkout");await expect(retry).toBeEnabled();assert.equal((await page.evaluate(()=>window.__readRecovery())).kind,"pending");results.push({engine,case:`baseline-${mode}`,reproduced:true,cartContinuityRemount:true,requestAborted:true,httpPosts:checkoutRequests.length});continue;
        }
        assert.equal(await button.evaluate(element=>element.isConnected),true);assert.equal(await page.evaluate(()=>window.__checkoutFetches[0].aborted),false);await page.evaluate(()=>window.__releaseDispatch());await expect.poll(()=>checkoutRequests.length).toBe(1);await releaseCheckouts();
        if(mode==="conflict-retry"){await expect(retry).toBeEnabled();await expect(page.getByRole("alert")).toContainText("تعارض کنترل‌شده");assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(window.__readRecovery()))),record);checkoutStatus=201;await retry.click();await expect.poll(()=>checkoutRequests.length).toBe(2);await releaseCheckouts();}
        await expect(page.getByRole("heading",{name:"نتیجهٔ همان سفارش کنترل‌شده",exact:true})).toBeVisible();const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("morphiume-checkout-recovery-v2")));assert.equal(stored.kind,"known");assert.equal(stored.key,key);assert.equal(stored.orderId,"controlled-order");assert.equal(Object.hasOwn(stored,"input"),false);assert.equal(Object.hasOwn(stored,"address"),false);
      }
      for(const request of checkoutRequests){assert.equal(request.key,key);assert.deepEqual(request.body,input);}assert.deepEqual(errors,[]);results.push({engine,case:mode,passed:true,httpPosts:checkoutRequests.length,originalKeyPayload:true,scopeRevocationAborts:mode==="owner-revoked"});
    }finally{await releaseCarts();await releaseCheckouts();await releaseQuotes();await context.close();}
  }
  await browser.close();
}
console.log(JSON.stringify({scope:"actual checkout/commerce/native library; intercepted synthetic network/dispatch timing; no app/native-server/PG or original CI cause claim",baselineRevision,results},null,2));
