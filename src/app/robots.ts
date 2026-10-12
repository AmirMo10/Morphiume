import type { MetadataRoute } from "next";
import { getConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const config = getConfig();
  if (config.DEPLOYMENT_ENV !== "live") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/favorites", "/test", "/api", "/products?*"] }, sitemap: new URL("/sitemap.xml", config.PUBLIC_SITE_URL ?? config.APP_BASE_URL).toString() };
}
