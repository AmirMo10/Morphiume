import Link from "next/link";
import { CspImage as Image } from "./csp-image";
import type { PresentationDto } from "@/contracts/presentation";
import type { ProductDto } from "@/contracts/commerce";
import { Catalog, ProductTile } from "./catalog";
import { Empty } from "./commerce-client";

export function HomePresentation({ presentation, products }: { presentation: PresentationDto; products: ProductDto[] }) {
  const action = presentation.heroAction ?? (!presentation.configured ? { href: "/products", label: "مشاهدهٔ عطرها" } : null);
  return <main id="main"><section className="hero container"><div className="hero-copy"><p className="eyebrow"><bdi>Morphiume</bdi> / مجموعهٔ عطرها</p><h1 className="plain-copy"><bdi>{presentation.heroTitle ?? "رایحه‌ای که\nانتخاب شماست."}</bdi></h1><p className="plain-copy" dir="auto">{presentation.heroDescription ?? "عطرها را با اطلاعات رایحه، حجم و قیمت بررسی کنید و انتخاب خود را بسازید."}</p>{action && <Link href={action.href} className="button"><bdi>{action.label}</bdi><span aria-hidden="true">←</span></Link>}</div><div className="hero-art" aria-hidden="true"><div className="hero-ring" /><Image src="/brand/morphiume-mark.svg" alt="" width={128} height={128} /><span>Morphiume</span></div></section>
    <section className="container section"><div className="section-heading"><div><p className="eyebrow">کاتالوگ</p><h2>عطرهای <bdi>Morphiume</bdi></h2></div><Link href="/products" className="text-link">همهٔ عطرها ←</Link></div>{presentation.configured ? products.length ? <div className="product-grid">{products.map(product => <ProductTile key={product.id} product={product} />)}</div> : <Empty title="در این بخش محصولی برای نمایش نیست."><Link href="/products" className="text-link">مشاهدهٔ کاتالوگ عطرها</Link></Empty> : <Catalog featured initialProducts={products} />}</section>
    {presentation.services.some(service => service.enabled) && <section className="container section" aria-labelledby="store-services-heading"><h2 id="store-services-heading">خدمات فروشگاه</h2><div className="store-services">{presentation.services.filter(service => service.enabled).map((service, index) => <article key={index}><h3><bdi>{service.title}</bdi></h3><p className="plain-copy" dir="auto">{service.description}</p>{service.link && <Link href={service.link.href} className="text-link"><bdi>{service.link.label}</bdi></Link>}</article>)}</div></section>}
    <section className="guide-invitation container"><div><p className="eyebrow">برای انتخاب دقیق‌تر</p><h2>از خانوادهٔ رایحه شروع کنید.</h2><p>راهنما بر اساس ویژگی‌های ثبت‌شدهٔ محصولات، انتخاب‌های نزدیک به سلیقهٔ شما را نشان می‌دهد.</p></div><Link className="button secondary" href="/guide">راهنمای انتخاب رایحه</Link></section></main>;
}
