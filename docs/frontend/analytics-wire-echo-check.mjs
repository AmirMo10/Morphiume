// Real loopback transport only: synthetic cookie, fresh browsers, no app/native server/PG.
// Output is restricted to mode/request aliases, status and header-presence/origin booleans.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit, expect } from "@playwright/test";

const origin = "http://localhost:3005", records = [], observations = [];
const allowedVariants = ["relative-same-origin", "absolute-same-origin", "absolute-cors", "request-cors", "actual-helper"];
const selected = process.argv.includes("--helper") ? "actual-helper" : process.argv.find(value => value.startsWith("--variant="))?.slice(10), serverCookie = process.argv.includes("--server-cookie");
const selectedEngine = process.argv.find(value => value.startsWith("--engine="))?.slice(9);
assert.ok(selected === undefined || allowedVariants.includes(selected));
assert.ok(selectedEngine === undefined || ["Chromium", "WebKit"].includes(selectedEngine));
const variants = selected ? [selected] : allowedVariants.slice(0, 3);
let active = "";
const helper = selected === "actual-helper" ? await build({ stdin: { contents: "import{captureAnalytics}from'./src/components/analytics-client';window.__actualCapture=captureAnalytics;", loader: "ts", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife" }) : null;
function safe(headers) {
  return {
    cookiePresent: headers.cookie !== undefined,
    authorizationPresent: headers.authorization !== undefined,
    refererPresent: headers.referer !== undefined,
    controlPresent: headers["x-morphiume-test-secret"] !== undefined,
    originPresent: headers.origin !== undefined,
    originIsCanonical: headers.origin === origin,
    originIsNull: headers.origin === "null",
    originIsOther: headers.origin !== undefined && headers.origin !== origin && headers.origin !== "null",
  };
}
const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>کنترل transport بی‌نام</title></head><body><h1>کنترل synthetic</h1><button id="run">اجرای کنترل</button><p id="result" role="status"></p>${helper ? '<script src="/helper.js"></script>' : ""}<script>
const variant=location.pathname.slice(1), mode=variant.endsWith('-cors')?'cors':'same-origin';
const endpoint=path=>variant.startsWith('absolute-')||variant.startsWith('request-')?new URL(path,window.location.origin).href:path;
const send=(path,options)=>variant.startsWith('request-')?fetch(new Request(endpoint(path),options)):fetch(endpoint(path),options);
document.getElementById('run').onclick=async()=>{
try {
  const credentialed=await fetch('/control',{credentials:'same-origin',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
  if(variant==='actual-helper'){window.__actualCapture({kind:'product_view',productId:'00000000-0000-4000-8000-000000000002'});document.getElementById('result').textContent='helper-called';return;}
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),1000);
  try {
    const options={credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',mode,redirect:'error',signal:controller.signal};
    const config=await send('/api/analytics/config',options); await config.json();
    const body=JSON.stringify({kind:'product_view',eventId:crypto.randomUUID(),productId:'00000000-0000-4000-8000-000000000002'});
    const event=await send('/api/analytics/events',{...options,method:'POST',headers:{'Content-Type':'application/json'},body}); await event.json();
    document.getElementById('result').textContent=credentialed.status+':'+config.status+':'+event.status;
  } finally {clearTimeout(timer);}
} catch {document.getElementById('result').textContent='controlled-error';}
};</script></body></html>`;
const server = createServer((request, response) => {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) { response.writeHead(403).end(); return; }
  const url = new URL(request.url, origin), path = url.pathname;
  if (path === "/helper.js" && helper) { response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" }).end(helper.outputFiles[0].text); return; }
  if (variants.includes(path.slice(1))) { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(serverCookie ? { "Set-Cookie": "synthetic_only=controlled-no-native-data; Path=/; HttpOnly; SameSite=Lax" } : {}) }).end(html); return; }
  const kind = path === "/control" ? "credentialed-control" : path === "/api/analytics/config" ? "config" : path === "/api/analytics/events" ? "event" : null;
  if (!kind) { response.writeHead(404).end(); return; }
  assert.equal(request.method, kind === "event" ? "POST" : "GET");
  records.push({ alias: active, kind, ...safe(request.headers) });
  // Discard body without retaining/logging it; this is not the analytics collector.
  request.resume(); request.on("end", () => response.writeHead(kind === "event" ? 202 : 200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ data: kind === "config" ? { captureEnabled: true } : { ok: true } })));
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(3005, "127.0.0.1", resolve); });
try {
  for (const [engine, launch] of [["Chromium", () => chromium.launch({ channel: "chrome" })], ["WebKit", () => webkit.launch()]]) {
    if (selectedEngine && selectedEngine !== engine) continue;
    const browser = await launch();
    try {
      for (const variant of variants) {
        active = `${engine}:${variant}`;
        const context = await browser.newContext(), page = await context.newPage(), wire = [], errors = [], pending = [];
        page.on("pageerror", () => errors.push("pageerror"));
        page.on("request", request => {
          const path = new URL(request.url()).pathname, kind = path === "/control" ? "credentialed-control" : path === "/api/analytics/config" ? "config" : path === "/api/analytics/events" ? "event" : null;
          if (kind) pending.push((async () => { const headers = await request.allHeaders(), response = await request.response(); wire.push({ kind, status: response?.status() ?? null, ...safe(headers) }); })());
        });
        try {
          if (!serverCookie) await context.addCookies([{ name: "synthetic_only", value: "controlled-no-native-data", url: origin, httpOnly: true, sameSite: "Lax" }]);
          await page.goto(`${origin}/${variant}`); await page.getByRole("button", { name: "اجرای کنترل", exact: true }).click();
          await expect(page.getByRole("status")).toHaveText(helper ? "helper-called" : "200:200:202"); await expect.poll(() => records.filter(item => item.alias === active).length).toBe(3); await expect.poll(() => pending.length).toBe(3); await Promise.all(pending);
          const actual = records.filter(item => item.alias === active).map(({ alias: _alias, ...rest }) => rest);
          assert.equal(actual.length, 3); assert.equal(wire.length, 3); assert.deepEqual(errors, []);
          assert.equal(actual.find(item => item.kind === "credentialed-control").cookiePresent, true);
          assert.equal(wire.find(item => item.kind === "credentialed-control").cookiePresent, true);
          const privacyPassed = actual.filter(item => item.kind !== "credentialed-control").every(item => !item.cookiePresent && !item.authorizationPresent && !item.refererPresent && !item.controlPresent);
          const canonicalPassed = actual.find(item => item.kind === "event").originIsCanonical;
          observations.push({ engine, variant, cookieSetup: serverCookie ? "HTTP-set-cookie" : "context-synthetic-cookie", routesInstalled: false, serverReceived: actual, playwrightAllHeaders: wire, privacyPassed, canonicalPassed });
          console.log(JSON.stringify(observations.at(-1)));
          if (variant.endsWith("-cors") || helper) { assert.equal(canonicalPassed, true); assert.equal(privacyPassed, true); }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  console.log(JSON.stringify({ result: "DIAGNOSTIC", scope: "real isolated loopback transport with synthetic cookie only; no app/native credentials/PG; candidate is asserted, baseline booleans preserved", observations }, null, 2));
} finally { await new Promise(resolve => server.close(resolve)); }
