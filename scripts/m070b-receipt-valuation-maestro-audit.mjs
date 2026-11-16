#!/usr/bin/env node
// ============================================================================
// M070b — CP-FIN-RECEIPT-FULL-VALUATION-010 · SONDA COMPLEMENTARIA READ-ONLY
// (1) Auditoría del maestro: cambios de precio/stock de SKU111/112 (audit_logs)
// (2) Transacción post-RECT-2 documentada (venta 1,2 u SKU111, ref 9bac8945)
// (3) Tasa USD del 2026-07-01 (evidencia 680) y utilization en receipt_items
// READ-ONLY ESTRICTO — solo SELECT. Re-ejecutable.
// Uso: node scripts/m070b-receipt-valuation-maestro-audit.mjs
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
  const head = sql.trim().slice(0, 40).toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) throw new Error(`GUARD RO: ${label}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 300)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}

const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const out = { fecha_utc: new Date().toISOString(), guard_ref: ref };

out.tablas_auditoria = await q(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%audit%' ORDER BY 1`,
  'tablas audit');
out.audit_maestro_111_112 = await q(
  `SELECT id, table_name, record_id, action, created_at,
      old_data->>'price' AS old_price, new_data->>'price' AS new_price,
      old_data->>'price_currency' AS old_cur, new_data->>'price_currency' AS new_cur,
      old_data->>'stock_current' AS old_stock, new_data->>'stock_current' AS new_stock
   FROM public.audit_logs
   WHERE table_name='products' AND record_id IN ('${S111}','${S112}')
     AND (old_data ? 'price' OR new_data ? 'price' OR old_data ? 'stock_current')
   ORDER BY created_at DESC LIMIT 25`, 'audit_logs maestro 111/112');
out.tx_post_rect2_sku111 = await q(
  `SELECT t.id, t.status, t.total_amount, t.sale_currency, t.sale_exchange_rate, t.completed_at,
      ti.quantity, ti.price_at_sale, ti.price_at_sale_cup, ti.cost_at_sale, ti.currency AS item_cur
   FROM public.transactions t JOIN public.transaction_items ti ON ti.transaction_id=t.id
   WHERE t.id='9bac8945-0000-0000-0000-000000000000'::uuid IS NOT NULL AND ti.product_id='${S111}'
     AND t.created_at > '2026-11-16T16:08:00Z'
   ORDER BY t.created_at DESC LIMIT 5`, 'venta post-RECT-2 SKU111').catch(async () => {
  return q(`SELECT t.id, t.status, t.total_amount, t.sale_currency, t.sale_exchange_rate, t.completed_at,
      ti.quantity, ti.price_at_sale, ti.price_at_sale_cup, ti.cost_at_sale, ti.currency AS item_cur
   FROM public.transactions t JOIN public.transaction_items ti ON ti.transaction_id=t.id
   WHERE ti.product_id='${S111}' AND t.created_at > '2026-11-16T16:08:00Z'
   ORDER BY t.created_at DESC LIMIT 5`, 'venta post-RECT-2 SKU111 (retry)');
});
out.rates_2026_07_01 = await q(
  `SELECT rate_date, currency, rate, source, segment, capture_method FROM public.exchange_rates
   WHERE currency='USD' AND rate_date='2026-07-01' ORDER BY source, segment`, 'tasa USD 2026-07-01');
out.rates_680_cerca = await q(
  `SELECT rate_date, rate, source, segment FROM public.exchange_rates
   WHERE currency='USD' AND rate='680' AND rate_date BETWEEN '2026-06-01' AND '2026-07-31' ORDER BY rate_date`,
  'tasas 680 junio-julio 2026');

// ── Conciliación exacta por granularidad ────────────────────────────────────
const P101 = (await q(
  `SELECT DISTINCT product_id::text AS pid FROM public.receipt_items
   WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`, 'pids 101')).map((r) => `'${r.pid}'`).join(',');
out.slips_items_todos = await q(
  `SELECT i.slip_id, s.slip_number, s.status, s.voided_at, i.product_id, i.quantity, i.unit_cost
   FROM public.issue_slip_items i JOIN public.issue_slips s ON s.id=i.slip_id
   WHERE i.slip_id IN (SELECT DISTINCT slip_id FROM public.issue_slip_items WHERE product_id IN (${P101}))
   ORDER BY i.slip_id`, 'issue_slip_items TODOS los productos de esos vales');
out.tx_items_todos = await q(
  `SELECT ti.transaction_id, t.status AS tx_status, t.reversed_at, t.completed_at, ti.product_id, ti.quantity, ti.cost_at_sale
   FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id
   WHERE ti.transaction_id IN (SELECT DISTINCT transaction_id FROM public.transaction_items WHERE product_id IN (${P101}))
   ORDER BY ti.transaction_id`, 'transaction_items TODOS los productos de esas ventas');
out.gas_cogs_por_tx = await q(
  `SELECT fe.document_id, sum(fm.amount_cup) FILTER (WHERE fm.sense='debito') AS debe,
      sum(fm.amount_cup) FILTER (WHERE fm.sense='credito') AS haber
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='GAS_COSTO_VENTAS'
     AND fe.document_id IN (SELECT DISTINCT transaction_id FROM public.transaction_items WHERE product_id IN (${P101}))
   GROUP BY fe.document_id`, 'GAS_COSTO_VENTAS por transacción');
out.gas_vales_por_slip = await q(
  `SELECT coalesce(fe.document_number, fm.document_number) AS slip_number, fe.event, fe.status,
      sum(fm.amount_cup) FILTER (WHERE fm.sense='debito') AS debe,
      sum(fm.amount_cup) FILTER (WHERE fm.sense='credito') AS haber
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='GAS_VALES'
     AND (fe.document_id IN (SELECT DISTINCT slip_id FROM public.issue_slip_items WHERE product_id IN (${P101}))
          OR fm.document_number IN (SELECT DISTINCT s.slip_number::text FROM public.issue_slip_items i
              JOIN public.issue_slips s ON s.id=i.slip_id WHERE i.product_id IN (${P101})))
   GROUP BY coalesce(fe.document_number, fm.document_number), fe.event, fe.status`, 'GAS_VALES por vale');

writeFileSync('scripts/out/m070b-maestro-audit.json', JSON.stringify(out, null, 2));
console.log('m070b OK → scripts/out/m070b-maestro-audit.json');
