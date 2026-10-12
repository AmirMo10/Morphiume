import { describe, expect, it } from "vitest";
import { formatAggregateToman, formatToman, MAX_AMOUNT_IRR, moneyDto, tomanToIrr } from "../../../src/lib/money";
import { formatDate, normalizeDigits, normalizePhone, normalizeSearch } from "../../../src/lib/persian";

describe("shared Persian inputs and exact IRR/Toman boundary (T02/T23)", () => {
  it.each(["۰۱۲۳۴۵۶۷۸۹", "٠١٢٣٤٥٦٧٨٩", "0123456789"])("normalizes %s without rounding", (input) => {
    expect(normalizeDigits(input)).toBe("0123456789");
  });
  it.each(["۰۹۱۲۱۲۳۴۵۶۷", "٠٩١٢١٢٣٤٥٦٧", "09121234567", "+989121234567", "00989121234567", "989121234567", "9121234567", "+98 (912) 123-4567"])("uses one identity for %s", (input) => {
    expect(normalizePhone(input)).toBe("+989121234567");
  });
  it.each(["", "02112345678", "+98912123456", "+9891212345678", "+98912abc4567", "0912/1234567", "09121234567<script>"])("rejects malformed mobile %s", (input) => {
    expect(() => normalizePhone(input)).toThrow();
  });
  it("normalizes Arabic letters and spacing for search", () => {
    expect(normalizeSearch("  رايحه‌  خنك ۵۰ ML  ")).toBe("رایحه خنک 50 ml");
  });
  it.each(["۱۲۳٬۴۵۶", "١٢٣,٤٥٦", "123456", "123 456"])("converts %s تومان once", (input) => {
    expect(tomanToIrr(input)).toBe(1_234_560n);
    expect(moneyDto(tomanToIrr(input))).toEqual({ amountIrr: "1234560", currency: "IRR" });
  });
  it("keeps the maximum boundary exact and never uses JSON numbers", () => {
    expect(tomanToIrr("100000000")).toBe(MAX_AMOUNT_IRR);
    expect(moneyDto(MAX_AMOUNT_IRR)).toEqual({ amountIrr: "1000000000", currency: "IRR" });
    expect(formatToman("1234560")).toBe("۱۲۳٬۴۵۶ تومان");
    expect(formatToman(0n)).toBe("۰ تومان");
  });
  it.each(["-1", "1.5", "۱٫۵", "1e6", "Infinity", "NaN", "100000001"])("rejects noninteger/overflow تومان %s", (input) => {
    expect(() => tomanToIrr(input)).toThrow();
  });
  it.each([-10n, 1n, MAX_AMOUNT_IRR + 10n])("rejects nonrepresentable IRR %s", (value) => {
    expect(() => formatToman(value)).toThrow();
    expect(() => moneyDto(value)).toThrow();
  });
  it("renders a known Jalali New Year in Tehran", () => {
    expect(formatDate("2024-03-20T12:00:00Z")).toBe("۱ فروردین ۱۴۰۳");
  });
  it("allows an aggregate of two valid orders above the per-order cap without relaxing order validation", () => {
    const total = MAX_AMOUNT_IRR + MAX_AMOUNT_IRR;
    expect(formatAggregateToman(total.toString())).toBe("۲۰۰٬۰۰۰٬۰۰۰ تومان");
    expect(() => formatToman(total)).toThrow();
    expect(() => moneyDto(total)).toThrow();
  });
  it("keeps aggregate report precision above the JavaScript Number safe range", () => {
    expect(formatAggregateToman("9007199254740993000")).toBe("۹۰۰٬۷۱۹٬۹۲۵٬۴۷۴٬۰۹۹٬۳۰۰ تومان");
  });
  it.each(["-10", "1.5", "۱٫۵", "1e10", "Infinity", "11", "1000000000000000000000000000000"])("rejects malformed or excessive aggregate %s", (value) => {
    expect(() => formatAggregateToman(value)).toThrow();
  });
});
