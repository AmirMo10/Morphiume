import "server-only";
import { Pool } from "pg";
import { getConfig } from "./config";
import { createAnalyticsStore } from "./commerce/analytics";

export function analyticsCaptureEnabled() {
  // Production policy is an owner prerequisite. Synthetic staging has an
  // explicit opt-in; an unset switch never claims observations were captured.
  const config = getConfig();
  return config.DEPLOYMENT_ENV !== "live" && config.ANONYMOUS_ANALYTICS_ENABLED === true;
}

let runtime: ReturnType<typeof createAnalyticsStore> | undefined;
let dedicatedPool: Pool | undefined;
export function getAnalyticsRuntime() {
  if (runtime) return runtime;
  const dedicated = new Pool({
    connectionString: getConfig().DATABASE_URL,
    max: 2, connectionTimeoutMillis: 200, idleTimeoutMillis: 30000,
    statement_timeout: 200, lock_timeout: 50, application_name: "morphiume-analytics",
  });
  // Advisory capture outages cannot terminate the commerce process. The store
  // drops failed captures and exposes unmeasured delivery in its coverage DTO.
  dedicated.on("error", () => {});
  dedicatedPool = dedicated;
  return runtime = createAnalyticsStore({ pool: dedicated, enabled: analyticsCaptureEnabled });
}

export async function closeAnalyticsRuntime() {
  const current = dedicatedPool;
  dedicatedPool = undefined;
  runtime = undefined;
  await current?.end();
}
