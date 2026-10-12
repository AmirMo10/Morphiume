import { OrderDetails } from "@/components/orders";
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <OrderDetails id={id} admin />; }
