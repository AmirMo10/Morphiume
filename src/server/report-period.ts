import { z } from "zod";
import type { ReportPeriod } from "../contracts/reports";

const date = z.iso.date().refine(value => Number(value.slice(0, 4)) >= 1, "تاریخ معتبر وارد کنید.");
const input = z.object({ from: date.optional(), to: date.optional() }).strict();
const day = 86_400_000;
function calendarDate(date: Date) { return date.toISOString().slice(0, 10); }
export function parseReportPeriod(raw: unknown, now = new Date()): ReportPeriod {
  const value = input.parse(raw);
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const toDate = value.to ?? today;
  const toTime = Date.parse(`${toDate}T00:00:00Z`);
  const fromDate = value.from ?? calendarDate(new Date(toTime - 29 * day));
  const span = (toTime - Date.parse(`${fromDate}T00:00:00Z`)) / day;
  if (span < 0 || span >= 366) throw new z.ZodError([{ code: "custom", path: ["from"], message: "بازهٔ گزارش باید بین یک تا ۳۶۶ روز باشد." }]);
  return { fromDate, toDate, timeZone: "Asia/Tehran" };
}
