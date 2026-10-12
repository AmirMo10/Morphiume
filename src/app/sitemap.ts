import type { MetadataRoute } from "next";
import { getCommerce } from "@/server/runtime";
import { getConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = getConfig();
  if (config.DEPLOYMENT_ENV !== "live") return [];
  const base = config.PUBLIC_SITE_URL ?? config.APP_BASE_URL;
  const commerce=getCommerce();
  const [products,collections,pages] = await Promise.all([commerce.listSitemapProducts(),commerce.listSitemapCollections(),commerce.listContent()]);
  return [{ url: new URL("/", base).toString() }, { url: new URL("/products", base).toString() }, { url:new URL("/collections",base).toString() }, ...products.map(p => ({ url: new URL(`/products/${p.slug}`, base).toString(), lastModified: p.updatedAt })), ...collections.map(collection=>({url:new URL(`/collections/${collection.slug}`,base).toString(),lastModified:collection.updatedAt})), ...pages.map(p => ({ url: new URL(`/pages/${String(p.slug)}`, base).toString() }))];
}
