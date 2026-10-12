import { normalizeDigits } from "@/lib/persian";
const persian = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric", numberingSystem: "latn" });
const gregorian = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", numberingSystem: "latn" });
function parts(formatter: Intl.DateTimeFormat, value: number) { return Object.fromEntries(formatter.formatToParts(value).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)])) as Record<string, number>; }
const fa = (value: string) => value.replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
export function expiryFields(value: string) { const timestamp = Date.parse(value); if (!Number.isFinite(timestamp)) return { expiryDate: "", expiryTime: "" }; const p = parts(persian, timestamp); const g = parts(gregorian, timestamp); return { expiryDate: fa(`${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`), expiryTime: fa(`${String(g.hour).padStart(2, "0")}:${String(g.minute).padStart(2, "0")}`) }; }
export function parseTehranExpiry(date: string, time: string): string {
  const d = normalizeDigits(date).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const t = normalizeDigits(time).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) throw new Error("تاریخ شمسی را به صورت سال/ماه/روز و ساعت را به صورت ساعت:دقیقه وارد کنید.");
  const year = Number(d[1]), month = Number(d[2]), day = Number(d[3]), hour = Number(t[1]), minute = Number(t[2]);
  if (year < 1300 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) throw new Error("تاریخ یا ساعت پایان اعتبار معتبر نیست.");
  const target = year * 10000 + month * 100 + day;
  let low = Math.floor(Date.UTC(year + 620, 0, 1) / 86400000), high = Math.floor(Date.UTC(year + 623, 0, 1) / 86400000), found: number | undefined;
  while (low <= high) { const middle = Math.floor((low + high) / 2); const p = parts(persian, middle * 86400000); const key = p.year! * 10000 + p.month! * 100 + p.day!; if (key === target) { found = middle; break; } if (key < target) low = middle + 1; else high = middle - 1; }
  if (found === undefined) throw new Error("این روز در تقویم شمسی وجود ندارد.");
  const utcNominal = found * 86400000 + (hour * 60 + minute) * 60000;
  const offset = (value: number) => { const g = parts(gregorian, value); return Date.UTC(g.year!, g.month! - 1, g.day!, g.hour!, g.minute!, g.second!) - value; };
  let timestamp = utcNominal - offset(utcNominal); timestamp = utcNominal - offset(timestamp);
  const verified = expiryFields(new Date(timestamp).toISOString());
  if (normalizeDigits(verified.expiryDate) !== `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}` || normalizeDigits(verified.expiryTime) !== `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`) throw new Error("این ساعت در منطقهٔ زمانی تهران معتبر نیست.");
  return new Date(timestamp).toISOString();
}
export function percentageBasisPoints(value: string): number { const parsed = normalizeDigits(value).replace("٫", ".").trim().match(/^(\d{0,3})(?:\.(\d{1,2}))?$/); if (!parsed || (!parsed[1] && !parsed[2])) throw new Error("درصد تخفیف معتبر نیست."); const basis = Number(parsed[1] || 0) * 100 + Number((parsed[2] ?? "").padEnd(2, "0")); if (basis < 1 || basis > 10000) throw new Error("درصد تخفیف باید بیشتر از صفر و حداکثر صد، با دو رقم اعشار باشد."); return basis; }
