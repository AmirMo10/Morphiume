// Actual async layout/home/checkout and public shell; controlled server inputs, no DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const fixtures = {
  "server-only": "",
  "@/server/presentation": "export async function getPresentation(){globalThis.__presentationReads++;return globalThis.__presentation}",
  "@/server/config": "export function getConfig(){return {DEPLOYMENT_ENV:'staging'}}",
  "@/server/runtime": "export function getCommerce(){return {resolvePublishedProducts:async(ids)=>{globalThis.__presentationCalls.push({kind:'resolve',ids});return {products:[...globalThis.__products].reverse(),unavailableIds:[]}},listProductsPage:async(input)=>{globalThis.__presentationCalls.push({kind:'page',input});return {items:globalThis.__products.slice(0,4)}}}}",
  "next/navigation": "export function usePathname(){return globalThis.__fixturePath}export function useSearchParams(){return new URLSearchParams()}export function useRouter(){return {}}",
  "next/link": "import React from 'react';export default function Link({children,onClick,...props}){return React.createElement('a',props,children)}",
  "checkout-fixture": "import React from 'react';export function CheckoutContent(){return <section data-checkout-form='mounted'>Controlled checkout form</section>}",
};
const source = `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Home from './src/app/page';import Layout from './src/app/layout';import Checkout from './src/app/checkout/page';export async function renderHome(){return renderToStaticMarkup(await Layout({children:await Home()}))}export async function renderCheckout(){return renderToStaticMarkup(await Layout({children:await Checkout()}))}export async function renderAdmin(){return renderToStaticMarkup(await Layout({children:<main id='main'><h1>مدیریت کنترل‌شده</h1></main>}))}`;
const built = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "controlled-server-inputs", setup(builder) {
  builder.onResolve({ filter: /^(server-only|@\/server\/(runtime|config|presentation)|next\/(navigation|link))$/ }, args => ({ path: args.path, namespace: "fixture" }));
  builder.onResolve({ filter: /^@\/components\/checkout$/ }, () => ({ path: "checkout-fixture", namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: process.cwd() }));
  builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "text" }));
} }] });
const result = { exports: {} }; new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(import.meta.url), result, result.exports);
const defaultValue = { heroTitle: null, heroDescription: null, heroAction: null, banner: null, headerLinks: [{ label: "عطرها", href: "/products" }, { label: "مجموعه‌ها", href: "/collections" }, { label: "راهنمای رایحه", href: "/guide" }], footerLinks: [{ label: "پیگیری سفارش", href: "/account" }], footerText: null, featuredProductIds: [], services: [], maintenance: { enabled: false, message: null }, version: 1, configured: false };
globalThis.__products = Array.from({ length: 12 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, slug: `product-${index}`, name: `محصول کنترل‌شده ${index}`, family: "خانوادهٔ ثبت‌شده", images: [], variants: [{ id: `v-${index}`, sku: `FIXTURE-${index}`, volumeMl: 50, available: 1, price: { amountIrr: "1000000", currency: "IRR" } }] }));
globalThis.__presentationCalls = []; globalThis.__presentationReads = 0; globalThis.__fixturePath = "/"; globalThis.__presentation = defaultValue;
const css = (await readFile("public/brand/tokens.css", "utf8")) + (await readFile("src/styles/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, ""), font = await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const browser = await chromium.launch({ channel: "chrome" }), context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } }), page = await context.newPage();
page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(10000);
const display = async markup => { await page.setContent(markup.replace("<body>", `<head><meta charset="utf-8"><title>آزمون کنترل‌شدهٔ نمایش فروشگاه</title><style>${css}</style></head><body>`)); };
try {
  await page.route("**/*", route => route.request().url().endsWith(".woff2") ? route.fulfill({ contentType: "font/woff2", body: font }) : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="526" height="122"></svg>' }));
  await display(await result.exports.renderHome());
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("رایحه‌ای که انتخاب شماست."); await expect(page.locator(".product-tile")).toHaveCount(4); await expect(page.locator(".hero-copy .button")).toHaveAttribute("href", "/products");
  assert.deepEqual(globalThis.__presentationCalls, [{ kind: "page", input: { page: 1, pageSize: 4, sort: "name" } }]); await expect(page.getByRole("region", { name: "خدمات فروشگاه" })).toHaveCount(0); await expect(page.locator(".approved-contacts")).toHaveCount(0);
  const dangerous = "متن ساده <script>alert('x')</script> & خدمات";
  globalThis.__presentation = { ...defaultValue, configured: true, version: 2, heroTitle: dangerous, heroDescription: "توضیح تأییدشده", heroAction: null, banner: { text: dangerous, link: { label: "کاتالوگ", href: "/products" } }, footerText: dangerous, featuredProductIds: globalThis.__products.map(product => product.id).reverse(), services: [{ title: "خدمت تأییدشده", description: dangerous, enabled: true, link: { label: "اطلاعات خدمت", href: "/pages/approved" } }] };
  const markup = await result.exports.renderHome(); assert.equal(markup.includes("<script>alert"), false); await display(markup);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(dangerous); await expect(page.locator(".hero-copy .button")).toHaveCount(0); await expect(page.locator(".product-tile")).toHaveCount(12);
  assert.deepEqual(await page.locator(".product-tile h3").allTextContents(), globalThis.__products.map(product => product.name).reverse()); await expect(page.getByRole("region", { name: "اطلاعیهٔ فروشگاه" })).toContainText(dangerous); await expect(page.getByRole("region", { name: "خدمات فروشگاه" })).toContainText(dangerous); await expect(page.locator("[style]")).toHaveCount(0);
  const beforeEmpty = globalThis.__presentationCalls.length; globalThis.__presentation = { ...globalThis.__presentation, featuredProductIds: [] }; await display(await result.exports.renderHome()); await expect(page.getByText("در این بخش محصولی برای نمایش نیست.", { exact: true })).toBeVisible(); assert.equal(globalThis.__presentationCalls.length, beforeEmpty);
  globalThis.__presentation = { ...defaultValue, configured: true, maintenance: { enabled: true, message: dangerous } }; globalThis.__fixturePath = "/checkout"; const readsBefore = globalThis.__presentationReads; await display(await result.exports.renderCheckout()); assert.ok(globalThis.__presentationReads > readsBefore); await expect(page.locator("[data-checkout-form]")).toHaveCount(0); await expect(page.getByRole("link", { name: "حساب کاربری و پیگیری سفارش", exact: true }).last()).toHaveAttribute("href", "/account"); await expect(page.getByRole("region", { name: "وضعیت ثبت سفارش" })).toContainText(dangerous);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  // axe itself needs script execution. Audit the same SSR markup in a separate context without app JS.
  const auditContext = await browser.newContext({ viewport: { width: 320, height: 800 } }), auditPage = await auditContext.newPage();
  await auditPage.setContent(await page.content()); const checks = await new AxeBuilder({ page: auditPage }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); assert.deepEqual(checks.violations.filter(item => ["serious", "critical"].includes(item.impact)).map(item => item.id), []); await auditContext.close();
  globalThis.__presentation = {...globalThis.__presentation,maintenance:{enabled:true,message:null}}; await display(await result.exports.renderCheckout()); await expect(page.locator(".maintenance-banner p")).toHaveText("برای پیگیری سفارش‌های ثبت‌شده، به حساب کاربری بروید."); await expect(page.locator(".empty p")).toHaveText("برای پیگیری سفارش‌های ثبت‌شده، به حساب کاربری بروید.");
  globalThis.__fixturePath = "/admin"; await display(await result.exports.renderAdmin()); await expect(page.getByRole("heading", { name: "مدیریت کنترل‌شده" })).toBeVisible(); await expect(page.locator(".maintenance-banner,.store-banner,.site-footer")).toHaveCount(0);
  globalThis.__presentation = defaultValue; globalThis.__fixturePath = "/checkout"; await display(await result.exports.renderCheckout()); await expect(page.locator("[data-checkout-form]")).toHaveCount(1);
  console.log(JSON.stringify({ result: "PASS", scope: "actual async routes/layout/shell; controlled presentation and commerce inputs; JavaScript disabled", checks: ["unconfigured four-item fallback", "ordered twelve-item configured selection", "configured empty makes no catalog request", "plain-text escaping and no inline styles", "fresh checkout route read and withheld form", "account/admin remain accessible", "320px containment and tagged axe"] }));
} finally { for (const key of ["__products", "__presentation", "__presentationCalls", "__presentationReads", "__fixturePath"]) delete globalThis[key]; await browser.close(); }
