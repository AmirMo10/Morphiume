import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import type { BrowserContext } from "@playwright/test";
const { safeLifecycleEvent } = await import(pathToFileURL(resolve("tests/e2e/cart-lifecycle-diagnostics.ts")).href) as typeof import("./cart-lifecycle-diagnostics");
const valid = () => ({ kind: "input", timeMs: 1791838520950, nodeAlias: "phone", nodeId: 1, valuePresent: true, pendingVisible: false, paused: false });
test("Only fixed enums/timing/node IDs/presence booleans survive", () => {
  assert.deepEqual(safeLifecycleEvent(valid()), valid());
  assert.deepEqual(safeLifecycleEvent({ ...valid(), kind: "signal-privacy", nodeAlias: null, nodeId: null, valuePresent: false }), { ...valid(), kind: "signal-privacy", nodeAlias: null, nodeId: null, valuePresent: false });
});
for (const [name, value] of [["null", null], ["array", []], ["primitive", "provider-canary"], ["body", { ...valid(), body: "private" }], ["cookie", { ...valid(), cookie: "private" }], ["code", { ...valid(), code: "123456" }], ["URL", { ...valid(), url: "http://localhost/?phone=private" }], ["owner", { ...valid(), ownerId: "private" }], ["signalnonce", { ...valid(), signal: "private" }], ["unknownkind", { ...valid(), kind: "private" }], ["unknownnode", { ...valid(), nodeAlias: "private" }], ["mixednode", { ...valid(), nodeId: null }], ["unboundednode", { ...valid(), nodeId: 4097 }], ["fractionalnode", { ...valid(), nodeId: 1.25 }], ["invalidtime", { ...valid(), timeMs: Infinity }], ["negativetime", { ...valid(), timeMs: -1 }], ["stringtime", { ...valid(), timeMs: "private" }], ["stringpresence", { ...valid(), valuePresent: "private" }]] as const) test(`Diagnostic ${name} is rejected`, () => assert.equal(safeLifecycleEvent(value), null));

test("Serialized CJS callback runs independently of Node imports; baseline capture fails", async () => {
  const source = readFileSync("tests/e2e/cart-lifecycle-diagnostics.ts", "utf8");
  const compiled = transformSync(source, { loader: "ts", format: "cjs", target: "node24" }).code;
  const compiledModule = { exports: {} as Record<string, unknown> };
  runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: createRequire(import.meta.url), process, console });
  let callback: ((args: { bindingName: string; channelName: string; cap: number }) => void) | undefined;
  const context = { exposeBinding: async () => {}, on: () => {}, addInitScript: async (fn: typeof callback) => { callback = fn; } } as unknown as BrowserContext;
  const originalFlag = process.env.QA_CART_LIFECYCLE_DIAGNOSTICS;
  try {
    process.env.QA_CART_LIFECYCLE_DIAGNOSTICS = "1";
    const setup = compiledModule.exports.optionalCartLifecycleDiagnostics as (context: BrowserContext, engine: string) => Promise<unknown>;
    await setup(context, "chromium");
  } finally { if (originalFlag === undefined) delete process.env.QA_CART_LIFECYCLE_DIAGNOSTICS; else process.env.QA_CART_LIFECYCLE_DIAGNOSTICS = originalFlag; }
  assert.equal(typeof callback, "function");
  const captured = callback!.toString();
  function browserSandbox(fn: string) {
    const events: unknown[] = [], listeners: Record<string, () => void> = {};
    const window = { __testRecord: async (e: unknown) => { events.push(e); }, addEventListener: (name: string, cb: () => void) => { listeners[name] = cb; } };
    const sandbox = { window, document: { addEventListener: () => {}, querySelectorAll: () => [] }, performance: { timeOrigin: 1000, now: () => 10 }, MutationObserver: class { observe() {} }, BroadcastChannel: class { addEventListener() {} }, Element: class {}, HTMLInputElement: class {}, HTMLButtonElement: class {} };
    runInNewContext(`(${fn})({bindingName:'__testRecord',channelName:'synthetic',cap:256})`, sandbox);
    return { events, focus: listeners.focus! };
  }
  const fixed = browserSandbox(captured); fixed.focus();
  assert.deepEqual(JSON.parse(JSON.stringify(fixed.events)), [{ kind: "focus", timeMs: 1010, nodeAlias: null, nodeId: null, valuePresent: false, pendingVisible: false, paused: false }]);
  const baseline = browserSandbox(captured.replaceAll("globalThis.performance", "import_node_perf_hooks.performance"));
  assert.throws(() => baseline.focus(), /import_node_perf_hooks/u);
});
