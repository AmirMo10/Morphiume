"use client";
import { useState } from "react";
import type { OrderDto } from "@/contracts/commerce";
import { api, errorMessage, labelStatus, Notice } from "./commerce-client";
export function AdminReturns({ order, onChange }: { order: OrderDto; onChange: () => Promise<unknown> }) {
  const [id, setId] = useState("");
  const [status, setStatus] = useState("approved");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = order.returns.find(r => r.id === id);
  const save = async () => { setBusy(true); setError(""); setNotice(""); try { await api(`/api/admin/returns/${id}`, { method: "PATCH", body: JSON.stringify({ status, reason, restock }) }); setReason(""); setRestock(false); await onChange(); setNotice("نتیجهٔ رسیدگی ثبت شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  if (!order.returns.length) return null;
  return <section className="order-panel"><h2>رسیدگی به لغو و مرجوعی</h2>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}<form onSubmit={e => { e.preventDefault(); save(); }}><label htmlFor="return-request">درخواست مشتری</label><select id="return-request" value={id} onChange={e => { setId(e.target.value); setRestock(false); }} required><option value="">انتخاب کنید</option>{order.returns.map(r => <option key={r.id} value={r.id}>{r.kind === "return" ? "مرجوعی" : "لغو"} · {labelStatus(r.status)} · {r.reason}</option>)}</select>{selected && <p>{selected.reason}</p>}<label htmlFor="return-decision">نتیجهٔ رسیدگی</label><select id="return-decision" value={status} onChange={e => { setStatus(e.target.value); setRestock(false); }}><option value="approved">تأیید درخواست</option><option value="rejected">رد درخواست</option><option value="received">ثبت دریافت کالای مرجوعی</option><option value="closed">بستن پرونده</option></select><label htmlFor="return-decision-reason">دلیل و توضیح رسیدگی</label><textarea id="return-decision-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} required />{status === "received" && <label className="checkbox-row"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />کالای دریافت‌شده بررسی شده و قابل بازگشت به موجودی فروش است.</label>}<p className="helper">وضعیت مالی و بازپرداخت جداگانه ثبت می‌شوند. سرور مجازبودن تغییر وضعیت و اثر موجودی را بررسی می‌کند.</p><button className="secondary" disabled={busy || !id || !reason.trim()}>{busy ? "در حال ثبت…" : "ثبت رسیدگی"}</button></form></section>;
}
