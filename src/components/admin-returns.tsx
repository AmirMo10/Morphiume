"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { OrderDto, ReturnDecisionDto, ReturnDecisionInput, ReturnKind, ReturnStatus } from "@/contracts/commerce";
import { hasPermission, useAdmin } from "./admin-shell";
import { api, ApiError, errorMessage, labelStatus, Notice } from "./commerce-client";

type DecisionStatus = ReturnDecisionInput["status"];
type Attempt = { requestId: string; input: ReturnDecisionInput };
export function returnNextStatuses(kind: ReturnKind, status: ReturnStatus): DecisionStatus[] {
  if (status === "pending") return ["approved", "rejected"];
  if (status === "approved") return kind === "cancel" ? ["closed"] : ["received", "closed"];
  return kind === "return" && status === "received" ? ["closed"] : [];
}
const decisionLabels: Record<DecisionStatus, string> = { approved: "تأیید درخواست", rejected: "رد درخواست", received: "ثبت دریافت کالای مرجوعی", closed: "بستن پرونده" };
export function AdminReturns({ order, onChange, onAccessDenied }: { order: OrderDto; onChange: () => Promise<unknown>; onAccessDenied?: () => void }) {
  const session = useAdmin();
  if (!order.returns.length || !hasPermission(session, "orders.fulfill")) return null;
  return <ReturnDecisionEditor key={`${session?.user.id}:${order.id}`} order={order} onChange={onChange} onAccessDenied={onAccessDenied} />;
}
function ReturnDecisionEditor({ order, onChange, onAccessDenied }: { order: OrderDto; onChange: () => Promise<unknown>; onAccessDenied?: () => void }) {
  const session = useAdmin(), router = useRouter(), prefix = useId();
  const inventory = hasPermission(session, "inventory.write");
  const [id, setId] = useState(""), [status, setStatus] = useState<DecisionStatus | "">("");
  const [reason, setReason] = useState(""), [stockChoice, setStockChoice] = useState<"" | "keep_out" | "restock">("");
  const [busy, setBusy] = useState(false), [denied, setDenied] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null), [fields, setFields] = useState<Record<string, string>>({});
  const inFlight = useRef(false), summary = useRef<HTMLDivElement>(null);
  const selected = order.returns.find(request => request.id === id);
  const allNext = selected ? returnNextStatuses(selected.kind, selected.status) : [];
  const next = allNext.filter(value => inventory || !(selected?.kind === "cancel" && value === "approved"));
  const selectedStatus = next.includes(status as DecisionStatus) ? status : "";
  const fieldId = (path: string) => `${prefix}-${path}`;
  useEffect(() => { if (error) summary.current?.focus(); }, [error]);
  const edited = () => { setAttempt(null); setError(""); setNotice(""); setFields({}); };
  const execute = async (proposal: Attempt) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice(""); setAttempt(proposal);
    let recorded = false;
    try {
      await api<ReturnDecisionDto>(`/api/admin/returns/${proposal.requestId}`, { method: "PATCH", body: JSON.stringify(proposal.input) });
      recorded = true;
      setAttempt(null); setNotice("نتیجهٔ رسیدگی ثبت شد. وضعیت مالی و بازپرداخت جداگانه بررسی می‌شوند.");
      await onChange();
    } catch (failure) {
      setError(recorded ? "تصمیم ثبت شد، اما وضعیت تازه دریافت نشد. دوباره وضعیت را بررسی کنید." : failure instanceof TypeError ? "پاسخ ثبت تصمیم دریافت نشد. وضعیت را بررسی کنید و در صورت نیاز همان تصمیم را دوباره ارسال کنید." : errorMessage(failure));
      if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setId(""); setStatus(""); setReason(""); setStockChoice(""); setAttempt(null); setDenied(true); onAccessDenied?.(); router.replace("/admin/login"); }
      else if (failure instanceof ApiError) setFields(Object.fromEntries(Object.entries(failure.fields ?? {}).map(([path, message]) => [path === "restock" ? "stock" : path, message])));
    } finally { inFlight.current = false; setBusy(false); }
  };
  const save = () => {
    if (inFlight.current) return;
    const validation: Record<string, string> = {};
    if (!selected) validation.request = "درخواست را انتخاب کنید.";
    if (!selectedStatus) validation.status = "یکی از نتیجه‌های مجاز برای وضعیت فعلی را انتخاب کنید.";
    if (!reason.trim() || reason.trim().length > 1000) validation.reason = "دلیل رسیدگی را وارد کنید (حداکثر ۱۰۰۰ نویسه).";
    if (selectedStatus === "received" && (!stockChoice || (stockChoice === "restock" && !inventory))) validation.stock = "تصمیم دربارهٔ موجودی کالای دریافت‌شده را صریحاً انتخاب کنید.";
    setFields(validation); if (Object.keys(validation).length) { setError("فیلدهای مشخص‌شده را بررسی کنید."); return; }
    const input: ReturnDecisionInput = { status: selectedStatus as DecisionStatus, reason: reason.trim(), ...(selectedStatus === "received" ? { restock: stockChoice === "restock" } : {}) };
    void execute({ requestId: id, input });
  };
  if (denied) return <Notice error>دسترسی رسیدگی تغییر کرده است. دوباره وارد مدیریت شوید.</Notice>;
  return <section className="order-panel" aria-labelledby={`${prefix}-heading`}><h2 id={`${prefix}-heading`}>رسیدگی به لغو و مرجوعی</h2>
    {error && <Notice error ref={summary} tabIndex={-1}><p>{error}</p>{Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([path, message]) => <li key={path}><a href={`#${fieldId(path)}`}>{message}</a></li>)}</ul>}<p>دلیل و تصمیم واردشده حفظ شده‌اند. پیش از تصمیم تازه، وضعیت فعلی سفارش را بررسی کنید.</p><button type="button" className="text-button" disabled={busy} onClick={() => void onChange()}>بررسی وضعیت فعلی درخواست</button></Notice>}
    {notice && <Notice>{notice}</Notice>}
    <form onSubmit={event => { event.preventDefault(); save(); }} noValidate><fieldset disabled={busy}>
      <label htmlFor={fieldId("request")}>درخواست مشتری</label><select id={fieldId("request")} required value={id} onChange={event => { setId(event.target.value); setStatus(""); setReason(""); setStockChoice(""); edited(); }} aria-invalid={!!fields.request} aria-describedby={fields.request ? fieldId("request-error") : undefined}><option value="">انتخاب کنید</option>{order.returns.map(request => <option key={request.id} value={request.id}>{request.kind === "return" ? "مرجوعی" : "لغو"} · {labelStatus(request.status, "return")} · {request.reason}</option>)}</select>{fields.request && <p className="field-error" id={fieldId("request-error")}>{fields.request}</p>}
      {selected && <><p>نوع درخواست: {selected.kind === "return" ? "مرجوعی" : "لغو"} · وضعیت فعلی: {labelStatus(selected.status, "return")}</p><p><bdi>{selected.reason}</bdi></p></>}
      {selected && next.length === 0 && <p className="helper">برای وضعیت فعلی، تصمیم تازه‌ای قابل ثبت نیست. وضعیت و توضیح ثبت‌شده را بررسی کنید.</p>}
      {selected?.kind === "cancel" && selected.status === "pending" && !inventory && <p className="helper">تأیید لغو، موجودی یا رزرو سفارش را آزاد می‌کند و به مجوز موجودی نیاز دارد. رد درخواست برای این نقش در دسترس است.</p>}
      <label htmlFor={fieldId("status")}>نتیجهٔ رسیدگی</label><select id={fieldId("status")} required disabled={!selected || next.length === 0} value={selectedStatus} onChange={event => { setStatus(event.target.value as DecisionStatus | ""); setStockChoice(""); edited(); }} aria-invalid={!!fields.status} aria-describedby={fields.status ? fieldId("status-error") : undefined}><option value="">نتیجه را انتخاب کنید</option>{next.map(value => <option key={value} value={value}>{decisionLabels[value]}</option>)}</select>{fields.status && <p className="field-error" id={fieldId("status-error")}>{fields.status}</p>}
      <label htmlFor={fieldId("reason")}>دلیل و توضیح رسیدگی</label><textarea id={fieldId("reason")} required rows={3} maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); edited(); }} aria-invalid={!!fields.reason} aria-describedby={fields.reason ? fieldId("reason-error") : undefined} />{fields.reason && <p className="field-error" id={fieldId("reason-error")}>{fields.reason}</p>}
      {selectedStatus === "received" && <fieldset id={fieldId("stock")} tabIndex={-1} aria-invalid={!!fields.stock} aria-describedby={`${fieldId("stock-help")}${fields.stock ? " " + fieldId("stock-error") : ""}`}><legend>تصمیم دربارهٔ موجودی کالای دریافت‌شده</legend><p className="helper" id={fieldId("stock-help")}>دریافت فیزیکی کالا و بازگشت آن به موجودی فروش دو تصمیم جدا هستند. بازگشت به فروش فقط پس از بررسی دستی کیفیت و با مجوز موجودی ثبت می‌شود.</p><label className="checkbox-row"><input type="radio" name={`${prefix}-stock`} checked={stockChoice === "keep_out"} onChange={() => { setStockChoice("keep_out"); edited(); }} />دریافت ثبت شود؛ کالا به موجودی فروش برنگردد.</label><label className="checkbox-row"><input type="radio" name={`${prefix}-stock`} disabled={!inventory} checked={stockChoice === "restock"} onChange={() => { setStockChoice("restock"); edited(); }} />پس از بررسی دستی کیفیت، کالا قابل فروش است و به موجودی فروش برگردد.</label>{!inventory && <p className="helper">نقش فعلی مجوز بازگشت کالا به موجودی فروش را ندارد؛ ثبت دریافت بدون بازگشت موجودی ممکن است.</p>}{fields.stock && <p className="field-error" id={fieldId("stock-error")}>{fields.stock}</p>}</fieldset>}
      <p className="helper">ثبت این تصمیم، بازپرداخت وجه انجام نمی‌دهد. وضعیت مالی سفارش را جداگانه بررسی کنید.</p><button className="secondary" disabled={busy || !selectedStatus || !reason.trim() || (selectedStatus === "received" && !stockChoice)}>{busy ? "در حال ثبت…" : "ثبت رسیدگی"}</button>
    </fieldset></form>
    {attempt && <section className="form-section" aria-labelledby={`${prefix}-retry`}><h3 id={`${prefix}-retry`}>ارسال دوبارهٔ همان تصمیم</h3><p>{decisionLabels[attempt.input.status]} · دلیل: <bdi>{attempt.input.reason}</bdi>{attempt.input.status === "received" && (attempt.input.restock ? " · با بازگشت به موجودی فروش" : " · بدون بازگشت به موجودی فروش")}</p><p className="helper">همان درخواست، نتیجه، دلیل و تصمیم موجودی دوباره ارسال می‌شوند. با ویرایش فرم، تصمیم تازه ساخته می‌شود؛ اختلاف با تصمیم ثبت‌شده نیازمند بررسی است.</p><button type="button" className="secondary" disabled={busy} onClick={() => void execute(attempt)}>ارسال دوبارهٔ همان تصمیم</button></section>}
  </section>;
}
