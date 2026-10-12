// Diagnosis only. Actual installed Better Auth, CustomerSessionProvider and AccountContent.
// Three real pages share native BroadcastChannel/localStorage. HTTP is fully intercepted.
// The delivery gate queues only Morphiume's anonymous privacy events, not native auth events.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { chromium, webkit, expect } from "@playwright/test";

const origin = "http://192.0.2.1", channelName = "morphiume-customer-privacy-v1", phone = "+989120000000";
const source = `import React,{useLayoutEffect} from 'react';import{createRoot}from'react-dom/client';import{CommerceProvider,useCommerce}from'./src/components/commerce-client';import{AccountContent}from'./src/components/account';import{useCustomerSession,invalidateCustomerPrivateState,denyCustomerPrivateState}from'./src/components/customer-session';import{customerAuth}from'./src/components/auth-clients';function Probe(){const identity=useCustomerSession(),commerce=useCommerce(),native=customerAuth.useSession();window.__nativeDefault=()=>native.refetch();useLayoutEffect(()=>{if(identity.ownerId)window.__hadOwner=true;if(window.__armSettlement && window.__hadOwner && !identity.ownerId && !window.__settlement){const field=document.getElementById("purchaser-phone");if(field){const enabled=!field.matches(":disabled")&&!field.closest("[hidden],[inert]");window.__settlement={enabled,pending:identity.pending};if(enabled){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(field,"+989120000000");field.dispatchEvent(new Event("input",{bubbles:true}));window.__settlementField=field;}}}});window.__check=identity.revalidate;window.__localInvalidate=invalidateCustomerPrivateState;window.__localDeny=denyCustomerPrivateState;window.__scope={guest:!identity.ownerId,pending:identity.pending,generation:identity.generation,guestReset:identity.guestResetGeneration,ready:commerce.ready};return <p role="status">آزمون تحویل پیام بی‌نام</p>}function App(){return <CommerceProvider><main className="page"><Probe/><AccountContent/></main></CommerceProvider>}createRoot(document.getElementById('root')).render(<App/>);`;
const accountSource = await readFile("src/components/account.tsx", "utf8"), apiSource = await readFile("src/components/commerce-client.tsx", "utf8"), sessionSource = await readFile("src/components/customer-session.tsx", "utf8");
const guestKey = 'key={`${identity.ownerId ?? "guest"}:${identity.guestResetGeneration}`}';
const abortGuard = '  if (options.signal?.aborted) throw new DOMException("Request aborted", "AbortError");';
assert.ok(accountSource.includes(guestKey) && apiSource.includes(abortGuard));
async function buildFixture(baselineGuest = false, baselineApi = false, baselineSettlement = false) { return build({ stdin: { contents: source, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "router-only", setup(builder) {
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture-router" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture-router" }, args => ({ contents: args.path === "next/link" ? "import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}" : "export function useRouter(){return{push(){},replace(){}}}export function usePathname(){return '/account'}export function useSearchParams(){return new URLSearchParams()}", loader: "js", resolveDir: process.cwd() }));
  if (baselineGuest) builder.onLoad({ filter: /[/\\]src[/\\]components[/\\]account\.tsx$/ }, () => ({ contents: accountSource.replace(guestKey, "key={identity.scopeKey}"), loader: "tsx", resolveDir: `${process.cwd()}/src/components` }));
  if (baselineApi) builder.onLoad({ filter: /[/\\]src[/\\]components[/\\]commerce-client\.tsx$/ }, () => ({ contents: apiSource.replace(abortGuard, ""), loader: "tsx", resolveDir: `${process.cwd()}/src/components` }));
  if (baselineSettlement) builder.onLoad({ filter: /[/\\]src[/\\]components[/\\]customer-session\.tsx$/ }, () => ({ contents: sessionSource.replace("checking || ownerTransition ||", "checking ||"), loader: "tsx", resolveDir: `${process.cwd()}/src/components` }));
} }] }); }
const built = await buildFixture(), baselineGuestBuilt = await buildFixture(true), baselineApiBuilt = await buildFixture(false, true), baselineSettlementBuilt = await buildFixture(false, false, true);
const css = (await readFile("public/brand/tokens.css", "utf8")) + (await readFile("src/styles/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, "");
const font = await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const html = '<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون تحویل پیام بی‌نام</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const results = [];
const engines = [["Chromium", () => chromium.launch({ channel: "chrome" })], ["WebKit", () => webkit.launch()]].filter(([engine]) => !process.argv.some(arg => arg.startsWith("--engine=")) || process.argv.includes(`--engine=${engine}`));
for (const [engine, launch] of engines) {
  const browser = await launch();
  for (const baseline of process.argv.includes("--settlement-only") ? [] : [true, false]) {
  const context = await browser.newContext();
  const aliases = new Map(), held = [], events = [], errors = [], sends = [], blocked = new Set();
  let actor = "A";
  const nativeSession = () => actor ? { user: { id: "controlled-A", name: "PRIVATE_ACCOUNT_A", phoneNumber: phone, phoneNumberVerified: true, email: "fixture@example.invalid", emailVerified: false, createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" }, session: { id: "controlled-session-A", userId: "controlled-A", expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" } } : null;
  await context.addInitScript(targetName => {
    const queue = [], received = [], sent = [];
    window.__delivery = { hold: false, replaying: false, queue, received, sent, deliver(transport) { const index = queue.findIndex(item => item.transport === transport); if (index < 0) return false; const [item] = queue.splice(index, 1); item.deliver(); return true; } };
    const nativeChannel = window.BroadcastChannel;
    window.BroadcastChannel = class extends nativeChannel {
      postMessage(data) { if (this.name === targetName) sent.push({ transport: "channel", keys: Object.keys(data).sort() }); return super.postMessage(data); }
      set onmessage(handler) { super.onmessage = this.name !== targetName ? handler : event => { received.push({ transport: "channel", keys: Object.keys(event.data).sort(), kind: event.data.kind }); if (window.__delivery.hold) queue.push({ transport: "channel", deliver: () => handler(event) }); else handler(event); }; }
      get onmessage() { return super.onmessage; }
    };
    window.addEventListener("storage", event => {
      if (event.key !== targetName || window.__delivery.replaying) return;
      const parsed = JSON.parse(event.newValue ?? "null");
      received.push({ transport: "storage", keys: Object.keys(parsed ?? {}).sort(), kind: parsed?.kind });
      if (!window.__delivery.hold) return;
      event.stopImmediatePropagation();
      queue.push({ transport: "storage", deliver() { window.__delivery.replaying = true; window.dispatchEvent(new StorageEvent("storage", { key: event.key, newValue: event.newValue, oldValue: event.oldValue, url: event.url, storageArea: localStorage })); window.__delivery.replaying = false; } });
    }, true);
    window.__phoneInvalid = 0;
    document.addEventListener("invalid", event => { if (event.target.id === "purchaser-phone") window.__phoneInvalid++; }, true);
  }, channelName);
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, alias = aliases.get(request.frame().page()) ?? "new-document";
    assert.equal(url.origin, origin);
    if (path === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: (baseline ? baselineGuestBuilt : built).outputFiles[0].text });
    if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
    if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: font });
    if (path === "/api/auth/get-session") { events.push({ alias, kind: "native-session-request", guest: !actor }); if (blocked.has(alias)) { held.push({ alias, route }); return; } return route.fulfill({ json: nativeSession() }); }
    if (path === "/api/auth/sign-out") { actor = null; events.push({ alias, kind: "native-signout-response200" }); return route.fulfill({ json: { success: true } }); }
    if (path === "/api/auth/phone-number/send-otp") { sends.push({ alias, validPhone: request.postDataJSON().phoneNumber === phone }); return route.fulfill({ json: { message: "Controlled send" } }); }
    if (path === "/api/cart" || path === "/api/cart/claim") return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000001", version: 1, items: [], couponCode: null, subtotal: { amountIrr: "0", currency: "IRR" } } } });
    if (path === "/api/orders/page") return route.fulfill({ json: { data: { items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0 } } });
    if (path.startsWith("/api/")) throw new Error(`Unexpected synthetic boundary: ${request.method()} ${path}`);
    events.push({ alias, kind: "document-response" }); return route.fulfill({ contentType: "text/html", body: html });
  });
  const release = async alias => { blocked.delete(alias); for (let index = held.length - 1; index >= 0; index--) if (held[index].alias === alias) { const [{ route }] = held.splice(index, 1); await route.fulfill({ json: nativeSession() }).catch(() => {}); } };
  try {
    const pages = [];
    for (const alias of ["login", "peer-one", "peer-two"]) { const page = await context.newPage(); aliases.set(page, alias); page.setDefaultTimeout(10000); page.on("pageerror", error => errors.push({ alias, message: error.message })); pages.push(page); await page.goto(`${origin}/account`); await expect(page.getByRole("button", { name: "خروج از حساب", exact: true })).toBeVisible(); }
    const [login, peerOne, peerTwo] = pages;
    // Delay only the peers' native responses so their A→guest privacy broadcasts arrive later.
    blocked.add("peer-one"); blocked.add("peer-two");
    await login.getByRole("button", { name: "خروج از حساب", exact: true }).click();
    const field = login.getByLabel("شمارهٔ همراه", { exact: true }); await expect(field).toBeVisible();
    await login.evaluate(() => { window.__delivery.hold = true; });
    await field.fill(phone); await expect(field).toHaveValue(phone);
    const initial = await login.evaluate(() => window.__scope.generation), localInitial = await login.evaluate(() => window.__scope.guestReset), firstNode = await field.elementHandle();
    await expect.poll(() => held.filter(item => item.alias === "peer-one").length).toBeGreaterThan(0); await release("peer-one");
    await expect.poll(() => peerOne.evaluate(() => window.__scope?.guest && !window.__scope?.pending)).toBe(true);
    await expect.poll(() => login.evaluate(() => window.__delivery.queue.some(item => item.transport === "channel") && window.__delivery.queue.some(item => item.transport === "storage"))).toBe(true);
    assert.equal(await login.evaluate(() => window.__delivery.deliver("channel")), true);
    await expect(field).toBeVisible(); await expect(field).toHaveValue(baseline ? "" : phone); assert.equal(await firstNode.evaluate(node => node.isConnected), !baseline);
    const afterChannel = await login.evaluate(() => window.__scope.generation); assert.ok(afterChannel > initial);
    await field.fill(phone); const secondNode = await field.elementHandle();
    assert.equal(await login.evaluate(() => window.__delivery.deliver("storage")), true);
    await expect(field).toBeVisible(); await expect(field).toHaveValue(baseline ? "" : phone); assert.equal(await secondNode.evaluate(node => node.isConnected), !baseline);
    const afterStorage = await login.evaluate(() => window.__scope.generation); assert.ok(afterStorage > afterChannel);
    if (baseline) { await login.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click(); await expect.poll(() => login.evaluate(() => window.__phoneInvalid)).toBeGreaterThan(0); assert.equal(sends.length, 0); }
    // Another actual peer finishes A→guest and emits additional anonymous invalidation.
    await field.fill(phone); const thirdNode = await field.elementHandle();
    await expect.poll(() => held.filter(item => item.alias === "peer-two").length).toBeGreaterThan(0); await release("peer-two");
    await expect.poll(() => peerTwo.evaluate(() => window.__scope?.guest && !window.__scope?.pending)).toBe(true);
    await expect.poll(() => login.evaluate(() => window.__delivery.queue.some(item => item.transport === "channel"))).toBe(true);
    assert.equal(await login.evaluate(() => window.__delivery.deliver("channel")), true);
    await expect(field).toBeVisible(); await expect(field).toHaveValue(baseline ? "" : phone); assert.equal(await thirdNode.evaluate(node => node.isConnected), !baseline);
    assert.equal(await login.evaluate(() => window.__scope.guestReset), localInitial);
    if (!baseline) { await login.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click(); await expect(login.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible(); assert.equal(sends.length, 1); assert.equal(sends[0].validPhone, true); }
    const signals = await login.evaluate(() => window.__delivery.received);
    assert.ok(signals.filter(signal => signal.kind === "privacy").length >= 4);
    for (const signal of signals) assert.deepEqual(signal.keys, signal.transport === "channel" ? ["kind"] : ["kind", "signal"]);
    for (const page of pages) { await expect(page.getByText("PRIVATE_ACCOUNT_A", { exact: true })).toHaveCount(0); assert.equal(await page.evaluate(() => window.__scope.guest), true); }
    assert.deepEqual(errors, []);
    results.push({ engine, case: baseline ? "baseline-remote-delivery" : "fixed-remote-delivery", ...(baseline ? { reproduced: true } : { passed: true }), nativeGuestRemainedTrue: true, generationAfterChannel: afterChannel - initial, generationAfterStorage: afterStorage - initial, localResetDelta: 0, disconnectedNewGuestNodes: baseline ? 3 : 0, otpRequests: sends.length, anonymousSignalsOnly: true, peerPages: 2, eventCount: events.length });
    if (!baseline) {
      await login.evaluate(() => { window.__localInvalidate(); });
      await expect(field).toBeVisible(); await expect(field).toHaveValue("");
      assert.ok(await login.evaluate(() => window.__scope.guestReset) > localInitial);
      await field.fill(phone); const deniedNode = await field.elementHandle(), beforeDeny = await login.evaluate(() => window.__scope.guestReset);
      await login.evaluate(() => { window.__localDeny(); });
      await expect(login.getByText("بررسی حساب انجام نشد.", { exact: true })).toBeVisible();
      await login.evaluate(() => { void window.__check(); }); await expect(field).toBeVisible(); await expect(field).toHaveValue("");
      assert.equal(await deniedNode.evaluate(node => node.isConnected), false);
      assert.ok(await login.evaluate(() => window.__scope.guestReset) > beforeDeny);
      results.push({ engine, case: "fixed-local-invalidate-and-deny", passed: true, bothLocalResetsDiscardGuestInput: true });
    }
  } finally { await release("peer-one"); await release("peer-two"); await context.close(); }
  }
  try {
    if (process.argv.includes("--transports-only")) continue;
    for (const baseline of [true, false]) for (const status of [200, 401, 403]) for (const parserGap of [false, true]) {
      if (process.argv.includes("--settlement-only") && (baseline || status !== 200 || parserGap)) continue;
      const lateContext = await browser.newContext(), page = await lateContext.newPage(); page.setDefaultTimeout(10000);
      let lateActor = true, blockedClaim = null; const lateErrors = []; let lateSends = 0;
      page.on("pageerror", error => lateErrors.push(error.message));
      await lateContext.addInitScript(({ parserGap }) => {
        window.__heldClaimJSON = []; window.__oldClaimAborted = false; window.__phoneInvalid = 0;
        const nativeFetch = window.fetch, nativeJson = Response.prototype.json;
        window.fetch = (input, options) => {
          const path = new URL(typeof input === "string" ? input : input.url ?? String(input), location.href).pathname;
          if (path === "/api/cart/claim") options?.signal?.addEventListener("abort", () => { window.__oldClaimAborted = true; }, { once: true });
          return nativeFetch(input, options);
        };
        if (parserGap) Response.prototype.json = async function () {
          const payload = await nativeJson.call(this);
          if (new URL(this.url).pathname === "/api/cart/claim") await new Promise(resolve => window.__heldClaimJSON.push(resolve));
          return payload;
        };
        document.addEventListener("invalid", event => { if (event.target.id === "purchaser-phone") window.__phoneInvalid++; }, true);
      }, { parserGap });
      await lateContext.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname; assert.equal(url.origin, origin);
        if (path === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: (process.argv.includes("--baseline-settlement") ? baselineSettlementBuilt : baseline ? baselineApiBuilt : built).outputFiles[0].text });
        if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
        if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: font });
        if (path === "/api/auth/get-session") return route.fulfill({ json: lateActor ? { user: { id: "controlled-old-A", name: "CONTROLLED_OLD_ACCOUNT", phoneNumberVerified: true }, session: { id: "controlled-old-session", userId: "controlled-old-A", expiresAt: "2099-01-01T00:00:00.000Z" } } : null });
        const claimPayload = status === 200 ? { data: { id: "00000000-0000-4000-8000-000000000001", version: 1, items: [], couponCode: null, subtotal: { amountIrr: "0", currency: "IRR" } } } : { error: { code: "UNAUTHENTICATED", message: "Controlled previous actor denial" } };
        if (path === "/api/cart/claim") { if (!parserGap) { blockedClaim = route; return; } return route.fulfill({ status, json: claimPayload }); }
        if (path === "/api/cart") return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000001", version: 1, items: [], couponCode: null, subtotal: { amountIrr: "0", currency: "IRR" } } } });
        if (path === "/api/auth/phone-number/send-otp") { lateSends++; return route.fulfill({ json: { message: "Controlled send" } }); }
        if (path.startsWith("/api/")) throw new Error(`Unexpected late-error fixture boundary: ${request.method()} ${path}`);
        return route.fulfill({ contentType: "text/html", body: html });
      });
      try {
        await page.goto(`${origin}/account`);
        if (parserGap) await expect.poll(() => page.evaluate(() => window.__heldClaimJSON.length)).toBeGreaterThan(0);
        else await expect.poll(() => !!blockedClaim).toBe(true);
        if (!baseline && status === 200 && !parserGap) await page.evaluate(() => { window.__armSettlement = true; });
        lateActor = false; await page.evaluate(() => { if (window.__armSettlement) void window.__nativeDefault(); else void window.__check(); });
        const field = page.getByLabel("شمارهٔ همراه", { exact: true }); await expect(field).toBeVisible();
        assert.equal(await page.evaluate(() => window.__oldClaimAborted), true);
        await field.fill(phone); const node = await field.elementHandle(), before = await page.evaluate(() => window.__scope.generation);
        const erased = parserGap && baseline && status !== 200;
        if (parserGap) await page.evaluate(() => { window.__heldClaimJSON.splice(0).forEach(resolve => resolve()); });
        else await blockedClaim.fulfill({ status, json: status === 200 ? { data: {} } : { error: { code: "UNAUTHENTICATED", message: "Controlled previous actor denial" } } }).catch(() => {});
        if (erased) {
          await expect.poll(() => page.evaluate(() => window.__scope.generation)).toBeGreaterThan(before);
          await page.evaluate(() => { void window.__check(); }); await expect(field).toBeVisible(); await expect(field).toHaveValue("");
          assert.equal(await node.evaluate(element => element.isConnected), false);
          assert.ok(await page.evaluate(() => window.__scope.generation) > before);
          await page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
          await expect.poll(() => page.evaluate(() => window.__phoneInvalid)).toBeGreaterThan(0); assert.equal(lateSends, 0);
        } else {
          await expect(field).toHaveValue(phone); assert.equal(await node.evaluate(element => element.isConnected), true);
          assert.equal(await page.evaluate(() => window.__scope.generation), before);
          await page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click();
          await expect(page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible(); assert.equal(lateSends, 1);
        }
        assert.deepEqual(lateErrors, []);
        if (!baseline && status === 200 && !parserGap) {
          const settlement = await page.evaluate(() => ({ ...window.__settlement, typedFieldDisconnected: window.__settlementField ? !window.__settlementField.isConnected : false }));
          assert.equal(settlement.enabled, process.argv.includes("--baseline-settlement"));
          assert.equal(settlement.pending, !process.argv.includes("--baseline-settlement"));
          assert.equal(settlement.typedFieldDisconnected, process.argv.includes("--baseline-settlement"));
          results.push({ engine, case: "layout-phase-own-owner-settlement", ...settlement });
        }
        results.push({ engine, case: `${baseline ? "baseline" : "fixed"}-${parserGap ? "post-JSON-completion-gap" : "ordinary-aborted-fetch"}`, status, oldRequestAborted: true, controlledParserDelay: parserGap, guestDraftErased: erased, otpRequests: lateSends });
      } finally { await page.evaluate(() => { window.__heldClaimJSON?.splice(0).forEach(resolve => resolve()); }).catch(() => {}); await lateContext.close(); }
    }
  } finally { await browser.close(); }
}
console.log(JSON.stringify({ scope: "actual installed clients/provider; three real pages and native transports; coordinated synthetic HTTP/delivery only; no running app/native-server/PG", results }, null, 2));
