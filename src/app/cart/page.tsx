import { CartPageContent } from "@/components/cart";
export const metadata = { title: "سبد خرید", robots: { index: false, follow: false } };
export default function CartPage() { return <main id="main" className="page"><div className="page-heading"><h1>سبد خرید</h1></div><CartPageContent /></main>; }
