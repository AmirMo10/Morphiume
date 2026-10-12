import type { Metadata, Viewport } from "next";
import { SiteShell } from "@/components/site-shell";
import "@/styles/globals.css";

export const metadata: Metadata = { title: { default: "Morphiume | فروشگاه عطر", template: "%s | Morphiume" }, description: "کاتالوگ عطر Morphiume، انتخاب حجم و خرید آنلاین.", icons: { icon: "/brand/favicon.svg" }, robots: process.env.DEPLOYMENT_ENV === "live" ? { index: true, follow: true } : { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F6F2EB" };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="fa" dir="rtl"><body><SiteShell environment={process.env.DEPLOYMENT_ENV ?? "test"}>{children}</SiteShell></body></html>; }
