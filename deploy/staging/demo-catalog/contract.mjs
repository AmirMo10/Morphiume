// Private-preview data deployment. This module performs no IO on import.
import { createHash } from 'node:crypto';

export const ORIGIN = 'http://192.168.240.51';
export const SOURCE = '32b89e13d31288fe4497f7419e170550baf5b293';
export const PROFILE = '65831c6a405bbab67c6f1f20579687d65403c688e78dc6d8b38803c04bed5142';
export const CAPABILITY = '0b914944e2268e831b5fd7c8376b7ee6f24ed179ee156982b8cb8dcc179a7668';
export const IMAGE = 'sha256:a72b341aaef4dc0006f3073015aac228cba692afca73ebbab49a1da9883b5391';
export const SITE = 'bb37396699c5774a5a43e7e2858cf4de0f22c99f46e7f516cb99e1dd3b4eed1c';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const HASH = /^[0-9a-f]{64}$/;
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function need(value, code) { if (!value) throw new Error(`Demo catalog stopped: ${code}`); }
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export const digest = value => sha(canonical(value));
export function exactKeys(value, required, optional = []) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'object');
  need(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), 'field set');
}
export function utc(value) { need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value)), 'UTC time'); return Date.parse(value); }
export function recent(value, now, milliseconds) { const age = now - utc(value); need(age >= 0 && age <= milliseconds, 'fresh observation'); }
export function validateObservation(value, now = Date.now()) {
  exactKeys(value, ['formatVersion', 'mode', 'observedUtc', 'sourceCommit', 'runtimeImageId', 'profileSha256', 'capabilitySha256', 'siteSha256', 'sharedOperatorId', 'origin', 'deploymentEnv', 'paymentProvider', 'smsProvider', 'readyStatus', 'appHealthy', 'workerHealthy', 'restorePairsStopped', 'timersActiveEnabled', 'protectedStateSha256', 'rawObservationSha256', 'backupCheckpoint']);
  need(value.formatVersion === 1 && value.mode === 'root-demo-catalog-runtime-observation', 'observation type');
  recent(value.observedUtc, now, 5 * 60_000);
  need(value.sourceCommit === SOURCE && value.runtimeImageId === IMAGE && value.profileSha256 === PROFILE && value.capabilitySha256 === CAPABILITY && value.siteSha256 === SITE, 'accepted runtime identity');
  need(value.origin === ORIGIN && value.deploymentEnv === 'staging' && value.paymentProvider === 'mock' && value.smsProvider === 'mock', 'private mock boundary');
  need(UUID.test(value.sharedOperatorId) && HASH.test(value.protectedStateSha256) && HASH.test(value.rawObservationSha256), 'observation hashes');
  need(value.readyStatus === 200 && value.appHealthy === true && value.workerHealthy === true && value.restorePairsStopped === 6 && value.timersActiveEnabled === true, 'healthy unchanged runtime');
  exactKeys(value.backupCheckpoint, ['createdUtc', 'databaseCiphertextSha256', 'mediaCiphertextSha256']);
  recent(value.backupCheckpoint.createdUtc, now, 24 * 60 * 60_000);
  need(HASH.test(value.backupCheckpoint.databaseCiphertextSha256) && HASH.test(value.backupCheckpoint.mediaCiphertextSha256), 'encrypted backup checkpoint');
  return value;
}
export function webpDimensions(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length >= 30 && bytes.length <= 4 * 1024 * 1024, 'bounded media');
  need(bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length, 'WebP container');
  let offset = 12, dimensions, frames = 0;
  while (offset + 8 <= bytes.length) {
    const tag = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    need(start + size <= bytes.length, 'WebP chunk bound');
    if (tag === 'VP8X') { need(size === 10 && !(bytes[start] & 0x02), 'static extended WebP'); dimensions = { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 }; }
    if (tag === 'VP8 ') { need(size >= 10 && bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])), 'lossy WebP frame'); frames++; dimensions ??= { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff }; }
    if (tag === 'VP8L') { need(size >= 5 && bytes[start] === 0x2f, 'lossless WebP frame'); frames++; const bits = bytes.readUInt32LE(start + 1); dimensions ??= { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    need(!['ANIM', 'ANMF'].includes(tag), 'static image');
    offset = start + size + (size % 2);
  }
  need(offset === bytes.length && frames === 1 && dimensions && dimensions.width >= 960 && dimensions.height >= 1200 && dimensions.width <= 1600 && dimensions.height <= 1600, 'high resolution within native encoder limit');
  return dimensions;
}
export function validateManifest(manifest, assets) {
  exactKeys(manifest, ['formatVersion', 'mode', 'brand', 'sampleOnly', 'allowedEnvironments', 'products'], ['description', 'imageDirection', 'copyPolicy', 'notes']);
  need(manifest.formatVersion === 1 && manifest.mode === 'morphiume-demo-catalog' && manifest.brand === 'Morphiume' && manifest.sampleOnly === true, 'sample catalog');
  need(canonical(manifest.allowedEnvironments) === canonical(['test', 'staging']), 'no live deployment');
  need(Array.isArray(manifest.products) && manifest.products.length === 6, 'exactly six products');
  const keys = new Set(), slugs = new Set(), skus = new Set(), hashes = new Set();
  for (const item of manifest.products) {
    exactKeys(item, ['key', 'is_sample', 'media', 'apiPayload'], ['latinName', 'sourceAssetFilename', 'referencePriceIrr', 'imagePrompt']);
    need(/^[a-z][a-z0-9-]{1,31}$/.test(item.key) && !keys.has(item.key) && item.is_sample === true, 'sample item identity'); keys.add(item.key);
    const p = item.apiPayload;
    exactKeys(p, ['name', 'slug', 'description', 'shortDescription', 'careInstructions', 'approvedWarnings', 'concentration', 'family', 'topNotes', 'heartNotes', 'baseNotes', 'variants']);
    need(typeof p.name === 'string' && p.name.length <= 160 && p.name.endsWith('(آزمایشی)') && typeof p.slug === 'string' && /^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) && p.slug.length <= 160 && !slugs.has(p.slug), 'visible sample identity'); slugs.add(p.slug);
    for (const [field, limit] of [['description', 10000], ['shortDescription', 600], ['careInstructions', 4000], ['approvedWarnings', 4000], ['concentration', 80], ['family', 80]]) need(typeof p[field] === 'string' && (field === 'careInstructions' || p[field].trim().length > 0) && p[field].length <= limit, 'bounded product copy');
    need(p.description.includes('ساختگی') && p.description.includes('واقعی نیست') && p.shortDescription.includes('ساختگی') && p.shortDescription.includes('واقعی نیست'), 'fictional product disclosure');
    for (const field of ['topNotes', 'heartNotes', 'baseNotes']) need(Array.isArray(p[field]) && p[field].length > 0 && p[field].length <= 30 && p[field].every(note => typeof note === 'string' && note.trim() && note.length <= 120), 'bounded fictional notes');
    need(Array.isArray(p.variants) && p.variants.length === 2 && canonical(p.variants.map(v => v.volumeMl).sort((a,b) => a-b)) === '[50,100]', 'two sample volumes');
    for (const v of p.variants) {
      exactKeys(v, ['sku', 'volumeMl', 'priceToman', 'initialStock']);
      need(/^DEMO-[A-Z0-9-]{3,58}$/.test(v.sku) && !skus.has(v.sku), 'unique demo SKU'); skus.add(v.sku);
      need(typeof v.priceToman === 'string' && /^[1-9][0-9]{0,11}$/.test(v.priceToman) && Number.isSafeInteger(v.initialStock) && v.initialStock >= 1 && v.initialStock <= 99, 'bounded integer sample price/stock');
      if (item.referencePriceIrr) need(typeof item.referencePriceIrr[v.volumeMl] === 'string' && BigInt(item.referencePriceIrr[v.volumeMl]) === BigInt(v.priceToman) * 10n, 'one Toman conversion');
    }
    exactKeys(item.media, ['path', 'sha256', 'width', 'height', 'alt']);
    need(item.media.path === `deploy/staging/demo-catalog/media/morphiume-demo-${item.key}.webp` && HASH.test(item.media.sha256) && !hashes.has(item.media.sha256), 'scoped unique media'); hashes.add(item.media.sha256);
    need(typeof item.media.alt === 'string' && item.media.alt.length <= 240 && item.media.alt.includes('ساختگی') && item.media.alt.includes('آزمایشی') && item.media.alt.includes('تصویر نمونهٔ توسعه؛ تصویر واقعی محصول نیست'), 'visible image disclosure');
    const bytes = assets[item.key]; need(Buffer.isBuffer(bytes) && sha(bytes) === item.media.sha256, 'asset exact hash');
    const dimensions = webpDimensions(bytes); need(dimensions.width === item.media.width && dimensions.height === item.media.height, 'asset actual dimensions');
  }
  need(Object.keys(assets).length === 6 && Object.keys(assets).every(key => keys.has(key)), 'exact media bundle');
  return manifest;
}
