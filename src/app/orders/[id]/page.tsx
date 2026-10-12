import { OrderDetails } from "@/components/orders";
export const metadata = { title: "پیگیری سفارش", robots: { index: false, follow: false } };
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main id="main" className="page"><OrderDetails id={id} /></main>; }
