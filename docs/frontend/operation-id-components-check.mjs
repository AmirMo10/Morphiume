// Six real consumers on an actual insecure HTTP origin. All API/session/reauth responses are fixtures.
// No running app, private host, native auth, shared DB, checkout provider or worker is contacted.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, webkit, expect } from "@playwright/test";
const money=amountIrr=>({amountIrr,currency:"IRR"}),amount=money("1000000"),zero=money("0");
const ids={order:"00000000-0000-4000-8000-000000000001",variant:"00000000-0000-4000-8000-000000000051",product:"00000000-0000-4000-8000-000000000002",receipt:"00000000-0000-4000-8000-000000000003",refund:"00000000-0000-4000-8000-000000000004",cart:"00000000-0000-4000-8000-000000000005"};
const address={recipient:"گیرندهٔ کنترل‌شده",phone:"+989120000000",province:"تهران",city:"تهران",address:"نشانی فرضی فقط برای fixture",plaque:"۱",unit:"",postalCode:"۱۲۳۴۵۶۷۸۹۰"};
const order={id:ids.order,orderNumber:"CONTROLLED-1",createdAt:"2026-10-12T09:00:00Z",status:"awaiting_payment",paymentStatus:"failed",subtotal:amount,discount:zero,shipping:zero,tax:zero,total:amount,address,policyVersion:"fixture-policy",items:[{name:"محصول کنترل‌شده",sku:"CONTROLLED-50",volumeMl:50,quantity:1,unitPrice:amount,lineTotal:amount}],shipment:null,events:[],returns:[],refunds:[{id:ids.refund,status:"pending",reason:"درخواست کنترل‌شده",amount:money("100000")} ]};
const variant={id:ids.variant,sku:"CONTROLLED-50",productName:"محصول کنترل‌شده",productStatus:"published",active:true,volumeMl:50,productVersion:1,available:5,onHand:5,reserved:0,price:amount};
const cart={id:ids.cart,version:1,couponCode:null,items:[{variantId:ids.variant,productId:ids.product,name:"محصول کنترل‌شده",volumeMl:50,quantity:1,unitPrice:amount,available:5,published:true}],subtotal:amount};
const quote={cartId:ids.cart,cartVersion:1,subtotal:amount,discount:zero,shipping:zero,tax:zero,total:amount,fingerprint:"controlled-fingerprint",policyVersion:"fixture-policy",shippingMethodId:"standard",expiresAt:"2099-01-01T00:00:00Z"};
const viewSource=`import React from 'react';import{CheckoutContent}from'./src/components/checkout';import{OrderDetails}from'./src/components/orders';import{AdminBulk}from'./src/components/admin-bulk';import{AdminInventory}from'./src/components/admin-inventory';import{AdminRefunds}from'./src/components/admin-refunds';import{ManualRefundFailure}from'./src/components/manual-refund-failure';import{CommerceProvider}from'./src/components/commerce-client';
const order=${JSON.stringify(order)};export function View({path}){return <main className="page"><h1>آزمون کنترل‌شدهٔ شناسهٔ عملیات</h1>{path==='/checkout'?<CommerceProvider><CheckoutContent/></CommerceProvider>:path==='/order'?<OrderDetails id={order.id}/>:path==='/bulk'?<AdminBulk/>:path==='/inventory'?<AdminInventory/>:path==='/refund'?<AdminRefunds order={order} onChange={()=>Promise.resolve()}/>:<ManualRefundFailure order={order} onChange={()=>Promise.resolve()}/>}</main>}`;
const mocks={
  "next/link":"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",
  "next/navigation":"export function usePathname(){return '/fixture'}export function useSearchParams(){return new URLSearchParams()}export function useRouter(){return {push(){},replace(){}}}",
  "auth-clients":"const refetch=()=>Promise.resolve();export const customerAuth={useSession(){return {data:{user:{id:'controlled-customer'}},isPending:false,isRefetching:false,error:null,refetch}}};export const adminAuth={};",
  "admin-shell":"const session={user:{id:'controlled-admin'},role:'owner',permissions:['catalog.write','inventory.write','orders.read','orders.fulfill','refunds.write']};export function useAdmin(){return session}export function hasPermission(s,p){return !!s&&s.permissions.includes(p)}",
  "admin-reauth":"import React from 'react';export function AdminReauthentication({onSuccess}){return <button type='button' onClick={()=>onSuccess?.()}>تأیید کنترل‌شدهٔ رمزساز</button>}",
};
const plugins=[{name:"controlled-auth-and-router",setup(builder){builder.onResolve({filter:/^next\/(navigation|link)$|(?:auth-clients|admin-shell|admin-reauth)$/},args=>({path:args.path.startsWith("next/")?args.path:args.path.split("/").at(-1),namespace:"fixture"}));builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"tsx",resolveDir:process.cwd()}));}}];
const browserBuilt=await build({stdin:{contents:viewSource+";import{createRoot}from'react-dom/client';createRoot(document.getElementById('root')).render(<View path={location.pathname}/>);",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins});
// Real consumers also render on the server without reading crypto/window or invoking an action.
const ssrBuilt=await build({stdin:{contents:viewSource+";import{renderToStaticMarkup}from'react-dom/server';export function render(path){return renderToStaticMarkup(<View path={path}/>)}",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins});
const descriptor=Object.getOwnPropertyDescriptor(globalThis,"crypto"),fixtureModule={exports:{}};
try{Object.defineProperty(globalThis,"crypto",{configurable:true,get(){throw new Error("SSR attempted entropy access");}});new Function("require","module","exports",ssrBuilt.outputFiles[0].text)(createRequire(import.meta.url),fixtureModule,fixtureModule.exports);for(const path of ["/checkout","/order","/bulk","/inventory","/refund","/failure"])assert.ok(fixtureModule.exports.render(path).includes("آزمون کنترل‌شده"));}finally{if(descriptor)Object.defineProperty(globalThis,"crypto",descriptor);else delete globalThis.crypto;}
const css=(await readFile("public/brand/tokens.css","utf8"))+(await readFile("src/styles/globals.css","utf8")).replace(/^@import[^\n]*\n/gm,"");const font=await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const keyPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const paths=["/checkout","/order","/bulk","/inventory","/refund","/failure"],results=[];
for(const [engine,launch]of [["Chromium",()=>chromium.launch({channel:"chrome"})],["WebKit",()=>webkit.launch()]]){
  const browser=await launch();try{
    for(const entropy of [true,false]){
      const context=await browser.newContext({viewport:{width:320,height:800}}),page=await context.newPage();page.setDefaultTimeout(10000);const errors=[],writes=[],quoteRequests=[];page.on("pageerror",error=>errors.push(error.message));
      // This manipulates only availability for the failure case. The successful context is unmodified.
      if(!entropy)await context.addInitScript(()=>Object.defineProperty(window,"crypto",{value:undefined,configurable:true}));
      // Full storage denial proves that address saving and key retention do not depend on storage.
      await context.addInitScript(()=>{Storage.prototype.getItem=function(){throw new DOMException("Controlled storage denial","SecurityError")};Storage.prototype.setItem=function(){throw new DOMException("Controlled storage denial","SecurityError")};});
      await page.route("**/*",async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(paths.includes(path))return route.fulfill({contentType:"text/html",body:'<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون کنترل‌شدهٔ شناسه</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'});
        if(path==="/app.js")return route.fulfill({contentType:"application/javascript",body:browserBuilt.outputFiles[0].text});if(path==="/app.css")return route.fulfill({contentType:"text/css",body:css});if(path.endsWith(".woff2"))return route.fulfill({contentType:"font/woff2",body:font});
        if(path==="/api/cart/claim")return route.fulfill({json:{data:cart}});if(path==="/api/cart")return route.fulfill({json:{data:cart}});if(path==="/api/addresses")return route.fulfill({json:{data:[]}});if(path===`/api/orders/${ids.order}`)return route.fulfill({json:{data:order}});if(path==="/api/admin/variants/page")return route.fulfill({json:{data:{items:[variant],page:1,pageSize:24,totalItems:1,totalPages:1}}});if(path==="/api/admin/inventory/ledger")return route.fulfill({json:{data:[]}});if(path.endsWith("/receipts"))return route.fulfill({json:{data:[{id:ids.receipt,provider:"fixture",providerRef:"CONTROLLED-RECEIPT",amount,disposition:"primary",createdAt:order.createdAt}]}});
        if(path==="/api/checkout/quote"){quoteRequests.push(req.postDataJSON());return route.fulfill({json:{data:quote}});}
        if(req.method()==="POST"){
          const body=req.postDataJSON();writes.push({path,body,key:req.headers()["idempotency-key"]??body.operationKey});
          if(path==="/api/admin/bulk"&&body.dryRun)return route.fulfill({json:{data:{dryRun:true,changes:[{variantId:ids.variant,sku:variant.sku,productName:variant.productName,currentPrice:amount,nextPrice:amount,currentStock:5,nextStock:6}]}}});
          return route.fulfill({status:503,json:{error:{code:"NETWORK",message:"پاسخ کنترل‌شدهٔ ثبت عملیات دریافت نشد."}}});
        }
        return route.fulfill({status:404,body:"Controlled operation UUID fixture only"});
      });
      const field=label=>page.locator("input,textarea,select").and(page.getByLabel(label,{exact:true}));
      const fillAddress=async()=>{for(const[key,label]of[["recipient","نام گیرنده"],["phone","شمارهٔ تماس گیرنده"],["province","استان"],["city","شهر"],["address","نشانی کامل"],["plaque","پلاک"],["postalCode","کدپستی ده‌رقمی"]])await field(label).fill(address[key]);};
      const prepare=async path=>{
        if(path==="/checkout"){await fillAddress();return;}
        if(path==="/order"){await expect(page.getByRole("button",{name:"تلاش دوبارهٔ پرداخت همین سفارش",exact:true})).toBeVisible();return;}
        if(path==="/inventory"){await field("محصول و حجم").selectOption(ids.variant);await field("تغییر تعداد").fill("۱");await field("دلیل اصلاح").fill("دلیل کنترل‌شدهٔ موجودی");return;}
        if(path==="/bulk"){await page.getByRole("checkbox",{name:"انتخاب محصول کنترل‌شده، ۵۰ میلی‌لیتر",exact:true}).check();await field("تغییر موجودی CONTROLLED-50").fill("۱");await field("دلیل تغییر گروهی").fill("دلیل کنترل‌شدهٔ گروهی");return;}
        if(path==="/refund"){await field("دریافت پرداخت").selectOption(ids.receipt);await field("مبلغ بازپرداخت (تومان)").fill("۱۰۰۰");await field("دلیل بازپرداخت").fill("دلیل کنترل‌شدهٔ بازپرداخت");return;}
        await field("درخواست برای بررسی عدم انتقال وجه").selectOption(ids.refund);await page.getByRole("radio",{name:"عدم انتقال وجه تأیید شده است.",exact:true}).check();await field("دلیل ثبت عدم انتقال وجه").fill("دلیل کنترل‌شدهٔ عدم انتقال");await field("مدرک قابل پیگیری عدم انتقال وجه").fill("مدرک کنترل‌شدهٔ عدم انتقال قطعی");
      };
      const execute=async path=>{
        if(path==="/checkout"){await page.getByRole("button",{name:"ادامه و انتخاب روش ارسال",exact:true}).click();if(entropy){await page.getByRole("checkbox").check();await page.getByRole("button",{name:"پرداخت ۱۰۰٬۰۰۰ تومان",exact:true}).click();}return;}
        if(path==="/order")return page.getByRole("button",{name:"تلاش دوبارهٔ پرداخت همین سفارش",exact:true}).click();
        if(path==="/inventory")return page.getByRole("button",{name:"ثبت اصلاح موجودی",exact:true}).click();
        if(path==="/bulk")return page.getByRole("button",{name:"پیش‌نمایش تغییرها",exact:true}).click();
        if(path==="/refund"){await page.getByRole("button",{name:"بررسی درخواست بازپرداخت",exact:true}).click();await page.getByRole("button",{name:"تأیید و ثبت",exact:true}).click();return;}
        await page.getByRole("button",{name:"بررسی ثبت عدم انتقال وجه",exact:true}).click();if(entropy){await page.getByRole("dialog").getByRole("button",{name:"تأیید کنترل‌شدهٔ رمزساز",exact:true}).click();await page.getByRole("button",{name:"تأیید و ثبت عدم انتقال وجه",exact:true}).click();}
      };
      for(const path of paths){
        await page.goto(`http://192.0.2.1${path}`);assert.equal(await page.evaluate(()=>isSecureContext),false);if(entropy)assert.equal(await page.evaluate(()=>typeof crypto.randomUUID),"undefined");const before=writes.length,beforeQuotes=quoteRequests.length;await prepare(path);await execute(path);
        if(!entropy){await expect(page.getByText("ایجاد شناسهٔ امن عملیات در این مرورگر ممکن نشد.",{exact:false})).toBeVisible();assert.equal(writes.length,before);assert.equal(quoteRequests.length,beforeQuotes);assert.equal(await page.locator("dialog[open]").count(),0);continue;}
        await expect.poll(()=>writes.length).toBe(before+1);assert.equal(keyPattern.test(writes.at(-1).key),true);const first=writes.at(-1);
        if(path==="/bulk"){
          await page.getByRole("checkbox",{name:"این مقدارهای قبل و بعد را بررسی کرده‌ام.",exact:true}).check();await page.getByRole("button",{name:"ثبت همهٔ تغییرها",exact:true}).click();await expect(page.getByText("پاسخ کنترل‌شدهٔ ثبت عملیات دریافت نشد.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"ثبت همهٔ تغییرها",exact:true}).click();await expect.poll(()=>writes.length).toBe(before+3);assert.equal(writes.at(-1).key,first.key);assert.equal(writes.at(-2).key,first.key);assert.deepEqual(writes.at(-1).body,writes.at(-2).body);await field("دلیل تغییر گروهی").fill("دلیل تازهٔ کنترل‌شده");await execute(path);await expect.poll(()=>writes.length).toBe(before+4);assert.notEqual(writes.at(-1).key,first.key);
        }else{
          await expect(page.getByText("پاسخ کنترل‌شدهٔ ثبت عملیات دریافت نشد.",{exact:true})).toBeVisible();
          if(path==="/checkout")await page.getByRole("button",{name:"بررسی نتیجهٔ ثبت سفارش",exact:true}).click();else if(path==="/failure"){await page.getByRole("button",{name:"تأیید و ثبت عدم انتقال وجه",exact:true}).click();}else await execute(path);
          await expect.poll(()=>writes.length).toBe(before+2);assert.equal(writes.at(-1).key,first.key);assert.deepEqual(writes.at(-1).body,first.body);
          if(path==="/checkout"){await expect(page.getByRole("button",{name:"ویرایش نشانی",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"بررسی نتیجهٔ ثبت سفارش",exact:true})).toBeVisible();}
          if(path==="/inventory"){await field("دلیل اصلاح").fill("دلیل تازهٔ کنترل‌شده");await execute(path);await expect.poll(()=>writes.length).toBe(before+3);assert.notEqual(writes.at(-1).key,first.key);}
          if(path==="/refund"){await field("دلیل بازپرداخت").fill("دلیل تازهٔ کنترل‌شده");await execute(path);await expect.poll(()=>writes.length).toBe(before+3);assert.notEqual(writes.at(-1).key,first.key);}
          if(path==="/failure"){await page.getByRole("button",{name:"بازگشت و اصلاح",exact:true}).click();await field("دلیل ثبت عدم انتقال وجه").fill("دلیل تازهٔ کنترل‌شده");await execute(path);await expect.poll(()=>writes.length).toBe(before+3);assert.notEqual(writes.at(-1).key,first.key);}
        }
      }
      assert.deepEqual(errors,[]);results.push(`${engine}: all six ${entropy?"HTTP fallback/same-key error retry; changed payload rotates key":"missing entropy gives Persian error/no mutation or quote POST"}`);await context.close();
    }
  }finally{await browser.close();}
}
console.log(JSON.stringify({result:"PASS",scope:"six actual components on intercepted insecure HTTP; controlled session/reauth/API only; no real app/auth/DB",checks:["all six SSR-render without browser entropy","checkout with full sessionStorage denial preserves address and same-payload key","bulk preview/commit/error retry key agreement","order payment retry and inventory/refund/failure stable bodies",...results]}));
