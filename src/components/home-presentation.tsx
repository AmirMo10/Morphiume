import Link from "next/link";
import { CspImage as Image } from "./csp-image";
import type { PresentationDto } from "@/contracts/presentation";
import type { ProductDto } from "@/contracts/commerce";
import { Catalog, ProductTile } from "./catalog";
import { Empty } from "./commerce-client";
import { faNumber } from "./number-format";

export function HomePresentation({ presentation, products, families = [], environment = "live" }: { presentation: PresentationDto; products: ProductDto[]; families?: string[]; environment?: string }) {
  const action = presentation.heroAction ?? (!presentation.configured ? { href: "/products", label: "مشاهدهٔ عطرها" } : null);
  return <main id="main" className="sf-home">
    <div className="container sf-cover">
      <section className="hero sf-hero">
        <div className="hero-copy">
          <p className="eyebrow"><bdi>Morphiume</bdi><span aria-hidden="true"> / </span>عطر و رایحه</p>
          <h1 className="plain-copy"><bdi>{presentation.heroTitle ?? "رایحه،\nبه انتخاب شما."}</bdi></h1>
          <p className="plain-copy" dir="auto">{presentation.heroDescription ?? "از خانوادهٔ رایحه تا نت‌ها و حجم؛ جزئیات هر عطر را بشناسید و انتخاب خود را پیدا کنید."}</p>
          <div className="sf-hero-actions">
            {action && <Link href={action.href} className="button"><bdi>{action.label}</bdi><span aria-hidden="true">←</span></Link>}
            <Link href="/guide" className="text-link">راهنمای انتخاب رایحه</Link>
          </div>
        </div>
        <figure className="sf-hero-visual">
          {environment !== "live" ? <>
            <div className="sf-hero-image"><Image src="/brand/editorial/editorial-concept.webp" alt="ترکیب مفهومی شیشه و گیاه در نور؛ تصویر محصول نیست" width={1536} height={1024} loading="eager" /></div>
            <figcaption>تصویر مفهومی؛ تصویر واقعی محصول نیست</figcaption>
          </> : <div className="sf-brand-composition" aria-hidden="true"><Image src="/brand/morphiume-mark.svg" alt="" width={128} height={128} /><span><bdi>Morphiume</bdi></span></div>}
        </figure>
      </section>
      <nav className="sf-discovery-row" aria-label="مسیرهای انتخاب عطر">
        <Link href={families.length ? "#sf-families-title" : "/products"}><span><small>از سلیقهٔ خود شروع کنید</small><strong>خانوادهٔ رایحه</strong></span><span aria-hidden="true">↙</span></Link>
        <Link href="/guide"><span><small>جزئیات را کنار هم ببینید</small><strong>نت‌ها</strong></span><span aria-hidden="true">↙</span></Link>
        <Link href="/products"><span><small>حجم و قیمت را بررسی کنید</small><strong>انتخاب حجم</strong></span><span aria-hidden="true">↙</span></Link>
      </nav>
    </div>
    <section className="container section sf-featured"><div className="section-heading"><div><p className="eyebrow">کاتالوگ عطر</p><h2>عطرهای <bdi>Morphiume</bdi></h2></div><Link href="/products" className="text-link">مشاهدهٔ همهٔ عطرها <span aria-hidden="true">←</span></Link></div>{presentation.configured ? products.length ? <div className="product-grid">{products.map(product => <ProductTile key={product.id} product={product} />)}</div> : <Empty title="در این بخش محصولی برای نمایش نیست."><Link href="/products" className="text-link">مشاهدهٔ کاتالوگ عطرها</Link></Empty> : <Catalog featured initialProducts={products} />}</section>
    {families.length > 0 && <section className="container section sf-family-section" aria-labelledby="sf-families-title"><div className="section-heading"><div><p className="eyebrow">مسیرهای کشف رایحه</p><h2 id="sf-families-title">از یک خانواده شروع کنید.</h2></div><p className="muted">خانواده‌های ثبت‌شده در کاتالوگ</p></div><div className="sf-family-grid">{families.slice(0, 8).map((family, index) => <Link key={family} href={`/products?${new URLSearchParams({ family }).toString()}`} className="sf-family-link"><span className="sf-family-index" aria-hidden="true">{faNumber(index + 1)}</span><h3><bdi>{family}</bdi></h3><span className="small">کشف عطرهای این خانواده <span aria-hidden="true">←</span></span></Link>)}</div></section>}
    <section className="sf-guide-section"><div className="container sf-guide-inner"><div className="sf-guide-intro"><p className="eyebrow">راهنمای رایحه</p><h2>انتخاب رایحه،<br />قدم‌به‌قدم.</h2><Link className="button secondary" href="/guide">راهنمای انتخاب رایحه <span aria-hidden="true">←</span></Link></div><div className="sf-guide-detail"><p>خانواده، نت دلخواه و حجم را انتخاب کنید. راهنما عطرهای نزدیک را با دلیل انتخاب و اطلاعات موجودی نشان می‌دهد.</p><ol><li><span>خانوادهٔ رایحه</span><p>از خانواده‌های ثبت‌شده در کاتالوگ شروع کنید.</p></li><li><span>نت دلخواه</span><p>جزئیات رایحه را در اطلاعات هر عطر ببینید.</p></li><li><span>حجم و موجودی</span><p>حجم، قیمت و موجودی همان انتخاب را کنار هم بررسی کنید.</p></li></ol></div></div></section>
    {presentation.services.some(service => service.enabled) && <section className="container section sf-services" aria-labelledby="store-services-heading"><div className="section-heading"><div><p className="eyebrow">اطلاعات خرید</p><h2 id="store-services-heading">خدمات فروشگاه</h2></div></div><div className="store-services">{presentation.services.filter(service => service.enabled).map((service, index) => <article key={index}><span className="sf-service-index" aria-hidden="true">{faNumber(index + 1)}</span><h3><bdi>{service.title}</bdi></h3><p className="plain-copy" dir="auto">{service.description}</p>{service.link && <Link href={service.link.href} className="text-link"><bdi>{service.link.label}</bdi></Link>}</article>)}</div></section>}
  </main>;
}
