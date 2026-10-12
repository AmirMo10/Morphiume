import "server-only";
import { writeFile } from "node:fs/promises";
import { pool } from "./db";
import { getCommerce } from "./runtime";
import { createJobs } from "./jobs/service";
import { notifyOrderEvent } from "./jobs/notifications";
import { getConfig } from "./config";

const jobs = createJobs({pool,commerce:getCommerce(),notify:(type,payload,key)=>notifyOrderEvent(pool,getConfig().DEPLOYMENT_ENV,type,payload,key)});
let stopped = false;
process.on("SIGTERM",()=>{stopped=true;});
process.on("SIGINT",()=>{stopped=true;});
async function main() {
  while (!stopped) {
    try { const result = await jobs.tick(); if (process.env.WORKER_HEARTBEAT_PATH) await writeFile(process.env.WORKER_HEARTBEAT_PATH,new Date().toISOString()); console.log(JSON.stringify({event:"worker_tick",...result})); }
    catch(error) { console.error(JSON.stringify({event:"worker_tick_failed",kind:error instanceof Error?error.name:"unknown"})); }
    for(let i=0;i<15 && !stopped;i++) await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await pool.end();
}
main().catch(()=>{console.error(JSON.stringify({event:"worker_failed"}));process.exitCode=1;});
