export type DeploymentEnvironment = "test" | "staging" | "live";
export type MoneyDto = { amountIrr: string; currency: "IRR" };
export type Actor = { userId: string; sessionId: string; kind: "customer" | "admin" };
export type Role = "owner" | "product_manager" | "fulfillment" | "support" | "finance";
export type Permission = "catalog.write" | "inventory.write" | "orders.read" | "orders.fulfill" | "refunds.write" | "roles.write" | "content.write";
export type ProductImage = { url: string; alt: string; variantSku?: string | null };
export type ProductInput = {
  name: string; slug: string; description: string; concentration: string; family: string;
  shortDescription?: string; careInstructions?: string; approvedWarnings?: string;
  topNotes: string[]; heartNotes: string[]; baseNotes: string[];
  imageUrl?: string; images?: ProductImage[]; variants: { sku: string; volumeMl: number; priceToman: string; initialStock?: number }[];
};
export type ProductDto = {
  id: string; name: string; slug: string; description: string; concentration: string; family: string;
  shortDescription: string; careInstructions: string; approvedWarnings: string;
  topNotes: string[]; heartNotes: string[]; baseNotes: string[]; imageUrl: string | null; images: ProductImage[];
  status: "draft" | "published" | "archived"; version: number;
  variants: { id: string; sku: string; volumeMl: number; price: MoneyDto; available: number }[];
};
export type ProductResolutionDto = { products: ProductDto[]; unavailableIds: string[] };
export type ProductRouteDto = { product: ProductDto; canonicalSlug: string; redirect: boolean };
export type PageDto<T> = { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number };
export type ProductPageInput = {
  page?: number; pageSize?: number; search?: string; family?: string; available?: boolean;
  volumeMl?: number; concentration?: string; note?: string; sort?: "name" | "price_asc" | "price_desc";
  minPriceToman?: string; maxPriceToman?: string;
};
export type AdminProductPageInput = ProductPageInput & { status?: ProductDto["status"] };
export type CatalogPageDto = PageDto<ProductDto> & { facets: { families: string[]; concentrations: string[]; volumesMl: number[]; notes: string[] }; facetLimit: number; facetsTruncated: boolean };
export type CollectionPageInput = { page?: number; pageSize?: number; search?: string };
export type AdminCollectionPageInput = CollectionPageInput & { published?: boolean };
export type CollectionSummaryDto = { id: string; name: string; slug: string; description: string; published: boolean; version: number; updatedAt: string; productCount: number };
export type CollectionProductsPageInput = Omit<ProductPageInput,"sort"> & { sort?: "position" | "name" | "price_asc" | "price_desc" };
export type CollectionDetailPageDto = { collection: CollectionSummaryDto; canonicalSlug: string; redirect: boolean; products: CatalogPageDto };
export type AdminCollectionDetailDto = CollectionSummaryDto & { productIds: string[]; members: { id: string; name: string; slug: string; status: ProductDto["status"]; version: number; active: boolean }[] };
export type CollectionInput = { id?: string; name: string; slug: string; description: string; published: boolean; productIds: string[]; expectedVersion?: number };
export type SitemapCollectionDto = { id: string; slug: string; updatedAt: string };
export type ManualRefundFailureInput = { outcome: "confirmed_non_transfer"; reason: string; evidence: string; operationKey: string };
export type ManualRefundFailureDto = { id: string; status: "failed"; outcome: "confirmed_non_transfer"; reason: string; evidence: string; decidedAt: string };
export type ReturnKind = "cancel" | "return";
export type ReturnStatus = "pending" | "approved" | "rejected" | "received" | "closed";
export type ReturnDecisionInput = { status: Exclude<ReturnStatus,"pending">; reason: string; restock?: boolean };
export type ReturnDecisionDto = { id: string; status: Exclude<ReturnStatus,"pending"> };
export type SitemapProductDto = { id: string; slug: string; updatedAt: string };
export type VariantPageInput = { page?: number; pageSize?: number; search?: string };
export type VariantDto = {
  id: string; sku: string; productName: string; productStatus: ProductDto["status"]; active: boolean;
  volumeMl: number; productVersion: number; available: number; onHand?: number; reserved?: number; price?: MoneyDto;
};
export type OrderStatus = "awaiting_payment" | "confirmed" | "payment_exception" | "cancelled" | "completed";
export type OrderPaymentStatus = "pending" | "paid" | "partially_refunded" | "refunded" | "failed" | "unknown";
export type OrdersPageInput = { page?: number; pageSize?: number; search?: string; status?: OrderStatus; paymentStatus?: OrderPaymentStatus };
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
  returns: { id: string; kind: ReturnKind; reason: string; status: ReturnStatus; createdAt: string }[];
  refunds: { id: string; amount: MoneyDto; status: string; reason: string }[];
};
export type DomainErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "MFA_REQUIRED" | "NOT_FOUND" | "CONFLICT" | "OUT_OF_STOCK" | "PRICE_CHANGED" | "PAYMENT_UNKNOWN" | "NOT_ELIGIBLE" | "CONFIGURATION";
export class CommerceError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string, public readonly status = 400) { super(message); this.name = "CommerceError"; }
}
