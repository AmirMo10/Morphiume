"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ProductDto } from "@/contracts/commerce";
import { customerAuth } from "./auth-clients";
import { api, Empty, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { ProductTile } from "./catalog";

const key = "morphiume-wishlist";
function snapshot() { try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; } }
function subscribe(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener("morphiume:wishlist", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("morphiume:wishlist", callback); }; }
function useGuestWishlist() { const value = useSyncExternalStore(subscribe, snapshot, () => "[]"); return useMemo<string[]>(() => { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 100) : []; } catch { return []; } }, [value]); }
function writeGuest(ids: string[]) { localStorage.setItem(key, JSON.stringify([...new Set(ids)].slice(0, 100))); window.dispatchEvent(new Event("morphiume:wishlist")); }
export function FavoriteButton({ productId }: { productId: string }) {
  const session = customerAuth.useSession();
  const guest = useGuestWishlist();
  const [server, setServer] = useState<{ userId: string; selected: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const userId = session.data?.user.id;
  useEffect(() => { if (userId) api<ProductDto[]>("/api/wishlist").then(products => setServer({ userId, selected: products.some(p => p.id === productId) })).catch(e => setError(errorMessage(e))); }, [userId, productId]);
  const selected = userId ? server?.userId === userId && server.selected : guest.includes(productId);
  const toggle = async () => { setBusy(true); setError(""); try { if (userId) { await api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId, enabled: !selected }) }); setServer({ userId, selected: !selected }); } else writeGuest(selected ? guest.filter(id => id !== productId) : [...guest, productId]); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <><button className="text-button" aria-pressed={selected} disabled={busy || session.isPending} onClick={toggle}>{selected ? "حذف از علاقه‌مندی‌ها" : "ذخیره در علاقه‌مندی‌ها"}</button>{error && <p className="field-error" role="alert">{error}</p>}</>;
}
export function WishlistContent() {
  const session = customerAuth.useSession();
  const guest = useGuestWishlist();
  const userId = session.data?.user.id;
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [server, setServer] = useState<{ userId: string; products: ProductDto[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { api<ProductDto[]>("/api/products").then(setProducts).catch(e => setError(errorMessage(e))); }, []);
  const load = useCallback(() => { if (userId) return api<ProductDto[]>("/api/wishlist").then(p => setServer({ userId, products: p })).catch(e => setError(errorMessage(e))); }, [userId]);
  useEffect(() => { load(); }, [load]);
  const merge = async () => { setBusy(true); setError(""); const results = await Promise.allSettled(guest.map(productId => api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId, enabled: true }) }))); const remaining = guest.filter((_, i) => results[i]?.status === "rejected"); writeGuest(remaining); await load(); setNotice(remaining.length ? `${faNumber(guest.length - remaining.length)} علاقه‌مندی منتقل شد. ${faNumber(remaining.length)} محصول منتقل نشد؛ ممکن است دیگر در دسترس نباشد.` : "علاقه‌مندی‌های این دستگاه به حساب منتقل شدند."); setBusy(false); };
  const remove = async (id: string) => { setBusy(true); setError(""); try { if (userId) { await api("/api/wishlist", { method: "POST", body: JSON.stringify({ productId: id, enabled: false }) }); await load(); } else writeGuest(guest.filter(p => p !== id)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const visible = userId ? server?.userId === userId ? server.products : null : products?.filter(p => guest.includes(p.id));
  return <>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{userId && guest.length > 0 && <Notice>در این دستگاه {faNumber(guest.length)} علاقه‌مندی ذخیره شده است. <button className="text-button" disabled={busy} onClick={merge}>انتقال به حساب</button></Notice>}{!userId && <p className="muted">این انتخاب‌ها در همین دستگاه ذخیره می‌شوند. پس از ورود می‌توانید آن‌ها را به حساب منتقل کنید.</p>}{!visible ? <Loading /> : visible.length ? <div className="product-grid">{visible.map(product => <div key={product.id}><ProductTile product={product} /><button className="text-button" disabled={busy} onClick={() => remove(product.id)}>حذف از علاقه‌مندی‌ها</button></div>)}</div> : <Empty title="هنوز عطری در علاقه‌مندی‌ها ندارید."><Link className="button secondary" href="/products">مشاهدهٔ عطرها</Link></Empty>}</>;
}
