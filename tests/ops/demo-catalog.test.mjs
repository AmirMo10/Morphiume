import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SOURCE, PROFILE, CAPABILITY, IMAGE, SITE, ORIGIN, sha, digest, canonical, validateManifest, validateObservation, webpDimensions } from '../../deploy/staging/demo-catalog/contract.mjs';
import { createNativeApi, createPlan, installCatalog } from '../../deploy/staging/demo-catalog/native.mjs';
import { FINANCIAL_TABLES, IDENTITY_TABLES, CATALOG_TABLES, takeSnapshot, verifyPreservation } from '../../deploy/staging/demo-catalog/snapshot.mjs';

const clone = value => structuredClone(value);
function image(seed, width = 1024, height = 1536) {
  // Structural header fixture, not photographic/decode evidence. Native Sharp
  // remains the real decoder; these portable tests exercise our guard parser.
  const x = Buffer.alloc(18); x.write('VP8X'); x.writeUInt32LE(10, 4); x.writeUIntLE(width - 1, 12, 3); x.writeUIntLE(height - 1, 15, 3);
  const frame = Buffer.alloc(14); frame.write('VP8L'); frame.writeUInt32LE(6, 4); frame[8] = 0x2f; frame.writeUInt32LE(((height - 1) << 14) | (width - 1), 9); frame[13] = seed;
  const header = Buffer.alloc(12); header.write('RIFF'); header.writeUInt32LE(x.length + frame.length + 4, 4); header.write('WEBP', 8); return Buffer.concat([header, x, frame]);
}
function fixture() {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../deploy/staging/demo-catalog/catalog.json', import.meta.url), 'utf8')), assets = {};
  manifest.products.forEach((item, index) => { assets[item.key] = image(index); item.media.sha256 = sha(assets[item.key]); item.media.width = 1024; item.media.height = 1536; if (!item.media.alt.includes('آزمایشی')) item.media.alt += '؛ کاتالوگ آزمایشی'; });
  const operator = randomUUID(), now = Date.now();
  const observation = { formatVersion: 1, mode: 'root-demo-catalog-runtime-observation', observedUtc: new Date(now).toISOString(), sourceCommit: SOURCE, runtimeImageId: IMAGE, profileSha256: PROFILE, capabilitySha256: CAPABILITY, siteSha256: SITE, sharedOperatorId: operator, origin: ORIGIN, deploymentEnv: 'staging', paymentProvider: 'mock', smsProvider: 'mock', readyStatus: 200, appHealthy: true, workerHealthy: true, restorePairsStopped: 6, timersActiveEnabled: true, protectedStateSha256: 'a'.repeat(64), rawObservationSha256: 'b'.repeat(64), backupCheckpoint: { createdUtc: new Date(now - 60_000).toISOString(), databaseCiphertextSha256: 'c'.repeat(64), mediaCiphertextSha256: 'd'.repeat(64) } };
  const old = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), name: `QA sample ${i}`, slug: `qa-sample-${i}`, description: 'نمونهٔ آزمایشی', shortDescription: '', careInstructions: '', approvedWarnings: '', concentration: 'QA', family: 'QA', topNotes: [], heartNotes: [], baseNotes: [], imageUrl: '/assets/sample-perfume.svg', images: [{ url: '/assets/sample-perfume.svg', alt: 'QA', variantSku: null }], status: 'published', version: 4, variants: [{ id: randomUUID(), sku: `QA-${i}`, volumeMl: 50, price: { amountIrr: '1000000', currency: 'IRR' }, available: 2 }] }));
  const data = clone(old), calls = [], events = [], media = new Map();
  let revoked = false;
  const api = async (method, pathname, body, raw) => {
    calls.push({ method, pathname, body });
    if (pathname === '/api/admin/session') return { accessMode: 'private-preview', user: { id: operator, email: 'private-preview@morphiume.invalid' }, mfaVerified: !revoked, mfaRequired: revoked, permissions: revoked ? [] : ['catalog.write', 'inventory.write'] };
    if (pathname.startsWith('/api/admin/products/page') || pathname.startsWith('/api/catalog/page')) { const found = pathname.startsWith('/api/catalog/page') ? data.filter(p => p.status === 'published') : data; return { items: clone(found), page: 1, pageSize: 100, totalItems: found.length, totalPages: 1 }; }
    if (pathname === '/api/admin/media') { const bytes = Buffer.from(await body.get('file').arrayBuffer()), id = randomUUID(), url = `/media/${id}.webp`; media.set(url, bytes); return { id, url, width: 1024, height: 1536 }; }
    if (raw) return media.get(pathname);
    if (pathname === '/api/admin/products') { const p = { ...clone(body), id: randomUUID(), imageUrl: body.images[0].url, status: 'draft', version: 1, variants: body.variants.map(v => ({ id: randomUUID(), sku: v.sku, volumeMl: v.volumeMl, price: { amountIrr: (BigInt(v.priceToman) * 10n).toString(), currency: 'IRR' }, available: v.initialStock })) }; data.push(p); return clone(p); }
    const found = data.find(p => pathname.startsWith(`/api/admin/products/${p.id}`));
    assert.ok(found, `recognized test endpoint ${pathname}`);
    if (method === 'GET') return clone(found);
    assert.equal(body.expectedVersion, found.version); found.status = pathname.endsWith('/publish') ? 'published' : 'archived'; found.version++; return clone(found);
  };
  return { manifest, assets, observation, old, now, operator, api, calls, events, data, revoke: () => { revoked = true; } };
}
async function prepare(f) { return createPlan({ ...f, approvedOldIds: f.old.map(p => p.id), operationId: randomUUID() }); }
async function install(f, plan, extras = {}) { return installCatalog({ ...f, go: SOURCE, plan, planSha256: digest(plan), writeEvent: async record => f.events.push(clone(record)), ...extras }); }

test('native CLI is inert without an explicit coordinator execution contract', () => {
  const result = spawnSync(process.execPath, ['deploy/staging/demo-catalog/native.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0); assert.match(result.stdout, /No network or writes performed/); assert.equal(result.stderr, '');
});
test('actual manifest copy/price contract accepts all six finalized structural assets', () => {
  const f = fixture(); assert.equal(validateManifest(f.manifest, f.assets), f.manifest);
  assert.equal(f.manifest.products.length, 6); assert.equal(f.manifest.products.flatMap(p => p.apiPayload.variants).reduce((sum, v) => sum + v.initialStock, 0), 180);
  assert.deepEqual(webpDimensions(f.assets.sepid), { width: 1024, height: 1536 });
});
test('catalog rejects missing labels, placeholder hashes, duplicate assets, money conversion, live and tiny imagery', () => {
  const changes = [f => { f.manifest.sampleOnly = false; }, f => { f.manifest.allowedEnvironments.push('live'); }, f => { f.manifest.products[0].is_sample = false; }, f => { f.manifest.products[0].apiPayload.name = 'Real merchandise'; }, f => { f.manifest.products[0].apiPayload.shortDescription = 'کالای واقعی'; }, f => { f.manifest.products[0].media.sha256 = null; }, f => { f.manifest.products[1].media.sha256 = f.manifest.products[0].media.sha256; f.assets.mehzar = f.assets.sepid; }, f => { f.manifest.products[0].apiPayload.variants[0].priceToman = '9800000'; }, f => { f.manifest.products[0].media.alt = 'Real photo'; }, f => { f.assets.sepid = image(0, 16, 20); f.manifest.products[0].media.sha256 = sha(f.assets.sepid); }, f => { f.manifest.products[0].media.path = '../../outside.webp'; }];
  for (const change of changes) { const f = fixture(); change(f); assert.throws(() => validateManifest(f.manifest, f.assets), /Demo catalog stopped/); }
});
test('runtime boundary rejects stale/wrong source/image/capability/provider/profile/site and backup', () => {
  const f = fixture(); validateObservation(f.observation, f.now);
  const changes = [o => o.sourceCommit = '0'.repeat(40), o => o.runtimeImageId = `sha256:${'0'.repeat(64)}`, o => o.capabilitySha256 = '0'.repeat(64), o => o.profileSha256 = '0'.repeat(64), o => o.siteSha256 = '0'.repeat(64), o => o.smsProvider = 'live', o => o.origin = 'https://morphiume.ir', o => o.deploymentEnv = 'live', o => o.observedUtc = new Date(f.now - 300001).toISOString(), o => o.backupCheckpoint.createdUtc = new Date(f.now - 86400001).toISOString(), o => o.timersActiveEnabled = false, o => o.restorePairsStopped = 5];
  for (const change of changes) { const o = clone(f.observation); change(o); assert.throws(() => validateObservation(o, f.now), /Demo catalog stopped/); }
});
test('plan has no native writes and requires all four exact explicit old IDs and collision-free samples', async () => {
  const f = fixture(), plan = await prepare(f); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0); assert.equal(plan.writeCount.archive, 4);
  const wrong = { ...f, approvedOldIds: [...f.old.slice(1).map(p => p.id), randomUUID()], operationId: randomUUID() };
  await assert.rejects(createPlan(wrong), /all old published IDs/);
  f.data[0].slug = f.manifest.products[0].apiPayload.slug; await assert.rejects(prepare(f), /preexisting demo slug/);
});
test('full finite native install publishes all six before archiving exact old four and journals each write', async () => {
  const f = fixture(), plan = await prepare(f), result = await install(f, plan);
  assert.equal(result.mode, 'morphiume-demo-catalog-installed'); assert.equal(result.products.length, 6); assert.equal(result.archived.length, 4);
  const writes = f.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 22);
  assert.equal(writes.slice(0, 6).every(c => c.pathname === '/api/admin/media'), true);
  assert.equal(writes.slice(6, 12).every(c => c.pathname === '/api/admin/products'), true);
  assert.equal(writes.slice(12, 18).every(c => c.pathname.endsWith('/publish')), true);
  assert.equal(writes.slice(18).every(c => c.pathname.endsWith('/archive')), true);
  assert.equal(f.events.filter(e => e.kind === 'write-started').length, 22); assert.equal(f.events.filter(e => e.kind === 'write-returned').length, 22);
  for (let i = 1; i < f.events.length; i++) assert.equal(f.events[i].previousSha256, digest(f.events[i - 1]));
  assert.equal(f.data.filter(p => p.status === 'published').length, 6); assert.equal(f.old.every(old => f.data.find(p => p.id === old.id).status === 'archived'), true);
});
test('concurrent catalog edit or changed protected state aborts before first media write', async () => {
  const f = fixture(), plan = await prepare(f); f.data[0].version++;
  await assert.rejects(install(f, plan), /unchanged reviewed catalog/); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  const g = fixture(), p = await prepare(g), observation = { ...g.observation, protectedStateSha256: 'f'.repeat(64) };
  await assert.rejects(install(g, p, { observation }), /plan\/current binding/); assert.equal(g.calls.filter(c => c.method === 'POST').length, 0);
});
test('ambiguous upload failure is preserved once and no archive or automatic retry occurs', async () => {
  const f = fixture(), plan = await prepare(f), original = f.api; let uploads = 0;
  f.api = async (...args) => { if (args[0] === 'POST' && args[1] === '/api/admin/media') { uploads++; throw new Error('sensitive network error text'); } return original(...args); };
  await assert.rejects(install(f, plan)); assert.equal(uploads, 1); assert.equal(f.events.at(-1).kind, 'operation-failed-no-replay'); assert.doesNotMatch(JSON.stringify(f.events), /sensitive network/); assert.equal(f.data.filter(p => p.status === 'published').length, 4);
});
test('native role revocation and exclusive event replay rejection fail closed', async () => {
  const f = fixture(), plan = await prepare(f); f.revoke(); await assert.rejects(install(f, plan), /shared operator permissions/); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  const g = fixture(), p = await prepare(g); await assert.rejects(install(g, p, { writeEvent: async () => { throw new Error('exclusive operation marker exists'); } }), /exclusive operation marker/); assert.equal(g.calls.filter(c => c.method === 'POST').length, 0);
});
test('native HTTP adapter pins IP, origin, no credentials and errors on redirects/cookies/status', async () => {
  let observed;
  const good = createNativeApi(async (url, init) => { observed = { url, init }; return new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { 'cache-control': 'private, no-store' } }); });
  assert.deepEqual(await good('GET', '/api/admin/session'), { ok: true }); assert.equal(observed.url, `${ORIGIN}/api/admin/session`); assert.equal(observed.init.headers.Origin, ORIGIN); assert.equal(observed.init.redirect, 'error'); assert.equal(observed.init.headers.Cookie, undefined); assert.equal(observed.init.headers.Authorization, undefined);
  for (const pathname of ['https://attacker.invalid/', '/api/admin/roles', '/api/admin/inventory', '/api/admin/products/../../roles', '/api/payments/callback', '/api/admin/products?x=#host']) await assert.rejects(good('POST', pathname, {}), /endpoint allowlist/);
  const bad = createNativeApi(async () => new Response('{}', { status: 200, headers: { 'cache-control': 'no-store', 'set-cookie': 'admin=secret' } })); await assert.rejects(bad('GET', '/api/admin/session'), /authentication cookie/);
});
test('public catalog path matches the real deployed handler rather than a mock-only endpoint', async () => {
  const source = fs.readFileSync(new URL('../../src/app/api/[...segments]/route.ts', import.meta.url), 'utf8');
  assert.match(source, /route === "catalog\/page" && method === "GET"/); assert.doesNotMatch(source, /route === "products\/page"/);
  const f = fixture(); await install(f, await prepare(f));
  assert.equal(f.calls.filter(call => call.pathname.startsWith('/api/catalog/page')).length, 2); assert.equal(f.calls.some(call => call.pathname.startsWith('/api/products/page')), false);
});

function record(value) { const json = JSON.stringify(value); return { sha256: sha(json), json, value: clone(value) }; }
function put(snapshot, table, value, keys) { snapshot.tables[table].keys = keys; snapshot.tables[table].rows[canonical(keys.map(k => value[k]))] = record(value); }
function snapshotFixture(installed, manifest) {
  const shell = () => ({ formatVersion: 1, mode: 'morphiume-demo-catalog-snapshot', sourceCommit: SOURCE, profileSha256: PROFILE, capabilitySha256: CAPABILITY, excludedSharedOperatorId: installed.operatorId, tables: Object.fromEntries([...FINANCIAL_TABLES, ...IDENTITY_TABLES, ...CATALOG_TABLES].map(table => [table, { keys: ['id'], rows: {} }])) });
  const before = shell(), after = shell();
  put(before, 'orders', { id: randomUUID(), status: 'confirmed' }, ['id']); put(before, 'user', { id: randomUUID(), disabled: false }, ['id']);
  for (const row of installed.archived) { const value = { id: row.before.id, name: row.before.name, slug: row.before.slug, status: 'published', version: row.before.version, updated_at: '2026-10-19T00:00:00Z' }; put(before, 'product', value, ['id']); }
  for (const table of Object.keys(before.tables)) after.tables[table] = clone(before.tables[table]);
  for (const row of installed.archived) put(after, 'product', { ...Object.values(before.tables.product.rows).find(v => v.value.id === row.before.id).value, status: 'archived', version: row.after.version, updated_at: '2026-10-19T01:00:00Z' }, ['id']);
  for (const row of installed.products) {
    const item = manifest.products.find(item => item.key === row.key);
    put(after, 'product', { id: row.product.id, name: row.product.name, slug: row.product.slug, status: 'published', version: row.product.version, image_url: row.media.url, description: row.product.description, short_description: row.product.shortDescription, care_instructions: row.product.careInstructions, approved_warnings: row.product.approvedWarnings, concentration: row.product.concentration, family: row.product.family, top_notes: row.product.topNotes, heart_notes: row.product.heartNotes, base_notes: row.product.baseNotes }, ['id']);
    put(after, 'media', { id: row.media.id, public_path: row.media.url, private_object_key: row.media.id, width: row.media.width, height: row.media.height, status: 'ready', mime_type: 'image/webp', created_by: installed.operatorId }, ['id']);
    put(after, 'product_slug_claim', { slug: row.product.slug, product_id: row.product.id }, ['slug']);
    put(after, 'product_image', { product_id: row.product.id, position: 0, url: row.media.url, alt: item.media.alt, media_id: row.media.id, variant_id: null }, ['product_id', 'position']);
    for (const v of row.product.variants) {
      const expected = item.apiPayload.variants.find(e => e.sku === v.sku);
      put(after, 'variant', { id: v.id, product_id: row.product.id, sku: v.sku, volume_ml: v.volumeMl, price_irr: v.price.amountIrr, active: true }, ['id']);
      put(after, 'inventory_balance', { variant_id: v.id, on_hand: expected.initialStock, reserved: 0 }, ['variant_id']);
      put(after, 'inventory_ledger', { id: randomUUID(), variant_id: v.id, operation_key: `initial:${v.id}`, on_hand_delta: expected.initialStock, reserved_delta: 0, reason: 'initial_stock', actor_id: installed.operatorId }, ['id']);
    }
  }
  for (const table of Object.keys(before.tables)) before.tables[table].keys = after.tables[table].keys;
  return { before, after };
}
test('preservation permits exact new initial stocks and status-only archive while protecting all other rows', async () => {
  const f = fixture(), installed = await install(f, await prepare(f)), { before, after } = snapshotFixture(installed, f.manifest);
  const result = verifyPreservation(before, after, installed, f.manifest); assert.equal(result.financialRows, 1); assert.equal(result.protectedIdentityRows, 1); assert.equal(result.archivedProducts, 4); assert.equal(result.additions.inventory_ledger, 12);
  const mutations = [s => { delete s.tables.orders.rows[Object.keys(s.tables.orders.rows)[0]]; }, s => { s.tables.orders.rows[Object.keys(s.tables.orders.rows)[0]].sha256 = 'f'.repeat(64); }, s => { s.tables.user.rows[Object.keys(s.tables.user.rows)[0]].sha256 = 'e'.repeat(64); }, s => { const key = Object.keys(s.tables.inventory_balance.rows)[0], v = s.tables.inventory_balance.rows[key].value; s.tables.inventory_balance.rows[key] = record({ ...v, on_hand: v.on_hand + 1 }); }, s => { const row = Object.values(s.tables.product.rows).find(row => row.value.id === installed.archived[0].before.id); row.value.name = 'changed historical product'; }, s => { put(s, 'payment_receipt', { id: randomUUID() }, ['id']); }, s => { const key = Object.keys(s.tables.product_image.rows)[0], value = s.tables.product_image.rows[key].value; s.tables.product_image.rows[key] = record({ ...value, alt: 'unlabeled photo' }); }];
  for (const mutate of mutations) { const candidate = clone(after); mutate(candidate); assert.throws(() => verifyPreservation(before, candidate, installed, f.manifest), /Demo catalog stopped/); }
});
test('snapshot validates DML-role target and always rolls back/releases without any mutation', async () => {
  const calls = []; let released = false;
  const db = { query: async (sql) => { calls.push(sql); if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'wrong', role: 'owner', read_only: 'on' }] }; return { rows: [] }; }, release: () => { released = true; } };
  await assert.rejects(takeSnapshot({ connect: async () => db }, randomUUID()), /fixed read-only DML target/);
  assert.equal(calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(calls.at(-1), 'ROLLBACK'); assert.equal(released, true); assert.equal(calls.some(sql => /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/.test(sql)), false);
});
