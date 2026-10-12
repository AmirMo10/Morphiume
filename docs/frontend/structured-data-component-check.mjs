// Actual product page/JSON-LD renderer; runtime product, config and request headers are fixtures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
const fixtures = {
  "@/server/runtime": "export function getCommerce(){return {getProduct:async()=>globalThis.__structuredProduct}}",
  "@/server/config": "export function getConfig(){return globalThis.__structuredConfig}",
  "next/headers": "export async function headers(){return new Headers({'x-nonce':'controlled-jsonld-nonce'})}",
  "next/navigation": "export function notFound(){throw new Error('fixture NOT_FOUND')}export function permanentRedirect(url){throw new Error('fixture redirect '+url)}",
  "next/link": "import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",
  "@/components/catalog": "import React from 'react';export function ProductView({initialProduct}){return React.createElement('h1',null,initialProduct.name)}",
};
const built = await build({ bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, stdin: { contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import ProductPage from './src/app/products/[id]/page';export {serializeJsonLd} from './src/components/structured-data';export async function render(product,config){globalThis.__structuredProduct=product;globalThis.__structuredConfig=config;return renderToStaticMarkup(await ProductPage({params:Promise.resolve({id:product.slug})}));}`, resolveDir: process.cwd(), loader: "tsx" }, plugins: [{ name: "controlled-server-boundaries", setup(builder) { builder.onResolve({ filter: /^(@\/server\/(runtime|config)|next\/(headers|navigation|link)|@\/components\/catalog)$/ }, args => ({ path: args.path, namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "js", resolveDir: process.cwd() })); } }] });
const result = { exports: {} };
new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(import.meta.url), result, result.exports);
const adversarial = { value: '< & > \u2028\u2029 </script><script>window.__jsonLdInjected=true</script>', literalEscape: "\\u003c" };
const encoded = result.exports.serializeJsonLd(adversarial);
assert.deepEqual(JSON.parse(encoded), adversarial); assert.equal(/[<>&\u2028\u2029]/.test(encoded), false); assert.throws(() => result.exports.serializeJsonLd(undefined));
const product = { id: "controlled-id", slug: "controlled-product", name: `عطر ${adversarial.value}`, description: "متن کنترل‌شده < & >", imageUrl: null, images: [], variants: [{ sku: "CONTROLLED-50", price: { amountIrr: "1000000", currency: "IRR" }, available: 1 }] };
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
try {
  for (const config of [{ APP_BASE_URL: "https://runtime.example.invalid/" }, { APP_BASE_URL: "https://runtime.example.invalid/", PUBLIC_SITE_URL: "https://public.example.invalid/" }]) {
    await page.setContent(await result.exports.render(product, config));
    await expect(page.locator("script")).toHaveCount(2); expect(await page.evaluate(() => window.__jsonLdInjected)).toBeUndefined();
    const data = await page.locator('script[type="application/ld+json"]').evaluateAll(scripts => scripts.map(script => ({ nonce: script.nonce, data: JSON.parse(script.textContent) })));
    expect(data.map(script => script.nonce)).toEqual(["controlled-jsonld-nonce", "controlled-jsonld-nonce"]);
    expect(data[0].data.name).toBe(product.name); expect(data[0].data.description).toBe(product.description);
    expect(data[1].data).toEqual({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "عطرها", item: new URL("/products", config.PUBLIC_SITE_URL ?? config.APP_BASE_URL).toString() }, { "@type": "ListItem", position: 2, name: product.name, item: new URL(`/products/${product.slug}`, config.PUBLIC_SITE_URL ?? config.APP_BASE_URL).toString() }] });
    await expect(page.locator('.breadcrumbs a')).toHaveText(data[1].data.itemListElement[0].name); await expect(page.locator('.breadcrumbs [aria-current="page"]')).toHaveText(data[1].data.itemListElement[1].name);
  }
  console.log(JSON.stringify({ result: "PASS", scope: "actual product page and serializer with controlled server boundaries", checks: ["less-than/literal-escape round-trip", "no script closure or injected script", "nonce on both JSON-LD blocks", "visible two-step breadcrumbs match absolute runtime URLs", "PUBLIC_SITE_URL precedence and APP_BASE_URL fallback"] }));
} finally { delete globalThis.__structuredProduct; delete globalThis.__structuredConfig; await browser.close(); }
