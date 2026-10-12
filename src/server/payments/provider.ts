import type { DeploymentEnvironment } from "../../contracts/commerce";
export type PaymentContext = { attemptId: string; orderId: string; amountIrr: bigint; currency: "IRR"; merchantKey: string; callbackUrl: string };
export type CreatedPayment = { kind: "created"; authority: string; redirectUrl: string } | { kind: "rejected"; code: string } | { kind: "unknown"; code: string };
export type VerifiedPayment = { kind: "verified"; providerRef: string; alreadyVerified: boolean } | { kind: "rejected"; code: string } | { kind: "unknown"; code: string };
export type PaymentInquiry = { kind: "known"; status: "VERIFIED" | "PAID" | "IN_BANK" | "FAILED" | "REVERSED" } | { kind: "unknown"; code: string };
export interface PaymentProvider {
  readonly name: "mock" | "zarinpal";
  readonly environment: DeploymentEnvironment;
  readonly capabilities: { reverse: boolean; partialRefund: false; generalRefund: false };
  create(context: PaymentContext): Promise<CreatedPayment>;
  verify(context: PaymentContext & { authority: string }): Promise<VerifiedPayment>;
  inquiry(context: PaymentContext & { authority: string }): Promise<PaymentInquiry>;
  reverse?(context: PaymentContext & { authority: string }): Promise<{ kind: "reversed" } | { kind: "rejected" | "unknown"; code: string }>;
}
