import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { CommerceError } from "@/contracts/commerce";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/[...segments]/route";

const state = vi.hoisted(() => ({ customer: vi.fn(), createCart: vi.fn(), getCart: vi.fn(), createCheckout: vi.fn(), claimCart: vi.fn(), setCartItem: vi.fn(), setCartCoupon: vi.fn(), database: vi.fn() }));
vi.mock("@/server/runtime", () => ({ getCommerce: () => state, getMockPayments: vi.fn() }));
vi.mock("@/server/auth/actors", () => ({ customerActor: state.customer, adminActor: vi.fn(), adminSession: vi.fn() }));
vi.mock("@/server/db", () => ({ pool: { query: state.database } }));
vi.mock("@/server/config", () => ({ getConfig: () => ({ APP_BASE_URL: "http://localhost:3000", DEPLOYMENT_ENV: "test" }) }));
vi.mock("@/server/auth/otp", () => ({ readMockOtp: vi.fn() }));
vi.mock("@/server/admin", () => ({ getSettings: vi.fn(), saveSettings: vi.fn(), adminDirectory: vi.fn() }));
vi.mock("@/server/media", () => ({ uploadMedia: vi.fn() }));
vi.mock("@/server/shipping", () => ({ getShippingSettings: vi.fn(), saveShippingSettings: vi.fn() }));
vi.mock("@/server/presentation", () => ({ getPresentation: vi.fn(), getAdminPresentation: vi.fn(), savePresentation: vi.fn() }));
vi.mock("@/server/notifications", () => ({ getNotificationFeed: vi.fn() }));
vi.mock("@/server/observability", () => ({ withRequestContext: (_request: Request, run: () => unknown) => run(), finishRequest: (response: Response) => response, unexpectedFailureCategory: () => "unexpected", recordCommerceResponse: vi.fn() }));

const cartId = randomUUID(), variantId = randomUUID(), otherCartId = randomUUID(), token = randomBytes(32).toString("base64url");
const actor = { userId: randomUUID(), sessionId: randomUUID(), kind: "customer" };
const cart = { id: cartId, version: 7, couponCode: null, items: [], subtotal: { amountIrr: "0", currency: "IRR" } };
const input = { cartId, cartVersion: 6, address: { recipient: "گیرندهٔ مصنوعی", phone: "+989120000000", province: "استان آزمایشی", city: "شهر آزمایشی", address: "نشانی مصنوعی", plaque: "1", postalCode: "0000000000" }, shippingMethodId: "standard", quoteFingerprint: "synthetic-quote", policyVersion: "synthetic-policy" };
const saved = { orderId: randomUUID(), orderNumber: "QA-SYNTHETIC", paymentAttemptId: randomUUID(), paymentStatus: "unknown", redirectUrl: null, total: { amountIrr: "10000", currency: "IRR" } };
const operation = randomUUID();
function request(path: string, method: string, body?: unknown, cookie?: string, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": operation, ...(cookie ? { Cookie: `morphiume-cart=${cookie}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  for (const method of Object.values(state)) method.mockReset();
  state.database.mockImplementation(() => { throw new Error("No PostgreSQL in controlled ingress tests"); });
  state.customer.mockResolvedValue(actor); state.getCart.mockResolvedValue(cart); state.createCheckout.mockResolvedValue(saved);
  state.createCart.mockResolvedValue({ cart, guestToken: token }); state.claimCart.mockResolvedValue({ ...cart, version: 8 });
  state.setCartItem.mockImplementation(async (_id, _token, _variant, _quantity, expectedVersion) => { if (expectedVersion !== cart.version) throw new CommerceError("CONFLICT", "سبد تغییر کرده است.", 409); return cart; });
  state.setCartCoupon.mockImplementation(async (_id, _token, _coupon, expectedVersion) => { if (expectedVersion !== cart.version) throw new CommerceError("CONFLICT", "سبد تغییر کرده است.", 409); return cart; });
});

describe("cart ingress delegates authorization and durable replay without fabricating carts", () => {
  it.each([{ label: "absent cookie", cookie: undefined }, { label: "replaced cart cookie", cookie: `${otherCartId}.${token}` }, { label: "matching cart cookie", cookie: `${cartId}.${token}` }, { label: "malformed cart cookie", cookie: `${cartId}.${token}.` }])("recovers a saved checkout without a get/create-cart dependency ($label)", async ({ cookie }) => {
    state.createCart.mockRejectedValue(new Error("Cart creation unavailable")); state.getCart.mockRejectedValue(new Error("Current cart unavailable"));
    const response = await POST(request("checkout", "POST", input, cookie));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ data: saved });
    expect(state.createCheckout).toHaveBeenCalledWith(actor, cookie === `${cartId}.${token}` ? token : "", input, operation);
    expect(state.getCart).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled(); expect(state.database).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull(); expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("rejects a foreign-origin replay before any domain call", async () => {
    expect((await POST(request("checkout", "POST", input, undefined, "http://foreign.invalid"))).status).toBe(403);
    expect(state.createCheckout).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  });
  it.each([["PUT", PUT], ["DELETE", DELETE]] as const)("requires explicit cart/version for absolute %s before reading/creating a cart", async (method, handler) => {
    expect((await handler(request("cart/items", method, { variantId, quantity: 1 }, `${cartId}.${token}`))).status).toBe(400);
    expect(state.getCart).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled(); expect(state.setCartItem).not.toHaveBeenCalled();
  });
  it("forwards the stale client version rather than substituting the current version", async () => {
    expect((await PUT(request("cart/items", "PUT", { cartId, expectedVersion: 6, variantId, quantity: 1 }, `${cartId}.${token}`))).status).toBe(409);
    expect(state.setCartItem).toHaveBeenCalledWith(cartId, token, variantId, 1, 6, actor);
    expect(state.createCart).not.toHaveBeenCalled();
  });
  it("rejects a different cart even when its version happens to agree", async () => {
    expect((await PUT(request("cart/items", "PUT", { cartId: otherCartId, expectedVersion: 7, variantId, quantity: 1 }, `${cartId}.${token}`))).status).toBe(409);
    expect(state.getCart).not.toHaveBeenCalled(); expect(state.setCartItem).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  });
  it("requires cart/version on coupon writes and never creates a replacement", async () => {
    expect((await PATCH(request("cart", "PATCH", { couponCode: null }, `${cartId}.${token}`))).status).toBe(400);
    expect((await DELETE(request("cart/coupon", "DELETE", { cartId, expectedVersion: 7 }))).status).toBe(409);
    expect(state.setCartCoupon).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  });
  it("claims only the cookie-matched cart with the native actor and explicit version", async () => {
    const response = await POST(request("cart/claim", "POST", { cartId, expectedVersion: 7 }, `${cartId}.${token}`));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: { ...cart, version: 8 } });
    expect(state.claimCart).toHaveBeenCalledWith(actor, cartId, token, 7); expect(state.createCart).not.toHaveBeenCalled();
  });
  it("rejects supplied claim ownership instead of treating it as authority", async () => {
    expect((await POST(request("cart/claim", "POST", { cartId, expectedVersion: 7, userId: actor.userId }, `${cartId}.${token}`))).status).toBe(400);
    expect(state.claimCart).not.toHaveBeenCalled();
  });
  it("requires native customer authentication for a claim", async () => {
    state.customer.mockRejectedValue(new CommerceError("UNAUTHENTICATED", "شماره را تأیید کنید.", 401));
    expect((await POST(request("cart/claim", "POST", { cartId, expectedVersion: 7 }, `${cartId}.${token}`))).status).toBe(401);
    expect(state.claimCart).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  });
  it("preserves guest cart creation on reads", async () => {
    expect((await GET(request("cart", "GET"))).status).toBe(200); expect(state.createCart).toHaveBeenCalledTimes(1);
    expect(state.claimCart).not.toHaveBeenCalled(); expect(state.database).not.toHaveBeenCalled();
  });
  it("never allows GET to mutate a coupon or create a cart", async () => {
    expect((await GET(request("cart/coupon", "GET", undefined, `${cartId}.${token}`))).status).toBe(404);
    expect(state.setCartCoupon).not.toHaveBeenCalled(); expect(state.getCart).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  });
  it("keeps additive guest POST and its private cart cookie", async () => {
    const response = await POST(request("cart/items", "POST", { variantId, quantity: 1 }));
    expect(response.status).toBe(200); expect(state.createCart).toHaveBeenCalledTimes(1);
    expect(state.setCartItem).toHaveBeenCalledWith(cartId, token, variantId, 1, 7, actor);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly"); expect(response.headers.get("Set-Cookie")).toContain("SameSite=lax");
  });
  it("requires both optional additive preconditions and adds only the requested delta", async () => {
    expect((await POST(request("cart/items", "POST", { variantId, cartId }))).status).toBe(400);
    expect(state.createCart).not.toHaveBeenCalled();
    state.getCart.mockResolvedValue({ ...cart, items: [{ variantId, quantity: 2 }] });
    expect((await POST(request("cart/items", "POST", { variantId, quantity: 1, cartId, expectedVersion: 7 }, `${cartId}.${token}`))).status).toBe(200);
    expect(state.setCartItem).toHaveBeenCalledWith(cartId, token, variantId, 3, 7, actor);
  });
  it("forwards stale coupon preconditions without clearing the current coupon", async () => {
    expect((await PATCH(request("cart", "PATCH", { cartId, expectedVersion: 6, couponCode: null }, `${cartId}.${token}`))).status).toBe(409);
    expect(state.setCartCoupon).toHaveBeenCalledWith(cartId, token, null, 6, actor);
    expect(state.createCart).not.toHaveBeenCalled();
  });
  it("preserves the domain's distinct never-committed stale-checkout result", async () => {
    state.createCheckout.mockRejectedValue(new CommerceError("CART_CHANGED", "سبد تغییر کرده است. مبلغ را دوباره بررسی کنید.", 409));
    const response = await POST(request("checkout", "POST", input));
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("CART_CHANGED");
    expect(state.getCart).not.toHaveBeenCalled(); expect(state.createCart).not.toHaveBeenCalled();
  });
});
