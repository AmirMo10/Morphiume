"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import type { CartDto, MoneyDto } from "@/contracts/commerce";
import { formatToman } from "@/lib/money";
import { normalizeDigits, normalizePhone } from "@/lib/persian";
import { statusLabel, type StatusContext } from "@/lib/fa-copy/status";
import { CustomerSessionProvider, denyCustomerPrivateState, useCustomerSession } from "./customer-session";

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public fields?: Record<string, string>) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...options.headers } });
  let payload: { data?: T; error?: { code?: string; message?: string; fields?: Record<string, string> | { path: string; message: string }[] } };
  try { payload = await response.json(); } catch { throw new ApiError("پاسخ سرور خوانده نشد. دوباره تلاش کنید.", "NETWORK", response.status); }
  if (options.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  if (!response.ok || payload.error) {
    if ([401,403].includes(response.status) && /^\/api\/(?:orders|addresses|wishlist|notifications|cart|checkout)(?:\/|$)/.test(path)) denyCustomerPrivateState();
    const fields = Array.isArray(payload.error?.fields) ? Object.fromEntries(payload.error.fields.map(field => [field.path.replace(/^address\./, "").replace(/^variants\.(\d+)\.(\w+)$/, "$2-$1"), field.message])) : payload.error?.fields;
    throw new ApiError(payload.error?.message || "درخواست انجام نشد. دوباره تلاش کنید.", payload.error?.code || "UNKNOWN", response.status, fields);
  }
  return payload.data as T;
}
export const digits = normalizeDigits;
export function canonicalPhone(value: string) {
  try { return normalizePhone(value); } catch { return digits(value).replace(/[\s()-]/g, ""); }
}
export { faNumber } from "./number-format";
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
type CartContextValue = { cart: CartDto | null; refreshCart: () => Promise<CartDto>; announce: (message: string) => void; notice: string; ready: boolean; error: string; continuityCartId: string | null };
const CartContext = createContext<CartContextValue | null>(null);
export function CommerceProvider({ children }: { children: ReactNode }) {
  return <CustomerSessionProvider><CartProvider>{children}</CartProvider></CustomerSessionProvider>;
}
function CartProvider({ children }: { children: ReactNode }) {
  const identity = useCustomerSession();
  type Snapshot = { ownerId: string | null; generation: number; cart: CartDto; scopeKey: string };
  const [state,setState] = useState<{ snapshot: Snapshot | null; error: string; ready: boolean; scopeKey?: string }>({snapshot:null,error:"",ready:false});
  const current = useRef<Snapshot | null>(null), request = useRef<AbortController | null>(null), sequence = useRef(0);
  const [notice, setNotice] = useState({ id: 0, message: "", scopeKey: "" });
  const announce = useCallback((message: string) => setNotice(previous => ({ id: previous.id + 1, message, scopeKey:identity.scopeKey })), [identity.scopeKey]);
  const refreshCart = useCallback(async () => {
    if (identity.pending) throw new ApiError("ابتدا بررسی حساب را کامل کنید.","UNAUTHENTICATED",401);
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const ticket = ++sequence.current;
    try {
      const previous = current.current;
      const sameGuestClaim = identity.ownerId && previous?.ownerId === null && previous.generation === identity.generation;
      let result = sameGuestClaim ? previous.cart : await api<CartDto>("/api/cart",{signal:controller.signal});
      if (identity.ownerId) result = await api<CartDto>("/api/cart/claim",{method:"POST",body:JSON.stringify({cartId:result.id,expectedVersion:result.version}),signal:controller.signal});
      if (ticket !== sequence.current || controller.signal.aborted) throw new DOMException("Stale cart response","AbortError");
      const snapshot: Snapshot = {ownerId:identity.ownerId,generation:identity.generation,scopeKey:identity.scopeKey,cart:result}; current.current = snapshot; setState({snapshot,error:"",ready:true,scopeKey:identity.scopeKey}); return result;
    } catch (error) {
      if (ticket === sequence.current && !controller.signal.aborted) { current.current = null; setState({snapshot:null,error:errorMessage(error),ready:false,scopeKey:identity.scopeKey}); }
      throw error;
    }
  },[identity.pending,identity.ownerId,identity.scopeKey,identity.generation]);
  const cancelRequests = useCallback(() => { sequence.current++; request.current?.abort(); },[]);
  useEffect(() => {
    if (!identity.pending) void refreshCart().catch(() => {});
    return cancelRequests;
  },[identity.pending,refreshCart,cancelRequests]);
  const snapshot = state.snapshot;
  const compatible = snapshot?.scopeKey === identity.scopeKey || (identity.ownerId !== null && snapshot?.ownerId === null && snapshot.generation === identity.generation);
  const cart = !identity.pending && compatible ? snapshot?.cart ?? null : null;
  const ready = !identity.pending && snapshot?.scopeKey === identity.scopeKey && state.ready;
  const visibleNotice = !identity.pending && notice.scopeKey === identity.scopeKey ? notice.message : "";
  return <CartContext.Provider value={{cart,refreshCart,announce,notice:visibleNotice,ready,error:identity.pending || state.scopeKey !== identity.scopeKey ? "" : state.error,continuityCartId:compatible ? snapshot?.cart.id ?? null : null}}>{children}<div className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={notice.id}>{visibleNotice}</span></div></CartContext.Provider>;
}
export function useCommerce() { const value = useContext(CartContext); if (!value) throw new Error("CommerceProvider required"); return value; }
export function Notice({ children, error = false, silent = false, id, ref, tabIndex }: { children: ReactNode; error?: boolean; silent?: boolean; id?: string; ref?: Ref<HTMLDivElement>; tabIndex?: number }) { return <div ref={ref} id={id} tabIndex={tabIndex} className={error ? "notice error" : "notice"} role={silent ? undefined : error ? "alert" : "status"}>{children}</div>; }
export function Loading({ label = "در حال دریافت اطلاعات…" }: { label?: string }) { return <div className="loading" role="status"><span className="loading-line" aria-hidden="true" /><p>{label}</p></div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><h2>{title}</h2>{children}</div>; }
