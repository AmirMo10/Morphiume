import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { accepted, recoveryCase, validateTarget, validateFixture, checkedFile, privateJson, retrySeconds, observedNative, safeFailure } from './restore-business-contract.mjs';

const target = () => ({ restoreProject: recoveryCase.project, restoreRoot: recoveryCase.root, backupDirectory: recoveryCase.backup, baseURL: 'http://localhost:3101', identity: { ...accepted }, recovery: { toolSourceCommit: 'f'.repeat(40), toolSha256: recoveryCase.toolSha256, fixtureSha256: 'a'.repeat(64), backupManifestSha256: 'b'.repeat(64) } });
const fixture = () => ({ fixtureId: '12345678-1234-4123-8123-123456789abc', orderId: '22345678-1234-4123-8123-123456789abc', productId: '32345678-1234-4123-8123-123456789abc', createdAt: '2026-10-12T21:24:28.796Z', baseURL: 'http://localhost:3100', phone: '+989000000001', media: [{ url: '/media/42345678-1234-4123-8123-123456789abc.webp', sha256: 'a'.repeat(64) }], expected: { paymentStatus: 'paid', stockOnHand: 2, stockReserved: 0, receipts: 1, shipments: 1, trackingCode: 'QA-TRACK-12345678', unitPriceIrr: '1234560' } });
test('Exact restore-only release accepted; runtime/original target never added', () => {
  const checked = validateTarget(target());
  assert.equal(checked.restoreRoot, recoveryCase.root);
  assert.match(checked.opsRoot, /ops-bundles\/591ad921/u);
  assert.equal(validateFixture(fixture()).expected.unitPriceIrr, '1234560');
});
for (const baseURL of ['http://127.0.0.1:3101', 'http://localhost:3100', 'https://localhost:3101', 'http://localhost:3101/', 'http://localhost:3101/?host=live', 'http://user:password@localhost:3101', 'http://192.168.240.51:3101', 'http://localhost.evil:3101']) test(`Origin mutation ${baseURL.includes('password') ? 'credential' : new URL(baseURL).hostname + '-' + new URL(baseURL).port + '-' + baseURL.length} rejected`, () => assert.throws(() => validateTarget({ ...target(), baseURL })));
for (const key of Object.keys(accepted)) test(`Mismatched immutable ${key} rejected`, () => { const v = target(); v.identity[key] = '0'.repeat(64); assert.throws(() => validateTarget(v)); });
for (const project of ['morphiume-staging-runtime', 'morphiume-runtime-restore-20261012t213000z-abcdef', '../morphiume-runtime-restore-20261012T213000Z-abcdef', 'morphiume-runtime-restore-20261012T213000Z-abcdef;id']) test(`Project boundary case${project.length} rejected`, () => assert.throws(() => validateTarget({ ...target(), restoreProject: project })));
for (const backupDirectory of ['/srv/morphiume/staging/backups/20261012T212644Z-fe6ca5ce', '/srv/morphiume/staging/runtime/backups/../restore/20261012T212644Z-fe6ca5ce', '/srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce/extra', '/srv/morphiume/staging/runtime/backups/%32%30%32%36%31%30%31%32T212644Z-fe6ca5ce']) test(`Backup boundary case${backupDirectory.length} rejected`, () => assert.throws(() => validateTarget({ ...target(), backupDirectory })));
for (const [name, mutate] of [
  ['SQL identifier injection', v => { v.orderId = "x';SELECT 1;--"; }],
  ['OTP/contact injection', v => { v.phone += '?token=canary'; }],
  ['extra private field', v => { v.token = 'canary'; }],
  ['invalid calendar date', v => { v.createdAt = '2026-02-31T21:24:28.796Z'; }],
  ['stock zero accepted incorrectly', v => { v.expected.stockOnHand = 0; }],
  ['unpaid fixture', v => { v.expected.paymentStatus = 'pending'; }],
  ['wrong tracking fixture', v => { v.expected.trackingCode = 'canary'; }],
  ['media traversal', v => { v.media[0].url = '/media/../private.key'; }],
  ['remote media', v => { v.media[0].url = 'http://example.invalid/media.webp'; }],
  ['unbounded media list', v => { v.media.push(v.media[0]); }],
]) test(`${name} fails closed`, () => { const v = fixture(); mutate(v); assert.throws(() => validateFixture(v)); });

test('Private file size, syntax, symlinked parent and ACL gate are enforced', () => {
  const base = resolve('.local'); mkdirSync(base, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(resolve(base, 'restore-contract-test-'));
  try {
    const file = resolve(root, 'fixture.json'); writeFileSync(file, JSON.stringify({ dummy: true }), { mode: 0o600 });
    assert.deepEqual(privateJson(file, { aclVerified: true }), { dummy: true });
    assert.throws(() => checkedFile(file, { maximum: 2, aclVerified: true }));
    if (process.platform === 'win32') assert.throws(() => checkedFile(file, { aclVerified: false }));
    const child = resolve(root, 'actual'); mkdirSync(child); writeFileSync(resolve(child, 'data'), 'dummy', { mode: 0o600 });
    const link = resolve(root, 'linked'); symlinkSync(child, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => checkedFile(resolve(link, 'data'), { aclVerified: true }));
    writeFileSync(file, '{invalid', { mode: 0o600 }); assert.throws(() => privateJson(file, { aclVerified: true }));
  } finally { assert.equal(dirname(root), base); rmSync(root, { recursive: true, force: true }); }
});
for (const raw of ['-1', '61', 'Infinity', 'NaN', 'Wed, 21 Oct 2030 07:28:00 GMT', '0;token=canary', '', ' 5 ']) test(`Retry interval malformed case${raw.length} rejected`, () => assert.throws(() => retrySeconds({ 'retry-after': raw })));
test('Observed429 follows actual60s plus margin in bounded polls, retries once only', async () => {
  let clock = 0, calls = 0; const waits = [], statuses = [];
  await observedNative(async () => ({ status: () => ++calls === 1 ? 429 : 200, headers: () => ({ 'x-retry-after': '60', 'other-header': 'private-canary' }) }), { stage: 'customer-otp-send', deadline: 180000, clock: () => clock, sleep: async ms => { waits.push(ms); clock += ms; }, record: s => statuses.push(s) });
  assert.equal(calls, 2); assert.deepEqual(waits, [60000, 250]);
  assert.deepEqual(statuses.map(s => s.status), [429, 200]); assert.equal(JSON.stringify(statuses).includes('canary'), false);
});
test('Verify retries current controlled-code action, never calls a separate send', async () => {
  let actions = 0, reads = 0;
  await observedNative(async () => { reads++; actions++; return { status: () => actions === 1 ? 429 : 200, headers: () => ({ 'retry-after': '0.25' }) }; }, { stage: 'customer-otp-verify', deadline: 10000, clock: () => 0, sleep: async ms => assert.equal(ms, 1250), record: () => {} });
  assert.equal(actions, 2); assert.equal(reads, 2);
});
test('Insufficient finite deadline stops before a sanctioned retry', async () => {
  let actions = 0;
  await assert.rejects(observedNative(async () => { actions++; return { status: () => 429, headers: () => ({ 'retry-after': '60' }) }; }, { stage: 'customer-otp-verify', deadline: 60000, clock: () => 0, sleep: async () => assert.fail('Must not sleep'), record: () => {} }), e => e.safeCode === 'deadline');
  assert.equal(actions, 1);
});
test('Genuine400, missing429 interval and second429 fail without blanket retry', async () => {
  for (const [status, headers, expectedCalls] of [[400, {}, 1], [429, {}, 1], [429, { 'retry-after': '0' }, 2]]) {
    let calls = 0;
    await assert.rejects(observedNative(async () => { calls++; return { status: () => status, headers: () => headers, body: () => { throw new Error('provider-canary'); } }; }, { stage: 'customer-otp-verify', deadline: 10000, clock: () => 0, sleep: async () => {}, record: () => {} }));
    assert.equal(calls, expectedCalls);
  }
});
test('Error redaction never contains unknown message/body/contact/token fields', () => {
  const error = new Error('password=canary-cookie-provider'); error.safeCode = 'private-canary';
  assert.deepEqual(safeFailure(error, 'unknown-provider-canary'), { mode: 'failed', stage: 'identity', code: 'operation' });
  assert.equal(JSON.stringify(safeFailure(error, 'native-login')).includes('canary'), false);
});
test('Exact legacy mapping requires explicit tool source/hash and fixture/manifest bindings', () => {
  for (const mutation of [v => { delete v.recovery; }, v => { v.restoreRoot = recoveryCase.root.toLowerCase(); }, v => { v.recovery.toolSourceCommit = 'HEAD'; }, v => { v.recovery.toolSha256 = '0'.repeat(64); }, v => { v.recovery.fixtureSha256 = 'not-a-hash'; }]) {
    const value = target(); mutation(value); assert.throws(() => validateTarget(value));
  }
});
