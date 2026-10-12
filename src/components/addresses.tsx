"use client";
import { useEffect, useState } from "react";
import { LocationInput } from "./location-input";
import type { AddressInput } from "@/contracts/commerce";
import { api, canonicalPhone, digits, errorMessage, Loading, Notice } from "./commerce-client";
type SavedAddress = AddressInput & { id: string };
const blank: AddressInput = { recipient: "", phone: "", province: "", city: "", address: "", plaque: "", unit: "", postalCode: "" };
const fields: { key: keyof AddressInput; label: string; numeric?: boolean }[] = [{ key: "recipient", label: "نام گیرنده" }, { key: "phone", label: "شمارهٔ تماس گیرنده", numeric: true }, { key: "province", label: "استان" }, { key: "city", label: "شهر" }, { key: "address", label: "نشانی کامل" }, { key: "plaque", label: "پلاک", numeric: true }, { key: "unit", label: "واحد (اختیاری)", numeric: true }, { key: "postalCode", label: "کدپستی ده‌رقمی", numeric: true }];
export function SavedAddressPicker({ onSelect }: { onSelect: (address: AddressInput) => void }) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  useEffect(() => { api<SavedAddress[]>("/api/addresses").then(setAddresses).catch(() => {}); }, []);
  return addresses.length ? <div className="saved-address-picker"><label htmlFor="saved-address">انتخاب از نشانی‌های ذخیره‌شده (اختیاری)</label><select id="saved-address" defaultValue="" onChange={e => { const selected = addresses.find(a => a.id === e.target.value); if (selected) { const { id: omitted, ...address } = selected; void omitted; onSelect(address); } }}><option value="">نشانی تازه را وارد می‌کنم</option>{addresses.map(a => <option value={a.id} key={a.id}>{a.recipient} · {a.city} · {a.address}</option>)}</select><p className="helper">انتخاب نشانی، اطلاعات فرم فعلی را جایگزین می‌کند.</p></div> : null;
}
export function AddressBook() {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [address, setAddress] = useState<AddressInput>(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const load = () => api<SavedAddress[]>("/api/addresses").then(setAddresses).catch(e => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);
  const save = async () => { if (!/^\+989\d{9}$/.test(canonicalPhone(address.phone)) || !/^\d{10}$/.test(digits(address.postalCode))) { setError("شمارهٔ تماس و کدپستی ده‌رقمی را بررسی کنید."); return; } setBusy(true); setError(""); try { await api("/api/addresses", { method: "POST", body: JSON.stringify({ ...address, ...(editingId ? { id: editingId } : {}), phone: canonicalPhone(address.phone), postalCode: digits(address.postalCode), plaque: digits(address.plaque), unit: digits(address.unit ?? "") }) }); setAddress(blank); setEditingId(null); await load(); setNotice("نشانی ذخیره شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const remove = async (id: string) => { setBusy(true); setError(""); try { await api(`/api/addresses/${id}`, { method: "DELETE" }); await load(); setNotice("نشانی حذف شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <><h2>نشانی‌های شما</h2>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{!addresses ? <Loading /> : addresses.length ? addresses.map(a => <section className="order-panel" key={a.id}><h3>{a.recipient}</h3><p>{a.province}، {a.city}، {a.address}، پلاک {a.plaque}{a.unit ? `، واحد ${a.unit}` : ""}</p><p><bdi dir="ltr">{a.phone}</bdi> · کدپستی <bdi>{a.postalCode}</bdi></p><button className="text-button" disabled={busy} onClick={() => { setEditingId(a.id); const { id: omitted, ...saved } = a; void omitted; setAddress(saved); }}>ویرایش نشانی</button><button className="text-button danger" disabled={busy} onClick={() => remove(a.id)}>حذف نشانی</button></section>) : <p className="muted">هنوز نشانی ذخیره نشده است.</p>}<section className="form-section"><h2>{editingId ? "ویرایش نشانی" : "نشانی جدید"}</h2><form onSubmit={e => { e.preventDefault(); save(); }}><div className="form-grid">{fields.map(f => <div className={f.key === "address" ? "span-full" : ""} key={f.key}><label htmlFor={`saved-${f.key}`}>{f.label}</label>{f.key === "province" || f.key === "city" ? <LocationInput id={`saved-${f.key}`} kind={f.key} value={address[f.key]} province={address.province} onChange={value => setAddress(previous => ({ ...previous, [f.key]: value, ...(f.key === "province" ? { city: "" } : {}) }))} /> : <input id={`saved-${f.key}`} dir={f.numeric ? "ltr" : "rtl"} type={f.key === "phone" ? "tel" : "text"} inputMode={f.key === "phone" ? "tel" : f.numeric ? "numeric" : "text"} value={address[f.key] ?? ""} onChange={e => setAddress({ ...address, [f.key]: e.target.value, ...(f.key === "province" ? { city: "" } : {}) })} required={f.key !== "unit"} />}</div>)}</div><div className="actions"><button disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیرهٔ نشانی"}</button>{editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setAddress(blank); }}>ساخت نشانی تازه</button>}</div></form></section></>;
}
