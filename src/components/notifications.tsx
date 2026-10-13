"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { NotificationAudience, NotificationPageDto } from "@/contracts/notifications";
import { api, ApiError, date, Empty, errorMessage, Loading, Notice } from "./commerce-client";
import { CustomerPrivateBoundary, useLifetimeSignal } from "./customer-session";
import { Pagination } from "./pagination";
import { reportUnits } from "./report-ui";
import { usePagedData } from "./use-paged-data";

export function AccountNotifications() {
  return <CustomerPrivateBoundary><h2>اعلان‌های حساب</h2><p className="muted">در محیط آزمایشی، پیامک ارسال نمی‌شود. اعلان‌های ثبت‌شدهٔ حساب در این بخش نمایش داده می‌شوند.</p><NotificationInbox audience="customer" canOpenOrders /></CustomerPrivateBoundary>;
}

/** Shared presentation; the caller supplies the native customer/operator boundary. */
export function NotificationInbox({ audience, canOpenOrders, onUnauthorized }: { audience: NotificationAudience; canOpenOrders: boolean; onUnauthorized?: (error: unknown) => void }) {
  const prefix = useId(), signal = useLifetimeSignal(), inFlight = useRef(false);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20), [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const endpoint = audience === "customer" ? "/api/notifications" : "/api/admin/notifications";
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), unreadOnly: String(unreadOnly) }).toString();
  const result = usePagedData<NotificationPageDto>(`${endpoint}/page`, query, true, onUnauthorized);
  const read = async (id: string) => {
    if (inFlight.current || signal.aborted) return;
    inFlight.current = true; setBusy(id); setError(""); setNotice("");
    try {
      await api(`${endpoint}/${id}`, { method: "PATCH", signal, body: "{}" });
      if (signal.aborted) return;
      setNotice("اعلان به‌عنوان خوانده‌شده ثبت شد."); result.reload();
    } catch (failure) {
      if (signal.aborted) return;
      if (failure instanceof ApiError && [401, 403].includes(failure.status)) onUnauthorized?.(failure);
      setError(errorMessage(failure));
    } finally { if (!signal.aborted) { inFlight.current = false; setBusy(""); } }
  };
  return <section aria-label={audience === "customer" ? "فهرست اعلان‌های حساب" : "فهرست اعلان‌های مدیریت"}>
    <div className="toolbar">
      <label className="checkbox-row" htmlFor={`${prefix}-unread`}><input id={`${prefix}-unread`} type="checkbox" checked={unreadOnly} onChange={event => { setUnreadOnly(event.target.checked); setPage(1); setError(""); setNotice(""); }} />فقط خوانده‌نشده‌ها</label>
      <div className="field"><label htmlFor={`${prefix}-size`}>اعلان در هر صفحه</label><select id={`${prefix}-size`} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[20, 50, 100].map(size => <option key={size} value={size}>{reportUnits(String(size))}</option>)}</select></div>
      <button className="secondary" type="button" onClick={() => { setError(""); result.reload(); }}>تازه‌سازی اعلان‌ها</button>
    </div>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {result.error ? <Notice error><p>اعلان‌ها دریافت نشدند. {result.error}</p><button className="secondary" type="button" onClick={result.reload}>تلاش دوبارهٔ اعلان‌ها</button></Notice> : !result.data ? <Loading label="در حال دریافت اعلان‌ها…" /> : <>
      <p className="small muted" role="status">اعلان‌های خوانده‌نشده در همهٔ صفحه‌ها: <bdi>{reportUnits(result.data.unreadCount)}</bdi></p>
      {!result.data.items.length && <Empty title={unreadOnly ? "اعلان خوانده‌نشده‌ای در این صفحه ندارید." : "در این صفحه اعلانی وجود ندارد."} />}
      {result.data.items.map(notification => <article key={notification.id} className="order-panel" aria-labelledby={`${prefix}-${notification.id}`} aria-busy={busy === notification.id}>
        <div className="section-heading"><h3 id={`${prefix}-${notification.id}`}><bdi>{notification.title}</bdi></h3><span className="status-badge">{notification.readAt ? "خوانده‌شده" : "تازه"}</span></div>
        <p className="article-content"><bdi>{notification.body}</bdi></p><p className="small muted"><time dateTime={notification.createdAt}>{date(notification.createdAt)}</time></p>
        <div className="actions">{notification.orderId && canOpenOrders && <Link className="text-link" href={`${audience === "customer" ? "/orders" : "/admin/orders"}/${notification.orderId}`}>مشاهدهٔ سفارش</Link>}{!notification.readAt && <button className="text-button" type="button" disabled={!!busy} onClick={() => void read(notification.id)}>{busy === notification.id ? "در حال ثبت…" : "علامت‌گذاری به‌عنوان خوانده‌شده"}</button>}</div>
      </article>)}
      <Pagination data={result.data} onPage={next => { setPage(next); setError(""); setNotice(""); }} label="صفحه‌های اعلان‌ها" />
    </>}
  </section>;
}
