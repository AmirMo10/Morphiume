import type { AddressInput, CheckoutInput, CheckoutDto } from "@/contracts/commerce";

const draftKey = "morphiume-checkout-draft-v2", recoveryKey = "morphiume-checkout-recovery-v2";
export type CheckoutRecovery = { version: 2; ownerId: string; cartId: string; key: string } & (
  { kind: "pending"; input: CheckoutInput } |
  { kind: "known"; orderId: string; paymentAttemptId: string; paymentStatus: CheckoutDto["paymentStatus"] }
);
type AddressDraft = { version: 2; cartId: string; ownerId: string | null; address: AddressInput };
let memoryDraft: AddressDraft | null = null, memoryRecovery: CheckoutRecovery | null = null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.length <= 128;
const text = (value: unknown, maximum: number): value is string => typeof value === "string" && value.length <= maximum;
export function boundedAddress(value: unknown): AddressInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!text(item.recipient,120) || !text(item.phone,32) || !text(item.province,100) || !text(item.city,100) || !text(item.address,2000) || !text(item.plaque,30) || !text(item.postalCode,20) || (item.unit !== undefined && !text(item.unit,30))) return null;
  return {recipient:item.recipient,phone:item.phone,province:item.province,city:item.city,address:item.address,plaque:item.plaque,postalCode:item.postalCode,unit:item.unit as string | undefined};
}
function read(key: string) { try { const value = sessionStorage.getItem(key); if (!value || value.length > 15000) return null; return JSON.parse(value) as unknown; } catch { return null; } }
function write(key: string, value: unknown) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Current-tab memory remains available without browser storage. */ } }
function discardLegacy() { write("morphiume-checkout-address",null); write("morphiume-checkout-idempotency",null); }
export function clearCheckoutPrivateState() {
  memoryDraft = null; memoryRecovery = null;
  for (const key of [draftKey,recoveryKey,"morphiume-checkout-address","morphiume-checkout-idempotency"]) write(key,null);
}
export function loadAddressDraft(cartId: string, ownerId: string | null): AddressInput | null {
  discardLegacy();
  const raw = memoryDraft ?? read(draftKey);
  if (!raw || typeof raw !== "object") return null;
  const item = raw as AddressDraft, address = boundedAddress(item.address);
  // Only the same cart's first verified guest claim may promote its recipient draft.
  if (item.version !== 2 || item.cartId !== cartId || (item.ownerId !== ownerId && item.ownerId !== null) || !address) { memoryDraft = null; write(draftKey,null); return null; }
  memoryDraft = {version:2,cartId,ownerId,address}; write(draftKey,memoryDraft); return address;
}
export function saveAddressDraft(cartId: string, ownerId: string | null, address: AddressInput) { const bounded = boundedAddress(address); if (!bounded || !id(cartId)) return; memoryDraft = {version:2,cartId,ownerId,address:bounded}; write(draftKey,memoryDraft); }
export function clearAddressDraft() { memoryDraft = null; write(draftKey,null); }
export function loadCheckoutRecovery(ownerId: string): CheckoutRecovery | null {
  discardLegacy();
  const raw = memoryRecovery ?? read(recoveryKey);
  if (!raw || typeof raw !== "object") return null;
  const item = raw as CheckoutRecovery;
  if (item.version !== 2 || item.ownerId !== ownerId || !id(item.cartId) || !uuid.test(item.key)) { memoryRecovery = null; write(recoveryKey,null); return null; }
  if (item.kind === "pending") {
    const input = item.input, address = boundedAddress(input?.address);
    if (!input || input.cartId !== item.cartId || !Number.isSafeInteger(input.cartVersion) || input.cartVersion < 0 || !address || input.shippingMethodId !== "standard" || !text(input.quoteFingerprint,256) || !text(input.policyVersion,160)) return null;
    memoryRecovery = {version:2,ownerId,cartId:item.cartId,key:item.key,kind:"pending",input:{cartId:input.cartId,cartVersion:input.cartVersion,address,shippingMethodId:"standard",quoteFingerprint:input.quoteFingerprint,policyVersion:input.policyVersion}};
  } else if (item.kind === "known" && id(item.orderId) && id(item.paymentAttemptId) && ["created","pending","unknown","succeeded","failed"].includes(item.paymentStatus)) memoryRecovery = {version:2,ownerId,cartId:item.cartId,key:item.key,kind:"known",orderId:item.orderId,paymentAttemptId:item.paymentAttemptId,paymentStatus:item.paymentStatus};
  else return null;
  return memoryRecovery;
}
export function saveCheckoutRecovery(value: CheckoutRecovery | null) { memoryRecovery = value; write(recoveryKey,value); }
