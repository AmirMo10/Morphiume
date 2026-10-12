import { Suspense } from "react";
import Link from "next/link";
import { Catalog } from "@/components/catalog";
import { getCommerce } from "@/server/runtime";
import { catalogInput, pageQuery } from "@/components/catalog-query";
import { CommerceError, type CatalogPageDto } from "@/contracts/commerce";
export const metadata = { title: "عطرها" };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, Array.isArray(value) ? value[0] ?? "" : value);
  let data: CatalogPageDto | undefined, error: string | undefined;
  const input = catalogInput(query);
  try { data = await getCommerce().listProductsPage(input); }
  catch (failure) { if (failure instanceof CommerceError && failure.code === "VALIDATION") error = failure.message; else throw failure; }
  return <main id="main" className="page"><div className="page-heading"><p className="eyebrow">کاتالوگ <bdi>Morphiume</bdi></p><h1>عطرها</h1><p className="muted">با رایحه، حجم و قیمت انتخاب کنید.</p><Link href="/collections" className="text-link">مشاهدهٔ مجموعه‌ها</Link></div><Suspense fallback={<p>در حال دریافت عطرها…</p>}><Catalog initialPage={data} initialError={error} initialQuery={pageQuery(input)} /></Suspense></main>;
}
