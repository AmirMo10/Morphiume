# Domain API contracts

Contracts are implemented in `src/contracts/commerce.ts`. Root owns HTTP routing, CSRF, input parsing, private-response no-store and conversion from the maintained auth library to an Actor. Callers never construct Actor from client body fields. The domain rereads active session, verified customer phone or admin MFA grant, and current roles.

Factory `createCommerce({pool,payments,deploymentEnv,appBaseUrl,merchantKey?,reservationMinutes?,shippingFeeIrr?,freeShippingThresholdIrr?,policyVersion?})` lives in `src/server/commerce/service.ts`. Money JSON is `{amountIrr: decimalString, currency: "IRR"}`. Frontend uses the central تومان formatter. Checkout accepts cart/version, inline recipient/address, shippingMethodId, accepted quote fingerprint and policy version, plus a separately supplied idempotency key. It accepts no price/discount/shipping/tax/total values from the client. A configured free-shipping threshold applies inclusively to subtotal minus the exact rounded discount; an omitted threshold preserves the baseline fee.

| Flow | Domain calls / authorization |
|---|---|
| Public catalog | listProducts(filter), getProduct(slugOrId); only published products; private draft preview requires admin catalog permission |
| Product admin | listAdminProducts/createProduct/updateProduct/publishProduct/archiveProduct; expectedVersion on existing edits |
| Bulk administration | bulkEdit(actor,{operations:[{variantId,expectedProductVersion,priceToman?,inventoryDelta?}],reason,operationKey,dryRun}); maximum 100 unique variants, price and inventory permissions checked independently; preview has no write effects |
| Cart | createCart returns a server-only guestToken plus DTO; getCart/setCartItem/setCartCoupon receive cookie secret; quantities 0–20 and version checks |
| Customer checkout | quoteCheckout(actor,guestToken,cartId); createCheckout(actor,guestToken,input,key); retryPayment(actor,orderId,key) blocks unresolved previous attempts |
| Provider callback | verifyPayment(authority) independent of browser cookie; authority maps to persisted provider/merchant/attempt; order detail still needs authorization |
| Customer status | getOrder(actor,idOrNumber), listOrders; address/shipment/timeline visible only to owner or granted admin |
| Shipment/inventory | recordShipment with carrier/tracking/status; listInventory/getInventoryLedger/adjustInventory with operationKey and reason |
| Returns/refunds | requestReturn owned and state guarded; decideReturn with explicit review/restock; finance listReceipts/requestRefund/completeManualRefund |
| Account | saveAddress/listAddresses/deleteAddress, setWishlist/listWishlist under verified customer ownership |
| Catalog/content | listCoupons/saveCoupon, listCollections/saveCollection, listContent/saveContent, importProducts rows with dryRun and all-or-nothing draft commit |
| Worker | createJobs({pool,commerce,notify?}).tick returns expired/processed counts; heartbeat only after successful DB tick |

Ownership on a claimed cart overrides the original guest token and checkout rotates its digest. After logout the route creates a new guest cart when the previous one is unavailable. Guest cart IDs, order IDs, order numbers and authority values never reveal private order data themselves.

Business errors use CommerceError: VALIDATION 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, and conflict/state/stock/price issues 409. Unknown payment results remain visible for follow-up rather than claiming a completed sale. Return/refund/collection/import methods exist at domain level; HTTP/UI completion is reported by the coordinator separately.

BulkEditDto returns `{dryRun,changes:[{variantId,sku,productName,currentPrice,nextPrice,currentStock,nextStock}],operationId?}`. Existing committed keys are scoped to actor and canonical payload and return their stored result even after versions advance. Changed payload with a committed key conflicts. Rows lock in product UUID, variant UUID, balance UUID order; every requested product version is checked before mutation. All prices/movements, product version increments, inventory ledger, operation result and audit commit together. Inventory output includes `product_version` for warehouse previews without catalog permission.

Controlled notifications use `notifyOrderEvent(pool,deploymentEnv,type,payload,dedupeKey)` in `src/server/jobs/notifications.ts` as the worker's notify callback. Supported order/payment/shipment events create one generic Persian test message for the persisted order user; payload recipient fields never select a recipient and no address, phone or amount is copied into the text. Unknown types or malformed/missing orders are ignored. Live invocation fails closed. This is an in-app test/staging inbox; no email/SMS dispatch or backfill of previously completed events is claimed. Root owns inbox HTTP read/mark-read authorization and account UI.

Product galleries use optional input `images:[{url,alt,variantSku?:string|null}]`, maximum ten images. DTO `images` is always an ordered array; `imageUrl` remains the first generic image or first image overall for compatibility. Variant SKU must name an active variant in the submitted product. Alt text is required and bounded to 240 characters. An absent `images` field keeps the legacy single-image update behavior: `imageUrl` becomes one generic image with product-name alt; explicit `images:[]` removes the gallery on a draft/archived product. Removing required images/description/concentration/family from a published product is rejected until it is withdrawn. Publication requires a ready gallery.

Image URLs are exact registered `/media/<lowercase UUID>.webp` references to ready WebP metadata. New attachments require uploader ownership for product managers; current owners may reuse the single-store ready library. Authorized editors may retain/reorder already-approved product images. The exact `/assets/sample-perfume.svg` fixture is allowed only in test/staging. Arbitrary asset prefixes, external URLs, traversal, query strings, missing or unready media are rejected. Public/admin/wishlist product lists load galleries in one batch query; collections batch per collection. Gallery metadata tests do not claim byte-upload or browser image rendering acceptance.
