"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ProductDto, ProductResolutionDto } from "@/contracts/commerce";
import { CustomerSessionError, useCustomerSession } from "./customer-session";
import { api, Empty, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { ProductTile } from "./catalog";
import { usePagedData } from "./use-paged-data";
const key = "morphiume-wishlist";
const uuid = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;
function validIds(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && uuid.test(id.trim())).map(id => id.trim().toLowerCase()))].slice(0, 100) : []; }
function snapshot() { try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; } }
function subscribe(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener("morphiume:wishlist", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("morphiume:wishlist", callback); }; }
function writeGuest(ids: string[]) { localStorage.setItem(key, JSON.stringify(validIds(ids))); window.dispatchEvent(new Event("morphiume:wishlist")); }
function useGuestWishlist() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const ids = useMemo(() => { try { return validIds(JSON.parse(value)); } catch { return []; } }, [value]);
  useEffect(() => { if (value !== JSON.stringify(ids)) try { writeGuest(ids); } catch { /* Reading remains usable when browser storage is unavailable. */ } }, [value, ids]);
  return ids;
}

type WishlistReader = { data: ProductDto[] | null; changes: Record<string, boolean>; loading: boolean; error: string; reload: () => void; confirmChange: (productId: string, enabled: boolean) => void };
const WishlistContext = createContext<WishlistReader | null>(null);
/** One private read for all public cards and account views; snapshots never cross actors. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const identity = useCustomerSession();
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ scopeKey: string; attempt: number; data: ProductDto[] | null; changes: Record<string, boolean>; error: string } | null>(null);
  const readerSequence = useRef(0), readerFlight = useRef<AbortController | null>(null);
  const reload = useCallback(() => { readerSequence.current++; readerFlight.current?.abort(); setAttempt(previous => previous + 1); }, []);
  useEffect(() => {
    if (identity.pending || !identity.ownerId) return;
    const controller = new AbortController();
    const ticket = ++readerSequence.current;
    readerFlight.current = controller;
    let active = true, timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    api<ProductDto[]>("/api/wishlist", { signal: controller.signal }).then(data => {
      if (active && ticket === readerSequence.current) setSnapshot({ scopeKey: identity.scopeKey, attempt, data, changes: {}, error: "" });
    }).catch(failure => {
      if (active && ticket === readerSequence.current) setSnapshot({ scopeKey: identity.scopeKey, attempt, data: null, changes: {}, error: timedOut ? "دریافت علاقه‌مندی‌ها طول کشید. دوباره تلاش کنید." : errorMessage(failure) });
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); if (readerFlight.current === controller) readerFlight.current = null; };
  }, [identity.pending, identity.ownerId, identity.scopeKey, attempt]);
  const confirmChange = useCallback((productId: string, enabled: boolean) => {
    setSnapshot(previous => previous?.scopeKey === identity.scopeKey ? { ...previous, changes: { ...previous.changes, [productId]: enabled } } : previous);
    reload();
  }, [identity.scopeKey, reload]);
  const current = !identity.pending && identity.ownerId && snapshot?.scopeKey === identity.scopeKey ? snapshot : null;
  const value: WishlistReader = { data: current?.data ?? null, changes: current?.changes ?? {}, error: current?.attempt === attempt ? current.error : "", loading: !!identity.ownerId && (!current || current.attempt !== attempt), reload, confirmChange };
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
function useWishlistReader() {
  const value = useContext(WishlistContext);
  if (!value) throw new Error("WishlistProvider required");
  return value;
}
export function FavoriteButton({ productId }: { productId: string }) {
  const session = useCustomerSession();
  if (session.pending) return <button className="text-button" disabled>در حال بررسی علاقه‌مندی…</button>;
  return <FavoriteForActor key={`${session.scopeKey}:${productId}`} productId={productId} userId={session.ownerId ?? undefined} />;
}
function FavoriteForActor({ productId, userId }: { productId: string; userId?: string }) {
  const guest = useGuestWishlist();
  const server = useWishlistReader(), operation = useRef<AbortController | null>(null), inFlight = useRef(false);
  useEffect(() => () => operation.current?.abort(), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const selected = userId ? server.changes[productId] ?? server.data?.some(product => product.id === productId) ?? false : guest.includes(productId);
  const toggle = async () => { if (inFlight.current || (!!userId && (server.loading || server.error))) return; const controller = new AbortController(), signal = controller.signal; operation.current = controller; inFlight.current = true; setBusy(true); setError(""); try { if (userId) { await api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId, enabled: !selected }), signal }); if (!signal.aborted) server.confirmChange(productId, !selected); } else { if (!selected && guest.length >= 100) throw new Error("تا ۱۰۰ انتخاب در این دستگاه ذخیره می‌شود. برای افزودن عطر تازه، یکی از انتخاب‌ها را حذف کنید."); writeGuest(selected ? guest.filter(id => id !== productId) : [...guest, productId]); } } catch (e) { if (!signal.aborted) setError(errorMessage(e)); } finally { inFlight.current = false; if (operation.current === controller) operation.current = null; if (!signal.aborted) setBusy(false); } };
  return <><button className="text-button" aria-pressed={selected} disabled={busy || (!!userId && (server.loading || !!server.error))} onClick={toggle}>{selected ? "حذف از علاقه‌مندی‌ها" : "ذخیره در علاقه‌مندی‌ها"}</button>{(error || server.error) && <p className="field-error" role="alert">{error || server.error}{server.error && <button className="text-button" type="button" onClick={server.reload}>تلاش دوباره</button>}</p>}</>;
}
export function WishlistContent() {
  const session = useCustomerSession();
  if (session.pending) return session.error ? <CustomerSessionError /> : <Loading label="در حال بررسی حساب…" />;
  return <WishlistForActor key={session.scopeKey} userId={session.ownerId ?? undefined} />;
}
function WishlistForActor({ userId }: { userId?: string }) {
  const guest = useGuestWishlist();
  const server = useWishlistReader(), removal = useRef<AbortController | null>(null);
  useEffect(() => () => removal.current?.abort(), []);
  const resolved = usePagedData<ProductResolutionDto>("/api/catalog/resolve", new URLSearchParams({ ids: guest.join(",") }).toString(), !userId && guest.length > 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const mergeController = useRef<AbortController | null>(null);
  useEffect(() => () => mergeController.current?.abort(), []);
  const merge = async () => {
    if (!userId || busy) return;
    const controller = new AbortController(); mergeController.current = controller;
    setBusy(true); setError(""); const transferred = new Set<string>();
    try { for (let start = 0; start < guest.length && !controller.signal.aborted; start += 4) { const batch = guest.slice(start, start + 4); const results = await Promise.allSettled(batch.map(productId => api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId, enabled: true }), signal: controller.signal }))); results.forEach((result, index) => { if (result.status === "fulfilled") transferred.add(batch[index]!); }); } if (controller.signal.aborted) return; const remaining = guest.filter(id => !transferred.has(id)); let currentIds = guest; try { currentIds = validIds(JSON.parse(snapshot())); } catch { /* Keep the original valid choices if storage changed to malformed data. */ } writeGuest(currentIds.filter(id => !transferred.has(id))); if (!controller.signal.aborted) { server.reload(); setNotice(remaining.length ? `${faNumber(transferred.size)} انتخاب منتقل شد. انتقال ${faNumber(remaining.length)} انتخاب انجام نشد و در این دستگاه باقی ماند.` : "علاقه‌مندی‌های این دستگاه به حساب منتقل شدند."); } }
    catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const remove = async (id: string) => { if (busy || removal.current) return; const controller = new AbortController(), signal = controller.signal; removal.current = controller; setBusy(true); setError(""); try { if (userId) { await api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId: id, enabled: false }), signal }); if (!signal.aborted) server.confirmChange(id, false); } else writeGuest(guest.filter(productId => productId !== id)); } catch (e) { if (!signal.aborted) setError(errorMessage(e)); } finally { if (removal.current === controller) removal.current = null; if (!signal.aborted) setBusy(false); } };
  const failure = userId ? server.error : guest.length ? resolved.error : "";
  const loading = userId ? server.loading : guest.length ? resolved.loading : false;
  const visible = userId ? server.data ?? [] : guest.length ? resolved.data?.products ?? [] : [];
  const resolution = resolved.data;
  const unavailable = !userId && guest.length > 0 && resolution ? guest.filter(id => !resolution.products.some(product => product.id === id)) : [];
  const retry = userId ? server.reload : resolved.reload;
  return <>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{userId && guest.length > 0 && <Notice>در این دستگاه {faNumber(guest.length)} علاقه‌مندی ذخیره شده است. <button className="text-button" disabled={busy} onClick={merge}>انتقال به حساب</button></Notice>}{!userId && <p className="muted">این انتخاب‌ها در همین دستگاه ذخیره می‌شوند. پس از ورود می‌توانید آن‌ها را به حساب منتقل کنید.</p>}
    {failure ? <Notice error>{failure}<button className="text-button" onClick={retry}>تلاش دوباره</button></Notice> : loading ? <Loading /> : <>{visible.length > 0 && <div className="product-grid">{visible.map(product => <div key={product.id}><ProductTile product={product} showFavorite={false} /><button className="text-button" disabled={busy} onClick={() => remove(product.id)}>حذف از علاقه‌مندی‌ها</button></div>)}</div>}{unavailable.length > 0 && <section className="form-section"><h2>انتخاب‌های فعلاً غیرقابل نمایش</h2><p className="muted">این محصولات اکنون در کاتالوگ عمومی قابل نمایش نیستند. انتخاب‌ها در این دستگاه باقی مانده‌اند و می‌توانید آن‌ها را حذف کنید.</p><ul className="selection-list">{unavailable.map(id => <li key={id}><span>انتخاب ذخیره‌شدهٔ {faNumber(guest.indexOf(id) + 1)}</span><button className="text-button" disabled={busy} onClick={() => remove(id)}>حذف این انتخاب</button></li>)}</ul><Link className="text-link" href="/products">مشاهدهٔ عطرها</Link></section>}{!visible.length && !unavailable.length && <Empty title="هنوز عطری در علاقه‌مندی‌ها ندارید."><Link className="button secondary" href="/products">مشاهدهٔ عطرها</Link></Empty>}</>}
  </>;
}
