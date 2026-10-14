import Link from "next/link";
import { faNumber } from "./number-format";

export function PurchaseProgress({ current }: { current: "cart" | "address" | "review" | "payment" }) {
  const steps = [{ key: "cart", label: "بررسی سبد" }, { key: "address", label: "گیرنده و نشانی" }, { key: "review", label: "ارسال و جمع‌بندی" }, { key: "payment", label: "پرداخت" }];
  const active = steps.findIndex(step => step.key === current);
  return <ol className="checkout-steps sf-purchase-progress" aria-label="مراحل خرید">{steps.map((step, index) => <li key={step.key} className={index === active ? "active" : index < active ? "complete" : ""} aria-current={index === active ? "step" : undefined}><span className="sf-step-number" aria-hidden="true">{index < active ? "✓" : faNumber(index + 1)}</span>{step.key === "cart" && current !== "cart" ? <Link href="/cart">{step.label}</Link> : <span>{step.label}</span>}</li>)}</ol>;
}
