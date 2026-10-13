"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAdmin } from "./admin-shell";
import { adminAuth } from "./auth-clients";
import { ApiError, Loading, Notice } from "./commerce-client";
import { NotificationInbox } from "./notifications";

export function AdminNotifications() {
  const session = useAdmin(), native = adminAuth.useSession();
  if (native.isPending || native.isRefetching) return <Loading label="در حال بررسی حساب مدیریت…" />;
  if (native.error || !native.data?.user || native.data.user.id !== session?.user.id) return <Notice error>حساب مدیریت نیازمند بررسی دوباره است. <Link href="/admin/login" className="text-link">ورود دوباره به مدیریت</Link></Notice>;
  const allowed = session?.permissions?.includes("orders.fulfill") || session?.permissions?.includes("refunds.write");
  if (!session?.mfaVerified || !allowed) return <Notice error>اجازهٔ مشاهدهٔ اعلان‌های مدیریت را ندارید.</Notice>;
  const permissionScope = ["orders.fulfill", "refunds.write", "orders.read"].map(permission => session.permissions?.some(value => value === permission) === true).join(":");
  return <OperatorInbox key={`${session.user.id}:${permissionScope}`} canOpenOrders={session.permissions?.includes("orders.read") === true} />;
}
function OperatorInbox({ canOpenOrders }: { canOpenOrders: boolean }) {
  const router = useRouter(), [denied, setDenied] = useState(false);
  const onUnauthorized = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setDenied(true); router.replace("/admin/login"); }
  }, [router]);
  if (denied) return <Notice error>دسترسی اعلان‌ها تغییر کرده است. دوباره وارد مدیریت شوید.</Notice>;
  return <><h1>اعلان‌های مدیریت</h1><p className="muted">اعلان‌های قابل دسترس برای حساب مدیریت در این بخش نمایش داده می‌شوند. در محیط آزمایشی، پیامک یا ایمیل ارسال نمی‌شود.</p><NotificationInbox audience="operator" canOpenOrders={canOpenOrders} onUnauthorized={onUnauthorized} /></>;
}
