"use client";
import { useId, useState } from "react";
import type { ProductDto } from "@/contracts/commerce";
import { CspImage } from "./csp-image";
import { faNumber } from "./commerce-client";
import { imagesForVariant } from "./product-images";

export function ProductGallery({ product, variantSku, eager = false }: { product: ProductDto; variantSku?: string; eager?: boolean }) {
  const imageId = useId();
  const images = imagesForVariant(product, variantSku);
  const [selection, setSelection] = useState<{ sku?: string; index: number }>({ sku: variantSku, index: 0 });
  const selectedIndex = selection.sku === variantSku && images[selection.index] ? selection.index : 0;
  const image = images[selectedIndex];
  return <div className="product-gallery" role="group" aria-label="تصاویر محصول">
    <div id={imageId} className="product-image">{image ? <CspImage src={image.url} alt={image.alt} width={640} height={800} loading={eager ? "eager" : "lazy"} /> : <div className="image-unavailable"><CspImage src="/brand/morphiume-mark.svg" alt="" width={72} height={96} /><span>{variantSku && product.images?.length ? "تصویر این حجم هنوز ثبت نشده است." : "تصویر محصول هنوز ثبت نشده است."}</span></div>}</div>
    {images.length > 1 && <div className="sf-gallery-nav"><button type="button" className="secondary" aria-label="تصویر قبلی محصول" aria-controls={imageId} disabled={selectedIndex === 0} onClick={() => setSelection({ sku: variantSku, index: selectedIndex - 1 })}>→</button><p className="small muted">{faNumber(selectedIndex + 1)} / {faNumber(images.length)}</p><button type="button" className="secondary" aria-label="تصویر بعدی محصول" aria-controls={imageId} disabled={selectedIndex === images.length - 1} onClick={() => setSelection({ sku: variantSku, index: selectedIndex + 1 })}>←</button></div>}
    {images.length > 1 && <div className="gallery-thumbnails" aria-label="انتخاب تصویر">{images.map((entry, index) => <button key={`${index}-${entry.url}`} type="button" className="gallery-thumbnail" aria-label={`تصویر ${faNumber(index + 1)}: ${entry.alt}`} aria-pressed={index === selectedIndex} aria-controls={imageId} onClick={() => setSelection({ sku: variantSku, index })}><CspImage src={entry.url} alt="" width={80} height={100} /></button>)}</div>}
    {images.length > 1 && <p className="gallery-caption small muted" role="status" aria-live="polite" aria-atomic="true">تصویر {faNumber(selectedIndex + 1)} از {faNumber(images.length)} · <bdi>{image?.alt}</bdi></p>}
  </div>;
}
