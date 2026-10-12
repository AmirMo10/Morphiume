import { describe, expect, it } from "vitest";
import { parseReportPeriod } from "../../../src/server/report-period";
import { formatSignedAggregateToman } from "../../../src/lib/money";

describe("Tehran report calendar boundaries", () => {
  it("uses the Tehran calendar date when UTC is still the previous day", () => {
    expect(parseReportPeriod({}, new Date("2026-10-11T21:00:00Z"))).toEqual({ fromDate: "2026-09-13", toDate: "2026-10-12", timeZone: "Asia/Tehran" });
  });
  it("accepts inclusive leap-year periods and an explicit end-date default window", () => {
    expect(parseReportPeriod({ from: "2024-01-01", to: "2024-12-31" }).fromDate).toBe("2024-01-01");
    expect(parseReportPeriod({ to: "2024-03-01" }).fromDate).toBe("2024-02-01");
  });
  it("rejects malformed dates, extra fields, reversed ranges and oversized windows", () => {
    for (const value of [{ from: "2026-02-30" }, { from: "0000-01-01", to: "0000-01-01" }, { from: "2026-10-13", to: "2026-10-12" }, { from: "2024-01-01", to: "2025-01-01" }, { from: "2026-10-12T00:00:00Z" }, { phone: "private" }]) expect(() => parseReportPeriod(value)).toThrow();
  });
  it("formats negative period cashflow without floating point or concealing refund outflows", () => {
    expect(formatSignedAggregateToman("-123456789012345678901234567890")).toContain("۱۲٬۳۴۵٬۶۷۸٬۹۰۱٬۲۳۴٬۵۶۷٬۸۹۰٬۱۲۳٬۴۵۶٬۷۸۹");
    expect(formatSignedAggregateToman("-10")).toContain("۱");
    expect(() => formatSignedAggregateToman("-11")).toThrow();
    expect(() => formatSignedAggregateToman("1e6")).toThrow();
  });
});
