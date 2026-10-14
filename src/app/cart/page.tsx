import { CartPageContent } from "@/components/cart";
export const metadata = { title: "سبد خرید", robots: { index: false, follow: false } };
export default function CartPage() { return <main id="main" className="page sf-commerce-page"><div className="page-heading"><p className="eyebrow">انتخاب‌های شما</p><h1>سبد خرید</h1><p className="muted">حجم و تعداد انتخاب‌ها را پیش از ادامه بررسی کنید.</p></div><CartPageContent /></main>; }
