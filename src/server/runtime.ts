import "server-only";
import { getConfig } from "./config";
import { pool } from "./db";
import { createCommerce } from "./commerce/service";
import { MockPaymentProvider } from "./payments/mock";
import { ZarinpalPaymentProvider } from "./payments/zarinpal";
import { readShippingPolicy } from "./shipping";
import { readCheckoutEnabled } from "./presentation";

let instance: ReturnType<typeof createCommerce> | undefined;
let mock: MockPaymentProvider | undefined;
export function getMockPayments() {
  const config = getConfig();
  if (config.DEPLOYMENT_ENV === "live" || config.PAYMENT_PROVIDER !== "mock") throw new Error("Test payment controls are unavailable.");
  return mock ??= new MockPaymentProvider(pool, config.DEPLOYMENT_ENV, config.APP_BASE_URL);
}
export function getCommerce() {
  if (instance) return instance;
  const config = getConfig();
  const payments = config.PAYMENT_PROVIDER === "mock" ? getMockPayments() : new ZarinpalPaymentProvider(config.DEPLOYMENT_ENV, config.ZARINPAL_MERCHANT_ID ?? "", config.APP_BASE_URL, config.DEPLOYMENT_ENV !== "live");
  instance = createCommerce({ pool, payments, deploymentEnv: config.DEPLOYMENT_ENV, appBaseUrl: config.APP_BASE_URL, merchantKey: config.ZARINPAL_MERCHANT_ID, readShippingPolicy, readCheckoutEnabled });
  return instance;
}
