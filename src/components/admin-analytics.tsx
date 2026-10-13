"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import type { AnalyticsPeriodDto } from "@/contracts/analytics";
import { isoDateToJalali } from "@/lib/report-calendar";
import { ApiError, date, Loading, Notice } from "./commerce-client";
import { useAdmin } from "./admin-shell";
import { adminAuth } from "./auth-clients";
import { pageQuery } from "./catalog-query";
import { reportRange, reportUnits } from "./report-ui";
import { usePagedData } from "./use-paged-data";

export function AdminAnalytics() {
  const session = useAdmin(), native = adminAuth.useSession();
  if (native.isPending || native.isRefetching) return <Loading label="در حال بررسی حساب مدیریت…" />;
  if (native.error || !native.data?.user || native.data.user.id !== session?.user.id) return <Notice error>حساب مدیریت نیازمند بررسی دوباره است. <Link href="/admin/login" className="text-link">ورود دوباره به مدیریت</Link></Notice>;
  // The server-provided permission list is authoritative; do not infer from a role name.
  // A string set also permits the isolated panel before the shared union is integrated.
  if (!session?.mfaVerified || !new Set<string>(session.permissions ?? []).has("analytics.read")) return <Notice error>اجازهٔ مشاهدهٔ آمار فعالیت را ندارید.</Notice>;
  return <AnalyticsAccess key={session.user.id} />;
}
function AnalyticsAccess() {
  const router = useRouter(), [denied, setDenied] = useState(false);
  const onError = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setDenied(true); router.replace("/admin/login"); }
  }, [router]);
  if (denied) return <Notice error>دسترسی آمار تغییر کرده است. دوباره وارد مدیریت شوید.</Notice>;
  return <AnalyticsDashboard onError={onError} />;
}
function AnalyticsDateFilters({ from: appliedFrom, to: appliedTo, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const prefix = useId(), summary = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(appliedFrom), [to, setTo] = useState(appliedTo), [validation, setValidation] = useState<Record<string, string> | null>(null);
  const fields = validation ?? reportRange(appliedFrom, appliedTo).fields;
  const apply = () => { const range = reportRange(from, to); setValidation(range.fields); if (!range.valid) { requestAnimationFrame(() => summary.current?.focus()); return; } onApply(range.visible.from, range.visible.to); };
  return <section aria-labelledby={`${prefix}-heading`}><h2 id={`${prefix}-heading`}>بازهٔ آمار فعالیت</h2><p className="helper">تاریخ‌ها جلالی و زمان بر اساس تهران است؛ هر دو روز انتخاب‌شده حساب می‌شوند و بازه از ۱ تا ۳۶۶ روز است. تاریخ آغاز خالی، ۳۰ روز منتهی به پایان را انتخاب می‌کند؛ تاریخ پایان خالی، امروز تهران است.</p>
    {Object.keys(fields).length > 0 && <Notice error ref={summary} tabIndex={-1}><p>تاریخ‌های مشخص‌شده را اصلاح کنید. فیلتر تازه اعمال نشده است.</p><ul>{Object.entries(fields).map(([path, message]) => <li key={path}><a href={`#${prefix}-${path}`}>{message}</a></li>)}</ul></Notice>}
    <form className="toolbar" onSubmit={event => { event.preventDefault(); apply(); }} noValidate>{(["from", "to"] as const).map(path => <div className="field" key={path}><label htmlFor={`${prefix}-${path}`}>{path === "from" ? "از تاریخ" : "تا پایان تاریخ"}</label><input id={`${prefix}-${path}`} dir="ltr" inputMode="text" maxLength={30} placeholder="۱۴۰۵/۰۷/۲۰" value={path === "from" ? from : to} onChange={event => { (path === "from" ? setFrom : setTo)(event.target.value); setValidation(null); }} aria-invalid={!!fields[path]} aria-describedby={fields[path] ? `${prefix}-${path}-error` : undefined} />{fields[path] && <p id={`${prefix}-${path}-error`} className="field-error">{fields[path]}</p>}</div>)}<button className="secondary">نمایش آمار</button><button type="button" className="text-button" onClick={() => onApply("", "")}>بازهٔ پیش‌فرض ۳۰ روز</button></form>
  </section>;
}
function AnalyticsDashboard({ onError }: { onError: (failure: unknown) => void }) {
  const params = useSearchParams(), router = useRouter();
  const from = params.get("from") ?? "", to = params.get("to") ?? "", range = reportRange(from, to);
  const report = usePagedData<AnalyticsPeriodDto>("/api/admin/analytics/period", pageQuery(range.values), range.valid, onError);
  const apply = (nextFrom: string, nextTo: string) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of [["from", nextFrom], ["to", nextTo]] as const) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`/admin/analytics${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  };
  return <><div className="section-heading"><h1>آمار فعالیت فروشگاه</h1><button className="secondary" onClick={report.reload}>دریافت دوبارهٔ آمار</button></div><AnalyticsDateFilters key={`${from}|${to}`} from={from} to={to} onApply={apply} />
    {!range.valid ? <Notice silent>برای دریافت آمار، تاریخ‌های بالا را اصلاح کنید.</Notice> : report.error ? <Notice error><p>آمار دریافت نشد. {report.error}</p><button className="secondary" onClick={report.reload}>تلاش دوبارهٔ آمار</button></Notice> : !report.data ? <Loading label="در حال دریافت آمار…" /> : <AnalyticsPeriod report={report.data} />}
  </>;
}
function Counts({ values }: { values: { label: string; value: string }[] }) {
  return <div className="metric-grid">{values.map(metric => <div className="metric" key={metric.label}><p>{metric.label}</p><strong><bdi>{reportUnits(metric.value)}</bdi></strong></div>)}</div>;
}
function AnalyticsPeriod({ report }: { report: AnalyticsPeriodDto }) {
  const prefix = useId(), coverage = report.coverage;
  const observedCounts = [report.observed.productView, report.observed.search, report.observed.addToCart, report.observed.zeroResultSearch];
  return <><p className="helper" role="status">بازهٔ نمایش‌داده‌شده: <bdi>{isoDateToJalali(report.period.fromDate)}</bdi> تا پایان <bdi>{isoDateToJalali(report.period.toDate)}</bdi> · تهران</p>
    <section className="form-section" aria-labelledby={`${prefix}-observed`}><h2 id={`${prefix}-observed`}>مشاهده‌های بی‌نام مرورگر؛ آمار تقریبی</h2><p className="helper">این شمارها از رویدادهای مرورگر به‌دست می‌آیند و ممکن است ارسال نشوند یا دستکاری شوند. تعداد افراد یا خرید تأییدشده نیستند؛ میزان نرسیدن پیام‌ها اندازه‌گیری نشده است.</p>
      {!coverage.captureEnabled && <Notice silent>ثبت مشاهده‌های مرورگر در حال حاضر غیرفعال است. آمار قبلی، در صورت وجود، همچنان در محدودهٔ نگهداری نمایش داده می‌شود.</Notice>}
      {coverage.partialRetention && <Notice silent>آمار مشاهده‌های مرورگر تمام بازهٔ انتخاب‌شده را پوشش نمی‌دهد. بازه می‌تواند از زمان آغاز ثبت یا نگهداری داده‌ها فراتر باشد یا هنوز به پایان نرسیده باشد.</Notice>}
      {observedCounts.every(value => BigInt(value) === 0n) && <p>شمار مشاهده‌های ثبت‌شده در این بازه صفر است؛ این مقدار نبود بازدید یا فعالیت فروشگاه را ثابت نمی‌کند.</p>}
      <Counts values={[{ label: "مشاهده‌های محصول ثبت‌شده", value: report.observed.productView }, { label: "جست‌وجوهای ثبت‌شده", value: report.observed.search }, { label: "افزودن به سبد ثبت‌شده در مرورگر", value: report.observed.addToCart }, { label: "جست‌وجوهای ثبت‌شده با نتیجهٔ صفر", value: report.observed.zeroResultSearch }]} />
      <dl className="key-values"><div><dt>نگهداری آمار مرورگر</dt><dd>۳۰ روز</dd></div><div><dt>آغاز دادهٔ قابل نگهداری</dt><dd>{coverage.retainedFrom ? date(coverage.retainedFrom) : "زمان ثبت‌شده‌ای در دسترس نیست."}</dd></div><div><dt>نخستین مشاهدهٔ ثبت‌شده در بازه</dt><dd>{coverage.observedFrom ? date(coverage.observedFrom) : "مشاهده‌ای در این بازه ثبت نشده است."}</dd></div><div><dt>آخرین مشاهدهٔ ثبت‌شده در بازه</dt><dd>{coverage.observedTo ? date(coverage.observedTo) : "مشاهده‌ای در این بازه ثبت نشده است."}</dd></div><div><dt>آخرین پاک‌سازی ثبت‌شده</dt><dd>{coverage.lastCleanupUtc ? date(coverage.lastCleanupUtc) : "زمان ثبت‌شده‌ای در دسترس نیست."}</dd></div></dl>
      {coverage.productDimensionsTruncated && <p className="helper">ثبت جزئیات برخی محصولات محدود شده است. این صفحه شمار کلی را نشان می‌دهد و تفکیک محصول ارائه نمی‌کند.</p>}{coverage.cleanupPending && <p className="helper">دادهٔ منقضی‌شده برای پاک‌سازی باقی مانده است. آمار این بخش فقط از پنجرهٔ نگهداری خوانده می‌شود.</p>}
    </section>
    <section className="form-section" aria-labelledby={`${prefix}-server`}><h2 id={`${prefix}-server`}>فعالیت‌های ثبت‌شدهٔ سفارش در بازه</h2><p className="helper">این شمارها از سوابق سفارش، دریافت تأییدشده و تحویل ثبت‌شده خوانده می‌شوند. دریافت‌ها شامل دریافت اصلی، اضافه و دریافت با مشکل تأمین‌اند؛ بازپرداخت بعدی، ثبت اولیهٔ دریافت را حذف نمی‌کند. این بخش مبلغ یا درآمد فروشگاه نیست و فعالیت‌هایش لزوماً متعلق به یک گروه مشترک از سفارش‌ها نیستند.</p><Counts values={[{ label: "سفارش‌های آغازشده در بازه", value: report.server.checkoutStarted }, { label: "دریافت‌های تأییدشده در بازه", value: report.server.verifiedReceipts }, { label: "سفارش‌های دارای دریافت اصلی در بازه", value: report.server.primaryPaidOrders }, { label: "سفارش‌های دارای تحویل ثبت‌شده در بازه", value: report.server.completedOrders }]} /></section>
    <section className="form-section" aria-labelledby={`${prefix}-cohort`}><h2 id={`${prefix}-cohort`}>سرانجام سفارش‌های آغازشده در بازه</h2><p className="helper">فقط سفارش‌هایی در این گروه‌اند که ایجاد آن‌ها در بازهٔ انتخاب‌شده ثبت شده است. دریافت اصلی یا تحویل می‌تواند پس از پایان بازه رخ داده باشد؛ وضعیت تا زمان گزارش خوانده می‌شود. این گروه به مشاهده‌های بی‌نام مرورگر وصل نیست و تعداد افراد را نشان نمی‌دهد.</p><p className="small">زمان گزارش: <bdi>{date(report.cohort.asOf)}</bdi> · تهران</p><Counts values={[{ label: "سفارش‌های آغازشدهٔ این گروه", value: report.cohort.started }, { label: "این گروه با دریافت اصلی تا زمان گزارش", value: report.cohort.primaryPaid }, { label: "این گروه با تحویل ثبت‌شده تا زمان گزارش", value: report.cohort.delivered }]} /></section>
  </>;
}
