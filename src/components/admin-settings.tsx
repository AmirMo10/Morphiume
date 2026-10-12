"use client";
import { useEffect, useState } from "react";
import { api, errorMessage, Loading, Notice } from "./commerce-client";
type StoreSettings = { brandName: string; contactPhone: string | null; email: string | null; address: string | null; shippingDescription: string | null; policyVersion: string; version?: number; [key: string]: unknown };
const fields = [{ key: "contactPhone", label: "تلفن تماس", ltr: true }, { key: "email", label: "ایمیل تماس", ltr: true }, { key: "address", label: "نشانی فروشگاه", multiline: true }, { key: "shippingDescription", label: "شرح تأییدشدهٔ ارسال", multiline: true }, { key: "policyVersion", label: "نسخهٔ شرایط خرید", ltr: true }] as const;
export function AdminSettings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { api<StoreSettings>("/api/admin/settings").then(s => { setSettings(s); setForm(Object.fromEntries(fields.map(f => [f.key, String(s[f.key] ?? "")]))); }).catch(e => setError(errorMessage(e))); }, []);
  const save = async () => { if (!settings) return; setBusy(true); setError(""); setNotice(""); try { const result = await api<StoreSettings>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ...form, ...("version" in settings ? { expectedVersion: settings.version } : {}) }) }); setSettings(result); setNotice("تنظیمات ذخیره شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  if (!settings) return error ? <Notice error>{error}</Notice> : <Loading />;
  return <><h1>تنظیمات فروشگاه</h1><Notice>اطلاعات نامعلوم را خالی بگذارید. تغییر اطلاعات تماس و شرایط خدمات فقط با دادهٔ تأییدشده انجام شود.</Notice>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}<form onSubmit={e => { e.preventDefault(); save(); }}><div className="form-grid"><div><label htmlFor="setting-brand">نام برند</label><input id="setting-brand" value="Morphiume" readOnly dir="ltr" /></div>{fields.map(field => <div className={"multiline" in field ? "span-full" : ""} key={field.key}><label htmlFor={`setting-${field.key}`}>{field.label}</label>{"multiline" in field ? <textarea id={`setting-${field.key}`} rows={3} value={form[field.key] ?? ""} onChange={e => setForm({ ...form, [field.key]: e.target.value })} /> : <input id={`setting-${field.key}`} dir={"ltr" in field ? "ltr" : "rtl"} readOnly={field.key === "policyVersion"} value={form[field.key] ?? ""} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />}</div>)}</div><div className="actions"><button disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}</button></div></form></>;
}
