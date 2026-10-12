"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, date, Empty, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { CustomerPrivateBoundary, useLifetimeSignal } from "./customer-session";
type Notification = { id: string; title: string; body: string; createdAt: string; readAt: string | null; orderId?: string };
export function AccountNotifications() {
  return <CustomerPrivateBoundary><NotificationsForActor /></CustomerPrivateBoundary>;
}
function NotificationsForActor() {
  const signal = useLifetimeSignal();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); api<Notification[]>("/api/notifications",{signal:controller.signal}).then(result => { if (!controller.signal.aborted) setNotifications(result); }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }); return () => controller.abort(); }, []);
  const read = async (id: string) => { setBusy(id); setError(""); try { await api(`/api/notifications/${id}`, { method: "PATCH", signal, body: "{}" }); const result = await api<Notification[]>("/api/notifications",{signal}); if (!signal.aborted) setNotifications(result); } catch (e) { setError(errorMessage(e)); } finally { setBusy(""); } };
  return <><h2>اعلان‌های حساب</h2><p className="muted">در محیط آزمایشی، پیامک ارسال نمی‌شود. اعلان‌های ثبت‌شدهٔ حساب در این بخش نمایش داده می‌شوند.</p>{error && <Notice error>{error}</Notice>}{!notifications ? <Loading /> : !notifications.length ? <Empty title="اعلان تازه‌ای ندارید." /> : <><p className="small muted">{faNumber(notifications.filter(n => !n.readAt).length)} اعلان خوانده‌نشده</p>{notifications.map(notification => <article key={notification.id} className="order-panel"><div className="section-heading"><h3><bdi>{notification.title}</bdi></h3><span className="status-badge">{notification.readAt ? "خوانده‌شده" : "تازه"}</span></div><p className="article-content"><bdi>{notification.body}</bdi></p><p className="small muted">{date(notification.createdAt)}</p><div className="actions">{notification.orderId && <Link className="text-link" href={`/orders/${notification.orderId}`}>مشاهدهٔ سفارش</Link>}{!notification.readAt && <button className="text-button" disabled={busy === notification.id} onClick={() => read(notification.id)}>{busy === notification.id ? "در حال ثبت…" : "خوانده شد"}</button>}</div></article>)}</>}</>;
}
