"use client";
import Link from "next/link";
import { CspImage as Image } from "./csp-image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { catalogInput, catalogPriceRange, pageHref, pageQuery, type PriceRangeFields } from "./catalog-query";
import { Pagination } from "./pagination";
import { usePagedData } from "./use-paged-data";
import { ProductGallery } from "./product-gallery";
import { ProductContentDetails, ProductIntro } from "./product-content-view";
import { productImages } from "./product-images";
import { FavoriteButton } from "./wishlist";
import { useCustomerSession } from "./customer-session";
import type { CatalogPageDto, ProductDto } from "@/contracts/commerce";
import { api, Empty, errorMessage, faNumber, Loading, money, Notice, useCommerce } from "./commerce-client";

export function ProductImage({ product, eager = false, variantSku }: { product: ProductDto; eager?: boolean; variantSku?: string }) {
  const images = productImages(product);
  const image = variantSku ? images.find(entry => entry.variantSku === variantSku) ?? images.find(entry => !entry.variantSku) : images.find(entry => !entry.variantSku) ?? images[0];
  return <div className="product-image">{image ? <Image src={image.url} alt={image.alt} width={640} height={800} loading={eager ? "eager" : "lazy"} /> : <div className="image-unavailable"><Image src="/brand/morphiume-mark.svg" alt="" width={72} height={96} /><span>{variantSku && images.length ? "تصویر این حجم هنوز ثبت نشده است." : "تصویر محصول هنوز ثبت نشده است."}</span></div>}</div>;
}
export function ProductTile({ product, volumeMl, inStock = false, sort = "name", minPriceToman, maxPriceToman }: { product: ProductDto; volumeMl?: number; inStock?: boolean; sort?: string; minPriceToman?: string; maxPriceToman?: string }) {
  const range = catalogPriceRange({ minPriceToman, maxPriceToman });
  const matching = product.variants.filter(variant => range.valid && (!volumeMl || variant.volumeMl === volumeMl) && (!inStock || variant.available > 0) && (range.minimum === undefined || BigInt(variant.price.amountIrr) >= range.minimum) && (range.maximum === undefined || BigInt(variant.price.amountIrr) <= range.maximum));
  if (!range.valid || ((volumeMl || inStock || minPriceToman !== undefined || maxPriceToman !== undefined) && !matching.length)) return null;
  const available = sort === "price_asc" || sort === "price_desc" ? matching.reduce<ProductDto["variants"][number] | undefined>((lowest, variant) => !lowest || BigInt(variant.price.amountIrr) < BigInt(lowest.price.amountIrr) ? variant : lowest, undefined) : matching.find(variant => variant.available > 0) ?? matching[0];
  return <article className="product-tile"><Link href={`/products/${product.slug}`} aria-label={`مشاهدهٔ ${product.name}`}><ProductImage product={product} variantSku={available?.sku} /></Link><div className="tile-meta"><div><p className="eyebrow"><bdi>{product.family || product.concentration}</bdi></p><h3><Link href={`/products/${product.slug}`}><bdi>{product.name}</bdi></Link></h3></div>{available && <div><p>{faNumber(available.volumeMl)} میلی‌لیتر</p><p className="price">{money(available.price)}</p></div>}</div>{!matching.some(variant => variant.available > 0) && <p className="muted small">حجم‌های مطابق این انتخاب فعلاً ناموجودند.</p>}</article>;
}
export function Catalog({ featured = false, initialProducts, initialPage, initialError, initialQuery }: { featured?: boolean; initialProducts?: ProductDto[]; initialPage?: CatalogPageDto; initialError?: string; initialQuery?: string }) {
  if (featured) return <FeaturedProducts initialProducts={initialProducts} />;
  return <PagedCatalog initialPage={initialPage} initialError={initialError} initialQuery={initialQuery} />;
}
function FeaturedProducts({ initialProducts }: { initialProducts?: ProductDto[] }) {
  const [products, setProducts] = useState<ProductDto[] | null>(initialProducts ?? null);
  const [error, setError] = useState("");
  const load = () => api<CatalogPageDto>("/api/catalog/page?page=1&pageSize=4&sort=name").then(result => { setProducts(result.items); setError(""); }).catch(e => setError(errorMessage(e)));
  useEffect(() => { if (!initialProducts) load(); }, [initialProducts]);
  if (error) return <Notice error>{error} <button className="text-button" onClick={load}>تلاش دوباره</button></Notice>;
  if (!products) return <Loading />;
  return products.length ? <div className="product-grid">{products.slice(0, 4).map(product => <ProductTile key={product.id} product={product} />)}</div> : <Empty title="کاتالوگ در حال آماده‌سازی است."><p>پس از انتشار محصولات، اطلاعات و قیمت آن‌ها در این بخش نمایش داده می‌شود.</p></Empty>;
}
function PagedCatalog({ initialPage, initialError, initialQuery }: { initialPage?: CatalogPageDto; initialError?: string; initialQuery?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const input = catalogInput(params);
  const range = catalogPriceRange(input);
  const query = pageQuery(input);
  const serverCurrent = initialQuery === undefined || initialQuery === query;
  const serverPage = serverCurrent ? initialPage : undefined;
  const serverError = serverCurrent ? initialError : undefined;
  const remote = usePagedData<CatalogPageDto>("/api/catalog/page", query, !serverPage && !serverError);
  const data = serverPage ?? remote.data;
  const [draftErrors, setDraftErrors] = useState<{ query: string; fields: PriceRangeFields } | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const id = useId();
  const rangeErrors = draftErrors?.query === query && Object.keys(draftErrors.fields).length ? draftErrors.fields : range.fields;
  const queryError = serverError || (!serverPage ? remote.error : "");
  const update = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.delete("page"); if (key === "volume") next.delete("volumeMl"); if (key === "stock") next.delete("available"); if (value) next.set(key, value); else next.delete(key); setDraftErrors(null); router.replace(`/products${next.size ? "?" + next.toString() : ""}`, { scroll: false }); };
  const apply = (form: HTMLFormElement) => {
    const values = new FormData(form);
    const minPriceToman = String(values.get("minPriceToman") ?? ""), maxPriceToman = String(values.get("maxPriceToman") ?? "");
    const checked = catalogPriceRange({ minPriceToman, maxPriceToman });
    setDraftErrors({ query, fields: checked.fields });
    if (!checked.valid) { requestAnimationFrame(() => summary.current?.focus()); return; }
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    for (const [key, value] of Object.entries({ search: String(values.get("search") ?? ""), minPriceToman, maxPriceToman })) { if (value.trim()) next.set(key, value); else next.delete(key); }
    router.replace(`/products${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  };
  const { families = [], concentrations = [], volumesMl = [] } = data?.facets ?? {};
  const filtered = !!(input.search || input.family || input.concentration || input.note || input.volumeMl || input.available || input.minPriceToman || input.maxPriceToman);
  return <>
    <form className="catalog-filter" onSubmit={event => { event.preventDefault(); apply(event.currentTarget); }} noValidate>
      <label className="search-field">جست‌وجوی عطر<input name="search" type="search" key={input.search} defaultValue={input.search} placeholder="نام یا خانوادهٔ رایحه" /></label>
      <button className="secondary" type="submit">جست‌وجو</button>
      {(families.length > 0 || input.family) && <label>خانوادهٔ رایحه<select value={input.family} onChange={event => update("family", event.target.value)}><option value="">همه</option>{input.family && !families.includes(input.family) && <option>{input.family}</option>}{families.map(family => <option key={family}>{family}</option>)}</select></label>}
      {(volumesMl.length > 0 || input.volumeMl) && <label>حجم<select value={input.volumeMl ?? ""} onChange={event => update("volume", event.target.value)}><option value="">همه</option>{input.volumeMl && !volumesMl.includes(input.volumeMl) && <option value={input.volumeMl}>{faNumber(input.volumeMl)} میلی‌لیتر</option>}{volumesMl.map(volume => <option key={volume} value={volume}>{faNumber(volume)} میلی‌لیتر</option>)}</select></label>}
      {(concentrations.length > 1 || input.concentration) && <label>غلظت<select value={input.concentration} onChange={event => update("concentration", event.target.value)}><option value="">همه</option>{input.concentration && !concentrations.includes(input.concentration) && <option>{input.concentration}</option>}{concentrations.map(concentration => <option key={concentration}>{concentration}</option>)}</select></label>}
      <label>مرتب‌سازی<select value={input.sort} onChange={event => update("sort", event.target.value)}><option value="name">نام محصول</option><option value="price_asc">کمترین قیمت</option><option value="price_desc">بیشترین قیمت</option></select></label>
      <label className="checkbox-row"><input type="checkbox" checked={!!input.available} onChange={event => update("stock", event.target.checked ? "1" : "")} />فقط موجودها</label>
      <fieldset className="catalog-price-range"><legend>بازهٔ قیمت (تومان)</legend><div className="catalog-price-fields">
        {([{ key: "minPriceToman", label: "حداقل قیمت (تومان)" }, { key: "maxPriceToman", label: "حداکثر قیمت (تومان)" }] as const).map(({ key, label }) => <div key={key}><label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} name={key} key={input[key] ?? ""} defaultValue={input[key] ?? ""} inputMode="numeric" dir="ltr" aria-invalid={!!rangeErrors[key]} aria-describedby={`${id}-price-help${rangeErrors[key] ? ` ${id}-${key}-error` : ""}`} onChange={() => setDraftErrors(null)} />{rangeErrors[key] && <p className="field-error" id={`${id}-${key}-error`}>{rangeErrors[key]}</p>}</div>)}
      </div><p className="helper" id={`${id}-price-help`}>هر حد را می‌توانید خالی بگذارید. برای اعمال قیمت‌ها، دکمهٔ جست‌وجو را بزنید.</p></fieldset>
    </form>
    {Object.keys(rangeErrors).length > 0 && <div ref={summary} className="notice error" role="alert" tabIndex={-1}><p>بازهٔ قیمت را بررسی کنید؛ مقدارهای واردشده حفظ شده‌اند.</p><ul>{Object.entries(rangeErrors).map(([key, message]) => <li key={key}><a href={`#${id}-${key}`}>{message}</a></li>)}</ul></div>}
    {data?.facetsTruncated && <p className="helper">همهٔ گزینه‌های فیلتر نمایش داده نمی‌شوند. برای یافتن عطر یا رایحهٔ دلخواه، از جست‌وجوی عطرها استفاده کنید.</p>}
    {queryError ? <Notice error>{queryError} {!serverError && <button className="text-button" onClick={remote.reload}>تلاش دوباره</button>} <Link href="/products" className="text-link">پاک‌کردن فیلترها</Link></Notice> : !range.valid ? null : !data ? <Loading label="در حال دریافت عطرها…" /> : <>
      <div className="result-bar"><p role="status" aria-live="polite">{faNumber(data.totalItems)} محصول</p>{input.note && <p>نت: <bdi>{input.note}</bdi> <button type="button" className="text-button" onClick={() => update("note", "")}>پاک‌کردن انتخاب نت</button></p>}{filtered && <Link href="/products" className="text-link">پاک‌کردن فیلترها</Link>}</div>
      {data.items.length ? <div className="product-grid">{data.items.map(product => <ProductTile key={product.id} product={product} volumeMl={input.volumeMl} inStock={input.available} sort={input.sort} minPriceToman={input.minPriceToman} maxPriceToman={input.maxPriceToman} />)}</div> : <Empty title={filtered ? "محصولی با این انتخاب پیدا نشد." : data.page > 1 ? "این صفحه محصولی ندارد." : "کاتالوگ در حال آماده‌سازی است."}><p>{filtered ? "جست‌وجو یا فیلترها را تغییر دهید." : data.page > 1 ? "به صفحهٔ اول نتایج برگردید." : "پس از انتشار محصولات، اطلاعات و قیمت آن‌ها در این بخش نمایش داده می‌شود."}</p>{(filtered || data.page > 1) && <Link href={filtered ? "/products" : pageHref("/products", params.toString(), 1)} className="button secondary">دیدن همهٔ عطرها</Link>}</Empty>}
      <Pagination data={data} href={page => pageHref("/products", params.toString(), page)} />
    </>}
  </>;
}
export function ProductView({ id, initialProduct }: { id: string; initialProduct?: ProductDto }) {
  const [loadedProduct, setProduct] = useState<ProductDto | null>(initialProduct ?? null);
  // A refreshed server DTO is authoritative; do not retain an older same-product content snapshot.
  const product = initialProduct ?? loadedProduct;
  const [selected, setSelected] = useState(initialProduct?.variants.find(v => v.available > 0)?.id ?? initialProduct?.variants[0]?.id ?? "");
  const [error, setError] = useState("");
  const identity = useCustomerSession();
  const [addition, setAddition] = useState({ scopeKey: "", busy: false, added: false, error: "", refreshFailed: false });
  const operation = useRef<{ scopeKey: string; controller: AbortController } | null>(null);
  const { refreshCart, announce, ready } = useCommerce();
  const feedback = !identity.pending && addition.scopeKey === identity.scopeKey ? addition : null;
  const busy = addition.scopeKey === identity.scopeKey && addition.busy;
  useEffect(() => () => { const active = operation.current; if (active?.scopeKey === identity.scopeKey) { active.controller.abort(); operation.current = null; } }, [identity.scopeKey]);
  const load = useCallback(() => { api<ProductDto>(`/api/products/${encodeURIComponent(id)}`).then(p => { setError(""); setProduct(p); setSelected(current => p.variants.some(v => v.id === current) ? current : p.variants.find(v => v.available > 0)?.id ?? p.variants[0]?.id ?? ""); }).catch(e => setError(errorMessage(e))); }, [id]);
  useEffect(() => { if (!initialProduct) load(); }, [load, initialProduct]);
  const variant = product?.variants.find(v => v.id === selected);
  const add = async () => {
    if (!variant || !ready || identity.pending || operation.current?.scopeKey === identity.scopeKey) return;
    const active = { scopeKey: identity.scopeKey, controller: new AbortController() };
    operation.current = active;
    const current = () => operation.current === active && !active.controller.signal.aborted;
    setAddition({ scopeKey: active.scopeKey, busy: true, added: false, error: "", refreshFailed: false });
    try {
      await api("/api/cart", { method: "POST", signal: active.controller.signal, body: JSON.stringify({ variantId: variant.id, quantity: 1 }) });
      if (!current()) return;
      // A successful additive mutation is known even if its follow-up read is interrupted.
      setAddition({ scopeKey: active.scopeKey, busy: true, added: true, error: "", refreshFailed: false });
      announce("محصول به سبد خرید افزوده شد.");
      await refreshCart().catch(() => { if (current()) setAddition(previous => previous.scopeKey === active.scopeKey ? { ...previous, refreshFailed: true } : previous); });
    } catch (failure) {
      if (current()) setAddition({ scopeKey: active.scopeKey, busy: true, added: false, error: errorMessage(failure), refreshFailed: false });
    } finally {
      if (current()) { operation.current = null; setAddition(previous => previous.scopeKey === active.scopeKey ? { ...previous, busy: false } : previous); }
    }
  };
  if (!product) return error ? <Notice error>{error} <button className="text-button" onClick={load}>تلاش دوباره</button></Notice> : <Loading />;
  return <><div className="product-detail"><ProductGallery product={product} variantSku={variant?.sku} eager /><div className="purchase-panel"><p className="eyebrow"><bdi>{product.family}</bdi></p><h1><bdi>{product.name}</bdi></h1>{product.concentration && <p className="muted"><bdi>{product.concentration}</bdi></p>}<ProductIntro content={product} /><fieldset className="volume-picker"><legend>انتخاب حجم</legend><div className="volume-options">{product.variants.map(v => <label className={selected === v.id ? "volume-option selected" : "volume-option"} key={v.id}><input type="radio" name="volume" value={v.id} checked={selected === v.id} onChange={() => { setSelected(v.id); setAddition(previous => ({ ...previous, added: false, refreshFailed: false })); }} /><span>{faNumber(v.volumeMl)} میلی‌لیتر</span><small>{v.available > 0 ? "موجود" : "ناموجود"}</small></label>)}</div></fieldset>{variant && <><p className="product-price">{money(variant.price)}</p><p className={variant.available > 0 ? "stock-message" : "stock-message unavailable"}>{variant.available > 0 ? "این حجم موجود است." : "این حجم فعلاً موجود نیست."}</p></>}{error && <Notice error>{error}</Notice>}{feedback?.error && <Notice error>{feedback.error}</Notice>}<button className="full-width" disabled={busy || !ready || !variant || variant.available <= 0} onClick={add}>{busy ? "در حال افزودن…" : "افزودن به سبد خرید"}</button>{feedback?.added && <Notice silent>محصول به سبد خرید افزوده شد. <Link href="/cart" className="text-link">مشاهدهٔ سبد خرید</Link>{feedback.refreshFailed && <p>کالا به سبد افزوده شد؛ سبد تازه دریافت نشد. سبد خرید را بررسی کنید.</p>}</Notice>}<FavoriteButton productId={product.id} /><div className="purchase-policies"><Link href="/pages/shipping">شرایط ارسال</Link><Link href="/pages/returns">شرایط مرجوعی</Link></div></div></div><ProductContentDetails content={product} />{[product.topNotes, product.heartNotes, product.baseNotes].some(notes => notes.length) && <section className="notes-section"><h2>لایه‌های رایحه</h2><div className="notes-grid">{([{ label: "نت‌های آغازین", values: product.topNotes }, { label: "نت‌های میانی", values: product.heartNotes }, { label: "نت‌های پایه", values: product.baseNotes }]).filter(n => n.values.length).map(n => <div key={n.label}><h3>{n.label}</h3><p>{n.values.map((note, index) => <span key={index}>{index > 0 ? "، " : ""}<bdi>{note}</bdi></span>)}</p></div>)}</div></section>}</>;
}
