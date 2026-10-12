import { expect, type BrowserContext } from "@playwright/test";
import type { CartDto } from "../../src/contracts/commerce";

export async function readCurrentCart(context: BrowserContext): Promise<CartDto> {
  const response = await context.request.get("/api/cart");
  expect(response.status()).toBe(200);
  const cart = (await response.json()).data as CartDto;
  expect(typeof cart?.id === "string" && /^[0-9a-f-]{36}$/u.test(cart.id) && Number.isSafeInteger(cart.version) && cart.version > 0 && Array.isArray(cart.items), "A real server cart and version are required").toBe(true);
  return cart;
}
export async function claimCurrentCart(context: BrowserContext, baseURL: string, cart?: CartDto): Promise<CartDto> {
  const current = cart ?? await readCurrentCart(context);
  const response = await context.request.post("/api/cart/claim", { headers: { Origin: baseURL }, data: { cartId: current.id, expectedVersion: current.version } });
  expect(response.status()).toBe(200);
  const claimed = (await response.json()).data as CartDto;
  expect(claimed.id).toBe(current.id);
  return claimed;
}
export async function setCurrentCartQuantity(context: BrowserContext, baseURL: string, variantId: string, quantity: number, current?: CartDto): Promise<CartDto> {
  const cart = current ?? await readCurrentCart(context);
  const response = await context.request.put("/api/cart/items", { headers: { Origin: baseURL }, data: { cartId: cart.id, expectedVersion: cart.version, variantId, quantity } });
  expect(response.status()).toBe(200);
  return (await response.json()).data as CartDto;
}
export async function setCurrentCartCoupon(context: BrowserContext, baseURL: string, code: string, current?: CartDto): Promise<CartDto> {
  const cart = current ?? await readCurrentCart(context);
  const response = await context.request.post("/api/cart/coupon", { headers: { Origin: baseURL }, data: { cartId: cart.id, expectedVersion: cart.version, code } });
  expect(response.status()).toBe(200);
  return (await response.json()).data as CartDto;
}
