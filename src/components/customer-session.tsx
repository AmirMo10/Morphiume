"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { customerAuth } from "./auth-clients";
import { clearCheckoutPrivateState } from "./cart-lifecycle";

const channelName = "morphiume-customer-privacy-v1", listeners = new Set<() => void>();
let generation = 0, guestResetGeneration = 0, signalCounter = 0, privateDenied = false;
const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
const snapshot = () => generation;
const guestResetSnapshot = () => guestResetGeneration;
function clearLocal(resetGuest = false) { clearCheckoutPrivateState(); if (resetGuest) guestResetGeneration++; generation++; listeners.forEach(callback => callback()); }
function resetGuest() { guestResetGeneration++; listeners.forEach(callback => callback()); }
function beginCheck() { if (privateDenied) { privateDenied = false; generation++; listeners.forEach(callback => callback()); } }
// One lifecycle-owned channel per window: sending on the receiver object cannot echo locally.
// Multiple mounted providers share it; the final cleanup releases it, including Strict Mode.
const privacyReceivers = new Set<(kind: unknown) => void>();
let privacyChannel: BroadcastChannel | undefined;
function subscribePrivacy(receive: (kind: unknown) => void) {
  privacyReceivers.add(receive);
  if (!privacyChannel) {
    try {
      privacyChannel = new BroadcastChannel(channelName);
      privacyChannel.onmessage = event => privacyReceivers.forEach(callback => callback(event.data?.kind));
    } catch { /* Use storage/native focus signals. */ }
  }
  return () => {
    privacyReceivers.delete(receive);
    if (!privacyReceivers.size) { privacyChannel?.close(); privacyChannel = undefined; }
  };
}
function broadcast(kind: "session" | "privacy") {
  try {
    if (privacyChannel) privacyChannel.postMessage({kind});
    else {
      // Before mount/after cleanup there is no local receiver to echo into.
      const channel = new BroadcastChannel(channelName); channel.postMessage({kind}); channel.close();
    }
  } catch { /* Storage signal also supports browsers without BroadcastChannel. */ }
  try { localStorage.setItem(channelName,JSON.stringify({kind,signal:`${Date.now()}:${++signalCounter}`})); } catch { /* Native focus/resume validation remains available without storage. */ }
}
export function invalidateCustomerPrivateState() { privateDenied = false; clearLocal(true); broadcast("privacy"); window.dispatchEvent(new Event(channelName)); }
export function denyCustomerPrivateState() { if (privateDenied) return; privateDenied = true; clearLocal(true); broadcast("privacy"); }
type CustomerScope = { ownerId: string | null; scopeKey: string; generation: number; guestResetGeneration: number; pending: boolean; error: boolean; revalidate: () => Promise<void> };
const Context = createContext<CustomerScope | null>(null);
export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const session = customerAuth.useSession(), epoch = useSyncExternalStore(subscribe,snapshot,()=>0), guestEpoch = useSyncExternalStore(subscribe,guestResetSnapshot,()=>0);
  const ownerId = session.data?.user.id ?? null, [checking,setChecking] = useState(false);
  const nativeRefetch = session.refetch;
  const [observedOwner,setObservedOwner] = useState<string | null | undefined>(undefined);
  const flight = useRef<Promise<void> | null>(null);
  const revalidate = useCallback(() => {
    if (flight.current) return flight.current;
    beginCheck();
    setChecking(true);
    const request = nativeRefetch({query:{disableCookieCache:true}}).finally(() => { flight.current = null; setChecking(false); });
    flight.current = request; return request;
  },[nativeRefetch]);
  useEffect(() => {
    if (session.isPending || session.error || observedOwner === ownerId) return;
    const last = observedOwner;
    // Observe the external native identity only after its local privacy reset settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObservedOwner(ownerId);
    if (last !== undefined && last !== ownerId) { privateDenied = false; if (last !== null) { clearLocal(true); broadcast("privacy"); } else { resetGuest(); broadcast("session"); } }
  },[ownerId,session.isPending,session.error,observedOwner]);
  useEffect(() => {
    const check = () => { void revalidate().catch(() => {}); };
    const resume = () => { if (document.visibilityState === "visible") check(); };
    const receive = (kind: unknown) => { if (kind === "privacy") clearLocal(); if (kind === "privacy" || kind === "session") check(); };
    const storage = (event: StorageEvent) => { if (event.key === channelName) { try { receive(JSON.parse(event.newValue ?? "null")?.kind); } catch { check(); } } };
    const unsubscribePrivacy = subscribePrivacy(receive);
    window.addEventListener("focus",check); window.addEventListener("pageshow",check); document.addEventListener("visibilitychange",resume); window.addEventListener("storage",storage); window.addEventListener(channelName,check);
    return () => { unsubscribePrivacy(); window.removeEventListener("focus",check); window.removeEventListener("pageshow",check); document.removeEventListener("visibilitychange",resume); window.removeEventListener("storage",storage); window.removeEventListener(channelName,check); };
  },[revalidate]);
  const ownerTransition = observedOwner !== undefined && observedOwner !== ownerId;
  const value: CustomerScope = {ownerId,scopeKey:`${ownerId ?? "guest"}:${epoch}`,generation:epoch,guestResetGeneration:guestEpoch,pending:checking || ownerTransition || session.isPending || session.isRefetching || !!session.error || privateDenied,error:!!session.error || privateDenied,revalidate};
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCustomerSession(): CustomerScope {
  const context = useContext(Context), native = customerAuth.useSession(), epoch = useSyncExternalStore(subscribe,snapshot,()=>0), guestEpoch = useSyncExternalStore(subscribe,guestResetSnapshot,()=>0);
  return context ?? {ownerId:native.data?.user.id ?? null,scopeKey:`${native.data?.user.id ?? "guest"}:${epoch}`,generation:epoch,guestResetGeneration:guestEpoch,pending:native.isPending || native.isRefetching || !!native.error || privateDenied,error:!!native.error || privateDenied,revalidate:()=>{ beginCheck(); return native.refetch({query:{disableCookieCache:true}}); }};
}
export function CustomerPrivateBoundary({ children }: { children: ReactNode }) {
  const identity = useCustomerSession();
  if (identity.pending) return identity.error ? <CustomerSessionError /> : <div role="status">در حال بررسی حساب…</div>;
  if (!identity.ownerId) return <p>برای مشاهدهٔ اطلاعات حساب، وارد شوید. <Link href="/account" className="text-link">ورود به حساب</Link></p>;
  return <div key={identity.scopeKey}>{children}</div>;
}
export function CustomerSessionError() {
  const identity = useCustomerSession(), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const logout = async () => { setBusy(true); setError(""); try { const result = await customerAuth.signOut(); if (result.error) throw new Error("خروج از حساب انجام نشد. دوباره تلاش کنید."); invalidateCustomerPrivateState(); await identity.revalidate(); } catch { setError("خروج از حساب انجام نشد. دوباره تلاش کنید."); } finally { setBusy(false); } };
  return <div role="alert" className="notice error"><p>بررسی حساب انجام نشد.</p>{error && <p>{error}</p>}<button className="text-button" disabled={busy} onClick={() => void identity.revalidate().catch(() => {})}>بررسی دوبارهٔ حساب</button><button className="text-button" disabled={busy} onClick={() => void logout()}>خروج برای ورود دوباره</button><Link href="/account" className="text-link">ورود برای پیگیری سفارش</Link></div>;
}
/** Tie private asynchronous work to the keyed component lifetime. */
export function useLifetimeSignal() {
  const [controller] = useState(() => new AbortController());
  useEffect(() => () => controller.abort(),[controller]);
  return controller.signal;
}
