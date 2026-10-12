import { normalizeDigits } from "./persian";

const day = 86_400_000;
const formatter = new Intl.DateTimeFormat("en", { calendar: "persian", numberingSystem: "latn", timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
function parts(at: number): number[] {
  if (formatter.resolvedOptions().calendar !== "persian") throw new Error("تقویم جلالی در این مرورگر در دسترس نیست.");
  const values = formatter.formatToParts(new Date(at));
  return ["year", "month", "day"].map(type => Number(values.find(value => value.type === type)!.value));
}
function key(values: number[]) { return values[0]! * 10000 + values[1]! * 100 + values[2]!; }
function invalid(): never { throw new Error("تاریخ جلالی معتبر را به شکل سال/ماه/روز وارد کنید."); }

/** Calendar dates, never instants: preserve the selected Tehran day. */
export function jalaliDateToIso(value: string): string {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalizeDigits(value).trim());
  if (!match) return invalid();
  const values = match.slice(1).map(Number), [year, month, date] = values;
  if (year! < 1300 || year! > 1600 || month! < 1 || month! > 12 || date! < 1 || date! > 31) return invalid();
  const target = key(values);
  // Search bounded Gregorian calendar days using the same standardized Intl
  // Persian calendar used for display, rather than a guessed leap-year rule.
  let low = Math.floor(Date.UTC(year! + 621, 0, 1) / day), high = Math.floor(Date.UTC(year! + 622, 11, 31) / day);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2), at = middle * day + 12 * 3_600_000, actual = key(parts(at));
    if (actual === target) return new Date(at).toISOString().slice(0, 10);
    if (actual < target) low = middle + 1; else high = middle - 1;
  }
  return invalid();
}

export function isoDateToJalali(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const at = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value) return invalid();
  const result = parts(at);
  if (result[0]! < 1300 || result[0]! > 1600) return invalid();
  return result.map((number, index) => String(number).padStart(index === 0 ? 4 : 2, "0")).join("/").replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]!);
}
