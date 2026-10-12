import { describe, expect, it } from "vitest";
import { isoDateToJalali, jalaliDateToIso } from "../../../src/lib/report-calendar";

describe("Jalali report dates without changing the Tehran calendar day", () => {
  it("accepts Persian, Arabic and Latin digits and returns only an ISO calendar date", () => {
    for (const value of ["۱۴۰۵/۰۷/۲۰", "١٤٠٥/٠٧/٢٠", "1405-7-20"]) expect(jalaliDateToIso(value)).toBe("2026-10-12");
    expect(isoDateToJalali("2026-10-12")).toBe("۱۴۰۵/۰۷/۲۰");
  });
  it("checks actual leap dates instead of overflowing invalid days into the next month", () => {
    expect(jalaliDateToIso("1403/12/30")).toBe("2025-03-20");
    for (const value of ["1404/12/30", "1405/07/31", "1405/13/01", "1405/00/01", "1405/01/00", "1299/12/29", "1601/01/01", "1405/1/1?secret", "2026-10-12T00:00:00Z"]) expect(() => jalaliDateToIso(value)).toThrow();
    expect(() => isoDateToJalali("2026-02-30")).toThrow();
  });
  it("round-trips month boundaries and leap transitions without host-time-zone dependence", () => {
    for (const year of [2001, 2024, 2025, 2026, 2050]) for (let month = 1; month <= 12; month++) for (const date of [1, 20, 28]) {
      const value = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      expect(jalaliDateToIso(isoDateToJalali(value))).toBe(value);
    }
  });
});
