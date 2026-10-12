"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminAuth } from "./auth-clients";
import { api, authMessage, digits, errorMessage, Notice } from "./commerce-client";
import type { AdminSession } from "./admin-shell";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"login" | "setup" | "totp">("login");
  const [totpURI, setTotpURI] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const login = async () => { setBusy(true); setError(""); try { const result = await adminAuth.signIn.email({ email: email.trim(), password, rememberMe: false }); if (result.error) throw new Error(authMessage(result.error)); if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) { setStep("totp"); setPassword(""); return; } const session = await api<AdminSession>("/api/admin/session"); if (session.mfaVerified) { setPassword(""); router.replace("/admin"); } else setStep("setup"); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const setup = async () => { setBusy(true); setError(""); try { const result = await adminAuth.twoFactor.enable({ password, method: "totp", issuer: "Morphiume" }); if (result.error) throw new Error(authMessage(result.error)); if (result.data && "totpURI" in result.data) { setTotpURI(result.data.totpURI); setBackups(result.data.backupCodes); setStep("totp"); setPassword(""); } } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); setError(""); try { const result = await adminAuth.twoFactor.verifyTotp({ code: digits(code), trustDevice: false }); if (result.error) throw new Error(authMessage(result.error)); const session = await api<AdminSession>("/api/admin/session"); if (!session.mfaVerified) throw new Error("دسترسی مدیریت هنوز تأیید نشده است. دوباره وارد شوید."); setCode(""); setTotpURI(""); setBackups([]); router.replace("/admin"); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const secret = totpURI ? new URL(totpURI).searchParams.get("secret") : "";
  return <main id="main" className="page auth-page"><p className="eyebrow">Morphiume / مدیریت</p><h1>ورود به پنل مدیریت</h1><p className="muted">دسترسی مدیریت با رمز عبور و کد تأیید دومرحله‌ای انجام می‌شود.</p>{error && <Notice error id="admin-login-errors" ref={errorRef} tabIndex={-1}>{error}</Notice>}<form onSubmit={e => { e.preventDefault(); if (step === "login") login(); else if (step === "setup") setup(); else verify(); }}>{step === "login" ? <><label htmlFor="admin-email">ایمیل مدیر</label><input id="admin-email" type="email" dir="ltr" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /><label htmlFor="admin-password">رمز عبور</label><input id="admin-password" aria-invalid={!!error} aria-describedby={error ? "admin-login-errors" : undefined} type="password" dir="ltr" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button className="full-width" disabled={busy}>{busy ? "در حال بررسی…" : "ورود و ادامه"}</button></> : step === "setup" ? <><h2>راه‌اندازی تأیید دومرحله‌ای</h2><p>برای نخستین ورود، برنامهٔ رمزساز را به حساب خود متصل کنید.</p><label htmlFor="setup-password">رمز عبور برای فعال‌سازی</label><input id="setup-password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button disabled={busy}>{busy ? "در حال راه‌اندازی…" : "ساخت کلید رمزساز"}</button></> : <>{totpURI && <div className="totp-setup"><h2>افزودن به برنامهٔ رمزساز</h2><p>در برنامهٔ رمزساز، افزودن دستی حساب را انتخاب کنید. نام حساب را Morphiume و کلید را مقدار زیر قرار دهید.</p><label htmlFor="totp-secret">کلید حساب</label><input id="totp-secret" dir="ltr" value={secret ?? ""} readOnly /><details><summary>نمایش پیوند تنظیم رمزساز</summary><p className="break-all" dir="ltr">{totpURI}</p></details><details><summary>کدهای بازیابی — در جای امن نگه دارید.</summary><ul className="backup-codes" dir="ltr">{backups.map(backup => <li key={backup}>{backup}</li>)}</ul></details></div>}<label htmlFor="admin-totp">کد شش‌رقمی برنامهٔ رمزساز</label><input id="admin-totp" aria-invalid={!!error} aria-describedby={error ? "admin-login-errors" : undefined} dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} maxLength={6} required /><button className="full-width" disabled={busy}>{busy ? "در حال تأیید…" : "تأیید و ورود به مدیریت"}</button></>}</form></main>;
}
