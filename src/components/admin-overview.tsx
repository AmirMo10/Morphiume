"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { OrderDto, PageDto, ProductDto } from "@/contracts/commerce";
import { hasPermission, useAdmin } from "./admin-shell";
import { ApiError, date, Empty, faNumber, labelStatus, Loading, money, Notice } from "./commerce-client";
import { usePagedData } from "./use-paged-data";
import { AdminIcon, type AdminIconName } from "./admin-icons";

type Order = OrderDto & { financialVisible?: boolean };
type CountState = { data: { totalItems: number } | null; error: string; loading: boolean; reload: () => void };
function Count({ state }: { state: CountState }) { return <>{state.data ? faNumber(state.data.totalItems) : state.error ? "—" : "…"}</>; }
function Metric({ label, description, href, icon, state, attention = false }: { label: string; description: string; href: string; icon: AdminIconName; state: CountState; attention?: boolean }) {
  return <article className={"admin-metric" + (attention ? " admin-metric-attention" : "")} aria-busy={state.loading}>
    <div className="admin-metric-label"><span>{label}</span><span className="admin-metric-icon"><AdminIcon name={icon} /></span></div>
    <div className="admin-metric-value"><strong><Count state={state} /></strong><small>{description}</small></div>
    {state.error ? <Notice error>{state.error}<button type="button" className="text-button" onClick={state.reload}>تلاش دوباره</button></Notice> : <Link className="admin-metric-link" href={href}><span className="sr-only">مشاهده و مدیریت {label}</span></Link>}
  </article>;
}
function draftMissing(product: ProductDto) {
  return [!product.description.trim() && "توضیح محصول", !product.concentration.trim() && "غلظت", !product.family.trim() && "خانوادهٔ رایحه", !product.images?.length && !product.imageUrl && "تصویر", !product.variants.length && "حجم و قیمت"].filter(Boolean).join("، ");
}
export function AdminOverview() {
  const session = useAdmin(), router = useRouter();
  const [denied, setDenied] = useState(false);
  const [queue, setQueue] = useState("");
  const privateFailure = useCallback((error: unknown) => { if (error instanceof ApiError && [401, 403].includes(error.status)) { setDenied(true); router.replace("/admin/login"); } }, [router]);
  const catalog = hasPermission(session, "catalog.write") && !denied, canOrders = hasPermission(session, "orders.read") && !denied;
  const published = usePagedData<PageDto<ProductDto>>("/api/admin/products/page", "page=1&pageSize=1&status=published", catalog, privateFailure);
  const drafts = usePagedData<PageDto<ProductDto>>("/api/admin/products/page", "page=1&pageSize=4&status=draft", catalog, privateFailure);
  const orders = usePagedData<PageDto<Order>>("/api/admin/orders/page", "page=1&pageSize=6" + (queue ? "&status=" + queue : ""), canOrders, privateFailure);
  const totalOrders = usePagedData<PageDto<Order>>("/api/admin/orders/page", "page=1&pageSize=1", canOrders, privateFailure);
  const confirmed = usePagedData<PageDto<Order>>("/api/admin/orders/page", "page=1&pageSize=1&status=confirmed", canOrders, privateFailure);
  const exceptions = usePagedData<PageDto<Order>>("/api/admin/orders/page", "page=1&pageSize=1&status=payment_exception", canOrders, privateFailure);
  const awaiting = usePagedData<PageDto<Order>>("/api/admin/orders/page", "page=1&pageSize=1&status=awaiting_payment", canOrders, privateFailure);
  const reload = () => { [published, drafts, orders, totalOrders, confirmed, exceptions, awaiting].forEach(state => state.reload()); };
  if (denied) return <Loading label="در حال بررسی دوبارهٔ دسترسی مدیریت…" />;
  const showAmounts = !!orders.data?.items.some(order => order.financialVisible !== false);
  const queues: { label: string; value: string; state: CountState; detail: string; icon: AdminIconName }[] = [
    { label: "تأییدشده", value: "confirmed", state: confirmed, detail: "بررسی آماده‌سازی و ارسال", icon: "shipping" },
    { label: "استثنای پرداخت", value: "payment_exception", state: exceptions, detail: "بررسی پرداخت و تخصیص موجودی", icon: "audit" },
    { label: "در انتظار پرداخت", value: "awaiting_payment", state: awaiting, detail: "پرداخت هنوز تکمیل نشده است", icon: "orders" },
  ];
  return <div className="admin-overview">
    <div className="section-heading admin-page-heading"><div><p className="eyebrow">فضای کار / نمای کلی</p><h1>نمای کلی فروشگاه</h1><p className="muted">سفارش‌ها، کاتالوگ و کارهای پیش رو، در یک نگاه.</p></div><div className="actions"><button type="button" className="secondary" onClick={reload}><AdminIcon name="refresh" />به‌روزرسانی اطلاعات</button>{catalog && <Link className="button" href="/admin/products/new"><AdminIcon name="plus" />افزودن محصول</Link>}</div></div>
    <div className="admin-metrics">
      {canOrders && <Metric label="سفارش‌های دریافت‌شده" description="تعداد کل سفارش‌های ثبت‌شده" href="/admin/orders" icon="orders" state={totalOrders} />}
      {catalog && <><Metric label="محصولات منتشرشده" description="قابل مشاهده در فروشگاه" href="/admin/products?status=published" icon="products" state={published} /><Metric label="پیش‌نویس‌های کاتالوگ" description="برای تکمیل و بررسی انتشار" href="/admin/products?status=draft" icon="content" state={drafts} /></>}
      {canOrders && <Metric label="استثناهای پرداخت" description="وضعیت سفارش نیازمند بررسی" href="/admin/orders?status=payment_exception" icon="audit" state={exceptions} attention />}
    </div>
    {canOrders && <section className="admin-panel admin-queues"><div className="admin-panel-heading"><div className="admin-panel-title"><span className="admin-panel-icon"><AdminIcon name="inventory" /></span><div><h2>صف رسیدگی</h2></div></div></div><div className="admin-queue-grid">{queues.map(item => <Link href={`/admin/orders?status=${item.value}`} className={"admin-queue " + (item.value === "payment_exception" ? "admin-queue-attention" : "")} key={item.value}><span className="admin-queue-symbol"><AdminIcon name={item.icon} /></span><div className="admin-queue-copy"><span>{item.label}</span><small>{item.state.error ? "دریافت تعداد انجام نشد؛ فهرست را بررسی کنید." : item.detail}</small></div><strong><Count state={item.state} /></strong><AdminIcon name="arrow" /></Link>)}</div></section>}
    <div className="admin-overview-grid">
      <div className="admin-overview-primary">
        {canOrders ? <section className="admin-panel admin-orders-panel"><div className="admin-panel-heading"><div className="admin-panel-title"><span className="admin-panel-icon"><AdminIcon name="orders" /></span><div><h2>آخرین سفارش‌ها</h2><p>حداکثر شش سفارش تازه در وضعیت انتخاب‌شده</p></div></div><Link className="text-link" href="/admin/orders">فهرست کامل<AdminIcon name="arrow" /></Link></div>
          <div className="admin-tabs" aria-label="فیلتر آخرین سفارش‌ها">{[{ label: "همه", value: "" }, ...queues].map(item => <button type="button" key={item.value} aria-pressed={queue === item.value} onClick={() => setQueue(item.value)}>{item.label}</button>)}</div>
          {orders.error ? <Notice error>{orders.error}<button type="button" className="text-button" onClick={orders.reload}>تلاش دوباره</button></Notice> : !orders.data ? <Loading label="در حال دریافت سفارش‌ها…" /> : !orders.data.items.length ? <Empty title="سفارشی در این فهرست نیست."><span className="admin-empty-symbol" aria-hidden="true"><AdminIcon name="orders" /></span><p>سفارش‌های ثبت‌شده در وضعیت انتخاب‌شده اینجا نمایش داده می‌شوند.</p><Link href="/admin/orders" className="text-link">بررسی فهرست سفارش‌ها<AdminIcon name="arrow" /></Link></Empty> : <div className="table-wrap admin-recent-orders" tabIndex={0} role="region" aria-label="آخرین سفارش‌های فروشگاه"><table><caption className="sr-only">آخرین سفارش‌های فروشگاه</caption><thead><tr><th scope="col">سفارش</th><th scope="col">پرداخت</th><th scope="col">ارسال</th>{showAmounts && <th scope="col">مبلغ</th>}<th scope="col">بررسی</th></tr></thead><tbody>{orders.data.items.map(order => <tr key={order.id}><th scope="row"><bdi>{order.orderNumber}</bdi><small className="block muted">{date(order.createdAt)}</small></th><td><span className="status-badge" data-status={order.paymentStatus}>{labelStatus(order.paymentStatus, "payment")}</span></td><td><span className="status-badge" data-status={order.shipment?.status}>{order.shipment ? labelStatus(order.shipment.status, "shipment") : "هنوز ارسال نشده"}</span></td>{showAmounts && <td className="price">{order.financialVisible === false ? "—" : money(order.total)}</td>}<td><Link className="text-link" href={`/admin/orders/${order.id}`}>جزئیات</Link></td></tr>)}</tbody></table></div>}
          <div className="admin-panel-footer"><span>وضعیت پرداخت و ارسال به‌صورت جدا نمایش داده می‌شوند.</span><Link href="/admin/orders">مدیریت سفارش‌ها<AdminIcon name="arrow" /></Link></div>
        </section> : <section className="admin-panel"><div className="admin-panel-heading"><div><h2>مسیر کار شما</h2><p>ابزارهای این فضا بر اساس دسترسی حساب شما نمایش داده می‌شوند.</p></div></div><div className="actions">{catalog && <Link className="button" href="/admin/products">مدیریت کاتالوگ</Link>}{hasPermission(session, "inventory.write") && <Link className="button secondary" href="/admin/inventory">بررسی موجودی</Link>}{hasPermission(session, "analytics.read") && <Link className="button secondary" href="/admin/analytics">آمار فعالیت</Link>}</div></section>}
      </div>
      <aside className="admin-overview-secondary">
        {catalog && <section className="admin-panel admin-catalog-readiness"><div className="admin-panel-heading"><div className="admin-panel-title"><span className="admin-panel-icon"><AdminIcon name="products" /></span><div><h2>تکمیل کاتالوگ</h2><p>پیش‌نویس‌های آمادهٔ بررسی</p></div></div></div>{drafts.error ? <Notice error>{drafts.error}<button type="button" className="text-button" onClick={drafts.reload}>تلاش دوباره</button></Notice> : !drafts.data ? <Loading /> : drafts.data.items.length ? <ul className="admin-draft-list">{drafts.data.items.map(product => <li key={product.id}><Link href={`/admin/products/${product.id}`}><span className="admin-draft-symbol"><AdminIcon name="content" /></span><div><strong><bdi>{product.name}</bdi></strong><span>{draftMissing(product) ? "نیاز به تکمیل: " + draftMissing(product) : "اطلاعات اولیه کامل؛ پیش‌نمایش و انتشار را بررسی کنید."}</span></div><AdminIcon name="arrow" /></Link></li>)}</ul> : <p className="muted">پیش‌نویسی برای تکمیل وجود ندارد.</p>}<Link className="text-link admin-panel-link" href="/admin/products?status=draft">مشاهدهٔ همهٔ پیش‌نویس‌ها<AdminIcon name="arrow" /></Link><p className="helper admin-source-note">حداکثر چهار پیش‌نویس نمایش داده می‌شود. سرور آمادگی نهایی را هنگام انتشار بررسی می‌کند.</p></section>}
        <section className="admin-panel admin-quick-actions"><div className="admin-panel-heading"><div><h2>دسترسی سریع</h2><p>ابزارهای پرکاربرد فروشگاه</p></div></div>{hasPermission(session, "inventory.write") && <Link href="/admin/inventory"><span className="admin-shortcut-icon"><AdminIcon name="inventory" /></span><div><strong>بررسی موجودی</strong><small>موجودی و دفتر تغییرات</small></div><AdminIcon name="arrow" /></Link>}{catalog && <Link href="/admin/bulk"><span className="admin-shortcut-icon"><AdminIcon name="bulk" /></span><div><strong>ویرایش گروهی</strong><small>بررسی تغییرات پیش از ثبت</small></div><AdminIcon name="arrow" /></Link>}{hasPermission(session, "content.write") && <Link href="/admin/presentation"><span className="admin-shortcut-icon"><AdminIcon name="presentation" /></span><div><strong>نمایش فروشگاه</strong><small>بخش‌ها و محتوای صفحهٔ اصلی</small></div><AdminIcon name="arrow" /></Link>}{canOrders && <Link href="/admin/orders"><span className="admin-shortcut-icon"><AdminIcon name="orders" /></span><div><strong>جست‌وجوی سفارش</strong><small>پرداخت، ارسال و سوابق</small></div><AdminIcon name="arrow" /></Link>}</section>
      </aside>
    </div>
  </div>;
}
