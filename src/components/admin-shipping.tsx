"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MoneyDto } from "@/contracts/commerce";
import { tomanToIrr } from "@/lib/money";
import { hasPermission, useAdmin } from "./admin-shell";
import { AdminReauthentication } from "./admin-reauth";
import { api, ApiError, errorMessage, Loading, money, Notice } from "./commerce-client";

type ShippingPolicyDto = { shippingFee: MoneyDto; freeShippingThreshold: MoneyDto | null; policyVersion: string; version: number; configured: boolean };
type Proposal = { shippingFeeToman: string; freeShippingThresholdToman: string | null; expectedVersion: number; reason: string; fee: MoneyDto; threshold: MoneyDto | null };

export function AdminShipping() {
  const allowed = hasPermission(useAdmin(), "refunds.write");
  const [policy, setPolicy] = useState<ShippingPolicyDto | null>(null);
  const [fee, setFee] = useState("");
  const [threshold, setThreshold] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);
  const [reason, setReason] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [verification, setVerification] = useState(0);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const apply = (value: ShippingPolicyDto) => { setPolicy(value); setFee((BigInt(value.shippingFee.amountIrr) / 10n).toString()); setFreeShipping(value.freeShippingThreshold !== null); setThreshold(value.freeShippingThreshold ? (BigInt(value.freeShippingThreshold.amountIrr) / 10n).toString() : ""); };
  const load = useCallback(() => { if (!allowed) return; api<ShippingPolicyDto>("/api/admin/shipping").then(value => { apply(value); setError(""); setConflict(false); }).catch(e => setError(errorMessage(e))); }, [allowed]);
  useEffect(load, [load]);
  useEffect(() => { if (error) summary.current?.focus(); }, [error]);
  const prepare = () => {
    if (!policy || busy) return;
    const nextFields: Record<string, string> = {};
    let feeIrr = 0n, thresholdIrr: bigint | null = null;
    try { feeIrr = tomanToIrr(fee); } catch (e) { nextFields.fee = errorMessage(e); }
    if (freeShipping) try { thresholdIrr = tomanToIrr(threshold); } catch (e) { nextFields.threshold = errorMessage(e); }
    if (!reason.trim() || reason.trim().length > 1000) nextFields.reason = "دلیل تغییر را وارد کنید (حداکثر ۱۰۰۰ نویسه).";
    setFields(nextFields); setError(""); setNotice("");
    if (Object.keys(nextFields).length) { setError("فیلدهای مشخص‌شده را بررسی کنید."); return; }
    setProposal({ shippingFeeToman: (feeIrr / 10n).toString(), freeShippingThresholdToman: thresholdIrr === null ? null : (thresholdIrr / 10n).toString(), expectedVersion: policy.version, reason: reason.trim(), fee: { amountIrr: feeIrr.toString(), currency: "IRR" }, threshold: thresholdIrr === null ? null : { amountIrr: thresholdIrr.toString(), currency: "IRR" } });
    setVerified(false); setVerification(previous => previous + 1); dialog.current?.showModal();
  };
  const save = async () => {
    if (!proposal || !verified || busy) return;
    dialog.current?.close(); setBusy(true); setError(""); setNotice("");
    try { const result = await api<ShippingPolicyDto>("/api/admin/shipping", { method: "PUT", body: JSON.stringify({ shippingFeeToman: proposal.shippingFeeToman, freeShippingThresholdToman: proposal.freeShippingThresholdToman, expectedVersion: proposal.expectedVersion, reason: proposal.reason }) }); apply(result); setReason(""); setConflict(false); setNotice("سیاست هزینهٔ ارسال ذخیره شد."); }
    catch (e) { setError(errorMessage(e)); if (e instanceof ApiError) setConflict(e.code === "CONFLICT"); }
    finally { setBusy(false); }
  };
  if (!allowed) return <Notice error>اجازهٔ مدیریت هزینهٔ ارسال را ندارید.</Notice>;
  return <><h1>هزینهٔ ارسال</h1><p className="muted">هزینه و حداقل خرید برای ارسال رایگان را در این بخش تنظیم کنید. شرایط و زمان ارسال را در محتوای تأییدشدهٔ فروشگاه ثبت کنید.</p>
    {error && <Notice error ref={summary} tabIndex={-1}><p>{error}</p>{Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([key, value]) => <li key={key}><a href={`#shipping-${key}`}>{value}</a></li>)}</ul>}{conflict && <><p>سیاست ارسال هم‌زمان تغییر کرده است. مقادیر واردشده حفظ شده‌اند؛ برای ادامه نسخهٔ تازه را بررسی کنید.</p><button className="secondary" onClick={() => { if (confirm("مقادیر فرم با سیاست تازه جایگزین شوند؟")) load(); }}>دریافت سیاست تازه</button></>}</Notice>}
    {notice && <Notice>{notice}</Notice>}
    {policy && !policy.configured && <Notice silent>این هزینه فقط پیش‌فرض محیط آزمایشی است و برای فروش واقعی تأیید نشده است.</Notice>}
    {!policy ? error ? <button className="secondary" onClick={load}>تلاش دوباره</button> : <Loading /> : <form onSubmit={event => { event.preventDefault(); prepare(); }} noValidate><fieldset disabled={busy || conflict}>
      <p className="helper">نسخهٔ تنظیمات ارسال: <bdi>{policy.policyVersion}</bdi></p><div className="form-grid">
        <div className="field"><label htmlFor="shipping-fee">هزینهٔ ارسال (تومان)</label><input id="shipping-fee" dir="ltr" inputMode="numeric" value={fee} onChange={event => setFee(event.target.value)} aria-invalid={!!fields.fee} aria-describedby={fields.fee ? "shipping-fee-error" : undefined} required />{fields.fee && <p id="shipping-fee-error" className="field-error">{fields.fee}</p>}</div>
        <label className="checkbox-row"><input type="checkbox" checked={freeShipping} onChange={event => setFreeShipping(event.target.checked)} />ارسال رایگان از حداقل خرید مشخص</label>
        {freeShipping && <div className="field"><label htmlFor="shipping-threshold">حداقل خرید برای ارسال رایگان (تومان)</label><input id="shipping-threshold" dir="ltr" inputMode="numeric" value={threshold} onChange={event => setThreshold(event.target.value)} aria-invalid={!!fields.threshold} aria-describedby={fields.threshold ? "shipping-threshold-error" : "shipping-threshold-help"} required /><p id="shipping-threshold-help" className="helper">مبلغ کالاها پس از اعمال تخفیف، بدون هزینهٔ ارسال، با این حداقل مقایسه می‌شود. حداقل خریدِ صفر یعنی ارسال رایگان برای همهٔ سفارش‌ها.</p>{fields.threshold && <p id="shipping-threshold-error" className="field-error">{fields.threshold}</p>}</div>}
        <div className="field span-full"><label htmlFor="shipping-reason">دلیل تغییر سیاست ارسال</label><textarea id="shipping-reason" rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} aria-invalid={!!fields.reason} aria-describedby={fields.reason ? "shipping-reason-error" : undefined} required />{fields.reason && <p id="shipping-reason-error" className="field-error">{fields.reason}</p>}</div>
      </div><button disabled={busy || conflict}>{busy ? "در حال ثبت…" : "بررسی تغییر سیاست ارسال"}</button>
    </fieldset></form>}
    <dialog ref={dialog} className="confirm-dialog"><h2>تأیید سیاست هزینهٔ ارسال</h2>{proposal && policy && <><dl className="totals"><div><dt>هزینهٔ فعلی</dt><dd>{money(policy.shippingFee)}</dd></div><div><dt>هزینهٔ تازه</dt><dd>{money(proposal.fee)}</dd></div><div><dt>حداقل خرید فعلی برای ارسال رایگان</dt><dd>{policy.freeShippingThreshold ? money(policy.freeShippingThreshold) : "غیرفعال"}</dd></div><div><dt>حداقل خرید تازه برای ارسال رایگان</dt><dd>{proposal.threshold ? money(proposal.threshold) : "غیرفعال"}</dd></div></dl><p>دلیل: <bdi>{proposal.reason}</bdi></p><AdminReauthentication key={verification} onSuccess={() => setVerified(true)} /></>}
      <div className="actions"><button disabled={busy || !verified} onClick={save}>تأیید و ثبت سیاست ارسال</button><button className="secondary" onClick={() => dialog.current?.close()}>بازگشت و اصلاح</button></div>
    </dialog>
  </>;
}
