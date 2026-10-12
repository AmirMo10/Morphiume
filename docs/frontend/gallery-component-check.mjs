// Isolated component regression. API responses are controlled fixtures; this is not a DB/E2E test.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// The same installed loader resolves the shared TypeScript helper used by both server and client.
const require = createRequire(import.meta.url);
await import("tsx/esm");
const { productImages, imagesForVariant, isProductImageUrl } = require("../../src/components/product-images.ts");
expect(productImages({ name: "Legacy test", imageUrl: "/assets/sample-perfume.svg", images: [] })).toEqual([{ url: "/assets/sample-perfume.svg", alt: "Legacy test", variantSku: null }]);
expect(imagesForVariant({ name: "Volume test", imageUrl: "/assets/sample-perfume.svg", images: [{ url: "/assets/sample-perfume.svg", alt: "50ml only", variantSku: "TEST-50" }] }, "TEST-100")).toEqual([]);
expect(isProductImageUrl("https://external.example/image.webp")).toBe(false);

const root = process.cwd();
const fixture = {
  id: "00000000-0000-4000-8000-000000000001", name: "محصول کنترل‌شدهٔ آزمون", slug: "gallery-component-test", description: "توضیح اولیهٔ آزمون", concentration: "نمونهٔ آزمون", family: "نمونهٔ آزمون", topNotes: [], heartNotes: [], baseNotes: [],
  status: "draft", version: 4,
  imageUrl: "/media/00000000-0000-4000-8000-000000000011.webp",
  images: [{ url: "/media/00000000-0000-4000-8000-000000000011.webp", alt: "تصویر عمومی آزمون", variantSku: null }],
  variants: [{ id: "00000000-0000-4000-8000-000000000051", sku: "TEST-50", volumeMl: 50, price: { amountIrr: "1000000", currency: "IRR" }, available: 3 }, { id: "00000000-0000-4000-8000-000000000101", sku: "TEST-100", volumeMl: 100, price: { amountIrr: "2000000", currency: "IRR" }, available: 3 }]
};
const entry = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProductEditor} from './src/components/admin-products';
import {ProductGallery} from './src/components/product-gallery';
const fixture=${JSON.stringify(fixture)};
function GalleryFixture(){const [sku,setSku]=useState('TEST-50'); return <><label htmlFor="test-sku">حجم آزمون</label><select id="test-sku" value={sku} onChange={e=>setSku(e.target.value)}><option>TEST-50</option><option>TEST-100</option></select><ProductGallery product={window.__publicProduct??fixture} variantSku={sku} eager/></>}
const render=()=>createRoot(document.getElementById('root')).render(location.pathname==='/gallery'?<GalleryFixture/>:<ProductEditor id={fixture.id}/>); render();`;
const built = await build({ stdin: { contents: entry, resolveDir: root, sourcefile: "gallery-check.tsx", loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "isolated-next-router", setup(builder) {
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "test-next" }));
  builder.onLoad({ filter: /.*/, namespace: "test-next" }, args => ({ contents: args.path === "next/link" ? "import React from 'react';export default function Link(props){return React.createElement('a',props,props.children)}" : "export function useSearchParams(){return new URLSearchParams(location.search)}export function useRouter(){return {push(value){window.__navigation=value},replace(value){window.__navigation=value}}}", loader: "js", resolveDir: root }));
} }] });
const bundle = built.outputFiles[0].text;
const tokens = await readFile("public/brand/tokens.css", "utf8");
const css = (await readFile("src/styles/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, "");
const sample = await readFile("public/assets/sample-perfume.svg");
const font = await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 320, height: 760 } });
let current = structuredClone(fixture);
let submitted;
let pendingUpload;
let uploadStarted;
const startSignal = new Promise(resolve => { uploadStarted = resolve; });
const pages = [];
try {
  await page.route("**/*", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/" || path === "/gallery") return route.fulfill({ contentType: "text/html", body: `<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><main class="page"><div id="root"></div></main><script src="/app.js"></script></body></html>` });
    if (path === "/app.js") return route.fulfill({ contentType: "application/javascript", body: bundle });
    if (path === "/app.css") return route.fulfill({ contentType: "text/css", body: tokens + css });
    if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: font });
    if (path === "/api/admin/media") { pendingUpload = route; uploadStarted(); return; }
    if (path === `/api/admin/products/${fixture.id}` && request.method() === "GET") return route.fulfill({ json: { data: current } });
    if (path === `/api/admin/products/${fixture.id}` && request.method() === "PATCH") { submitted = request.postDataJSON(); current = { ...current, ...submitted, version: current.version + 1, variants: fixture.variants }; return route.fulfill({ json: { data: current } }); }
    if (path.endsWith("/publish")) { current = { ...current, status: "published", version: current.version + 1 }; return route.fulfill({ json: { data: current } }); }
    if (path.endsWith("/archive")) { current = { ...current, status: "archived", version: current.version + 1 }; return route.fulfill({ json: { data: current } }); }
    if (path.startsWith("/media/") || path.endsWith(".svg")) return route.fulfill({ contentType: "image/svg+xml", body: sample });
    return route.fulfill({ status: 404, body: "Controlled fixture only" });
  });
  await page.goto("https://gallery.test/");
  await expect(page.getByLabel("نام محصول", { exact: true })).toHaveValue(fixture.name);
  await page.getByLabel("بارگذاری تصویر واقعی محصول").setInputFiles({ name: "controlled-test.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71]) });
  await startSignal;
  await page.getByLabel("توضیح محصول", { exact: true }).fill("ویرایش هم‌زمان با بارگذاری باقی می‌ماند.");
  await expect(page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true })).toBeDisabled();
  await pendingUpload.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000012", url: "/media/00000000-0000-4000-8000-000000000012.webp", width: 640, height: 800 } } });
  await expect(page.getByLabel("توضیح تصویر ۲", { exact: true })).toBeVisible();
  await expect(page.getByLabel("توضیح محصول", { exact: true })).toHaveValue("ویرایش هم‌زمان با بارگذاری باقی می‌ماند.");
  await page.getByLabel("توضیح تصویر ۲", { exact: true }).fill("تصویر حجم پنجاه آزمون");
  await page.getByLabel("حجم مرتبط با تصویر ۲", { exact: true }).selectOption("TEST-50");
  await page.getByRole("button", { name: "تصویر ۲؛ انتقال به جایگاه قبل", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("توضیح تصویر ۱", { exact: true })).toBeFocused();
  await expect(page.getByLabel("توضیح تصویر ۱", { exact: true })).toHaveValue("تصویر حجم پنجاه آزمون");
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
  await expect(page.getByText("تغییرات محصول ذخیره شد.", { exact: true })).toBeVisible();
  expect(submitted.description).toBe("ویرایش هم‌زمان با بارگذاری باقی می‌ماند.");
  expect(submitted.expectedVersion).toBe(4);
  expect(submitted.images.map(image => [image.alt, image.variantSku])).toEqual([["تصویر حجم پنجاه آزمون", "TEST-50"], ["تصویر عمومی آزمون", null]]);
  await page.getByRole("button", { name: "انتشار محصول", exact: true }).click();
  await expect(page.getByText("محصول منتشر شد.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "حذف تصویر ۲ از گالری", exact: true }).click();
  await page.getByRole("button", { name: "حذف تصویر ۱ از گالری", exact: true }).click();
  await page.getByLabel("توضیح محصول", { exact: true }).fill("");
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
  await expect(page.locator("#product-error-images")).toContainText("ابتدا محصول را بایگانی کنید");
  await page.getByRole("button", { name: "بایگانی محصول", exact: true }).click();
  await expect(page.getByText("ویرایش‌های ذخیره‌نشدهٔ فرم حفظ می‌شوند؛ پس از بایگانی، آن‌ها را جداگانه ذخیره کنید.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "تأیید بایگانی", exact: true }).click();
  await expect(page.getByText("محصول بایگانی شد.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("توضیح محصول", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
  await expect(page.getByText("تغییرات محصول ذخیره شد.", { exact: true })).toBeVisible();
  expect(submitted.images).toEqual([]);
  expect(submitted.description).toBe("");
  await page.getByText("افزودن تصویر پردازش‌شده با نشانی", { exact: true }).click();
  for (let index = 0; index < 10; index++) {
    await page.getByLabel("نشانی تصویر پردازش‌شده", { exact: true }).fill(`/media/00000000-0000-4000-8000-${String(index + 21).padStart(12, "0")}.webp`);
    await page.getByLabel("توضیح تصویر جدید", { exact: true }).fill(`تصویر کنترل‌شدهٔ ${index + 1}`);
    await page.getByRole("button", { name: "افزودن تصویر به گالری", exact: true }).click();
  }
  await expect(page.getByLabel("بارگذاری تصویر واقعی محصول")).toBeDisabled();
  await expect(page.getByRole("button", { name: "افزودن تصویر به گالری", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "حذف تصویر ۱۰ از گالری", exact: true }).click();
  await expect(page.getByLabel("بارگذاری تصویر واقعی محصول")).toBeEnabled();
  expect(await page.locator("[style]").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const publicImages = [{ url: fixture.imageUrl, alt: "تصویر عمومی آزمون", variantSku: null }, { url: "/media/00000000-0000-4000-8000-000000000012.webp", alt: "تصویر حجم پنجاه آزمون", variantSku: "TEST-50" }, { url: "/media/00000000-0000-4000-8000-000000000013.webp", alt: "تصویر حجم صد آزمون", variantSku: "TEST-100" }];
  await page.addInitScript(product => { window.__publicProduct = product; }, { ...fixture, images: publicImages });
  await page.goto("https://gallery.test/gallery");
  await expect(page.locator(".product-image > img")).toHaveAttribute("alt", "تصویر حجم پنجاه آزمون");
  await expect(page.getByRole("button", { name: "تصویر ۱: تصویر حجم پنجاه آزمون", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /تصویر حجم صد آزمون/ })).toHaveCount(0);
  await page.getByRole("button", { name: "تصویر ۲: تصویر عمومی آزمون", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".product-image > img")).toHaveAttribute("alt", "تصویر عمومی آزمون");
  await page.getByLabel("حجم آزمون", { exact: true }).selectOption("TEST-100");
  await expect(page.locator(".product-image > img")).toHaveAttribute("alt", "تصویر حجم صد آزمون");
  await expect(page.getByRole("button", { name: /تصویر حجم پنجاه آزمون/ })).toHaveCount(0);
  expect(await page.locator("[style]").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  pages.push("admin upload/state/alt/SKU/reorder/save/published-clear/archive, public keyboard selection/volume isolation, 320px containment, no inline style attrs");
  console.log(JSON.stringify({ result: "PASS", scope: "isolated Chromium component fixture; mocked API and Next router", checks: pages }));
} finally { await browser.close(); }
