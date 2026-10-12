import { notFound } from "next/navigation";
import { cache } from "react";
import { ContentPage } from "@/components/content-page";
import { getCommerce } from "@/server/runtime";
const titles: Record<string, string> = { about: "دربارهٔ برند", contact: "تماس با ما", faq: "پرسش‌های متداول", shipping: "شرایط ارسال", returns: "شرایط مرجوعی", privacy: "حریم خصوصی", terms: "شرایط استفاده" };
const publicContent = cache(async (slug: string) => { const rows = await getCommerce().listContent(); const page = rows.find(row => row.slug === slug); return page ? { slug: String(page.slug), title: String(page.title), body: String(page.body), version: Number(page.version) } : null; });
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const content = await publicContent(slug); return { title: content?.title ?? titles[slug] ?? "محتوای فروشگاه", ...(content ? { description: content.body.slice(0, 180) } : {}) }; }
export default async function ContentRoute({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!/^[a-z0-9-]+$/.test(slug)) notFound(); const content = await publicContent(slug); if (!content && !titles[slug]) notFound(); return <main id="main" className="page"><ContentPage key={slug} slug={slug} title={titles[slug] ?? "محتوای فروشگاه"} initialContent={content} /></main>; }
