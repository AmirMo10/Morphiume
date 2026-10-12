import { describe, expect, it } from "vitest";
import { normalizeIranPhone, parseIrr, percentageDiscount, tomanToIrr } from "../../../src/server/commerce/money";
import { MockPaymentProvider } from "../../../src/server/payments/mock";
import type { Pool } from "pg";

describe("financial boundary",()=>{
  it("normalizes equivalent Iranian telephone inputs without dropping identity digits",()=>{
    expect(["۰۹۱۲۱۲۳۴۵۶۷","٠٩١٢١٢٣٤٥٦٧","09121234567","+989121234567","00989121234567"].map(normalizeIranPhone)).toEqual(Array(5).fill("+989121234567"));
    expect(()=>normalizeIranPhone("+98912123456")).toThrow();
  });
  it("converts تومان once, rounds discount to displayable تومان and rejects overflow/fractions",()=>{
    expect(tomanToIrr("۱۲۹۰۰۰۰")).toBe(12900000n);
    expect(percentageDiscount(12900000n,333)).toBe(429570n);
    expect(percentageDiscount(1230n,3333)).toBe(400n);
    for(const bad of ["-1","1.5","1e4","100000001","NaN"])expect(()=>tomanToIrr(bad)).toThrow();
    expect(()=>parseIrr("1000000001")).toThrow();
  });
  it("fails closed for a mock provider selected in live deployment",()=>{
    expect(()=>new MockPaymentProvider({} as Pool,"live","https://example.invalid")).toThrow();
  });
});
