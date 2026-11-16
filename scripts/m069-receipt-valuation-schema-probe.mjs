#!/usr/bin/env node
// ============================================================================
// M069 — CP-FIN-RECEIPT-FULL-VALUATION-010 · SONDA DE ESQUEMA (READ-ONLY)
// Verifica columnas exactas de las tablas involucradas en la conciliación de
// las 101 líneas de FAC-VITALLCONS-001. SOLO SELECT contra producción.
// Uso: node scripts/m069-receipt-valuation-schema-probe.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}

const out = { fecha_utc: new Date().toISOString(), guard_ref: ref, metodo: 'Management API SELECT-only' };
const TABLAS = ['receipts', 'receipt_items', 'products', 'stock_movements', 'sale_items',
  'sales', 'transactions', 'transaction_items', 'transaction_item_lots', 'sales_transactions',
  'issue_slip_items', 'wac_change_log', 'exchange_rates'];
out.tablas_transaccionales = await q(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public'
     AND (table_name ILIKE '%transaction%' OR table_name ILIKE '%sale%') ORDER BY table_name`, 'tablas transaccionales');

out.columnas = {};
for (const t of TABLAS) {
  out.columnas[t] = await q(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`, t);
}
// tipos de movimiento y contadores clave de la recepción
out.receipt_items_tipos = await q(
  `SELECT count(*)::int AS n_lineas, count(DISTINCT product_id)::int AS n_skus,
          count(DISTINCT moneda_recepcion)::int AS n_monedas
   FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`, 'conteo receipt_items');
out.movement_types_fvc = await q(
  `SELECT movement_type, count(*)::int AS n FROM public.stock_movements
   WHERE reference_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' GROUP BY movement_type`, 'movement_types FVC');
out.exchange_rates_cols_ok = (out.columnas.exchange_rates || []).length;
out.veredicto = 'ESQUEMA SONDEADO — columnas verificadas para m070';
writeFileSync('scripts/out/m069-schema-probe.json', JSON.stringify(out, null, 2));
console.log('Sonda m069 OK → scripts/out/m069-schema-probe.json');
