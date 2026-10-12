import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { getConfig } from "./config";

const globalDb = globalThis as unknown as { morphiumePool?: Pool };
let localPool: Pool | undefined;
function getPool() {
  return localPool ??= globalDb.morphiumePool ??= new Pool({
    connectionString: getConfig().DATABASE_URL,
    max: process.env.WORKER_HEARTBEAT_PATH ? 3 : 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    application_name: process.env.WORKER_HEARTBEAT_PATH ? "morphiume-worker" : "morphiume-app",
  });
}
// Build imports must not need credentials. The first real operation validates config.
export const pool = new Proxy({} as Pool, {get(_target,key) { const actual=getPool(); const value=Reflect.get(actual,key); return typeof value === "function" ? value.bind(actual) : value; }});
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
function getDatabase() { return database ??= drizzle(getPool(), {schema}); }
export const db = new Proxy({} as ReturnType<typeof getDatabase>, {get(_target,key) { const actual=getDatabase(); const value=Reflect.get(actual,key); return typeof value === "function" ? value.bind(actual) : value; }});
