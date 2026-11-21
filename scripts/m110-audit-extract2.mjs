#!/usr/bin/env node
/**
 * m110-audit-extract2.mjs — MISIÓN CP-FIN-AUDITORÍA-ENERVIDA-110 (ronda 2).
 * Extracción READ-ONLY: puentes fino por documento.
 *   H1) Ventas con fallback de liquidación USD (settlement vs riel de pagos).
 *   H2) Puente por venta: cobros operacionales (payment_transactions) vs
 *        posteos del motor a cajas (ACT_EFECTIVO_CUP/USD, ACT_TRANSF_EXTERIOR,
 *        ACT_BANCOS) — detecta el corrimiento 158.350 CUP↔USD.
 *   H3) Órdenes work/service con anticipos (production_orders + pagos).
 *   H4) Puente de inventario: componentes operacionales históricos vs mayor
 *        ACT_INVENTARIO por evento (apertura, recepciones, COGS, vales,
 *        ajustes, devoluciones).
 *   H5) Vitalidad de fuentes: última recepción/servicio/venta real.
 */
import { assertNotProduction } from './lib/assert-not-production.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }
assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm110-audit-extract2.mjs' });

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const VGEN = '7db60abf-401c-4ec9-ae36-4d49b8e94d42';
const AS_OF = '2026-11-21';
const OUT_DIR = '/home/z/my-project/scripts/out/m110-audit';
mkdirSync(OUT_DIR, { recursive: true });

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
function save(name, data) {
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 1));
  console.log(`  → ${name}.json (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log('== H1) Ventas con fallback USD (settlement sin riel de pagos) ==');
  const fb = await runSql(`
    SELECT t.id, coalesce(NULLIF(t.invoice_number,''), t.id::text) AS numero, t.created_at::date AS fecha,
           t.status::text AS estado, t.sale_currency, t.sale_exchange_rate,
           round(coalesce(t.total_amount,0),2) AS total,
           round(coalesce(t.cash_received_cup,0),2) AS rec_cup, round(coalesce(t.cash_received_usd,0),2) AS rec_usd,
           round(coalesce(t.change_given_cup,0),2) AS chg_cup, round(coalesce(t.change_given_usd,0),2) AS chg_usd,
           round(coalesce(t.cash_amount,0),2) AS cash_amount, round(coalesce(t.zelle_amount,0),2) AS zelle_amount,
           round(coalesce(t.transfer_amount,0),2) AS transfer_amount,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('m',pt.payment_method,'c',pt.currency,'cup',pt.amount_cup,'amt',pt.amount,'d',pt.direction)), '[]'::jsonb)
            FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id) AS pts
    FROM public.transactions t
    WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date <= DATE '${AS_OF}'
      AND coalesce(t.cash_received_usd,0) - coalesce(t.change_given_usd,0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt
                      WHERE pt.ref_type='sale' AND pt.ref_id=t.id AND pt.payment_method='cash' AND pt.currency='USD')
    ORDER BY t.created_at`);
  save('h1-fallback-usd-ventas', fb);
  console.log('  fallback ventas:', fb.length);

  console.log('== H2) Puente por venta: riel pt vs posteos del motor a cajas ==');
  const bridge = await runSql(`
    SELECT t.id, coalesce(NULLIF(t.invoice_number,''), t.id::text) AS numero, t.created_at::date AS fecha,
           round(coalesce(t.total_amount,0),2) AS total,
           (SELECT coalesce(sum(pt.amount_cup),0) FROM public.payment_transactions pt
             WHERE pt.ref_type='sale' AND pt.ref_id=t.id AND pt.payment_method='cash' AND pt.currency='CUP'
               AND coalesce(pt.direction,'in')='in') AS pt_cash_cup,
           (SELECT coalesce(sum(pt.amount_cup),0) FROM public.payment_transactions pt
             WHERE pt.ref_type='sale' AND pt.ref_id=t.id AND pt.payment_method='cash' AND pt.currency='USD'
               AND coalesce(pt.direction,'in')='in') AS pt_cash_usd,
           (SELECT coalesce(sum(pt.amount_cup),0) FROM public.payment_transactions pt
             WHERE pt.ref_type='sale' AND pt.ref_id=t.id AND pt.payment_method IN ('external_transfer','zelle')
               AND coalesce(pt.direction,'in')='in') AS pt_te,
           (SELECT coalesce(sum(pt.amount_cup),0) FROM public.payment_transactions pt
             WHERE pt.ref_type='sale' AND pt.ref_id=t.id AND pt.payment_method='transfer'
               AND coalesce(pt.direction,'in')='in') AS pt_bancos,
           (SELECT coalesce(sum(m.amount_cup),0) FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
             WHERE e.document_type='VENTA' AND e.document_id=t.id AND e.event='reconocimiento'
               AND e.generation_id='${VGEN}' AND m.category_code='ACT_EFECTIVO_CUP' AND m.sense='debito') AS eng_cup,
           (SELECT coalesce(sum(m.amount_cup),0) FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
             WHERE e.document_type='VENTA' AND e.document_id=t.id AND e.event='reconocimiento'
               AND e.generation_id='${VGEN}' AND m.category_code='ACT_EFECTIVO_USD' AND m.sense='debito') AS eng_usd,
           (SELECT coalesce(sum(m.amount_cup),0) FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
             WHERE e.document_type='VENTA' AND e.document_id=t.id AND e.event='reconocimiento'
               AND e.generation_id='${VGEN}' AND m.category_code='ACT_TRANSF_EXTERIOR' AND m.sense='debito') AS eng_te,
           (SELECT coalesce(sum(m.amount_cup),0) FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
             WHERE e.document_type='VENTA' AND e.document_id=t.id AND e.event='reconocimiento'
               AND e.generation_id='${VGEN}' AND m.category_code='ACT_BANCOS' AND m.sense='debito') AS eng_bancos
    FROM public.transactions t
    WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date <= DATE '${AS_OF}'
      AND EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VENTA' AND e.document_id=t.id
                    AND e.event='reconocimiento' AND e.generation_id='${VGEN}')
    ORDER BY t.created_at`);
  const mism = bridge.filter(r =>
    Math.abs(Number(r.pt_cash_cup) - Number(r.eng_cup)) > 0.005 ||
    Math.abs(Number(r.pt_cash_usd) - Number(r.eng_usd)) > 0.005 ||
    Math.abs(Number(r.pt_te) - Number(r.eng_te)) > 0.005 ||
    Math.abs(Number(r.pt_bancos) - Number(r.eng_bancos)) > 0.005);
  save('h2-puente-por-venta-mismatches', mism);
  console.log('  ventas con posteo:', bridge.length, '| mismatches:', mism.length);

  console.log('== H3) Órdenes work/service con anticipos ==');
  const orders = await runSql(`
    SELECT o.id, o.order_number, o.order_type, o.status::text AS estado, o.order_date::date AS fecha,
           round(coalesce(o.budget_total,0),2) AS presupuesto, round(coalesce(o.paid_amount,0),2) AS pagado,
           o.budget_currency, o.budget_exchange_rate,
           (SELECT coalesce(sum(pt.amount_cup),0) FROM public.payment_transactions pt
             WHERE pt.ref_id=o.id AND pt.ref_type IN ('production_order','work') AND coalesce(pt.direction,'in')='in') AS pt_cup,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('m',pt.payment_method,'c',pt.currency,'cup',pt.amount_cup)), '[]'::jsonb)
            FROM public.payment_transactions pt WHERE pt.ref_id=o.id AND pt.ref_type IN ('production_order','work')) AS pts
    FROM public.production_orders o
    WHERE o.store_id='${STORE}' AND o.order_type IN ('service','work')
      AND EXISTS (SELECT 1 FROM public.payment_transactions pt
                  WHERE pt.ref_id=o.id AND pt.ref_type IN ('production_order','work') AND coalesce(pt.direction,'in')='in')
    ORDER BY o.order_date`);
  save('h3-ordenes-con-anticipos', orders);
  console.log('  órdenes con anticipos:', orders.length);

  console.log('== H4) Puente de inventario (histórico) ==');
  const invLed = await runSql(`
    SELECT e.document_type, e.event, m.sense, count(*) AS n, round(sum(m.amount_cup),2) AS total_cup
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
    WHERE e.store_id='${STORE}' AND e.generation_id='${VGEN}' AND m.category_code='ACT_INVENTARIO'
      AND e.economic_date <= DATE '${AS_OF}'
    GROUP BY 1,2,3 ORDER BY 1,2,3`);
  save('h4-inventario-mayor', invLed);
  const invOps = await runSql(`
    SELECT 'recepciones_items' AS comp, count(*) AS n, round(coalesce(sum(ri.quantity*ri.unit_cost*coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1)),0),2) AS total
    FROM public.receipts r JOIN public.receipt_items ri ON ri.receipt_id=r.id
    WHERE r.store_id='${STORE}' AND r.status='active' AND r.reception_date <= DATE '${AS_OF}'
    UNION ALL
    SELECT 'vales_total_cost', count(*), round(coalesce(sum(i.total_cost),0),2)
    FROM public.issue_slips i WHERE i.store_id='${STORE}' AND i.status='completed' AND i.created_at::date <= DATE '${AS_OF}'
    UNION ALL
    SELECT 'ajustes_diferencia_x_wac', count(*), round(coalesce(sum(ai.difference * coalesce(p.cost_average,0)),0),2)
    FROM public.inventory_adjustments a JOIN public.inventory_adjustment_items ai ON ai.adjustment_id=a.id
         LEFT JOIN public.products p ON p.id=ai.product_id
    WHERE a.store_id='${STORE}' AND a.status='confirmed' AND a.confirmed_at::date <= DATE '${AS_OF}'
    UNION ALL
    SELECT 'cogs_alltime', (SELECT count(*) FROM public.transactions t WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date <= DATE '${AS_OF}'),
           round(coalesce((SELECT sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale,0), p.cost_average, 0))
            FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id
            LEFT JOIN public.products p ON p.id=ti.product_id
            WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date <= DATE '${AS_OF}'),0) -
            coalesce((SELECT sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale,0), p.cost_average, 0))
            FROM public.devolution_items di JOIN public.devolutions d ON d.id=di.devolution_id
            LEFT JOIN public.transaction_items oti ON oti.transaction_id=d.original_transaction_id AND oti.product_id=di.product_id
            LEFT JOIN public.products p ON p.id=di.product_id
            WHERE d.store_id='${STORE}' AND d.status='completed' AND d.processed_at::date <= DATE '${AS_OF}'),0),2)
    UNION ALL
    SELECT 'apertura_inv', (SELECT count(*) FROM public.fin_opening_balances ob
        WHERE ob.store_id='${STORE}' AND ob.status='applied' AND ob.category_code='ACT_INVENTARIO'),
           round(coalesce((SELECT sum(ob.amount_cup) FROM public.fin_opening_balances ob
        WHERE ob.store_id='${STORE}' AND ob.status='applied' AND ob.category_code='ACT_INVENTARIO'),0),2)`);
  save('h4-inventario-operacional', invOps);

  console.log('== H5) Vitalidad de fuentes ==');
  const vit = await runSql(`
    SELECT 'receipts' AS fuente, count(*) AS n_total, max(r.reception_date)::date AS ultima_fecha_doc,
           (SELECT count(*) FROM public.receipts r2 WHERE r2.store_id='${STORE}' AND r2.reception_date > DATE '2026-11-13') AS n_despues_13nov
    FROM public.receipts r WHERE r.store_id='${STORE}'
    UNION ALL
    SELECT 'received_services', count(*), max(s.service_date)::date,
           (SELECT count(*) FROM public.received_services s2 WHERE s2.store_id='${STORE}' AND s2.service_date > DATE '2026-11-20')
    FROM public.received_services s WHERE s.store_id='${STORE}'
    UNION ALL
    SELECT 'transactions', count(*), max(t.created_at)::date,
           (SELECT count(*) FROM public.transactions t2 WHERE t2.store_id='${STORE}' AND t2.created_at > '2026-11-20 20:31:08+00')
    FROM public.transactions t WHERE t.store_id='${STORE}'
    UNION ALL
    SELECT 'issue_slips', count(*), max(i.created_at)::date,
           (SELECT count(*) FROM public.issue_slips i2 WHERE i2.store_id='${STORE}' AND i2.created_at > '2026-11-19 20:48:56+00')
    FROM public.issue_slips i WHERE i.store_id='${STORE}'`);
  save('h5-vitalidad-fuentes', vit);
  console.log(JSON.stringify(vit, null, 0));
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
