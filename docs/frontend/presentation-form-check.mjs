// Compare actual client draft normalization/validation with the actual strict schema; no DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
const built = await build({ stdin: { contents: "export {presentationValue,validatePresentation,moveSelection} from './src/components/presentation-form';export {presentationInput,defaultPresentation} from './src/server/presentation-schema';", resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, platform: "node", format: "cjs" });
const result = { exports: {} }; new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(import.meta.url), result, result.exports);
const { presentationValue, validatePresentation, moveSelection, presentationInput, defaultPresentation } = result.exports;
const valid = { ...defaultPresentation, expectedVersion: 4, reason: "دلیل کنترل‌شده" };
assert.deepEqual(validatePresentation(valid), {}); assert.equal(presentationInput.safeParse(valid).success, true);
assert.deepEqual(presentationValue({ ...defaultPresentation, heroTitle: "  ", heroDescription: " توضیح ", footerText: "", heroAction: { label: " عطرها ", href: " /products " }, configured: true, version: 7, unavailableLinks: ["/pages/withdrawn"] }), { ...defaultPresentation, heroTitle: null, heroDescription: "توضیح", footerText: null, heroAction: { label: "عطرها", href: "/products" } });
let rejected = 0;
const rejects = input => { assert.ok(Object.keys(validatePresentation(input)).length > 0); assert.equal(presentationInput.safeParse(input).success, false); rejected++; };
for (const href of ["https://example.invalid", "javascript:alert(1)", "/products?search=x", "/account#section", "/", "/api/admin/presentation"]) rejects({ ...valid, heroAction: { label: "پیوند", href } });
rejects({ ...valid, reason: " " }); rejects({ ...valid, heroTitle: "x".repeat(161) }); rejects({ ...valid, banner: { text: "", link: null } }); rejects({ ...valid, headerLinks: Array.from({ length: 9 }, () => ({ label: "عطرها", href: "/products" })) }); rejects({ ...valid, footerLinks: Array.from({ length: 13 }, () => ({ label: "حساب", href: "/account" })) });
rejects({ ...valid, services: [{ title: "", description: "", enabled: false, link: null }] }); rejects({ ...valid, services: Array.from({ length: 5 }, () => ({ title: "خدمت", description: "شرح", enabled: true, link: null })) });
const ids = Array.from({ length: 13 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`); rejects({ ...valid, featuredProductIds: ids }); rejects({ ...valid, featuredProductIds: [ids[0], ids[0]] }); rejects({ ...valid, featuredProductIds: ["bad-id"] });
const plain = { ...valid, heroTitle: "<script> متن ساده </script>", featuredProductIds: ids.slice(0,12), maintenance: { enabled: true, message: "پیام ساده" } }; assert.deepEqual(validatePresentation(plain), {}); assert.equal(presentationInput.safeParse(plain).success, true);
const original = ["first","hidden","second"]; assert.deepEqual(moveSelection(original,2,-1),["first","second","hidden"]); assert.deepEqual(original,["first","hidden","second"]); assert.deepEqual(moveSelection(original,0,-1),original);
console.log(JSON.stringify({result:"PASS",scope:"actual client helper versus strict server schema; no DB",checks:["normalization excludes metadata and preserves nullable fields","plain text remains text","bounds and internal href validation agree",`${rejected} invalid cases rejected by both`,`immutable reordering preserves retained IDs`]}));
