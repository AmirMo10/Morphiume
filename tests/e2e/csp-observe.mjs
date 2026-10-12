import { chromium, webkit } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const frameworkAttributeStyles = ["position:absolute", "position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal"].map(style => ({ style, hash: `sha256-${createHash("sha256").update(style).digest("base64")}` }));
const observations = [];
for (const [name, type, options] of [["chromium", chromium, { channel: "chrome" }], ["webkit", webkit, {}]]) {
  const browser = await type.launch(options);
  const page = await browser.newPage();
  const messages = [];
  page.on("console", message => {
    if (/content security policy|content-security-policy|inline style|inline script/i.test(message.text())) messages.push({ message: message.text().replace(/nonce-[A-Za-z0-9+/=_-]+/g, "nonce-<redacted>").slice(0, 180), suggestedHashes: message.text().match(/sha256-[A-Za-z0-9+/=]+/g) ?? [] });
  });
  await page.addInitScript(() => {
    window.__morphiumeCspObservations = [];
    window.__morphiumeStyleCalls = [];
    const record = value => { window.__morphiumeStyleCalls.push(value); if (window.__morphiumeStyleCalls.length > 100) window.__morphiumeStyleCalls.shift(); };
    const cssText = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "cssText");
    Object.defineProperty(CSSStyleDeclaration.prototype, "cssText", { ...cssText, set(value) { record({ type: "cssText", value: String(value) }); cssText.set.call(this, value); } });
    for (const name of ["display", "color", "position", "width", "height", "border", "overflow", "padding", "margin", "clip", "whiteSpace", "colorScheme"]) {
      const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, name);
      if (descriptor?.set) Object.defineProperty(CSSStyleDeclaration.prototype, name, { ...descriptor, set(value) { record({ type: "cssProperty", name, value: String(value) }); descriptor.set.call(this, value); } });
    }
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function(name, value, priority) { record({ type: "setProperty", name, value }); return setProperty.call(this, name, value, priority); };
    const removeProperty = CSSStyleDeclaration.prototype.removeProperty;
    CSSStyleDeclaration.prototype.removeProperty = function(name) { record({ type: "removeProperty", name }); return removeProperty.call(this, name); };
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) { if (name === "style") record({ type: "setAttribute", tag: this.tagName, value }); return setAttribute.call(this, name, value); };
    const removeAttribute = Element.prototype.removeAttribute;
    Element.prototype.removeAttribute = function(name) { if (name === "style") record({ type: "removeAttribute", tag: this.tagName }); return removeAttribute.call(this, name); };
    document.addEventListener("securitypolicyviolation", event => window.__morphiumeCspObservations.push({ directive: event.effectiveDirective, blocked: event.blockedURI, disposition: event.disposition, source: event.sourceFile, line: event.lineNumber, column: event.columnNumber, sample: event.sample, recentStyles: window.__morphiumeStyleCalls.slice(-12) }));
  });
  await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/products`);
  await page.waitForLoadState("networkidle");
  const baseline = { messages: [...messages], events: await page.evaluate(() => window.__morphiumeCspObservations), styleCalls: await page.evaluate(() => window.__morphiumeStyleCalls) };
  const announcer = await page.locator("next-route-announcer").evaluate(el => { const child = el.shadowRoot?.querySelector("div"); if (!child) return null; const parent = getComputedStyle(el), style = getComputedStyle(child); return { parentPosition: parent.position, childPosition: style.position, width: style.width, height: style.height, border: style.borderWidth, overflow: style.overflow }; });
  const arbitraryStyle = await page.evaluate(async () => {
    const probe = document.createElement("div");
    probe.textContent = "QA harmless CSP style validation";
    probe.setAttribute("style", "color:rgb(1,2,3)");
    document.body.append(probe);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const blocked = getComputedStyle(probe).color !== "rgb(1, 2, 3)";
    probe.remove();
    return blocked;
  });
  const afterNegative = await page.evaluate(() => window.__morphiumeCspObservations);
  const approvedProbe = await page.evaluate(async styles => {
    const probes = styles.map(style => { const probe = document.createElement("div"); probe.setAttribute("style", style); document.body.append(probe); return probe; });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const results = probes.map(probe => ({ position: getComputedStyle(probe).position, width: getComputedStyle(probe).width, height: getComputedStyle(probe).height }));
    probes.forEach(probe => probe.remove());
    return results;
  }, frameworkAttributeStyles.map(item => item.style));
  const afterApproved = await page.evaluate(() => window.__morphiumeCspObservations);
  const cssomShadowProbe = await page.evaluate(async styles => {
    const container = document.createElement("qa-csp-static-probe");
    container.style.cssText = styles[0];
    const child = document.createElement("div");
    child.style.cssText = styles[1];
    container.attachShadow({ mode: "open" }).append(child);
    document.body.append(container);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = { parentStyle: container.getAttribute("style"), childStyle: child.getAttribute("style"), width: getComputedStyle(child).width, height: getComputedStyle(child).height };
    container.remove();
    return result;
  }, frameworkAttributeStyles.map(item => item.style));
  const serializedHashes = [cssomShadowProbe.parentStyle, cssomShadowProbe.childStyle].map(style => ({ style, hash: `sha256-${createHash("sha256").update(style).digest("base64")}` }));
  const control = await browser.newPage();
  await control.addInitScript(() => { window.__qaControlCsp = []; document.addEventListener("securitypolicyviolation", event => window.__qaControlCsp.push({ directive: event.effectiveDirective, blocked: event.blockedURI, source: event.sourceFile, line: event.lineNumber, sample: event.sample })); });
  await control.route("**/products", async route => { const response = await route.fetch(); await route.fulfill({ response, body: '<!doctype html><html lang="fa" dir="rtl"><head><title>QA empty CSP control</title></head><body><p>QA empty control document without scripts or styles</p></body></html>' }); });
  await control.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/products`);
  await control.waitForLoadState("networkidle");
  const emptyDocumentControl = { events: await control.evaluate(() => window.__qaControlCsp), inlineStyleCount: await control.locator("[style]").count() };
  await control.unrouteAll();
  await control.route("**/products", async route => { const response = await route.fetch(); await route.fulfill({ response, body: '<!doctype html><html lang="fa" dir="rtl"><head><title>QA search control</title></head><body><label>QA native search<input type="search"></label></body></html>' }); });
  await control.reload();
  await control.waitForLoadState("networkidle");
  const nativeSearchControl = { events: await control.evaluate(() => window.__qaControlCsp), inlineStyleCount: await control.locator("[style]").count() };
  await control.unrouteAll();
  await control.route("**/products", async route => { const response = await route.fetch(); const markup = await response.text(); await route.fulfill({ response, body: markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "") }); });
  await control.reload();
  await control.waitForLoadState("networkidle");
  const fullMarkupWithoutScripts = { events: await control.evaluate(() => window.__qaControlCsp), inlineStyleCount: await control.locator("[style]").count() };
  await control.close();
  observations.push({ browser: name, version: browser.version(), baseline, announcer, arbitraryStyleBlocked: arbitraryStyle, expectedNegativeEvents: afterNegative.slice(baseline.events.length), approvedProbe, approvedProbeEvents: afterApproved.slice(afterNegative.length), cssomShadowProbe, cssomShadowProbeEvents: (await page.evaluate(() => window.__morphiumeCspObservations)).slice(afterApproved.length), serializedHashes, emptyDocumentControl, nativeSearchControl, fullMarkupWithoutScripts, inlineStyles: await page.locator("[style]").evaluateAll(elements => elements.map(el => ({ tag: el.tagName, style: el.getAttribute("style") }))) });
  await browser.close();
}
await mkdir("docs/qa", { recursive: true });
await writeFile("docs/qa/csp-observations.json", JSON.stringify({ generatedAt: new Date().toISOString(), scope: "anonymous catalog only", frameworkAttributeStyles, observations }, null, 2));
console.log(JSON.stringify({ frameworkAttributeStyles, observations }));
