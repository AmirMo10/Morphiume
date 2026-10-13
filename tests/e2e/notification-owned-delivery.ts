import assert from "node:assert/strict";
import pg from "pg";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
import { deliverOwnedNotificationJobs } from "./notification-delivery-core";

async function main() {
  assert.equal(process.env.NOTIFICATION_E2E_DELIVERY_GO, "true");
  // Test child gets runtime DML only; a separate migration credential is never accepted.
  assert(!process.env.MIGRATION_DATABASE_URL && !process.env.TEST_MIGRATION_DATABASE_URL);
  // The parent already loaded the protected runtime configuration. This child
  // does not read any env file or migration-owner configuration.
  const target = controlledQaDatabase(process.env), deploymentEnv = process.env.DEPLOYMENT_ENV;
  assert(deploymentEnv === "test" || deploymentEnv === "staging");
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of process.stdin) { const data = Buffer.from(chunk); bytes += data.byteLength; assert(bytes <= 4096); chunks.push(data); }
  const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const pool = new pg.Pool({ connectionString: target.toString(), max: 2, connectionTimeoutMillis: 3000, query_timeout: 3500 });
  try { return await deliverOwnedNotificationJobs(pool, input, deploymentEnv); }
  finally { await pool.end(); }
}
void main().then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error("Owned canonical notification delivery failed; details withheld."); process.exitCode = 1; });
