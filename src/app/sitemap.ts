import type { MetadataRoute } from "next";
import { getCommerce } from "@/server/runtime";
import { getConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = getConfig();
  if (config.DEPLOYMENT_ENV !== "live") return [];
  const base = config.PUBLIC_SITE_URL ?? config.APP_BASE_URL;
  const products = await getCommerce().listSitemapProducts();
  const pages = await getCommerce().listContent();
  return [{ url: new URL("/", base).toString() }, { url: new URL("/products", base).toString() }, ...products.map(p => ({ url: new URL(`/products/${p.slug}`, base).toString(), lastModified: p.updatedAt })), ...pages.map(p => ({ url: new URL(`/pages/${String(p.slug)}`, base).toString() }))];
}
