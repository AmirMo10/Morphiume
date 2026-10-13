import type { Permission, Role } from "../../contracts/commerce";
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: ["catalog.write", "inventory.write", "orders.read", "orders.fulfill", "refunds.write", "roles.write", "content.write", "analytics.read"],
  product_manager: ["catalog.write", "content.write", "analytics.read"],
  fulfillment: ["inventory.write", "orders.read", "orders.fulfill"],
  support: ["orders.read"],
  finance: ["orders.read", "refunds.write", "analytics.read"],
};
