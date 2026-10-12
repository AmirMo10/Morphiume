"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <main id="main" className="page narrow"><h1>نمایش این صفحه انجام نشد.</h1><p>دوباره تلاش کنید. برای بررسی سفارش ثبت‌شده، از بخش پیگیری سفارش استفاده کنید.</p><div className="actions"><button onClick={reset}>تلاش دوباره</button><Link className="button secondary" href="/">صفحهٔ اصلی</Link></div></main>; }
