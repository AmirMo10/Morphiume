import "server-only";
import { writeFile } from "node:fs/promises";
import { pool } from "./db";
import { getCommerce } from "./runtime";
import { createJobs } from "./jobs/service";
import { notifyOrderEvent } from "./jobs/notifications";
import { getConfig } from "./config";
import { recordJobEvent } from "./observability";
import { analyticsCaptureEnabled, closeAnalyticsRuntime, getAnalyticsRuntime } from "./analytics-runtime";
import { createNotificationEventDispatcher } from "./jobs/notification-events";
import { assertRuntimeSchema } from "./runtime-schema";

const notifications = createNotificationEventDispatcher({pool,deploymentEnv:getConfig().DEPLOYMENT_ENV});
const jobs = createJobs({pool,commerce:getCommerce(),dispatchNotificationEvent:notifications.dispatchNotificationEvent,
  notify:(type,payload,key)=>notifyOrderEvent(pool,getConfig().DEPLOYMENT_ENV,type,payload,key),
  onJobEvent: event => recordJobEvent({state:event.event,jobId:event.jobId,type:event.type,attemptNumber:event.attemptNumber,
    orderId:event.orderId,paymentAttemptId:event.paymentAttemptId})});
let stopped = false;
let nextAnalyticsCleanup = 0;
process.on("SIGTERM",()=>{stopped=true;});
process.on("SIGINT",()=>{stopped=true;});
async function main() {
  try {
  await assertRuntimeSchema(pool);
  while (!stopped) {
    try {
      const result = await jobs.tick();
      if (analyticsCaptureEnabled() && Date.now() >= nextAnalyticsCleanup) {
        nextAnalyticsCleanup = Date.now() + 10 * 60 * 1000;
        try { await getAnalyticsRuntime().cleanupExpired(500); }
        catch { console.error(JSON.stringify({ event: "analytics_cleanup_failed" })); }
      }
      if (process.env.WORKER_HEARTBEAT_PATH) await writeFile(process.env.WORKER_HEARTBEAT_PATH,new Date().toISOString());
      console.log(JSON.stringify({event:"worker_tick",...result}));
    }
    catch { console.error(JSON.stringify({event:"worker_tick_failed"})); }
    for(let i=0;i<15 && !stopped;i++) await new Promise(resolve=>setTimeout(resolve,1000));
  }
  } finally { try { await closeAnalyticsRuntime(); } finally { await pool.end(); } }
}
main().catch(()=>{console.error(JSON.stringify({event:"worker_failed"}));process.exitCode=1;});
