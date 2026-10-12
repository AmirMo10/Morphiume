// Real SSR + hydration of AdminLogin; auth/router responses remain controlled fixtures.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
const navigation = `export function useRouter(){return {replace(url){if(typeof window!=='undefined')history.replaceState(null,'',url)}}}`;
const plugin = { name: "controlled-navigation", setup(builder) { builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: navigation, loader: "js" })); } };
const common = { bundle: true, write: false, jsx: "automatic", plugins: [plugin], define: { "process.env.NODE_ENV": '"test"' } };
const server = await build({ ...common, platform: "node", format: "cjs", stdin: { contents: `import React from 'react';import {renderToString} from 'react-dom/server';import {AdminLogin} from './src/components/admin-login';export const html=renderToString(<AdminLogin/>);`, loader: "tsx", resolveDir: process.cwd() } });
const serverModule = { exports: {} };
new Function("require", "module", "exports", server.outputFiles[0].text)(createRequire(import.meta.url), serverModule, serverModule.exports);
const browserBundle = await build({ ...common, platform: "browser", format: "iife", stdin: { contents: `import React from 'react';import {hydrateRoot} from 'react-dom/client';import {AdminLogin} from './src/components/admin-login';hydrateRoot(document.getElementById('root'),<AdminLogin/>);`, loader: "tsx", resolveDir: process.cwd() } });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.message));
let releaseScript, signInBody, signInCount = 0;
try {
  await page.route("**/*", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/admin/login") return route.fulfill({ contentType: "text/html", body: `<html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body><div id="root">${serverModule.exports.html}</div><script src="/delayed.js"></script></body></html>` });
    if (path === "/delayed.js") { await new Promise(resolve => { releaseScript = resolve; }); return route.fulfill({ contentType: "application/javascript", body: browserBundle.outputFiles[0].text }); }
    if (path === "/api/admin/auth/sign-in/email") { signInCount++; signInBody = request.postDataJSON(); return route.fulfill({ json: { user: { id: "owner-fixture", email: "fixture@example.invalid", name: "مدیر آزمون" }, token: "controlled-fixture" } }); }
    if (path === "/api/admin/session") return route.fulfill({ json: { data: { user: { id: "owner-fixture", email: "fixture@example.invalid", name: "مدیر آزمون" }, role: "owner", mfaVerified: true } } });
    return route.fulfill({ status: 404, body: "Controlled fixture only" });
  });
  await page.goto("https://hydration.test/admin/login", { waitUntil: "commit" });
  await expect.poll(() => typeof releaseScript).toBe("function");
  await expect(page.getByRole("status")).toHaveText("در حال آماده‌سازی فرم ورود…");
  await expect(page.getByLabel("ایمیل مدیر", { exact: true })).toBeDisabled(); await expect(page.getByLabel("رمز عبور", { exact: true })).toBeDisabled(); await expect(page.getByRole("button", { name: "ورود و ادامه", exact: true })).toBeDisabled();
  expect(signInCount).toBe(0);
  releaseScript();
  await expect(page.getByLabel("ایمیل مدیر", { exact: true })).toBeEnabled(); await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByLabel("ایمیل مدیر", { exact: true }).fill("fixture@example.invalid"); await page.getByLabel("رمز عبور", { exact: true }).fill("Controlled fixture password"); await page.getByRole("button", { name: "ورود و ادامه", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin"); expect(signInCount).toBe(1); expect(signInBody).toMatchObject({ email: "fixture@example.invalid", password: "Controlled fixture password", rememberMe: false }); expect(errors).toEqual([]);
  console.log(JSON.stringify({ result: "PASS", scope: "actual AdminLogin SSR/hydration, held JavaScript, controlled native auth response", checks: ["server controls disabled with wait announcement", "controls enabled only after hydration", "post-hydration controlled input preserved through one native sign-in request", "no hydration page errors"] }));
} finally { releaseScript?.(); await browser.close(); }
