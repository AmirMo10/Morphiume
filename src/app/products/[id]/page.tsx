import Link from "next/link";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ProductView } from "@/components/catalog";
import { productImages } from "@/components/product-images";
import { productIntro } from "@/components/product-content";
import { JsonLd } from "@/components/structured-data";
import { CommerceError } from "@/contracts/commerce";
import { getCommerce } from "@/server/runtime";
import { getConfig } from "@/server/config";

const publicProduct = cache(async (id: string) => { try { return await getCommerce().resolveProductRoute(id); } catch (error) { if (error instanceof CommerceError && error.code === "NOT_FOUND") notFound(); throw error; } });
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { product } = await publicProduct(id);
  const config = getConfig(), canonical = new URL(`/products/${product.slug}`, config.PUBLIC_SITE_URL ?? config.APP_BASE_URL).toString();
  return { title: product.name, description: productIntro(product).trim().slice(0, 180), alternates: { canonical } };
}
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { product, canonicalSlug, redirect } = await publicProduct(id);
  if (redirect || id !== canonicalSlug) permanentRedirect(`/products/${canonicalSlug}`);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const config = getConfig();
  const base = config.PUBLIC_SITE_URL ?? config.APP_BASE_URL;
  const breadcrumbs = [{ name: "عطرها", path: "/products" }, { name: product.name, path: `/products/${product.slug}` }] as const;
  const breadcrumbData = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((breadcrumb, index) => ({ "@type": "ListItem", position: index + 1, name: breadcrumb.name, item: new URL(breadcrumb.path, base).toString() })) };
  const images = productImages(product);
  const productData = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description, brand: { "@type": "Brand", name: "Morphiume" }, ...(images.length ? { image: [...new Set(images.map(image => image.url))] } : {}), offers: product.variants.map(variant => ({ "@type": "Offer", sku: variant.sku, price: variant.price.amountIrr, priceCurrency: "IRR", availability: variant.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" })) };
  return <main id="main" className="page"><nav className="breadcrumbs" aria-label="مسیر صفحه"><Link href={breadcrumbs[0].path}>{breadcrumbs[0].name}</Link><span aria-hidden="true">/</span><span aria-current="page"><bdi>{breadcrumbs[1].name}</bdi></span></nav><ProductView key={product.id} id={product.id} initialProduct={product} /><JsonLd data={productData} nonce={nonce} /><JsonLd data={breadcrumbData} nonce={nonce} /></main>;
}
