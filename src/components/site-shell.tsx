"use client";
import Link from "next/link";
import { CspImage as Image } from "./csp-image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CommerceProvider, faNumber, useCommerce } from "./commerce-client";
import { ApprovedContacts } from "./approved-contacts";

function Icon({ name }: { name: "cart" | "account" | "search" | "menu" }) {
  const paths = { cart: "M3 4h2l2 12h12l2-8H6M9 20h.01M18 20h.01", account: "M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", search: "M21 21l-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16", menu: "M3 6h18M3 12h18M3 18h18" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Shell({ children, environment }: { children: ReactNode; environment: string }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { cart } = useCommerce();
  const isAdmin = pathname.startsWith("/admin");
  const cartCount = cart?.items.reduce((count, item) => count + item.quantity, 0) ?? 0;
  return <><a className="skip-link" href="#main">رفتن به محتوای اصلی</a>{environment !== "live" && <section className="environment-banner" aria-label="وضعیت محیط فروشگاه">محیط آزمایشی <bdi>Morphiume</bdi> · پرداخت و پیامک واقعی فعال نیست.</section>}
    <header className="site-header"><div className="header-inner">
      <Link href={isAdmin ? "/admin" : "/"} className="brand" aria-label="Morphiume — صفحهٔ اصلی"><Image src="/brand/morphiume-wordmark.svg" alt="Morphiume" width={526} height={122} /></Link>
      {isAdmin ? <span className="admin-header-label">مدیریت فروشگاه</span> : <nav className="desktop-nav" aria-label="ناوبری اصلی"><Link href="/products">عطرها</Link><Link href="/guide">راهنمای رایحه</Link><Link href="/pages/about">دربارهٔ برند</Link></nav>}
      <div className="header-actions">{isAdmin ? <Link href="/products" className="text-link">مشاهدهٔ فروشگاه</Link> : <><Link className="icon-link" href="/products?search=" aria-label="جست‌وجو"><Icon name="search" /></Link><Link className="icon-link account-link" href="/account" aria-label="حساب کاربری"><Icon name="account" /></Link><Link className="icon-link" href="/cart" aria-label={`سبد خرید، ${faNumber(cartCount)} کالا`}><Icon name="cart" /><span className="cart-count" aria-hidden="true">{faNumber(cartCount)}</span></Link><button className="icon-link menu-button" aria-label={menu ? "بستن فهرست" : "بازکردن فهرست"} aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu(!menu)}><Icon name="menu" /></button></>}</div>
    </div>{!isAdmin && <div className="compact-nav"><button className="text-button" aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu(!menu)}>فهرست <Icon name="menu" /></button><Link href="/favorites">علاقه‌مندی‌ها</Link></div>}{menu && !isAdmin && <nav id="mobile-menu" className="mobile-nav" aria-label="ناوبری موبایل"><Link href="/products" onClick={() => setMenu(false)}>عطرها</Link><Link href="/guide" onClick={() => setMenu(false)}>راهنمای انتخاب رایحه</Link><Link href="/account" onClick={() => setMenu(false)}>حساب کاربری</Link><Link href="/pages/about" onClick={() => setMenu(false)}>دربارهٔ برند</Link></nav>}</header>
    {children}
    {!isAdmin && <footer className="site-footer"><div className="footer-inner"><Link href="/" className="brand"><Image src="/brand/morphiume-wordmark.svg" alt="Morphiume" width={526} height={122} /></Link><nav aria-label="پشتیبانی"><Link href="/pages/shipping">ارسال</Link><Link href="/pages/returns">مرجوعی</Link><Link href="/account">پیگیری سفارش</Link><Link href="/pages/contact">تماس</Link><Link href="/pages/faq">پرسش‌های متداول</Link></nav><nav aria-label="قوانین"><Link href="/pages/privacy">حریم خصوصی</Link><Link href="/pages/terms">شرایط استفاده</Link></nav><ApprovedContacts /><p className="muted small">اطلاعات محصول و شرایط خدمات از محتوای تأییدشدهٔ فروشگاه نمایش داده می‌شوند.</p></div></footer>}
  </>;
}
export function SiteShell({ children, environment }: { children: ReactNode; environment: string }) { return <CommerceProvider><Shell environment={environment}>{children}</Shell></CommerceProvider>; }
