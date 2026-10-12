// Real content helpers, import parser and product page/view. All server/auth boundaries are fixtures.
// No DB, HTTP server, native authentication, production build or migration is used.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = process.cwd();
const mocks = {
  "@/server/runtime": "export function getCommerce(){return {resolveProductRoute:async()=>({product:globalThis.__contentProduct,canonicalSlug:globalThis.__contentProduct.slug,redirect:false})}}",
  "@/server/config": "export function getConfig(){return {APP_BASE_URL:'https://content.example.invalid/'}}",
  "next/headers": "export async function headers(){return new Headers({'x-nonce':'content-fixture-nonce'})}",
  "next/navigation": "export function notFound(){throw new Error('fixture NOT_FOUND')}export function permanentRedirect(url){throw new Error('fixture redirect '+url)}export function useRouter(){return {replace(){},push(){}}}export function useSearchParams(){return new URLSearchParams()}",
  "next/link": "import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",
  "auth-clients": "export const customerAuth={useSession(){return {data:null,isPending:false}}};export const adminAuth={};",
};
const built = await build({ bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, stdin: { contents: `
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import ProductPage,{generateMetadata} from './src/app/products/[id]/page';
import {CommerceProvider} from './src/components/commerce-client';
export * from './src/components/product-content';export * from './src/components/product-import';
export async function render(product){globalThis.__contentProduct=product;return renderToStaticMarkup(<CommerceProvider>{await ProductPage({params:Promise.resolve({id:product.slug})})}</CommerceProvider>)}
export async function metadata(product){globalThis.__contentProduct=product;return generateMetadata({params:Promise.resolve({id:product.slug})})}
`, resolveDir: root, loader: "tsx" }, plugins: [{ name: "controlled-product-boundaries", setup(builder) {
  builder.onResolve({ filter: /^(@\/server\/(runtime|config)|next\/(headers|navigation|link))$|auth-clients$/ }, args => ({ path: args.path.endsWith("auth-clients") ? "auth-clients" : args.path, namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: root }));
} }] });
const module = { exports: {} }; new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { productContentDraft, productContentFields, validateProductContent, productIntro, productsFromCsv, requiredProductImportColumns, productImportColumns, render, metadata } = module.exports;
assert.deepEqual(productContentDraft({}), {});
assert.deepEqual(productContentDraft({}, {shortDescription:"known"}), {shortDescription:"known"});
assert.deepEqual(productContentDraft({shortDescription:""}, {shortDescription:"known"}), {shortDescription:""});
assert.equal(JSON.stringify(productContentDraft({})), "{}");
for (const {key,maximum} of productContentFields) {
  assert.deepEqual(validateProductContent({[key]:"x".repeat(maximum)}), {});
  assert.deepEqual(validateProductContent({[key]:""}), {});
  assert.equal(Object.hasOwn(validateProductContent({[key]:"x".repeat(maximum+1)}), key), true);
  assert.equal(Object.hasOwn(validateProductContent({[key]:123}), key), true);
  // UTF-16 code units match the actual request/domain cap; emoji count as two.
  assert.equal(Object.hasOwn(validateProductContent({[key]:"😀".repeat(maximum/2)+"x"}), key), true);
}
assert.equal(productIntro({description:"full",shortDescription:" \n "}),"full");
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
const base={name:"عطر آزمون Morphiume",slug:"content-fixture",description:"توضیح کامل آزمون",concentration:"Test concentration",family:"Test family",imageUrl:"/assets/sample-perfume.svg",sku:"FIXTURE-50",volumeMl:"۵۰",priceToman:"۱۰۰٬۰۰۰",initialStock:"۰",topNotes:"",heartNotes:"",baseNotes:""};
const csv=(headers,rows)=>"\uFEFF"+headers.join(",")+"\r\n"+rows.map(row=>headers.map(key=>quote(row[key]??"")).join(",")).join("\r\n");
const old=productsFromCsv(csv(requiredProductImportColumns,[base]));
for(const {key} of productContentFields) assert.equal(Object.hasOwn(old[0],key),false);
assert.deepEqual(old[0].variants,[{sku:"FIXTURE-50",volumeMl:50,priceToman:"100000",initialStock:0}]);
const extra={shortDescription:'A, B "quoted"\nتوضیح کوتاه',careInstructions:"Seller supplied نگهداری",approvedWarnings:"نکات تأییدشدهٔ آزمون"};
const extended=productsFromCsv(csv(productImportColumns,[{...base,...extra},{...base,...extra,sku:"FIXTURE-100",volumeMl:"100"}]));
assert.deepEqual(productContentDraft(extended[0]),extra);assert.equal(extended[0].variants.length,2);
assert.throws(()=>productsFromCsv(csv(productImportColumns,[{...base,...extra},{...base,...extra,sku:"FIXTURE-100",approvedWarnings:"different"}])),/متفاوت/);
assert.throws(()=>productsFromCsv(csv(productImportColumns,[{...base,shortDescription:"x".repeat(601)}])),/۶۰۰/);
assert.throws(()=>productsFromCsv("نام,نامک,وضعیت,توضیح کوتاه\nعطر,fixture,draft,متن"),/فایل خلاصه/);
assert.throws(()=>productsFromCsv(csv([...requiredProductImportColumns,"unexpected"],[base])),/الگوی ورود/);
assert.throws(()=>productsFromCsv(csv([...requiredProductImportColumns,"name"],[base])),/الگوی ورود/);
const injected='Seller < & > </script><script>window.__contentInjected=true</script>\nخط دوم';
const product={id:"00000000-0000-4000-8000-000000000001",...base,...extra,shortDescription:injected,description:"توضیح کامل و تأییدشدهٔ fixture",status:"published",version:4,topNotes:[],heartNotes:[],baseNotes:[],images:[{url:base.imageUrl,alt:"تصویر کنترل‌شدهٔ آزمون",variantSku:null}],variants:[{id:"00000000-0000-4000-8000-000000000051",sku:base.sku,volumeMl:50,price:{amountIrr:"1000000",currency:"IRR"},available:3}]};
assert.equal((await metadata(product)).description,injected.trim().slice(0,180));
assert.equal((await metadata({...product,shortDescription:""})).description,product.description);
assert.equal((await metadata(product)).alternates.canonical,"https://content.example.invalid/products/content-fixture");
const css=(await readFile("public/brand/tokens.css","utf8"))+(await readFile("src/styles/globals.css","utf8")).replace(/^@import[^\n]*\n/gm,"");
const font=await readFile("public/brand/fonts/Vazirmatn[wght].woff2"),sample=await readFile("public/assets/sample-perfume.svg");
const browser=await chromium.launch({channel:"chrome"});const errors=[];
try {
  const html=await render(product);assert.equal(html.includes("&lt;/script&gt;"),true);
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:800}}),page=await context.newPage();
  await page.route("**/*",route=>route.request().url().endsWith(".woff2")?route.fulfill({contentType:"font/woff2",body:font}):route.fulfill({contentType:"image/svg+xml",body:sample}));
  await page.setContent(`<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>محصول کنترل‌شده</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`);
  await expect(page.locator(".product-intro")).toHaveText(injected);await expect(page.locator(".product-intro")).toHaveAttribute("dir","auto");
  await expect(page.getByRole("heading",{name:"توضیح محصول",exact:true})).toHaveCount(1);await expect(page.getByRole("heading",{name:"راهنمای نگهداری",exact:true})).toHaveCount(1);await expect(page.getByRole("heading",{name:"نکات و هشدارهای محصول",exact:true})).toHaveCount(1);
  await expect(page.locator(".notes-section p")).toHaveText([product.description,extra.careInstructions,extra.approvedWarnings]);
  await expect(page.locator("script")).toHaveCount(2);await expect(page.locator("[style]")).toHaveCount(0);
  await context.close();
  // Axe needs JavaScript, but this document has only SSR markup; no application bundle is loaded.
  const accessibleContext=await browser.newContext({viewport:{width:320,height:800}}),accessible=await accessibleContext.newPage();accessible.on("pageerror",error=>errors.push(error.message));
  await accessible.route("**/*",route=>route.request().url().endsWith(".woff2")?route.fulfill({contentType:"font/woff2",body:font}):route.fulfill({contentType:"image/svg+xml",body:sample}));
  await accessible.setContent(`<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>محصول کنترل‌شده</title><style>${css}</style></head><body>${html}</body></html>`);
  assert.equal(await accessible.evaluate(()=>window.__contentInjected),undefined);assert.equal(await accessible.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const axe=await new AxeBuilder({page:accessible}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();assert.deepEqual(axe.violations.filter(issue=>["serious","critical"].includes(issue.impact)).map(issue=>issue.id),[]);
  const blank={...product,shortDescription:"",careInstructions:" \n ",approvedWarnings:""};delete blank.shortDescription;
  await accessible.setContent(`<html lang="fa" dir="rtl"><head><title>محصول قدیمی کنترل‌شده</title><style>${css}</style></head><body>${await render(blank)}</body></html>`);
  await expect(accessible.locator(".product-intro")).toHaveText(product.description);await expect(accessible.locator(".notes-section")).toHaveCount(0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:"PASS",scope:"real helper/parser/product page+view SSR; controlled server/auth DTO; no DB/native or runtime HTTP",checks:["optional absent/explicit blank/fallback semantics and UTF16 caps600/4000/4000","old13-column and optional16-column create CSV, quoted newline/comma, consistent variants","wrong summary/unknown/duplicate header and oversize rejection","runtime canonical metadata short/full fallback","real no-JS SSR intro/full/care/warnings and plain escaping","blank legacy content full text once","320 containment/tagged axe/no inline attributes or injected script"]}));
}finally{delete globalThis.__contentProduct;await browser.close();}
