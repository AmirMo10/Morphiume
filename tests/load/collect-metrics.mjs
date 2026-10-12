import { spawn } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (!["test", "staging"].includes(process.env.DEPLOYMENT_ENV ?? "")) throw new Error("Resource evidence is restricted to isolated Morphiume staging");
const database = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.endsWith("morphiume_staging")) throw new Error("Use the private staging DB tunnel for resource evidence");
const duration = Number(process.argv.find(arg => arg.startsWith("--duration="))?.slice(11) ?? 1800);
if (!Number.isInteger(duration) || duration < 15 || duration > 7200) throw new Error("Metrics duration must be 15–7200 seconds");
await mkdir("test-results/load", { recursive: true });
const output = resolve(`test-results/load/resources-${Date.now()}.jsonl`);
const pool = new pg.Pool({ connectionString: database.toString(), max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
function dockerStats() {
  return new Promise(resolveStats => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8", "morphiume-deploy", "docker stats --no-stream --format '{{json .}}'"], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", chunk => { if (output.length < 100_000) output += chunk.toString(); });
    const deadline = setTimeout(() => child.kill(), 12_000);
    child.on("error", () => { clearTimeout(deadline); resolveStats({ error: "ssh_start_failed" }); });
    child.on("exit", code => {
      clearTimeout(deadline);
      if (code) { resolveStats({ error: "ssh_stats_failed" }); return; }
      try {
        const containers = output.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).filter(row => row.Name?.includes("morphiume-staging")).map(row => ({ name: row.Name, cpu: row.CPUPerc, memory: row.MemUsage, memoryPercent: row.MemPerc, pids: row.PIDs, network: row.NetIO, blockIo: row.BlockIO }));
        resolveStats({ containers });
      } catch { resolveStats({ error: "stats_parse_failed" }); }
    });
  });
}
console.log(`Collecting sanitized Docker/PG/outbox resource evidence for ${duration}s: ${output}`);
const started = Date.now();
let samples = 0;
try {
  while (!stopping && Date.now() - started < duration * 1000) {
    const timestamp = new Date().toISOString();
    const [containers, databaseStats] = await Promise.all([
      dockerStats(),
      (async () => {
        try {
          const activity = await pool.query("SELECT coalesce(state,'restricted') AS state,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state");
          const locks = await pool.query("SELECT locktype,granted,count(*)::int AS count FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) GROUP BY locktype,granted");
          const queue = await pool.query("SELECT status,count(*)::int AS count,coalesce(max(extract(epoch FROM(now()-created_at))),0)::int AS oldestAgeSeconds FROM outbox_job WHERE status IN('pending','running','dead') GROUP BY status");
          return { activity: activity.rows, locks: locks.rows, queue: queue.rows };
        } catch (error) { return { error: typeof error.code === "string" ? error.code : "db_metrics_failed" }; }
      })(),
    ]);
    await appendFile(output, `${JSON.stringify({ timestamp, elapsedSeconds: Math.round((Date.now() - started) / 1000), docker: containers, database: databaseStats })}\n`);
    samples++;
    if (samples % 4 === 0) console.log(`Resource samples recorded: ${samples}; elapsed ${Math.round((Date.now() - started) / 1000)}s`);
    if (!stopping) await sleep(15_000);
  }
} finally { await pool.end(); }
console.log(`Resource collection ended with ${samples} samples; no SQL text, phone, cookie, password, or payment payload recorded.`);
