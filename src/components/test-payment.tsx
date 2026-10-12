"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MoneyDto } from "@/contracts/commerce";
import { api, errorMessage, labelStatus, Loading, money, Notice } from "./commerce-client";
type TestAttempt = { authority: string; orderId: string; total: MoneyDto; status: string };
export function TestPayment({ authority }: { authority: string }) {
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = `/api/test/payments/${encodeURIComponent(authority)}`;
  useEffect(() => { api<TestAttempt>(path).then(setAttempt).catch(e => setError(errorMessage(e))); }, [path]);
  const decide = async (outcome: "succeeded" | "failed" | "unknown") => { setBusy(true); setError(""); try { const result = await api<{ orderId: string; paymentStatus: string; redirectUrl: string }>(path, { method: "POST", body: JSON.stringify({ outcome }) }); window.location.assign(result.redirectUrl); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <><p className="eyebrow">آزمایش کنترل‌شده</p><h1>پرداخت آزمایشی</h1><Notice>این صفحه فقط برای محیط آزمایشی است. هیچ پولی جابه‌جا نمی‌شود. نتیجه توسط سرور ثبت و بررسی می‌شود.</Notice>{error && <Notice error>{error}</Notice>}{attempt ? <><p className="product-price">{money(attempt.total)}</p><p>وضعیت تلاش: {labelStatus(attempt.status)}</p><div className="actions"><button disabled={busy} onClick={() => decide("succeeded")}>ثبت نتیجهٔ موفق آزمایشی</button><button className="secondary" disabled={busy} onClick={() => decide("failed")}>ثبت نتیجهٔ ناموفق</button><button className="secondary" disabled={busy} onClick={() => decide("unknown")}>آزمایش وضعیت نامشخص</button></div><p className="helper">نتیجهٔ موفق فقط پس از بررسی و ثبت اثر سفارش در سرور نمایش داده می‌شود.</p><Link href={`/orders/${attempt.orderId}`} className="text-link">بازگشت و بررسی سفارش</Link></> : !error && <Loading />}</>;
}
