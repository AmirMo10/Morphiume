// Real helper under deterministic boundaries plus native browser contexts; no commerce/auth/DB calls.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { chromium, webkit } from "@playwright/test";
const built=await build({entryPoints:["src/components/operation-id.ts"],bundle:true,write:false,platform:"neutral",format:"cjs"}),script=built.outputFiles[0].text;
function load(source,accessThrows=false){const module={exports:{}},sandbox={module,exports:module.exports};let reads=0;Object.defineProperty(sandbox,"crypto",{get(){reads++;if(accessThrows)throw new Error("No browser access during import");return source;}});runInNewContext(script,sandbox);assert.equal(reads,0);return{operationId:module.exports.operationId,reads:()=>reads};}
const keyPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let nativeCalls=0,fallbackCalls=0;
const native={randomUUID(){assert.equal(this,native);nativeCalls++;return"12345678-1234-4567-89ab-123456789abc";},getRandomValues(){fallbackCalls++;throw new Error("Unexpected fallback");}};
const nativeHelper=load(native);assert.equal(nativeHelper.operationId(),"12345678-1234-4567-89ab-123456789abc");assert.equal(nativeCalls,1);assert.equal(fallbackCalls,0);
const deterministic={getRandomValues(bytes){assert.equal(this,deterministic);assert.equal(bytes.length,16);bytes.forEach((_,i)=>bytes[i]=i);return bytes;}};
assert.equal(load(deterministic).operationId(),"00010203-0405-4607-8809-0a0b0c0d0e0f");
for(const [byte,expected]of [[0,"00000000-0000-4000-8000-000000000000"],[255,"ffffffff-ffff-4fff-bfff-ffffffffffff"]])assert.equal(load({getRandomValues(bytes){bytes.fill(byte);return bytes;}}).operationId(),expected);
for(const source of [undefined,{}, {getRandomValues(){throw new Error("Entropy failure");}}, {randomUUID(){throw new Error("Native failure");},getRandomValues(){throw new Error("No retry expected");}}])assert.throws(()=>load(source).operationId(),/شناسهٔ امن/);
assert.throws(()=>load(null,true).operationId(),/شناسهٔ امن/);
// Importing the actual module is safe without window or crypto: the throwing getter above was not touched.
const browserBundle=(await build({stdin:{contents:"import{operationId}from'./src/components/operation-id';window.__operationId=operationId;",resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"browser",format:"iife"})).outputFiles[0].text;
const results=[];
for(const [engine,launch]of [["Chromium",()=>chromium.launch({channel:"chrome"})],["WebKit",()=>webkit.launch()]]){
  const browser=await launch();try{
    const context=await browser.newContext(),page=await context.newPage();
    await page.route("**/*",route=>new URL(route.request().url()).pathname==="/fixture.js"?route.fulfill({contentType:"application/javascript",body:browserBundle}):route.fulfill({contentType:"text/html",body:'<html><head><title>Operation UUID fixture</title></head><body><script src="/fixture.js"></script></body></html>'}));
    for(const origin of ["https://uuid.example.invalid","http://192.0.2.1"]){
      await page.goto(origin);const proof=await page.evaluate(()=>({secure:isSecureContext,native:typeof crypto.randomUUID,values:typeof crypto.getRandomValues,ids:Array.from({length:4096},()=>window.__operationId())}));
      assert.equal(proof.secure,origin.startsWith("https:"));assert.equal(proof.values,"function");assert.equal(proof.native,proof.secure?"function":"undefined");assert.equal(new Set(proof.ids).size,4096);assert.equal(proof.ids.every(id=>keyPattern.test(id)),true);results.push(`${engine}: actual ${proof.secure?"secure native":"insecure HTTP fallback"} context, 4096 valid/distinct UUIDs`);
    }
  }finally{await browser.close();}
}
console.log(JSON.stringify({result:"PASS",scope:"real helper deterministic VM + Chromium/WebKit intercepted browser origins; no app/DB/native auth",checks:["native receiver binding/no fallback","16 cryptographic bytes with exact v4/variant masks","fail closed missing/throwing entropy including native","SSR-safe module import without window or crypto read",...results]}));
