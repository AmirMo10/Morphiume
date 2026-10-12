"use client";
import { useState } from "react";
import { errorMessage, Notice } from "./commerce-client";
export function MediaUpload({ onUploaded, disabled = false, onBusyChange }: { onUploaded: (url: string) => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const upload = async (file: File | undefined) => { if (!file || busy || disabled) return; setBusy(true); onBusyChange?.(true); setError(""); setNotice(""); try { const body = new FormData(); body.append("file", file); const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body }); const result = await response.json() as { data?: { id: string; url: string; width: number; height: number }; error?: { message: string } }; if (!response.ok || !result.data) throw new Error(result.error?.message ?? "پردازش تصویر انجام نشد."); onUploaded(result.data.url); setNotice("تصویر پردازش شد و به فرم محصول اضافه شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); onBusyChange?.(false); } };
  return <div className="media-upload"><label htmlFor="product-image-file">بارگذاری تصویر واقعی محصول</label><input id="product-image-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || disabled} onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} aria-describedby="media-help" /><p id="media-help" className="helper">JPG، PNG یا WebP. تصویر روی سرور بررسی و به خروجی امن تبدیل می‌شود.</p>{busy && <p role="status">در حال بارگذاری و پردازش تصویر…</p>}{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}</div>;
}
