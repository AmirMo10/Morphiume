"use client";
import { useState } from "react";
import type { ProductImage } from "@/contracts/commerce";
import { CspImage } from "./csp-image";
import { MediaUpload } from "./media-upload";
import { digits, faNumber, Notice } from "./commerce-client";
import { isProductImageUrl } from "./product-images";

type GalleryEditorProps = {
  images: ProductImage[];
  name: string;
  variants: { sku: string; volumeMl: string }[];
  fields: Record<string, string>;
  onChange: (update: (previous: ProductImage[]) => ProductImage[]) => void;
  onUploading: (busy: boolean) => void;
};

export function ProductGalleryEditor({ images, name, variants, fields, onChange, onUploading }: GalleryEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const options = variants.map(variant => ({ ...variant, sku: variant.sku.trim() })).filter(variant => variant.sku.trim()).filter((variant, index, all) => all.findIndex(item => item.sku === variant.sku) === index);
  const append = (imageUrl: string, description: string, announce = true) => { onChange(previous => previous.length < 10 ? [...previous, { url: imageUrl, alt: description, variantSku: null }] : previous); if (announce) setNotice("تصویر به گالری افزوده شد. توضیح و حجم مرتبط آن را بررسی کنید."); };
  const addExisting = () => { setError(""); if (!isProductImageUrl(url.trim())) { setError("نشانی یک تصویر پردازش‌شدهٔ فروشگاه را وارد کنید."); requestAnimationFrame(() => document.getElementById("gallery-existing-errors")?.focus()); return; } if (!alt.trim()) { setError("توضیح تصویر را وارد کنید."); requestAnimationFrame(() => document.getElementById("gallery-existing-errors")?.focus()); return; } append(url.trim(), alt.trim()); setUrl(""); setAlt(""); };
  const update = (index: number, changes: Partial<ProductImage>) => onChange(previous => previous.map((image, position) => position === index ? { ...image, ...changes } : image));
  const move = (index: number, direction: -1 | 1) => { const destination = index + direction; onChange(previous => { const next = [...previous]; [next[index], next[destination]] = [next[destination]!, next[index]!]; return next; }); setNotice(`تصویر ${faNumber(index + 1)} به جایگاه ${faNumber(destination + 1)} منتقل شد.`); requestAnimationFrame(() => document.getElementById(`product-images.${destination}.alt`)?.focus()); };
  const remove = (index: number) => { onChange(previous => previous.filter((_, position) => position !== index)); setNotice("تصویر از گالری این محصول کنار گذاشته شد. تغییر را ذخیره کنید."); requestAnimationFrame(() => (document.getElementById(`product-images.${Math.min(index, images.length - 2)}.alt`) ?? document.getElementById("product-image-file"))?.focus()); };
  return <div id="product-images" className="gallery-editor" tabIndex={-1} aria-describedby={fields.images ? "product-error-images" : undefined}>
    <p className="helper">تا ده تصویر واقعی و دارای مجوز. اولین تصویر عمومی، تصویر اصلی محصول است؛ تصویر مخصوص هر حجم با انتخاب همان حجم نمایش داده می‌شود.</p>
    <MediaUpload disabled={images.length >= 10} onBusyChange={value => { setUploading(value); onUploading(value); }} onUploaded={imageUrl => append(imageUrl, name.trim() || "تصویر محصول", false)} />
    <p className="small muted">{faNumber(images.length)} از {faNumber(10)} تصویر</p>
    {!images.length && <p className="muted">گالری خالی است. برای انتشار، حداقل یک تصویر لازم است.</p>}
    {fields.images && <p id="product-error-images" className="field-error">{fields.images}</p>}
    <ol className="gallery-editor-list">{images.map((image, index) => <li key={`${index}-${image.url}`} className="gallery-editor-item">
      <div className="gallery-editor-image"><CspImage src={image.url} alt={image.alt} width={120} height={150} /></div>
      <div className="gallery-editor-fields"><p className="small muted">تصویر {faNumber(index + 1)}</p><div className="form-grid">
        <div className="field"><label htmlFor={`product-images.${index}.alt`}>توضیح تصویر {faNumber(index + 1)}</label><input id={`product-images.${index}.alt`} value={image.alt} maxLength={240} dir="auto" onChange={event => update(index, { alt: event.target.value })} aria-invalid={!!fields[`images.${index}.alt`]} aria-describedby={fields[`images.${index}.alt`] ? `product-error-images.${index}.alt` : "gallery-alt-help"} required />{fields[`images.${index}.alt`] && <p className="field-error" id={`product-error-images.${index}.alt`}>{fields[`images.${index}.alt`]}</p>}</div>
        <div className="field"><label htmlFor={`product-images.${index}.variantSku`}>حجم مرتبط با تصویر {faNumber(index + 1)}</label><select id={`product-images.${index}.variantSku`} value={image.variantSku ?? ""} onChange={event => update(index, { variantSku: event.target.value || null })} aria-invalid={!!fields[`images.${index}.variantSku`]} aria-describedby={fields[`images.${index}.variantSku`] ? `product-error-images.${index}.variantSku` : undefined}><option value="">عمومی؛ همهٔ حجم‌ها</option>{image.variantSku && !options.some(variant => variant.sku === image.variantSku) && <option value={image.variantSku}>حجم حذف‌شده؛ دوباره انتخاب کنید</option>}{options.map(variant => <option key={variant.sku} value={variant.sku}>{faNumber(digits(variant.volumeMl || "0"))} میلی‌لیتر · {variant.sku}</option>)}</select>{fields[`images.${index}.variantSku`] && <p className="field-error" id={`product-error-images.${index}.variantSku`}>{fields[`images.${index}.variantSku`]}</p>}</div>
      </div><p id={`product-images.${index}.url`} tabIndex={-1} className="helper gallery-image-path"><bdi dir="ltr">{image.url}</bdi></p>{fields[`images.${index}.url`] && <p className="field-error">{fields[`images.${index}.url`]}</p>}<div className="gallery-editor-actions"><button type="button" className="secondary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`تصویر ${faNumber(index + 1)}؛ انتقال به جایگاه قبل`}>انتقال به قبل</button><button type="button" className="secondary" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label={`تصویر ${faNumber(index + 1)}؛ انتقال به جایگاه بعد`}>انتقال به بعد</button><button type="button" className="text-button danger" onClick={() => remove(index)} aria-label={`حذف تصویر ${faNumber(index + 1)} از گالری`}>حذف تصویر</button></div></div>
    </li>)}</ol>
    <p id="gallery-alt-help" className="helper">توضیح کوتاه و دقیق از آنچه در تصویر دیده می‌شود، برای کاربرانی که تصویر را نمی‌بینند.</p>
    <details className="gallery-existing"><summary>افزودن تصویر پردازش‌شده با نشانی</summary><div className="form-grid"><div className="field"><label htmlFor="gallery-existing-url">نشانی تصویر پردازش‌شده</label><input id="gallery-existing-url" dir="ltr" value={url} maxLength={128} onChange={event => setUrl(event.target.value)} aria-invalid={!!error && !isProductImageUrl(url.trim())} aria-describedby={error ? "gallery-existing-help gallery-existing-errors" : "gallery-existing-help"} /></div><div className="field"><label htmlFor="gallery-existing-alt">توضیح تصویر جدید</label><input id="gallery-existing-alt" dir="auto" value={alt} maxLength={240} onChange={event => setAlt(event.target.value)} aria-invalid={!!error && !alt.trim()} aria-describedby={error ? "gallery-existing-errors" : "gallery-alt-help"} /></div></div><p id="gallery-existing-help" className="helper">نشانی رسانه‌ای که قبلاً در فروشگاه پردازش شده است. سرور مالکیت و آماده‌بودن تصویر را بررسی می‌کند.</p><button type="button" className="secondary" disabled={uploading || images.length >= 10} onClick={addExisting}>افزودن تصویر به گالری</button>{error && <Notice id="gallery-existing-errors" tabIndex={-1} error>{error}</Notice>}</details>
    {notice && <Notice>{notice}</Notice>}
  </div>;
}
