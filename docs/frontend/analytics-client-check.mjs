// Actual helper/entropy implementation. Semantic VM + real insecure-origin network fixtures only.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { chromium, webkit, expect } from "@playwright/test";

const productId="00000000-0000-4000-8000-000000000001", eventId="00000000-0000-4000-8000-000000000002", origin="http://192.0.2.1";
const semantic=await build({entryPoints:["src/components/analytics-client.ts"],bundle:true,write:false,platform:"browser",format:"cjs"});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function client({ssr=false,crypto=webcrypto,status=200,config={data:{captureEnabled:true}},hold=false}={}){
  const calls=[],timers=new Map();let serial=0;const module={exports:{}};
  const context=createContext({module,exports:module.exports,require:createRequire(import.meta.url),crypto,URL,AbortController,DOMException,Uint8Array,console,setTimeout(callback,ms){assert.ok(ms<=1000);timers.set(++serial,callback);return serial;},clearTimeout(id){timers.delete(id);},fetch(path,options){calls.push({path,options});if(hold)return new Promise((_,reject)=>options.signal.addEventListener("abort",()=>reject(new DOMException("Controlled abort","AbortError")),{once:true}));return Promise.resolve({ok:status>=200&&status<300,json:async()=>config});}});
  if(!ssr)context.window={location:{origin}};
  for(const key of ["localStorage","sessionStorage","document"])Object.defineProperty(context,key,{get(){throw new Error("Forbidden helper browser state access");}});
  runInContext(semantic.outputFiles[0].text,context);
  const input=value=>{context.__input=JSON.stringify(value);return runInContext("JSON.parse(__input)",context);};
  return{api:module.exports,calls,timers,input,execute(code){return runInContext(code,context);},expire(){for(const callback of [...timers.values()])callback();}};
}
const summary=[];
const ssr=client({ssr:true});assert.equal(ssr.api.createAnalyticsEventId(),null);assert.equal(ssr.api.captureAnalytics(ssr.input({kind:"product_view",productId})),undefined);assert.equal(ssr.calls.length,0);assert.equal(ssr.timers.size,0);summary.push("SSR import/call reads no browser state or entropy and sends nothing");
const normal=client();assert.equal(normal.api.captureAnalytics(normal.input({kind:"product_view",productId:productId.toUpperCase(),eventId:eventId.toUpperCase()})),undefined);await tick();
assert.equal(normal.calls.length,2);const body=JSON.parse(normal.calls[1].options.body);assert.deepEqual(body,{kind:"product_view",productId,eventId});
assert.ok(Buffer.byteLength(normal.calls[1].options.body)<=1024);
for(const call of normal.calls){assert.equal(new URL(call.path).origin,origin);assert.ok(["/api/analytics/config","/api/analytics/events"].includes(new URL(call.path).pathname));assert.equal(call.options.credentials,"omit");assert.equal(call.options.referrerPolicy,"no-referrer");assert.equal(call.options.cache,"no-store");assert.equal(call.options.mode,"cors");assert.equal(call.options.redirect,"error");assert.ok(call.options.signal);assert.equal(call.options.headers?.Authorization,undefined);}
normal.api.captureAnalytics(normal.input({kind:"search",hasQuery:true,resultBucket:"zero"}));normal.api.captureAnalytics(normal.input({kind:"add_to_cart",productId}));await tick();assert.equal(normal.calls.filter(call=>call.path.endsWith("config")).length,1);assert.equal(normal.calls.filter(call=>call.path.endsWith("events")).length,3);assert.equal(normal.timers.size,0);summary.push("strict scalars/canonical UUID/ASCII1024 boundary; config shared in memory; omit credentials/referrer/no-store");
const denied=client();
for(const input of [{kind:"search",hasQuery:true,resultBucket:"zero",query:"PRIVATE_QUERY_CANARY"},{kind:"product_view",productId,url:"PRIVATE_URL_CANARY"},{kind:"add_to_cart",productId,eventId:"not-a-uuid"},{kind:"payment_verified",productId},{kind:"search",hasQuery:1,resultBucket:"zero"},{kind:"search",hasQuery:true,resultBucket:"11-100"},{kind:"product_view",productId:{value:productId}},[]])denied.api.captureAnalytics(denied.input(input));
// Descriptor tests run in the helper's own realm to avoid an artificial cross-realm prototype.
denied.execute(`globalThis.__getterReads=0;const base={kind:"product_view",productId:"${productId}"};Object.defineProperty(base,"eventId",{enumerable:true,get(){globalThis.__getterReads++;return "${eventId}"}});module.exports.captureAnalytics(base);const symbols={kind:"product_view",productId:"${productId}"};symbols[Symbol("private")]=true;module.exports.captureAnalytics(symbols);const hidden={kind:"product_view",productId:"${productId}"};Object.defineProperty(hidden,"query",{enumerable:false,value:"PRIVATE_QUERY_CANARY"});module.exports.captureAnalytics(hidden);`);
assert.equal(denied.execute("globalThis.__getterReads"),0);
assert.equal(denied.calls.length,0);summary.push("extra/query/URL/forged-server/nested/invalid UUID and bucket inputs fail closed");
const none=client({crypto:{}});assert.equal(none.api.createAnalyticsEventId(),null);none.api.captureAnalytics(none.input({kind:"product_view",productId,eventId}));await tick();assert.equal(none.calls.length,0);
const fallback=client({crypto:{getRandomValues(bytes){return webcrypto.getRandomValues(bytes);}}});const ids=Array.from({length:128},()=>fallback.api.createAnalyticsEventId());assert.equal(new Set(ids).size,128);assert.ok(ids.every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));summary.push("missing entropy drops; getRandomValues insecure-context v4 fallback remains cryptographic");
for(const config of [{data:{captureEnabled:false}},{data:{captureEnabled:"true"}},null]){const sample=client({config});sample.api.captureAnalytics(sample.input({kind:"product_view",productId}));await tick();sample.api.captureAnalytics(sample.input({kind:"product_view",productId}));await tick();assert.equal(sample.calls.length,1);}
const basic=client({status:401});basic.api.captureAnalytics(basic.input({kind:"product_view",productId}));await tick();basic.api.captureAnalytics(basic.input({kind:"product_view",productId}));await tick();assert.equal(basic.calls.length,1);
const hanging=client({hold:true});hanging.api.captureAnalytics(hanging.input({kind:"product_view",productId}));assert.equal(hanging.calls.length,1);hanging.expire();await tick();assert.ok(hanging.calls[0].options.signal.aborted);assert.equal(hanging.calls.length,1);assert.equal(hanging.timers.size,0);summary.push("disabled/malformed/Basic401/config deadline drops with no retry or purchase-facing failure");

const fixtureSource=`import{captureAnalytics,createAnalyticsEventId}from'./src/components/analytics-client';window.__capture=captureAnalytics;window.__id=createAnalyticsEventId;document.getElementById('purchase').onclick=async()=>{const response=await fetch('/fixture-purchase',{method:'POST'});if(response.ok){captureAnalytics({kind:'add_to_cart',productId:'${productId}'});document.getElementById('status').textContent='خرید کنترل‌شده ادامه یافت'}};document.documentElement.dataset.ready='true';`;
const built=await build({stdin:{contents:fixtureSource,resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"browser",format:"iife"});
const html='<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون مشاهدهٔ بی‌نام</title></head><body><main><button id="purchase">خرید کنترل‌شده</button><p id="status" role="status"></p></main><script src="/fixture.js"></script></body></html>';
const browsers=[];
for(const[engine,launch]of[["Chromium",()=>chromium.launch({channel:"chrome"})],["WebKit",()=>webkit.launch()]]){
  const browser=await launch();
  for(const mode of ["enabled","config401","post401","config-held","post-held"]){
    const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[],held=[],failures=[];let delta=0;
    await context.addCookies([{name:"synthetic_customer",value:"PRIVATE_COOKIE_CANARY",url:origin,httpOnly:true}]);
    page.on("pageerror",error=>errors.push(error.message));page.on("requestfailed",request=>{if(new URL(request.url()).pathname.startsWith("/api/analytics/"))failures.push({path:new URL(request.url()).pathname,cancelled:/abort|cancel/i.test(request.failure()?.errorText??"")});});
    await page.addInitScript(()=>{for(const method of["getItem","setItem","removeItem"])Storage.prototype[method]=()=>{throw new Error("Telemetry must not touch storage");};});
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);
      if(url.pathname==="/fixture.js")return route.fulfill({contentType:"application/javascript",body:built.outputFiles[0].text});
      if(url.pathname==="/fixture-purchase"){delta++;return route.fulfill({status:200,json:{ok:true}});}
      if(url.pathname.startsWith("/api/analytics/")){
        requests.push({path:url.pathname,headers:await request.allHeaders(),body:request.postDataJSON(),method:request.method()});
        if((mode==="config-held"&&url.pathname.endsWith("config"))||(mode==="post-held"&&url.pathname.endsWith("events"))){held.push(route);return;}
        if((mode==="config401"&&url.pathname.endsWith("config"))||(mode==="post401"&&url.pathname.endsWith("events")))return route.fulfill({status:401,headers:{"WWW-Authenticate":'Basic realm="controlled-fixture"'},json:{error:{code:"UNAUTHENTICATED"}}});
        return route.fulfill(url.pathname.endsWith("config")?{json:{data:{captureEnabled:true}}}:{status:202,json:{data:{ok:true}}});
      }
      return route.fulfill({contentType:"text/html",body:html});
    });
    try{
      await page.goto(`${origin}/fixture`);await expect(page.locator("html")).toHaveAttribute("data-ready","true");assert.equal(await page.evaluate(()=>window.isSecureContext),false);assert.equal(await page.evaluate(()=>typeof crypto.randomUUID),"undefined");
      await page.getByRole("button",{name:"خرید کنترل‌شده",exact:true}).click();await expect(page.getByText("خرید کنترل‌شده ادامه یافت",{exact:true})).toBeVisible();assert.equal(delta,1);
      await expect.poll(()=>requests.filter(item=>item.path.endsWith("config")).length).toBe(1);
      if(mode!=="config401"&&mode!=="config-held")await expect.poll(()=>requests.filter(item=>item.path.endsWith("events")).length).toBe(1);
      if(mode.endsWith("held")){await expect.poll(()=>failures.length,{timeout:3000}).toBe(1);assert.ok(failures[0].cancelled);assert.equal(delta,1);}
      for(const item of requests){assert.equal(item.headers.cookie,undefined);assert.equal(item.headers.referer,undefined);assert.equal(item.headers.authorization,undefined);if(item.body){assert.deepEqual(Object.keys(item.body).sort(),["eventId","kind","productId"]);assert.equal(item.body.kind,"add_to_cart");assert.match(item.body.eventId,/^[0-9a-f-]{36}$/);assert.equal(item.body.productId,productId);assert.ok(Buffer.byteLength(JSON.stringify(item.body))<=1024);}}
      assert.deepEqual(errors,[]);browsers.push({engine,mode,passed:true,secureContext:false,purchaseDelta:delta,configRequests:requests.filter(item=>item.path.endsWith("config")).length,eventRequests:requests.filter(item=>item.path.endsWith("events")).length,cookieReferrerAuthorizationAbsent:true,pageerrors:0});
    }finally{for(const route of held)await route.fulfill({status:202,json:{data:{ok:true}}}).catch(()=>{});await context.close();}
  }
  await browser.close();
}
console.log(JSON.stringify({result:"PASS",scope:"actual helper/UUID; semantic VM and real insecure HTTP browser fixtures; no app/server/native/PG",summary,browsers},null,2));
