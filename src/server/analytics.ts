import "server-only";
import type { Actor } from "../contracts/commerce";
import { pool } from "./db";
import { createAnalyticsReportStore } from "./analytics-report";
import { createAnalyticsAuthorizer } from "./analytics-access";
import { getAnalyticsRuntime } from "./analytics-runtime";

const authorizeCurrent = createAnalyticsAuthorizer(pool);
export function getAnalytics(actor: Actor, input: unknown) {
  return createAnalyticsReportStore({ database: pool, observations: getAnalyticsRuntime(), authorizeCurrent }).getAnalytics(actor, input);
}
