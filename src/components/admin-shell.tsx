"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Permission, Role } from "@/contracts/commerce";
import { adminAuth } from "./auth-clients";
import { api, ApiError, authMessage, errorMessage, Loading, Notice } from "./commerce-client";
import { AdminIcon, type AdminIconName } from "./admin-icons";
import { CspImage } from "./csp-image";

export type AdminSession = { user: { id: string; name: string; email: string }; role: Role; roles?: Role[]; permissions?: Permission[]; mfaVerified: boolean; mfaRequired?: boolean; accessMode?: "private-preview" | "authenticated" };
const permissions: Record<Role, Permission[]> = { owner: ["catalog.write", "inventory.write", "orders.read", "orders.fulfill", "refunds.write", "roles.write", "content.write", "analytics.read"], product_manager: ["catalog.write", "content.write", "analytics.read"], fulfillment: ["inventory.write", "orders.read", "orders.fulfill"], support: ["orders.read"], finance: ["orders.read", "refunds.write", "analytics.read"] };
const roleLabels: Record<Role, string> = { owner: "مالک فروشگاه", product_manager: "مدیر محصول", fulfillment: "مسئول آماده‌سازی", support: "پشتیبانی", finance: "امور مالی" };
const Context = createContext<AdminSession | null>(null);
export function useAdmin() { return useContext(Context); }
export function hasPermission(session: AdminSession | null, permission: Permission) { return !!session && (session.permissions ?? permissions[session.role] ?? []).includes(permission); }
type Destination = { href: string; label: string; icon: AdminIconName; permission?: Permission; visible?: boolean };

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState("");
  const [navigation, setNavigation] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pathname === "/admin/login") return;
    let alive = true;
    api<AdminSession>("/api/admin/session").then(s => {
      if (!alive) return;
      if (!s.mfaVerified) { setSession(null); router.replace("/admin/login"); }
      else { setSession(s); setError(""); }
    }).catch(e => {
      if (!alive) return;
      if (e instanceof ApiError && [401, 403].includes(e.status)) { setSession(null); router.replace("/admin/login"); }
      else setError(errorMessage(e));
    });
    return () => { alive = false; };
  }, [pathname, router]);
  useEffect(() => {
    if (!navigation) return;
    navigationPanel.current?.querySelector<HTMLAnchorElement>("nav a[aria-current='page']")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavigation(false);
      navigationToggle.current?.focus();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [navigation]);
  if (pathname === "/admin/login") return <div className="admin-login-layout">{children}</div>;
  if (!session) return <main id="main" className="page admin-access-state">{error ? <Notice error>{error}<Link href="/admin/login" className="text-link">ورود دوباره</Link></Notice> : <Loading label="در حال بررسی دسترسی مدیریت…" />}</main>;
  const preview = session.accessMode === "private-preview";
  const sessionScope = [session.accessMode ?? "authenticated", session.user.id, ...(session.roles ?? [session.role]), ...(session.permissions ?? permissions[session.role] ?? [])].join(":");
  const groups: { label: string; links: Destination[] }[] = [
    { label: "فضای کار", links: [{ href: "/admin", label: "نمای کلی", icon: "overview" }, { href: "/admin/orders", label: "سفارش‌ها", icon: "orders", permission: "orders.read" }, { href: "/admin/inventory", label: "موجودی", icon: "inventory", permission: "inventory.write" }, { href: "/admin/notifications", label: "اعلان‌های مدیریت", icon: "notifications", visible: hasPermission(session, "orders.fulfill") || hasPermission(session, "refunds.write") }] },
    { label: "کاتالوگ و فروش", links: [{ href: "/admin/products", label: "محصولات", icon: "products", permission: "catalog.write" }, { href: "/admin/collections", label: "مجموعه‌ها", icon: "collections", permission: "catalog.write" }, { href: "/admin/bulk", label: "ویرایش گروهی", icon: "bulk", permission: hasPermission(session, "catalog.write") ? "catalog.write" : "inventory.write" }, { href: "/admin/import", label: "ورود گروهی محصولات", icon: "import", permission: "catalog.write" }, { href: "/admin/coupons", label: "تخفیف‌ها", icon: "coupons", permission: "content.write" }, { href: "/admin/shipping", label: "هزینهٔ ارسال", icon: "shipping", permission: "refunds.write" }] },
    { label: "فروشگاه", links: [{ href: "/admin/presentation", label: "نمایش فروشگاه", icon: "presentation", permission: "content.write" }, { href: "/admin/content", label: "محتوا", icon: "content", permission: "content.write" }, { href: "/admin/settings", label: "تنظیمات", icon: "settings", permission: "content.write" }] },
    { label: "مدیریت و گزارش", links: [{ href: "/admin/reports", label: "گزارش‌ها", icon: "reports", permission: "refunds.write" }, { href: "/admin/analytics", label: "آمار فعالیت", icon: "analytics", permission: "analytics.read" }, { href: "/admin/customers", label: "مشتریان و مدیران", icon: "customers", permission: "roles.write" }, { href: "/admin/audit", label: "تاریخچهٔ مدیریت", icon: "audit", permission: "roles.write" }] },
  ];
  const allowed = groups.map(group => ({ ...group, links: group.links.filter(link => link.visible !== false && (!link.permission || hasPermission(session, link.permission))) })).filter(group => group.links.length);
  const current = allowed.flatMap(group => group.links).find(link => pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href + "/")));
  const detail = current && pathname !== current.href && pathname.startsWith(current.href + "/");
  const detailLabel = pathname.endsWith("/new") ? "افزودن محصول" : current?.href === "/admin/products" ? "ویرایش محصول" : current?.href === "/admin/orders" ? "جزئیات سفارش" : "جزئیات";
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await adminAuth.signOut();
      if (result.error) { setError(authMessage(result.error)); setSigningOut(false); return; }
      setSession(null); router.replace("/admin/login");
    } catch (failure) { setError(errorMessage(failure)); setSigningOut(false); }
  };
  return <Context.Provider key={sessionScope} value={session}><div className="admin-layout">
    <header className="admin-topbar">
      <div className="admin-topbar-start">
        <button ref={navigationToggle} type="button" className="admin-menu-toggle secondary" aria-label={navigation ? "بستن منوی مدیریت" : "بازکردن منوی مدیریت"} aria-expanded={navigation} aria-controls="admin-navigation" onClick={() => setNavigation(!navigation)}><AdminIcon name="menu" /></button>
        <span className="admin-workspace-symbol" aria-hidden="true"><AdminIcon name={current?.icon ?? "overview"} /></span>
        <nav className="admin-breadcrumb" aria-label="مسیر مدیریت">
          <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}>مدیریت فروشگاه</Link>
          {pathname !== "/admin" && <><span aria-hidden="true">/</span>{detail ? <Link href={current.href}>{current.label}</Link> : <span aria-current="page">{current?.label ?? "جزئیات"}</span>}</>}
          {detail && <><span aria-hidden="true">/</span><span aria-current="page">{detailLabel}</span></>}
        </nav>
      </div>
      <div className="admin-topbar-end"><Link href="/" className="admin-open-store">بازکردن فروشگاه<AdminIcon name="external" /></Link><div className="admin-session"><span className="admin-session-avatar" aria-hidden="true">{(session.user.name || session.user.email).slice(0, 1).toUpperCase()}</span><div><bdi>{session.user.name || session.user.email}</bdi><small>{preview ? "حساب مشترک پیش‌نمایش" : roleLabels[session.role]}</small></div><span className="admin-secure"><AdminIcon name="check" />{preview ? "پیش‌نمایش آزاد" : "تأیید دومرحله‌ای"}</span></div></div>
    </header>
    <aside ref={navigationPanel} className="admin-sidebar" id="admin-navigation" data-open={navigation}>
      <Link href="/admin" className="admin-brand" aria-label="Morphiume — نمای کلی مدیریت" onClick={() => setNavigation(false)}><CspImage src="/brand/morphiume-wordmark-light.svg" alt="" width={526} height={122} /><small><span aria-hidden="true" />فضای مدیریت فروشگاه</small></Link>
      <div className="admin-mobile-nav-tools"><button type="button" className="text-button" onClick={() => { setNavigation(false); navigationToggle.current?.focus(); }}>بستن فهرست</button><a href="#main" className="text-link" onClick={() => setNavigation(false)}>رفتن به محتوای صفحه</a></div>
      <p className="admin-nav-current">بخش فعلی: <strong>{current?.label ?? "مدیریت فروشگاه"}</strong></p>
      <nav aria-label="پنل مدیریت">{allowed.map(group => <div className="admin-nav-group" key={group.label}><p>{group.label}</p>{group.links.map(link => <Link href={link.href} key={link.href} onClick={() => setNavigation(false)} aria-current={current?.href === link.href ? "page" : undefined}><AdminIcon name={link.icon} /><span>{link.label}</span></Link>)}</div>)}</nav>
      <div className="admin-sidebar-footer"><Link href="/" className="admin-store-link">{preview ? "بازگشت به فروشگاه" : "مشاهدهٔ فروشگاه"}<AdminIcon name="arrow" /></Link>{!preview && <button className="admin-signout" disabled={signingOut} onClick={() => void signOut()}><AdminIcon name="logout" />{signingOut ? "در حال خروج…" : "خروج از مدیریت"}</button>}</div>
    </aside>
    <main id="main" tabIndex={-1} className="admin-main">{preview && <Notice silent>پیش‌نمایش آزمایشی با حساب مشترک باز است. تغییرهای این پنل در داده‌های آزمایشی ذخیره و به حساب پیش‌نمایش نسبت داده می‌شوند.</Notice>}{error && <Notice error>{error}</Notice>}{children}<footer className="admin-workspace-footer"><bdi>Morphiume</bdi><span>فضای مدیریت فروشگاه</span></footer></main>
  </div></Context.Provider>;
}
