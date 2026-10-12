import { CheckoutContent } from "@/components/checkout";
import Link from "next/link";
import { readPresentation } from "../_presentation";
import { maintenanceDefaultMessage } from "@/components/presentation-copy";
export const metadata = { title: "تکمیل خرید", robots: { index: false, follow: false } };
export default async function CheckoutPage() {
  // Layouts persist during navigation; this route independently reads current maintenance state.
  const presentation = await readPresentation();
  return <main id="main" className="page"><div className="page-heading"><h1>تکمیل خرید</h1></div>{presentation.maintenance.enabled ? <section className="empty" aria-labelledby="checkout-paused"><h2 id="checkout-paused">ثبت سفارش تازه موقتاً متوقف است.</h2><p className="plain-copy"><bdi>{presentation.maintenance.message ?? maintenanceDefaultMessage}</bdi></p><div className="actions"><Link className="button" href="/account">حساب کاربری و پیگیری سفارش</Link><Link className="button secondary" href="/cart">بازگشت به سبد خرید</Link></div></section> : <CheckoutContent />}</main>;
}
