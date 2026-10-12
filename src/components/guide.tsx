"use client";
import { useEffect, useState } from "react";
import type { ProductDto } from "@/contracts/commerce";
import { api, Empty, errorMessage, faNumber, Loading, Notice } from "./commerce-client";
import { ProductTile } from "./catalog";

export function ScentGuide() {
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [family, setFamily] = useState("");
  const [note, setNote] = useState("");
  const [volume, setVolume] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api<ProductDto[]>("/api/products").then(setProducts).catch(e => setError(errorMessage(e))); }, []);
  if (error) return <Notice error>{error}</Notice>;
  if (!products) return <Loading />;
  if (!products.length) return <Empty title="راهنما با انتشار محصولات فعال می‌شود."><p>پیشنهادها بر اساس اطلاعات واقعی محصولات ساخته می‌شوند.</p></Empty>;
  const families = [...new Set(products.map(p => p.family).filter(Boolean))];
  const notes = [...new Set(products.flatMap(p => [...p.topNotes, ...p.heartNotes, ...p.baseNotes]))];
  const volumes = [...new Set(products.flatMap(p => p.variants.map(v => v.volumeMl)))].sort((a, b) => a - b);
  const matches = products.filter(p => (!family || p.family === family) && (!note || [...p.topNotes, ...p.heartNotes, ...p.baseNotes].includes(note)) && (!volume || p.variants.some(v => v.volumeMl === Number(volume) && v.available > 0)));
  return <><p className="muted">سه انتخاب کوتاه؛ هر گزینه از ویژگی‌های ثبت‌شدهٔ کاتالوگ آمده است. می‌توانید هر انتخاب را آزاد بگذارید.</p><div className="guide-controls">{families.length > 0 && <label>کدام خانوادهٔ رایحه را ترجیح می‌دهید؟<select value={family} onChange={e => setFamily(e.target.value)}><option value="">هنوز مطمئن نیستم</option>{families.map(f => <option key={f}>{f}</option>)}</select></label>}{notes.length > 0 && <label>کدام نت به انتخاب شما نزدیک‌تر است؟<select value={note} onChange={e => setNote(e.target.value)}><option value="">هنوز مطمئن نیستم</option>{notes.map(n => <option key={n}>{n}</option>)}</select></label>}{volumes.length > 0 && <label>چه حجمی را در نظر دارید؟<select value={volume} onChange={e => setVolume(e.target.value)}><option value="">هنوز مطمئن نیستم</option>{volumes.map(v => <option value={v} key={v}>{faNumber(v)} میلی‌لیتر</option>)}</select></label>}</div><div className="result-bar"><p>{faNumber(matches.length)} انتخاب نزدیک</p><button className="text-button" onClick={() => { setFamily(""); setNote(""); setVolume(""); }}>شروع دوباره</button></div>{matches.length ? <div className="product-grid">{matches.map(p => <div key={p.id}><ProductTile product={p} /><p className="helper">{family ? `هم‌خانواده با انتخاب «${family}». ` : ""}{note ? `نت «${note}» در اطلاعات این عطر ثبت شده است. ` : ""}{volume ? `حجم ${faNumber(volume)} میلی‌لیتر موجود است.` : !family && !note ? "از کاتالوگ منتشرشدهٔ Morphiume." : ""}</p></div>)}</div> : <Empty title="محصولی با همهٔ این انتخاب‌ها پیدا نشد."><p>یک انتخاب را به «هنوز مطمئن نیستم» تغییر دهید تا گزینه‌های بیشتری ببینید.</p></Empty>}</>;
}
