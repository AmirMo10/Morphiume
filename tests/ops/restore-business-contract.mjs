import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Deliberately release-specific. This does not widen any generic QA DB guard.
export const accepted = Object.freeze({
  sourceCommit: '6130f4ed7ec090344a5a4a1937a65ef04572975b',
  testedPlatformConfig: 'sha256:8a5600eeaafa7de6293aadc2807843f13b269244bb583e4d04e90295adbc1968',
  candidateManifestDigest: 'sha256:d5bb24a403247f4d42345bef6c9b7b9788a84962c6f44336167af832e3d5f9be',
  archiveSha256: 'd6df8cd57720187fddbc47c279d9df306cc41620d304b270716a87ab196b6cb9',
  opsSha256: '591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db',
  runtimeImageId: 'sha256:ad5c0e3d9537e3380051d32528d2f07b9b804b5c9b73f1df7c2a69cc733a24c0',
  engineProofSha256: 'c6f83e325dcae50f2f84bfac08b874850946f454325ba729bcc38953060bdad7',
  accessProfileSha256: '3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c',
});
export const origin = 'http://localhost:3101';
export const fixturePath = 'S:/Morphiume-runtime-613/.local/restore-acceptance.json';
export const opsRoot = `/srv/morphiume/staging/runtime/releases/${accepted.sourceCommit}/ops-bundles/${accepted.opsSha256}/ops`;
export const recoveryCase = Object.freeze({
  project: 'morphiume-runtime-restore-20261012t212729z-d03c35',
  root: '/srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261012T212729Z-d03c35',
  backup: '/srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce',
  toolSha256: '9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d',
});
export const checkNames = Object.freeze(['native-login', 'owned-order', 'payment-dedup', 'stock-reservation', 'shipment-tracking', 'media-sha256']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hash = /^[a-f0-9]{64}$/u;
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, expected) { return plain(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(','); }
export function fail(code = 'contract') { const error = new Error('Restore acceptance stopped; private details withheld.'); error.safeCode = code; throw error; }
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export function validateTarget(value) {
  if (!keys(value, ['restoreProject', 'restoreRoot', 'backupDirectory', 'baseURL', 'identity', 'recovery']) || value.baseURL !== origin || !keys(value.identity, Object.keys(accepted)) || Object.entries(accepted).some(([k, v]) => value.identity[k] !== v)) fail('target');
  if (value.restoreProject !== recoveryCase.project || value.restoreRoot !== recoveryCase.root) fail('project');
  if (value.backupDirectory !== recoveryCase.backup) fail('backup-path');
  if (!keys(value.recovery, ['toolSourceCommit', 'toolSha256', 'fixtureSha256', 'backupManifestSha256']) || typeof value.recovery.toolSourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.recovery.toolSourceCommit) || value.recovery.toolSha256 !== recoveryCase.toolSha256 || !hash.test(value.recovery.fixtureSha256) || !hash.test(value.recovery.backupManifestSha256)) fail('target');
  return { ...value, opsRoot };
}
export function validateFixture(value) {
  if (!keys(value, ['fixtureId', 'createdAt', 'baseURL', 'phone', 'orderId', 'productId', 'media', 'expected']) || !uuid.test(value.fixtureId) || !uuid.test(value.orderId) || !uuid.test(value.productId) || value.baseURL !== 'http://localhost:3100' || typeof value.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt || typeof value.phone !== 'string' || !/^\+989\d{9}$/u.test(value.phone)) fail('fixture');
  if (!keys(value.expected, ['paymentStatus', 'stockOnHand', 'stockReserved', 'receipts', 'shipments', 'trackingCode', 'unitPriceIrr']) || value.expected.paymentStatus !== 'paid' || value.expected.stockOnHand !== 2 || value.expected.stockReserved !== 0 || value.expected.receipts !== 1 || value.expected.shipments !== 1 || value.expected.unitPriceIrr !== '1234560' || value.expected.trackingCode !== `QA-TRACK-${value.fixtureId.slice(0, 8)}`) fail('fixture-expectation');
  if (!Array.isArray(value.media) || value.media.length !== 1 || value.media.some(m => !keys(m, ['url', 'sha256']) || typeof m.url !== 'string' || !/^\/media\/[a-f0-9-]{36}\.webp$/u.test(m.url) || !uuid.test(m.url.slice(7, -5)) || typeof m.sha256 !== 'string' || !hash.test(m.sha256))) fail('media-target');
  return value;
}

// Nonfollowing component-by-component checks also reject junctions/symlinked parents.
export function checkedFile(path, { maximum = 65536, privateFile = true, aclVerified = process.env.MORPHIUME_PRIVATE_ACL_VERIFIED === '1' } = {}) {
  const exact = resolve(path);
  for (let part = exact; ; part = dirname(part)) {
    const stat = lstatSync(part);
    if (stat.isSymbolicLink() || realpathSync(part) !== part) fail('linked-path');
    if (part === dirname(part)) break;
  }
  const stat = lstatSync(exact);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maximum) fail('file-bound');
  if (privateFile && (process.platform === 'win32' ? !aclVerified : (stat.mode & 0o077) !== 0)) fail('private-permissions');
  return readFileSync(exact);
}
export function privateJson(path, options) {
  try { return JSON.parse(checkedFile(path, options).toString('utf8')); }
  catch (error) { if (error.safeCode) throw error; fail('private-json'); }
}
export function retrySeconds(headers) {
  for (const header of ['retry-after', 'x-retry-after']) {
    const raw = headers[header];
    if (raw === undefined) continue;
    if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/u.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) > 60) fail('retry-header');
    return { seconds: Math.ceil(Number(raw)), header };
  }
  fail('retry-header'); // Missing timing never guesses a new interval for this rehearsal.
}
export async function observedNative(action, { stage, deadline, clock = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), record = () => {} }) {
  if (!['customer-otp-send', 'customer-otp-verify'].includes(stage) || !Number.isFinite(deadline)) fail('contract');
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (clock() >= deadline) fail('deadline');
    const response = await action();
    const status = response.status();
    if (!Number.isInteger(status) || status < 100 || status > 599) fail('native-status');
    if (status === 429) {
      const interval = retrySeconds(response.headers());
      record({ stage, attempt, status, retryAfterSeconds: interval.seconds, retryAfterHeader: interval.header });
      if (attempt === 2) fail('native-status');
      let remaining = interval.seconds * 1000 + 250;
      if (clock() + remaining >= deadline) fail('deadline');
      while (remaining > 0) { const step = Math.min(remaining, 60000); await sleep(step); remaining -= step; }
      continue;
    }
    record({ stage, attempt, status, retryAfterSeconds: null, retryAfterHeader: 'absent' });
    if (status !== 200) fail('native-status');
    return response;
  }
  fail('native-status');
}
export function safeFailure(error, stage) { return { mode: 'failed', stage: checkNames.includes(stage) ? stage : 'identity', code: ['contract', 'target', 'project', 'backup-path', 'fixture', 'fixture-expectation', 'media-target', 'linked-path', 'file-bound', 'private-permissions', 'private-json', 'retry-header', 'native-status', 'deadline', 'http-status', 'response-shape', 'business-mismatch', 'ssh', 'output-bound', 'result-exists'].includes(error?.safeCode) ? error.safeCode : 'operation' }; }
