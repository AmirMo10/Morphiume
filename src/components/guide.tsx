"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { catalogInput, pageHref, pageQuery } from "./catalog-query";
import type { CatalogPageDto } from "@/contracts/commerce";
import { Empty, faNumber, Loading, Notice } from "./commerce-client";
import { ProductTile } from "./catalog";
import { Pagination } from "./pagination";
import { usePagedData } from "./use-paged-data";
export function ScentGuide() {
  const router = useRouter(), params = useSearchParams(), pathname = usePathname();
  const input = catalogInput(params);
  const { data, error, reload } = usePagedData<CatalogPageDto>("/api/catalog/page", pageQuery({ ...input, available: !!input.volumeMl }));
  const update = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.delete("page"); if (value) next.set(key, value); else next.delete(key); router.replace(`${pathname}${next.size ? "?" + next.toString() : ""}`, { scroll: false }); };
  if (error) return <Notice error>{error}<button className="text-button" onClick={reload}>تلاش دوباره</button></Notice>;
  if (!data) return <Loading />;
  const { families, notes, volumesMl } = data.facets;
  if (!data.totalItems && !input.family && !input.note && !input.volumeMl) return <Empty title="راهنما با انتشار محصولات فعال می‌شود."><p>پیشنهادها بر اساس اطلاعات واقعی محصولات ساخته می‌شوند.</p></Empty>;
  return <><p className="muted">سه انتخاب کوتاه؛ هر گزینه از ویژگی‌های ثبت‌شدهٔ کاتالوگ آمده است. می‌توانید هر انتخاب را آزاد بگذارید.</p><div className="guide-controls">
    {(families.length > 0 || input.family) && <label>کدام خانوادهٔ رایحه را ترجیح می‌دهید؟<select value={input.family} onChange={event => update("family", event.target.value)}><option value="">هنوز مطمئن نیستم</option>{input.family && !families.includes(input.family) && <option>{input.family}</option>}{families.map(family => <option key={family}>{family}</option>)}</select></label>}
    {(notes.length > 0 || input.note) && <label>کدام نت به انتخاب شما نزدیک‌تر است؟<select value={input.note} onChange={event => update("note", event.target.value)}><option value="">هنوز مطمئن نیستم</option>{input.note && !notes.includes(input.note) && <option>{input.note}</option>}{notes.map(note => <option key={note}>{note}</option>)}</select></label>}
    {(volumesMl.length > 0 || input.volumeMl) && <label>چه حجمی را در نظر دارید؟<select value={input.volumeMl ?? ""} onChange={event => update("volume", event.target.value)}><option value="">هنوز مطمئن نیستم</option>{input.volumeMl && !volumesMl.includes(input.volumeMl) && <option value={input.volumeMl}>{faNumber(input.volumeMl)} میلی‌لیتر</option>}{volumesMl.map(volume => <option value={volume} key={volume}>{faNumber(volume)} میلی‌لیتر</option>)}</select></label>}
  </div>{data.facetsTruncated && <p className="helper">همهٔ گزینه‌های فیلتر نمایش داده نمی‌شوند. برای یافتن عطر یا رایحهٔ دلخواه، از <Link className="text-link" href="/products">جست‌وجوی عطرها</Link> استفاده کنید.</p>}
    <div className="result-bar"><p role="status">{faNumber(data.totalItems)} انتخاب نزدیک</p><button className="text-button" onClick={() => router.replace(pathname, { scroll: false })}>شروع دوباره</button></div>
    {data.items.length ? <div className="product-grid guide-results">{data.items.map(product => <div key={product.id}><ProductTile product={product} volumeMl={input.volumeMl} inStock={!!input.volumeMl} /><p className="helper">{input.family && <>هم‌خانواده با انتخاب «<bdi>{input.family}</bdi>». </>}{input.note && <>نت «<bdi>{input.note}</bdi>» در اطلاعات این عطر ثبت شده است. </>}{input.volumeMl ? <>حجم {faNumber(input.volumeMl)} میلی‌لیتر موجود است.</> : !input.family && !input.note ? <>از کاتالوگ منتشرشدهٔ <bdi>Morphiume</bdi>.</> : null}</p></div>)}</div> : <Empty title="محصولی با همهٔ این انتخاب‌ها پیدا نشد."><p>یک انتخاب را به «هنوز مطمئن نیستم» تغییر دهید تا گزینه‌های بیشتری ببینید.</p></Empty>}
    <Pagination data={data} href={page => pageHref(pathname, params.toString(), page)} label="صفحه‌های پیشنهاد عطر" />
  </>;
}