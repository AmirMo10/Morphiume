import { AdminShell } from "@/components/admin-shell";
export const metadata = { title: "مدیریت فروشگاه", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AdminShell>{children}</AdminShell>; }
