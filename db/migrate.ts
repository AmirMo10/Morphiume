import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { config } from "dotenv";
config({path:".env.local",quiet:true});

export async function migrate(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(714053018)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migration(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of (await readdir(resolve(process.cwd(), "db/migrations"))).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = await readFile(resolve(process.cwd(), "db/migrations", name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query<{checksum:string}>("SELECT checksum FROM schema_migration WHERE name=$1", [name]);
      if (prior.rows[0]) { if (prior.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`); continue; }
      await client.query("BEGIN");
      try { await client.query(sql); await client.query("INSERT INTO schema_migration(name,checksum) VALUES($1,$2)", [name,checksum]); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      console.log(`Applied ${name}`);
    }
  } finally { await client.query("SELECT pg_advisory_unlock(714053018)"); client.release(); await pool.end(); }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("db/migrate.ts")) {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required");
  void migrate(url).catch((error:unknown)=>{console.error(error instanceof Error ? error.message : "Migration failed");process.exitCode=1;});
}
