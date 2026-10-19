// Independent read-only database evidence. The caller owns and closes its
// protected DML-role pool; no connection strings are accepted or printed here.
import { need, sha, digest, canonical, UUID, SOURCE, PROFILE, CAPABILITY } from './contract.mjs';

export const FINANCIAL_TABLES = ['orders', 'order_item', 'inventory_balance', 'inventory_reservation', 'inventory_ledger', 'payment_attempt', 'payment_receipt', 'payment_event', 'mock_provider_transaction', 'shipment', 'order_event', 'coupon_redemption', 'return_request', 'refund'];
export const IDENTITY_TABLES = ['user', 'account', 'two_factor', 'role_membership'];
export const CATALOG_TABLES = ['product', 'variant', 'product_image', 'product_slug_claim', 'media', 'collection', 'collection_product', 'collection_slug_claim'];
const VALUES = new Set([...CATALOG_TABLES, 'inventory_balance', 'inventory_ledger']);
export async function takeSnapshot(pool, operatorId) {
  need(UUID.test(operatorId), 'snapshot exact shared operator');
  const db = await pool.connect(), tables = {};
  const startedUtc = new Date().toISOString();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='1s'; SET LOCAL TIME ZONE 'UTC'");
    const target = (await db.query("SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS read_only")).rows[0];
    need(target.database === 'morphiume_staging_runtime' && target.role === 'morphiume_runtime_app' && target.read_only === 'on', 'snapshot fixed read-only DML target');
    for (const table of [...FINANCIAL_TABLES, ...IDENTITY_TABLES, ...CATALOG_TABLES]) {
      const keys = (await db.query("SELECT a.attname FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE i.indisprimary AND n.nspname='public' AND c.relname=$1 ORDER BY k.ord", [table])).rows.map(row => row.attname);
      need(keys.length > 0 && keys.every(key => /^[a-z_]+$/.test(key)), 'known primary key');
      const identity = IDENTITY_TABLES.includes(table), filter = identity ? ` WHERE ${table === 'user' ? 'id' : 'user_id'}<>$1` : '';
      const data = (await db.query(`SELECT to_jsonb(t)::text AS payload FROM public."${table}" t${filter} LIMIT 100001`, identity ? [operatorId] : [])).rows;
      need(data.length <= 100000, 'snapshot row limit');
      const rows = {};
      for (const row of data) {
        need(typeof row.payload === 'string' && Buffer.byteLength(row.payload) <= 65536, 'snapshot row byte limit');
        const value = JSON.parse(row.payload), key = canonical(keys.map(field => value[field])); need(!Object.hasOwn(rows, key), 'unique snapshot primary key');
        rows[key] = { sha256: sha(row.payload), ...(VALUES.has(table) ? { json: row.payload, value } : {}) };
      }
      tables[table] = { keys, rows };
    }
    return { formatVersion: 1, mode: 'morphiume-demo-catalog-snapshot', sourceCommit: SOURCE, profileSha256: PROFILE, capabilitySha256: CAPABILITY, excludedSharedOperatorId: operatorId, startedUtc, finishedUtc: new Date().toISOString(), tables };
  } finally { try { await db.query('ROLLBACK'); } finally { db.release(); } }
}
function without(value, fields) { return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key))); }
function rows(snapshot, table) { need(snapshot.tables?.[table]?.rows && Array.isArray(snapshot.tables[table].keys), 'snapshot required table'); return snapshot.tables[table].rows; }
export function verifyPreservation(before, after, installed, manifest) {
  for (const snapshot of [before, after]) need(snapshot.formatVersion === 1 && snapshot.mode === 'morphiume-demo-catalog-snapshot' && snapshot.sourceCommit === SOURCE && snapshot.profileSha256 === PROFILE && snapshot.capabilitySha256 === CAPABILITY && snapshot.excludedSharedOperatorId === installed.operatorId, 'snapshot binding');
  need(installed.mode === 'morphiume-demo-catalog-installed' && installed.sourceCommit === SOURCE && installed.profileSha256 === PROFILE && installed.capabilitySha256 === CAPABILITY && installed.manifestSha256 === digest(manifest) && UUID.test(installed.operationId) && installed.products.length === 6 && installed.archived.length === 4, 'installed evidence binding');
  const expectedTables = [...FINANCIAL_TABLES, ...IDENTITY_TABLES, ...CATALOG_TABLES].sort();
  need(canonical(Object.keys(before.tables).sort()) === canonical(expectedTables) && canonical(Object.keys(after.tables).sort()) === canonical(expectedTables), 'exact snapshot tables');
  const newProducts = new Map(installed.products.map(row => [row.product.id, row]));
  const newVariants = new Map(installed.products.flatMap(row => row.product.variants.map(v => [v.id, { product: row, variant: v, expected: manifest.products.find(item => item.key === row.key)?.apiPayload.variants.find(expected => expected.sku === v.sku) }])));
  const newMedia = new Map(installed.products.map(row => [row.media.id, row]));
  const archived = new Map(installed.archived.map(row => [row.before.id, row]));
  need(newProducts.size === 6 && newVariants.size === 12 && newMedia.size === 6 && archived.size === 4 && [...newVariants.values()].every(row => row.expected), 'owned exact new identities');
  let financialRows = 0, identityRows = 0, catalogRows = 0, archivedRows = 0;
  const addedCounts = {};
  for (const table of expectedTables) {
    need(canonical(before.tables[table].keys) === canonical(after.tables[table].keys), 'unchanged primary keys');
    const prior = rows(before, table), current = rows(after, table);
    for (const record of [...Object.values(prior), ...Object.values(current)]) {
      need(/^[a-f0-9]{64}$/.test(record.sha256), 'snapshot row hash');
      if (VALUES.has(table)) need(typeof record.json === 'string' && sha(record.json) === record.sha256 && canonical(JSON.parse(record.json)) === canonical(record.value), 'snapshot value/hash binding');
    }
    for (const [key, record] of Object.entries(prior)) {
      const next = current[key]; need(next, 'no deleted row');
      if (table === 'product' && archived.has(record.value.id)) {
        const old = archived.get(record.value.id);
        need(record.value.status === 'published' && next.value.status === 'archived' && next.value.version === record.value.version + 1 && old.before.version === record.value.version && old.after.version === next.value.version && canonical(without(record.value, ['status', 'version', 'updated_at'])) === canonical(without(next.value, ['status', 'version', 'updated_at'])), 'exact approved archive delta');
        need(Date.parse(next.value.updated_at) >= Date.parse(record.value.updated_at), 'archive timestamp'); archivedRows++;
      } else need(record.sha256 === next.sha256, 'all other preexisting rows unchanged');
      if (FINANCIAL_TABLES.includes(table)) financialRows++;
      else if (IDENTITY_TABLES.includes(table)) identityRows++;
      else catalogRows++;
    }
    const additions = Object.entries(current).filter(([key]) => !Object.hasOwn(prior, key)).map(([, row]) => row.value);
    addedCounts[table] = additions.length;
    for (const value of additions) {
      if (table === 'product') {
        const row = newProducts.get(value.id);
        need(row && value.slug === row.product.slug && value.name === row.product.name && value.status === 'published' && value.version === row.product.version && value.image_url === row.media.url, 'owned product insertion');
        for (const [column, field] of [['description','description'], ['short_description','shortDescription'], ['care_instructions','careInstructions'], ['approved_warnings','approvedWarnings'], ['concentration','concentration'], ['family','family'], ['top_notes','topNotes'], ['heart_notes','heartNotes'], ['base_notes','baseNotes']]) need(canonical(value[column]) === canonical(row.product[field]), 'owned database copy equality');
      } else if (table === 'variant') {
        const row = newVariants.get(value.id);
        need(row && value.product_id === row.product.product.id && value.sku === row.variant.sku && value.volume_ml === row.variant.volumeMl && String(value.price_irr) === row.variant.price.amountIrr && value.active === true, 'owned variant insertion');
      } else if (table === 'inventory_balance') {
        const row = newVariants.get(value.variant_id);
        need(row && value.on_hand === row.expected.initialStock && value.reserved === 0, 'owned initial inventory balance');
      } else if (table === 'inventory_ledger') {
        const row = newVariants.get(value.variant_id);
        need(row && value.operation_key === `initial:${value.variant_id}` && value.on_hand_delta === row.expected.initialStock && value.reserved_delta === 0 && value.reason === 'initial_stock' && value.actor_id === installed.operatorId, 'owned initial inventory ledger');
      } else if (table === 'media') {
        const row = newMedia.get(value.id);
        need(row && value.public_path === row.media.url && value.private_object_key === value.id && value.width === row.media.width && value.height === row.media.height && value.status === 'ready' && value.mime_type === 'image/webp' && value.created_by === installed.operatorId, 'owned media insertion');
      } else if (table === 'product_image') {
        const row = newProducts.get(value.product_id), item = row && manifest.products.find(item => item.key === row.key);
        need(row && value.position === 0 && value.url === row.media.url && value.media_id === row.media.id && value.variant_id === null && value.alt === item.media.alt, 'owned single image insertion');
      } else if (table === 'product_slug_claim') {
        const row = newProducts.get(value.product_id); need(row && value.slug === row.product.slug, 'owned slug insertion');
      } else need(false, 'no other additions');
    }
  }
  const expectedAdded = { product: 6, variant: 12, inventory_balance: 12, inventory_ledger: 12, media: 6, product_image: 6, product_slug_claim: 6 };
  for (const table of expectedTables) need(addedCounts[table] === (expectedAdded[table] ?? 0), 'exact new row counts');
  need(archivedRows === 4, 'exact four archives');
  return { formatVersion: 1, mode: 'morphiume-demo-catalog-preservation-accepted', operationId: installed.operationId, financialTables: FINANCIAL_TABLES.length, financialRows, allPreexistingFinancialRowsPreserved: true, identityTables: IDENTITY_TABLES.length, protectedIdentityRows: identityRows, allProtectedIdentityRowsPreserved: true, catalogTables: CATALOG_TABLES.length, preexistingCatalogRows: catalogRows, archivedProducts: archivedRows, allOtherCatalogRowsPreserved: true, additions: expectedAdded, noFinancialDeletion: true, noOrderReceiptShipmentMutation: true, limitation: 'The existing shared preview operator and its ordinary session/grant lease activity are excluded from identity snapshots. Audit, analytics, outbox and auth-rate bookkeeping are outside these 26 table snapshots; runtime/configuration preservation requires the independent root observation.' };
}
