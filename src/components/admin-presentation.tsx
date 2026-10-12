"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PageDto, ProductDto } from "@/contracts/commerce";
import type { AdminPresentationDto, PresentationInput, PresentationValue, StoreLink } from "@/contracts/presentation";
import { hasPermission, useAdmin } from "./admin-shell";
import { AdminReauthentication } from "./admin-reauth";
import { api, ApiError, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { pageQuery } from "./catalog-query";
import { Pagination } from "./pagination";
import { moveSelection, presentationValue, validatePresentation } from "./presentation-form";
import { usePagedData } from "./use-paged-data";
import { maintenanceDefaultMessage } from "./presentation-copy";

type TextFieldProps = { path: string; label: string; value: string; maximum: number; multiline?: boolean; onChange: (value: string) => void; id: string; error?: string; ltr?: boolean };
function TextField({ label, value, maximum, multiline, onChange, id, error, ltr }: TextFieldProps) {
  const props = { id, value, maxLength: maximum, dir: ltr ? "ltr" : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined };
  return <div className="field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...props} rows={3} /> : <input {...props} />}{error && <p className="field-error" id={`${id}-error`}>{error}</p>}</div>;
}
export function AdminPresentation() {
  const session = useAdmin();
  if (!hasPermission(session, "content.write")) return <Notice error>اجازهٔ تغییر نمایش فروشگاه را ندارید.</Notice>;
  return <PresentationEditor key={session?.user.id} />;
}
function PresentationEditor() {
  const session = useAdmin(), router = useRouter(), prefix = useId();
  const owner = !!session && (session.roles ?? [session.role]).includes("owner"), catalog = hasPermission(session, "catalog.write");
  const [prior, setPrior] = useState<AdminPresentationDto | null>(null), [form, setForm] = useState<PresentationValue | null>(null);
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [dirty, setDirty] = useState(false), [denied, setDenied] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Record<string, string>>({}), [resolutionError, setResolutionError] = useState(false);
  const [pickerPage, setPickerPage] = useState(1), [pickerSearch, setPickerSearch] = useState(""), [searchDraft, setSearchDraft] = useState("");
  const [review, setReview] = useState<PresentationInput | null>(null), [verified, setVerified] = useState(false), [verification, setVerification] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), summary = useRef<HTMLDivElement>(null);
  const fieldId = (path: string) => `${prefix}-${path.replace(/\./g, "-")}`;
  const clearPrivate = useCallback(() => { setDenied(true); setForm(null); setPrior(null); setSelectedNames({}); setReason(""); setReview(null); setVerified(false); setDirty(false); dialog.current?.close(); router.replace("/admin/login"); }, [router]);
  const pickerFailure = useCallback((failure: unknown) => { if (failure instanceof ApiError && [401, 403].includes(failure.status)) clearPrivate(); }, [clearPrivate]);
  const picker = usePagedData<PageDto<ProductDto>>("/api/admin/products/page", pageQuery({ page: pickerPage, pageSize: 24, status: "published", search: pickerSearch }), catalog && !!prior && !denied, pickerFailure);
  const apply = (value: AdminPresentationDto) => { setPrior(value); setForm(presentationValue(value)); setConflict(false); setDirty(false); setFields({}); setReason(""); setReview(null); };
  useEffect(() => {
    let alive = true;
    api<AdminPresentationDto>("/api/admin/presentation").then(value => { if (alive) apply(value); }).catch(failure => { if (!alive) return; setError(errorMessage(failure)); if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setDenied(true); router.replace("/admin/login"); } });
    return () => { alive = false; };
  }, [router]);
  useEffect(() => {
    if (!prior || !catalog || denied) return;
    let active = true;
    Promise.allSettled(prior.featuredProductIds.map(id => api<ProductDto>(`/api/admin/products/${id}`))).then(results => { if (!active) return; if (results.some(result => result.status === "rejected" && result.reason instanceof ApiError && [401, 403].includes(result.reason.status))) { clearPrivate(); return; } setSelectedNames(previous => ({ ...previous, ...Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled" ? [[prior.featuredProductIds[index]!, result.value.name]] : [])) })); setResolutionError(results.some(result => result.status === "rejected")); });
    return () => { active = false; };
  }, [prior, catalog, denied, clearPrivate]);
  useEffect(() => { if (error) summary.current?.focus(); }, [error]);
  useEffect(() => { if (dialog.current?.open) dialog.current.querySelector<HTMLInputElement>("input")?.focus(); }, [verification]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const change = <K extends keyof PresentationValue>(key: K, value: PresentationValue[K]) => { setForm(previous => previous && ({ ...previous, [key]: value })); setDirty(true); setFields({}); setNotice(""); setReview(null); setVerified(false); };
  const text = (path: string, label: string, value: string | null, maximum: number, onChange: (value: string) => void, multiline = false, ltr = false) => <TextField path={path} label={label} value={value ?? ""} maximum={maximum} onChange={onChange} multiline={multiline} ltr={ltr} id={fieldId(path)} error={fields[path]} />;
  const link = (path: string, label: string, value: StoreLink | null, onChange: (value: StoreLink | null) => void, optional = true) => <fieldset className="presentation-link" id={fieldId(path)}><legend>{label}</legend>{optional && <label className="checkbox-row"><input type="checkbox" checked={!!value} onChange={event => onChange(event.target.checked ? { label: "", href: "/products" } : null)} />این پیوند نمایش داده شود.</label>}{value && <div className="form-grid">{text(`${path}.label`, `متن ${label}`, value.label, 80, next => onChange({ ...value, label: next }))}{text(`${path}.href`, `مسیر ${label}`, value.href, 190, next => onChange({ ...value, href: next }), false, true)}</div>}</fieldset>;
  const reload = async () => {
    if (dirty && !confirm("ویرایش‌های ذخیره‌نشده کنار گذاشته شوند و نسخهٔ تازهٔ نمایش فروشگاه دریافت شود؟")) return;
    setBusy(true); setError(""); setNotice("");
    try { apply(await api<AdminPresentationDto>("/api/admin/presentation")); } catch (failure) { setError(errorMessage(failure)); if (failure instanceof ApiError && [401, 403].includes(failure.status)) clearPrivate(); } finally { setBusy(false); }
  };
  const save = async (input: PresentationInput) => {
    if (busy || conflict) return;
    dialog.current?.close(); setBusy(true); setError(""); setNotice("");
    try { apply(await api<AdminPresentationDto>("/api/admin/presentation", { method: "PUT", body: JSON.stringify(input) })); setNotice("نمایش فروشگاه ذخیره شد."); router.refresh(); }
    catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError) {
        setFields(failure.fields ?? {});
        if (failure.code === "MFA_REQUIRED") { setReview(input); setVerified(false); setVerification(value => value + 1); dialog.current?.showModal(); }
        else if ([401, 403].includes(failure.status)) clearPrivate();
        else setConflict(failure.code === "CONFLICT");
      }
    } finally { setBusy(false); }
  };
  const prepare = () => {
    if (!form || !prior || busy || conflict) return;
    const input = { ...presentationValue(form), expectedVersion: prior.version, reason: reason.trim() }, validation = validatePresentation(input);
    setFields(validation); if (Object.keys(validation).length) { setError("فیلدهای مشخص‌شده را بررسی کنید."); summary.current?.focus(); return; }
    setError("");
    const maintenanceChanged = JSON.stringify(input.maintenance) !== JSON.stringify(prior.maintenance);
    if (maintenanceChanged) {
      if (!owner) { setError("تغییر توقف سفارش‌گیری فقط برای مالک مجاز است."); return; }
      setReview(input); setVerified(false); setVerification(value => value + 1); dialog.current?.showModal();
    } else void save(input);
  };
  const toggleProduct = (product: ProductDto, enabled: boolean) => {
    if (!form) return;
    if (enabled && form.featuredProductIds.length >= 12) { setError("حداکثر دوازده محصول برای صفحهٔ اصلی انتخاب کنید."); return; }
    setSelectedNames(previous => ({ ...previous, [product.id]: product.name })); change("featuredProductIds", enabled ? [...new Set([...form.featuredProductIds, product.id])] : form.featuredProductIds.filter(id => id !== product.id));
  };
  if (denied) return <Notice error>دسترسی تغییر کرده است. دوباره وارد مدیریت شوید.</Notice>;
  return <><h1>نمایش فروشگاه</h1><p className="muted">متن‌ها، پیوندها و محصولات صفحهٔ اصلی را از اطلاعات تأییدشدهٔ فروشگاه تنظیم کنید. این بخش فقط متن ساده و پیوند داخلی می‌پذیرد.</p>
    {error && <Notice error ref={summary} tabIndex={-1}><p>{error}</p>{Object.entries(fields).length > 0 && <ul>{Object.entries(fields).map(([path, message]) => <li key={path}><a href={`#${fieldId(path)}`}>{message}</a></li>)}</ul>}{conflict && <><p>نسخهٔ نمایش فروشگاه تغییر کرده است؛ ویرایش‌های شما حفظ شده‌اند. برای ادامه، نسخهٔ تازه را بررسی کنید.</p><button type="button" className="secondary" disabled={busy} onClick={reload}>دریافت نسخهٔ تازه و کنارگذاشتن ویرایش‌های فرم</button></>}</Notice>}
    {notice && <Notice>{notice}</Notice>}
    {!form || !prior ? error ? <button className="secondary" type="button" onClick={reload}>تلاش دوباره</button> : <Loading /> : <form className="presentation-editor" onSubmit={event => { event.preventDefault(); prepare(); }} noValidate><fieldset disabled={busy || conflict}>
      <p className="helper">نسخهٔ نمایش: {faNumber(prior.version)} · {prior.configured ? "تنظیم‌شده" : "تنظیمات اولیه؛ هنوز ذخیره نشده است"}</p>
      {prior.unavailableLinks.length > 0 && <Notice silent><p>مقصد برخی پیوندهای قبلی اکنون منتشر نیست. این پیوندها در فرم حفظ شده‌اند و در فروشگاه نمایش داده نمی‌شوند. برای حذف، آن‌ها را صریحاً کنار بگذارید.</p><ul>{prior.unavailableLinks.map(href => <li key={href}><bdi dir="ltr">{href}</bdi></li>)}</ul></Notice>}
      <section className="form-section"><h2>ابتدای صفحهٔ اصلی</h2>{text("heroTitle", "عنوان صفحهٔ اصلی", form.heroTitle, 160, value => change("heroTitle", value))}{text("heroDescription", "توضیح صفحهٔ اصلی", form.heroDescription, 1500, value => change("heroDescription", value), true)}<p className="helper">عنوان و توضیح خالی، متن عمومی فعلی را نمایش می‌دهند. پس از ذخیره، پیوند غیرفعال در این قسمت نمایش داده نمی‌شود.</p>{link("heroAction", "پیوند ابتدای صفحه", form.heroAction, value => change("heroAction", value))}</section>
      <section className="form-section"><h2>اطلاعیهٔ فروشگاه</h2><label className="checkbox-row"><input type="checkbox" checked={!!form.banner} onChange={event => change("banner", event.target.checked ? { text: "", link: null } : null)} />اطلاعیه نمایش داده شود.</label>{form.banner && <>{text("banner.text", "متن اطلاعیه", form.banner.text, 500, value => change("banner", { ...form.banner!, text: value }), true)}{link("banner.link", "پیوند اطلاعیه", form.banner.link, value => change("banner", { ...form.banner!, link: value }))}</>}</section>
      {(["headerLinks", "footerLinks"] as const).map(key => <section className="form-section" key={key} id={fieldId(key)}><h2>{key === "headerLinks" ? "فهرست بالای صفحه" : "پیوندهای پایین صفحه"}</h2><p className="helper">حداکثر {faNumber(key === "headerLinks" ? 8 : 12)} پیوند. حساب کاربری و سبد خرید از کنترل‌های ثابت فروشگاه هستند.</p>{form[key].map((value, index) => <div className="presentation-row" key={index}>{link(`${key}.${index}`, `${key === "headerLinks" ? "بالای صفحه" : "پایین صفحه"} ${faNumber(index + 1)}`, value, next => change(key, form[key].map((item, position) => position === index ? next! : item)), false)}<div className="actions"><button className="secondary" type="button" aria-label={`بالابردن پیوند ${key === "headerLinks" ? "بالای" : "پایین"} صفحه ${faNumber(index + 1)}`} disabled={index === 0} onClick={() => change(key, moveSelection(form[key], index, -1))}>بالا</button><button className="secondary" type="button" aria-label={`پایین‌بردن پیوند ${key === "headerLinks" ? "بالای" : "پایین"} صفحه ${faNumber(index + 1)}`} disabled={index === form[key].length - 1} onClick={() => change(key, moveSelection(form[key], index, 1))}>پایین</button><button className="text-button danger" type="button" onClick={() => change(key, form[key].filter((_, position) => index !== position))}>حذف پیوند {faNumber(index + 1)}</button></div></div>)}<button className="secondary" type="button" disabled={form[key].length >= (key === "headerLinks" ? 8 : 12)} onClick={() => change(key, [...form[key], { label: "", href: "/products" }])}>{key === "headerLinks" ? "افزودن پیوند بالای صفحه" : "افزودن پیوند پایین صفحه"}</button></section>)}
      <section className="form-section"><h2>متن پایین صفحه</h2>{text("footerText", "متن پایین صفحه", form.footerText, 1500, value => change("footerText", value), true)}<p className="helper">متن خالی نمایش داده نمی‌شود. اطلاعات تماس از بخش تنظیمات فروشگاه خوانده می‌شوند.</p></section>
      <section className="form-section" id={fieldId("featuredProductIds")}><h2>محصولات صفحهٔ اصلی</h2><p className="helper">حداکثر دوازده محصول، به ترتیب انتخاب‌شده. پس از ذخیره، فهرست خالی هیچ محصولی در این بخش نمایش نمی‌دهد.</p><p className="small muted" role="status">{faNumber(form.featuredProductIds.length)} محصول انتخاب‌شده</p>{prior.unavailableProductIds.some(id => form.featuredProductIds.includes(id)) && <Notice silent>بعضی محصولات انتخاب‌شده اکنون منتشر نیستند یا حجم فعال ندارند. انتخاب قبلی حفظ شده است و در صفحهٔ اصلی نمایش داده نمی‌شود؛ حذف آن‌ها فقط با کنارگذاشتن شما انجام می‌شود.</Notice>}{resolutionError && <Notice silent>نام بعضی محصولات دریافت نشد. شناسه و ترتیب انتخاب آن‌ها حفظ شده است.</Notice>}{form.featuredProductIds.length > 0 && <ol className="selection-list">{form.featuredProductIds.map((id, index) => <li key={id}><span><bdi>{selectedNames[id] ?? id}</bdi>{prior.unavailableProductIds.includes(id) && <small className="block muted">در فروشگاه نمایش داده نمی‌شود.</small>}</span><div className="actions"><button className="secondary" type="button" aria-label={`بالابردن محصول ${faNumber(index + 1)}`} disabled={index === 0} onClick={() => change("featuredProductIds", moveSelection(form.featuredProductIds, index, -1))}>بالا</button><button className="secondary" type="button" aria-label={`پایین‌بردن محصول ${faNumber(index + 1)}`} disabled={index === form.featuredProductIds.length - 1} onClick={() => change("featuredProductIds", moveSelection(form.featuredProductIds, index, 1))}>پایین</button><button className="text-button danger" type="button" aria-label={`کنارگذاشتن محصول ${faNumber(index + 1)}`} onClick={() => change("featuredProductIds", form.featuredProductIds.filter(productId => productId !== id))}>کنارگذاشتن</button></div></li>)}</ol>}
        {catalog ? <><div className="toolbar"><div className="field"><label htmlFor={fieldId("productSearch")}>جست‌وجوی محصول برای صفحهٔ اصلی</label><input id={fieldId("productSearch")} type="search" maxLength={120} value={searchDraft} onChange={event => setSearchDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setPickerSearch(searchDraft); setPickerPage(1); } }} /></div><button className="secondary" type="button" onClick={() => { setPickerSearch(searchDraft); setPickerPage(1); }}>جست‌وجوی محصولات</button></div>{picker.error ? <Notice error>{picker.error}<button className="text-button" type="button" onClick={picker.reload}>تلاش دوباره</button></Notice> : !picker.data ? <Loading label="در حال دریافت محصولات…" /> : <>{picker.data.items.map(product => <label className="checkbox-row" key={product.id}><input type="checkbox" checked={form.featuredProductIds.includes(product.id)} disabled={!form.featuredProductIds.includes(product.id) && form.featuredProductIds.length >= 12} onChange={event => toggleProduct(product, event.target.checked)} /><bdi>{product.name}</bdi></label>)}{!picker.data.items.length && <p>محصولی با این جست‌وجو پیدا نشد.</p>}<Pagination data={picker.data} onPage={setPickerPage} label="صفحه‌های انتخاب محصول صفحهٔ اصلی" /></>}</> : <p className="helper">برای انتخاب محصول تازه، مجوز مدیریت محصولات لازم است. انتخاب‌های قبلی حفظ می‌شوند.</p>}
      </section>
      <section className="form-section" id={fieldId("services")}><h2>خدمات فروشگاه</h2><p className="helper">حداکثر چهار خدمت. فقط اطلاعات تأییدشده را بنویسید؛ خدمت غیرفعال در فروشگاه نمایش داده نمی‌شود.</p>{form.services.map((service, index) => <fieldset className="presentation-row" key={index}><legend>خدمت {faNumber(index + 1)}</legend>{text(`services.${index}.title`, `عنوان خدمت ${faNumber(index + 1)}`, service.title, 120, value => change("services", form.services.map((item, position) => position === index ? { ...item, title: value } : item)))}{text(`services.${index}.description`, `توضیح خدمت ${faNumber(index + 1)}`, service.description, 1000, value => change("services", form.services.map((item, position) => position === index ? { ...item, description: value } : item)), true)}<label className="checkbox-row"><input type="checkbox" checked={service.enabled} onChange={event => change("services", form.services.map((item, position) => position === index ? { ...item, enabled: event.target.checked } : item))} />خدمت {faNumber(index + 1)} نمایش داده شود.</label>{link(`services.${index}.link`, `پیوند خدمت ${faNumber(index + 1)}`, service.link, value => change("services", form.services.map((item, position) => position === index ? { ...item, link: value } : item)))}<div className="actions"><button className="secondary" type="button" aria-label={`بالابردن خدمت ${faNumber(index + 1)}`} disabled={index === 0} onClick={() => change("services", moveSelection(form.services, index, -1))}>بالا</button><button className="secondary" type="button" aria-label={`پایین‌بردن خدمت ${faNumber(index + 1)}`} disabled={index === form.services.length - 1} onClick={() => change("services", moveSelection(form.services, index, 1))}>پایین</button><button className="text-button danger" type="button" onClick={() => change("services", form.services.filter((_, position) => position !== index))}>حذف خدمت {faNumber(index + 1)}</button></div></fieldset>)}<button className="secondary" type="button" disabled={form.services.length >= 4} onClick={() => change("services", [...form.services, { title: "", description: "", enabled: false, link: null }])}>افزودن خدمت</button></section>
      <section className="form-section"><h2>توقف موقت سفارش‌گیری</h2><p className="helper">در حالت توقف، ثبت سفارش تازه متوقف می‌شود. حساب کاربری و پیگیری سفارش‌های ثبت‌شده همچنان در دسترس هستند. تغییر این بخش فقط برای مالک و پس از تأیید تازهٔ رمزساز مجاز است.</p><fieldset disabled={!owner}><label className="checkbox-row"><input type="checkbox" checked={form.maintenance.enabled} onChange={event => change("maintenance", { ...form.maintenance, enabled: event.target.checked })} />ثبت سفارش تازه متوقف شود.</label>{text("maintenance.message", "پیام توقف سفارش‌گیری", form.maintenance.message, 1000, value => change("maintenance", { ...form.maintenance, message: value }), true)}</fieldset>{!owner && <p className="helper">این بخش برای نقش فعلی قابل تغییر نیست.</p>}</section>
      <section className="form-section">{text("reason", "دلیل تغییر نمایش فروشگاه", reason, 1000, value => { setReason(value); setDirty(true); setReview(null); setVerified(false); setFields({}); }, true)}<p className="helper">برای پیوند، نشانی یک صفحهٔ منتشرشده از همین فروشگاه را بنویسید؛ مثلاً <bdi dir="ltr">/products</bdi> برای فهرست عطرها یا <bdi dir="ltr">/pages/about</bdi> برای صفحهٔ دربارهٔ فروشگاه، در صورت انتشار آن. فهرست مجموعه‌ها، راهنما، حساب، سبد و علاقه‌مندی‌ها نیز قابل انتخاب‌اند.</p><button disabled={busy || conflict}>{busy ? "در حال ذخیره…" : "بررسی و ذخیرهٔ نمایش فروشگاه"}</button></section>
    </fieldset></form>}
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby={`${prefix}-review-heading`} onCancel={event => { if (busy) event.preventDefault(); }}><h2 id={`${prefix}-review-heading`}>بررسی تغییر توقف سفارش‌گیری</h2>{review && error && <Notice error>{error}</Notice>}{review && prior && <><dl className="totals"><div><dt>وضعیت فعلی</dt><dd>{prior.maintenance.enabled ? "ثبت سفارش متوقف است" : "ثبت سفارش فعال است"}</dd></div><div><dt>وضعیت پس از ثبت</dt><dd>{review.maintenance.enabled ? "ثبت سفارش تازه متوقف می‌شود" : "ثبت سفارش تازه فعال می‌شود"}</dd></div></dl><p>پیام پس از ثبت:</p><p className="plain-copy"><bdi>{review.maintenance.message ?? maintenanceDefaultMessage}</bdi></p><p>دلیل: <bdi>{review.reason}</bdi></p><p className="helper">همهٔ ویرایش‌های همین فرم همراه با این تصمیم ذخیره می‌شوند. نسخهٔ نمایش: {faNumber(review.expectedVersion)}</p><AdminReauthentication key={verification} label="کد رمزساز برای تغییر توقف سفارش‌گیری" onSuccess={() => setVerified(true)} /></>}<div className="actions"><button type="button" disabled={busy || !verified || !review} onClick={() => { if (review && verified) void save(review); }}>تأیید و ثبت نمایش فروشگاه</button><button type="button" className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>بازگشت و اصلاح</button></div></dialog>
  </>;
}
