import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { BrowserContext, Page } from "@playwright/test";

const kinds = new Set(["node-created", "node-detached", "node-state", "input", "change", "click", "signal-session", "signal-privacy", "document-ready", "focus", "resume", "observer-cap"]);
const nodes = new Set(["phone", "code", "send", "verify"]);
const routes: Record<string, string> = { "/api/auth/sign-out": "native-signout", "/api/auth/get-session": "native-session", "/api/auth/phone-number/send-otp": "native-phone-send", "/api/auth/phone-number/verify": "native-phone-verify", "/api/cart": "cart-read", "/api/cart/claim": "cart-claim" };
export type LifecycleEvent = { kind: string; timeMs: number; nodeAlias: string | null; nodeId: number | null; valuePresent: boolean; pendingVisible: boolean; paused: boolean };
export function safeLifecycleEvent(value: unknown): LifecycleEvent | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "kind,nodeAlias,nodeId,paused,pendingVisible,timeMs,valuePresent" || typeof v.kind !== "string" || !kinds.has(v.kind) || typeof v.timeMs !== "number" || !Number.isFinite(v.timeMs) || v.timeMs < 0 || v.timeMs > 1e15 || (v.nodeAlias !== null && (typeof v.nodeAlias !== "string" || !nodes.has(v.nodeAlias))) || (v.nodeId !== null && (typeof v.nodeId !== "number" || !Number.isInteger(v.nodeId) || v.nodeId < 1 || v.nodeId > 4096)) || [v.valuePresent, v.pendingVisible, v.paused].some(x => typeof x !== "boolean")) return null;
  if ((v.nodeAlias === null) !== (v.nodeId === null)) return null;
  return { kind: v.kind, timeMs: v.timeMs, nodeAlias: v.nodeAlias as string | null, nodeId: v.nodeId as number | null, valuePresent: v.valuePresent as boolean, pendingVisible: v.pendingVisible as boolean, paused: v.paused as boolean };
}

// Serialized into each CUSTOMER page only. No API is replaced and no native
// request, signal or DOM event is synthesized, prevented or rewritten.
function passiveObserver({ bindingName, channelName, cap }: { bindingName: string; channelName: string; cap: number }) {
  const win = window as unknown as Record<string, (value: unknown) => Promise<void>>;
  let sent = 0, nextId = 0;
  const ids = new WeakMap<Element, number>(), tracked = new Map<Element, string>();
  const pending = () => [...document.querySelectorAll<HTMLElement>("[role=status]")].some(el => el.textContent?.trim() === "در حال بررسی حساب…" && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
  const nodeAlias = (element: Element): string | null => {
    if (element.matches("input#purchaser-phone")) return "phone";
    if (element.matches("input#verification-code")) return "code";
    if (element.matches(".phone-form button")) {
      const text = element.textContent?.trim();
      if (text === "دریافت کد تأیید" || text === "در حال ارسال کد…") return "send";
      if (text === "تأیید شماره" || text === "در حال تأیید…") return "verify";
    }
    return tracked.get(element) ?? null;
  };
  const emit = (kind: string, element: Element | null = null) => {
    if (sent >= cap) return;
    if (sent === cap - 1) { sent++; void win[bindingName]?.({ kind: "observer-cap", timeMs: globalThis.performance.timeOrigin + globalThis.performance.now(), nodeAlias: null, nodeId: null, valuePresent: false, pendingVisible: pending(), paused: false }).catch(() => {}); return; }
    const alias = element ? nodeAlias(element) : null;
    if (element && !alias) return;
    if (element && !ids.has(element)) ids.set(element, ++nextId);
    if (nextId > 4096) return;
    sent++;
    const valuePresent = element instanceof HTMLInputElement && element.value.length > 0;
    const paused = !!element?.closest("[inert], [hidden], fieldset[disabled]") || (element instanceof HTMLButtonElement && element.disabled);
    const item = { kind, timeMs: globalThis.performance.timeOrigin + globalThis.performance.now(), nodeAlias: alias, nodeId: element ? ids.get(element)! : null, valuePresent, pendingVisible: pending(), paused };
    void win[bindingName]?.(item).catch(() => {});
  };
  const visit = (node: Node, created: boolean) => {
    if (!(node instanceof Element)) return;
    const selected = [node, ...node.querySelectorAll("input#purchaser-phone,input#verification-code,.phone-form button")];
    for (const element of selected) {
      const alias = nodeAlias(element); if (!alias) continue;
      if (created && !tracked.has(element) && nextId < 4096) { tracked.set(element, alias); emit("node-created", element); }
      else if (!created && tracked.has(element) && !element.isConnected) emit("node-detached", element);
    }
  };
  const observer = new MutationObserver(changes => {
    for (const change of changes) {
      change.removedNodes.forEach(node => visit(node, false));
      change.addedNodes.forEach(node => visit(node, true));
      if (change.type === "attributes" && change.target instanceof Element) {
        const target = change.target;
        if (nodeAlias(target)) emit("node-state", target);
        else for (const child of target.querySelectorAll("input#purchaser-phone,input#verification-code,.phone-form button")) emit("node-state", child);
      }
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "inert", "disabled", "value"] });
  document.addEventListener("DOMContentLoaded", () => { visit(document.documentElement, true); emit("document-ready"); }, { once: true });
  for (const type of ["input", "change", "click"]) document.addEventListener(type, event => { if (event.target instanceof Element && nodeAlias(event.target)) emit(type, event.target); }, { capture: true, passive: true });
  const signal = (kind: unknown) => { if (kind === "session" || kind === "privacy") emit(kind === "session" ? "signal-session" : "signal-privacy"); };
  let channel: BroadcastChannel | undefined;
  try { channel = new BroadcastChannel(channelName); channel.addEventListener("message", event => signal(event.data?.kind)); } catch { /* Optional observation only. */ }
  window.addEventListener("storage", event => { if (event.key !== channelName || !event.newValue || event.newValue.length > 1024) return; try { signal(JSON.parse(event.newValue)?.kind); } catch { /* No arbitrary signal payload retained. */ } }, { passive: true });
  window.addEventListener(channelName, () => signal("privacy"), { passive: true });
  window.addEventListener("focus", () => emit("focus"), { passive: true });
  window.addEventListener("pageshow", () => emit("resume"), { passive: true });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") emit("resume"); }, { passive: true });
  window.addEventListener("pagehide", () => { observer.disconnect(); channel?.close(); }, { once: true, passive: true });
}

export async function optionalCartLifecycleDiagnostics(context: BrowserContext, engine: string) {
  if (process.env.QA_CART_LIFECYCLE_DIAGNOSTICS !== "1") return undefined;
  if (!["chromium", "webkit", "firefox"].includes(engine)) throw new Error("Use a fixed diagnostic engine alias");
  const maximum = 2048, events: object[] = [], pages = new Map<Page, string>();
  let rejected = 0, dropped = 0, finished = false;
  const now = () => performance.timeOrigin + performance.now();
  const pageAlias = (page: Page) => { if (!pages.has(page)) pages.set(page, ["buyer", "peer", "account"][pages.size] ?? "other"); return pages.get(page)!; };
  const store = (event: object) => { if (finished) return; if (events.length >= maximum) { dropped++; return; } events.push(event); };
  const requestPage = (req: { frame(): { page(): Page } }) => { try { return pageAlias(req.frame().page()); } catch { return "other"; } };
  await context.exposeBinding("__qaCartLifecycleObserver", ({ page }, value) => {
    const safe = safeLifecycleEvent(value);
    if (!safe || Math.abs(safe.timeMs - now()) > 60000) { rejected++; return; }
    store({ ...safe, pageAlias: pageAlias(page) });
  });
  context.on("page", page => { pageAlias(page); });
  context.on("request", req => { let alias: string | undefined; try { alias = routes[new URL(req.url()).pathname]; } catch { return; } if (!alias) return; store({ kind: "http-request", timeMs: now(), routeAlias: alias, status: null, pageAlias: requestPage(req) }); });
  context.on("response", response => { const req = response.request(); let alias: string | undefined; try { alias = routes[new URL(req.url()).pathname]; } catch { return; } if (!alias) return; store({ kind: "http-response", timeMs: now(), routeAlias: alias, status: response.status(), pageAlias: requestPage(req) }); });
  context.on("requestfailed", req => { let alias: string | undefined; try { alias = routes[new URL(req.url()).pathname]; } catch { return; } if (!alias) return; store({ kind: "http-aborted", timeMs: now(), routeAlias: alias, status: null, pageAlias: requestPage(req) }); });
  await context.addInitScript(passiveObserver, { bindingName: "__qaCartLifecycleObserver", channelName: "morphiume-customer-privacy-v1", cap: 256 });
  return {
    async finish() {
      if (finished) return; finished = true;
      try {
        await mkdir(".local/qa-lifecycle", { recursive: true, mode: 0o700 });
        await writeFile(`.local/qa-lifecycle/cart-account-${engine}-${Date.now()}.json`, JSON.stringify({ formatVersion: 1, mode: "passive-optional-diagnostic", maximum, events, dropped, rejected }), { flag: "wx", mode: 0o600 });
        console.info(`[cart-lifecycle-diagnostic] ${JSON.stringify({ stored: true, events: events.length, dropped, rejected })}`);
      } catch { console.info("[cart-lifecycle-diagnostic] {\"stored\":false}"); }
    },
  };
}
