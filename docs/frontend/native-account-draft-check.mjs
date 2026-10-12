// Diagnosis only: installed Better Auth and actual AccountContent/PhoneVerification.
// All responses are intercepted synthetic HTTP; no application/native server, quota or PG.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { chromium, webkit, expect } from "@playwright/test";

const origin = "http://192.0.2.1", phone = "+989120000000";
const source = `import React from 'react';import{hydrateRoot}from'react-dom/client';import{CommerceProvider,useCommerce}from'./src/components/commerce-client';import{AccountContent}from'./src/components/account';import{useCustomerSession,invalidateCustomerPrivateState}from'./src/components/customer-session';import{customerAuth}from'./src/components/auth-clients';function Probe(){const identity=useCustomerSession(),native=customerAuth.useSession(),commerce=useCommerce();window.__localGuestReset=invalidateCustomerPrivateState;window.__nativeDefault=()=>native.refetch();window.__scope={pending:identity.pending,guest:!identity.ownerId,ready:commerce.ready};return <p role="status">آزمون کنترل‌شدهٔ ورود حساب</p>}function App(){return <CommerceProvider><main className="page"><Probe/><AccountContent/></main></CommerceProvider>}hydrateRoot(document.getElementById('root'),<App/>);`;
const serverSource = `import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{CommerceProvider}from'./src/components/commerce-client';import{AccountContent}from'./src/components/account';export function render(){return renderToStaticMarkup(<CommerceProvider><main className="page"><p role="status">آزمون کنترل‌شدهٔ ورود حساب</p><AccountContent/></main></CommerceProvider>);}`;
function routerPlugin() { return { name: "router-only", setup(builder) {
  // Do not substitute auth-clients or native hooks.
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture-router" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture-router" }, args => ({ contents: args.path === "next/link" ? "import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}" : "export function useRouter(){return{push(){},replace(){}}}export function usePathname(){return '/account'}export function useSearchParams(){return new URLSearchParams()}", loader: "js", resolveDir: process.cwd() }));
} }; }
const actualAccount = await readFile("src/components/account.tsx", "utf8");
const actualSession = await readFile("src/components/customer-session.tsx", "utf8");
const broadcastStart = actualSession.indexOf('function broadcast(kind: "session" | "privacy")'), broadcastEnd = actualSession.indexOf("export function invalidateCustomerPrivateState()");
assert.ok(broadcastStart >= 0 && broadcastEnd > broadcastStart);
// Negative comparison only: restore the old temporary sender while retaining all native logic.
const temporarySession = actualSession.slice(0,broadcastStart) + `function broadcast(kind: "session" | "privacy") {
  try { const channel = new BroadcastChannel(channelName); channel.postMessage({kind}); channel.close(); } catch {}
  try { localStorage.setItem(channelName,JSON.stringify({kind,signal:\`\${Date.now()}:\${++signalCounter}\`})); } catch {}
}
` + actualSession.slice(broadcastEnd);
const accountStart = actualAccount.indexOf("export function AccountContent()"), accountEnd = actualAccount.indexOf("function AccountForActor()");
assert.ok(accountStart >= 0 && accountEnd > accountStart);
// Restore only the classified pre-fix pending branch; all other modules stay actual/current.
const baselineAccount = actualAccount.slice(0, accountStart) + `export function AccountContent() {
  const identity = useCustomerSession(), {ready,error,refreshCart} = useCommerce();
  if (identity.pending) return identity.error ? <CustomerSessionError /> : <p role="status">در حال بررسی حساب…</p>;
  if (!identity.ownerId) return <div className="auth-page"><PhoneVerification onVerified={identity.revalidate} /></div>;
  if (!ready) return error ? <Notice error>{error}<button className="text-button" onClick={() => void refreshCart().catch(() => {})}>بررسی دوبارهٔ سبد حساب</button></Notice> : <p role="status">در حال اتصال سبد این مرورگر به حساب…</p>;
  return <AccountForActor key={identity.scopeKey} />;
}
` + actualAccount.slice(accountEnd);
async function browserBuild(baseline = false) { return build({ stdin: { contents: source, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [routerPlugin(), { name: "pre-fix-account-only", setup(builder) { if (baseline) builder.onLoad({ filter: /[/\\]src[/\\]components[/\\]account\.tsx$/ }, () => ({ contents: baselineAccount, loader: "tsx", resolveDir: `${process.cwd()}/src/components` })); if (process.argv.includes("--temporary-channel")) builder.onLoad({ filter: /[/\\]src[/\\]components[/\\]customer-session\.tsx$/ }, () => ({ contents: temporarySession, loader: "tsx", resolveDir: `${process.cwd()}/src/components` })); } }] }); }
const browserBuilt = await browserBuild(), baselineBuilt = await browserBuild(true);
const serverBuilt = await build({ stdin: { contents: serverSource, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [routerPlugin()] });
const module = { exports: {} }; let serverCalls = 0;
runInNewContext(serverBuilt.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url), process, console, Buffer, URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder, AbortController, queueMicrotask, setTimeout, clearTimeout, setImmediate, clearImmediate, ReadableStream, fetch() { serverCalls++; throw new Error("SSR transport is forbidden"); } });
const serverHtml = module.exports.render();
assert.equal(serverHtml.includes('id="purchaser-phone"'), false);
assert.equal(serverCalls, 0);
const css = (await readFile("public/brand/tokens.css", "utf8")) + (await readFile("src/styles/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, "");
const font = await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const html = `<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون کنترل‌شدهٔ ورود حساب</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root">${serverHtml}</div><script src="/fixture.js"></script></body></html>`;
const results = [{ case: "SSR-account-native-pending", passed: true, phoneFieldPresent: false, transportCalls: 0 }];
const engines = [["Chromium", () => chromium.launch({ channel: "chrome" })], ["WebKit", () => webkit.launch()]].filter(([engine]) => !process.argv.some(arg => arg.startsWith("--engine=")) || process.argv.includes(`--engine=${engine}`));
for (const [engine, launch] of engines) {
  const browser = await launch();
  async function fixture({ initialActor = null, holdScript = false, holdNative = false, baseline = false } = {}) {
    const context = await browser.newContext(), page = await context.newPage(); page.setDefaultTimeout(10000);
    let actor = initialActor, pausedScript = holdScript, pausedNative = holdNative, nativeError = false;
    const heldScripts = [], heldNative = [], heldDocuments = [], events = [], errors = [], sends = [], verifies = [], lifecycle = [];
    let documentOrdinal = 0, requestOrdinal = 0, documentResponses = 0;
    const requests = new WeakMap();
    const record = kind => events.push({ index: events.length, kind });
    const nativeSession = () => actor ? { user: { id: `controlled-customer-${actor}`, name: `مشتری کنترل‌شده ${actor}`, phoneNumber: phone, phoneNumberVerified: true, email: "fixture@example.invalid", emailVerified: false, createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" }, session: { id: `controlled-session-${actor}`, userId: `controlled-customer-${actor}`, expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" } } : null;
    const bundle = () => (baseline ? baselineBuilt : browserBuilt).outputFiles[0].text;
    const sessionResponse = () => nativeError ? { status: 503, json: { code: "CONTROLLED", message: "Controlled fresh-session error" } } : { json: nativeSession() };
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) lifecycle.push({ kind: "document-commit", document: ++documentOrdinal }); });
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/auth/get-session") { const item = { request: ++requestOrdinal, document: documentOrdinal, fresh: new URL(request.url()).searchParams.get("disableCookieCache") === "true" }; requests.set(request, item); lifecycle.push({ kind: "request-start", ...item }); } });
    page.on("response", response => { const item = requests.get(response.request()); if (item) lifecycle.push({ kind: "response", ...item, currentDocument: documentOrdinal, status: response.status() }); });
    page.on("requestfinished", request => { const item = requests.get(request); if (item) lifecycle.push({ kind: "request-finished", ...item, currentDocument: documentOrdinal }); });
    page.on("requestfailed", request => { const item = requests.get(request); if (item) lifecycle.push({ kind: "request-failed", ...item, currentDocument: documentOrdinal, category: /abort|cancel/i.test(request.failure()?.errorText ?? "") ? "cancelled" : /access control|cors/i.test(request.failure()?.errorText ?? "") ? "access-control" : "other-network" }); });
    page.on("console", message => { const text = message.text(), marker = "NATIVE_FIXTURE_LIFECYCLE:"; if (text.startsWith(marker)) { const item = JSON.parse(text.slice(marker.length)); lifecycle.push({ ...item, currentDocument: documentOrdinal }); } });
    page.on("pageerror", error => { errors.push(error.message); lifecycle.push({ kind: "pageerror", document: documentOrdinal, category: /access control|cors/i.test(error.message) ? "access-control" : /abort|cancel/i.test(error.message) ? "cancelled" : "other", name: error.name, sourceFrames: [...(error.stack ?? "").matchAll(/(?:fixture\.js|\/client\/[^\s:]+):(\d+):(\d+)/g)].map(match => ({ line: Number(match[1]), column: Number(match[2]) })) }); });
    await page.addInitScript(() => {
      const originalFetch = window.fetch; let serial = 0;
      const emit = item => console.debug("NATIVE_FIXTURE_LIFECYCLE:" + JSON.stringify({ ...item, originDocument: performance.timeOrigin }));
      window.addEventListener("unhandledrejection", event => emit({ kind: "unhandled-rejection", name: event.reason?.name ?? "unknown", category: /access control|cors/i.test(event.reason?.message ?? "") ? "access-control" : "other" }));
      window.addEventListener("error", event => emit({ kind: "window-error", category: /access control|cors/i.test(event.message) ? "access-control" : "other", line: event.lineno ?? 0 }));
      const originalChannel = window.BroadcastChannel; let channelSerial = 0;
      window.BroadcastChannel = class extends originalChannel {
        constructor(name) { super(name); this.fixtureChannel = ++channelSerial; }
        postMessage(data) { if (this.name === "morphiume-customer-privacy-v1") emit({ kind: "privacy-channel-post", channel: this.fixtureChannel, payloadKind: data.kind, keys: Object.keys(data).sort() }); return super.postMessage(data); }
        set onmessage(handler) { super.onmessage = this.name === "morphiume-customer-privacy-v1" ? event => { emit({ kind: "privacy-channel-receive", channel: this.fixtureChannel, payloadKind: event.data.kind, keys: Object.keys(event.data).sort() }); handler(event); } : handler; }
        get onmessage() { return super.onmessage; }
      };
      window.fetch = (input, options) => {
        const url = new URL(typeof input === "string" ? input : input.url ?? String(input), location.href);
        if (url.pathname !== "/api/auth/get-session") return originalFetch(input, options);
        const request = ++serial; emit({ kind: "fetch-start", request, fresh: url.searchParams.get("disableCookieCache") === "true" });
        options?.signal?.addEventListener("abort", () => emit({ kind: "fetch-signal-abort", request }), { once: true });
        return originalFetch(input, options).then(response => { emit({ kind: "fetch-resolved", request, status: response.status }); return response; }, error => { emit({ kind: "fetch-rejected", request, category: error?.name === "AbortError" ? "abort" : /access control|cors/i.test(error?.message ?? "") ? "access-control" : "other-network" }); throw error; });
      };
    });
    await page.addInitScript(() => { window.__phoneInvalid = 0; document.addEventListener("invalid", event => { if (event.target.id === "purchaser-phone") window.__phoneInvalid++; }, true); });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      assert.equal(url.origin, origin);
      if (path === "/fixture.js") { if (pausedScript) { heldScripts.push(route); return; } return route.fulfill({ contentType: "application/javascript", body: bundle() }); }
      if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
      if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: font });
      if (path === "/api/auth/get-session") { record(url.searchParams.get("disableCookieCache") === "true" ? "native-fresh-request" : "native-default-request"); if (pausedNative) { heldNative.push(route); return; } record(nativeError ? "native-error-response" : actor ? "native-account-response" : "native-guest-response"); return route.fulfill(sessionResponse()); }
      if (path === "/api/auth/sign-out") { actor = null; record("native-signout-response200"); return route.fulfill({ json: { success: true } }); }
      if (path === "/api/auth/phone-number/send-otp") { sends.push(request.postDataJSON()); record("native-send-response200"); return route.fulfill({ json: { message: "Controlled OTP send" } }); }
      if (path === "/api/auth/phone-number/verify") { verifies.push(request.postDataJSON()); actor = "A"; record("native-verify-response200"); return route.fulfill({ json: { status: true, user: nativeSession().user } }); }
      if (path === "/api/cart" || path === "/api/cart/claim") return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000001", version: 1, items: [], couponCode: null, subtotal: { amountIrr: "0", currency: "IRR" } } } });
      if (path === "/api/orders/page") return route.fulfill({ json: { data: { items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0 } } });
      if (path.startsWith("/api/")) throw new Error(`Unexpected synthetic boundary: ${request.method()} ${path}`);
      if (++documentResponses > 1 && (process.argv.includes("--delay-reload-commit") || process.argv.includes("--hold-channel-commit"))) { heldDocuments.push(route); return; }
      return route.fulfill({ contentType: "text/html", body: html });
    });
    const releaseNative = async () => { pausedNative = false; for (const route of heldNative.splice(0)) { record(nativeError ? "native-held-error-response" : actor ? "native-held-account-response" : "native-held-guest-response"); await route.fulfill(sessionResponse()).catch(() => {}); } };
    const releaseScripts = async () => { pausedScript = false; for (const route of heldScripts.splice(0)) await route.fulfill({ contentType: "application/javascript", body: bundle() }).catch(() => {}); };
    const releaseDocuments = async () => { for (const route of heldDocuments.splice(0)) await route.fulfill({ contentType: "text/html", body: html }).catch(() => {}); };
    return { context, page, errors, sends, verifies, events, lifecycle, heldNative, heldScripts, heldDocuments, releaseNative, releaseScripts, releaseDocuments, action(kind) { lifecycle.push({ kind, document: documentOrdinal }); }, setActor(value) { actor = value; }, errorNative(value) { nativeError = value; }, pauseNative() { pausedNative = true; } };
  }
  try {
    if (!process.argv.includes("--postlogout-only")) {
    const delayed = await fixture({ holdScript: true, holdNative: true });
    try {
      await delayed.page.goto(`${origin}/account`, { waitUntil: "commit" });
      await expect.poll(() => delayed.heldScripts.length).toBeGreaterThan(0);
      await expect(delayed.page.getByLabel("شمارهٔ همراه", { exact: true })).not.toBeVisible();
      await delayed.releaseScripts(); await expect.poll(() => delayed.heldNative.length).toBeGreaterThan(0);
      await expect(delayed.page.getByLabel("شمارهٔ همراه", { exact: true })).not.toBeVisible();
      await delayed.releaseNative(); await expect(delayed.page.getByLabel("شمارهٔ همراه", { exact: true })).toBeVisible();
      await delayed.page.getByLabel("شمارهٔ همراه", { exact: true }).fill(phone);
      await delayed.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
      await expect(delayed.page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible();
      assert.equal(delayed.sends.length, 1); assert.equal(delayed.sends[0].phoneNumber, phone); assert.deepEqual(delayed.errors, []);
      results.push({ engine, case: "delayed-script-native-hydration-control", passed: true, phoneUnavailableBeforeHandlers: true, sends: 1, events: delayed.events });
    } finally { await delayed.releaseScripts(); await delayed.releaseNative(); await delayed.context.close(); }
    }

    for (const baseline of [true, false]) for (const trigger of ["default-refetch", "window-focus", "post-logout-focus"]) {
      if (process.argv.includes("--postlogout-only") && (baseline || trigger !== "post-logout-focus")) continue;
      const sample = await fixture({ initialActor: trigger === "post-logout-focus" ? "A" : null, baseline });
      try {
        await sample.page.goto(`${origin}/account`);
        if (trigger === "post-logout-focus") {
          await expect(sample.page.getByRole("button", { name: "خروج از حساب", exact: true })).toBeVisible();
          await sample.page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
          sample.action("logout-click-return");
        }
        const field = sample.page.getByLabel("شمارهٔ همراه", { exact: true });
        if (process.argv.includes("--hold-channel-commit") && trigger === "post-logout-focus") {
          await expect.poll(() => sample.heldDocuments.length).toBeGreaterThan(0);
          // Stop at the actual old-document provider settlement, without an extra native call.
          await expect.poll(() => sample.lifecycle.filter(item => item.kind === "privacy-channel-post").length).toBeGreaterThanOrEqual(2);
          if (process.argv.includes("--temporary-channel")) await expect.poll(() => sample.errors.length).toBeGreaterThan(0);
          else {
            assert.equal(sample.lifecycle.filter(item => item.kind === "privacy-channel-receive").length, 0);
            const ownPosts = sample.lifecycle.filter(item => item.kind === "privacy-channel-post");
            assert.equal(new Set(ownPosts.map(item => item.channel)).size, 1);
          }
          await sample.releaseDocuments(); await expect(field).toBeVisible(); await field.fill(phone);
          await sample.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
          await expect(sample.page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible();
          assert.equal(sample.sends.length, 1);
          console.log(JSON.stringify({ kind: "SAFE_CHANNEL_COMMIT_COMPARISON", engine, temporarySender: process.argv.includes("--temporary-channel"), sends: sample.sends.length, errorCount: sample.errors.length, lifecycle: sample.lifecycle }));
          assert.deepEqual(sample.errors, [], "Old-document comparison retains the zero-pageerror assertion; the temporary sender is a negative control");
          results.push({ engine, case: "persistent-channel-held-document", passed: true, sameWindowChannelReceives: 0, sends: 1, pageerrors: 0 });
          continue;
        }
        if (process.argv.includes("--delay-reload-commit") && trigger === "post-logout-focus") {
          await expect.poll(() => sample.heldDocuments.length).toBeGreaterThan(0);
          sample.action("old-document-default-refetch");
          await sample.page.evaluate(() => { void window.__nativeDefault(); });
          await expect.poll(() => sample.errors.length).toBeGreaterThan(0);
          await sample.releaseDocuments(); await expect(field).toBeVisible(); await field.fill(phone);
          await sample.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
          await expect(sample.page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible();
          console.log(JSON.stringify({ kind: "SAFE_NATIVE_FIXTURE_DELAYED_COMMIT", engine, sends: sample.sends.length, errorCount: sample.errors.length, lifecycle: sample.lifecycle }));
          assert.deepEqual(sample.errors, [], "Intentional old-document transport control retains the zero-pageerror assertion");
          continue;
        }
        await expect(field).toBeVisible(); sample.action("before-phone-fill"); await field.fill(phone); sample.action("phone-filled"); await expect(field).toHaveValue(phone);
        const previousField = await field.elementHandle();
        sample.pauseNative();
        sample.action("before-controlled-refetch");
        await sample.page.evaluate(trigger => { if (trigger === "default-refetch") void window.__nativeDefault(); else window.dispatchEvent(new Event("focus")); }, trigger);
        await expect.poll(() => sample.heldNative.length).toBeGreaterThan(0);
        await expect(field).not.toBeVisible();
        assert.equal(await previousField.evaluate(element => element.isConnected), !baseline);
        if (!baseline) {
          const hiddenField = sample.page.locator("#purchaser-phone");
          await expect(hiddenField).toBeDisabled(); await expect(hiddenField).toHaveValue(phone);
          await sample.page.locator(".phone-form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
          assert.equal(sample.sends.length, 0);
        }
        await sample.releaseNative(); await expect(field).toBeVisible(); await expect(field).toHaveValue(baseline ? "" : phone);
        await sample.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
        if (baseline) await expect.poll(() => sample.page.evaluate(() => window.__phoneInvalid)).toBeGreaterThan(0);
        else await expect(sample.page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible();
        assert.equal(sample.sends.length, baseline ? 0 : 1);
        if (process.argv.includes("--lifecycle") || sample.errors.length) console.log(JSON.stringify({ kind: "SAFE_NATIVE_FIXTURE_DIAGNOSTIC", engine, baseline, trigger, sends: sample.sends.length, errorCount: sample.errors.length, lifecycle: sample.lifecycle }));
        assert.deepEqual(sample.errors, [], `${engine} ${baseline ? "baseline" : "fixed"} ${trigger}; ${sample.events.map(event => event.kind).join(",")}`);
        results.push({ engine, case: `${baseline ? "baseline" : "fixed"}-${trigger}`, ...(baseline ? { reproduced: true, cause: "pending-removes-PhoneVerification-state" } : { passed: true, sameFieldPreserved: true, pendingControlsDisabled: true, pendingSubmitGuarded: true }), sends: sample.sends.length, events: sample.events });
      } finally { await sample.releaseNative(); await sample.releaseDocuments(); await sample.context.close(); }
    }

    if (!process.argv.includes("--postlogout-only")) {
    const hard = await fixture();
    try {
      await hard.page.goto(`${origin}/account`);
      const field = hard.page.getByLabel("شمارهٔ همراه", { exact: true }), code = hard.page.getByLabel("کد تأیید را وارد کنید.", { exact: true });
      await expect(field).toBeVisible(); await field.fill(phone); await hard.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
      await expect(code).toBeVisible(); await code.fill("123456"); const previousCode = await code.elementHandle();
      hard.pauseNative(); await hard.page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => hard.heldNative.length).toBeGreaterThan(0);
      await expect(code).not.toBeVisible(); await expect(hard.page.locator("#verification-code")).toBeDisabled();
      assert.equal(await previousCode.evaluate(element => element.isConnected), true);
      await hard.page.locator(".phone-form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      assert.equal(hard.verifies.length, 0); assert.equal(hard.sends.length, 1);
      await hard.releaseNative(); await expect(code).toBeVisible(); await expect(code).toHaveValue("123456");
      hard.errorNative(true); await hard.page.evaluate(() => { void window.__nativeDefault(); });
      await expect(hard.page.getByText("بررسی حساب انجام نشد.", { exact: true })).toBeVisible();
      await expect(code).not.toBeVisible(); await expect(hard.page.locator("#verification-code")).toBeDisabled();
      await hard.page.locator(".phone-form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      assert.equal(hard.verifies.length, 0); hard.errorNative(false);
      await hard.page.getByRole("button", { name: "بررسی دوبارهٔ حساب", exact: true }).click();
      await expect(code).toBeVisible(); await expect(code).toHaveValue("123456");
      const storedPrivate = await hard.page.evaluate(phone => [localStorage, sessionStorage].some(storage => Object.keys(storage).some(key => { const value = storage.getItem(key) ?? ""; return value.includes(phone) || value.includes('"123456"'); })), phone);
      assert.equal(storedPrivate, false);
      await hard.page.getByRole("button", { name: "تأیید شماره", exact: true }).click();
      await expect(hard.page.getByText("مشتری کنترل‌شده A", { exact: true })).toBeVisible();
      await expect(hard.page.locator("#purchaser-phone,#verification-code")).toHaveCount(0); assert.equal(hard.verifies.length, 1);
      results.push({ engine, case: "fixed-code-pending-error-resume-verify", passed: true, pendingVerifyWrites: 0, phoneAndCodeStored: false, nativeVerifyWrites: 1 });

      hard.pauseNative(); await hard.page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => hard.heldNative.length).toBeGreaterThan(0);
      await expect(hard.page.getByText("مشتری کنترل‌شده A", { exact: true })).toHaveCount(0);
      hard.setActor("B"); await hard.releaseNative();
      await expect(hard.page.getByText("مشتری کنترل‌شده B", { exact: true })).toBeVisible();
      await expect(hard.page.getByText("مشتری کنترل‌شده A", { exact: true })).toHaveCount(0);
      await hard.page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
      await expect(field).toBeVisible(); await expect(field).toHaveValue("");
      await field.fill(phone); await hard.page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
      await expect(code).toBeVisible(); await code.fill("123456"); const beforePrivacy = await code.elementHandle();
      hard.pauseNative(); await hard.page.evaluate(() => window.__localGuestReset());
      await expect.poll(() => hard.heldNative.length).toBeGreaterThan(0);
      assert.equal(await beforePrivacy.evaluate(element => element.isConnected), false);
      await hard.releaseNative(); await expect(field).toBeVisible(); await expect(field).toHaveValue(""); await expect(code).toHaveCount(0);
      assert.deepEqual(hard.errors, []);
      results.push({ engine, case: "fixed-owner-private-pending-logout-generation-reset", passed: true, authenticatedChildrenUnmountDuringCheck: true, hardScopeResetsGuestPhoneAndCode: true });
    } finally { await hard.releaseNative(); await hard.context.close(); }
    }
  } finally { await browser.close(); }
}
console.log(JSON.stringify({ scope: "actual installed native client; real account/phone components; intercepted synthetic origin only", results: process.argv.includes("--events") ? results : results.map(({ events, ...result }) => ({ ...result, ...(events ? { eventCount: events.length } : {}) })) }, null, 2));
