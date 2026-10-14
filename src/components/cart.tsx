"use client";
import Link from "next/link";
import { useState } from "react";
import type { CartDto } from "@/contracts/commerce";
import { api, ApiError, Empty, errorMessage, faNumber, Loading, money, Notice, useCommerce } from "./commerce-client";
import { useStorePresentation } from "./presentation-context";
import { useCustomerSession } from "./customer-session";
import { PurchaseProgress } from "./storefront-purchase-progress";

export function CartItems({ cart, editable = false, onChange, onConflict }: { cart: CartDto; editable?: boolean; onChange?: () => void; onConflict?: () => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { refreshCart, announce } = useCommerce();
  const change = async (variantId: string, quantity: number) => { setBusy(variantId); setError(""); try { await api("/api/cart/items", { method: quantity ? "PUT" : "DELETE", body: JSON.stringify({ variantId, quantity, cartId:cart.id, expectedVersion:cart.version }) }); await refreshCart(); onChange?.(); announce(quantity ? "تعداد کالا در سبد به‌روز شد." : "کالا از سبد خرید حذف شد."); } catch (e) { if (e instanceof ApiError && e.code === "CONFLICT") { onConflict?.(); await refreshCart().catch(() => {}); if (!onConflict) setError("سبد خرید تغییر کرده است. تعداد تازه را بررسی کنید و تغییر را دوباره انتخاب کنید."); } else setError(errorMessage(e)); } finally { setBusy(""); } };
  return <>{error && <Notice error>{error}</Notice>}<ul className="cart-items">{cart.items.map(item => <li key={item.variantId} className="cart-item"><div className="cart-item-info"><h3><Link href={`/products/${item.productId}`}><bdi>{item.name}</bdi></Link></h3><p className="muted small">{faNumber(item.volumeMl)} میلی‌لیتر · {money(item.unitPrice)}</p>{(!item.published || item.available < item.quantity) && <p className="field-error">{!item.published ? "این محصول دیگر برای خرید فعال نیست." : "موجودی این حجم کمتر از تعداد انتخابی است."}</p>}</div><div className="cart-item-controls">{editable ? <><label className="sr-only" htmlFor={`qty-${item.variantId}`}>تعداد {item.name}</label><select id={`qty-${item.variantId}`} value={item.quantity} disabled={busy === item.variantId} onChange={e => change(item.variantId, Number(e.target.value))}>{Array.from({ length: Math.max(item.quantity, Math.min(item.available, 20), 1) }, (_, index) => <option key={index + 1} value={index + 1}>{faNumber(index + 1)}</option>)}</select><button className="text-button danger" disabled={busy === item.variantId} onClick={() => change(item.variantId, 0)}>حذف</button></> : <span>{faNumber(item.quantity)} عدد</span>}</div><p className="price">{money({ ...item.unitPrice, amountIrr: (BigInt(item.unitPrice.amountIrr) * BigInt(item.quantity)).toString() })}</p></li>)}</ul></>;
}
export function CartPageContent() {
  const identity = useCustomerSession();
  return <><PurchaseProgress current="cart" /><CartPageForActor key={identity.scopeKey} /></>;
}
function CartPageForActor() {
  const presentation = useStorePresentation();
  const { cart, refreshCart, error:cartError } = useCommerce();
  const [error, setError] = useState("");
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const applyCoupon = async (remove = false) => { setBusy(true); setError(""); try { await api("/api/cart", { method: "PATCH", body: JSON.stringify({ couponCode: remove ? null : coupon.trim(), cartId:cart?.id, expectedVersion:cart?.version }) }); await refreshCart(); setCoupon(""); } catch (e) { if (e instanceof ApiError && e.code === "CONFLICT") { await refreshCart().catch(() => {}); setError("سبد خرید تغییر کرده است. مقدار تازه را بررسی کنید و تغییر را دوباره انتخاب کنید."); } else setError(errorMessage(e)); } finally { setBusy(false); } };
  if (!cart) return error || cartError ? <Notice error>{error || cartError}<button className="text-button" onClick={() => refreshCart().catch(e => setError(errorMessage(e)))}>تلاش دوباره</button></Notice> : <Loading />;
  if (!cart.items.length) return <Empty title="سبد خرید شما خالی است."><p>انتخاب‌های شما در این بخش نمایش داده می‌شوند.</p><Link className="text-link block" href="/checkout">بررسی نتیجهٔ سفارش</Link><Link className="text-link block" href="/account">پیگیری سفارش‌های حساب</Link><Link className="button" href="/products">مشاهدهٔ عطرها</Link></Empty>;
  const invalid = cart.items.some(item => !item.published || item.available < item.quantity);
  return <div className="checkout-grid"><section><CartItems cart={cart} editable onConflict={() => setError("سبد خرید تغییر کرده است. تعداد تازه را بررسی کنید و تغییر را دوباره انتخاب کنید.")} /><Link href="/products" className="text-link">ادامهٔ انتخاب عطرها ←</Link></section><aside className="summary-panel"><h2>بررسی سبد خرید</h2><dl className="totals"><div><dt>جمع کالاها</dt><dd>{money(cart.subtotal)}</dd></div></dl><p className="muted small">هزینهٔ ارسال، تخفیف و مالیات در مرحلهٔ جمع‌بندی نمایش داده می‌شوند.</p>{error && <Notice error>{error}</Notice>}<form className="coupon-form" onSubmit={e => { e.preventDefault(); applyCoupon(); }}><label htmlFor="coupon">کد تخفیف</label><div className="inline-control"><input id="coupon" value={coupon} onChange={e => setCoupon(e.target.value)} autoCapitalize="characters" /><button className="secondary" disabled={busy || !coupon.trim()}>اعمال</button></div></form>{cart.couponCode && <div className="result-bar"><bdi>{cart.couponCode}</bdi><button className="text-button" disabled={busy} onClick={() => applyCoupon(true)}>حذف کد</button></div>}{presentation?.maintenance.enabled ? <Notice silent><p>ثبت سفارش تازه موقتاً متوقف است.</p><Link className="text-link" href="/account">حساب کاربری و پیگیری سفارش</Link></Notice> : invalid ? <Notice error>پیش از ادامه، کالاهای ناموجود یا تعداد آن‌ها را اصلاح کنید.</Notice> : <Link className="button full-width" href="/checkout">ادامه و ثبت نشانی</Link>}</aside></div>;
}
