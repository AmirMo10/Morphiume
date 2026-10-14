"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AddressInput, CheckoutDto, CheckoutInput, QuoteDto } from "@/contracts/commerce";
import { api, ApiError, canonicalPhone, digits, Empty, errorMessage, Loading, money, Notice, useCommerce } from "./commerce-client";
import { CartItems } from "./cart";
import { PhoneVerification } from "./phone-verification";
import { LocationInput } from "./location-input";
import { SavedAddressPicker } from "./addresses";
import { operationId } from "./operation-id";
import { CustomerSessionError, useCustomerSession, useLifetimeSignal } from "./customer-session";
import { clearAddressDraft, loadAddressDraft, loadCheckoutRecovery, saveAddressDraft, saveCheckoutRecovery, type CheckoutRecovery } from "./cart-lifecycle";
import { PurchaseProgress } from "./storefront-purchase-progress";

const blankAddress: AddressInput = { recipient: "", phone: "", province: "", city: "", address: "", plaque: "", unit: "", postalCode: "" };
const addressFields: { key: keyof AddressInput; label: string; autoComplete?: string; numeric?: boolean }[] = [{ key: "recipient", label: "نام گیرنده", autoComplete: "name" }, { key: "phone", label: "شمارهٔ تماس گیرنده", autoComplete: "tel", numeric: true }, { key: "province", label: "استان", autoComplete: "address-level1" }, { key: "city", label: "شهر", autoComplete: "address-level2" }, { key: "address", label: "نشانی کامل", autoComplete: "street-address" }, { key: "plaque", label: "پلاک", numeric: true }, { key: "unit", label: "واحد (اختیاری)", numeric: true }, { key: "postalCode", label: "کدپستی ده‌رقمی", autoComplete: "postal-code", numeric: true }];
export function CheckoutContent() {
  const identity = useCustomerSession(), {continuityCartId} = useCommerce();
  return <CheckoutForOwner key={identity.generation} cartId={continuityCartId} />;
}
function CheckoutForOwner({ cartId }: { cartId: string | null }) {
  const { cart, refreshCart } = useCommerce(), identity = useCustomerSession(), signal = useLifetimeSignal();
  const verified = !!identity.ownerId && !identity.pending;
  const [recovery, setRecovery] = useState<CheckoutRecovery | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false), errorRef = useRef<HTMLDivElement>(null);
  // Recovery belongs to the validated owner, independently of current cart initialization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!identity.pending) setRecovery(identity.ownerId ? loadCheckoutRecovery(identity.ownerId) : null); }, [identity.ownerId, identity.pending]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const submit = async (record: CheckoutRecovery & { kind: "pending" }) => {
    if (inFlight.current || !verified || signal.aborted || record.ownerId !== identity.ownerId) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await api<CheckoutDto>("/api/checkout", { method: "POST", signal, headers: { "Idempotency-Key": record.key }, body: JSON.stringify(record.input) });
      if (signal.aborted) return;
      const known: CheckoutRecovery = { version: 2, kind: "known", ownerId: record.ownerId, cartId: record.cartId, key: record.key, orderId: result.orderId, paymentAttemptId: result.paymentAttemptId, paymentStatus: result.paymentStatus };
      saveCheckoutRecovery(known); clearAddressDraft(); setRecovery(known);
      await refreshCart().catch(() => { if (!signal.aborted) setError("سفارش ثبت شد؛ سبد تازه دریافت نشد. سفارش ثبت‌شده را پیگیری کنید."); });
      if (!signal.aborted) window.location.assign(result.redirectUrl || `/orders/${result.orderId}`);
    } catch (failure) {
      if (signal.aborted) return;
      setError(failure instanceof TypeError ? "پاسخ ثبت سفارش دریافت نشد. نتیجه را با همان درخواست بررسی کنید." : errorMessage(failure));
      if (failure instanceof ApiError && ["PRICE_CHANGED", "OUT_OF_STOCK", "CART_CHANGED"].includes(failure.code)) { saveCheckoutRecovery(null); setRecovery(null); await refreshCart().catch(() => {}); }
      else if (failure instanceof ApiError && failure.code === "CONFLICT") await refreshCart().catch(() => {});
    } finally { inFlight.current = false; if (!signal.aborted) setBusy(false); }
  };
  const start = async (record: CheckoutRecovery & { kind: "pending" }) => {
    if (inFlight.current || !verified || signal.aborted || record.ownerId !== identity.ownerId) return;
    saveCheckoutRecovery(record); setRecovery(record); await submit(record);
  };
  if (!recovery) return <>{!identity.pending && error && <Notice error ref={errorRef} tabIndex={-1}>{error}</Notice>}<CheckoutFormForCart key={cartId ?? "loading"} cartId={cartId} onCheckout={start} /></>;
  if (identity.pending) return identity.error ? <CustomerSessionError /> : <Loading label="در حال بررسی حساب…" />;
  if (recovery.ownerId !== identity.ownerId) return <Loading label="در حال بررسی حساب…" />;
  return <section className="form-section"><h2>{recovery.kind === "pending" ? "نتیجهٔ ثبت سفارش هنوز دریافت نشده است." : "سفارش ثبت‌شده را پیگیری کنید."}</h2>{error && <Notice error ref={errorRef} tabIndex={-1}>{error}</Notice>}{recovery.kind === "pending" ? <><p>برای بررسی نتیجه، همان اطلاعات و شناسهٔ درخواست دوباره ارسال می‌شوند. سفارش تازه‌ای از سبد فعلی ساخته نمی‌شود.</p><button disabled={busy} onClick={() => void submit(recovery)}>{busy ? "در حال بررسی نتیجه…" : "بررسی نتیجهٔ ثبت سفارش"}</button></> : <><Link className="button" href={`/orders/${recovery.orderId}`}>پیگیری سفارش ثبت‌شده</Link>{cart?.items.length ? <button className="secondary" onClick={() => { saveCheckoutRecovery(null); setRecovery(null); setError(""); }}>شروع خرید با انتخاب‌های تازه</button> : null}</>}<Link className="text-link block" href="/account">بررسی سفارش‌های حساب</Link><Link className="text-link block" href="/cart">مشاهدهٔ سبد فعلی</Link></section>;
}
function CheckoutFormForCart({ cartId, onCheckout }: { cartId: string | null; onCheckout: (record: CheckoutRecovery & { kind: "pending" }) => Promise<void> }) {
  const { cart, refreshCart, ready, error:cartError } = useCommerce();
  const identity = useCustomerSession(), signal = useLifetimeSignal();
  const [address, setAddress] = useState<AddressInput>(blankAddress);
  const [step, setStep] = useState(1);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const verified = !!identity.ownerId && !identity.pending;
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false), autoQuote = useRef(""), operation = useRef("");
  // Restore the external browser draft after hydration; storage is unavailable during server rendering.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (identity.pending) return; if (!hydrated && cartId) { const saved = loadAddressDraft(cartId,identity.ownerId); if (saved) setAddress(saved); setHydrated(true); } }, [cartId,identity.ownerId,identity.pending,hydrated]);
  useEffect(() => { if (hydrated && cartId && !identity.pending) saveAddressDraft(cartId,identity.ownerId,address); }, [address,hydrated,cartId,identity.ownerId,identity.pending]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const fail = (e: unknown) => { setError(errorMessage(e)); if (e instanceof ApiError && e.fields) setFields(e.fields); };
  const review = async () => {
    const errors: Record<string, string> = {};
    for (const field of addressFields) if (field.key !== "unit" && !address[field.key]?.trim()) errors[field.key] = `${field.label} را وارد کنید.`;
    if (!/^\+989\d{9}$/.test(canonicalPhone(address.phone))) errors.phone = "شمارهٔ تماس معتبر ایران را وارد کنید.";
    if (!/^\d{10}$/.test(digits(address.postalCode))) errors.postalCode = "کدپستی باید ده رقم باشد.";
    setFields(errors); if (Object.keys(errors).length) { setError("اطلاعات نشانی را کامل کنید."); return; }
    if (!cart || !ready || identity.pending) return;
    setError(""); setAccepted(false);
    const normalized = { ...address, phone: canonicalPhone(address.phone), postalCode: digits(address.postalCode), plaque: digits(address.plaque), unit: digits(address.unit ?? "") };
    try { operation.current = operationId(); } catch (failure) { fail(failure); return; }
    setAddress(normalized); setStep(2); setQuote(null);
    if (verified) await getQuote(normalized);
  };
  const getQuote = async (currentAddress = address) => { if (!cart || !ready || !verified || inFlight.current) return; setBusy(true); setError(""); try { operation.current ||= operationId(); const currentCart = await refreshCart(); const result = await api<QuoteDto>("/api/checkout/quote", { method: "POST", signal, body: JSON.stringify({ cartId: currentCart.id, cartVersion: currentCart.version, address: currentAddress, shippingMethodId: "standard" }) }); if (signal.aborted) return; setQuote(result); setAccepted(false); } catch (e) { if (!signal.aborted) fail(e); } finally { if (!signal.aborted) setBusy(false); } };
  useEffect(() => {
    if (step !== 2 || !ready || !verified || quote || busy || !cart) return;
    const key = `${identity.ownerId}:${cart.id}:${cart.version}`; if (autoQuote.current === key) return; autoQuote.current = key;
    void getQuote();
  });
  const pay = async () => {
    if (!cart || !ready || !quote || !verified || !accepted || busy) return;
    if (quote.cartId !== cart.id || quote.cartVersion !== cart.version) { setQuote(null); setAccepted(false); setStep(1); setError("سبد خرید تغییر کرده است. مبلغ تازه را بررسی و دوباره تأیید کنید."); return; }
    try {
      const input: CheckoutInput = {cartId:cart.id,cartVersion:quote.cartVersion,address:{...address},shippingMethodId:quote.shippingMethodId,quoteFingerprint:quote.fingerprint,policyVersion:quote.policyVersion};
      const record: CheckoutRecovery & {kind:"pending"} = {version:2,kind:"pending",ownerId:identity.ownerId!,cartId:cart.id,key:operation.current || operationId(),input};
      await onCheckout(record);
    } catch (failure) { fail(failure); }
  };
  if (identity.pending) return identity.error ? <CustomerSessionError /> : <Loading label="در حال بررسی حساب…" />;
  if (!cart || !ready) return error || cartError ? <Notice error>{error || cartError}<button className="text-button" onClick={() => void refreshCart().catch(() => {})}>بررسی دوبارهٔ سبد</button></Notice> : <Loading label="در حال بررسی و اتصال سبد به حساب…" />;
  if (!cart.items.length) return <Empty title="سبد خرید شما خالی است."><Link className="button" href="/products">مشاهدهٔ عطرها</Link></Empty>;
  return <><PurchaseProgress current={step === 1 ? "address" : "review"} />{error && <div ref={errorRef} tabIndex={-1} className="notice error" role="alert"><p>{error}</p>{Object.entries(fields).length > 0 && <ul>{Object.entries(fields).map(([key, message]) => <li key={key}><a href={`#address-${key}`}>{message}</a></li>)}</ul>}</div>}<div className="checkout-grid"><section>{step === 1 ? <form onSubmit={e => { e.preventDefault(); review(); }} noValidate><h2>گیرنده و نشانی</h2>{verified && <SavedAddressPicker onSelect={setAddress} />}<p className="muted">برای ارسال به شخص دیگر، اطلاعات گیرنده را وارد کنید.</p><div className="form-grid">{addressFields.map(field => <div className={field.key === "address" ? "field span-full" : "field"} key={field.key}><label htmlFor={`address-${field.key}`}>{field.label}</label>{field.key === "address" ? <textarea id={`address-${field.key}`} value={address[field.key]} onChange={e => setAddress({ ...address, [field.key]: e.target.value })} rows={3} autoComplete={field.autoComplete} aria-invalid={!!fields[field.key]} aria-describedby={fields[field.key] ? `error-${field.key}` : undefined} /> : field.key === "province" || field.key === "city" ? <LocationInput id={`address-${field.key}`} kind={field.key} value={address[field.key]} province={address.province} invalid={!!fields[field.key]} errorId={fields[field.key] ? `error-${field.key}` : undefined} onChange={value => { setAddress(previous => ({ ...previous, [field.key]: value, ...(field.key === "province" ? { city: "" } : {}) })); setFields(previous => ({ ...previous, [field.key]: "" })); }} /> : <input id={`address-${field.key}`} value={address[field.key] ?? ""} onChange={e => { setAddress({ ...address, [field.key]: e.target.value, ...(field.key === "province" ? { city: "" } : {}) }); setFields({ ...fields, [field.key]: "" }); }} type={field.key === "phone" ? "tel" : "text"} inputMode={field.key === "phone" ? "tel" : field.numeric ? "numeric" : "text"} dir={field.numeric ? "ltr" : "rtl"} autoComplete={field.autoComplete} aria-invalid={!!fields[field.key]} aria-describedby={fields[field.key] ? `error-${field.key}` : undefined} required={field.key !== "unit"} />}{fields[field.key] && <p className="field-error" id={`error-${field.key}`}>{fields[field.key]}</p>}</div>)}</div><div className="actions"><button disabled={busy}>{busy ? "در حال محاسبه…" : "ادامه و انتخاب روش ارسال"}</button><Link href="/cart" className="text-link">بازگشت به سبد</Link></div></form> : <><div className="section-heading"><h2>نشانی گیرنده</h2><button className="text-button" onClick={() => setStep(1)}>ویرایش نشانی</button></div><p><bdi>{address.recipient}</bdi> · <bdi dir="ltr">{address.phone}</bdi></p><p>{address.province}، {address.city}، {address.address}، پلاک {address.plaque}{address.unit ? `، واحد ${address.unit}` : ""}</p><p>کدپستی: <bdi dir="ltr">{address.postalCode}</bdi></p><hr /><h2>روش ارسال</h2><label className="shipping-option"><input type="radio" name="shipping" checked readOnly />ارسال استاندارد <span>{quote && money(quote.shipping)}</span></label><p className="helper">شرایط و زمان ارسال را در <Link href="/pages/shipping" className="text-link">صفحهٔ ارسال</Link> بررسی کنید.</p><hr />{verified ? <Notice>شمارهٔ خریدار تأیید شده است.</Notice> : <PhoneVerification checkout onVerified={identity.revalidate} />}<hr /><CartItems cart={cart} /></>}</section><aside className="summary-panel"><h2>جمع‌بندی خرید</h2>{quote && step === 2 ? <><dl className="totals"><div><dt>جمع کالاها</dt><dd>{money(quote.subtotal)}</dd></div><div><dt>تخفیف</dt><dd>{money(quote.discount)}</dd></div><div><dt>ارسال</dt><dd>{money(quote.shipping)}</dd></div><div><dt>مالیات</dt><dd>{money(quote.tax)}</dd></div><div className="grand-total"><dt>مبلغ قابل پرداخت</dt><dd>{money(quote.total)}</dd></div></dl><label className="checkbox-row"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> <span>مبلغ و <Link href="/pages/terms" className="text-link">شرایط خرید</Link> را بررسی کرده‌ام.</span></label><p className="helper">نسخهٔ شرایط: <bdi>{quote.policyVersion}</bdi></p><button className="full-width" disabled={busy || !verified || !accepted} onClick={pay}>{busy ? "در حال ایجاد سفارش…" : `پرداخت ${money(quote.total)}`}</button><p className="helper">در صورت تغییر قیمت یا موجودی، مبلغ تازه را دوباره بررسی خواهید کرد.</p></> : <><CartItems cart={cart} /><dl className="totals"><div><dt>جمع کالاها</dt><dd>{money(cart.subtotal)}</dd></div></dl><p className="helper">مبلغ نهایی پس از ثبت نشانی و تأیید شماره محاسبه می‌شود.</p>{step === 2 && verified && <button className="secondary full-width" disabled={busy} onClick={() => getQuote()}>{busy ? "در حال محاسبه…" : "دریافت مبلغ نهایی"}</button>}</>}</aside></div></>;
}
