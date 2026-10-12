"use client";
import { useEffect, useState } from "react";
import { api, date, errorMessage, Notice } from "./commerce-client";
type Note = { id: string; reason: string; createdAt: string; actorId: string };
export function AdminOrderNotes({ orderId }: { orderId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api<Note[]>(`/api/admin/orders/${orderId}/notes`).then(setNotes).catch(e => setError(errorMessage(e))); }, [orderId]);
  const save = async () => { setBusy(true); setError(""); try { await api(`/api/admin/orders/${orderId}/notes`, { method: "POST", body: JSON.stringify({ reason }) }); setReason(""); setNotes(await api<Note[]>(`/api/admin/orders/${orderId}/notes`)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <section className="order-panel"><h2>یادداشت داخلی</h2><p className="helper">این یادداشت‌ها فقط در پنل مدیریت نمایش داده می‌شوند.</p>{error && <Notice error>{error}</Notice>}{notes.map(note => <div key={note.id}><p><bdi>{note.reason}</bdi></p><p className="small muted">{date(note.createdAt)}</p></div>)}<form onSubmit={e => { e.preventDefault(); save(); }}><label htmlFor="order-note">یادداشت تازه</label><textarea id="order-note" rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} required /><button className="secondary" disabled={busy || !reason.trim()}>{busy ? "در حال ثبت…" : "ثبت یادداشت"}</button></form></section>;
}
