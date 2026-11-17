#!/usr/bin/env node
// ============================================================================
// M100 — CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014
// Extracción maestra READ-ONLY de producción (universo completo FAC-VITALLCONS-001).
//   · Canal: Management API /database/query (SELECT/WITH exclusivamente).
//   · Guards: CP-INFRA-019 (assertNotProduction read, ALLOW_PROD=read-only),
//     guard de referencia (proyecto = producción) y guard anti-escritura por
//     consulta (CP-INFRA-020, solo SELECT/WITH).
//   · Re-ejecutable: ninguna escritura, resultados deterministas.
//   · Salida: scripts/out/m014/extract.json
// Secciones:
//   1  receipt + receipt_items (101 líneas, estado actual 1 CUP)
//   2  audit RECT-011 lote A (costos ORIGINALES old_data — base del modelo m074)
//   3  kardex 101 productos (todos los movimientos ENERVIDA, fresco)
//   4  capas de compra de los 101 productos (todas las recepciones, intactas)
//   5  products estado actual (ENERVIDA + otras tiendas para integridad)
//   6  wac_change_log 101 (post RECT-011 lote C)
//   7  fin_entries + fin_movements del documento FVC (ORIG/RECT-1/RECT-2/RECT-011)
//   8  saldos de las 5 cuentas por tienda
//   9  auditoría de la ventana RECT-011/RECT-013 (integridad de lo aplicado)
//  10  fin_posting_errors + controles T12/RLS (metadatos)
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m100:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 500)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}
// Guard anti-escritura CP-INFRA-020 (nivel consulta): solo SELECT/WITH.
function qs(sql, label) {
  const head = sql.trim().slice(0, 60).toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) {
    throw new Error(`GUARD RO: consulta no-SELECT rechazada en ${label}`);
  }
  return q(sql, label);
}
const md5 = (s) => createHash('md5').update(s).digest('hex');

const out = {
  mision: 'CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014',
  extraccion: {
    canal: 'Management API /database/query (SELECT exclusivo)',
    guards: ['CP-INFRA-019 read', 'referencia producción', 'CP-INFRA-020 por consulta'],
    generada: new Date().toISOString(),
    proyecto: PROD,
    store_enervida: STORE,
    receipt: FVC,
  },
};

// ── 1. Recepción y 101 líneas (estado actual: 1 CUP tras RECT-011 lote A)
out.receipt = (await qs(`SELECT id, reference_doc, supplier, total_cost, status, reception_date, payment_status, paid_amount, created_at, store_id
  FROM public.receipts WHERE id='${FVC}'`, 'receipt'))[0] || null;
out.receipt_items = await qs(`
  SELECT ri.id AS line_id, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost,
         ri.moneda_recepcion, ri.tasa_cambio_recepcion, p.is_service, p.store_id
  FROM public.receipt_items ri JOIN public.products p ON p.id = ri.product_id
  WHERE ri.receipt_id='${FVC}'
  ORDER BY p.sku::bigint`, 'receipt_items 101');
const PIDS = [...new Set(out.receipt_items.map((r) => r.product_id))].map((i) => `'${i}'`).join(',');
out.control_alcance = {
  lineas: out.receipt_items.length,
  productos_distintos: new Set(out.receipt_items.map((r) => r.product_id)).size,
  skus_distintos: new Set(out.receipt_items.map((r) => r.sku)).size,
};

// ── 2. Costos ORIGINALES (audit_logs RECT-011 lote A old_data)
out.audit_rect011_lineas = await qs(`
  SELECT id, created_at, action, old_data, new_data, trace_id
  FROM public.audit_logs
  WHERE action ILIKE '%RECT011%LINE%' OR (action ILIKE '%RECT011%' AND table_name='receipt_items')
  ORDER BY created_at`, 'audit_rect011_lineas');

// ── 3. Kardex completo de los 101 productos (todas las tiendas, fresco)
out.kardex_101 = await qs(`
  SELECT sm.id, sm.store_id, sm.product_id, p.sku, sm.movement_type, sm.quantity_change,
         sm.unit_cost, sm.unit_price, sm.cost_value_change, sm.balance_after,
         sm.reference_id, sm.reference_doc, sm.movement_date, sm.created_at
  FROM public.stock_movements sm JOIN public.products p ON p.id = sm.product_id
  WHERE sm.product_id IN (${PIDS})
  ORDER BY p.sku::bigint, sm.movement_date, sm.created_at, sm.id`, 'kardex_101');

// ── 4. Capas de compra de los 101 productos (todas las recepciones — integridad)
out.capas_101 = await qs(`
  SELECT sm.id, sm.product_id, p.sku, sm.quantity_change, sm.unit_cost, sm.reference_id,
         r.reference_doc, sm.movement_date, sm.store_id
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  LEFT JOIN public.receipts r ON r.id = sm.reference_id::uuid
  WHERE sm.product_id IN (${PIDS}) AND sm.movement_type='purchase'
  ORDER BY p.sku::bigint, sm.movement_date`, 'capas_101');

// ── 5. Estado actual de productos (101 en todas las tiendas)
out.productos_101 = await qs(`
  SELECT p.id, p.store_id, s.name AS store_name, p.sku, p.name, p.is_service,
         p.stock_current, p.cost_average, p.cost_price, p.price, p.price_currency,
         p.updated_at, p.master_product_id
  FROM public.products p LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.id IN (${PIDS})
  ORDER BY p.sku::bigint, p.store_id`, 'productos_101');

// ── 6. wac_change_log de los 101 (historial completo)
out.wac_log_101 = await qs(`
  SELECT w.id, w.store_id, w.product_id, p.sku, w.wac_before, w.wac_after, w.event,
         w.qty_in, w.uc_in, w.source_ref, w.created_at
  FROM public.wac_change_log w JOIN public.products p ON p.id = w.product_id
  WHERE w.product_id IN (${PIDS})
  ORDER BY p.sku::bigint, w.created_at`, 'wac_log_101');

// ── 7. Asientos financieros del documento FVC y sus rectificaciones
out.fin_entries_fvc = await qs(`
  SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.status,
         fe.economic_date, fe.reversal_of, fe.posted_at, fe.description
  FROM public.fin_entries fe
  WHERE fe.document_id='${FVC}' OR fe.document_number LIKE 'RECT-%'
     OR fe.reversal_of IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}')
  ORDER BY fe.posted_at`, 'fin_entries_fvc');
const EIDS = out.fin_entries_fvc.map((e) => `'${e.id}'`).join(',');
out.fin_movements_fvc = EIDS ? await qs(`
  SELECT fm.id, fm.entry_id, fm.category_code, fm.sense, fm.amount, fm.amount_cup,
         fm.currency, fm.exchange_rate, fm.economic_date, fm.document_number, fm.description
  FROM public.fin_movements fm WHERE fm.entry_id IN (${EIDS})
  ORDER BY fm.entry_id, fm.category_code`, 'fin_movements_fvc') : [];

// ── 8. Saldos actuales de las 5 cuentas (por tienda)
out.saldos_cuentas = await qs(`
  SELECT category_code, store_id,
         count(*) AS movs,
         sum(CASE WHEN sense='debito' THEN amount_cup ELSE 0 END) AS total_debe,
         sum(CASE WHEN sense='credito' THEN amount_cup ELSE 0 END) AS total_haber,
         sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) AS saldo_natural
  FROM public.fin_movements
  WHERE category_code IN ('ACT_INVENTARIO','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV','PAS_CXP_PROV')
  GROUP BY category_code, store_id ORDER BY category_code, store_id`, 'saldos_cuentas');

// ── 9. Auditoría de la ventana de rectificaciones (integridad de lo aplicado)
out.audit_ventana = await qs(`
  SELECT action, count(*) AS n, min(created_at) AS primera, max(created_at) AS ultima
  FROM public.audit_logs
  WHERE action ILIKE '%RECT011%' OR action ILIKE '%RECT013%' OR trace_id ILIKE '%RECT011%' OR trace_id ILIKE '%RECT013%'
  GROUP BY action ORDER BY action`, 'audit_ventana');
out.audit_013 = await qs(`
  SELECT id, created_at, table_name, record_id, action, old_data, new_data, store_id, trace_id
  FROM public.audit_logs
  WHERE action ILIKE '%RECT013%' OR trace_id ILIKE '%RECT013%'
  ORDER BY created_at`, 'audit_013');

// ── 10. Controles del motor
out.fin_posting_errors = await qs(`SELECT count(*) AS n FROM public.fin_posting_errors`, 'fin_posting_errors');
out.t12_estado = await qs(`
  SELECT tgname, tgenabled FROM pg_trigger WHERE tgname ILIKE '%wac%' OR tgname ILIKE '%t12%'
  ORDER BY tgname`, 't12_estado');
out.valor_campo_tienda = await qs(`
  SELECT sum(stock_current * cost_average) AS valor, count(*) AS productos,
         count(*) FILTER (WHERE cost_average < 0) AS wac_negativos,
         count(*) FILTER (WHERE stock_current <> 0 AND cost_average IS NULL) AS sin_wac
  FROM public.products WHERE store_id='${STORE}'`, 'valor_campo_tienda');

// ── Hashes de integridad (para comparación contra extracciones congeladas)
out.hashes = {
  kardex_101_filas: out.kardex_101.length,
  kardex_101_md5: md5(out.kardex_101.map((m) => `${m.id}|${m.quantity_change}|${m.unit_cost}`).join('\n')),
  receipt_items_md5: md5(out.receipt_items.map((r) => `${r.line_id}|${r.quantity}|${r.unit_cost}|${r.moneda_recepcion}|${r.tasa_cambio_recepcion}`).join('\n')),
  capas_101_md5: md5(out.capas_101.map((c) => `${c.id}|${c.quantity_change}|${c.unit_cost}`).join('\n')),
};

mkdirSync(resolve(process.cwd(), 'scripts/out/m014'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'scripts/out/m014/extract.json'), JSON.stringify(out, null, 1));
console.log(`\nGuardado: scripts/out/m014/extract.json (${Object.keys(out).length - 2} secciones)`);
