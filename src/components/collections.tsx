"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminCollectionDetailDto, CollectionInput, CollectionSummaryDto, PageDto, ProductDto } from "@/contracts/commerce";
import { api, ApiError, Empty, errorMessage, faNumber, labelStatus, Loading, Notice } from "./commerce-client";
import { pageHref, pageNumber, pageQuery } from "./catalog-query";
import { Pagination } from "./pagination";
import { usePagedData } from "./use-paged-data";
import { hasPermission, useAdmin } from "./admin-shell";

type Form = Pick<CollectionInput, "name" | "slug" | "description" | "published" | "productIds">;
type Member = Pick<AdminCollectionDetailDto["members"][number], "id" | "name" | "status" | "active">;
const blank: Form = { name: "", slug: "", description: "", published: false, productIds: [] };
export function AdminCollections() {
  const session = useAdmin();
  if (!hasPermission(session, "catalog.write")) return <Notice error>اجازهٔ مدیریت مجموعه‌ها را ندارید.</Notice>;
  return <CollectionEditor key={session?.user.id} />;
}
function CollectionEditor() {
  const router = useRouter(), params = useSearchParams();
  const search = params.get("search") ?? "", published = params.get("published") ?? "";
  const list = usePagedData<PageDto<CollectionSummaryDto>>("/api/admin/collections/page", pageQuery({ page: pageNumber(params.get("page")), pageSize: 24, search, ...(published === "true" || published === "false" ? { published } : {}) }));
  const [pickerPage, setPickerPage] = useState(1), [pickerSearch, setPickerSearch] = useState(""), [searchDraft, setSearchDraft] = useState("");
  const picker = usePagedData<PageDto<ProductDto>>("/api/admin/products/page", pageQuery({ page: pickerPage, pageSize: 24, search: pickerSearch }));
  const [chosen, setChosen] = useState<Record<string, Member>>({});
  const [selected, setSelected] = useState<AdminCollectionDetailDto | null>(null), [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const updateList = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.delete("page"); if (value) next.set(key, value); else next.delete(key); router.replace(`/admin/collections${next.size ? "?" + next.toString() : ""}`, { scroll: false }); };
  const change = <K extends keyof Form>(key: K, value: Form[K]) => { setForm(previous => ({ ...previous, [key]: value })); setDirty(true); setNotice(""); setFields(previous => ({ ...previous, [key]: "" })); };
  const edit = async (id: string) => {
    if (busy) return;
    if (dirty && !window.confirm("ویرایش‌های ذخیره‌نشدهٔ این فرم کنار گذاشته شوند و اطلاعات مجموعه دریافت شود؟")) return;
    setBusy(true); setError(""); setNotice("");
    try { const detail = await api<AdminCollectionDetailDto>(`/api/admin/collections/${id}`); setSelected(detail); setChosen(Object.fromEntries(detail.members.map(member => [member.id, member]))); setForm({ name: detail.name, slug: detail.slug, description: detail.description, published: detail.published, productIds: [...detail.productIds] }); setFields({}); setConflict(false); setDirty(false); }
    catch (failure) { setError(errorMessage(failure)); if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setSelected(null); setChosen({}); setForm(blank); setDirty(false); router.replace("/admin/login"); } }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (busy) return;
    const validation: Record<string, string> = {};
    if (!form.name.trim()) validation.name = "نام مجموعه را وارد کنید.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(form.slug)) validation.slug = "نامک را با حروف کوچک لاتین، عدد و خط تیره بنویسید؛ شناسهٔ UUID نامک نیست.";
    if (form.productIds.length > 300) validation.productIds = "هر مجموعه حداکثر ۳۰۰ محصول انتخاب‌شده دارد.";
    setFields(validation); if (Object.keys(validation).length) { setError("فیلدهای مشخص‌شده را بررسی کنید."); return; }
    const input: CollectionInput = { ...form, ...(selected ? { id: selected.id, expectedVersion: selected.version } : {}) };
    setBusy(true); setError(""); setNotice("");
    try { await api("/api/admin/collections", { method: "POST", body: JSON.stringify(input) }); setSelected(null); setChosen({}); setForm(blank); setConflict(false); setDirty(false); list.reload(); setNotice("مجموعه ذخیره شد."); }
    catch (failure) { setError(errorMessage(failure)); if (failure instanceof ApiError) { setFields(failure.fields ?? {}); setConflict(failure.code === "CONFLICT"); if ([401, 403].includes(failure.status)) { setSelected(null); setChosen({}); setForm(blank); setDirty(false); router.replace("/admin/login"); } } }
    finally { setBusy(false); }
  };
  const toggleProduct = (product: ProductDto, enabled: boolean) => { if (enabled && form.productIds.length >= 300) { setError("هر مجموعه حداکثر ۳۰۰ محصول انتخاب‌شده دارد."); return; } setChosen(previous => ({ ...previous, [product.id]: { id: product.id, name: product.name, status: product.status, active: product.variants.length > 0 } })); change("productIds", enabled ? [...new Set([...form.productIds, product.id])] : form.productIds.filter(id => id !== product.id)); };
  const searchProducts = () => { setPickerSearch(searchDraft); setPickerPage(1); };
  const hidden = form.productIds.filter(id => chosen[id] && (chosen[id].status !== "published" || !chosen[id].active));
  return <><h1>مجموعه‌ها</h1>{error && <Notice error ref={errorRef} tabIndex={-1}>{error}{Object.entries(fields).filter(([, message]) => message).length > 0 && <ul>{Object.entries(fields).filter(([, message]) => message).map(([key, message]) => <li key={key}><a href={`#collection-${key}`}>{message}</a></li>)}</ul>}{conflict && selected && <><p>ویرایش‌های فعلی حفظ شده‌اند. برای جایگزینی آن‌ها با اطلاعات فعلی، دریافت نسخهٔ تازه را انتخاب کنید.</p><button type="button" className="secondary" disabled={busy} onClick={() => edit(selected.id)}>دریافت نسخهٔ تازه و کنارگذاشتن ویرایش‌های فرم</button></>}</Notice>}{notice && <Notice>{notice}</Notice>}
    <form className="toolbar" onSubmit={event => { event.preventDefault(); updateList("search", String(new FormData(event.currentTarget).get("search") ?? "")); }}><label>جست‌وجوی مجموعه<input name="search" type="search" key={search} defaultValue={search} /></label><button className="secondary">جست‌وجو</button><label>وضعیت انتشار<select value={published === "true" || published === "false" ? published : ""} onChange={event => updateList("published", event.target.value)}><option value="">همه</option><option value="true">منتشرشده</option><option value="false">پیش‌نویس</option></select></label></form>
    {list.error ? <Notice error>{list.error}<button className="text-button" onClick={list.reload}>تلاش دوباره</button></Notice> : !list.data ? <Loading /> : <><p className="small muted" role="status">{faNumber(list.data.totalItems)} مجموعه</p>{list.data.items.length ? <div className="collection-list">{list.data.items.map(collection => <article key={collection.id} className="form-section"><div className="section-heading"><h2><bdi>{collection.name}</bdi></h2><button type="button" className="text-button" disabled={busy} onClick={() => edit(collection.id)}>ویرایش مجموعه</button></div><p>{collection.description}</p><p className="small">{collection.published ? "منتشرشده" : "پیش‌نویس"} · {faNumber(collection.productCount)} محصول پیوندشده</p>{collection.published && <Link href={`/collections/${collection.slug}`} className="text-link">مشاهدهٔ صفحهٔ عمومی</Link>}</article>)}</div> : <Empty title="مجموعه‌ای در این فهرست وجود ندارد." />}<Pagination data={list.data} href={page => pageHref("/admin/collections", params.toString(), page)} label="صفحه‌های مجموعه‌های مدیریت" /></>}
    <section className="form-section"><h2>{selected ? "ویرایش مجموعه" : "مجموعهٔ جدید"}</h2><form onSubmit={event => { event.preventDefault(); save(); }} noValidate><fieldset disabled={busy}><div className="form-grid"><div><label htmlFor="collection-name">نام مجموعه</label><input id="collection-name" value={form.name} onChange={event => change("name", event.target.value)} maxLength={160} aria-invalid={!!fields.name} aria-describedby={fields.name ? "collection-name-error" : undefined} />{fields.name && <p className="field-error" id="collection-name-error">{fields.name}</p>}</div><div><label htmlFor="collection-slug">نامک صفحه</label><input id="collection-slug" dir="ltr" value={form.slug} onChange={event => change("slug", event.target.value)} maxLength={160} aria-invalid={!!fields.slug} aria-describedby={fields.slug ? "collection-slug-error" : "collection-slug-help"} /><p className="helper" id="collection-slug-help">نامک‌های پیشین این مجموعه حفظ می‌شوند؛ نامک متعلق به مجموعهٔ دیگر قابل انتخاب نیست.</p>{fields.slug && <p className="field-error" id="collection-slug-error">{fields.slug}</p>}</div><div className="span-full"><label htmlFor="collection-description">توضیح مجموعه</label><textarea id="collection-description" rows={3} value={form.description} onChange={event => change("description", event.target.value)} maxLength={10000} /></div></div>
      <fieldset id="collection-productIds"><legend>محصولات مجموعه</legend><div className="toolbar"><div className="field"><label htmlFor="collection-product-search">جست‌وجوی محصول برای مجموعه</label><input id="collection-product-search" type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); searchProducts(); } }} /></div><button type="button" className="secondary" onClick={searchProducts}>جست‌وجوی محصولات</button></div><p className="small muted" role="status">{faNumber(form.productIds.length)} محصول انتخاب‌شده؛ حداکثر ۳۰۰</p>{hidden.length > 0 && <Notice silent>بعضی محصولات انتخاب‌شده اکنون منتشر نیستند یا حجم فعال ندارند و در صفحهٔ عمومی نمایش داده نمی‌شوند. انتخاب آن‌ها حفظ شده است؛ فقط با کنارگذاشتن صریح شما حذف می‌شوند.</Notice>}{form.productIds.length > 0 && <ul className="selection-list">{form.productIds.map(id => <li key={id}><span><bdi>{chosen[id]?.name ?? "محصول انتخاب‌شده"}</bdi>{chosen[id] && <small className="block muted">{labelStatus(chosen[id].status)}{!chosen[id].active && " · بدون حجم فعال"}</small>}</span><button type="button" className="text-button" aria-label={`کنارگذاشتن ${chosen[id]?.name ?? "محصول انتخاب‌شده"}`} onClick={() => change("productIds", form.productIds.filter(productId => productId !== id))}>کنارگذاشتن</button></li>)}</ul>}{fields.productIds && <p className="field-error">{fields.productIds}</p>}
      {picker.error ? <Notice error>{picker.error}<button type="button" className="text-button" onClick={picker.reload}>تلاش دوباره</button></Notice> : !picker.data ? <Loading label="در حال دریافت محصولات…" /> : <>{picker.data.items.map(product => <label className="checkbox-row" key={product.id}><input type="checkbox" checked={form.productIds.includes(product.id)} onChange={event => toggleProduct(product, event.target.checked)} /><bdi>{product.name}</bdi> · {labelStatus(product.status)}</label>)}{!picker.data.items.length && <p className="muted">محصولی با این جست‌وجو پیدا نشد.</p>}<Pagination data={picker.data} onPage={setPickerPage} label="صفحه‌های انتخاب محصول مجموعه" /></>}</fieldset>
      <label className="checkbox-row"><input type="checkbox" checked={form.published} onChange={event => change("published", event.target.checked)} />مجموعه در فروشگاه منتشر شود.</label><p className="helper">برای پیوند تازه یا انتشار مجموعه، محصول باید منتشرشده باشد. عضو پنهانِ قبلیِ مجموعهٔ منتشرشده تا کنارگذاشتن شما حفظ می‌شود.</p><div className="actions"><button disabled={busy || conflict}>{busy ? "در حال ذخیره…" : "ذخیرهٔ مجموعه"}</button>{selected && <button type="button" className="secondary" onClick={() => { if (dirty && !window.confirm("ویرایش‌های ذخیره‌نشده برای شروع مجموعهٔ جدید کنار گذاشته شوند؟")) return; setSelected(null); setChosen({}); setForm(blank); setConflict(false); setDirty(false); setFields({}); }}>ساخت مجموعهٔ جدید</button>}</div></fieldset></form></section>
  </>;
}
