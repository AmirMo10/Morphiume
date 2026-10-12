"use client";
import Link from "next/link";
import { CspImage as Image } from "./csp-image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeSearch } from "@/lib/persian";
import { FavoriteButton } from "./wishlist";
import type { ProductDto } from "@/contracts/commerce";
import { api, Empty, errorMessage, faNumber, Loading, money, Notice, useCommerce } from "./commerce-client";

export function ProductImage({ product, eager = false }: { product: ProductDto; eager?: boolean }) {
  return <div className="product-image">{product.imageUrl ? <Image src={product.imageUrl} alt={product.name} width={640} height={800} loading={eager ? "eager" : "lazy"} /> : <div className="image-unavailable"><Image src="/brand/morphiume-mark.svg" alt="" width={72} height={96} /><span>تصویر محصول هنوز ثبت نشده است.</span></div>}</div>;
}
export function ProductTile({ product }: { product: ProductDto }) {
  const available = product.variants.find(variant => variant.available > 0) ?? product.variants[0];
  return <article className="product-tile"><Link href={`/products/${product.slug}`} aria-label={`مشاهدهٔ ${product.name}`}><ProductImage product={product} /></Link><div className="tile-meta"><div><p className="eyebrow"><bdi>{product.family || product.concentration}</bdi></p><h3><Link href={`/products/${product.slug}`}><bdi>{product.name}</bdi></Link></h3></div>{available && <div><p>{faNumber(available.volumeMl)} میلی‌لیتر</p><p className="price">{money(available.price)}</p></div>}</div>{!product.variants.some(variant => variant.available > 0) && <p className="muted small">فعلاً ناموجود</p>}</article>;
}
export function Catalog({ featured = false, initialProducts }: { featured?: boolean; initialProducts?: ProductDto[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [remoteProducts, setProducts] = useState<ProductDto[] | null>(null);
  const products = initialProducts ?? remoteProducts;
  const [error, setError] = useState("");
  const family = params.get("family") ?? "";
  const volume = params.get("volume") ?? "";
  const concentration = params.get("concentration") ?? "";
  const sort = params.get("sort") ?? "name";
  const inStock = params.get("stock") === "1";
  const load = () => { api<ProductDto[]>("/api/products").then(p => { setProducts(p); setError(""); }).catch(e => setError(errorMessage(e))); };
  useEffect(() => { if (!initialProducts) load(); }, [initialProducts]);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); if (value) next.set(key, value); else next.delete(key); router.replace(`/products${next.size ? "?" + next.toString() : ""}`, { scroll: false }); };
  const visible = useMemo(() => {
    const search = normalizeSearch(params.get("search") ?? "");
    const result = (products ?? []).filter(product => product.status === "published" && (!search || normalizeSearch(product.name + " " + product.description + " " + product.family).includes(search)) && (!family || product.family === family) && (!concentration || product.concentration === concentration) && (!volume || product.variants.some(variant => String(variant.volumeMl) === volume)) && (!inStock || product.variants.some(variant => variant.available > 0)));
    const price = (product: ProductDto) => product.variants.length ? product.variants.reduce((min, v) => BigInt(v.price.amountIrr) < min ? BigInt(v.price.amountIrr) : min, BigInt(product.variants[0]!.price.amountIrr)) : 0n;
    result.sort((a, b) => sort === "price_asc" ? Number(price(a) - price(b)) : sort === "price_desc" ? Number(price(b) - price(a)) : a.name.localeCompare(b.name, "fa"));
    return featured ? result.slice(0, 4) : result;
  }, [products, params, family, concentration, volume, inStock, sort, featured]);
  const families = [...new Set(products?.map(p => p.family).filter(Boolean))];
  const concentrations = [...new Set(products?.map(p => p.concentration).filter(Boolean))];
  const volumes = [...new Set(products?.flatMap(p => p.variants.map(v => v.volumeMl)))].sort((a, b) => a - b);
  return <>{!featured && <form className="catalog-filter" onSubmit={event => { event.preventDefault(); update("search", String(new FormData(event.currentTarget).get("search") ?? "")); }}><label className="search-field">جست‌وجوی عطر<input name="search" type="search" key={params.get("search") ?? ""} defaultValue={params.get("search") ?? ""} placeholder="نام یا خانوادهٔ رایحه" /></label><button className="secondary" type="submit">جست‌وجو</button>{families.length > 0 && <label>خانوادهٔ رایحه<select value={family} onChange={e => update("family", e.target.value)}><option value="">همه</option>{families.map(f => <option key={f}>{f}</option>)}</select></label>}{volumes.length > 0 && <label>حجم<select value={volume} onChange={e => update("volume", e.target.value)}><option value="">همه</option>{volumes.map(v => <option key={v} value={v}>{faNumber(v)} میلی‌لیتر</option>)}</select></label>}{concentrations.length > 1 && <label>غلظت<select value={concentration} onChange={e => update("concentration", e.target.value)}><option value="">همه</option>{concentrations.map(c => <option key={c}>{c}</option>)}</select></label>}<label>مرتب‌سازی<select value={sort} onChange={e => update("sort", e.target.value)}><option value="name">نام محصول</option><option value="price_asc">کمترین قیمت</option><option value="price_desc">بیشترین قیمت</option></select></label><label className="checkbox-row"><input type="checkbox" checked={inStock} onChange={e => update("stock", e.target.checked ? "1" : "")} />فقط موجودها</label></form>}
    {error ? <Notice error>{error} <button className="text-button" onClick={load}>تلاش دوباره</button></Notice> : products === null ? <Loading label="در حال دریافت عطرها…" /> : <>{!featured && <div className="result-bar"><p>{faNumber(visible.length)} محصول</p>{params.size > 0 && <Link href="/products" className="text-link">پاک‌کردن فیلترها</Link>}</div>}{visible.length ? <div className="product-grid">{visible.map(product => <ProductTile key={product.id} product={product} />)}</div> : <Empty title={products.length ? "محصولی با این انتخاب پیدا نشد." : "کاتالوگ در حال آماده‌سازی است."}><p>{products.length ? "جست‌وجو یا فیلترها را تغییر دهید." : "پس از انتشار محصولات، اطلاعات و قیمت آن‌ها در این بخش نمایش داده می‌شود."}</p>{products.length > 0 && <Link href="/products" className="button secondary">دیدن همهٔ عطرها</Link>}</Empty>}</>}
  </>;
}
export function ProductView({ id, initialProduct }: { id: string; initialProduct?: ProductDto }) {
  const [product, setProduct] = useState<ProductDto | null>(initialProduct ?? null);
  const [selected, setSelected] = useState(initialProduct?.variants.find(v => v.available > 0)?.id ?? initialProduct?.variants[0]?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const { refreshCart, announce } = useCommerce();
  const load = useCallback(() => { api<ProductDto>(`/api/products/${encodeURIComponent(id)}`).then(p => { setError(""); setProduct(p); setSelected(current => p.variants.some(v => v.id === current) ? current : p.variants.find(v => v.available > 0)?.id ?? p.variants[0]?.id ?? ""); }).catch(e => setError(errorMessage(e))); }, [id]);
  useEffect(() => { if (!initialProduct) load(); }, [load, initialProduct]);
  const variant = product?.variants.find(v => v.id === selected);
  const add = async () => { if (!variant) return; setBusy(true); setError(""); setAdded(false); try { await api("/api/cart", { method: "POST", body: JSON.stringify({ variantId: variant.id, quantity: 1 }) }); await refreshCart(); setAdded(true); announce("محصول به سبد خرید افزوده شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  if (!product) return error ? <Notice error>{error} <button className="text-button" onClick={load}>تلاش دوباره</button></Notice> : <Loading />;
  return <><div className="product-detail"><ProductImage product={product} eager /><div className="purchase-panel"><p className="eyebrow"><bdi>{product.family}</bdi></p><h1><bdi>{product.name}</bdi></h1>{product.concentration && <p className="muted"><bdi>{product.concentration}</bdi></p>}<p className="product-intro">{product.description}</p><fieldset className="volume-picker"><legend>انتخاب حجم</legend><div className="volume-options">{product.variants.map(v => <label className={selected === v.id ? "volume-option selected" : "volume-option"} key={v.id}><input type="radio" name="volume" value={v.id} checked={selected === v.id} onChange={() => { setSelected(v.id); setAdded(false); }} /><span>{faNumber(v.volumeMl)} میلی‌لیتر</span><small>{v.available > 0 ? "موجود" : "ناموجود"}</small></label>)}</div></fieldset>{variant && <><p className="product-price">{money(variant.price)}</p><p className={variant.available > 0 ? "stock-message" : "stock-message unavailable"}>{variant.available > 0 ? "این حجم موجود است." : "این حجم فعلاً موجود نیست."}</p></>}{error && <Notice error>{error}</Notice>}<button className="full-width" disabled={busy || !variant || variant.available <= 0} onClick={add}>{busy ? "در حال افزودن…" : "افزودن به سبد خرید"}</button>{added && <Notice silent>محصول به سبد خرید افزوده شد. <Link href="/cart" className="text-link">مشاهدهٔ سبد خرید</Link></Notice>}<FavoriteButton productId={product.id} /><div className="purchase-policies"><Link href="/pages/shipping">شرایط ارسال</Link><Link href="/pages/returns">شرایط مرجوعی</Link></div></div></div>{[product.topNotes, product.heartNotes, product.baseNotes].some(notes => notes.length) && <section className="notes-section"><h2>لایه‌های رایحه</h2><div className="notes-grid">{([{ label: "نت‌های آغازین", values: product.topNotes }, { label: "نت‌های میانی", values: product.heartNotes }, { label: "نت‌های پایه", values: product.baseNotes }]).filter(n => n.values.length).map(n => <div key={n.label}><h3>{n.label}</h3><p>{n.values.map((note, index) => <span key={index}>{index > 0 ? "، " : ""}<bdi>{note}</bdi></span>)}</p></div>)}</div></section>}</>;
}
