#!/usr/bin/env node
// ============================================================================
// M090 — CP-FIN-NEGATIVE-WAC-REMEDIATION-013
// Extracción integral READ-ONLY de producción para la investigación de los
// cinco WAC negativos detectados por la misión 012 (F-012-1):
//   SKU117, SKU83, SKU90, SKU40, SKU37 (tienda ENERVIDA).
//
// · Canal: Management API /database/query (SELECT/WITH exclusivamente).
// · Guards: CP-INFRA-019 (assertNotProduction read, ALLOW_PROD=read-only),
//   guard de referencia (proyecto = producción) y guard anti-escritura por
//   consulta (CP-INFRA-020, solo SELECT/WITH).
// · Re-ejecutable: ninguna escritura, resultados deterministas.
// · Salida: scripts/out/m013/extract.json
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const ORIG = '93bb5da9-0afd-4325-baad-a275710062c5';
const RECT1 = '7ec90009-0000-4000-8000-d0b300000001';
const RECT2 = '7ec90009-0000-4000-8000-d0b300000002';
const E011 = '7ec9000b-0000-4000-8000-d11300000001';
const SKUS = ['117', '83', '90', '40', '37', '31']; // 31 = control (WAC=1, capas ajenas)
const SKU_LIST = `('${SKUS.join("','")}')`;

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m090:${label}` });
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
  mision: 'CP-FIN-NEGATIVE-WAC-REMEDIATION-013',
  extraccion: {
    canal: 'Management API /database/query (SELECT exclusivo)',
    guards: ['CP-INFRA-019 read', 'referencia producción', 'CP-INFRA-020 por consulta'],
    generada: new Date().toISOString(),
    proyecto: PROD,
    skus_objetivo: SKUS,
  },
};

// ── 1. Productos actuales (los 6 SKUs en TODAS las tiendas — alcance por tienda)
out.productos_todas_tiendas = await qs(`
  SELECT p.id, p.store_id, s.name AS store_name, p.sku, p.name, p.is_service,
         p.stock_current, p.cost_average, p.cost_price, p.price, p.price_currency,
         p.updated_at, p.master_product_id
  FROM public.products p LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.sku IN ${SKU_LIST} ORDER BY p.sku, p.store_id`, 'productos_todas_tiendas');

// ── 2. wac_change_log — historial COMPLETO de WAC de los 6 productos (todas las tiendas)
out.wac_log_historico = await qs(`
  SELECT w.id, w.store_id, w.product_id, p.sku, w.wac_before, w.wac_after, w.event,
         w.qty_in, w.uc_in, w.source_ref, w.changed_by, w.created_at
  FROM public.wac_change_log w
  LEFT JOIN public.products p ON p.id = w.product_id
  WHERE w.product_id IN (SELECT id FROM public.products WHERE sku IN ${SKU_LIST})
  ORDER BY w.product_id, w.created_at, w.id`, 'wac_log_historico');

// ── 3. kardex actual (post-RECT-011) de los 6 SKUs — ENERVIDA y demás tiendas
out.kardex_actual = await qs(`
  SELECT m.id, m.product_id, p.sku, m.store_id, m.movement_type, m.quantity_change,
         m.unit_cost, m.unit_cost_derived, m.unit_cost_derived_source, m.balance_after,
         m.cost_value_change, m.reference_id, m.reference_doc, m.notes,
         m.movement_date, m.created_at, m.cogs_derivation_status, m.unit_price
  FROM public.stock_movements m JOIN public.products p ON p.id = m.product_id
  WHERE p.sku IN ${SKU_LIST}
  ORDER BY p.sku, m.created_at, m.id`, 'kardex_actual');

// ── 4. Capas de compra de los 6 SKUs (todas las recepciones, todas las tiendas)
out.capas_compra = await qs(`
  SELECT m.id, m.product_id, p.sku, m.store_id, m.movement_type, m.quantity_change,
         m.unit_cost, m.reference_id, m.reference_doc, m.movement_date, m.created_at
  FROM public.stock_movements m JOIN public.products p ON p.id = m.product_id
  WHERE p.sku IN ${SKU_LIST} AND m.movement_type = 'purchase'
  ORDER BY p.sku, m.created_at`, 'capas_compra');

// ── 5. Recepción ajena de SKU90 (30538c95…) y demás recepciones de los 6 SKUs
out.recepciones_6skus = await qs(`
  SELECT DISTINCT r.id, r.reference_doc, r.store_id, r.total_cost, r.status,
         r.payment_status, r.created_at
  FROM public.receipts r
  WHERE r.id IN (SELECT reference_id::uuid FROM public.stock_movements
                 WHERE movement_type='purchase'
                   AND product_id IN (SELECT id FROM public.products WHERE sku IN ${SKU_LIST})
                   AND reference_id IS NOT NULL)
  ORDER BY r.created_at`, 'recepciones_6skus');

out.receipt_items_6skus = await qs(`
  SELECT ri.id, ri.receipt_id, ri.product_id, p.sku, ri.quantity, ri.unit_cost,
         ri.moneda_recepcion, ri.tasa_cambio_recepcion, ri.created_at
  FROM public.receipt_items ri JOIN public.products p ON p.id = ri.product_id
  WHERE p.sku IN ${SKU_LIST} ORDER BY p.sku, ri.created_at`, 'receipt_items_6skus');

// ── 6. Los 4 asientos del FVC y sus movimientos exactos
out.fin_entries_fvc = await qs(`
  SELECT e.id, e.document_type, e.document_id, e.document_number, e.event, e.economic_date,
         e.posted_at, e.reversal_of, e.status, e.description, e.movements_snapshot
  FROM public.fin_entries e WHERE e.document_id = '${FVC}' ORDER BY e.posted_at`, 'fin_entries_fvc');

out.fin_movements_fvc = await qs(`
  SELECT m.id, m.entry_id, m.category_code, m.sense, m.amount, m.currency, m.exchange_rate,
         m.amount_cup, m.economic_date, m.document_number, m.description, m.traza, m.created_at
  FROM public.fin_movements m WHERE m.entry_id IN ('${ORIG}','${RECT1}','${RECT2}','${E011}')
  ORDER BY m.entry_id, m.created_at`, 'fin_movements_fvc');

// ── 7. Saldos de las 5 cuentas clave reconstruidos del libro mayor (por tienda)
out.saldos_cuentas = await qs(`
  WITH movs AS (
    SELECT m.store_id, m.category_code, m.sense, m.amount_cup, m.economic_date, m.created_at
    FROM public.fin_movements m
    WHERE m.category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
  )
  SELECT category_code, store_id,
         count(*) AS movs,
         sum(CASE WHEN sense='debito' THEN amount_cup ELSE 0 END) AS total_debe,
         sum(CASE WHEN sense='credito' THEN amount_cup ELSE 0 END) AS total_haber,
         sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) AS saldo_natural
  FROM movs GROUP BY category_code, store_id ORDER BY category_code, store_id`, 'saldos_cuentas');

// ── 8. Cortes temporales de ACT_INVENTARIO / gastos (ENERVIDA): antes y después de RECT-011
out.cadena_corte = await qs(`
  WITH movs AS (
    SELECT m.category_code, m.sense, m.amount_cup, m.created_at, m.economic_date, m.description
    FROM public.fin_movements m
    WHERE m.store_id = '${STORE}'
      AND m.category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
  )
  SELECT category_code,
         count(*) FILTER (WHERE created_at < '2026-11-16 16:07:49') AS movs_antes_rect2,
         sum(CASE WHEN sense='debito' AND created_at < '2026-11-16 16:07:49' THEN amount_cup ELSE 0 END)
           - sum(CASE WHEN sense='credito' AND created_at < '2026-11-16 16:07:49' THEN amount_cup ELSE 0 END) AS saldo_antes_rect2,
         count(*) FILTER (WHERE created_at >= '2026-11-16 16:07:49' AND created_at < '2026-11-16 20:03:06') AS movs_ventana,
         sum(CASE WHEN sense='debito' AND created_at >= '2026-11-16 16:07:49' AND created_at < '2026-11-16 20:03:06' THEN amount_cup ELSE 0 END)
           - sum(CASE WHEN sense='credito' AND created_at >= '2026-11-16 16:07:49' AND created_at < '2026-11-16 20:03:06' THEN amount_cup ELSE 0 END) AS delta_ventana,
         count(*) AS movs_total,
         sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) AS saldo_actual
  FROM movs GROUP BY category_code ORDER BY category_code`, 'cadena_corte');

// ── 9. Auditoría de la ventana lote C (SYSTEM_RECT011_WAC) para los 6 productos
out.audit_loteC = await qs(`
  SELECT a.id, a.table_name, a.record_id, a.action, a.old_data, a.new_data,
         a.metadata, a.store_id, a.trace_id, a.created_at
  FROM public.audit_logs a
  WHERE a.action = 'SYSTEM_RECT011_WAC'
    AND a.record_id IN (SELECT id FROM public.products WHERE sku IN ${SKU_LIST})
  ORDER BY a.created_at`, 'audit_loteC');

out.audit_ventana_completa = await qs(`
  SELECT a.action, count(*) AS filas, min(a.created_at) AS primera, max(a.created_at) AS ultima
  FROM public.audit_logs a
  WHERE a.created_at >= '2026-11-16 19:55:00' AND a.created_at <= '2026-11-16 20:04:00'
  GROUP BY a.action ORDER BY primera`, 'audit_ventana_completa');

// ── 10. COGS/VALES/PÉRDIDA históricos reales atribuibles a los 6 SKUs (kardex)
out.salidas_costo_historico = await qs(`
  SELECT p.sku, m.movement_type, count(*) AS n,
         sum(-m.quantity_change) FILTER (WHERE m.quantity_change < 0) AS unidades_salida,
         sum(-m.quantity_change * COALESCE(m.unit_cost,0)) FILTER (WHERE m.quantity_change < 0) AS costo_registrado,
         sum(m.quantity_change * COALESCE(m.unit_cost,0)) FILTER (WHERE m.quantity_change > 0 AND m.movement_type::text LIKE '%reverse%') AS costo_reversado
  FROM public.stock_movements m JOIN public.products p ON p.id = m.product_id
  WHERE p.sku IN ${SKU_LIST} AND p.store_id = '${STORE}'
    AND (m.quantity_change < 0 OR m.movement_type::text LIKE '%reverse')
  GROUP BY p.sku, m.movement_type ORDER BY p.sku, m.movement_type`, 'salidas_costo_historico');

// ── 11. Verificación de los 5 WAC negativos HOY (repro F-012-1) + universo tienda
out.wac_negativos_hoy = await qs(`
  SELECT p.sku, p.name, p.cost_average, p.stock_current, p.is_service
  FROM public.products p
  WHERE p.store_id = '${STORE}' AND p.is_service = false AND p.cost_average < 0
  ORDER BY p.cost_average`, 'wac_negativos_hoy');

out.valoracion_tienda = await qs(`
  WITH kardex AS (
    SELECT m.product_id, sum(m.quantity_change) AS qty_kardex
    FROM public.stock_movements m
    WHERE m.store_id = '${STORE}'
    GROUP BY m.product_id
  )
  SELECT count(*) FILTER (WHERE p.is_service=false) AS productos_no_servicio,
         count(*) FILTER (WHERE p.is_service=false AND p.stock_current <> COALESCE(k.qty_kardex,0)) AS drift_campo_vs_kardex,
         count(*) FILTER (WHERE p.is_service=false AND p.cost_average < 0) AS wac_negativo,
         sum(p.stock_current * p.cost_average) FILTER (WHERE p.is_service=false) AS valor_campo,
         sum(COALESCE(k.qty_kardex,0) * p.cost_average) FILTER (WHERE p.is_service=false) AS valor_kardex_wac
  FROM public.products p LEFT JOIN kardex k ON k.product_id = p.id
  WHERE p.store_id = '${STORE}'`, 'valoracion_tienda');

// ── 12. Hashes de integridad del kardex de los 6 SKUs (comparables con extractos congelados)
out.hashes = {};
const kardexRows = out.kardex_actual || [];
for (const sku of SKUS) {
  const rows = kardexRows.filter(r => r.sku === sku);
  out.hashes[`kardex_sku${sku}`] = md5(rows.map(r => `${r.id}|${r.quantity_change}|${r.unit_cost}`).join('\n'));
}

mkdirSync(resolve(process.cwd(), 'scripts/out/m013'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'scripts/out/m013/extract.json'), JSON.stringify(out, null, 1));
console.log(`\nGuardado: scripts/out/m013/extract.json (${Object.keys(out).length - 2} secciones)`);
