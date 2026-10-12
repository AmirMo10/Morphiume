import { request } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accepted, origin, fixturePath, checkNames, validateTarget, validateFixture, checkedFile, privateJson, observedNative, sha256, safeFailure, fail } from './restore-business-contract.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const wholeBudgetMs = 600000; // Engineering bound, not a measured recovery time.
function assure(condition, code = 'business-mismatch') { if (!condition) fail(code); }
async function json(response, expectedStatus = 200) {
  assure(response.status() === expectedStatus, 'http-status');
  const body = await response.body(); assure(body.length <= 65536, 'response-shape');
  try { return JSON.parse(body.toString('utf8')); } catch { fail('response-shape'); }
}
function remaining(deadline, maximum) { const left = deadline - performance.now(); if (left <= 0) fail('deadline'); return Math.max(1, Math.min(Math.floor(left), maximum)); }

async function remote(target, fixture, action, deadline) {
  const source = checkedFile(resolve(directory, 'restore-business-remote.py'), { maximum: 65536, privateFile: false });
  const encoded = Buffer.from(JSON.stringify({ action, target, fixture })).toString('base64');
  const input = `import base64,json\nREQUEST=json.loads(base64.b64decode('${encoded}'))\n` + source.toString('utf8');
  return new Promise((accept, reject) => {
    // Only a fixed command is sent. Fixture identities/control secret are never
    // shell arguments, local environment overrides, output or error messages.
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(?:DATABASE_URL|MIGRATION_DATABASE_URL|AUTH_SECRET|ADMIN_AUTH_SECRET|MOCK_CONTROL_SECRET|APP_BASE_URL|E2E_BASE_URL|COMPOSE_|DOCKER_|MORPHIUME_)/u.test(key)) delete env[key];
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'morphiume-deploy', "python3 -c 'import sys; exec(sys.stdin.read())'"], { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = []; let size = 0, stopped = false;
    const stop = code => { if (stopped) return; stopped = true; child.kill(); const error = new Error('Private restore transport stopped.'); error.safeCode = code; reject(error); };
    const timer = setTimeout(() => stop('deadline'), remaining(deadline, 180000));
    child.stdout.on('data', value => { size += value.length; if (size > 65536) stop('output-bound'); else chunks.push(value); });
    child.on('error', () => stop('ssh'));
    child.stdin.on('error', () => stop('ssh'));
    child.on('close', code => {
      clearTimeout(timer); if (stopped) return;
      if (code !== 0) { stop('ssh'); return; }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assure(value?.mode === 'restore-identity-and-readonly-snapshot' && ['restoreConfigSha256', 'readyRecordSha256', 'journalSha256'].every(k => typeof value[k] === 'string' && /^[a-f0-9]{64}$/u.test(value[k])), 'response-shape');
        accept(value);
      } catch { stop('response-shape'); }
    });
    child.stdin.end(input);
  });
}

function validateSnapshot(snapshot, fixture) {
  const expected = fixture.expected;
  assure(snapshot?.database === 'morphiume_staging_restore' && snapshot.role === 'morphiume_restore_app' && snapshot.roleSafe === true && snapshot.ddlDenied === true);
  assure(typeof snapshot.customerId === 'string' && snapshot.customerId.length <= 100);
  assure(snapshot.order?.paymentStatus === expected.paymentStatus && snapshot.order.committed === true);
  assure(Array.isArray(snapshot.items) && snapshot.items.length === 1 && snapshot.items[0].productMatches === true && snapshot.items[0].quantity === 1 && snapshot.items[0].price === expected.unitPriceIrr && snapshot.items[0].lineTotal === expected.unitPriceIrr);
  assure(Array.isArray(snapshot.attempts) && snapshot.attempts.length === 1 && snapshot.attempts[0].provider === 'mock' && snapshot.attempts[0].status === 'succeeded' && /^MOCK-[a-f0-9-]{36}$/u.test(snapshot.attempts[0].authority));
  assure(snapshot.receipts === 1 && snapshot.primaryReceipts === 1 && snapshot.receiptAmount === snapshot.order.total && snapshot.commitments === 1 && snapshot.commitDelta === -1);
  assure(snapshot.activeReservations === 0 && snapshot.consumedReservations === 1 && Array.isArray(snapshot.balances) && snapshot.balances.length === 1 && snapshot.balances[0].onHand === expected.stockOnHand && snapshot.balances[0].reserved === expected.stockReserved);
  assure(snapshot.shipments === 1 && snapshot.shipment?.status === 'shipped' && snapshot.shipment.trackingMatches === true && snapshot.shipment.carrierPresent === true);
}
function ownedOrder(value, snapshot, fixture) {
  const order = value?.data;
  assure(order?.id === fixture.orderId && order.paymentStatus === fixture.expected.paymentStatus);
  for (const key of ['subtotal', 'discount', 'shipping', 'tax', 'total']) assure(order[key]?.currency === 'IRR' && order[key].amountIrr === snapshot.order[key]);
  assure(Array.isArray(order.items) && order.items.length === 1 && order.items[0].quantity === 1 && order.items[0].unitPrice?.amountIrr === fixture.expected.unitPriceIrr && order.items[0].lineTotal?.amountIrr === fixture.expected.unitPriceIrr);
  assure(order.shipment?.status === 'shipped' && order.shipment.trackingCode === fixture.expected.trackingCode);
}
function privateResult(directory, name, result) {
  const path = resolve(directory, name);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  assure(!stat.isSymbolicLink() && realpathSync(directory) === directory && (process.platform === 'win32' ? process.env.MORPHIUME_PRIVATE_ACL_VERIFIED === '1' : (stat.mode & 0o077) === 0), 'private-permissions');
  try { writeFileSync(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch { fail('result-exists'); }
}

export async function run(targetPath) {
  let stage = 'identity', context;
  const started = performance.now(), startedAt = new Date().toISOString(), deadline = started + wholeBudgetMs;
  const nativeStatuses = [], checks = [];
  try {
    const target = validateTarget(privateJson(targetPath));
    const fixtureBytes = checkedFile(fixturePath), fixture = validateFixture(JSON.parse(fixtureBytes.toString('utf8')));
    assure(sha256(fixtureBytes) === target.recovery.fixtureSha256, 'business-mismatch');
    const resultPath = resolve(dirname(fixturePath), `restore-business-result-${target.restoreProject}.json`);
    assure(!existsSync(resultPath), 'result-exists');
    const before = await remote(target, fixture, 'inspect', deadline);
    validateSnapshot(before.snapshot, fixture);
    assure(typeof before.mockControlSecret === 'string' && /^[a-f0-9]{64}$/u.test(before.mockControlSecret), 'response-shape');
    context = await request.newContext({ baseURL: origin, timeout: 10000, extraHTTPHeaders: { Origin: origin } });
    const ready = await context.get('/api/health/ready');
    assure(ready.status() === 200 && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(ready.headers()['x-request-id'] ?? ''), 'http-status');
    stage = 'native-login';
    await observedNative(() => context.post('/api/auth/phone-number/send-otp', { data: { phoneNumber: fixture.phone }, timeout: remaining(deadline, 10000) }), { stage: 'customer-otp-send', deadline, record: item => nativeStatuses.push(item) });
    await observedNative(async () => {
      const inbox = await json(await context.get(`/api/test/otp?phone=${encodeURIComponent(fixture.phone)}`, { headers: { 'x-morphiume-test-secret': before.mockControlSecret }, timeout: remaining(deadline, 10000) }));
      assure(typeof inbox.data?.code === 'string' && /^\d{6}$/u.test(inbox.data.code), 'response-shape');
      return context.post('/api/auth/phone-number/verify', { data: { phoneNumber: fixture.phone, code: inbox.data.code }, timeout: remaining(deadline, 10000) });
    }, { stage: 'customer-otp-verify', deadline, record: item => nativeStatuses.push(item) });
    const session = await json(await context.get('/api/auth/get-session'));
    assure(session?.user?.id === before.snapshot.customerId && session.user.phoneNumber === fixture.phone && session.user.phoneNumberVerified === true);
    const cookies = (await context.storageState()).cookies;
    assure(cookies.some(c => c.httpOnly && c.name === 'morphiume-customer.session_token' && c.domain === 'localhost' && c.path === '/'), 'response-shape');
    checks.push(stage);
    stage = 'owned-order';
    const response = await context.get(`/api/orders/${fixture.orderId}`);
    assure(/no-store/u.test(response.headers()['cache-control'] ?? ''));
    ownedOrder(await json(response), before.snapshot, fixture); checks.push(stage);
    stage = 'payment-dedup';
    const authority = before.snapshot.attempts[0].authority;
    const repeated = await json(await context.post(`/api/test/payments/${authority}`, { data: { outcome: 'succeeded' } }));
    assure(repeated.data?.orderId === fixture.orderId && repeated.data?.paymentStatus === 'paid');
    const callback = await context.get(`/api/payments/mock/callback?Authority=${encodeURIComponent(authority)}`, { maxRedirects: 0 });
    assure(callback.status() === 303 && callback.headers().location === `${origin}/orders/${fixture.orderId}`, 'http-status');
    const after = await remote(target, fixture, 'snapshot', deadline);
    validateSnapshot(after.snapshot, fixture);
    assure(['restoreConfigSha256', 'readyRecordSha256', 'journalSha256'].every(k => after[k] === before[k]) && JSON.stringify(after.snapshot) === JSON.stringify(before.snapshot));
    checks.push(stage);
    stage = 'stock-reservation'; checks.push(stage); // Actual before/after SQL proof above.
    stage = 'shipment-tracking'; ownedOrder(await json(await context.get(`/api/orders/${fixture.orderId}`)), after.snapshot, fixture); checks.push(stage);
    stage = 'media-sha256';
    for (const media of fixture.media) {
      const response = await fetch(new URL(media.url, origin), { signal: AbortSignal.timeout(remaining(deadline, 10000)) });
      assure(response.status === 200 && response.headers.get('content-type')?.split(';')[0] === 'image/webp', 'http-status');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 4 * 1024 * 1024) { await response.body.cancel().catch(() => {}); fail('output-bound'); } chunks.push(chunk); }
      assure(size > 0 && sha256(Buffer.concat(chunks)) === media.sha256);
    }
    checks.push(stage); assure(checks.length === 6 && checks.every((name, i) => name === checkNames[i]));
    const completedAt = new Date().toISOString(), durationMs = performance.now() - started;
    const result = { formatVersion: 1, mode: 'six-business-checks-passed', startedAt, completedAt, durationMs, target: { restoreProject: target.restoreProject, restoreRoot: target.restoreRoot, backupDirectory: target.backupDirectory, baseURL: origin, identity: accepted, recovery: target.recovery }, fixtureSha256: sha256(fixtureBytes), restoreConfigSha256: before.restoreConfigSha256, readyRecordSha256: before.readyRecordSha256, journalSha256: before.journalSha256, checks, nativeStatuses, workerStarted: false, recoveryMarkerWritten: false };
    privateResult(resolve(dirname(fixturePath)), `restore-business-result-${target.restoreProject}.json`, result);
    const safe = { mode: 'six-business-checks-passed', checks: checks.length, durationMs, nativeStatuses, workerStarted: false, recoveryMarkerWritten: false };
    process.stdout.write(JSON.stringify(safe) + '\n');
    return result;
  } catch (error) { process.stdout.write(JSON.stringify(safeFailure(error, stage)) + '\n'); throw new Error('Restore acceptance failed; private context withheld.'); }
  finally { if (context) await context.dispose(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply') {
    process.stdout.write(JSON.stringify({ mode: 'unexecuted-plan', checks: checkNames, target: origin, budgetMs: wholeBudgetMs }) + '\n');
  } else {
    run(process.argv[3]).catch(() => { process.exitCode = 1; });
  }
}
