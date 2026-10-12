"use client";
import { useRef, useState } from "react";
import { adminAuth } from "./auth-clients";
import { authMessage, digits, errorMessage, Notice } from "./commerce-client";
export function AdminReauthentication({ onSuccess }: { onSuccess?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const verify = async () => { setBusy(true); setError(""); try { const result = await adminAuth.twoFactor.verifyTotp({ code: digits(code), trustDevice: false }); if (result.error) throw new Error(authMessage(result.error)); setCode(""); setVerified(true); onSuccess?.(); } catch (e) { setError(errorMessage(e)); input.current?.focus(); } finally { setBusy(false); } };
  return <section className="reauth-panel"><h3>تأیید دوباره برای عملیات حساس</h3><p className="helper">پیش از بازپرداخت یا تغییر دسترسی، کد تازهٔ رمزساز را وارد کنید. سرور اعتبار این تأیید را بررسی می‌کند.</p>{error && <Notice error id="reauth-error">{error}</Notice>}{verified && <Notice>کد تأیید شد. اکنون می‌توانید عملیات موردنظر را ثبت کنید.</Notice>}<div className="inline-control"><label className="sr-only" htmlFor="reauth-code">کد رمزساز برای تأیید دوباره</label><input ref={input} id="reauth-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "reauth-error" : undefined} /><button className="secondary" type="button" disabled={busy || digits(code).length !== 6} onClick={verify}>{busy ? "در حال تأیید…" : "تأیید دوباره"}</button></div></section>;
}
