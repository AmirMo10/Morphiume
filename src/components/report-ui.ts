import { isoDateToJalali, jalaliDateToIso } from "@/lib/report-calendar";

export function reportRange(from: string, to: string) {
  const fields: Record<string, string> = {};
  const values: { from?: string; to?: string } = {};
  for (const [key, value] of [["from", from], ["to", to]] as const) {
    if (!value.trim()) continue;
    try { if (value.length > 30) throw new Error(); values[key] = jalaliDateToIso(value); }
    catch { fields[key] = "تاریخ جلالی معتبر را به شکل سال/ماه/روز وارد کنید."; }
  }
  if (values.from && values.to) {
    const days = (Date.parse(`${values.to}T00:00:00Z`) - Date.parse(`${values.from}T00:00:00Z`)) / 86400000 + 1;
    if (days < 1 || days > 366) fields.to = "تاریخ پایان نباید پیش از آغاز باشد؛ هر دو روز حساب می‌شوند و بازه حداکثر ۳۶۶ روز است.";
  }
  return { valid: Object.keys(fields).length === 0, fields, values, visible: { from: values.from ? isoDateToJalali(values.from) : "", to: values.to ? isoDateToJalali(values.to) : "" } };
}
export function reportUnits(value: string) {
  if (!/^\d{1,30}$/.test(value)) throw new Error("تعداد واحدهای ثبت‌شده معتبر نیست.");
  return new Intl.NumberFormat("fa-IR").format(BigInt(value));
}
