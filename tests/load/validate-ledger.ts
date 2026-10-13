import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
async function main() {
  config({ path: ".env.local", quiet: true });
  const database = controlledQaDatabase(process.env);
  const fixture = JSON.parse(await readFile(".local/load-fixture.json", "utf8")) as { productId: string; productIds: string[]; variantId: string; initialStock: number; users: { userId: string }[] };
  const pool = new pg.Pool({ connectionString: database.toString(), max: 2 });
  try {
    const balance = (await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [fixture.variantId])).rows[0]!;
    const totals = (await pool.query("SELECT coalesce(sum(on_hand_delta),0)::int AS on_hand,coalesce(sum(reserved_delta),0)::int AS reserved FROM inventory_ledger WHERE variant_id=$1", [fixture.variantId])).rows[0]!;
    const invalid = (await pool.query(`SELECT count(*)::int AS n FROM orders o WHERE o.user_id=ANY($1::text[]) AND (
      o.total_irr <> o.subtotal_irr-o.discount_irr+o.shipping_irr+o.tax_irr OR
      (o.committed_at IS NOT NULL AND (SELECT count(*) FROM shipment s WHERE s.order_id=o.id)<>1) OR
      (o.committed_at IS NOT NULL AND (SELECT count(*) FROM payment_receipt r WHERE r.order_id=o.id AND r.disposition='primary')<>1))`, [fixture.users.map(user => user.userId)])).rows[0].n;
    if (balance.on_hand < 0 || balance.reserved < 0 || balance.reserved > balance.on_hand || balance.on_hand !== totals.on_hand || balance.reserved !== totals.reserved || invalid) throw new Error("Post-load financial/inventory invariant failed");
    console.log(JSON.stringify({ financialInventoryInvariant: "passed", balance, invalidOrders: invalid }));
    if (process.argv.includes("--cleanup")) {
      await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])", [fixture.productIds]);
      await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])', [fixture.users.map(user => user.userId)]);
      await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])", [fixture.users.map(user => user.userId)]);
    }
  } finally { await pool.end(); }
}

void main().catch(() => {
  console.error(JSON.stringify({ event: "load-ledger-validation", outcome: "failed" }));
  process.exitCode = 1;
});
