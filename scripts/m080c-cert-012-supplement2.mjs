#!/usr/bin/env node
// ============================================================================
// M080c — CP-FIN-POST-RECTIFICATION-CERTIFICATION-012 · SUPLEMENTO 2
// Detalle de los asientos orgánicos (3 ventas 18:05–18:50Z + servicio 21:06Z)
// y contexto preexistente de valoración (costos negativos). SELECT exclusivo.
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function qs(sql, label) {
  const head = sql.trim().slice(0, 60).toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) throw new Error(`GUARD RO: ${label}`);
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m080c:${label}` });
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

const out = { mision: 'CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012', extraccion: { fecha_utc: new Date().toISOString(), suplemento: 2 } };

// 1. Movimientos contables de los 5 asientos orgánicos
out.movs_organicos = await qs(`SELECT fm.entry_id, e.document_type, e.document_id, e.event, e.posted_at,
    fm.category_code, fm.sense, fm.amount, fm.amount_cup
  FROM public.fin_movements fm JOIN public.fin_entries e ON e.id=fm.entry_id
  WHERE fm.entry_id IN (
    '96c77749-d475-4eb2-b26e-30c5cd10f432','cb419a22-f1ff-4e12-b478-22c3f24700e9',
    'df201fa0-e60c-4c7a-92cd-5b80af1a2b94','67fc9c45-0fc6-4ade-937f-3b02009a18b1',
    'c78e28fb-cc69-4f45-bde0-386a910c91a0')
  ORDER BY e.posted_at, fm.category_code, fm.sense`, 'movs_organicos');

// 2. Documento de servicio recibido y su pago
out.servicio_recibido = await qs(`SELECT * FROM public.received_services WHERE id='708e16dd-43cd-4a7e-8c3d-0c6fd3dd60ab'`, 'servicio_recibido');
out.pago_servicio = await qs(`SELECT id, amount, currency, created_at, reference
  FROM public.payment_transactions WHERE reference='708e16dd-43cd-4a7e-8c3d-0c6fd3dd60ab'`, 'pago_servicio');

// 3. Contexto preexistente: productos con costo/stock negativo (valoración operativa)
out.negativos = await qs(`SELECT count(*)::int AS productos_no_servicio,
    count(*) FILTER (WHERE cost_average < 0)::int AS wac_negativo,
    count(*) FILTER (WHERE stock_current < 0)::int AS stock_negativo,
    count(*) FILTER (WHERE cost_average = 0 AND stock_current <> 0)::int AS wac_cero_con_stock
  FROM public.products WHERE store_id='${STORE}' AND is_service=false`, 'negativos');

// 4. Kardex de las 3 ventas orgánicas: productos de FVC con costo de salida (trazabilidad)
out.ventas_organicas_items = await qs(`SELECT ti.transaction_id, ti.product_id, p.sku, ti.quantity,
    ti.cost_at_sale, ti.price_at_sale_cup, ti.created_at, t.status AS tx_status
  FROM public.transaction_items ti
  JOIN public.products p ON p.id=ti.product_id
  JOIN public.transactions t ON t.id=ti.transaction_id
  WHERE ti.transaction_id IN ('9bac8945-fe6a-4c59-92d1-b37f2a1cd467','97263a9c-054f-45a0-a6fe-bc52c155bcff','92503dc6-495d-4924-a8c1-baa5f44b86f3')
  ORDER BY ti.created_at`, 'ventas_organicas_items');

// 5. Movimientos de stock de esas ventas (para confirmar uc de salida y canal)
out.ventas_organicas_movs = await qs(`SELECT sm.id, sm.reference_id, sm.movement_type, sm.product_id, p.sku,
    sm.quantity_change, sm.unit_cost, sm.created_at
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.reference_id IN ('9bac8945-fe6a-4c59-92d1-b37f2a1cd467','97263a9c-054f-45a0-a6fe-bc52c155bcff','92503dc6-495d-4924-a8c1-baa5f44b86f3')
  ORDER BY sm.created_at`, 'ventas_organicas_movs');

writeFileSync(resolve('scripts/out/m012/extract-supplement2.json'), JSON.stringify(out, null, 2));
console.log('Suplemento 2 → scripts/out/m012/extract-supplement2.json');
