import Link from "next/link";
import { CspImage as Image } from "@/components/csp-image";
import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
import { getCommerce } from "@/server/runtime";

export default async function HomePage() {
  const products = await getCommerce().listProducts();
  return <main id="main"><section className="hero container"><div className="hero-copy"><p className="eyebrow"><bdi>Morphiume</bdi> / مجموعهٔ عطرها</p><h1>رایحه‌ای که<br />انتخاب شماست.</h1><p>عطرها را با اطلاعات رایحه، حجم و قیمت بررسی کنید و انتخاب خود را بسازید.</p><Link href="/products" className="button">مشاهدهٔ عطرها <span aria-hidden="true">←</span></Link></div><div className="hero-art" aria-hidden="true"><div className="hero-ring" /><Image src="/brand/morphiume-mark.svg" alt="" width={128} height={128} /><span>Morphiume</span></div></section><section className="container section"><div className="section-heading"><div><p className="eyebrow">کاتالوگ</p><h2>عطرهای <bdi>Morphiume</bdi></h2></div><Link href="/products" className="text-link">همهٔ عطرها ←</Link></div><Suspense fallback={<p>در حال دریافت عطرها…</p>}><Catalog featured initialProducts={products} /></Suspense></section><section className="guide-invitation container"><div><p className="eyebrow">برای انتخاب دقیق‌تر</p><h2>از خانوادهٔ رایحه شروع کنید.</h2><p>راهنما بر اساس ویژگی‌های ثبت‌شدهٔ محصولات، انتخاب‌های نزدیک به سلیقهٔ شما را نشان می‌دهد.</p></div><Link className="button secondary" href="/guide">راهنمای انتخاب رایحه</Link></section></main>;
}
