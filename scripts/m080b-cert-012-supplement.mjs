#!/usr/bin/env node
// ============================================================================
// M080b — CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012 · SUPLEMENTO
// Consultas agregadas read-only complementarias a m080 (SELECT exclusivo).
// Salida: scripts/out/m012/extract-supplement.json
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const WIN_START = '2026-11-16T19:42:56.855Z';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function qs(sql, label) {
  const head = sql.trim().slice(0, 60).toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) throw new Error(`GUARD RO: ${label}`);
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m080b:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}

const out = { mision: 'CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012', extraccion: { fecha_utc: new Date().toISOString(), metodo: 'Management API SELECT', suplemento_de: 'm080' } };

// 1. Sumas por categoría × fecha económica (para Estado de Resultados y libro mayor)
out.categoria_fecha = await qs(`SELECT m.category_code, m.economic_date,
    coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0) AS neto_debito,
    count(*)::int AS movs
  FROM public.fin_movements m WHERE m.store_id='${STORE}'
  GROUP BY 1,2 ORDER BY 1,2`, 'categoria_fecha');

// 2. Pagos de la recepción (esperado 0)
out.pagos_fvc = await qs(`SELECT count(*)::int AS n, coalesce(sum(amount),0) AS total
  FROM public.payment_transactions WHERE reference='${FVC}'`, 'pagos_fvc');

// 3. Cuentas por pagar por proveedor (estado actual, recepciones activas)
out.cxp_por_proveedor = await qs(`SELECT supplier, payment_status, count(*)::int AS n,
    coalesce(sum(total_cost),0) AS total, coalesce(sum(paid_amount),0) AS pagado,
    min(due_date) AS vencimiento_min, max(due_date) AS vencimiento_max
  FROM public.receipts WHERE store_id='${STORE}' AND status='active'
  GROUP BY supplier, payment_status ORDER BY supplier, payment_status`, 'cxp_por_proveedor');

// 4. Drift stock campo vs kardex (tienda completa)
out.drift_stock_kardex = await qs(`WITH k AS (SELECT product_id, sum(quantity_change) AS q
    FROM public.stock_movements GROUP BY product_id)
  SELECT count(*)::int AS productos_no_servicio,
    count(*) FILTER (WHERE p.stock_current IS DISTINCT FROM k.q)::int AS drift_campo_vs_kardex,
    count(*) FILTER (WHERE coalesce(k.q,0) < 0)::int AS saldos_negativos
  FROM public.products p LEFT JOIN k ON k.product_id=p.id
  WHERE p.store_id='${STORE}' AND p.is_service=false`, 'drift_stock_kardex');

// 5. Auditoría completa en la ventana (sin truncar)
out.auditoria_ventana_full = await qs(`SELECT trace_id, action, created_at, record_id, table_name
  FROM public.audit_logs WHERE created_at > '${WIN_START}' ORDER BY created_at LIMIT 400`, 'auditoria_ventana_full');

// 6. Ventana completa de asientos: entre RECT-2 y RECT-011 (actividad orgánica)
out.asientos_entre_rect2_y_rect011 = await qs(`SELECT id, event, document_type, document_id, store_id, status, posted_at
  FROM public.fin_entries
  WHERE posted_at > '2026-11-16T16:08:00Z' AND posted_at < '2026-11-16T20:02:56Z'
  ORDER BY posted_at`, 'asientos_entre_rect2_y_rect011');

// 7. Movimientos de stock en la ventana (orgánicos, todas las tiendas)
out.movs_ventana_todas = await qs(`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE store_id='${STORE}')::int AS enervida,
    count(*) FILTER (WHERE store_id<>'${STORE}')::int AS otras_tiendas,
    min(created_at) AS primera, max(created_at) AS ultima
  FROM public.stock_movements WHERE created_at > '${WIN_START}'`, 'movs_ventana_todas');

// 8. Última fecha económica con movimientos y primera entrada contable
out.rango_economico = await qs(`SELECT min(economic_date) AS primera, max(economic_date) AS ultima,
    count(*)::int AS entradas FROM public.fin_entries WHERE store_id='${STORE}'`, 'rango_economico');

writeFileSync(resolve('scripts/out/m012/extract-supplement.json'), JSON.stringify(out, null, 2));
console.log('Suplemento → scripts/out/m012/extract-supplement.json');
