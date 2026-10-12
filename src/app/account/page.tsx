import { AccountContent } from "@/components/account";
export const metadata = { title: "حساب کاربری", robots: { index: false, follow: false } };
export default function AccountPage() { return <main id="main" className="page"><div className="page-heading"><h1>حساب کاربری</h1><p className="muted">ورود با شمارهٔ همراه و پیگیری امن سفارش‌ها.</p></div><AccountContent /></main>; }
