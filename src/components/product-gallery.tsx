"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ProductDto, ProductImage } from "@/contracts/commerce";
import { CspImage } from "./csp-image";
import { faNumber } from "./commerce-client";
import { imagesForVariant } from "./product-images";

/** Keep the supplied media readable without enlarging a tiny source into a product photo. */
export function ProductMedia({ image, eager = false, id, unavailableLabel = "تصویر محصول هنوز ثبت نشده است." }: { image?: ProductImage; eager?: boolean; id?: string; unavailableLabel?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<{ url: string; lowResolution: boolean } | null>(null);
  const url = image?.url;
  const measure = useCallback((element: HTMLImageElement) => {
    if (!url || element.getAttribute("src") !== url || !element.complete || element.naturalWidth <= 0 || element.naturalHeight <= 0) return;
    const lowResolution = element.naturalWidth < 96 || element.naturalHeight < 96;
    setMeasurement(previous => previous?.url === url && previous.lowResolution === lowResolution ? previous : { url, lowResolution });
  }, [url]);
  useEffect(() => {
    // A cached/SSR image may finish before React attaches the load listener.
    const element = container.current?.querySelector<HTMLImageElement>("img.sf-original-product-image");
    if (element?.complete) measure(element);
  }, [measure]);
  const lowResolution = !!url && measurement?.url === url && measurement.lowResolution;
  return <div ref={container} id={id} className={`product-image${lowResolution ? " sf-media-low-resolution" : ""}`} onLoadCapture={event => { if (event.target instanceof HTMLImageElement) measure(event.target); }}>
    {image ? <><CspImage className="sf-original-product-image" src={image.url} alt={image.alt} width={640} height={800} loading={eager ? "eager" : "lazy"} />{lowResolution && <><span className="sf-media-quality-mark" aria-hidden="true"><CspImage src="/brand/morphiume-mark.svg" alt="" width={96} height={96} /></span><span className="sf-media-quality-label">تصویر با وضوح محدود</span></>}</> : <div className="image-unavailable"><CspImage src="/brand/morphiume-mark.svg" alt="" width={72} height={96} /><span>{unavailableLabel}</span></div>}
  </div>;
}

export function ProductGallery({ product, variantSku, eager = false }: { product: ProductDto; variantSku?: string; eager?: boolean }) {
  const imageId = useId();
  const images = imagesForVariant(product, variantSku);
  const [selection, setSelection] = useState<{ sku?: string; index: number }>({ sku: variantSku, index: 0 });
  const selectedIndex = selection.sku === variantSku && images[selection.index] ? selection.index : 0;
  const image = images[selectedIndex];
  return <div className="product-gallery" role="group" aria-label="تصاویر محصول">
    <ProductMedia id={imageId} image={image} eager={eager} unavailableLabel={variantSku && product.images?.length ? "تصویر این حجم هنوز ثبت نشده است." : undefined} />
    {images.length > 1 && <div className="sf-gallery-nav"><button type="button" className="secondary" aria-label="تصویر قبلی محصول" aria-controls={imageId} disabled={selectedIndex === 0} onClick={() => setSelection({ sku: variantSku, index: selectedIndex - 1 })}>→</button><p className="small muted">{faNumber(selectedIndex + 1)} / {faNumber(images.length)}</p><button type="button" className="secondary" aria-label="تصویر بعدی محصول" aria-controls={imageId} disabled={selectedIndex === images.length - 1} onClick={() => setSelection({ sku: variantSku, index: selectedIndex + 1 })}>←</button></div>}
    {images.length > 1 && <div className="gallery-thumbnails" aria-label="انتخاب تصویر">{images.map((entry, index) => <button key={`${index}-${entry.url}`} type="button" className="gallery-thumbnail" aria-label={`تصویر ${faNumber(index + 1)}: ${entry.alt}`} aria-pressed={index === selectedIndex} aria-controls={imageId} onClick={() => setSelection({ sku: variantSku, index })}><CspImage src={entry.url} alt="" width={80} height={100} /></button>)}</div>}
    {images.length > 1 && <p className="gallery-caption small muted" role="status" aria-live="polite" aria-atomic="true">تصویر {faNumber(selectedIndex + 1)} از {faNumber(images.length)} · <bdi>{image?.alt}</bdi></p>}
  </div>;
}
