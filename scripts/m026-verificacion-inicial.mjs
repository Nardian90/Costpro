#!/usr/bin/env node
/**
 * M026 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 §0/FASE I (PRE):
 * VERIFICACIÓN INICIAL DEL ESTADO REAL DE PRODUCCIÓN. READ-ONLY.
 *
 * - Los 208 movimientos de compra sin reference_id (M024/M023) siguen existiendo?
 * - Distribución por tienda, fecha, tipo, moneda.
 * - FAC-VITALLCONS-001 intacta (tasa 680 / 192.039.436 / 1 asiento / 101 refs).
 * - Conteos base para las fases posteriores (fin, inventario, productos).
 * Uso: node scripts/m026-verificacion-inicial.mjs
 */
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

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const out = { generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001' };

// ── 1. Movimientos de compra sin reference_id (el supuesto 208) ─────────────
out.purchase_sin_ref_por_tienda = await q(`SELECT sm.store_id, s.name AS tienda, count(*)::int AS n
  FROM public.stock_movements sm LEFT JOIN public.stores s ON s.id = sm.store_id
  WHERE sm.movement_type='purchase' AND sm.reference_id IS NULL
  GROUP BY sm.store_id, s.name ORDER BY n DESC`);

out.purchase_sin_ref_por_fecha = await q(`SELECT sm.movement_date::date AS fecha, count(*)::int AS n
  FROM public.stock_movements sm
  WHERE sm.movement_type='purchase' AND sm.reference_id IS NULL
  GROUP BY sm.movement_date::date ORDER BY fecha`);

out.total_purchase = await q(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE reference_id IS NULL)::int AS sin_ref,
    count(*) FILTER (WHERE reference_id IS NOT NULL)::int AS con_ref
  FROM public.stock_movements WHERE movement_type='purchase'`);

out.tipos_movimiento = await q(`SELECT movement_type, count(*)::int AS n,
    count(*) FILTER (WHERE reference_id IS NULL)::int AS sin_ref
  FROM public.stock_movements GROUP BY movement_type ORDER BY n DESC`);

// ── 2. FAC-VITALLCONS-001 intacta ─────────────────────────────────────────────
out.fvc = await q(`SELECT total_cost::float8 AS total, status, reception_date::text
  FROM public.receipts WHERE id='${FVC}'`);
out.fvc_asientos = await q(`SELECT count(*)::int AS n FROM public.fin_entries
  WHERE document_type='RECEPCION' AND document_id='${FVC}'`);
out.fvc_refs = await q(`SELECT count(*)::int AS n FROM public.stock_movements
  WHERE reference_id='${FVC}' AND movement_type='purchase'`);

// ── 3. Conteos base ───────────────────────────────────────────────────────────
out.conteos = await q(`SELECT
  (SELECT count(*) FROM public.receipts)::int AS receipts,
  (SELECT count(*) FROM public.receipt_items)::int AS receipt_items,
  (SELECT count(*) FROM public.fin_entries)::int AS fin_entries,
  (SELECT count(*) FROM public.fin_movements)::int AS fin_movements,
  (SELECT count(*) FROM public.fin_posting_errors)::int AS fin_posting_errors,
  (SELECT count(*) FROM public.stock_movements)::int AS stock_movements,
  (SELECT count(*) FROM public.products)::int AS products,
  (SELECT count(*) FROM public.stores)::int AS stores,
  (SELECT count(*) FROM public.audit_logs WHERE action='TRACEABILITY_BACKFILL')::int AS audit_traceability`);

// ── 4. Esquema: columnas disponibles ──────────────────────────────────────────
out.cols_stock_movements = await q(`SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='stock_movements' ORDER BY ordinal_position`);
out.cols_fin_movements = await q(`SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='fin_movements' ORDER BY ordinal_position`);
out.cols_fin_entries = await q(`SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='fin_entries' ORDER BY ordinal_position`);
out.cols_inventory = await q(`SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN ('inventory','inventory_items','product_inventory','stock')
  ORDER BY table_name, ordinal_position`);

// ── 5. Tiendas activas ────────────────────────────────────────────────────────
out.tiendas = await q(`SELECT id::text, name FROM public.stores ORDER BY name`);

// ── 6. Cuentas contables relevantes ───────────────────────────────────────────
out.cuentas_inventario = await q(`SELECT code, name FROM public.fin_accounts
  WHERE code LIKE 'ACT_INVENTARIO%' OR name ILIKE '%inventario%' ORDER BY code LIMIT 10`).catch(() => []);
if (!out.cuentas_inventario || !out.cuentas_inventario.length) {
  // descubrir el esquema de cuentas si la estructura difiere
  out.tablas_fin = await q(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%fin%' OR table_name ILIKE '%account%' OR table_name ILIKE '%ledger%')
    ORDER BY table_name`);
}

writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m026-verificacion-inicial.json'), JSON.stringify(out, null, 2));

// ── Resumen consola ───────────────────────────────────────────────────────────
console.log('=== M026 VERIFICACIÓN INICIAL (READ-ONLY PROD) ===');
console.log('purchase:', JSON.stringify(out.total_purchase[0]));
console.log('sin ref por tienda:', out.purchase_sin_ref_por_tienda.map(r => `${r.tienda||r.store_id}:${r.n}`).join(' | '));
console.log('FVC:', JSON.stringify(out.fvc[0]), '| asientos:', out.fvc_asientos[0].n, '| movs ref FVC:', out.fvc_refs[0].n);
console.log('conteos:', JSON.stringify(out.conteos[0]));
console.log('fechas sin ref (top10):', out.purchase_sin_ref_por_fecha.slice(0, 10).map(r => `${r.fecha}:${r.n}`).join(' | '));
console.log('\nColumnas stock_movements:', out.cols_stock_movements.map(c => c.column_name).join(', '));
console.log('\nColumnas fin_movements:', out.cols_fin_movements.map(c => c.column_name).join(', '));
console.log('\nColumnas fin_entries:', out.cols_fin_entries.map(c => c.column_name).join(', '));
if (out.cuentas_inventario && out.cuentas_inventario.length) console.log('\nCuentas inventario:', JSON.stringify(out.cuentas_inventario));
if (out.tablas_fin) console.log('\nTablas fin:', out.tablas_fin.map(t => t.table_name).join(', '));
if (out.cols_inventory && out.cols_inventory.length) console.log('\nCols inventory:', JSON.stringify(out.cols_inventory));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m026-verificacion-inicial.json');
