"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ManualRefundFailureDto, ManualRefundFailureInput, MoneyDto, OrderDto } from "@/contracts/commerce";
import { api, ApiError, errorMessage, money, Notice } from "./commerce-client";
import { AdminReauthentication } from "./admin-reauth";
import { hasPermission, useAdmin } from "./admin-shell";
import { operationId } from "./operation-id";

type Review = { refundId: string; orderNumber: string; amount: MoneyDto; input: ManualRefundFailureInput };
export function ManualRefundFailure({ order, onChange }: { order: OrderDto; onChange: () => Promise<unknown> }) {
  const session = useAdmin();
  if (!hasPermission(session, "refunds.write")) return null;
  return <FailureReview key={`${session?.user.id}:${order.id}`} order={order} onChange={onChange} />;
}
function FailureReview({ order, onChange }: { order: OrderDto; onChange: () => Promise<unknown> }) {
  const id = useId();
  const eligible = order.refunds.filter(refund => refund.status === "pending" || refund.status === "processing");
  const [refundId, setRefundId] = useState(""), [outcome, setOutcome] = useState<"unknown" | "confirmed_non_transfer">("unknown");
  const [reason, setReason] = useState(""), [evidence, setEvidence] = useState("");
  const [review, setReview] = useState<Review | null>(null), [round, setRound] = useState(0), [fresh, setFresh] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [saved, setSaved] = useState<ManualRefundFailureDto | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [denied, setDenied] = useState(false);
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), errorRef = useRef<HTMLDivElement>(null), dialogErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (dialogError) dialogErrorRef.current?.focus(); }, [dialogError]);
  const prepare = () => {
    if (busy) return;
    setError("");
    const refund = eligible.find(item => item.id === refundId);
    if (!refund || outcome !== "confirmed_non_transfer") { setError("اگر عدم انتقال وجه تأیید نشده است، درخواست را در وضعیت فعلی نگه دارید."); return; }
    const normalizedReason = reason.trim(), normalizedEvidence = evidence.trim();
    if (!normalizedReason || normalizedReason.length > 1000 || normalizedEvidence.length < 10 || normalizedEvidence.length > 1000) { setError("دلیل را تا ۱۰۰۰ نویسه و مدرک عدم انتقال وجه را از ۱۰ تا ۱۰۰۰ نویسه وارد کنید."); return; }
    const payload = JSON.stringify({ refundId, outcome, reason: normalizedReason, evidence: normalizedEvidence });
    try { if (operation.current?.payload !== payload) operation.current = { payload, key: operationId() }; } catch (failure) { setError(errorMessage(failure)); return; }
    setReview({ refundId, orderNumber: order.orderNumber, amount: { ...refund.amount }, input: { outcome: "confirmed_non_transfer", reason: normalizedReason, evidence: normalizedEvidence, operationKey: operation.current.key } });
    setFresh(false); setDialogError(""); setRound(previous => previous + 1); dialog.current?.showModal();
  };
  const execute = async () => {
    if (!review || !fresh || busy) return;
    setBusy(true); setDialogError("");
    try {
      const result = await api<ManualRefundFailureDto>(`/api/admin/refunds/${review.refundId}/fail`, { method: "POST", body: JSON.stringify(review.input) });
      setSaved(result); dialog.current?.close(); setFresh(false); setError("");
      try { await onChange(); } catch (failure) { setError(`تصمیم ثبت شد؛ وضعیت سفارش دریافت نشد. ${errorMessage(failure)}`); }
    } catch (failure) {
      setDialogError(failure instanceof ApiError ? errorMessage(failure) : "پاسخ ثبت تصمیم دریافت نشد. همین تصمیم و مدرک را نگه دارید و وضعیت سفارش را دوباره بررسی کنید.");
      if (failure instanceof ApiError && ["MFA_REQUIRED", "UNAUTHENTICATED", "FORBIDDEN"].includes(failure.code)) { setFresh(false); setRound(previous => previous + 1); }
      if (failure instanceof ApiError && (failure.status === 401 || failure.code === "FORBIDDEN")) { dialog.current?.close(); setReview(null); setReason(""); setEvidence(""); setRefundId(""); operation.current = null; setDenied(true); }
    } finally { setBusy(false); }
  };
  if (denied) return <Notice error>دسترسی این عملیات برقرار نیست. <Link className="text-link" href="/admin/login">ورود دوباره به مدیریت</Link></Notice>;
  if (!eligible.length && !review && !saved) return null;
  return <section className="form-section"><h3>ثبت عدم انتقال وجهِ تأییدشده</h3><p className="helper" id={`${id}-help`}>این اقدام برای زمانی است که عدم انتقال وجه قطعی و قابل پیگیری است. اگر نتیجهٔ انتقال نامشخص است، آن را ناموفق ثبت نکنید؛ درخواست در انتظار یا در حال انجام باقی می‌ماند.</p>
    {error && <Notice error ref={errorRef} tabIndex={-1}>{error}</Notice>}
    {saved ? <><Notice>عدم انتقال وجه برای این درخواست ثبت شد. مبلغ آن به بازپرداخت‌های انجام‌شده افزوده نمی‌شود.</Notice>{eligible.some(refund => refund.id !== saved.id) && <button type="button" className="secondary" onClick={() => { setSaved(null); setReview(null); setRefundId(""); setOutcome("unknown"); setReason(""); setEvidence(""); operation.current = null; }}>بررسی درخواست دیگر</button>}</> : <>
      <form onSubmit={event => { event.preventDefault(); prepare(); }} noValidate><fieldset disabled={busy}><label htmlFor={`${id}-refund`}>درخواست برای بررسی عدم انتقال وجه</label><select id={`${id}-refund`} value={refundId} onChange={event => setRefundId(event.target.value)}><option value="">انتخاب کنید</option>{eligible.map(refund => <option value={refund.id} key={refund.id}>{money(refund.amount)} · {refund.reason}</option>)}</select>
        <fieldset className="form-section" aria-describedby={`${id}-help`}><legend>نتیجهٔ بررسی انتقال</legend><label className="checkbox-row"><input type="radio" name={`${id}-outcome`} checked={outcome === "unknown"} onChange={() => setOutcome("unknown")} />نتیجه هنوز مشخص نیست؛ وضعیت فعلی حفظ شود.</label><label className="checkbox-row"><input type="radio" name={`${id}-outcome`} checked={outcome === "confirmed_non_transfer"} onChange={() => setOutcome("confirmed_non_transfer")} />عدم انتقال وجه تأیید شده است.</label></fieldset>
        <label htmlFor={`${id}-reason`}>دلیل ثبت عدم انتقال وجه</label><textarea id={`${id}-reason`} rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} />
        <label htmlFor={`${id}-evidence`}>مدرک قابل پیگیری عدم انتقال وجه</label><textarea id={`${id}-evidence`} rows={3} value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={1000} aria-describedby={`${id}-evidence-help`} /><p className="helper" id={`${id}-evidence-help`}>مدرک بررسی را از ۱۰ تا ۱۰۰۰ نویسه بنویسید. این توضیح در بخش مالی مدیریت باقی می‌ماند.</p>
        <button type="submit" className="secondary" disabled={!refundId || outcome !== "confirmed_non_transfer" || busy}>بررسی ثبت عدم انتقال وجه</button>
      </fieldset></form>{review && <><p className="helper">اگر پاسخ ثبت تصمیم دریافت نشد، همین تصمیم و مدرک را نگه دارید و با تأیید تازه دوباره ثبت کنید. تغییر دلیل یا مدرک، تصمیم تازه محسوب می‌شود.</p><button type="button" className="text-button" disabled={busy} onClick={() => { setFresh(false); setDialogError(""); setRound(previous => previous + 1); dialog.current?.showModal(); }}>ارسال دوبارهٔ همان تصمیم</button></>}
    </>}
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby={`${id}-dialog-title`} onCancel={event => { if (busy) event.preventDefault(); else setFresh(false); }}><h2 id={`${id}-dialog-title`}>تأیید ثبت عدم انتقال وجه</h2>{review && <><p>سفارش <bdi>{review.orderNumber}</bdi></p><p>درخواست <bdi>{review.refundId}</bdi></p><p>مبلغ: {money(review.amount)}</p><p>نتیجه: عدم انتقال وجه تأیید شده است.</p><p>دلیل: <bdi>{review.input.reason}</bdi></p><p className="break-all">مدرک: <bdi>{review.input.evidence}</bdi></p><p className="helper">این ثبت، انتقال وجه انجام نمی‌دهد. نتیجهٔ نامشخص را با این تصمیم جایگزین نکنید.</p><fieldset disabled={busy}><AdminReauthentication key={`${review.input.operationKey}:${round}`} label="کد رمزساز برای ثبت عدم انتقال وجه" onSuccess={() => setFresh(true)} /></fieldset>{dialogError && <Notice error ref={dialogErrorRef} tabIndex={-1}>{dialogError}</Notice>}<div className="actions"><button type="button" disabled={!fresh || busy} onClick={execute}>{busy ? "در حال ثبت…" : "تأیید و ثبت عدم انتقال وجه"}</button><button type="button" className="secondary" disabled={busy} onClick={() => { dialog.current?.close(); setFresh(false); }}>بازگشت و اصلاح</button></div></>}</dialog>
  </section>;
}
