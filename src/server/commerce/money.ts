import { CommerceError, type MoneyDto } from "../../contracts/commerce";
import { tomanToIrr as centralTomanToIrr, moneyDto as centralMoneyDto } from "../../lib/money";
import { normalizePhone } from "../../lib/persian";
export { normalizeDigits } from "../../lib/persian";

// Application cap is deliberate and stricter than PostgreSQL BIGINT; do not infer provider limits from it.
export const MAX_MONEY_IRR = 1_000_000_000n;
export function parseIrr(value: string, allowZero = true): bigint {
  if (!/^(0|[1-9][0-9]{0,9})$/.test(value)) throw new CommerceError("VALIDATION", "مبلغ معتبر نیست.");
  const parsed = BigInt(value);
  if (parsed > MAX_MONEY_IRR || (!allowZero && parsed === 0n)) throw new CommerceError("VALIDATION", "مبلغ خارج از محدودهٔ مجاز است.");
  return parsed;
}
export function tomanToIrr(value: string): bigint {
  try { return parseIrr(centralTomanToIrr(value).toString(),false); }
  catch { throw new CommerceError("VALIDATION", "قیمت را به تومان و بدون اعشار و در محدودهٔ مجاز وارد کنید."); }
}
export const moneyDto = (amount: bigint | string): MoneyDto => centralMoneyDto(BigInt(amount));
export function percentageDiscount(subtotal: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new CommerceError("VALIDATION", "درصد تخفیف معتبر نیست.");
  // Round down to complete toman so displayed payable total equals gateway rial amount exactly.
  return (subtotal * BigInt(basisPoints) / 10000n / 10n) * 10n;
}
export function normalizeIranPhone(value: string): string {
  try { return normalizePhone(value); }
  catch { throw new CommerceError("VALIDATION", "شمارهٔ همراه معتبر نیست."); }
}
