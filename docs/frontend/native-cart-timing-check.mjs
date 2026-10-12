// Diagnostic only: actual installed Better Auth React client/plugins and actual FE components.
// Every HTTP response is intercepted at a synthetic insecure origin. No app/native server or DB.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { chromium, webkit, expect } from "@playwright/test";

const origin = "http://192.0.2.1";
const ids = { cart: "00000000-0000-4000-8000-000000000001", product: "00000000-0000-4000-8000-000000000002", variant: "00000000-0000-4000-8000-000000000051" };
const amount = { amountIrr: "1000000", currency: "IRR" }, zero = { amountIrr: "0", currency: "IRR" };
const product = { id: ids.product, name: "محصول کنترل‌شده", slug: "native-timing-fixture", description: "متن مصنوعی آزمون", shortDescription: "", careInstructions: "", approvedWarnings: "", family: "", concentration: "", topNotes: [], heartNotes: [], baseNotes: [], imageUrl: null, images: [], status: "published", version: 1, variants: [{ id: ids.variant, sku: "FIXTURE-50", volumeMl: 50, price: amount, available: 8 }] };
const item = { variantId: ids.variant, productId: ids.product, name: product.name, volumeMl: 50, quantity: 1, unitPrice: amount, available: 8, published: true };
const navigation = "import React from 'react';const listeners=new Set();const notify=()=>listeners.forEach(f=>f());export function usePathname(){return React.useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>location.pathname,()=>'/')}export function useSearchParams(){return new URLSearchParams(location.search)}export function useRouter(){return{push(url){history.pushState({},'',url);notify()},replace(url){history.replaceState({},'',url);notify()}}}";
const source = `import React from 'react';import{createRoot}from'react-dom/client';import{usePathname}from'next/navigation';import{CommerceProvider,useCommerce}from'./src/components/commerce-client';import{ProductView}from'./src/components/catalog';import{CheckoutContent}from'./src/components/checkout';import{useCustomerSession}from'./src/components/customer-session';const fixture=${JSON.stringify(product)};function Probe(){const identity=useCustomerSession(),commerce=useCommerce();window.__nativeCheck=identity.revalidate;window.__scope={pending:identity.pending,owner:!!identity.ownerId,ready:commerce.ready,quantity:commerce.cart?.items.reduce((n,i)=>n+i.quantity,0)??0};return <p role="status">آزمون زمان‌بندی کنترل‌شده</p>}function App(){const path=usePathname();return <CommerceProvider><main className="page"><Probe/>{path.startsWith('/checkout')?<CheckoutContent/>:<ProductView id={fixture.id} initialProduct={fixture}/>}</main></CommerceProvider>}createRoot(document.getElementById('root')).render(<App/>);`;
// Pin the pre-fix component for repeatable diagnosis after the corrected source is committed.
// All other modules use the current source; this is a component comparison, not an old app image.
const baselineRevision = "6130f4ed7ec090344a5a4a1937a65ef04572975b";
const baselineCatalog = (await promisify(execFile)("git", ["show", `${baselineRevision}:src/components/catalog.tsx`], { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).stdout;
assert.ok(baselineCatalog.includes("await refreshCart(); setAdded(true);"), "Baseline source must contain the classified pre-fix handler");
async function buildFixture(baseline = false) { return build({ stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "controlled-router-only", setup(builder) {
  // auth-clients is deliberately NOT intercepted: use the actual installed native library.
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture-router" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture-router" }, args => ({ contents: args.path === "next/navigation" ? navigation : "import React from 'react';import{useRouter}from'next/navigation';export default function Link({href,onClick,children,...props}){const router=useRouter();return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();router.push(href)}}}>{children}</a>}", loader: "tsx", resolveDir: process.cwd() }));
  if (baseline) builder.onLoad({ filter: /[/\\]src[/\\]components[/\\]catalog\.tsx$/ }, () => ({ contents: baselineCatalog, loader: "tsx", resolveDir: `${process.cwd()}/src/components` }));
} }] }); }
const built = await buildFixture(), baselineBuilt = await buildFixture(true);
const css = (await readFile("public/brand/tokens.css", "utf8")) + (await readFile("src/styles/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, "");
const font = await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const document = '<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون کنترل‌شدهٔ زمان‌بندی حساب</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const results = [];
const serverBuilt = await build({ stdin: { contents: `import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{CommerceProvider}from'./src/components/commerce-client';import{ProductView}from'./src/components/catalog';export function render(){return renderToStaticMarkup(<CommerceProvider><ProductView id='${ids.product}' initialProduct={${JSON.stringify(product)}}/></CommerceProvider>);}`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "SSR-router-only", setup(builder) {
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "SSR-router" }));
  builder.onLoad({ filter: /.*/, namespace: "SSR-router" }, args => ({ contents: args.path === "next/link" ? "import React from 'react';export default function Link(props){return React.createElement('a',props)}" : "export function useRouter(){return{}}export function useSearchParams(){return new URLSearchParams()}", loader: "js", resolveDir: process.cwd() }));
} }] });
const serverModule = { exports: {} }; let serverRequests = 0;
runInNewContext(serverBuilt.outputFiles[0].text, { module: serverModule, exports: serverModule.exports, require: createRequire(import.meta.url), process, console, Buffer, URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder, AbortController, queueMicrotask, setTimeout, clearTimeout, setImmediate, clearImmediate, ReadableStream, fetch() { serverRequests++; throw new Error("SSR transport is forbidden"); } });
const serverHtml = serverModule.exports.render();
assert.match(serverHtml, /<button[^>]*disabled[^>]*>افزودن به سبد خرید<\/button>/u);
assert.equal(/ style=| onclick=/u.test(serverHtml), false);
assert.equal(serverRequests, 0);
results.push({ case: "actual-native-ProductView-SSR", passed: true, transportCalls: 0, pendingAddDisabled: true, windowAvailable: false });
for (const [engine, launch] of [["Chromium", () => chromium.launch({ channel: "chrome" })], ["WebKit", () => webkit.launch()]]) {
  const browser = await launch();
  async function fixture({ holdNative = false, withItem = false, baseline = false, initialActor = null } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
    page.setDefaultTimeout(10000);
    let actor = initialActor, claimed = false, holdSession = holdNative, holdCartRead = false, holdAdd = false;
    let cart = { id: ids.cart, version: 1, couponCode: null, items: withItem ? [structuredClone(item)] : [], subtotal: withItem ? amount : zero };
    const heldSessions = [], heldCarts = [], heldAdds = [], events = [], errors = [], quotes = [];
    const record = (kind, detail = {}) => events.push({ index: events.length, kind, ...detail });
    const nativeSession = () => actor ? { user: { id: `controlled-customer-${actor}`, name: "مشتری کنترل‌شده", phoneNumber: "+989120000000", phoneNumberVerified: true, email: "fixture@example.invalid", emailVerified: false, createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" }, session: { id: `controlled-session-${actor}`, userId: `controlled-customer-${actor}`, expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" } } : null;
    const currentCart = () => actor === "B" ? { ...cart, id: "00000000-0000-4000-8000-000000000099", items: [], subtotal: zero } : cart;
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      assert.equal(url.origin, origin, "All fixture requests remain on the synthetic origin");
      if (path === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: (baseline ? baselineBuilt : built).outputFiles[0].text });
      if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
      if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: font });
      if (path === "/api/auth/get-session") {
        record("native-session-request", { fresh: url.searchParams.get("disableCookieCache") === "true" });
        if (holdSession) { heldSessions.push(route); return; }
        record("native-session-response", { signedIn: !!actor }); return route.fulfill({ json: nativeSession() });
      }
      if (path === "/api/auth/phone-number/send-otp") { record("native-otp-send-response"); return route.fulfill({ json: { message: "Controlled code sent" } }); }
      if (path === "/api/auth/phone-number/verify") { actor = "A"; record("native-otp-verify-response"); return route.fulfill({ json: { status: true, user: nativeSession().user } }); }
      if (path === "/api/cart" && request.method() === "POST") { cart = { ...cart, version: cart.version + 1, items: [structuredClone(item)], subtotal: amount }; record("cart-add-commit", { status: 200 }); if (holdAdd) { heldAdds.push(route); return; } record("cart-add-response", { status: 200 }); return route.fulfill({ json: { data: cart } }); }
      if (path === "/api/cart" && request.method() === "GET") { record("cart-read-request"); if (holdCartRead) { heldCarts.push(route); return; } record("cart-read-response", { status: 200 }); return route.fulfill({ json: { data: currentCart() } }); }
      if (path === "/api/cart/claim") { const input = request.postDataJSON(); assert.ok(actor); if (!claimed && actor === "A") { assert.equal(input.expectedVersion, cart.version); cart = { ...cart, version: cart.version + 1 }; claimed = true; } record("cart-claim-response", { status: 200 }); return route.fulfill({ json: { data: currentCart() } }); }
      if (path === "/api/checkout/quote") { assert.equal(claimed, true); quotes.push(request.postDataJSON()); record("quote-response", { status: 200 }); return route.fulfill({ json: { data: { cartId: cart.id, cartVersion: cart.version, subtotal: amount, discount: zero, shipping: zero, tax: zero, total: amount, fingerprint: `controlled-${cart.version}`, policyVersion: "controlled-policy", shippingMethodId: "standard", expiresAt: "2099-01-01T00:00:00.000Z" } } }); }
      if (path === "/api/wishlist" || path === "/api/addresses") return route.fulfill({ json: { data: [] } });
      if (path.startsWith("/api/")) throw new Error(`Unexpected controlled boundary: ${request.method()} ${path}`);
      return route.fulfill({ contentType: "text/html", body: document });
    });
    const releaseSessions = async () => { holdSession = false; for (const route of heldSessions.splice(0)) { record("native-held-response", { signedIn: !!actor }); await route.fulfill({ json: nativeSession() }).catch(() => {}); } };
    const releaseCarts = async () => { holdCartRead = false; for (const route of heldCarts.splice(0)) { record("cart-held-response", { status: 200 }); await route.fulfill({ json: { data: currentCart() } }).catch(() => {}); } };
    const releaseAdds = async (status = 200) => { holdAdd = false; for (const route of heldAdds.splice(0)) { record("cart-add-response", { status }); await route.fulfill({ status, json: status === 200 ? { data: cart } : { error: { code: "CONTROLLED", message: "LATE_ACTOR_ERROR" } } }).catch(() => {}); } };
    return { context, page, events, errors, quotes, heldSessions, heldCarts, heldAdds, releaseSessions, releaseCarts, releaseAdds, setActor(value) { actor = value; }, holdAdds(value) { holdAdd = value; }, holdSessions(value) { holdSession = value; }, holdCarts(value) { holdCartRead = value; } };
  }
  try {
    const pending = await fixture({ holdNative: true, baseline: true });
    try {
      await pending.page.goto(`${origin}/products/fixture`);
      assert.equal(await pending.page.evaluate(() => isSecureContext), false);
      await expect.poll(() => pending.heldSessions.length).toBeGreaterThan(0);
      const add = pending.page.getByRole("button", { name: "افزودن به سبد خرید", exact: true });
      await expect(add).toBeEnabled(); await add.click();
      await expect(pending.page.getByText("ابتدا بررسی حساب را کامل کنید.", { exact: true })).toBeVisible();
      assert.equal(pending.events.filter(e => e.kind === "cart-add-response").length, 1);
      await expect(pending.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false })).toHaveCount(0);
      await pending.releaseSessions(); await expect.poll(() => pending.page.evaluate(() => window.__scope?.ready)).toBe(true);
      assert.equal(await pending.page.evaluate(() => window.__scope?.quantity), 1);
      await expect(pending.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false })).toHaveCount(0);
      assert.deepEqual(pending.errors, []);
      results.push({ engine, case: "baseline-pending-add", reproduced: true, errorCategory: "local-refresh-UNAUTHENTICATED-after-POST200", nativeClient: "actual-installed", responses: "synthetic-only", events: pending.events });
    } finally { await pending.releaseSessions(); await pending.context.close(); }

    const baselineInterrupted = await fixture({ baseline: true });
    try {
      await baselineInterrupted.page.goto(`${origin}/products/fixture`); await expect.poll(() => baselineInterrupted.page.evaluate(() => window.__scope?.ready)).toBe(true);
      baselineInterrupted.holdCarts(true); await baselineInterrupted.page.getByRole("button", { name: "افزودن به سبد خرید", exact: true }).click();
      await expect.poll(() => baselineInterrupted.heldCarts.length).toBeGreaterThan(0);
      baselineInterrupted.holdSessions(true); await baselineInterrupted.page.evaluate(() => { void window.__nativeCheck(); });
      await expect.poll(() => baselineInterrupted.page.evaluate(() => window.__scope?.pending)).toBe(true);
      await baselineInterrupted.releaseCarts(); await baselineInterrupted.releaseSessions();
      await expect.poll(() => baselineInterrupted.page.evaluate(() => window.__scope?.ready && window.__scope?.quantity === 1)).toBe(true);
      await expect(baselineInterrupted.page.getByRole("alert")).toBeVisible();
      await expect(baselineInterrupted.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false })).toHaveCount(0);
      assert.equal(baselineInterrupted.events.filter(e => e.kind === "cart-add-commit").length, 1); assert.deepEqual(baselineInterrupted.errors, []);
      results.push({ engine, case: "baseline-committed-add-interrupted-read", reproduced: true, errorCategory: "superseded-cart-read-after-POST200", events: baselineInterrupted.events });
    } finally { await baselineInterrupted.releaseSessions(); await baselineInterrupted.releaseCarts(); await baselineInterrupted.context.close(); }

    const guarded = await fixture({ holdNative: true });
    try {
      await guarded.page.goto(`${origin}/products/fixture`); await expect.poll(() => guarded.heldSessions.length).toBeGreaterThan(0);
      const add = guarded.page.getByRole("button", { name: "افزودن به سبد خرید", exact: true });
      await expect(add).toBeDisabled(); await add.evaluate(button => button.click());
      assert.equal(guarded.events.filter(e => e.kind === "cart-add-commit").length, 0);
      await guarded.releaseSessions(); await expect(add).toBeEnabled(); await add.click();
      await expect(guarded.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false }).first()).toBeVisible();
      await expect.poll(() => guarded.page.evaluate(() => window.__scope?.quantity)).toBe(1);
      assert.equal(guarded.events.filter(e => e.kind === "cart-add-commit").length, 1); assert.deepEqual(guarded.errors, []);
      results.push({ engine, case: "fixed-pending-gate-one-add", passed: true, events: guarded.events });
    } finally { await guarded.releaseSessions(); await guarded.context.close(); }

    const interrupted = await fixture();
    try {
      await interrupted.page.goto(`${origin}/products/fixture`); await expect.poll(() => interrupted.page.evaluate(() => window.__scope?.ready)).toBe(true);
      interrupted.holdCarts(true); await interrupted.page.getByRole("button", { name: "افزودن به سبد خرید", exact: true }).click();
      await expect.poll(() => interrupted.heldCarts.length).toBeGreaterThan(0);
      await expect(interrupted.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false }).first()).toBeVisible();
      interrupted.holdSessions(true); await interrupted.page.evaluate(() => { void window.__nativeCheck(); });
      await expect.poll(() => interrupted.page.evaluate(() => window.__scope?.pending)).toBe(true);
      await interrupted.releaseCarts(); await interrupted.releaseSessions();
      await expect.poll(() => interrupted.page.evaluate(() => window.__scope?.ready)).toBe(true);
      await expect(interrupted.page.getByText("کالا به سبد افزوده شد؛ سبد تازه دریافت نشد. سبد خرید را بررسی کنید.", { exact: true })).toBeVisible();
      await expect.poll(() => interrupted.page.evaluate(() => window.__scope?.ready && window.__scope?.quantity === 1)).toBe(true);
      assert.equal(interrupted.events.filter(e => e.kind === "cart-add-commit").length, 1); assert.deepEqual(interrupted.errors, []);
      results.push({ engine, case: "fixed-committed-add-interrupted-read", passed: true, events: interrupted.events });
    } finally { await interrupted.releaseSessions(); await interrupted.releaseCarts(); await interrupted.context.close(); }

    for (const lateStatus of [200, 500]) {
      const changed = await fixture({ initialActor: "A" });
      try {
        await changed.page.goto(`${origin}/products/fixture`); await expect.poll(() => changed.page.evaluate(() => window.__scope?.ready)).toBe(true);
        changed.holdAdds(true); await changed.page.getByRole("button", { name: "افزودن به سبد خرید", exact: true }).click();
        await expect.poll(() => changed.heldAdds.length).toBe(1);
        changed.setActor("B"); await changed.page.evaluate(() => { void window.__nativeCheck(); });
        await expect.poll(() => changed.page.evaluate(() => window.__scope?.ready && window.__scope?.quantity === 0)).toBe(true);
        await changed.releaseAdds(lateStatus);
        await expect(changed.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false })).toHaveCount(0);
        await expect(changed.page.getByText("LATE_ACTOR_ERROR", { exact: true })).toHaveCount(0);
        assert.equal(changed.events.filter(e => e.kind === "cart-add-commit").length, 1); assert.deepEqual(changed.errors, []);
        results.push({ engine, case: `fixed-late-previous-actor-${lateStatus}`, passed: true, events: changed.events });
      } finally { await changed.releaseAdds(lateStatus); await changed.context.close(); }
    }

    const stable = await fixture();
    try {
      await stable.page.goto(`${origin}/products/fixture`); await expect.poll(() => stable.page.evaluate(() => window.__scope?.ready)).toBe(true);
      await stable.page.getByRole("button", { name: "افزودن به سبد خرید", exact: true }).click();
      await expect(stable.page.getByText("محصول به سبد خرید افزوده شد.", { exact: false }).first()).toBeVisible();
      assert.equal(stable.events.filter(e => e.kind === "cart-add-response").length, 1);
      assert.deepEqual(stable.errors, []);
      results.push({ engine, case: "stable-native-control", passed: true, events: stable.events });
    } finally { await stable.context.close(); }

    const gift = await fixture({ withItem: true });
    try {
      await gift.page.goto(`${origin}/checkout`); await expect(gift.page.getByLabel("نام گیرنده", { exact: true })).toBeVisible();
      for (const [label, value] of [["نام گیرنده", "گیرندهٔ کنترل‌شده"], ["شمارهٔ تماس گیرنده", "09351234567"], ["استان", "تهران"], ["شهر", "تهران"], ["نشانی کامل", "نشانی مصنوعی؛ ارسال واقعی انجام نشود"], ["پلاک", "1"], ["کدپستی ده‌رقمی", "0012345678"]]) await gift.page.getByLabel(label, { exact: true }).fill(value);
      await gift.page.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click();
      await gift.page.getByLabel("شمارهٔ همراه خریدار", { exact: true }).fill("+989120000000");
      await gift.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
      await gift.page.getByLabel("کد تأیید را وارد کنید.", { exact: true }).fill("123456");
      gift.holdSessions(true);
      await gift.page.getByRole("button", { name: "تأیید شماره", exact: true }).click();
      // Observe the explicit native refetch and library's own delayed signal; no replacement/dedupe mock.
      await expect.poll(() => gift.heldSessions.length).toBeGreaterThanOrEqual(2);
      await gift.releaseSessions();
      await expect(gift.page.getByRole("button", { name: "پرداخت ۱۰۰٬۰۰۰ تومان", exact: true })).toBeVisible();
      assert.equal(gift.quotes.at(-1).address.recipient, "گیرندهٔ کنترل‌شده");
      assert.equal(gift.quotes.at(-1).address.phone, "+989351234567");
      assert.equal(gift.quotes.at(-1).address.postalCode, "0012345678");
      const verifyIndex = gift.events.findIndex(e => e.kind === "native-otp-verify-response"), claimIndex = gift.events.findIndex(e => e.kind === "cart-claim-response"), quoteIndex = gift.events.findIndex(e => e.kind === "quote-response");
      assert.ok(verifyIndex >= 0 && claimIndex > verifyIndex && quoteIndex > claimIndex);
      assert.deepEqual(gift.errors, []);
      results.push({ engine, case: "actual-native-delayed-signal-gift-quote", passed: true, events: gift.events });
    } finally { await gift.releaseSessions(); await gift.releaseCarts(); await gift.context.close(); }
  } finally { await browser.close(); }
}
const report = process.argv.includes("--events") ? results : results.map(({ events, ...result }) => ({ ...result, ...(events ? { eventCount: events.length } : {}) }));
console.log(JSON.stringify({ scope: "actual-installed-client; intercepted-synthetic-HTTP; no-native-server-or-PG", baselineRevision, results: report }, null, 2));
