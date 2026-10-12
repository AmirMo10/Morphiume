"use client";
import { useId, useRef, useState } from "react";
import { adminAuth } from "./auth-clients";
import { authMessage, digits, errorMessage, Notice } from "./commerce-client";
export function AdminReauthentication({ onSuccess, label = "کد رمزساز برای تأیید دوباره" }: { onSuccess?: () => void; label?: string }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const verify = async () => { setBusy(true); setError(""); try { const result = await adminAuth.twoFactor.verifyTotp({ code: digits(code), trustDevice: false }); if (result.error) throw new Error(authMessage(result.error)); setCode(""); setVerified(true); onSuccess?.(); } catch (e) { setError(errorMessage(e)); input.current?.focus(); } finally { setBusy(false); } };
  return <section className="reauth-panel"><h3>تأیید دوباره برای عملیات حساس</h3><p className="helper">پیش از ثبت عملیات حساس، کد تازهٔ رمزساز را وارد کنید. سرور اعتبار این تأیید را بررسی می‌کند.</p>{error && <Notice error id={`${id}-error`}>{error}</Notice>}{verified && <Notice>کد تأیید شد. عملیات را ثبت کنید؛ اگر تأیید منقضی شد، کد تازه را دوباره وارد کنید.</Notice>}<div className="inline-control"><label className="sr-only" htmlFor={`${id}-code`}>{label}</label><input ref={input} id={`${id}-code`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} /><button className="secondary" type="button" disabled={busy || digits(code).length !== 6} onClick={verify}>{busy ? "در حال تأیید…" : "تأیید دوباره"}</button></div></section>;
}
