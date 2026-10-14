"use client";
import { useId, useRef, useState } from "react";
import { api, ApiError, date, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { hasPermission, useAdmin } from "./admin-shell";
import { usePagedData } from "./use-paged-data";
type Note = { id: string; reason: string; createdAt: string; actorId: string };
export function AdminOrderNotes({ orderId }: { orderId: string }) {
  const session = useAdmin();
  const prefix = useId(), inFlight = useRef(false);
  const notes = usePagedData<Note[]>(`/api/admin/orders/${orderId}/notes`, "", hasPermission(session, "orders.read"));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = async () => {
    if (inFlight.current || !reason.trim()) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try { await api(`/api/admin/orders/${orderId}/notes`, { method: "POST", body: JSON.stringify({ reason }) }); setReason(""); notes.reload(); setNotice("یادداشت داخلی ثبت شد."); }
    catch (e) { setError(errorMessage(e)); if (e instanceof ApiError && [401, 403].includes(e.status)) setReason(""); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (!hasPermission(session, "orders.read")) return null;
  return <section className="order-panel" aria-labelledby={prefix + "-heading"}><div className="section-heading"><div><h2 id={prefix + "-heading"}>یادداشت داخلی</h2><p className="helper">این یادداشت‌ها فقط در پنل مدیریت نمایش داده می‌شوند.</p></div><button type="button" className="text-button" onClick={notes.reload} disabled={busy}>به‌روزرسانی یادداشت‌ها</button></div>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{notes.error ? <Notice error>{notes.error}<button type="button" className="text-button" onClick={notes.reload}>تلاش دوباره</button></Notice> : !notes.data ? <Loading label="در حال دریافت یادداشت‌ها…" /> : notes.data.length ? <ol className="admin-note-list">{notes.data.map(note => <li key={note.id}><p dir="auto"><bdi>{note.reason}</bdi></p><time dateTime={note.createdAt}>{date(note.createdAt)}</time></li>)}</ol> : <p className="muted small">هنوز یادداشت داخلی برای این سفارش ثبت نشده است.</p>}<form onSubmit={e => { e.preventDefault(); void save(); }}><label htmlFor="order-note">یادداشت تازه</label><textarea id="order-note" rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} required aria-describedby={prefix + "-count"} dir="auto" /><div className="admin-note-form-footer"><span id={prefix + "-count"}>{faNumber(reason.length)} از {faNumber(1000)} نویسه</span><button className="secondary" disabled={busy || !reason.trim()}>{busy ? "در حال ثبت…" : "ثبت یادداشت"}</button></div></form></section>;
}
