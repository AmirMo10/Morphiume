import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
import { getCommerce } from "@/server/runtime";
export const metadata = { title: "عطرها" };
export default async function ProductsPage() { const products = await getCommerce().listProducts(); return <main id="main" className="page"><div className="page-heading"><p className="eyebrow">کاتالوگ Morphiume</p><h1>عطرها</h1><p className="muted">با رایحه، حجم و قیمت انتخاب کنید.</p></div><Suspense fallback={<p>در حال دریافت عطرها…</p>}><Catalog initialProducts={products} /></Suspense></main>; }
