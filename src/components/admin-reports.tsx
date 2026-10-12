"use client";
import { useEffect, useState } from "react";
import { api, date, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { formatAggregateToman } from "@/lib/money";
import { auditActionLabel, entityTypeLabel, activityReasonLabel } from "@/lib/fa-copy/admin";
type Report = { paidOrders: number; receivedIrr: string; refundedIrr: string; netIrr: string; inventoryUnits: number; activeReservations: number };
type Audit = { id: string; actorId: string | null; action: string; entityType: string; entityId: string; reason: string | null; createdAt: string };
export function AdminReports({ audit = false }: { audit?: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<Audit[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (audit) api<Audit[]>("/api/admin/audit").then(setEntries).catch(e => setError(errorMessage(e))); else api<Report>("/api/admin/reports").then(setReport).catch(e => setError(errorMessage(e))); }, [audit]);
  return <><h1>{audit ? "تاریخچهٔ مدیریت" : "گزارش فروشگاه"}</h1>{error && <Notice error>{error}</Notice>}{audit ? entries ? <div className="table-wrap"><table><caption className="sr-only">رخدادهای ثبت‌شدهٔ مدیریت</caption><thead><tr><th>عملیات</th><th>نوع مورد</th><th>شناسه</th><th>مدیر</th><th>دلیل</th><th>زمان</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><th scope="row">{auditActionLabel(entry.action)}</th><td>{entityTypeLabel(entry.entityType)}</td><td><bdi>{entry.entityId}</bdi></td><td><bdi>{entry.actorId ?? "سامانه"}</bdi></td><td>{activityReasonLabel(entry.reason)}</td><td>{date(entry.createdAt)}</td></tr>)}</tbody></table></div> : <Loading /> : report ? <><p className="muted">اعداد از دریافت‌های تأییدشده و بازپرداخت‌های ثبت‌شدهٔ سرور محاسبه می‌شوند.</p><div className="metric-grid">{[{ label: "سفارش‌های پرداخت‌شده", value: faNumber(report.paidOrders) }, { label: "دریافت تأییدشده", value: formatAggregateToman(report.receivedIrr) }, { label: "بازپرداخت انجام‌شده", value: formatAggregateToman(report.refundedIrr) }, { label: "خالص دریافت", value: formatAggregateToman(report.netIrr) }, { label: "موجودی فیزیکی", value: faNumber(report.inventoryUnits) }, { label: "رزروهای فعال", value: faNumber(report.activeReservations) }].map(metric => <div className="metric" key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong></div>)}</div></> : <Loading />}</>;
}
