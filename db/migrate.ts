import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "dotenv";
import { classifyMigrationChecksum, migrationChecksums } from "./migration-checksum";
config({path:".env.local",quiet:true});

export async function migrate(databaseUrl: string,migrationDirectory=resolve(process.cwd(),"db/migrations")) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(714053018)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migration(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migration_checksum_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL REFERENCES schema_migration(name),old_checksum text NOT NULL,new_checksum text NOT NULL,reason text NOT NULL,database_role text NOT NULL DEFAULT current_user,occurred_at timestamptz NOT NULL DEFAULT now())");
    for (const name of (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = await readFile(resolve(migrationDirectory,name), "utf8");
      const {checksum,canonicalSql}=migrationChecksums(sql);
      const prior = await client.query<{checksum:string}>("SELECT checksum FROM schema_migration WHERE name=$1", [name]);
      if (prior.rows[0]) {
        const classification=classifyMigrationChecksum(sql,prior.rows[0].checksum);
        if(classification==="changed")throw new Error(`Applied migration changed: ${name}`);
        if(classification==="legacy-crlf"){
          await client.query("BEGIN");
          try{
            const changed=await client.query("UPDATE schema_migration SET checksum=$1 WHERE name=$2 AND checksum=$3",[checksum,name,prior.rows[0].checksum]);
            if(changed.rowCount!==1)throw new Error(`Migration checksum changed concurrently: ${name}`);
            await client.query("INSERT INTO schema_migration_checksum_audit(name,old_checksum,new_checksum,reason) VALUES($1,$2,$3,'Exact CRLF-to-LF canonicalization of identical migration text')",[name,prior.rows[0].checksum,checksum]);
            await client.query("COMMIT");
          }catch(error){await client.query("ROLLBACK");throw error;}
          console.log(`Canonicalized CRLF migration checksum: ${name}`);
        }
        continue;
      }
      await client.query("BEGIN");
      try { await client.query(canonicalSql); await client.query("INSERT INTO schema_migration(name,checksum) VALUES($1,$2)", [name,checksum]); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      console.log(`Applied ${name}`);
    }
  } finally { await client.query("SELECT pg_advisory_unlock(714053018)"); client.release(); await pool.end(); }
}
const migrationEntrypoint=process.argv[1]?.replaceAll("\\", "/");
if (migrationEntrypoint?.endsWith("db/migrate.ts") || migrationEntrypoint?.endsWith("migrate.mjs")) {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required");
  void migrate(url).catch((error:unknown)=>{console.error(error instanceof Error ? error.message : "Migration failed");process.exitCode=1;});
}
