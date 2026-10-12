// Reviewed maintenance guard, mounted read-only from the hashed ops bundle.
// No fixture, migration or grant is touched until the actual target is checked.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

export function validateTarget(value, mode) {
  if (!['check-app', 'check-owner', 'migrate', 'seed'].includes(mode)) throw new Error('Invalid operation');
  const role = ['check-owner', 'migrate'].includes(mode) ? 'morphiume_runtime_owner' : 'morphiume_runtime_app';
  const url = new URL(value);
  if (url.protocol !== 'postgresql:' || url.hostname !== 'db' || url.port !== '5432' ||
      url.pathname !== '/morphiume_staging_runtime' || decodeURIComponent(url.username) !== role ||
      !url.password || value.includes('?') || value.includes('#')) throw new Error('Unexpected runtime target');
  return role;
}

export function validateIdentity(row, role) {
  if (row.database !== 'morphiume_staging_runtime' || row.role !== role || row.superuser || row.createdb ||
      row.createrole || row.replication || row.bypassrls || row.old_owner_member || row.old_app_member ||
      row.schema_create !== (role === 'morphiume_runtime_owner')) throw new Error('Runtime identity or privilege boundary failed');
}

async function main() {
  const mode = process.argv[2];
  const role = validateTarget(process.env.DATABASE_URL, mode);
  if (process.env.DEPLOYMENT_ENV !== 'staging' || process.env.MIGRATION_DATABASE_URL) throw new Error('Unexpected maintenance environment');
  const require = createRequire('/app/server.js');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query(`SELECT current_database() AS database, current_user AS role,
      rolsuper AS superuser, rolcreatedb AS createdb, rolcreaterole AS createrole,
      rolreplication AS replication, rolbypassrls AS bypassrls,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      pg_has_role(current_user,'morphiume_staging_owner','MEMBER') AS old_owner_member,
      pg_has_role(current_user,'morphiume_staging_app','MEMBER') AS old_app_member
      FROM pg_roles WHERE rolname=current_user`);
    validateIdentity(rows[0] ?? {}, role);
  } finally {
    await pool.end();
  }
  if (mode.startsWith('check-')) {
    console.log('Actual fresh runtime database, role and administrative boundary verified.');
    return;
  }
  const child = spawn(process.execPath, ['--conditions=react-server', `/app/runtime/${mode}.mjs`], { stdio: 'inherit', env: process.env });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1);
      resolve();
    });
  });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/db-target.mjs')) {
  main().catch(() => { console.error('Fresh runtime target guard or maintenance command failed.'); process.exitCode = 1; });
}
