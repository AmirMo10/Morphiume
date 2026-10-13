// Actual inboxes, shell, provider and installed Better Auth clients. All HTTP is intercepted.
// No Morphiume runtime, database, native server, worker or external delivery is exercised.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { chromium, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://192.0.2.1";
const navigation = `import React from'react';const listeners=new Set(),router={replace(url){history.replaceState(null,'',url);listeners.forEach(fn=>fn())}};const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};export function useRouter(){return router}export function usePathname(){return React.useSyncExternalStore(subscribe,()=>location.pathname,()=>'/admin/notifications')}export function useSearchParams(){return new URLSearchParams(React.useSyncExternalStore(subscribe,()=>location.search,()=>''))}`;
const plugin = { name: "next-navigation-fixture", setup(builder) {
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "next/navigation" ? navigation : "import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}", loader: "js", resolveDir: process.cwd() }));
} };
const source = `import React from'react';import{createRoot}from'react-dom/client';import{usePathname}from'next/navigation';import{AccountNotifications}from'./src/components/notifications';import{AdminShell}from'./src/components/admin-shell';import NotificationsPage from'./src/app/admin/notifications/page';import{CustomerSessionProvider}from'./src/components/customer-session';import{customerAuth,adminAuth}from'./src/components/auth-clients';function Probe(){const c=customerAuth.useSession(),a=adminAuth.useSession();window.__checkCustomer=()=>c.refetch({query:{disableCookieCache:true}});window.__checkAdmin=()=>a.refetch({query:{disableCookieCache:true}});return null}function App(){const path=usePathname();return <><Probe/>{path.startsWith('/admin/')?<AdminShell>{path==='/admin/login'?<h1>ورود کنترل‌شدهٔ مدیریت</h1>:<NotificationsPage/>}</AdminShell>:<CustomerSessionProvider><main className='page'><h1>حساب کنترل‌شده</h1><AccountNotifications/></main></CustomerSessionProvider>}</>}createRoot(document.getElementById('root')).render(<App/>);`;
const options = { bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [plugin] };
const built = await build({ ...options, stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" }, platform: "browser", format: "iife" });
const ssr = await build({ ...options, stdin: { contents: `import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{AccountNotifications}from'./src/components/notifications';import{AdminNotifications}from'./src/components/admin-notifications';export function render(){return renderToStaticMarkup(<><AccountNotifications/><AdminNotifications/></>);}`, resolveDir: process.cwd(), loader: "tsx" }, platform: "node", format: "cjs" });
const module = { exports: {} }; let ssrRequests = 0;
runInNewContext(ssr.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url), console, process, Buffer, URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout, queueMicrotask, fetch() { ssrRequests++; throw new Error("SSR transport forbidden"); } });
const markup = module.exports.render(); assert.ok(markup.includes("در حال بررسی حساب")); assert.equal(markup.includes("order-panel"), false); assert.equal(markup.includes("style="), false); assert.equal(ssrRequests, 0);
const css = (await readFile("public/brand/tokens.css", "utf8")) + (await readFile("src/styles/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, ""), font = await readFile("public/brand/fonts/Vazirmatn[wght].woff2");
const html = '<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون کنترل‌شدهٔ اعلان‌ها</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, orderId = id(901);
const results = [{ case: "SSR pending customer/operator, no rows or transport", passed: true }];

for (const [engine, launch] of [["Chromium", () => chromium.launch({ channel: "chrome" })], ["WebKit", () => webkit.launch()]]) {
  const browser = await launch(), context = await browser.newContext({ viewport: { width: 320, height: 800 } }), page = await context.newPage();
  page.setDefaultTimeout(10000);
  let actor = "A", role = "owner", permissions = ["orders.fulfill", "refunds.write", "orders.read"], mfa = true;
  let mode = "success", readMode = "success", nativeMode = "success", unread = "9007199254740993";
  const seen = [], writes = [], heldFeeds = [], heldReads = [], heldNative = [], errors = [], readIds = new Set();
  page.on("pageerror", error => errors.push(error.message));
  const adminSession = () => ({ user: { id: `operator-${actor}`, name: "مدیر کنترل‌شده", email: "fixture@example.invalid" }, role, roles: [role], permissions, mfaVerified: mfa });
  const native = audience => actor ? { user: { id: `${audience === "operator" ? "operator" : "customer"}-${actor}`, name: "حساب کنترل‌شده", email: "fixture@example.invalid", emailVerified: true, twoFactorEnabled: true, phoneNumberVerified: true, createdAt: "2026-10-12T09:00:00Z", updatedAt: "2026-10-12T09:00:00Z" }, session: { id: `native-${actor}`, userId: `${audience === "operator" ? "operator" : "customer"}-${actor}`, expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-10-12T09:00:00Z", updatedAt: "2026-10-12T09:00:00Z" } } : null;
  const nativeReply = audience => nativeMode === "error" ? { status: 503, json: { code: "CONTROLLED", message: "Controlled native error" } } : { json: native(audience) };
  const feed = (audience, query) => {
    const page = Number(query.page), size = Number(query.pageSize), only = query.unreadOnly === "true";
    const totalItems = mode === "empty" ? 0 : 235, totalPages = Math.ceil(totalItems / size);
    let items = page > totalPages || !totalItems ? [] : [0, 1].map(index => {
      const n = (page - 1) * size + index + 1, noticeId = id(n);
      return { id: noticeId, kind: "legacy.order_update", title: `PRIVATE_${audience}_${actor}_${n}`, body: `متن کنترل‌شدهٔ اعلان ${n} Mixed Morphiume`, orderId: index === 0 ? orderId : null, createdAt: "2026-10-12T09:00:00Z", readAt: readIds.has(noticeId) || index === 1 ? "2026-10-12T10:00:00Z" : null };
    });
    if (only) items = items.filter(item => !item.readAt);
    return { items, page, pageSize: size, totalItems, totalPages, unreadCount: mode === "empty" ? "0" : unread, rawPayload: "PRIVATE_PAYLOAD_CANARY", lastError: "PRIVATE_ERROR_CANARY", providerReference: "PRIVATE_REF_CANARY", internalEvidence: "PRIVATE_EVIDENCE_CANARY" };
  };
  const release = async (held, reply) => { for (const value of held.splice(0)) await value.route.fulfill(reply ? reply(value) : { json: { data: value.data } }).catch(() => {}); };
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname; assert.equal(url.origin, origin);
    if (path === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: built.outputFiles[0].text });
    if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
    if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: font });
    if (path === "/api/admin/session") return route.fulfill({ json: { data: adminSession() } });
    if (path === "/api/auth/get-session" || path === "/api/admin/auth/get-session") {
      const audience = path.includes("admin") ? "operator" : "customer";
      if (nativeMode === "held") { heldNative.push({ route, audience }); return; }
      return route.fulfill(nativeReply(audience));
    }
    if (path === "/api/notifications/page" || path === "/api/admin/notifications/page") {
      const audience = path.includes("admin") ? "operator" : "customer", query = Object.fromEntries(url.searchParams);
      assert.deepEqual(Object.keys(query).sort(), ["page", "pageSize", "unreadOnly"]); assert.equal(url.searchParams.size, 3);
      assert.ok(Number(query.page) >= 1); assert.ok([20, 50, 100].includes(Number(query.pageSize))); assert.ok(["true", "false"].includes(query.unreadOnly));
      seen.push({ audience, actor, query });
      if (["401", "403", "error"].includes(mode)) return route.fulfill({ status: mode === "error" ? 503 : Number(mode), json: { error: { code: mode === "error" ? "INTERNAL" : "FORBIDDEN", message: "اعلان‌های کنترل‌شده دریافت نشدند." } } });
      const data = feed(audience, query); if (mode === "held") { heldFeeds.push({ route, data }); return; }
      return route.fulfill({ json: { data } });
    }
    if (/^\/api\/(admin\/)?notifications\/[\da-f-]+$/.test(path)) {
      assert.equal(req.method(), "PATCH"); assert.equal(req.postData(), "{}"); assert.equal(req.headers()["content-type"], "application/json");
      const notificationId = path.split("/").at(-1); writes.push({ path, actor, body: req.postData() });
      if (["401", "403", "error"].includes(readMode)) return route.fulfill({ status: readMode === "error" ? 503 : Number(readMode), json: { error: { code: "FORBIDDEN", message: "ثبت خواندن انجام نشد." } } });
      if (readMode === "held") { heldReads.push({ route, data: { id: notificationId, readAt: "2026-10-12T10:00:00Z" } }); return; }
      readIds.add(notificationId); unread = String(BigInt(unread) - 1n); return route.fulfill({ json: { data: { id: notificationId, readAt: "2026-10-12T10:00:00Z" } } });
    }
    assert.ok(!path.startsWith("/api/"), "Unexpected API or actual mutation boundary");
    return route.fulfill({ contentType: "text/html", body: html });
  });
  const unreadLine = () => page.getByText("اعلان‌های خوانده‌نشده در همهٔ صفحه‌ها:", { exact: false });
  const refresh = () => page.getByRole("button", { name: "تازه‌سازی اعلان‌ها", exact: true });
  const firstRead = () => page.getByRole("button", { name: "علامت‌گذاری به‌عنوان خوانده‌شده", exact: true }).first();
  const check = audience => page.evaluate(which => { void (which === "customer" ? window.__checkCustomer() : window.__checkAdmin()); }, audience);
  const noRows = () => expect(page.locator("article.order-panel")).toHaveCount(0);
  const auditLayout = async () => {
    assert.equal(await page.evaluate(() => isSecureContext), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await expect(page.locator("[style]")).toHaveCount(0);
    for (const marker of ["PRIVATE_PAYLOAD_CANARY", "PRIVATE_ERROR_CANARY", "PRIVATE_REF_CANARY", "PRIVATE_EVIDENCE_CANARY"]) assert.ok(!(await page.locator("body").innerText()).includes(marker));
    await refresh().focus(); await expect(refresh()).toBeFocused(); await page.keyboard.press("Enter"); await expect(unreadLine()).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.filter(value => ["serious", "critical"].includes(value.impact)).map(value => value.id), []);
  };
  try {
    await page.goto(`${origin}/account`); await expect(unreadLine()).toContainText("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳");
    assert.deepEqual(seen.at(-1).query, { page: "1", pageSize: "20", unreadOnly: "false" });
    await expect(page.getByRole("link", { name: "مشاهدهٔ سفارش", exact: true })).toHaveAttribute("href", `/orders/${orderId}`);
    await auditLayout(); results.push({ engine, case: "customer typed page/global BigInt count/PII-field exclusion/RTL320/keyboard/tagged axe", passed: true });

    await page.getByRole("button", { name: "صفحهٔ بعد", exact: true }).click(); await expect.poll(() => seen.at(-1).query.page).toBe("2"); await expect(page.getByText("PRIVATE_customer_A_21", { exact: true })).toBeVisible();
    await page.getByLabel("فقط خوانده‌نشده‌ها", { exact: true }).check(); await expect.poll(() => seen.at(-1).query).toEqual({ page: "1", pageSize: "20", unreadOnly: "true" }); await expect(page.locator("article.order-panel")).toHaveCount(1);
    await page.getByLabel("اعلان در هر صفحه", { exact: true }).selectOption("100"); await expect.poll(() => seen.at(-1).query.pageSize).toBe("100");
    const readStart = writes.length; readMode = "held";
    await firstRead().evaluate(button => { button.click(); button.click(); }); await expect.poll(() => heldReads.length).toBe(1); assert.equal(writes.length, readStart + 1);
    readIds.add(id(1)); unread = String(BigInt(unread) - 1n); readMode = "success"; await release(heldReads);
    await expect(page.getByText("اعلان به‌عنوان خوانده‌شده ثبت شد.", { exact: true })).toBeVisible(); await expect(unreadLine()).toContainText("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۲"); await expect(page.getByRole("heading", { name: "اعلان خوانده‌نشده‌ای در این صفحه ندارید.", exact: true })).toBeVisible();
    await page.getByLabel("فقط خوانده‌نشده‌ها", { exact: true }).uncheck(); await expect(page.locator("article.order-panel")).toHaveCount(2);
    mode = "error"; await refresh().click(); await expect(page.getByText("اعلان‌ها دریافت نشدند.", { exact: false })).toBeVisible(); await noRows();
    await expect(page.getByLabel("اعلان در هر صفحه", { exact: true })).toHaveValue("100"); mode = "success"; await page.getByRole("button", { name: "تلاش دوبارهٔ اعلان‌ها", exact: true }).click(); await expect(page.locator("article.order-panel")).toHaveCount(2);
    mode = "empty"; await refresh().click(); await expect(unreadLine()).toContainText("۰"); await expect(page.getByRole("heading", { name: "در این صفحه اعلانی وجود ندارد.", exact: true })).toBeVisible();
    mode = "success"; results.push({ engine, case: "page/filter/100/reset/query whitelist/single exact read/global count/empty/error retry", passed: true });

    readIds.clear(); await refresh().click(); await expect(page.locator("article.order-panel")).toHaveCount(2);
    const beforeReadError = writes.length; readMode = "error"; await firstRead().click(); await expect(page.getByText("ثبت خواندن انجام نشد.", { exact: true })).toBeVisible(); await expect(firstRead()).toBeEnabled(); assert.equal(writes.length, beforeReadError + 1); readMode = "success";
    for (const deniedMode of ["401", "403"]) { mode = deniedMode; await refresh().click(); await expect(page.getByText("بررسی حساب انجام نشد.", { exact: false })).toBeVisible(); await noRows(); mode = "success"; await page.goto(`${origin}/account`); await expect(page.locator("article.order-panel")).toHaveCount(2); }
    nativeMode = "held"; await check("customer"); await expect.poll(() => heldNative.length).toBeGreaterThan(0); await noRows();
    nativeMode = "error"; await release(heldNative, value => nativeReply(value.audience)); await expect(page.getByText("بررسی حساب انجام نشد.", { exact: false })).toBeVisible(); await noRows();
    nativeMode = "success"; await check("customer"); await expect(page.locator("article.order-panel")).toHaveCount(2);
    mode = "held"; await refresh().click(); await expect.poll(() => heldFeeds.length).toBe(1); actor = "B"; mode = "success"; await check("customer"); await expect(page.getByText("PRIVATE_customer_B_1", { exact: true })).toBeVisible(); await release(heldFeeds); await expect(page.getByText("PRIVATE_customer_A_1", { exact: true })).toHaveCount(0);
    readIds.clear(); unread = "2"; await refresh().click(); await expect(firstRead()).toBeVisible(); readMode = "held"; await firstRead().click(); await expect.poll(() => heldReads.length).toBe(1);
    actor = "C"; readMode = "success"; await check("customer"); await expect(page.getByText("PRIVATE_customer_C_1", { exact: true })).toBeVisible(); await release(heldReads); await expect(page.getByText("اعلان به‌عنوان خوانده‌شده ثبت شد.", { exact: true })).toHaveCount(0);
    readMode = "403"; await firstRead().click(); await expect(page.getByText("بررسی حساب انجام نشد.", { exact: false })).toBeVisible(); await noRows();
    readMode = "success"; actor = null; await page.goto(`${origin}/account`); await expect(page.getByText("برای مشاهدهٔ اطلاعات حساب، وارد شوید.", { exact: false })).toBeVisible(); await noRows();
    results.push({ engine, case: "customer read failure/pending/error/get+read late owner switch/401403/logout private clear", passed: true });

    actor = "A"; permissions = ["orders.fulfill", "orders.read"]; role = "fulfillment"; mfa = true; readIds.clear(); unread = "9007199254740993";
    await page.goto(`${origin}/admin/notifications`); await expect(page.getByRole("heading", { name: "اعلان‌های مدیریت", exact: true })).toBeVisible(); await expect(unreadLine()).toBeVisible();
    await expect(page.getByRole("link", { name: "اعلان‌های مدیریت", exact: true })).toHaveAttribute("aria-current", "page"); await expect(page.getByRole("link", { name: "مشاهدهٔ سفارش", exact: true })).toHaveAttribute("href", `/admin/orders/${orderId}`);
    await firstRead().click(); await expect(unreadLine()).toContainText("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۲"); assert.ok(writes.at(-1).path.startsWith("/api/admin/notifications/"));
    await auditLayout(); results.push({ engine, case: "operator registered route/fulfillment/read/global count/RTL320/keyboard/tagged axe", passed: true });

    for (const denied of [{ role: "support", permissions: ["orders.read"] }, { role: "product_manager", permissions: ["catalog.write", "analytics.read"] }, { role: "owner", permissions: undefined }]) {
      role = denied.role; permissions = denied.permissions; const before = seen.length; await page.goto(`${origin}/admin/notifications`);
      await expect(page.getByText("اجازهٔ مشاهدهٔ اعلان‌های مدیریت را ندارید.", { exact: true })).toBeVisible(); await noRows(); await expect(page.getByRole("link", { name: "اعلان‌های مدیریت", exact: true })).toHaveCount(0); assert.equal(seen.length, before);
    }
    role = "finance"; permissions = ["refunds.write"]; await page.goto(`${origin}/admin/notifications`); await expect(unreadLine()).toBeVisible(); await expect(page.getByRole("link", { name: "مشاهدهٔ سفارش", exact: true })).toHaveCount(0);
    mfa = false; const beforeMfa = seen.length; await page.goto(`${origin}/admin/notifications`); await expect(page.getByRole("heading", { name: "ورود کنترل‌شدهٔ مدیریت", exact: true })).toBeVisible(); assert.equal(seen.length, beforeMfa); mfa = true;
    results.push({ engine, case: "explicit permission union/support+product manager+role-fallback denial/finance limited link/MFA gate", passed: true });

    permissions = ["refunds.write", "orders.read"]; readIds.clear(); await page.goto(`${origin}/admin/notifications`); await expect(unreadLine()).toBeVisible(); nativeMode = "held"; await check("operator"); await expect.poll(() => heldNative.length).toBeGreaterThan(0); await noRows(); nativeMode = "error"; await release(heldNative, value => nativeReply(value.audience)); await expect(page.getByText("حساب مدیریت نیازمند بررسی دوباره است.", { exact: false })).toBeVisible(); await noRows(); nativeMode = "success"; await check("operator"); await expect(unreadLine()).toBeVisible();
    mode = "held"; await refresh().click(); await expect.poll(() => heldFeeds.length).toBe(1); actor = "B"; mode = "success"; await check("operator"); await expect(page.getByText("حساب مدیریت نیازمند بررسی دوباره است.", { exact: false })).toBeVisible(); await release(heldFeeds); await noRows();
    await page.goto(`${origin}/admin/notifications`); await expect(unreadLine()).toBeVisible(); readMode = "held"; await firstRead().click(); await expect.poll(() => heldReads.length).toBe(1); actor = "C"; readMode = "success"; await check("operator"); await release(heldReads); await noRows(); await expect(page.getByText("اعلان به‌عنوان خوانده‌شده ثبت شد.", { exact: true })).toHaveCount(0);
    for (const deniedMode of ["401", "403"]) { await page.goto(`${origin}/admin/notifications`); await expect(unreadLine()).toBeVisible(); mode = deniedMode; await refresh().click(); await expect(page.getByRole("heading", { name: "ورود کنترل‌شدهٔ مدیریت", exact: true })).toBeVisible(); await noRows(); mode = "success"; }
    await page.goto(`${origin}/admin/notifications`); await expect(firstRead()).toBeVisible(); readMode = "403"; await firstRead().click(); await expect(page.getByRole("heading", { name: "ورود کنترل‌شدهٔ مدیریت", exact: true })).toBeVisible(); await noRows(); readMode = "success";
    assert.deepEqual(errors, []);
    const storage = await page.evaluate(() => Object.entries(localStorage));
    for (const [key, value] of storage) { assert.equal(key, "morphiume-customer-privacy-v1"); const anonymous = JSON.parse(value); assert.deepEqual(Object.keys(anonymous).sort(), ["kind", "signal"]); assert.ok(["privacy", "session"].includes(anonymous.kind)); assert.match(anonymous.signal, /^\d+:\d+$/); }
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).length), 0);
    results.push({ engine, case: "operator native pending/error/get+read late owner switch/401403 clear/no stored private data", passed: true });
  } finally {
    nativeMode = "success"; await release(heldNative, value => nativeReply(value.audience)); await release(heldFeeds); await release(heldReads); await context.close(); await browser.close();
  }
}
console.log(JSON.stringify({ result: "PASS", scope: "actual components/provider/installed auth client; intercepted insecure HTTP and controlled actors/DTOs; no application/native server/PG/worker proof", results }, null, 2));
