"use client";
import Link from "next/link";
import { CspImage as Image } from "./csp-image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CommerceProvider, faNumber, useCommerce } from "./commerce-client";
import { ApprovedContacts } from "./approved-contacts";
import type { PresentationDto } from "@/contracts/presentation";
import { PresentationProvider } from "./presentation-context";
import { maintenanceDefaultMessage } from "./presentation-copy";
import { StorefrontDialog } from "./storefront-dialog";
import { WishlistProvider } from "./wishlist";

function Icon({ name }: { name: "cart" | "account" | "search" | "menu" }) {
  const paths = { cart: "M3 4h2l2 12h12l2-8H6M9 20h.01M18 20h.01", account: "M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", search: "M21 21l-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16", menu: "M3 6h18M3 12h18M3 18h18" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Shell({ children, environment, presentation }: { children: ReactNode; environment: string; presentation: PresentationDto }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null), menuTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const closeNavigation = () => { setMenu(false); setSearch(false); };
    window.addEventListener("popstate", closeNavigation);
    return () => window.removeEventListener("popstate", closeNavigation);
  }, []);
  const openSearch = () => {
    setSearchQuery(pathname === "/products" ? new URLSearchParams(window.location.search).get("search") ?? "" : "");
    setMenu(false); setSearch(true);
  };
  const { cart } = useCommerce();
  const isAdmin = pathname.startsWith("/admin");
  const cartCount = cart?.items.reduce((count, item) => count + item.quantity, 0) ?? 0;
  const content = <><a className="skip-link" href="#main">رفتن به محتوای اصلی</a>{environment !== "live" && <section className="environment-banner" aria-label="وضعیت محیط فروشگاه">محیط آزمایشی <bdi>Morphiume</bdi> · پرداخت و پیامک واقعی فعال نیست.</section>}
    {!isAdmin && <header className="site-header" onKeyDown={event => { if (event.key === "Escape" && menu) { event.preventDefault(); setMenu(false); menuTrigger.current?.focus(); } }}><div className="header-inner">
      <Link href={isAdmin ? "/admin" : "/"} className="brand" aria-label="Morphiume — صفحهٔ اصلی"><Image src="/brand/morphiume-wordmark.svg" alt="Morphiume" width={526} height={122} /></Link>
      {isAdmin ? <span className="admin-header-label">مدیریت فروشگاه</span> : <nav className="desktop-nav" aria-label="ناوبری اصلی">{presentation.headerLinks.map((link, index) => <Link key={`${link.href}-${index}`} href={link.href} aria-current={pathname === link.href || link.href !== "/" && pathname.startsWith(`${link.href}/`) ? "page" : undefined}><bdi>{link.label}</bdi></Link>)}</nav>}
      <div className="header-actions">{isAdmin ? <Link href="/products" className="text-link">مشاهدهٔ فروشگاه</Link> : <><button type="button" className="icon-link" onClick={openSearch} aria-label="بازکردن جست‌وجوی عطر" aria-haspopup="dialog"><Icon name="search" /></button><Link className="icon-link account-link" href="/account" aria-label="حساب کاربری"><Icon name="account" /></Link><Link className="icon-link" href="/cart" aria-label={`سبد خرید، ${faNumber(cartCount)} کالا`}><Icon name="cart" /><span className="cart-count" aria-hidden="true">{faNumber(cartCount)}</span></Link><button className="icon-link menu-button" aria-label={menu ? "بستن فهرست" : "بازکردن فهرست"} aria-expanded={menu} aria-controls="mobile-menu" onClick={event => { menuTrigger.current = event.currentTarget; setMenu(!menu); }}><Icon name="menu" /></button></>}</div>
    </div>{!isAdmin && <div className="compact-nav"><button className="text-button" aria-expanded={menu} aria-controls="mobile-menu" onClick={event => { menuTrigger.current = event.currentTarget; setMenu(!menu); }}>فهرست <Icon name="menu" /></button><Link href="/favorites">علاقه‌مندی‌ها</Link></div>}{menu && !isAdmin && <nav id="mobile-menu" className="mobile-nav" aria-label="ناوبری موبایل"><p className="sf-mobile-nav-heading">مسیر انتخاب شما</p>{presentation.headerLinks.map((link, index) => <Link key={`${link.href}-${index}`} href={link.href} onClick={() => setMenu(false)}><bdi>{link.label}</bdi><span aria-hidden="true">←</span></Link>)}{!presentation.headerLinks.some(link => link.href === "/products") && <Link href="/products" onClick={() => setMenu(false)}>عطرها <span aria-hidden="true">←</span></Link>}{!presentation.headerLinks.some(link => link.href === "/account") && <Link href="/account" onClick={() => setMenu(false)}>حساب کاربری و پیگیری سفارش <span aria-hidden="true">←</span></Link>}</nav>}</header>}
    {!isAdmin && presentation.banner && <section className="store-banner" aria-label="اطلاعیهٔ فروشگاه"><p className="plain-copy"><bdi>{presentation.banner.text}</bdi></p>{presentation.banner.link && <Link href={presentation.banner.link.href}><bdi>{presentation.banner.link.label}</bdi></Link>}</section>}
    {!isAdmin && presentation.maintenance.enabled && <section className="maintenance-banner" aria-label="وضعیت ثبت سفارش"><h2>ثبت سفارش تازه موقتاً متوقف است.</h2><p className="plain-copy"><bdi>{presentation.maintenance.message ?? maintenanceDefaultMessage}</bdi></p><Link href="/account" className="text-link">حساب کاربری و پیگیری سفارش</Link></section>}
    {children}
    {!isAdmin && <footer className="site-footer"><div className="footer-inner"><div className="sf-footer-brand"><Link href="/" className="brand"><Image src="/brand/morphiume-wordmark.svg" alt="Morphiume" width={526} height={122} /></Link><p>انتخاب رایحه، با جزئیات روشن.</p><Link href="/guide" className="text-link">راهنمای انتخاب رایحه ←</Link></div><div className="sf-footer-column"><p className="eyebrow">انتخاب و خرید</p><nav aria-label="انتخاب و خرید"><Link href="/products">همهٔ عطرها</Link><Link href="/collections">مجموعه‌ها</Link><Link href="/favorites">علاقه‌مندی‌ها</Link><Link href="/account">حساب و پیگیری سفارش</Link></nav></div>{presentation.footerLinks.length > 0 && <div className="sf-footer-column"><p className="eyebrow">اطلاعات فروشگاه</p><nav aria-label="پیوندهای پایین صفحه">{presentation.footerLinks.map((link, index) => <Link key={`${link.href}-${index}`} href={link.href}><bdi>{link.label}</bdi></Link>)}</nav></div>}<ApprovedContacts />{presentation.footerText && <p className="muted small plain-copy sf-footer-note"><bdi>{presentation.footerText}</bdi></p>}</div></footer>}
    {!isAdmin && <StorefrontDialog open={search} onClose={() => setSearch(false)} initialFocusRef={searchInput} title="جست‌وجوی عطر" className="sf-search-dialog"><p className="muted">نام عطر، خانوادهٔ رایحه یا نت دلخواه را جست‌وجو کنید.</p><form action="/products" method="get" onSubmit={event => { if (pathname === "/products") { const query = new URLSearchParams(window.location.search); query.delete("page"); query.set("search", String(new FormData(event.currentTarget).get("search") ?? "").trim()); event.preventDefault(); window.location.assign(`/products?${query.toString()}`); setSearch(false); } }}><label htmlFor="sf-header-search">جست‌وجوی عطر</label><div className="sf-search-control"><input ref={searchInput} id="sf-header-search" name="search" type="search" maxLength={120} placeholder="نام عطر یا رایحه" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /><button type="submit">نمایش نتایج <span aria-hidden="true">←</span></button></div></form><div className="sf-search-links"><Link href="/products" onClick={() => setSearch(false)}>مشاهدهٔ همهٔ عطرها</Link><Link href="/guide" onClick={() => setSearch(false)}>کمک به انتخاب رایحه</Link></div></StorefrontDialog>}
  </>;
  return isAdmin ? content : <WishlistProvider><div className="storefront-root" onClickCapture={event => { if (event.target instanceof Element && event.target.closest("a[href]")) setMenu(false); }}>{content}</div></WishlistProvider>;
}
export function SiteShell({ children, environment, presentation }: { children: ReactNode; environment: string; presentation: PresentationDto }) { return <PresentationProvider value={presentation}><CommerceProvider><Shell environment={environment} presentation={presentation}>{children}</Shell></CommerceProvider></PresentationProvider>; }
