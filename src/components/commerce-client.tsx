"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type Ref } from "react";
import type { CartDto, MoneyDto } from "@/contracts/commerce";
import { formatToman } from "@/lib/money";
import { normalizeDigits, normalizePhone } from "@/lib/persian";
import { statusLabel, type StatusContext } from "@/lib/fa-copy/status";

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public fields?: Record<string, string>) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...options.headers } });
  let payload: { data?: T; error?: { code?: string; message?: string; fields?: Record<string, string> | { path: string; message: string }[] } };
  try { payload = await response.json(); } catch { throw new ApiError("پاسخ سرور خوانده نشد. دوباره تلاش کنید.", "NETWORK", response.status); }
  if (!response.ok || payload.error) {
    const fields = Array.isArray(payload.error?.fields) ? Object.fromEntries(payload.error.fields.map(field => [field.path.replace(/^address\./, "").replace(/^variants\.(\d+)\.(\w+)$/, "$2-$1"), field.message])) : payload.error?.fields;
    throw new ApiError(payload.error?.message || "درخواست انجام نشد. دوباره تلاش کنید.", payload.error?.code || "UNKNOWN", response.status, fields);
  }
  return payload.data as T;
}
export const digits = normalizeDigits;
export function canonicalPhone(value: string) {
  try { return normalizePhone(value); } catch { return digits(value).replace(/[\s()-]/g, ""); }
}
export const faNumber = (value: number | string) => new Intl.NumberFormat("fa-IR").format(Number(value));
export function money(value: MoneyDto) {
  return formatToman(value.amountIrr);
}
export function date(value: string) { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value)); }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "درخواست انجام نشد. دوباره تلاش کنید."; }
export function authMessage(error: { code?: string; message?: string } | null | undefined) {
  const messages: Record<string, string> = { INVALID_OTP: "کد تأیید نادرست است.", OTP_EXPIRED: "کد تأیید منقضی شده است. دوباره درخواست کد بدهید.", OTP_HAS_EXPIRED: "کد تأیید منقضی شده است. دوباره درخواست کد بدهید.", INVALID_CODE: "کد تأیید نادرست است.", INVALID_EMAIL_OR_PASSWORD: "ایمیل یا رمز عبور درست نیست.", TOO_MANY_ATTEMPTS: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید.", TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "تعداد تلاش‌ها زیاد است. پس از پایان محدودیت، کد تازه درخواست کنید.", RATE_LIMITED: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.", ACCOUNT_TEMPORARILY_LOCKED: "دسترسی موقتاً محدود شده است. کمی بعد دوباره تلاش کنید.", INVALID_TWO_FACTOR_COOKIE: "مهلت تأیید دومرحله‌ای پایان یافته است. دوباره وارد شوید." };
  return messages[error?.code ?? ""] ?? (/[\u0600-\u06ff]/.test(error?.message ?? "") ? error?.message : "درخواست تأیید انجام نشد. اطلاعات را بررسی کنید و دوباره تلاش کنید.") ?? "درخواست تأیید انجام نشد.";
}
export function labelStatus(value: string, context?: StatusContext) { return statusLabel(value, context); }
type CartContextValue = { cart: CartDto | null; refreshCart: () => Promise<CartDto>; announce: (message: string) => void; notice: string };
const CartContext = createContext<CartContextValue | null>(null);
export function CommerceProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartDto | null>(null);
  const [notice, setNotice] = useState({ id: 0, message: "" });
  const announce = useCallback((message: string) => setNotice(previous => ({ id: previous.id + 1, message })), []);
  const refreshCart = useCallback(async () => { const result = await api<CartDto>("/api/cart"); setCart(result); return result; }, []);
  useEffect(() => { api<CartDto>("/api/cart").then(setCart).catch(() => {}); }, []);
  return <CartContext.Provider value={{ cart, refreshCart, announce, notice: notice.message }}>{children}<div className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={notice.id}>{notice.message}</span></div></CartContext.Provider>;
}
export function useCommerce() { const value = useContext(CartContext); if (!value) throw new Error("CommerceProvider required"); return value; }
export function Notice({ children, error = false, silent = false, id, ref, tabIndex }: { children: ReactNode; error?: boolean; silent?: boolean; id?: string; ref?: Ref<HTMLDivElement>; tabIndex?: number }) { return <div ref={ref} id={id} tabIndex={tabIndex} className={error ? "notice error" : "notice"} role={silent ? undefined : error ? "alert" : "status"}>{children}</div>; }
export function Loading({ label = "در حال دریافت اطلاعات…" }: { label?: string }) { return <div className="loading" role="status"><span className="loading-line" aria-hidden="true" /><p>{label}</p></div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><h2>{title}</h2>{children}</div>; }
