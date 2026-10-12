import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  if (process.env.DEPLOYMENT_ENV !== "live") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/favorites", "/test", "/api", "/products?*"] }, ...(process.env.PUBLIC_SITE_URL ? { sitemap: new URL("/sitemap.xml", process.env.PUBLIC_SITE_URL).toString() } : {}) };
}
