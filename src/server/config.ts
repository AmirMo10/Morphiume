import "server-only";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: ".env.local", quiet: true });

const schema = z.object({
  DEPLOYMENT_ENV: z.enum(["test", "staging", "live"]),
  APP_BASE_URL: z.url(),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  AUTH_SECRET: z.string().min(32),
  ADMIN_AUTH_SECRET: z.string().min(32),
  PAYMENT_PROVIDER: z.enum(["mock", "zarinpal"]),
  SMS_PROVIDER: z.enum(["mock", "kavenegar"]),
  MOCK_CONTROL_SECRET: z.string().min(32).optional(),
  MEDIA_ROOT: z.string().min(1),
  ZARINPAL_MERCHANT_ID: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SERVICE_TEMPLATE: z.string().optional(),
  PUBLIC_SITE_URL: z.url().optional(),
  OBJECT_STORAGE_ENDPOINT: z.url().optional(),
});

export type RuntimeConfig = z.infer<typeof schema>;
let validated: RuntimeConfig | undefined;

export function getConfig(): RuntimeConfig {
  if (validated) return validated;
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error(`Missing/invalid runtime settings: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  const settings = result.data;
  if (settings.AUTH_SECRET === settings.ADMIN_AUTH_SECRET) throw new Error("Customer/admin auth secrets must differ.");
  const base = new URL(settings.APP_BASE_URL);
  if (settings.DEPLOYMENT_ENV === "live") {
    if (settings.PAYMENT_PROVIDER === "mock" || settings.SMS_PROVIDER === "mock") throw new Error("Live deployment rejects mock providers.");
    if (base.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Live requires a trusted HTTPS origin.");
    if (!settings.ZARINPAL_MERCHANT_ID || !settings.SMS_API_KEY || !settings.SMS_SERVICE_TEMPLATE || !settings.PUBLIC_SITE_URL || !settings.OBJECT_STORAGE_ENDPOINT) throw new Error("Live service prerequisites are incomplete.");
    if (settings.MOCK_CONTROL_SECRET || process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_EMAIL) throw new Error("Live rejects test/bootstrap controls.");
    // Real SMS and object-storage contract verification is still an explicit release gate.
    throw new Error("Live activation is gated until real SMS, storage and business contracts are verified.");
  }
  if (settings.SMS_PROVIDER !== "mock") throw new Error("Only the controlled mock SMS adapter is configured for test/staging.");
  if (!settings.MOCK_CONTROL_SECRET) throw new Error("Protected test controls require a private mock-control secret.");
  validated = settings;
  return settings;
}
