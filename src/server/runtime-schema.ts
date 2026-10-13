import "server-only";
import type { Pool } from "pg";
import { CommerceError } from "../contracts/commerce";

const required = ["0001_initial.sql", "0002_auth_adjuncts.sql", "0003_admin_domain.sql", "0004_auth_rate_limit_id.sql", "0005_bulk_operations.sql", "0006_notification_messages.sql", "0007_product_images.sql", "0008_slug_claims.sql", "0009_refund_failure_decisions.sql", "0010_return_decisions.sql", "0011_product_content.sql", "0012_anonymous_analytics.sql", "0013_operator_notifications.sql"] as const;
const appended = new Map([
  ["0012_anonymous_analytics.sql", "5ecc599e8f3be2716d64ba360e9c4be96add27a67fb5011fda8a86747c92dfb4"],
  ["0013_operator_notifications.sql", "6c3dc95837f75e2fc0f2cae1309346199663ee3f42483d3ffa9f78813fba2f25"],
]);
function unavailable(): never { throw new CommerceError("CONFIGURATION", "نسخهٔ پایگاه‌داده برای اجرای برنامه آماده نیست.", 503); }

/** Readiness is not migration execution. Only the migration-owner CLI can apply DDL. */
export async function assertRuntimeSchema(database: Pick<Pool, "query">) {
  try {
    const result = await database.query<{ name: string; checksum: string }>("SELECT name,checksum FROM schema_migration ORDER BY name LIMIT 14");
    if (result.rows.length !== required.length || result.rows.some((row, index) => row.name !== required[index] || (appended.has(row.name) && row.checksum !== appended.get(row.name)))) unavailable();
  } catch { unavailable(); }
}
