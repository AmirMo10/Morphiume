"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrderDto, ProductDto } from "@/contracts/commerce";
import { hasPermission, useAdmin } from "./admin-shell";
import { api, errorMessage, faNumber, Notice } from "./commerce-client";
export function AdminOverview() {
  const session = useAdmin();
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (hasPermission(session, "catalog.write")) api<ProductDto[]>("/api/admin/products").then(setProducts).catch(e => setError(errorMessage(e))); if (hasPermission(session, "orders.read")) api<OrderDto[]>("/api/admin/orders").then(setOrders).catch(e => setError(errorMessage(e))); }, [session]);
  return <><p className="eyebrow">Morphiume / مدیریت فروشگاه</p><h1>نمای کلی</h1><p className="muted">محصولات و سفارش‌های دریافت‌شده از سرور.</p>{error && <Notice error>{error}</Notice>}<div className="metric-grid">{products !== null && <><div className="metric"><p>محصولات منتشرشده</p><strong>{faNumber(products.filter(p => p.status === "published").length)}</strong><Link className="text-link small" href="/admin/products">مدیریت محصولات</Link></div><div className="metric"><p>پیش‌نویس‌ها</p><strong>{faNumber(products.filter(p => p.status === "draft").length)}</strong><Link className="text-link small" href="/admin/products/new">افزودن محصول</Link></div></>}{orders !== null && <div className="metric"><p>سفارش‌های دریافت‌شده</p><strong>{faNumber(orders.length)}</strong><Link className="text-link small" href="/admin/orders">بررسی سفارش‌ها</Link></div>}</div><section className="form-section"><h2>شروع کار</h2><div className="actions">{hasPermission(session, "catalog.write") && <Link className="button" href="/admin/products/new">افزودن محصول</Link>}{hasPermission(session, "orders.read") && <Link className="button secondary" href="/admin/orders">بررسی سفارش‌ها</Link>}{hasPermission(session, "content.write") && <Link className="button secondary" href="/admin/content">ویرایش محتوای فروشگاه</Link>}</div></section></>;
}
