"use client";
import Link from "next/link";
import type { OrderDto, PageDto, ProductDto } from "@/contracts/commerce";
import { hasPermission, useAdmin } from "./admin-shell";
import { faNumber, Notice } from "./commerce-client";
import { usePagedData } from "./use-paged-data";
export function AdminOverview() {
  const session = useAdmin();
  const catalog = hasPermission(session, "catalog.write"), canOrders = hasPermission(session, "orders.read");
  const published = usePagedData<PageDto<ProductDto>>("/api/admin/products/page", "page=1&pageSize=1&status=published", catalog);
  const drafts = usePagedData<PageDto<ProductDto>>("/api/admin/products/page", "page=1&pageSize=1&status=draft", catalog);
  const orders = usePagedData<PageDto<OrderDto>>("/api/admin/orders/page", "page=1&pageSize=1", canOrders);
  return <><p className="eyebrow"><bdi>Morphiume</bdi> / مدیریت فروشگاه</p><h1>نمای کلی</h1><p className="muted">آمار محصولات و سفارش‌های ثبت‌شده.</p><div className="metric-grid">{catalog && <>{[{ label: "محصولات منتشرشده", state: published, href: "/admin/products?status=published" }, { label: "پیش‌نویس‌ها", state: drafts, href: "/admin/products?status=draft" }].map(metric => <div className="metric" key={metric.label} aria-busy={metric.state.loading}><p>{metric.label}</p><strong>{metric.state.data ? faNumber(metric.state.data.totalItems) : metric.state.error ? "—" : "…"}</strong>{metric.state.error && <Notice error>{metric.state.error}<button type="button" className="text-button" onClick={metric.state.reload}>تلاش دوباره</button></Notice>}<Link className="text-link small" href={metric.href}>مدیریت محصولات</Link></div>)}</>}{canOrders && <div className="metric" aria-busy={orders.loading}><p>سفارش‌های دریافت‌شده</p><strong>{orders.data ? faNumber(orders.data.totalItems) : orders.error ? "—" : "…"}</strong>{orders.error && <Notice error>{orders.error}<button type="button" className="text-button" onClick={orders.reload}>تلاش دوباره</button></Notice>}<Link className="text-link small" href="/admin/orders">بررسی سفارش‌ها</Link></div>}</div><section className="form-section"><h2>شروع کار</h2><div className="actions">{catalog && <Link className="button" href="/admin/products/new">افزودن محصول</Link>}{canOrders && <Link className="button secondary" href="/admin/orders">بررسی سفارش‌ها</Link>}{hasPermission(session, "content.write") && <Link className="button secondary" href="/admin/content">ویرایش محتوای فروشگاه</Link>}</div></section></>;
}