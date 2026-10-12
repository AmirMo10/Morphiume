import { ProductEditor } from "@/components/admin-products";
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ duplicate?: string }> }) { const { duplicate } = await searchParams; return <ProductEditor duplicateId={duplicate} />; }
