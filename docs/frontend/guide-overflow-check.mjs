// Actual ScentGuide/ProductTile/CSS; router and catalog responses are synthetic.
// No app server, native account, PostgreSQL or external network requests.
import { build } from 'esbuild';
import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const router = `import React from 'react';export function useRouter(){return {replace(){}}}export function usePathname(){return '/guide'}export function useSearchParams(){return new URLSearchParams(location.search)}`;
const link = `import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`;
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{ScentGuide}from'./src/components/guide';createRoot(document.getElementById('root')).render(<main id='main' className='page'><h1>راهنمای انتخاب رایحه</h1><ScentGuide/></main>)`;
const built = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'synthetic-router', setup(b) { b.onResolve({ filter: /^next\/(link|navigation)$/ }, x => ({ path: x.path, namespace: 'controlled' })); b.onLoad({ filter: /.*/, namespace: 'controlled' }, x => ({ contents: x.path === 'next/link' ? link : router, loader: 'js', resolveDir: process.cwd() })); } }] });
const css = await readFile('src/styles/globals.css', 'utf8'), tokens = await readFile('public/brand/tokens.css', 'utf8');
const font = await readFile('public/brand/fonts/Vazirmatn[wght].woff2'), sample = await readFile('public/assets/sample-perfume.svg');
const results = [], baseline = process.argv.includes('--baseline');
for (const [engine, launcher, options] of [['chromium', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
  const browser = await launcher.launch(options);
  try {
    for (const width of [320, 640]) {
      for (const fixture of ['marker', 'unbroken']) {
        const family = fixture === 'marker' ? 'qa-paging-00000000-0000-4000-8000-000000000000-matching' : 'خ'.repeat(80);
        const note = fixture === 'marker' ? 'qa-paging-00000000-0000-4000-8000-000000000000-note' : 'N'.repeat(120);
        const name = fixture === 'marker' ? 'qa-paging-00000000-0000-4000-8000-000000000000 002' : 'M'.repeat(160);
        const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
        const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.name));
        const product = { id: '00000000-0000-4000-8000-000000000001', name, slug: 'controlled-product', family, concentration: 'QA', description: 'Synthetic fixture', shortDescription: '', careInstructions: '', approvedWarnings: '', topNotes: [note], heartNotes: [], baseNotes: [], imageUrl: '/assets/sample-perfume.svg', images: [{url:'/assets/sample-perfume.svg',alt:'تصویر مصنوعی',variantSku:null}], status: 'published', version: 1, variants: [{id:'00000000-0000-4000-8000-000000000002',sku:'QA-50',volumeMl:50,price:{currency:'IRR',amountIrr:'300000'},available:5}] };
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/bundle.js') return route.fulfill({ contentType: 'application/javascript', body: built.outputFiles[0].text });
          if (url.pathname.startsWith('/brand/fonts/')) return route.fulfill({ contentType: 'font/woff2', body: font });
          if (url.pathname === '/assets/sample-perfume.svg') return route.fulfill({ contentType: 'image/svg+xml', body: sample });
          if (url.pathname === '/api/catalog/page') return route.fulfill({ json: { data: {items:[product,{...product,id:'00000000-0000-4000-8000-000000000003'}],page:1,pageSize:24,totalItems:2,totalPages:1,facets:{families:[family],concentrations:['QA'],notes:[note],volumesMl:[50]},facetLimit:100,facetsTruncated:true} } });
          if (url.pathname === '/guide') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="fa" dir="rtl"><head><title>راهنمای انتخاب رایحه</title><style>${tokens}${css.replace(/^@import.*$/gm,'')}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>` });
          return route.fulfill({ status: 404, body: '' });
        });
        await page.goto(`http://controlled.test/guide?family=${encodeURIComponent(family)}&note=${encodeURIComponent(note)}&volume=50`);
        await expect(page.locator('.product-tile')).toHaveCount(2); await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => ({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
        if (!baseline) {
          expect(geometry.overflow).toBe(false); expect(errors).toEqual([]);
          await expect(page.locator('.product-tile').first()).toContainText(name);
          await expect(page.locator('.product-grid > div > .helper').first()).toContainText(family);
          await expect(page.locator('.product-grid > div > .helper').first()).toContainText(note);
          expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
          await page.locator('select').first().focus(); await page.keyboard.press('Tab');
          expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SELECT');
          expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowX)).not.toBe('hidden');
          expect(await page.evaluate(() => getComputedStyle(document.body).overflowX)).not.toBe('hidden');
        }
        results.push({engine,width,fixture,...geometry}); await context.close();
      }
    }
  } finally { await browser.close(); }
}
process.stdout.write(JSON.stringify({mode:baseline?'controlled-baseline':'controlled-acceptance',results})+'\n');
