#!/usr/bin/env node
/**
 * REM-F4-06b — ZERO-TOUCH SNAPSHOT (§17)
 * Snapshot amplio de ENERVIDA y PUERTO PADRE (READ ONLY).
 * Uso: node ztx_snapshot.mjs pre|post <archivo_salida.json>
 * Métricas idénticas entre corridas → diff determinista.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const env = {};
for (const l of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/); if (m) env[m[1]] = m[2];
}
const MGMT_URL = 'https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query';
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const STORES = {
  ENERVIDA: '5e6fe821-5465-48b1-b3f1-3aa3182edc38',
  PUERTO_PADRE: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1',
};

async function q(sql) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (r.status !== 201) throw new Error(`mgmt ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
const N = (v) => (v === null || v === undefined ? null : Number(v));

async function storeMetrics(storeId, name) {
  const M = {};
  M.products = (await q(`SELECT count(*)::bigint n, COALESCE(sum(stock_current),0)::text stock_sum, COALESCE(sum(stock_current*cost_average),0)::text wac_value_sum, COALESCE(sum(price),0)::text price_sum, md5(string_agg(id::text||'|'||COALESCE(sku,'')||'|'||stock_current::text||'|'||cost_average::text||'|'||price::text, E'\\n' ORDER BY id)) hash FROM products WHERE store_id='${storeId}';`))[0];
  M.stock_movements = (await q(`SELECT count(*)::bigint n, COALESCE(sum(quantity_change),0)::text qty_sum, COALESCE(sum(quantity_change*unit_cost),0)::text value_sum, md5(string_agg(id::text||'|'||product_id||'|'||quantity_change::text||'|'||COALESCE(unit_cost,0)::text, E'\\n' ORDER BY id)) hash FROM stock_movements WHERE store_id='${storeId}';`))[0];
  M.receipts = (await q(`SELECT count(*)::bigint n, COALESCE(sum(total_cost),0)::text total_sum FROM receipts WHERE store_id='${storeId}';`))[0];
  M.receipt_items = (await q(`SELECT count(*)::bigint n, COALESCE(sum(ri.quantity),0)::text qty_sum, COALESCE(sum(ri.quantity*ri.unit_cost),0)::text value_sum FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id WHERE r.store_id='${storeId}';`))[0];
  M.transactions = (await q(`SELECT count(*)::bigint n, COALESCE(sum(total_amount),0)::text amount_sum, md5(string_agg(id::text||'|'||status||'|'||total_amount::text, E'\\n' ORDER BY id)) hash FROM transactions WHERE store_id='${storeId}';`))[0];
  M.payment_transactions = (await q(`SELECT count(*)::bigint n, COALESCE(sum(amount),0)::text amount_sum, COALESCE(sum(amount_cup),0)::text amount_cup_sum FROM payment_transactions WHERE store_id='${storeId}';`))[0];
  M.commission_payments = (await q(`SELECT count(*)::bigint n, COALESCE(sum(final_amount),0)::text amount_sum, md5(string_agg(id::text||'|'||status||'|'||final_amount::text, E'\\n' ORDER BY id)) hash FROM commission_payments WHERE store_id='${storeId}';`))[0];
  M.cash_closures = (await q(`SELECT count(*)::bigint n, COALESCE(sum(system_total),0)::text system_total_sum, COALESCE(sum(declared_total),0)::text declared_total_sum FROM cash_closures WHERE store_id='${storeId}';`))[0];
  M.cash_movements = (await q(`SELECT count(*)::bigint n, COALESCE(sum(amount),0)::text amount_sum FROM cash_movements WHERE store_id='${storeId}';`))[0];
  M.fiscal_closings = (await q(`SELECT count(*)::bigint n FROM fiscal_closings WHERE store_id='${storeId}';`))[0];
  try {
    M.fiscal_period_closures = (await q(`SELECT count(*)::bigint n FROM fiscal_period_closures WHERE store_id='${storeId}';`))[0];
  } catch (e) {
    // OF-3: la tabla no existe en ningún relkind (documentado en 05_SIBLING_CENSUS)
    M.fiscal_period_closures = { absent: true };
  }
  M.audit_logs = (await q(`SELECT count(*)::bigint n, md5(string_agg(id::text||'|'||action||'|'||COALESCE(record_id::text,'NULL')||'|', E'\\n' ORDER BY id)) hash FROM audit_logs WHERE store_id='${storeId}';`))[0];
  M.wac_change_log = (await q(`SELECT count(*)::bigint n FROM wac_change_log WHERE store_id='${storeId}';`))[0];
  M.inventory = (await q(`SELECT count(*)::bigint n FROM inventory WHERE store_id='${storeId}';`))[0];
  // normalizar a números los conteos
  const out = {};
  for (const [k, v] of Object.entries(M)) {
    out[k] = {};
    for (const [kk, vv] of Object.entries(v)) {
      out[k][kk] = kk === 'hash' ? vv : N(vv);
    }
  }
  return out;
}

(async () => {
  const label = process.argv[2];
  const outFile = process.argv[3];
  const snap = { label, captured_at: new Date().toISOString(), stores: {} };
  for (const [name, id] of Object.entries(STORES)) {
    snap.stores[name] = await storeMetrics(id, name);
  }
  // canonical determinista: métricas en orden fijo de inserción (mismo código en PRE/POST)
  const canonical = JSON.stringify(snap.stores);
  snap.overall_md5 = crypto.createHash('md5').update(canonical).digest('hex');
  fs.writeFileSync(outFile, JSON.stringify(snap, null, 1));
  console.log(`snapshot ${label} written: ${outFile} — overall_md5=${snap.overall_md5}`);
})().catch(e => { console.error('SNAPSHOT FAILED:', e.message); process.exit(1); });
