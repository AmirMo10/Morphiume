import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local", quiet: true });

/** Original public-schema read-only evidence; never outputs rows, contacts or credentials. */
export async function observationalBaseline() {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw || !["test", "staging"].includes(process.env.DEPLOYMENT_ENV ?? "") || process.env.PAYMENT_PROVIDER !== "mock" || process.env.SMS_PROVIDER !== "mock") throw new Error("Baseline requires controlled mock database");
  const address = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(address.hostname) || !/(?:^|_)(?:test|staging)(?:_|$)/.test(decodeURIComponent(address.pathname.slice(1)))) throw new Error("Baseline requires loopback test/staging database");
  const pool = new pg.Pool({ connectionString: raw, max: 1 }), q = await pool.connect();
  try {
    await q.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); await q.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = (await q.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const rows: { table: string; count: string; digest: string }[] = [];
    for (const { name } of tables) {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Unexpected baseline table identifier");
      const record = (await q.query<{ count: string; digest: string }>(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public."${name}" t`)).rows[0]!;
      rows.push({ table: name, ...record });
    }
    const migration = (await q.query<{ count: number; last: string; digest: string }>("SELECT count(*)::integer AS count,max(name) AS last,md5(string_agg(name||':'||checksum,'|' ORDER BY name)) AS digest FROM public.schema_migration")).rows[0]!;
    const schema = (await q.query<{ columns: string; constraints: string; indexes: string }>(`SELECT
      (SELECT md5(string_agg(table_name||':'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''),'|' ORDER BY table_name,ordinal_position)) FROM information_schema.columns WHERE table_schema='public') AS columns,
      (SELECT md5(string_agg(t.relname||':'||c.conname||':'||pg_get_constraintdef(c.oid),'|' ORDER BY t.relname,c.conname)) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public') AS constraints,
      (SELECT md5(string_agg(tablename||':'||indexname||':'||indexdef,'|' ORDER BY tablename,indexname)) FROM pg_indexes WHERE schemaname='public') AS indexes`)).rows[0]!;
    await q.query("COMMIT"); return { migration, schema, rows };
  } finally { await q.query("ROLLBACK"); q.release(); await pool.end(); }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("observational-baseline.ts")) void observationalBaseline().then(value => console.log(JSON.stringify(value))).catch(() => { console.error("Controlled baseline read failed"); process.exitCode = 1; });
