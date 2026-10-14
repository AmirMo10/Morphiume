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
import { captureAnalytics, createAnalyticsEventId } from "./analytics-client";
import type { CatalogPageDto, ProductDto } from "@/contracts/commerce";
import { api, Empty, errorMessage, faNumber, Loading, money, Notice, useCommerce } from "./commerce-client";
import { StorefrontDialog } from "./storefront-dialog";

export function ProductImage({ product, eager = false, variantSku }: { product: ProductDto; eager?: boolean; variantSku?: string }) {
  const images = productImages(product);
  const image = variantSku ? images.find(entry => entry.variantSku === variantSku) ?? images.find(entry => !entry.variantSku) : images.find(entry => !entry.variantSku) ?? images[0];
  return <div className="product-image">{image ? <Image src={image.url} alt={image.alt} width={640} height={800} loading={eager ? "eager" : "lazy"} /> : <div className="image-unavailable"><Image src="/brand/morphiume-mark.svg" alt="" width={72} height={96} /><span>{variantSku && images.length ? "تصویر این حجم هنوز ثبت نشده است." : "تصویر محصول هنوز ثبت نشده است."}</span></div>}</div>;
}
export function ProductTile({ product, volumeMl, inStock = false, sort = "name", minPriceToman, maxPriceToman, showFavorite = true }: { product: ProductDto; volumeMl?: number; inStock?: boolean; sort?: string; minPriceToman?: string; maxPriceToman?: string; showFavorite?: boolean }) {
  const range = catalogPriceRange({ minPriceToman, maxPriceToman });
  const matching = product.variants.filter(variant => range.valid && (!volumeMl || variant.volumeMl === volumeMl) && (!inStock || variant.available > 0) && (range.minimum === undefined || BigInt(variant.price.amountIrr) >= range.minimum) && (range.maximum === undefined || BigInt(variant.price.amountIrr) <= range.maximum));
  if (!range.valid || ((volumeMl || inStock || minPriceToman !== undefined || maxPriceToman !== undefined) && !matching.length)) return null;
  const available = sort === "price_asc" || sort === "price_desc" ? matching.reduce<ProductDto["variants"][number] | undefined>((lowest, variant) => !lowest || BigInt(variant.price.amountIrr) < BigInt(lowest.price.amountIrr) ? variant : lowest, undefined) : matching.find(variant => variant.available > 0) ?? matching[0];
  return <article className="product-tile"><div className="sf-tile-media"><Link href={`/products/${product.slug}`} aria-label={`مشاهدهٔ ${product.name}`}><ProductImage product={product} variantSku={available?.sku} /></Link><span className={`sf-availability ${matching.some(variant => variant.available > 0) ? "" : "unavailable"}`}>{matching.some(variant => variant.available > 0) ? "موجود" : "ناموجود"}</span></div><div className="tile-meta"><div><p className="eyebrow"><bdi>{product.family || product.concentration}</bdi></p><h3><Link href={`/products/${product.slug}`}><bdi>{product.name}</bdi></Link></h3>{product.family && product.concentration && <p className="sf-tile-concentration"><bdi>{product.concentration}</bdi></p>}</div>{available && <div className="sf-tile-price"><p>{faNumber(available.volumeMl)} میلی‌لیتر</p><p className="price">{money(available.price)}</p></div>}</div>{!matching.some(variant => variant.available > 0) && <p className="muted small">حجم‌های مطابق این انتخاب فعلاً ناموجودند.</p>}<div className="sf-tile-actions"><Link href={`/products/${product.slug}`} className="sf-product-link">مشاهدهٔ عطر <span aria-hidden="true">←</span></Link>{showFavorite && <div className="sf-tile-favorite"><FavoriteButton productId={product.id} /></div>}</div></article>;
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
  const [searchIntent, setSearchIntent] = useState<{ query: string; hasQuery: boolean; eventId: string | null } | null>(null);
  const observedSearch = useRef<typeof searchIntent>(null);
  const summary = useRef<HTMLDivElement>(null);
  const id = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rangeErrors = draftErrors?.query === query && Object.keys(draftErrors.fields).length ? draftErrors.fields : range.fields;
  const queryError = serverError || (!serverPage ? remote.error : "");
  const update = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.delete("page"); if (key === "volume") next.delete("volumeMl"); if (key === "stock") next.delete("available"); if (value) next.set(key, value); else next.delete(key); setDraftErrors(null); router.replace(`/products${next.size ? "?" + next.toString() : ""}`, { scroll: false }); };
  const apply = (form: HTMLFormElement) => {
    const values = new FormData(form);
    const minPriceToman = String(values.get("minPriceToman") ?? ""), maxPriceToman = String(values.get("maxPriceToman") ?? "");
    const checked = catalogPriceRange({ minPriceToman, maxPriceToman });
    setDraftErrors({ query, fields: checked.fields });
    if (!checked.valid) { requestAnimationFrame(() => summary.current?.focus()); return; }
    setFiltersOpen(false);
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    for (const [key, value] of Object.entries({ search: String(values.get("search") ?? ""), minPriceToman, maxPriceToman })) { if (value.trim()) next.set(key, value); else next.delete(key); }
    setSearchIntent({ query: pageQuery(catalogInput(next)), hasQuery: !!String(values.get("search") ?? "").trim(), eventId: createAnalyticsEventId() });
    router.replace(`/products${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  };
  useEffect(() => {
    if (!searchIntent || observedSearch.current === searchIntent || searchIntent.query !== query || queryError || !range.valid || !data || !Number.isSafeInteger(data.totalItems) || data.totalItems < 0) return;
    observedSearch.current = searchIntent;
    if (searchIntent.eventId) captureAnalytics({ kind: "search", eventId: searchIntent.eventId, hasQuery: searchIntent.hasQuery, resultBucket: data.totalItems === 0 ? "zero" : data.totalItems <= 10 ? "1_10" : data.totalItems <= 100 ? "11_100" : "over_100" });
  }, [searchIntent, query, queryError, range.valid, data]);
  const { families = [], concentrations = [], volumesMl = [], notes = [] } = data?.facets ?? {};
  const filtered = !!(input.search || input.family || input.concentration || input.note || input.volumeMl || input.available || input.minPriceToman || input.maxPriceToman);
  const filterForm = <form id={`${id}-filter-form`} className="catalog-filter sf-catalog-filter" onSubmit={event => { event.preventDefault(); apply(event.currentTarget); }} noValidate>
      <div className="sf-filter-heading"><h2>انتخاب دقیق‌تر</h2>{filtered && <Link href="/products" className="text-link" onClick={() => setFiltersOpen(false)}>پاک‌کردن فیلترها</Link>}</div>
      <label className="search-field">جست‌وجوی عطر<input name="search" type="search" key={input.search} defaultValue={input.search} placeholder="نام یا خانوادهٔ رایحه" /></label>
      {(families.length > 0 || input.family) && <label>خانوادهٔ رایحه<select value={input.family} onChange={event => update("family", event.target.value)}><option value="">همه</option>{input.family && !families.includes(input.family) && <option>{input.family}</option>}{families.map(family => <option key={family}>{family}</option>)}</select></label>}
      {(volumesMl.length > 0 || input.volumeMl) && <label>حجم<select value={input.volumeMl ?? ""} onChange={event => update("volume", event.target.value)}><option value="">همه</option>{input.volumeMl && !volumesMl.includes(input.volumeMl) && <option value={input.volumeMl}>{faNumber(input.volumeMl)} میلی‌لیتر</option>}{volumesMl.map(volume => <option key={volume} value={volume}>{faNumber(volume)} میلی‌لیتر</option>)}</select></label>}
      {(concentrations.length > 1 || input.concentration) && <label>غلظت<select value={input.concentration} onChange={event => update("concentration", event.target.value)}><option value="">همه</option>{input.concentration && !concentrations.includes(input.concentration) && <option>{input.concentration}</option>}{concentrations.map(concentration => <option key={concentration}>{concentration}</option>)}</select></label>}
      {(notes.length > 0 || input.note) && <label>نت رایحه<select value={input.note} onChange={event => update("note", event.target.value)}><option value="">همه</option>{input.note && !notes.includes(input.note) && <option>{input.note}</option>}{notes.map(note => <option key={note}>{note}</option>)}</select></label>}
      <label className="checkbox-row"><input type="checkbox" checked={!!input.available} onChange={event => update("stock", event.target.checked ? "1" : "")} />فقط موجودها</label>
      <fieldset className="catalog-price-range"><legend>بازهٔ قیمت (تومان)</legend><div className="catalog-price-fields">
        {([{ key: "minPriceToman", label: "حداقل قیمت (تومان)" }, { key: "maxPriceToman", label: "حداکثر قیمت (تومان)" }] as const).map(({ key, label }) => <div key={key}><label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} name={key} key={input[key] ?? ""} defaultValue={input[key] ?? ""} inputMode="numeric" dir="ltr" aria-invalid={!!rangeErrors[key]} aria-describedby={`${id}-price-help${rangeErrors[key] ? ` ${id}-${key}-error` : ""}`} onChange={() => setDraftErrors(null)} />{rangeErrors[key] && <p className="field-error" id={`${id}-${key}-error`}>{rangeErrors[key]}</p>}</div>)}
      </div><p className="helper" id={`${id}-price-help`}>هر حد را می‌توانید خالی بگذارید. برای اعمال قیمت‌ها، دکمهٔ جست‌وجو را بزنید.</p></fieldset>
      <button className="secondary full-width" type="submit">جست‌وجو</button>
    {Object.keys(rangeErrors).length > 0 && <div ref={summary} className="notice error" role="alert" tabIndex={-1}><p>بازهٔ قیمت را بررسی کنید؛ مقدارهای واردشده حفظ شده‌اند.</p><ul>{Object.entries(rangeErrors).map(([key, message]) => <li key={key}><a href={`#${id}-${key}`}>{message}</a></li>)}</ul></div>}
    </form>;
  const chips = [
    { key: "search", text: input.search ? `جست‌وجو: ${input.search}` : "" }, { key: "family", text: input.family ?? "" }, { key: "concentration", text: input.concentration ?? "" }, { key: "note", text: input.note ? `نت: ${input.note}` : "" }, { key: "volume", text: input.volumeMl ? `${faNumber(input.volumeMl)} میلی‌لیتر` : "" }, { key: "stock", text: input.available ? "فقط موجودها" : "" }, { key: "minPriceToman", text: input.minPriceToman ? `از ${input.minPriceToman} تومان` : "" }, { key: "maxPriceToman", text: input.maxPriceToman ? `تا ${input.maxPriceToman} تومان` : "" },
  ].filter(chip => chip.text);
  return <div className="sf-catalog-layout"><aside className="sf-filter-sidebar" aria-label="فیلتر عطرها">{!filtersOpen && filterForm}</aside><div className="sf-catalog-results"><div className="sf-catalog-toolbar"><button type="button" className="secondary sf-filter-trigger" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></svg>فیلترها{chips.length > 0 && <span>({faNumber(chips.length)})</span>}</button><p className="small muted" role="status" aria-live="polite">{data ? `${faNumber(data.totalItems)} عطر در این انتخاب` : "در حال دریافت عطرها…"}</p><label className="sf-sort-control">مرتب‌سازی<select value={input.sort} onChange={event => update("sort", event.target.value)}><option value="name">نام محصول</option><option value="price_asc">کمترین قیمت</option><option value="price_desc">بیشترین قیمت</option></select></label></div>{chips.length > 0 && <div className="sf-filter-chips" aria-label="فیلترهای فعال">{chips.map(chip => <button type="button" key={chip.key} onClick={() => update(chip.key, "")} aria-label={`حذف فیلتر ${chip.text}`}><bdi>{chip.text}</bdi><span aria-hidden="true">×</span></button>)}</div>}
    {data?.facetsTruncated && <p className="helper">همهٔ گزینه‌های فیلتر نمایش داده نمی‌شوند. برای یافتن عطر یا رایحهٔ دلخواه، از جست‌وجوی عطرها استفاده کنید.</p>}
    {queryError ? <Notice error>{queryError} {!serverError && <button className="text-button" onClick={remote.reload}>تلاش دوباره</button>} <Link href="/products" className="text-link">پاک‌کردن فیلترها</Link></Notice> : !range.valid ? null : !data ? <Loading label="در حال دریافت عطرها…" /> : <>
      <div className="result-bar"><p role="status" aria-live="polite">{faNumber(data.totalItems)} محصول</p>{input.note && <p>نت: <bdi>{input.note}</bdi> <button type="button" className="text-button" onClick={() => update("note", "")}>پاک‌کردن انتخاب نت</button></p>}{filtered && <Link href="/products" className="text-link">پاک‌کردن فیلترها</Link>}</div>
      {data.items.length ? <div className="product-grid">{data.items.map(product => <ProductTile key={product.id} product={product} volumeMl={input.volumeMl} inStock={input.available} sort={input.sort} minPriceToman={input.minPriceToman} maxPriceToman={input.maxPriceToman} />)}</div> : <Empty title={filtered ? "محصولی با این انتخاب پیدا نشد." : data.page > 1 ? "این صفحه محصولی ندارد." : "کاتالوگ در حال آماده‌سازی است."}><p>{filtered ? "جست‌وجو یا فیلترها را تغییر دهید." : data.page > 1 ? "به صفحهٔ اول نتایج برگردید." : "پس از انتشار محصولات، اطلاعات و قیمت آن‌ها در این بخش نمایش داده می‌شود."}</p>{(filtered || data.page > 1) && <Link href={filtered ? "/products" : pageHref("/products", params.toString(), 1)} className="button secondary">دیدن همهٔ عطرها</Link>}</Empty>}
      <Pagination data={data} href={page => pageHref("/products", params.toString(), page)} />
    </>}
  </div><StorefrontDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="فیلتر عطرها" className="sf-filter-dialog">{filtersOpen && filterForm}<button type="submit" form={`${id}-filter-form`} className="button full-width">نمایش نتیجه‌ها{data ? ` (${faNumber(data.totalItems)})` : ""}</button></StorefrontDialog></div>;
}
export function ProductView({ id, initialProduct, observe = false }: { id: string; initialProduct?: ProductDto; observe?: boolean }) {
  const [loadedProduct, setProduct] = useState<ProductDto | null>(initialProduct ?? null);
  // A refreshed server DTO is authoritative; do not retain an older same-product content snapshot.
  const product = initialProduct ?? loadedProduct;
  const [selected, setSelected] = useState(initialProduct?.variants.find(v => v.available > 0)?.id ?? initialProduct?.variants[0]?.id ?? "");
  const [error, setError] = useState("");
  const identity = useCustomerSession();
  const [addition, setAddition] = useState({ scopeKey: "", busy: false, added: false, error: "", refreshFailed: false });
  const operation = useRef<{ scopeKey: string; controller: AbortController } | null>(null);
  const viewedProduct = useRef<string | null>(null);
  const completedAddition = useRef<{ scopeKey: string; productId: string; eventId: string | null; emitted: boolean } | null>(null);
  const { refreshCart, announce, ready } = useCommerce();
  const feedback = !identity.pending && addition.scopeKey === identity.scopeKey ? addition : null;
  const busy = addition.scopeKey === identity.scopeKey && addition.busy;
  useEffect(() => {
    if (!observe || !product || product.status !== "published" || viewedProduct.current === product.id) return;
    viewedProduct.current = product.id;
    captureAnalytics({ kind: "product_view", productId: product.id });
  }, [observe, product]);
  useEffect(() => {
    const completed = completedAddition.current;
    if (!observe || !feedback?.added || !completed || completed.emitted || completed.scopeKey !== feedback.scopeKey) return;
    completed.emitted = true;
    if (completed.eventId) captureAnalytics({ kind: "add_to_cart", productId: completed.productId, eventId: completed.eventId });
  }, [observe, feedback?.added, feedback?.scopeKey]);
  useEffect(() => () => { const active = operation.current; if (active?.scopeKey === identity.scopeKey) { active.controller.abort(); operation.current = null; } }, [identity.scopeKey]);
  const load = useCallback(() => { api<ProductDto>(`/api/products/${encodeURIComponent(id)}`).then(p => { setError(""); setProduct(p); setSelected(current => p.variants.some(v => v.id === current) ? current : p.variants.find(v => v.available > 0)?.id ?? p.variants[0]?.id ?? ""); }).catch(e => setError(errorMessage(e))); }, [id]);
  useEffect(() => { if (!initialProduct) load(); }, [load, initialProduct]);
  const variant = product?.variants.find(v => v.id === selected);
  const add = async () => {
    if (!variant || !ready || identity.pending || operation.current?.scopeKey === identity.scopeKey) return;
    const active = { scopeKey: identity.scopeKey, controller: new AbortController() };
    operation.current = active;
    completedAddition.current = null;
    const current = () => operation.current === active && !active.controller.signal.aborted;
    setAddition({ scopeKey: active.scopeKey, busy: true, added: false, error: "", refreshFailed: false });
    try {
      await api("/api/cart", { method: "POST", signal: active.controller.signal, body: JSON.stringify({ variantId: variant.id, quantity: 1 }) });
      if (!current()) return;
      // A successful additive mutation is known even if its follow-up read is interrupted.
      if (observe && product?.status === "published") completedAddition.current = { scopeKey: active.scopeKey, productId: product.id, eventId: createAnalyticsEventId(), emitted: false };
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
  return <><div className="product-detail"><ProductGallery product={product} variantSku={variant?.sku} eager /><div className="purchase-panel"><p className="eyebrow"><bdi>Morphiume</bdi> / <bdi>{product.family}</bdi></p><h1><bdi>{product.name}</bdi></h1>{product.concentration && <p className="sf-product-concentration"><bdi>{product.concentration}</bdi></p>}<ProductIntro content={product} /><fieldset className="volume-picker"><legend>انتخاب حجم</legend><div className="volume-options">{product.variants.map(v => <label className={selected === v.id ? "volume-option selected" : "volume-option"} key={v.id}><input type="radio" name="volume" value={v.id} checked={selected === v.id} onChange={() => { setSelected(v.id); setAddition(previous => ({ ...previous, added: false, refreshFailed: false })); }} /><span>{faNumber(v.volumeMl)} میلی‌لیتر</span><small>{v.available > 0 ? "موجود" : "ناموجود"}</small></label>)}</div></fieldset>{variant && <><p className="product-price">{money(variant.price)}</p><p className={variant.available > 0 ? "stock-message" : "stock-message unavailable"}>{variant.available > 0 ? "این حجم موجود است." : "این حجم فعلاً موجود نیست."}</p></>}{error && <Notice error>{error}</Notice>}{feedback?.error && <Notice error>{feedback.error}</Notice>}<button className="full-width" disabled={busy || !ready || !variant || variant.available <= 0} onClick={add}>{busy ? "در حال افزودن…" : "افزودن به سبد خرید"}</button>{feedback?.added && <Notice silent>محصول به سبد خرید افزوده شد. <Link href="/cart" className="text-link">مشاهدهٔ سبد خرید</Link>{feedback.refreshFailed && <p>کالا به سبد افزوده شد؛ سبد تازه دریافت نشد. سبد خرید را بررسی کنید.</p>}</Notice>}<div className="sf-purchase-favorite"><FavoriteButton productId={product.id} /></div><div className="purchase-policies"><Link href="/pages/shipping">شرایط ارسال</Link><Link href="/pages/returns">شرایط مرجوعی</Link></div></div></div>{[product.topNotes, product.heartNotes, product.baseNotes].some(notes => notes.length) && <section className="notes-section"><h2>لایه‌های رایحه</h2><div className="notes-grid">{([{ label: "نت‌های آغازین", values: product.topNotes }, { label: "نت‌های میانی", values: product.heartNotes }, { label: "نت‌های پایه", values: product.baseNotes }]).filter(n => n.values.length).map(n => <div key={n.label}><h3>{n.label}</h3><p>{n.values.map((note, index) => <span key={index}>{index > 0 ? "، " : ""}<bdi>{note}</bdi></span>)}</p></div>)}</div></section>}<ProductContentDetails content={product} /></>;
}
