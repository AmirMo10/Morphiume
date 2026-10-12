import { Collections } from "@/components/collections";
export const metadata = { title: "مجموعهٔ عطرها" };
export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <main id="main" className="page"><Collections slug={slug} /></main>; }
