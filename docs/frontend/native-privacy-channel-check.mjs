// Actual provider/native client and real two-page BroadcastChannel/storage transports.
// Every HTTP response is intercepted at a synthetic insecure origin; no app/native server/PG.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, webkit, expect } from "@playwright/test";

const origin = "http://192.0.2.1", channelName = "morphiume-customer-privacy-v1";
const source = `import React,{StrictMode,useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{CustomerSessionProvider,CustomerPrivateBoundary,useCustomerSession,invalidateCustomerPrivateState,denyCustomerPrivateState}from'./src/components/customer-session';
window.__scopes={};window.__invalidate=invalidateCustomerPrivateState;window.__deny=denyCustomerPrivateState;
function Probe({index}){const identity=useCustomerSession();window.__scopes[index]={generation:identity.generation,local:identity.guestResetGeneration,pending:identity.pending};window.__check=identity.revalidate;useEffect(()=>()=>{delete window.__scopes[index]},[index]);return <CustomerPrivateBoundary><p>PRIVATE_CONTROLLED_ACCOUNT</p></CustomerPrivateBoundary>}
function App(){const[count,setCount]=useState(1);window.__setCount=setCount;return <main><h1>آزمون چرخهٔ پیام بی‌نام</h1>{Array.from({length:count},(_,index)=><CustomerSessionProvider key={index}><Probe index={index}/></CustomerSessionProvider>)}</main>}
const app=<App/>;createRoot(document.getElementById('root')).render(new URL(location.href).searchParams.has('strict')?<StrictMode>{app}</StrictMode>:app);`;
const built = await build({ stdin: { contents: source, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "router-only", setup(builder) {
  builder.onResolve({ filter: /^next\/link$/ }, args => ({ path: args.path, namespace: "fixture-router" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture-router" }, () => ({ contents: "import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}", loader: "js", resolveDir: process.cwd() }));
} }] });
const session = { user: { id: "controlled-account", name: "Controlled", email: "fixture@example.invalid", emailVerified: false, createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" }, session: { id: "controlled-session", userId: "controlled-account", expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" } };
const html = '<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آزمون چرخهٔ پیام بی‌نام</title></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const results = [];
const engines = [["Chromium", () => chromium.launch({ channel: "chrome" })], ["WebKit", () => webkit.launch()]].filter(([engine]) => !process.argv.some(arg => arg.startsWith("--engine=")) || process.argv.includes(`--engine=${engine}`));
for (const [engine, launch] of engines) {
  const browser = await launch(), context = await browser.newContext();
  const aliases = new Map(), blocked = new Set(), held = [], requests = [], errors = [];
  await context.addInitScript(target => {
    const channels = new Map(), records = []; let serial = 0;
    window.__channels = { records, live: () => [...channels.keys()] };
    const Original = BroadcastChannel;
    window.BroadcastChannel = class extends Original {
      constructor(name) { super(name); if (name === target) { this.alias = ++serial; channels.set(this.alias, this); records.push({kind:"open",channel:this.alias}); } }
      postMessage(data) { if (this.name === target) records.push({kind:"post",channel:this.alias,keys:Object.keys(data).sort()}); return super.postMessage(data); }
      close() { if (this.name === target) { channels.delete(this.alias); records.push({kind:"close",channel:this.alias}); } return super.close(); }
      set onmessage(handler) { super.onmessage = this.name !== target ? handler : event => { records.push({kind:"receive",channel:this.alias,keys:Object.keys(event.data).sort()}); handler(event); }; }
      get onmessage() { return super.onmessage; }
    };
    window.addEventListener("storage", event => { if (event.key === target) records.push({kind:"storage",keys:Object.keys(JSON.parse(event.newValue)).sort()}); });
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if (key === target) records.push({kind:"storage-post",keys:Object.keys(JSON.parse(value)).sort()}); return nativeSetItem.call(this,key,value); };
  }, channelName);
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), alias = aliases.get(request.frame().page()) ?? "new-page";
    assert.equal(url.origin, origin);
    if (url.pathname === "/fixture.js") return route.fulfill({contentType:"application/javascript",body:built.outputFiles[0].text});
    if (url.pathname === "/api/auth/get-session") { requests.push({alias,fresh:url.searchParams.get("disableCookieCache")==="true"}); if (blocked.has(alias)) { held.push({alias,route}); return; } return route.fulfill({json:session}); }
    assert.ok(!url.pathname.startsWith("/api/"), "No mutation/native-server boundary exists in this fixture");
    return route.fulfill({contentType:"text/html",body:html});
  });
  const release = async alias => { blocked.delete(alias); for (let index=held.length-1;index>=0;index--) if (held[index].alias===alias) {const[{route}]=held.splice(index,1);await route.fulfill({json:session}).catch(()=>{});} };
  const createPage = async (alias, query="") => {
    const page=await context.newPage();aliases.set(page,alias);page.on("pageerror",error=>errors.push({alias,message:error.message}));
    await page.goto(`${origin}/account${query}`);await expect(page.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    // Open each page's storage area before exercising native cross-page storage delivery.
    await page.evaluate(target=>localStorage.getItem(target),channelName);
    await expect.poll(()=>page.evaluate(()=>window.__channels.live().length)).toBe(1);
    return page;
  };
  const records = page => page.evaluate(()=>window.__channels.records);
  const scope = page => page.evaluate(()=>window.__scopes[0]);
  const live = page => page.evaluate(()=>window.__channels.live());
  try {
    const sender=await createPage("sender"), peer=await createPage("peer");
    const ownChannel=(await live(sender))[0]; assert.equal((await live(sender)).length,1);
    const before=await scope(sender), peerBefore=await scope(peer), freshBefore=requests.filter(item=>item.alias==="sender"&&item.fresh).length;
    blocked.add("peer");await sender.evaluate(()=>window.__invalidate());
    await expect.poll(()=>requests.filter(item=>item.alias==="sender"&&item.fresh).length).toBeGreaterThan(freshBefore);
    await expect.poll(()=>held.filter(item=>item.alias==="peer").length).toBeGreaterThan(0);
    await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    await expect(peer.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(0);
    await expect.poll(async()=> (await records(peer)).filter(item=>item.kind==="receive").length).toBeGreaterThan(0);
    await expect.poll(async()=> (await records(peer)).filter(item=>item.kind==="storage").length).toBeGreaterThan(0);
    const after=await scope(sender), peerAfter=await scope(peer), ownRecords=await records(sender);
    assert.equal(after.generation,before.generation+1);assert.equal(after.local,before.local+1);
    assert.ok(peerAfter.generation>peerBefore.generation);assert.equal(peerAfter.local,peerBefore.local);
    assert.equal(ownRecords.filter(item=>item.kind==="receive").length,0);
    assert.ok(ownRecords.filter(item=>item.kind==="post").every(item=>item.channel===ownChannel));
    await release("peer");await expect(peer.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    results.push({engine,case:"persistent-no-self-echo-real-peer-both-transports",passed:true,localResetDelta:1,globalResetDelta:1,peerGlobalCleared:true,peerLocalResetDelta:0,peerPrivateHiddenUntilNative:true});

    const deniedBefore=await scope(sender);await sender.evaluate(()=>window.__deny());
    await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(0);
    const denied=await scope(sender);assert.equal(denied.local,deniedBefore.local+1);assert.equal(denied.generation,deniedBefore.generation+1);
    await sender.evaluate(()=>window.__check());await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    assert.equal((await records(sender)).filter(item=>item.kind==="receive").length,0);
    results.push({engine,case:"local-denial-remains-closed-until-native-check",passed:true});

    await sender.evaluate(()=>window.__setCount(2));await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(2);
    assert.deepEqual(await live(sender),[ownChannel]);
    await sender.evaluate(()=>window.__setCount(1));await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);assert.deepEqual(await live(sender),[ownChannel]);
    await sender.evaluate(()=>window.__setCount(0));await expect.poll(()=>live(sender)).toEqual([]);
    const peerBeforeFallback=await scope(peer);blocked.add("peer");await sender.evaluate(()=>window.__invalidate());
    await expect.poll(()=>held.filter(item=>item.alias==="peer").length).toBeGreaterThan(0);
    await expect(peer.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(0);
    assert.ok((await scope(peer)).generation>peerBeforeFallback.generation);
    assert.deepEqual(await live(sender),[]);
    const fallbackRecords=await records(sender), fallbackPost=fallbackRecords.filter(item=>item.kind==="post").at(-1);
    assert.notEqual(fallbackPost.channel,ownChannel);assert.ok(fallbackRecords.some(item=>item.kind==="close"&&item.channel===fallbackPost.channel));
    await release("peer");await expect(peer.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    await sender.evaluate(()=>window.__setCount(1));await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    await expect.poll(()=>sender.evaluate(()=>window.__channels.live().length)).toBe(1);
    const remounted=(await live(sender))[0];assert.notEqual(remounted,ownChannel);
    await sender.evaluate(()=>window.__invalidate());await expect(sender.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    const remountRecords=await records(sender);assert.equal(remountRecords.filter(item=>item.kind==="receive").length,0);assert.equal(remountRecords.filter(item=>item.kind==="post").at(-1).channel,remounted);
    results.push({engine,case:"multiple-provider-last-cleanup-no-provider-fallback-remount",passed:true,sharedLiveChannels:1,noProviderLiveChannels:0,fallbackClosed:true,remountUsesFreshChannel:true});

    const strict=await createPage("strict","?strict");
    assert.equal((await live(strict)).length,1);
    const strictRecords=await records(strict);assert.ok(strictRecords.filter(item=>item.kind==="open").length>=2);assert.ok(strictRecords.some(item=>item.kind==="close"));
    await strict.evaluate(()=>window.__invalidate());await expect(strict.getByText("PRIVATE_CONTROLLED_ACCOUNT",{exact:true})).toHaveCount(1);
    assert.equal((await records(strict)).filter(item=>item.kind==="receive").length,0);
    results.push({engine,case:"strict-mode-effect-cleanup-reopens-one-channel",passed:true});
    for (const page of [sender,peer,strict]) for (const item of await records(page)) if (item.keys) assert.deepEqual(item.keys,item.kind.startsWith("storage")?["kind","signal"]:["kind"]);
    assert.deepEqual(errors,[]);
  } catch (error) {
    const evidence = [];
    for (const [page,alias] of aliases) if (!page.isClosed()) evidence.push({alias,records:await records(page),scopes:await page.evaluate(()=>window.__scopes)});
    console.log(JSON.stringify({kind:"SAFE_CHANNEL_FIXTURE_FAILURE",engine,evidence,requests,errors:errors.map(({alias,message})=>({alias,category:/access control|cors/i.test(message)?"access-control":"other"}))}));
    throw error;
  } finally { for (const alias of blocked) await release(alias);await context.close();await browser.close(); }
}
console.log(JSON.stringify({scope:"actual provider/native client; real channel/storage objects; all HTTP synthetic intercepted",results},null,2));
