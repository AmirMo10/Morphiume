// Native HTTP permission/MFA/CSRF handlers remain authoritative. No cookies,
// Basic credentials, capability file, database writes or provider calls here.
import { ORIGIN, SOURCE, PROFILE, CAPABILITY, UUID, HASH, need, sha, digest, canonical, validateManifest, validateObservation, recent, webpDimensions } from './contract.mjs';

export function createNativeApi(fetchImpl = globalThis.fetch) {
  return async function api(method, pathname, input, raw = false) {
    need(['GET', 'POST'].includes(method) && /^\/(api\/(admin\/(session|media|products(?:\/page|\/[0-9a-f-]+(?:\/publish|\/archive)?)?)|catalog\/page)|media\/[0-9a-f-]+\.webp)(?:\?[^#]*)?$/.test(pathname), 'native endpoint allowlist');
    const headers = { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', Accept: raw ? 'image/webp' : 'application/json' };
    let body;
    if (input instanceof FormData) body = input;
    else if (input !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(input); }
    const response = await fetchImpl(`${ORIGIN}${pathname}`, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(45_000), cache: 'no-store' });
    need(response.status === (method === 'POST' && ['/api/admin/media', '/api/admin/products'].includes(pathname) ? 201 : 200), `native HTTP ${method} ${pathname.split('?')[0]} status ${response.status}`);
    need(!response.headers.get('set-cookie'), 'no browser authentication cookie');
    if (raw) { need(response.headers.get('content-type')?.split(';')[0] === 'image/webp', 'derived media type'); const bytes = Buffer.from(await response.arrayBuffer()); need(bytes.length <= 4 * 1024 * 1024, 'bounded derived media'); return bytes; }
    need(response.headers.get('cache-control')?.includes('no-store'), 'private response no-store');
    const text = await response.text(); need(Buffer.byteLength(text) <= 4 * 1024 * 1024, 'bounded native response');
    const result = JSON.parse(text); need(Object.hasOwn(result, 'data') && !Object.hasOwn(result, 'error'), 'native success response'); return result.data;
  };
}
async function session(api, operatorId) {
  const state = await api('GET', '/api/admin/session');
  need(state.accessMode === 'private-preview' && state.user?.id === operatorId && state.user?.email === 'private-preview@morphiume.invalid' && state.mfaVerified === true && state.mfaRequired === false && state.permissions?.includes('catalog.write') && state.permissions?.includes('inventory.write'), 'native shared operator permissions');
}
export async function listProducts(api, admin = true) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const data = await api('GET', `/api/${admin ? 'admin/products' : 'catalog'}/page?page=${page}&pageSize=100`);
    need(Array.isArray(data.items) && data.page === page && data.pageSize === 100 && Number.isSafeInteger(data.totalItems) && data.totalItems <= 10000 && Number.isSafeInteger(data.totalPages) && data.totalPages <= 100, 'bounded catalog pagination');
    result.push(...data.items);
    if (page >= data.totalPages) { need(result.length === data.totalItems && new Set(result.map(p => p.id)).size === result.length, 'consistent catalog pagination'); return result; }
  }
  throw new Error('Demo catalog stopped: pagination bound');
}
function productSignature(product) { return digest(product); }
function oldSample(product) {
  need(UUID.test(product.id) && product.status === 'published' && Number.isSafeInteger(product.version) && product.version > 0, 'approved published old product');
  need(typeof product.name === 'string' && /QA|test|آزمایشی|نمونه|تست/i.test(`${product.name} ${product.slug} ${product.description}`), 'old sample identity');
}
export async function createPlan({ manifest, assets, observation, approvedOldIds, api, operationId, now = Date.now() }) {
  validateManifest(manifest, assets); validateObservation(observation, now);
  need(UUID.test(operationId) && Array.isArray(approvedOldIds) && approvedOldIds.length === 4 && new Set(approvedOldIds).size === 4 && approvedOldIds.every(id => UUID.test(id)), 'exact approved four old IDs');
  await session(api, observation.sharedOperatorId);
  const products = await listProducts(api), published = products.filter(p => p.status === 'published');
  need(canonical(published.map(p => p.id).sort()) === canonical([...approvedOldIds].sort()), 'all old published IDs explicitly approved');
  for (const p of published) oldSample(p);
  for (const item of manifest.products) need(!products.some(p => p.slug === item.apiPayload.slug || p.variants.some(v => item.apiPayload.variants.some(next => next.sku === v.sku))), 'no preexisting demo slug or SKU');
  return { formatVersion: 1, mode: 'morphiume-demo-catalog-plan', operationId, createdUtc: new Date(now).toISOString(), origin: ORIGIN, sourceCommit: SOURCE, profileSha256: PROFILE, capabilitySha256: CAPABILITY, operatorId: observation.sharedOperatorId, manifestSha256: digest(manifest), observationSha256: digest(observation), protectedStateSha256: observation.protectedStateSha256, approvedOldProducts: published.sort((a,b) => a.id.localeCompare(b.id)), adminCatalogSha256: digest(products.sort((a,b) => a.id.localeCompare(b.id))), writeCount: { media: 6, drafts: 6, publish: 6, archive: 4 }, noDelete: true, noFinancialHistoryMutation: true, noRuntimeChange: true };
}
function assertProduct(product, item, media, status) {
  need(UUID.test(product.id) && product.status === status && Number.isSafeInteger(product.version) && product.version > 0, 'native created product');
  for (const field of ['name', 'slug', 'description', 'shortDescription', 'careInstructions', 'approvedWarnings', 'concentration', 'family', 'topNotes', 'heartNotes', 'baseNotes']) need(canonical(product[field]) === canonical(item.apiPayload[field]), 'native copy equality');
  need(product.images.length === 1 && product.images[0].url === media.url && product.images[0].alt === item.media.alt && !product.images[0].variantSku && product.imageUrl === media.url, 'native gallery equality');
  need(product.variants.length === 2 && new Set(product.variants.map(v => v.id)).size === 2, 'native two variants');
  for (const expected of item.apiPayload.variants) {
    const actual = product.variants.find(v => v.sku === expected.sku);
    need(actual && UUID.test(actual.id) && actual.volumeMl === expected.volumeMl && actual.price.currency === 'IRR' && actual.price.amountIrr === (BigInt(expected.priceToman) * 10n).toString() && actual.available === expected.initialStock, 'native exact price/stock');
  }
}
export async function installCatalog({ go, plan, planSha256, manifest, assets, observation, api, writeEvent, now = Date.now() }) {
  need(go === SOURCE && typeof writeEvent === 'function', 'explicit execution contract');
  validateManifest(manifest, assets); validateObservation(observation, now);
  need(plan.mode === 'morphiume-demo-catalog-plan' && plan.formatVersion === 1 && HASH.test(planSha256) && digest(plan) === planSha256 && UUID.test(plan.operationId), 'exact reviewed plan');
  recent(plan.createdUtc, now, 60 * 60_000);
  need(plan.origin === ORIGIN && plan.sourceCommit === SOURCE && plan.profileSha256 === PROFILE && plan.capabilitySha256 === CAPABILITY && plan.manifestSha256 === digest(manifest) && plan.operatorId === observation.sharedOperatorId && plan.protectedStateSha256 === observation.protectedStateSha256, 'plan/current binding');
  need(plan.approvedOldProducts.length === 4 && new Set(plan.approvedOldProducts.map(p => p.id)).size === 4, 'approved exact old products');
  plan.approvedOldProducts.forEach(oldSample);
  const events = []; let sequence = 0;
  async function event(kind, value) { const record = { formatVersion: 1, operationId: plan.operationId, sequence: ++sequence, utc: new Date().toISOString(), previousSha256: events.length ? digest(events.at(-1)) : null, kind, value }; await writeEvent(record); events.push(record); }
  // Root's writer must exclusively create this operation's first event, before
  // the first write. A failed/ambiguous operation is never automatically replayed.
  await event('operation-started', { planSha256, manifestSha256: digest(manifest), observationSha256: digest(observation) });
  async function write(kind, pathname, body) { await session(api, plan.operatorId); await event('write-started', { kind, pathname, payloadSha256: body instanceof FormData ? null : digest(body) }); const result = await api('POST', pathname, body); await event('write-returned', { kind, pathname, result }); return result; }
  try {
    await session(api, plan.operatorId);
    const before = await listProducts(api);
    need(digest(before.sort((a,b) => a.id.localeCompare(b.id))) === plan.adminCatalogSha256, 'unchanged reviewed catalog');
    const installed = [];
    for (const item of manifest.products) {
      const form = new FormData(); form.set('file', new Blob([assets[item.key]], { type: 'image/webp' }), `morphiume-demo-${item.key}.webp`);
      const media = await write('upload-media', '/api/admin/media', form);
      need(UUID.test(media.id) && media.url === `/media/${media.id}.webp` && media.width === item.media.width && media.height === item.media.height, 'native derived media identity');
      const derived = await api('GET', media.url, undefined, true), dimensions = webpDimensions(derived);
      need(dimensions.width === media.width && dimensions.height === media.height, 'derived actual dimensions');
      const enriched = { ...media, derivedSha256: sha(derived), derivedBytes: derived.length };
      await event('derived-media-observed', { key: item.key, sourceSha256: item.media.sha256, media: enriched });
      installed.push({ key: item.key, sourceMedia: { path: item.media.path, sha256: item.media.sha256, width: item.media.width, height: item.media.height }, media: enriched });
    }
    for (const row of installed) {
      const item = manifest.products.find(p => p.key === row.key), input = { ...item.apiPayload, images: [{ url: row.media.url, alt: item.media.alt, variantSku: null }] };
      row.product = await write('create-draft', '/api/admin/products', input); assertProduct(row.product, item, row.media, 'draft');
    }
    need(new Set(installed.map(p => p.product.id)).size === 6 && new Set(installed.flatMap(p => p.product.variants.map(v => v.id))).size === 12 && new Set(installed.map(p => p.media.id)).size === 6, 'unique installed records');
    for (const row of installed) { row.product = await write('publish-demo', `/api/admin/products/${row.product.id}/publish`, { expectedVersion: row.product.version }); assertProduct(row.product, manifest.products.find(p => p.key === row.key), row.media, 'published'); }
    const both = await listProducts(api, false);
    need(canonical(both.map(p => p.id).sort()) === canonical([...installed.map(p => p.product.id), ...plan.approvedOldProducts.map(p => p.id)].sort()), 'new catalog visible before old archive');
    for (const row of installed) need(productSignature(both.find(p => p.id === row.product.id)) === productSignature(row.product), 'published demo visible unchanged');
    const archived = [];
    for (const old of plan.approvedOldProducts) {
      const current = await api('GET', `/api/admin/products/${old.id}`); need(productSignature(current) === productSignature(old), 'unchanged exact old product');
      const after = await write('archive-approved-old', `/api/admin/products/${old.id}/archive`, { expectedVersion: old.version });
      need(after.status === 'archived' && after.version === old.version + 1 && productSignature({ ...after, status: old.status, version: old.version }) === productSignature(old), 'old status-only native archive'); archived.push({ before: old, after });
    }
    const final = await listProducts(api, false);
    need(canonical(final.map(p => p.id).sort()) === canonical(installed.map(p => p.product.id).sort()), 'exact final six-product public catalog');
    for (const row of installed) { const item = manifest.products.find(p => p.key === row.key); assertProduct(final.find(p => p.id === row.product.id), item, row.media, 'published'); }
    await event('native-install-complete', { products: installed.map(p => p.product.id), archived: archived.map(p => p.after.id) });
    return { formatVersion: 1, mode: 'morphiume-demo-catalog-installed', operationId: plan.operationId, manifestSha256: digest(manifest), sourceCommit: SOURCE, profileSha256: PROFILE, capabilitySha256: CAPABILITY, startedUtc: events[0].utc, finishedUtc: new Date().toISOString(), operatorId: plan.operatorId, products: installed, archived, eventsSha256: digest(events) };
  } catch (error) { await event('operation-failed-no-replay', { message: error instanceof Error && /^Demo catalog stopped:/.test(error.message) ? error.message : 'unclassified native/transport failure; inspect exact last event privately' }); throw error; }
}

// Execution is deliberately import-only. The coordinator supplies reviewed
// immutable inputs, a protected exclusive event writer and actual observations.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/demo-catalog/native.mjs')) {
  process.stdout.write('Read-only by default. Import createPlan/installCatalog with the protected execution contract; see README.md. No network or writes performed.\n');
}
