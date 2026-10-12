import type { ProductDto, ProductImage } from "@/contracts/commerce";

/** Legacy single-image responses remain readable while the server migrates the gallery. */
export function productImages(product: Pick<ProductDto, "images" | "imageUrl" | "name">): ProductImage[] {
  return product.images?.length ? product.images : product.imageUrl ? [{ url: product.imageUrl, alt: product.name, variantSku: null }] : [];
}

export function imagesForVariant(product: Pick<ProductDto, "images" | "imageUrl" | "name">, variantSku?: string): ProductImage[] {
  const images = productImages(product);
  if (!variantSku) return images;
  // A picture explicitly assigned to another volume must not represent the selected volume.
  return [...images.filter(image => image.variantSku === variantSku), ...images.filter(image => !image.variantSku)];
}

export function isProductImageUrl(url: string): boolean {
  return /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(url) || url === "/assets/sample-perfume.svg";
}
