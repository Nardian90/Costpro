#!/usr/bin/env node
/**
 * m110-audit-recon-extract.mjs — MISIÓN CP-FIN-AUDITORÍA-ENERVIDA-110.
 * Extracción READ-ONLY del estado REAL de la conciliación CP-FIN-REC-001/v1
 * de ENERVIDA-VITALLCONS en producción (CostproBD, wthkddeleylijmonclxg)
 * vía Management API (POST /database/query — solo SELECT/RPC STABLE).
 *
 * Re-ejecutable (protocolo 11d). Requisitos:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/m110-audit-recon-extract.mjs
 * Guard CP-INFRA-019: assertNotProduction({mode:'read', projectRef}).
 *
 * Produce (misión §2–§5):
 *   A) Tienda + generación activa (GEN-2) y todas las generaciones.
 *   B) fin_get_reconciliation al corte 2026-11-21, período 2026-11-01..21.
 *   C) Estado de Situación (fin_get_balance_sheet) + Resultado (income).
 *   D) Detalle documento-a-documento de los pendientes de asiento (34).
 *   E) Desglose TE (external_transfer/zelle) operacional vs contable.
 *   F) Desglose cajas CUP/USD operacional vs contable.
 *   G) Componentes COGS del período (ventas + devoluciones).
 */
import { assertNotProduction } from './lib/assert-not-production.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm110-audit-recon-extract.mjs' });

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (verificado abajo)
const AS_OF = '2026-11-21';
const FROM = '2026-11-01';
const TO = '2026-11-21';
const OUT_DIR = '/home/z/my-project/scripts/out/m110-audit';
mkdirSync(OUT_DIR, { recursive: true });

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

function save(name, data) {
  const p = `${OUT_DIR}/${name}.json`;
  writeFileSync(p, JSON.stringify(data, null, 1));
  console.log(`  → ${p} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('== A) Tienda + generaciones ==');
  const store = await runSql(`SELECT id, name FROM public.stores WHERE id = '${STORE}'`);
  console.log('Tienda:', JSON.stringify(store));
  const gens = await runSql(`
    SELECT id, code, status, created_at, stats::text AS stats
    FROM public.fin_posting_generations WHERE store_id = '${STORE}' ORDER BY created_at`);
  save('a-generaciones', gens);
  const active = gens.find(g => g.status === 'active');
  console.log(`Generaciones: ${gens.length}; activa: ${active ? active.code + ' / ' + active.id : 'NINGUNA'}`);
  const vGen = active ? active.id : null;

  console.log('== B) fin_get_reconciliation (corte %s, período %s..%s) ==', AS_OF, FROM, TO);
  const reconRows = await runSql(`SELECT public.fin_get_reconciliation('${STORE}', DATE '${AS_OF}', DATE '${FROM}', DATE '${TO}', NULL) AS recon`);
  const recon = reconRows[0].recon;
  save('b-recon-20261121', recon);
  console.log('Resumen:', JSON.stringify(recon.resumen));
  console.log('Ejecución:', JSON.stringify(recon.ejecucion));

  console.log('== C) Estado de Situación + Resultado del período ==');
  const bsRows = await runSql(`SELECT public.fin_get_balance_sheet('${STORE}', DATE '${AS_OF}', NULL) AS bs`);
  save('c-balance-sheet-20261121', bsRows[0].bs);
  console.log('Ecuación BS:', JSON.stringify(bsRows[0].bs.ecuacion));
  const incRows = await runSql(`SELECT public.fin_get_income_statement('${STORE}', DATE '${FROM}', DATE '${TO}', NULL) AS inc`);
  save('c-income-20261101-21', incRows[0].inc);

  console.log('== D) Documentos SIN asiento (detalle documento-a-documento) ==');
  const pend = await runSql(`
    SELECT 'VENTA' AS tipo, t.id, coalesce(NULLIF(t.invoice_number,''), t.id::text) AS numero, t.status::text AS estado,
           t.created_at::date AS fecha, round(coalesce(t.total_amount,0),2) AS importe,
           coalesce(t.sale_currency,'CUP') AS moneda
    FROM public.transactions t
    WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VENTA' AND e.document_id=t.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', d.id, coalesce(d.devolution_number::text, d.id::text), d.status::text, d.processed_at::date,
           round(coalesce(d.total_amount,0),2), coalesce(d.currency,'CUP')
    FROM public.devolutions d
    WHERE d.store_id='${STORE}' AND d.status='completed' AND d.processed_at::date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='DEVOLUCION_VENTA' AND e.document_id=d.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'RECEPCION', r.id, coalesce(r.document_number, r.id::text), r.status::text, r.reception_date,
           round((SELECT coalesce(sum(ri.quantity*ri.unit_cost*coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1)),0)
                  FROM public.receipt_items ri WHERE ri.receipt_id=r.id),2), 'CUP'
    FROM public.receipts r
    WHERE r.store_id='${STORE}' AND r.status='active' AND r.reception_date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='RECEPCION' AND e.document_id=r.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', s.id, coalesce(s.service_number::text, s.id::text), s.status::text, s.service_date,
           round(coalesce(s.total_amount,0),2), coalesce(s.currency,'CUP')
    FROM public.received_services s
    WHERE s.store_id='${STORE}' AND s.status='active' AND s.service_date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=s.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'VALE_SALIDA', i.id, coalesce(i.slip_number::text, i.id::text), i.status::text, i.created_at::date,
           round(coalesce(i.total_cost,0),2), 'CUP'
    FROM public.issue_slips i
    WHERE i.store_id='${STORE}' AND i.status='completed' AND i.created_at::date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id=i.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', a.id, a.id::text, a.status::text, a.confirmed_at::date,
           round((SELECT coalesce(sum(ai.difference * coalesce(p.cost_average,0)),0)
                  FROM public.inventory_adjustment_items ai LEFT JOIN public.products p ON p.id=ai.product_id
                  WHERE ai.adjustment_id=a.id),2), 'CUP'
    FROM public.inventory_adjustments a
    WHERE a.store_id='${STORE}' AND a.status='confirmed' AND a.confirmed_at::date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='AJUSTE_INVENTARIO' AND e.document_id=a.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'COMISION', c.id, c.id::text, c.status::text, c.paid_at::date,
           round(coalesce(c.final_amount,0)*CASE WHEN coalesce(c.currency,'CUP')='CUP' OR coalesce(c.exchange_rate,0)<=0 THEN 1 ELSE c.exchange_rate END,2),
           coalesce(c.currency,'CUP')
    FROM public.commission_payments c
    WHERE c.store_id='${STORE}' AND c.status='paid' AND c.paid_at::date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='COMISION' AND e.document_id=c.id
                        AND e.event='pago' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'NOMINA', n.id, n.id::text, n.status::text, n.period_end,
           round(coalesce(n.total_net,0),2), coalesce(n.currency,'CUP')
    FROM public.payrolls n
    WHERE n.store_id='${STORE}' AND n.status IN ('confirmed','paid') AND n.period_end <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='NOMINA' AND e.document_id=n.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    UNION ALL
    SELECT 'FLUJO_CAJA', cfd.id, cfd.id::text, cfd.status::text, cfd.operation_date::date,
           round(coalesce(cfd.amount_cup, coalesce(cfd.amount,0)*coalesce(cfd.exchange_rate,1)),2), coalesce(cfd.currency,'CUP')
    FROM public.cash_flow_documents cfd
    WHERE cfd.store_id='${STORE}' AND cfd.status='confirmado' AND cfd.operation_date::date <= DATE '${AS_OF}'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='FLUJO_CAJA' AND e.document_id=cfd.id
                        AND e.event='reconocimiento' AND e.generation_id IS NOT DISTINCT FROM '${vGen}')
    ORDER BY tipo, fecha`);
  save('d-docs-sin-asiento', pend);
  console.log('Pendientes detalle:', pend.length, 'filas; por tipo:', JSON.stringify(pend.reduce((a, r) => { a[r.tipo] = (a[r.tipo] || 0) + 1; return a; }, {})));

  console.log('== E) TE: desglose operacional (payment_transactions) vs contable (mayor GEN activa) ==');
  const teOps = await runSql(`
    SELECT pt.payment_method, pt.currency, coalesce(pt.ref_type,'?') AS ref_type, coalesce(pt.direction,'in') AS direction,
           count(*) AS n, round(sum(pt.amount_cup),2) AS total_cup, min(pt.payment_date::date) AS primera, max(pt.payment_date::date) AS ultima
    FROM public.payment_transactions pt
    WHERE pt.store_id='${STORE}' AND pt.payment_method IN ('external_transfer','zelle')
      AND pt.payment_date::date <= DATE '${AS_OF}'
    GROUP BY 1,2,3,4 ORDER BY ref_type, payment_method, currency`);
  save('e-te-operacional', teOps);
  const teLed = await runSql(`
    SELECT e.event, m.sense, count(*) AS n, round(sum(m.amount_cup),2) AS total_cup,
           min(e.economic_date) AS primera, max(e.economic_date) AS ultima
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.store_id='${STORE}' AND e.generation_id='${vGen}'
      AND m.category_code='ACT_TRANSF_EXTERIOR'
    GROUP BY 1,2 ORDER BY 1,2`);
  save('e-te-contable', teLed);
  console.log('TE operacional filas:', teOps.length, '| TE contable filas:', teLed.length);

  console.log('== F) Cajas CUP/USD: operacional por origen vs contable por evento ==');
  const cajasOp = await runSql(`
    SELECT cur, f->>'apertura' AS apertura, f->>'flujos' AS flujos, f->>'n_flujos' AS n_flujos
    FROM (SELECT 'CUP' AS cur, public.fin_cash_flows_operacional('${STORE}', ARRAY['cash'], 'CUP', DATE '${AS_OF}') AS f
          UNION ALL SELECT 'USD', public.fin_cash_flows_operacional('${STORE}', ARRAY['cash'], 'USD', DATE '${AS_OF}')
          UNION ALL SELECT 'EXTERIOR', public.fin_cash_flows_operacional('${STORE}', ARRAY['external_transfer','zelle'], NULL, DATE '${AS_OF}')
          UNION ALL SELECT 'BANCOS', public.fin_cash_flows_operacional('${STORE}', ARRAY['transfer'], NULL, DATE '${AS_OF}')) x(cur, f)`);
  save('f-cajas-operacional-resumen', cajasOp);
  const cajasLed = await runSql(`
    SELECT m.category_code, e.event, m.sense, count(*) AS n, round(sum(m.amount_cup),2) AS total_cup
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.store_id='${STORE}' AND e.generation_id='${vGen}'
      AND m.category_code IN ('ACT_EFECTIVO_CUP','ACT_EFECTIVO_USD','ACT_TRANSF_EXTERIOR','ACT_BANCOS')
      AND e.economic_date <= DATE '${AS_OF}'
    GROUP BY 1,2,3 ORDER BY 1,2,3`);
  save('f-cajas-contable', cajasLed);

  console.log('== G) COGS del período: componentes operacionales ==');
  const cogsOps = await runSql(`
    SELECT 'ventas_items' AS comp, count(DISTINCT t.id) AS n_docs, round(coalesce(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale,0), p.cost_average, 0)),0),2) AS total
    FROM public.transactions t JOIN public.transaction_items ti ON ti.transaction_id = t.id
         LEFT JOIN public.products p ON p.id = ti.product_id
    WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date BETWEEN DATE '${FROM}' AND DATE '${TO}'
    UNION ALL
    SELECT 'devoluciones_items', count(DISTINCT d.id), round(coalesce(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale,0), p.cost_average, 0)),0),2)
    FROM public.devolution_items di
         JOIN public.devolutions d ON d.id = di.devolution_id
         LEFT JOIN public.transaction_items oti ON oti.transaction_id = d.original_transaction_id AND oti.product_id = di.product_id
         LEFT JOIN public.products p ON p.id = di.product_id
    WHERE d.store_id='${STORE}' AND d.status='completed' AND d.processed_at::date BETWEEN DATE '${FROM}' AND DATE '${TO}'
    UNION ALL
    SELECT 'ventas_facturado', count(DISTINCT t.id), round(coalesce(sum(t.total_amount),0),2)
    FROM public.transactions t
    WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date BETWEEN DATE '${FROM}' AND DATE '${TO}'
    UNION ALL
    SELECT 'cobrado_periodo', count(DISTINCT t.id), round(coalesce((SELECT sum(pt.amount_cup) FROM public.payment_transactions pt
         JOIN public.transactions t2 ON t2.id = pt.ref_id
         WHERE pt.store_id='${STORE}' AND pt.ref_type='sale' AND coalesce(pt.direction,'in')='in'
           AND t2.status='completed' AND t2.created_at::date BETWEEN DATE '${FROM}' AND DATE '${TO}'),0),2)
    FROM public.transactions t WHERE t.store_id='${STORE}' AND t.status='completed' AND t.created_at::date BETWEEN DATE '${FROM}' AND DATE '${TO}'`);
  save('g-cogs-operacional', cogsOps);

  console.log('== EXTRACTO COMPLETO ==');
  console.log('OK — todos los artefactos en', OUT_DIR);
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
