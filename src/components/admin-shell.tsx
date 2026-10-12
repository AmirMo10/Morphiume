"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Permission, Role } from "@/contracts/commerce";
import { adminAuth } from "./auth-clients";
import { api, ApiError, authMessage, errorMessage, Loading, Notice } from "./commerce-client";

export type AdminSession = { user: { id: string; name: string; email: string }; role: Role; roles?: Role[]; permissions?: Permission[]; mfaVerified: boolean; mfaRequired?: boolean };
const permissions: Record<Role, Permission[]> = { owner: ["catalog.write", "inventory.write", "orders.read", "orders.fulfill", "refunds.write", "roles.write", "content.write"], product_manager: ["catalog.write", "content.write"], fulfillment: ["inventory.write", "orders.read", "orders.fulfill"], support: ["orders.read"], finance: ["orders.read", "refunds.write"] };
const Context = createContext<AdminSession | null>(null);
export function useAdmin() { return useContext(Context); }
export function hasPermission(session: AdminSession | null, permission: Permission) { return !!session && (session.permissions ?? permissions[session.role] ?? []).includes(permission); }
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (pathname === "/admin/login") return; let alive = true; api<AdminSession>("/api/admin/session").then(s => { if (!s.mfaVerified) router.replace("/admin/login"); else if (alive) setSession(s); }).catch(e => { if (e instanceof ApiError && [401, 403].includes(e.status)) router.replace("/admin/login"); else if (alive) setError(errorMessage(e)); }); return () => { alive = false; }; }, [pathname, router]);
  if (pathname === "/admin/login") return <>{children}</>;
  if (!session) return <main id="main" className="page">{error ? <Notice error>{error}<Link href="/admin/login" className="text-link">ورود دوباره</Link></Notice> : <Loading label="در حال بررسی دسترسی مدیریت…" />}</main>;
  const links = [{ href: "/admin", label: "نمای کلی" }, { href: "/admin/products", label: "محصولات", permission: "catalog.write" }, { href: "/admin/inventory", label: "موجودی", permission: "inventory.write" }, { href: "/admin/bulk", label: "ویرایش گروهی", permission: hasPermission(session, "catalog.write") ? "catalog.write" : "inventory.write" }, { href: "/admin/orders", label: "سفارش‌ها", permission: "orders.read" }, { href: "/admin/coupons", label: "تخفیف‌ها", permission: "content.write" }, { href: "/admin/collections", label: "مجموعه‌ها", permission: "catalog.write" }, { href: "/admin/import", label: "ورود گروهی محصولات", permission: "catalog.write" }, { href: "/admin/customers", label: "مشتریان و مدیران", permission: "roles.write" }, { href: "/admin/reports", label: "گزارش‌ها", permission: "refunds.write" }, { href: "/admin/audit", label: "تاریخچهٔ مدیریت", permission: "roles.write" }, { href: "/admin/content", label: "محتوا", permission: "content.write" }, { href: "/admin/settings", label: "تنظیمات", permission: "content.write" }];
  return <Context.Provider value={session}><div className="admin-layout"><aside className="admin-sidebar"><p className="small muted"><bdi>{session.user.name || session.user.email}</bdi></p><nav aria-label="پنل مدیریت">{links.filter(link => !link.permission || hasPermission(session, link.permission as Permission)).map(link => <Link href={link.href} key={link.href} aria-current={pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href)) ? "page" : undefined}>{link.label}</Link>)}</nav><button className="text-button" onClick={async () => { const result = await adminAuth.signOut(); if (result.error) { setError(authMessage(result.error)); return; } setSession(null); router.replace("/admin/login"); }}>خروج از مدیریت</button></aside><main id="main" className="admin-main">{error && <Notice error>{error}</Notice>}{children}</main></div></Context.Provider>;
}
