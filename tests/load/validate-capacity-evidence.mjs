import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { config } from "dotenv";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
import { readLoadFixtureState } from "../../scripts/load-fixture-state.mjs";

export const CAPACITY_APP_COMMIT = "e4bed691dc938a9c0f79022696d24f063ad97724";
export const CAPACITY_TOOLS_COMMIT = "08176c28f02e9283905c656a241313ebf840b7ab";
const refuse = () => { throw new Error("Owned capacity evidence validation failed."); };
export const CAPACITY_SQL = Object.freeze({
  identity: `SELECT current_database()='morphiume_staging_runtime' AS database_ok,
    current_user='morphiume_runtime_app' AS role_ok,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS restricted,
    NOT has_schema_privilege(current_user,'public','CREATE') AND NOT EXISTS
      (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND
        (relowner=r.oid OR (relkind IN('r','p') AND has_table_privilege(current_user,oid,'TRUNCATE')))) AS no_ddl,
    (SELECT count(*)::int FROM schema_migration) AS migrations,
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables
    FROM pg_roles r WHERE rolname=current_user`,
  stock: `WITH scope AS (SELECT id,status FROM product WHERE id=ANY($1::uuid[])),
    owned AS (SELECT v.id,v.product_id,b.on_hand,b.reserved FROM variant v JOIN scope p ON p.id=v.product_id
      LEFT JOIN inventory_balance b ON b.variant_id=v.id),
    ledger AS (SELECT l.variant_id,sum(l.on_hand_delta) AS on_hand,sum(l.reserved_delta) AS reserved,
      count(*) FILTER(WHERE l.operation_key LIKE 'load-seed:'||$3::text||':%') AS seeds,
      coalesce(sum(l.on_hand_delta) FILTER(WHERE l.operation_key LIKE 'load-seed:'||$3::text||':%'),0) AS seed_stock
      FROM inventory_ledger l JOIN owned v ON v.id=l.variant_id GROUP BY l.variant_id)
    SELECT (SELECT count(*)::int FROM scope) AS products,count(*)::int AS variants,
      count(DISTINCT v.product_id)::int AS products_with_variant,
      count(*) FILTER(WHERE v.id=$2::uuid)::int AS purchase_variants,
      (SELECT count(*)::int FROM scope WHERE status='published') AS published,
      (SELECT count(*)::int FROM scope WHERE status='archived') AS archived,
      count(*) FILTER(WHERE v.on_hand IS NULL OR l.variant_id IS NULL OR v.on_hand<0 OR v.reserved<0
        OR v.reserved>v.on_hand OR v.on_hand<>l.on_hand OR v.reserved<>l.reserved
        OR l.seeds<>1 OR l.seed_stock<>CASE WHEN v.id=$2::uuid THEN 100000 ELSE 1000 END)::int AS violations,
      count(*) FILTER(WHERE v.id<>$2::uuid AND (v.on_hand<>1000 OR v.reserved<>0))::int AS other_sku_changes,
      coalesce(sum(v.on_hand) FILTER(WHERE v.id=$2::uuid),0)::int AS purchase_on_hand,
      coalesce(sum(v.reserved) FILTER(WHERE v.id=$2::uuid),0)::int AS purchase_reserved
      FROM owned v LEFT JOIN ledger l ON l.variant_id=v.id`,
  finance: `WITH owned AS (SELECT * FROM orders WHERE user_id=ANY($1::text[]))
    SELECT count(*)::int AS orders,count(*) FILTER(WHERE o.committed_at IS NOT NULL)::int AS committed_orders,
      coalesce(sum((SELECT sum(quantity) FROM order_item WHERE order_id=o.id))
        FILTER(WHERE o.committed_at IS NOT NULL),0)::int AS committed_units,
      count(*) FILTER(WHERE o.total_irr<>o.subtotal_irr-o.discount_irr+o.shipping_irr+o.tax_irr
        OR o.subtotal_irr<>(SELECT coalesce(sum(line_total_irr),0) FROM order_item WHERE order_id=o.id)
        OR (SELECT count(*) FROM order_item WHERE order_id=o.id)<>1
        OR EXISTS(SELECT 1 FROM order_item i WHERE i.order_id=o.id AND
          (i.variant_id<>$2::uuid OR i.quantity<>1 OR i.unit_price_irr<>10000
           OR i.line_total_irr<>i.quantity*i.unit_price_irr)))::int AS money_violations,
      count(*) FILTER(WHERE o.committed_at IS NOT NULL AND (
        (SELECT count(*) FROM shipment WHERE order_id=o.id)<>1 OR
        (SELECT count(*) FROM payment_receipt WHERE order_id=o.id)<>1 OR
        (SELECT count(*) FROM payment_receipt WHERE order_id=o.id AND disposition='primary'
          AND currency='IRR' AND amount_irr=o.total_irr)<>1 OR
        EXISTS(SELECT 1 FROM order_item i WHERE i.order_id=o.id AND
          (SELECT count(*) FROM inventory_ledger l WHERE l.order_id=o.id AND l.variant_id=i.variant_id
            AND l.reason='payment_commit' AND l.operation_key='commit:'||o.id::text||':'||i.variant_id::text
            AND l.on_hand_delta=-i.quantity AND l.reserved_delta IN(0,-i.quantity))<>1)))::int AS commit_violations,
      (SELECT count(*)::int FROM inventory_ledger l JOIN owned o ON o.id=l.order_id
        WHERE l.reason='payment_commit') AS stock_commits,
      (SELECT coalesce(sum(quantity),0)::int FROM inventory_reservation WHERE variant_id=$2::uuid AND status='active') AS active_reserved,
      (SELECT count(*)::int FROM order_item i JOIN orders f ON f.id=i.order_id
        WHERE i.variant_id=$2::uuid AND NOT (f.user_id=ANY($1::text[]))) AS foreign_orders
      FROM owned o`,
  cleanup: `SELECT count(*)::int AS users,count(*) FILTER(WHERE disabled)::int AS disabled,
    (SELECT count(*)::int FROM session WHERE user_id=ANY($1::text[])) AS sessions,
    (SELECT count(DISTINCT user_id)::int FROM session WHERE user_id=ANY($1::text[])) AS users_with_session
    FROM "user" WHERE id=ANY($1::text[])`,
});

function counts(row, keys) {
  if (!row || Object.keys(row).length !== keys.length || keys.some(key => !Number.isSafeInteger(row[key]) || row[key] < 0)) refuse();
  return Object.fromEntries(keys.map(key => [key, row[key]]));
}
function single(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) refuse();
  return result.rows[0];
}
export function capacityTarget(configuration, directory) {
  const target = controlledQaDatabase(configuration);
  if (target.pathname !== "/morphiume_staging_runtime" || target.port !== "15434" || decodeURIComponent(target.username) !== "morphiume_runtime_app"
    || configuration.APP_BASE_URL !== "http://localhost:3100" || (configuration.LOAD_BASE_URL && configuration.LOAD_BASE_URL !== "http://localhost:3100")
    || configuration.LOAD_APP_COMMIT !== CAPACITY_APP_COMMIT || configuration.LOAD_TOOLS_COMMIT !== CAPACITY_TOOLS_COMMIT
    || (configuration.LOAD_FIXTURE && resolve(configuration.LOAD_FIXTURE) !== resolve(directory, "load-fixture.json"))) refuse();
  return target;
}
export async function validateCapacityEvidence(configuration, { directory = resolve(".local"), expectCleanup = false, connect } = {}) {
  let client, pool, begun = false;
  try {
    if (typeof expectCleanup !== "boolean") refuse();
    const target = capacityTarget(configuration, directory);
    const fixture = await readLoadFixtureState(resolve(directory, "load-fixture.json"), configuration, directory);
    if (fixture.initialStock !== 100000) refuse();
    if (connect) client = await connect();
    else { pool = new pg.Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 3000, query_timeout: 3500 }); client = await pool.connect(); }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); begun = true;
    await client.query("SET LOCAL statement_timeout='3s'");
    const identityRows = (await client.query(CAPACITY_SQL.identity)).rows, identity = identityRows[0];
    if (identityRows.length !== 1 || !identity || Object.keys(identity).length !== 6 ||
      ["database_ok", "role_ok", "restricted", "no_ddl"].some(key => identity[key] !== true) || identity.migrations !== 13 || identity.tables !== 53) refuse();
    const stock = counts(single(await client.query(CAPACITY_SQL.stock, [fixture.productIds, fixture.variantId, fixture.fixtureId])),
      ["products", "variants", "products_with_variant", "purchase_variants", "published", "archived", "violations", "other_sku_changes", "purchase_on_hand", "purchase_reserved"]);
    const finance = counts(single(await client.query(CAPACITY_SQL.finance, [fixture.users.map(user => user.userId), fixture.variantId])),
      ["orders", "committed_orders", "committed_units", "money_violations", "commit_violations", "stock_commits", "active_reserved", "foreign_orders"]);
    const cleanup = counts(single(await client.query(CAPACITY_SQL.cleanup, [fixture.users.map(user => user.userId)])), ["users", "disabled", "sessions", "users_with_session"]);
    if (stock.products !== 200 || stock.variants !== 200 || stock.products_with_variant !== 200 || stock.purchase_variants !== 1
      || stock.violations || stock.other_sku_changes || stock[expectCleanup ? "archived" : "published"] !== 200
      || finance.money_violations || finance.commit_violations || finance.foreign_orders || finance.stock_commits !== finance.committed_orders
      || finance.committed_units !== finance.committed_orders || finance.orders < finance.committed_orders
      || stock.purchase_on_hand !== fixture.initialStock - finance.committed_units || stock.purchase_reserved !== finance.active_reserved
      || cleanup.users !== 200 || cleanup.disabled !== (expectCleanup ? 200 : 0)
      || (expectCleanup ? cleanup.sessions !== 0 : cleanup.users_with_session !== 200)) refuse();
    await client.query("COMMIT"); begun = false;
    return { scope: "owned-capacity-validator", status: "passed", capturedUtc: new Date().toISOString(), appCommit: fixture.appCommit,
      loadToolsCommit: CAPACITY_TOOLS_COMMIT, nodeVersion: process.version, readOnlySnapshot: true, expectCleanup, stock, finance, cleanup };
  } catch { if (begun) { try { await client.query("ROLLBACK"); } catch { /* Fixed failure only. */ } } refuse(); }
  finally {
    let closingFailed = false;
    try { client?.release(); } catch { closingFailed = true; }
    if (pool) { let timer; try { await Promise.race([pool.end(), new Promise((_, reject) => { timer = setTimeout(reject, 5000); })]); } catch { closingFailed = true; } finally { clearTimeout(timer); } }
    if (closingFailed) refuse();
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  config({ path: ".env.local", quiet: true });
  if (process.argv.slice(2).some(arg => arg !== "--expect-cleanup")) { console.error("Owned capacity evidence validation failed."); process.exitCode = 1; }
  else validateCapacityEvidence(process.env, { expectCleanup: process.argv.includes("--expect-cleanup") })
    .then(result => console.log(JSON.stringify(result))).catch(() => { console.error("Owned capacity evidence validation failed."); process.exitCode = 1; });
}
