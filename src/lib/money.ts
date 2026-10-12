import { normalizeDigits } from "./persian";

// Application limit, not a claim about a provider's accepted amount range.
export const MAX_AMOUNT_IRR = 1_000_000_000n;

export function tomanToIrr(input: string): bigint {
  const digits = normalizeDigits(input).replace(/[٬,\s]/g, "");
  if (!/^\d+$/.test(digits)) throw new Error("مبلغ تومان باید عدد صحیح و نامنفی باشد.");
  const irr = BigInt(digits) * 10n;
  if (irr > MAX_AMOUNT_IRR) throw new Error("مبلغ خارج از محدودهٔ مجاز است.");
  return irr;
}

export function formatToman(value: string | bigint): string {
  const irr = BigInt(value);
  if (irr < 0n || irr > MAX_AMOUNT_IRR || irr % 10n !== 0n) throw new Error("مبلغ ریالی قابل نمایش دقیق به تومان نیست.");
  return `${new Intl.NumberFormat("fa-IR").format(irr / 10n)} تومان`;
}

export function formatAggregateToman(value: string): string {
  if (!/^\d{1,30}$/.test(value)) throw new Error("جمع مبلغ مالی معتبر نیست.");
  const irr = BigInt(value);
  if (irr % 10n !== 0n) throw new Error("جمع مبلغ ریالی قابل نمایش دقیق به تومان نیست.");
  return `${new Intl.NumberFormat("fa-IR").format(irr / 10n)} تومان`;
}

export function moneyDto(value: bigint): { amountIrr: string; currency: "IRR" } {
  if (value < 0n || value > MAX_AMOUNT_IRR || value % 10n !== 0n) throw new Error("مبلغ مالی معتبر نیست.");
  return { amountIrr: value.toString(), currency: "IRR" };
}
