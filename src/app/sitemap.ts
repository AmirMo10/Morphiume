import type { MetadataRoute } from "next";
import { getCommerce } from "@/server/runtime";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.DEPLOYMENT_ENV !== "live" || !process.env.PUBLIC_SITE_URL) return [];
  const base = process.env.PUBLIC_SITE_URL;
  const products = await getCommerce().listProducts();
  const pages = await getCommerce().listContent();
  return [{ url: new URL("/", base).toString() }, { url: new URL("/products", base).toString() }, ...products.map(p => ({ url: new URL(`/products/${p.slug}`, base).toString() })), ...pages.map(p => ({ url: new URL(`/pages/${String(p.slug)}`, base).toString() }))];
}
