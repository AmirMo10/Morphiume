import type { Metadata, Viewport } from "next";
import { SiteShell } from "@/components/site-shell";
import { readPresentation } from "./_presentation";
import { getConfig } from "@/server/config";
import "@/styles/globals.css";
import "@/styles/storefront-redesign.css";
import "@/styles/admin-redesign.css";

export const metadata: Metadata = { title: { default: "Morphiume | فروشگاه عطر", template: "%s | Morphiume" }, description: "کاتالوگ عطر Morphiume، انتخاب حجم و خرید آنلاین.", icons: { icon: "/brand/favicon.svg" }, robots: process.env.DEPLOYMENT_ENV === "live" ? { index: true, follow: true } : { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#F6F2EB", colorScheme: "light" };
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) { const presentation = await readPresentation(); return <html lang="fa" dir="rtl"><body><SiteShell environment={getConfig().DEPLOYMENT_ENV} presentation={presentation}>{children}</SiteShell></body></html>; }
