import { notFound } from "next/navigation";
import { TestPayment } from "@/components/test-payment";
export const metadata = { title: "پرداخت آزمایشی", robots: { index: false, follow: false } };
export default async function TestPaymentPage({ params }: { params: Promise<{ authority: string }> }) { if (process.env.DEPLOYMENT_ENV === "live") notFound(); const { authority } = await params; return <main id="main" className="page narrow"><TestPayment authority={authority} /></main>; }
