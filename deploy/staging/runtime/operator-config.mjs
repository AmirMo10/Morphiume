// Spawn a fresh operator/QA process with one validated canonical runtime profile.
// Never source shell text or print private values. The general QA guard remains.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export function canonicalHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function canonicalJson(value) {
  return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key] && typeof value[key] === 'object' && !Array.isArray(value[key]) ? JSON.parse(canonicalJson(value[key])) : value[key]])));
}

export function validateOperatorConfigs(app, connections, profile, trusted) {
  const origins = { 'ssh-localhost': 'http://localhost:3100', 'private-ip': 'http://192.168.240.51' };
  const profileKeys = ['version', 'profile', 'origin', 'sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256', 'opsSha256', 'opsRoot', 'configSha256', 'runtimeImageId', 'engineProofSha256'];
  if (!profile || typeof profile !== 'object' || Object.keys(profile).sort().join(',') !== profileKeys.sort().join(',') || profile.version !== 2 || !Object.hasOwn(origins, profile.profile) || profile.origin !== origins[profile.profile] || canonicalHash(profile) !== trusted.accessProfileSha256 || !/^sha256:[a-f0-9]{64}$/.test(profile.runtimeImageId) || !/^[a-f0-9]{64}$/.test(profile.engineProofSha256)) throw Error('Untrusted runtime access profile');
  if (!profile.configSha256 || Object.keys(profile.configSha256).sort().join(',') !== 'app.json,migration.json,worker.json' || Object.values(profile.configSha256).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw Error('Untrusted runtime config binding');
  for (const [key, pattern] of Object.entries({ sourceCommit: /^[a-f0-9]{40}$/, testedPlatformConfig: /^sha256:[a-f0-9]{64}$/, candidateManifestDigest: /^sha256:[a-f0-9]{64}$/, archiveSha256: /^[a-f0-9]{64}$/, opsSha256: /^[a-f0-9]{64}$/ })) {
    if (typeof trusted[key] !== 'string' || !pattern.test(trusted[key]) || profile[key] !== trusted[key]) throw Error('Untrusted runtime release identity');
  }
  if (profile.opsRoot !== `/srv/morphiume/staging/runtime/releases/${profile.sourceCommit}/ops-bundles/${profile.opsSha256}/ops`) throw Error('Untrusted runtime Ops path');
  if (!app || Object.keys(app).sort().join(',') !== 'ADMIN_AUTH_SECRET,APP_BASE_URL,AUTH_SECRET,DATABASE_URL,MEDIA_ROOT,MOCK_CONTROL_SECRET,PAYMENT_PROVIDER,SMS_PROVIDER' || Object.values(app).some(value => typeof value !== 'string' || value.includes('\0')) || app.APP_BASE_URL !== profile.origin || app.MEDIA_ROOT !== '/app/media' || app.PAYMENT_PROVIDER !== 'mock' || app.SMS_PROVIDER !== 'mock') throw Error('Invalid isolated runtime configuration');
  if (canonicalHash(app) !== profile.configSha256?.['app.json']) throw Error('Private runtime config differs from profile');
  const keys = [app.AUTH_SECRET, app.ADMIN_AUTH_SECRET, app.MOCK_CONTROL_SECRET];
  if (new Set(keys).size !== 3 || keys.some(value => !/^[a-f0-9]{64}$/.test(value))) throw Error('Invalid independent runtime keys');
  const match = /^postgresql:\/\/morphiume_runtime_app:([a-f0-9]{64})@db:5432\/morphiume_staging_runtime$/.exec(app.DATABASE_URL);
  if (!match || !connections || Object.keys(connections).sort().join(',') !== 'databaseUrl,migrationDatabaseUrl' || connections.databaseUrl !== `postgresql://morphiume_runtime_app:${match[1]}@127.0.0.1:15434/morphiume_staging_runtime` || !/^postgresql:\/\/morphiume_runtime_owner:[a-f0-9]{64}@127\.0\.0\.1:15434\/morphiume_staging_runtime$/.test(connections.migrationDatabaseUrl)) throw Error('Wrong database/role/tunnel or URI override');
  // Owner credentials do not enter an ordinary browser/load process.
  return { ...app, DATABASE_URL: connections.databaseUrl, APP_BASE_URL: profile.origin, E2E_BASE_URL: profile.origin, NODE_ENV: 'production', DEPLOYMENT_ENV: 'staging' };
}

function privateJson(name) {
  const local = resolve(fileURLToPath(new URL('../.local/', import.meta.url)));
  const path = join(local, name);
  const stat = lstatSync(path);
  if (realpathSync(local) !== local || realpathSync(path) !== path || !stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || process.platform !== 'win32' && (stat.mode & 0o077)) throw Error('Unprotected operator handoff file');
  if (process.platform === 'win32' && process.env.MORPHIUME_PRIVATE_ACL_VERIFIED !== '1') throw Error('Coordinator must verify Windows private file ACLs before use');
  return JSON.parse(readFileSync(path, 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const separator = process.argv.indexOf('--');
    if (separator !== 14 || process.argv.length <= separator + 1) throw Error('Provide six explicit trusted identities then -- command');
    const fields = ['sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256', 'opsSha256', 'accessProfileSha256'];
    const flags = ['--source', '--config-id', '--manifest-digest', '--archive-sha256', '--ops-sha256', '--profile-sha256'];
    const trusted = Object.fromEntries(fields.map((field, index) => {
      if (process.argv[2 + index * 2] !== flags[index]) throw Error('Unexpected trusted identity argument');
      return [field, process.argv[3 + index * 2]];
    }));
    const env = validateOperatorConfigs(privateJson('runtime-app.json'), privateJson('runtime-connections.json'), privateJson('runtime-profile.json'), trusted);
    const processEnv = { ...process.env };
    for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'APP_BASE_URL', 'E2E_BASE_URL', 'AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'ZARINPAL_MERCHANT_ID', 'SMS_API_KEY', 'SMS_SERVICE_TEMPLATE', 'PUBLIC_SITE_URL', 'OBJECT_STORAGE_ENDPOINT']) delete processEnv[key];
    const child = spawn(process.argv[separator + 1], process.argv.slice(separator + 2), { env: { ...processEnv, ...env }, stdio: 'inherit', shell: false, windowsHide: true });
    child.on('error', () => { process.stderr.write('Operator process failed to start.\n'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } catch {
    process.stderr.write('Operator target/config validation failed; private values withheld.\n');
    process.exitCode = 1;
  }
}
