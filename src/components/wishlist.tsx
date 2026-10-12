"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProductDto, ProductResolutionDto } from "@/contracts/commerce";
import { customerAuth } from "./auth-clients";
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
export function FavoriteButton({ productId }: { productId: string }) {
  const session = customerAuth.useSession();
  if (session.isPending) return <button className="text-button" disabled>در حال بررسی علاقه‌مندی…</button>;
  return <FavoriteForActor key={`${session.data?.user.id ?? "guest"}:${productId}`} productId={productId} userId={session.data?.user.id} />;
}
function FavoriteForActor({ productId, userId }: { productId: string; userId?: string }) {
  const guest = useGuestWishlist();
  const server = usePagedData<ProductDto[]>("/api/wishlist", "", !!userId);
  const [changed, setChanged] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const selected = userId ? changed ?? server.data?.some(product => product.id === productId) ?? false : guest.includes(productId);
  const toggle = async () => { if (busy) return; setBusy(true); setError(""); try { if (userId) { await api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId, enabled: !selected }) }); setChanged(!selected); } else { if (!selected && guest.length >= 100) throw new Error("تا ۱۰۰ انتخاب در این دستگاه ذخیره می‌شود. برای افزودن عطر تازه، یکی از انتخاب‌ها را حذف کنید."); writeGuest(selected ? guest.filter(id => id !== productId) : [...guest, productId]); } } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <><button className="text-button" aria-pressed={selected} disabled={busy || (!!userId && server.loading)} onClick={toggle}>{selected ? "حذف از علاقه‌مندی‌ها" : "ذخیره در علاقه‌مندی‌ها"}</button>{(error || server.error) && <p className="field-error" role="alert">{error || server.error}</p>}</>;
}
export function WishlistContent() {
  const session = customerAuth.useSession();
  if (session.isPending) return <Loading label="در حال بررسی حساب…" />;
  return <WishlistForActor key={session.data?.user.id ?? "guest"} userId={session.data?.user.id} />;
}
function WishlistForActor({ userId }: { userId?: string }) {
  const guest = useGuestWishlist();
  const server = usePagedData<ProductDto[]>("/api/wishlist", "", !!userId);
  const resolved = usePagedData<ProductResolutionDto>("/api/catalog/resolve", new URLSearchParams({ ids: guest.join(",") }).toString(), !userId && guest.length > 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const mergeController = useRef<AbortController | null>(null);
  useEffect(() => () => mergeController.current?.abort(), []);
  const merge = async () => {
    if (!userId || busy) return;
    const controller = new AbortController(); mergeController.current = controller;
    setBusy(true); setError(""); const transferred = new Set<string>();
    try { for (let start = 0; start < guest.length && !controller.signal.aborted; start += 4) { const batch = guest.slice(start, start + 4); const results = await Promise.allSettled(batch.map(productId => api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId, enabled: true }), signal: controller.signal }))); results.forEach((result, index) => { if (result.status === "fulfilled") transferred.add(batch[index]!); }); } const remaining = guest.filter(id => !transferred.has(id)); let currentIds = guest; try { currentIds = validIds(JSON.parse(snapshot())); } catch { /* Keep the original valid choices if storage changed to malformed data. */ } writeGuest(currentIds.filter(id => !transferred.has(id))); if (!controller.signal.aborted) { server.reload(); setNotice(remaining.length ? `${faNumber(transferred.size)} انتخاب منتقل شد. انتقال ${faNumber(remaining.length)} انتخاب انجام نشد و در این دستگاه باقی ماند.` : "علاقه‌مندی‌های این دستگاه به حساب منتقل شدند."); } }
    catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const remove = async (id: string) => { if (busy) return; setBusy(true); setError(""); try { if (userId) { await api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId: id, enabled: false }) }); server.reload(); } else writeGuest(guest.filter(productId => productId !== id)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const failure = userId ? server.error : guest.length ? resolved.error : "";
  const loading = userId ? server.loading : guest.length ? resolved.loading : false;
  const visible = userId ? server.data ?? [] : guest.length ? resolved.data?.products ?? [] : [];
  const resolution = resolved.data;
  const unavailable = !userId && guest.length > 0 && resolution ? guest.filter(id => !resolution.products.some(product => product.id === id)) : [];
  const retry = userId ? server.reload : resolved.reload;
  return <>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{userId && guest.length > 0 && <Notice>در این دستگاه {faNumber(guest.length)} علاقه‌مندی ذخیره شده است. <button className="text-button" disabled={busy} onClick={merge}>انتقال به حساب</button></Notice>}{!userId && <p className="muted">این انتخاب‌ها در همین دستگاه ذخیره می‌شوند. پس از ورود می‌توانید آن‌ها را به حساب منتقل کنید.</p>}
    {failure ? <Notice error>{failure}<button className="text-button" onClick={retry}>تلاش دوباره</button></Notice> : loading ? <Loading /> : <>{visible.length > 0 && <div className="product-grid">{visible.map(product => <div key={product.id}><ProductTile product={product} /><button className="text-button" disabled={busy} onClick={() => remove(product.id)}>حذف از علاقه‌مندی‌ها</button></div>)}</div>}{unavailable.length > 0 && <section className="form-section"><h2>انتخاب‌های فعلاً غیرقابل نمایش</h2><p className="muted">این محصولات اکنون در کاتالوگ عمومی قابل نمایش نیستند. انتخاب‌ها در این دستگاه باقی مانده‌اند و می‌توانید آن‌ها را حذف کنید.</p><ul className="selection-list">{unavailable.map(id => <li key={id}><span>انتخاب ذخیره‌شدهٔ {faNumber(guest.indexOf(id) + 1)}</span><button className="text-button" disabled={busy} onClick={() => remove(id)}>حذف این انتخاب</button></li>)}</ul><Link className="text-link" href="/products">مشاهدهٔ عطرها</Link></section>}{!visible.length && !unavailable.length && <Empty title="هنوز عطری در علاقه‌مندی‌ها ندارید."><Link className="button secondary" href="/products">مشاهدهٔ عطرها</Link></Empty>}</>}
  </>;
}