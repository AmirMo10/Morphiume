export type DeploymentEnvironment = "test" | "staging" | "live";
export type MoneyDto = { amountIrr: string; currency: "IRR" };
export type Actor = { userId: string; sessionId: string; kind: "customer" | "admin" };
export type Role = "owner" | "product_manager" | "fulfillment" | "support" | "finance";
export type Permission = "catalog.write" | "inventory.write" | "orders.read" | "orders.fulfill" | "refunds.write" | "roles.write" | "content.write";
export type ProductImage = { url: string; alt: string; variantSku?: string | null };
export type ProductInput = {
  name: string; slug: string; description: string; concentration: string; family: string;
  topNotes: string[]; heartNotes: string[]; baseNotes: string[];
  imageUrl?: string; images?: ProductImage[]; variants: { sku: string; volumeMl: number; priceToman: string; initialStock?: number }[];
};
export type ProductDto = {
  id: string; name: string; slug: string; description: string; concentration: string; family: string;
  topNotes: string[]; heartNotes: string[]; baseNotes: string[]; imageUrl: string | null; images: ProductImage[];
  status: "draft" | "published" | "archived"; version: number;
  variants: { id: string; sku: string; volumeMl: number; price: MoneyDto; available: number }[];
};
export type BulkEditInput = {
  operations: { variantId: string; expectedProductVersion: number; priceToman?: string; inventoryDelta?: number }[];
  reason: string; operationKey: string; dryRun: boolean;
};
export type BulkEditDto = {
  dryRun: boolean;
  changes: { variantId: string; sku: string; productName: string; currentPrice: MoneyDto; nextPrice: MoneyDto; currentStock: number; nextStock: number }[];
  operationId?: string;
};
export type CartDto = {
  id: string; version: number; couponCode: string | null;
  items: { variantId: string; productId: string; name: string; volumeMl: number; quantity: number; unitPrice: MoneyDto; available: number; published: boolean }[];
  subtotal: MoneyDto;
};
export type AddressInput = {
  recipient: string; phone: string; province: string; city: string; address: string;
  plaque: string; unit?: string; postalCode: string;
};
export type CheckoutInput = {
  cartId: string; cartVersion: number; address: AddressInput;
  shippingMethodId: "standard"; quoteFingerprint: string; policyVersion: string;
};
export type QuoteDto = {
  cartId: string; cartVersion: number; subtotal: MoneyDto; discount: MoneyDto; shipping: MoneyDto;
  tax: MoneyDto; total: MoneyDto; fingerprint: string; policyVersion: string;
  shippingMethodId: "standard"; expiresAt: string;
};
export type CheckoutDto = {
  orderId: string; orderNumber: string; paymentAttemptId: string;
  paymentStatus: "created" | "pending" | "unknown" | "succeeded" | "failed";
  redirectUrl: string | null; total: MoneyDto;
};
export type OrderDto = {
  id: string; orderNumber: string; createdAt: string; status: string; paymentStatus: string;
  subtotal: MoneyDto; discount: MoneyDto; shipping: MoneyDto; tax: MoneyDto; total: MoneyDto;
  address: AddressInput; policyVersion: string;
  items: { name: string; sku: string; volumeMl: number; quantity: number; unitPrice: MoneyDto; lineTotal: MoneyDto }[];
  shipment: { status: string; carrier: string | null; trackingCode: string | null; shippedAt: string | null } | null;
  events: { type: string; createdAt: string }[];
  returns: { id: string; kind: string; reason: string; status: string; createdAt: string }[];
  refunds: { id: string; amount: MoneyDto; status: string; reason: string }[];
};
export type DomainErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "OUT_OF_STOCK" | "PRICE_CHANGED" | "PAYMENT_UNKNOWN" | "NOT_ELIGIBLE" | "CONFIGURATION";
export class CommerceError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string, public readonly status = 400) { super(message); this.name = "CommerceError"; }
}
