"use client";
import { useEffect, useRef, useState } from "react";
import { customerAuth } from "./auth-clients";
import { authMessage, canonicalPhone, digits, errorMessage, faNumber, Notice } from "./commerce-client";

export function PhoneVerification({ onVerified, checkout = false }: { onVerified: () => void; checkout?: boolean }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (!wait && !remaining) return; const timer = setTimeout(() => { setWait(Math.max(0, wait - 1)); setRemaining(Math.max(0, remaining - 1)); }, 1000); return () => clearTimeout(timer); }, [wait, remaining]);
  const send = async () => { setError(""); const canonical = canonicalPhone(phone); if (!/^\+989\d{9}$/.test(canonical)) { setError("شمارهٔ همراه ایران را با صفر اول یا ‎+۹۸ وارد کنید."); return; } setBusy(true); try { const result = await customerAuth.phoneNumber.sendOtp({ phoneNumber: canonical }); if (result.error) throw new Error(authMessage(result.error)); setSent(true); setWait(60); setRemaining(180); setCode(""); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const verify = async () => { setError(""); if (!remaining) { setError("کد تأیید منقضی شده است. دوباره درخواست کد بدهید."); return; } if (!/^\d{6}$/.test(digits(code))) { setError("کد تأیید شش‌رقمی را وارد کنید."); return; } setBusy(true); try { const result = await customerAuth.phoneNumber.verify({ phoneNumber: canonicalPhone(phone), code: digits(code), disableSession: false }); if (result.error) throw new Error(authMessage(result.error)); setCode(""); onVerified(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const masked = canonicalPhone(phone).slice(0, 6) + "•••" + canonicalPhone(phone).slice(-3);
  return <form className="phone-form" onSubmit={e => { e.preventDefault(); if (sent) verify(); else send(); }}><h2>{checkout ? "تأیید شمارهٔ خریدار" : "ورود با شمارهٔ همراه"}</h2><p className="muted small">{checkout ? "برای پیگیری امن سفارش، شمارهٔ همراه خریدار را تأیید کنید. شمارهٔ گیرنده می‌تواند متفاوت باشد." : "کد تأیید شمارهٔ همراه، دسترسی امن به حساب و سفارش‌های شما را فراهم می‌کند."}</p>{error && <Notice error id="phone-errors" ref={errorRef} tabIndex={-1}>{error}</Notice>}{!sent ? <><label htmlFor="purchaser-phone">{checkout ? "شمارهٔ همراه خریدار" : "شمارهٔ همراه"}</label><input id="purchaser-phone" name="phone" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "phone-errors phone-help" : "phone-help"} required /><p id="phone-help" className="helper">برای نمونه با قالب ۰۹… وارد کنید.</p><button disabled={busy}>{busy ? "در حال ارسال کد…" : "دریافت کد تأیید"}</button></> : <><p>کد برای <bdi dir="ltr">{masked}</bdi> درخواست شد.</p><label htmlFor="verification-code">کد تأیید را وارد کنید.</label><input id="verification-code" aria-invalid={!!error} aria-describedby={error ? "phone-errors" : undefined} dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9۰-۹٠-٩]{6}" value={code} onChange={e => setCode(e.target.value)} maxLength={6} required /><p className="helper">{remaining ? `اعتبار کد: ${faNumber(remaining)} ثانیه` : "مهلت کد پایان یافته است. کد تازه درخواست کنید."}</p><div className="actions"><button disabled={busy}>{busy ? "در حال تأیید…" : "تأیید شماره"}</button><button type="button" className="text-button" disabled={busy || wait > 0} onClick={send}>{wait ? `ارسال دوباره پس از ${faNumber(wait)} ثانیه` : "ارسال دوبارهٔ کد"}</button><button type="button" className="text-button" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>ویرایش شماره</button></div></>}</form>;
}
