#!/usr/bin/env node
/**
 * m110-validate-isolated.mjs — CP-FIN-110: validación funcional en BD AISLADA.
 * Ciclo completo ORDEN_TRABAJO: anticipo (TE USD + cash CUP) → reconocimiento
 * por finalización → verificación de partida doble, cuentas canónicas e
 * idempotencia; métrica VENTA riel-primacía (fallback solo sin riel);
 * fin_get_reconciliation v2 ejecutable.
 *
 * Self-cleaning: pre-limpieza por prefijo M110VAL + limpieza final.
 * Uso: SUPABASE_ACCESS_TOKEN=... node scripts/m110-validate-isolated.mjs
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }
const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${t.slice(0, 600)}`);
  return JSON.parse(t);
}
let PASS = 0, FAIL = 0;
const check = (name, cond, extra) => {
  if (cond) { PASS++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  ✗ FALLO: ${name}${extra ? ' — ' + extra : ''}`); }
};

async function main() {
  // ── Pre-limpieza (idempotente) ──
  const residual = await runSql(`SELECT id FROM public.stores WHERE name ILIKE '%M110VAL%'`);
  for (const s of residual) {
    await runSql(`SELECT public.e2e_hard_delete_store('${s.id}') AS deleted;`);
  }
  await runSql(`DELETE FROM public.fin_movements WHERE store_id IN (SELECT id FROM public.stores WHERE name ILIKE '%M110VAL%');
    DELETE FROM public.fin_entries WHERE store_id IN (SELECT id FROM public.stores WHERE name ILIKE '%M110VAL%');`);

  // ── Fixture: tienda + orden work con 2 anticipos ──
  const setup = await runSql(`
    INSERT INTO public.stores (id, name) VALUES (gen_random_uuid(), 'TEST-M110VAL') RETURNING id;`);
  const store = setup[0].id;

  // ORD-1: permanece DRAFT con anticipo cash CUP 20.000 (pasivo vivo)
  const ord = await runSql(`
    INSERT INTO public.production_orders (
      id, store_id, order_number, order_type, status, customer_name,
      budget_total, budget_currency, budget_exchange_rate, paid_amount, order_date)
    VALUES (gen_random_uuid(), '${store}', 'M110VAL-ORD-1', 'work', 'draft', 'M110 Cliente',
            80000, 'CUP', NULL, 20000, DATE '2026-11-01')
    RETURNING id;`);
  const orderId = ord[0].id;
  const advances1 = await runSql(`
    INSERT INTO public.payment_transactions (
      id, store_id, ref_type, ref_id, payment_method, currency, amount,
      exchange_rate, direction, payment_date)
    VALUES (gen_random_uuid(), '${store}', 'work', '${orderId}', 'cash', 'CUP', 20000, 1, 'in', '2026-11-05 12:00+00')
    RETURNING id;`);

  // ORD-2: se COMPLETA con anticipo TE USD 50 → 40.000 CUP-eq (presupuesto 80.000)
  const ord2 = await runSql(`
    INSERT INTO public.production_orders (id, store_id, order_number, order_type, status, customer_name,
      budget_total, budget_currency, paid_amount, order_date, completion_date)
    VALUES (gen_random_uuid(), '${store}', 'M110VAL-ORD-2', 'work', 'draft', 'M110 Cliente',
            80000, 'CUP', 40000, DATE '2026-11-01', DATE '2026-11-10')
    RETURNING id;`);
  const advances2 = await runSql(`
    INSERT INTO public.payment_transactions (
      id, store_id, ref_type, ref_id, payment_method, currency, amount,
      exchange_rate, direction, payment_date)
    VALUES (gen_random_uuid(), '${store}', 'work', '${ord2[0].id}', 'external_transfer', 'USD', 50, 800, 'in', '2026-11-06 12:00+00')
    RETURNING id;`);
  const pt1 = advances2[0].id;
  const orderId1 = orderId;

  // T1: asientos de anticipo (2: TE + caja CUP; pasivo 60.000)
  const pagoRows = await runSql(`
    SELECT e.event, e.payment_ref, m.category_code, m.sense, m.amount_cup
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
    WHERE e.store_id='${store}' AND e.document_type='ORDEN_TRABAJO'
    ORDER BY e.posted_at, m.category_code;`);
  console.log('T1 — Asientos de anticipo:', JSON.stringify(pagoRows));
  check('anticipo TE → Dr ACT_TRANSF_EXTERIOR 40000',
    pagoRows.some(r => r.event === 'pago' && r.category_code === 'ACT_TRANSF_EXTERIOR' && r.sense === 'debito' && Number(r.amount_cup) === 40000));
  check('anticipo cash → Dr ACT_EFECTIVO_CUP 20000',
    pagoRows.some(r => r.event === 'pago' && r.category_code === 'ACT_EFECTIVO_CUP' && r.sense === 'debito' && Number(r.amount_cup) === 20000));
  check('anticipos → Cr PAS_ANTICIPOS_CLI 60000 total',
    pagoRows.filter(r => r.event === 'pago' && r.category_code === 'PAS_ANTICIPOS_CLI' && r.sense === 'credito')
      .reduce((a, r) => a + Number(r.amount_cup), 0) === 60000);

  // T2: idempotencia — re-insert del mismo pt imposible (PK); re-post manual no duplica
  await runSql(`SELECT public.fin_post_document_safe('ORDEN_TRABAJO', '${orderId}', 'pago', '${pt1}') AS r;`);
  const idem = await runSql(`SELECT count(*) AS n FROM public.fin_entries e
    WHERE e.store_id='${store}' AND e.document_type='ORDEN_TRABAJO' AND e.event='pago';`);
  check('idempotencia pago (re-post → mismo asiento)', Number(idem[0].n) === 2);

  // T3: finalización de la orden (presupuesto 80.000; anticipos 60.000 → CxC 20.000)
  // ORD-2: se COMPLETA vía transiciones válidas (dispara el trigger de finalización)
  await runSql(`UPDATE public.production_orders SET status='approved' WHERE id='${ord2[0].id}';`);
  await runSql(`UPDATE public.production_orders SET status='in_progress' WHERE id='${ord2[0].id}';`);
  await runSql(`UPDATE public.production_orders SET status='completed' WHERE id='${ord2[0].id}';`);
  const recRows = await runSql(`
    SELECT e.event, m.category_code, m.sense, m.amount_cup
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
    WHERE e.store_id='${store}' AND e.document_type='ORDEN_TRABAJO' AND e.event='reconocimiento'
    ORDER BY m.category_code;`);
  console.log('T3 — Reconocimiento por finalización:', JSON.stringify(recRows));
  const dr = recRows.filter(r => r.sense === 'debito').reduce((a, r) => a + Number(r.amount_cup), 0);
  const cr = recRows.filter(r => r.sense === 'credito').reduce((a, r) => a + Number(r.amount_cup), 0);
  check('reconocimiento equilibrado (D=C=80000)', dr === 80000 && cr === 80000, `D=${dr} C=${cr}`);
  check('consumo anticipo → Dr PAS_ANTICIPOS_CLI 40000',
    recRows.some(r => r.category_code === 'PAS_ANTICIPOS_CLI' && r.sense === 'debito' && Number(r.amount_cup) === 40000));
  check('saldo → Dr ACT_CXC 40000',
    recRows.some(r => r.category_code === 'ACT_CXC' && r.sense === 'debito' && Number(r.amount_cup) === 40000));
  check('ingreso → Cr ING_SERVICIOS_PREST 80000',
    recRows.some(r => r.category_code === 'ING_SERVICIOS_PREST' && r.sense === 'credito' && Number(r.amount_cup) === 80000));

  // T4: identidad global de la tienda (partida doble)
  const bal = await runSql(`
    SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2) AS saldo
    FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id WHERE e.store_id='${store}';`);
  check('identidad global Σdébitos−Σcréditos = 0', Number(bal[0].saldo) === 0, `Σ=${bal[0].saldo}`);

  // T5: fin_get_reconciliation v2 ejecutable (sin generación activa → gen NULL)
  const rec = await runSql(`
    SELECT public.fin_get_reconciliation('${store}', DATE '2026-11-21', DATE '2026-11-01', DATE '2026-11-21', NULL) AS r;`);
  const rj = rec[0].r;
  check('metodología v2', rj.ejecucion.metodologia_version === 'CP-FIN-REC-001/v2');
  const cxc = rj.cuentas.find(c => c.cuenta === 'ACT_CXC');
  const ant = rj.cuentas.find(c => c.cuenta === 'PAS_ANTICIPOS_CLI');
  const isp = rj.cuentas.find(c => c.cuenta === 'ING_SERVICIOS_PREST');
  const te = rj.cuentas.find(c => c.cuenta === 'ACT_TRANSF_EXTERIOR');
  console.log('T5 — filas v2:', JSON.stringify({
    cxc: { op: cxc.valor_operacional, cont: cxc.valor_contable, dif: cxc.diferencia, estado: cxc.estado },
    anticipos: { op: ant.valor_operacional, cont: ant.valor_contable, dif: ant.diferencia, estado: ant.estado },
    ing_serv: { op: isp.valor_operacional, cont: isp.valor_contable, dif: isp.diferencia, estado: isp.estado },
    te: { op: te.valor_operacional, cont: te.valor_contable, dif: te.diferencia, estado: te.estado } }));
  // M110VAL-ORD-1 sigue draft: su anticipo (60000) queda como pasivo; ORD-2 completed: CxC 20000, ING 80000 (período 01-21/11)
  check('PAS_ANTICIPOS_CLI op = 20000 (orden draft) y CONCILIADO', Number(ant.valor_operacional) === 20000 && ant.estado === 'CONCILIADO');
  check('ACT_CXC op = 40000 (completada con saldo) y CONCILIADO', Number(cxc.valor_operacional) === 40000 && cxc.estado === 'CONCILIADO');
  check('ING_SERVICIOS_PREST op = 80000 (completada en período)', Number(isp.valor_operacional) === 80000);
  check('TE op = 40000 (anticipo TE de la orden)', Number(te.valor_operacional) === 40000);
  check('todas CONCILIADO o dentro de tolerancia',
    [cxc, ant, isp, te].every(c => ['CONCILIADO', 'INCOMPLETO'].includes(c.estado)),
    [cxc, ant, isp, te].map(c => c.cuenta + ':' + c.estado).join(' '));

  // T6: métrica VENTA riel-primacía — venta con riel CUP + settlement USD → postea CUP
  // Flujo fiel: transacción pending → riel pt + ítems → UPDATE a completed
  // (el disparo real de create_sale_v2: el riel existe ANTES de contabilizar).
  const seller = await runSql(`SELECT id FROM public.profiles WHERE is_active = true LIMIT 1;`);
  const sellerId = seller.length ? seller[0].id : null;
  const venta = await runSql(`
    INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, sale_currency,
      cash_amount, cash_received_usd, change_given_cup, created_at)
    VALUES (gen_random_uuid(), '${store}', ${sellerId ? `'${sellerId}'` : 'NULL'}, 5600, 'pending', 'cash', 'CUP', 5600, 10, 2400, '2026-11-15 12:00+00')
    RETURNING id;`);
  const ventaId = venta[0].id;
  await runSql(`
    INSERT INTO public.payment_transactions (id, store_id, ref_type, ref_id, transaction_id, payment_method, currency,
      amount, exchange_rate, direction, payment_date)
    VALUES (gen_random_uuid(), '${store}', 'sale', '${ventaId}', '${ventaId}', 'cash', 'CUP', 5600, 1, 'in', '2026-11-15 12:00+00');`);
  await runSql(`
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, price_currency, price_at_sale_cup, cost_at_sale, cash_currency, currency, cash_paid, exchange_rate)
    SELECT '${ventaId}', p.id, 1, 5600, 'USD', 5600, 300, 'USD', 'USD', 7, 800 FROM public.products p LIMIT 1;`);
  await runSql(`UPDATE public.transactions SET status='completed', completed_at='2026-11-15 12:00+00' WHERE id='${ventaId}';`);
  const m = await runSql(`
    SELECT public.fin_compute_metrics('VENTA', '${ventaId}', 'reconocimiento') AS m;`);
  const mj = m[0].m;
  check('venta con riel CUP → cob_cash_cup = 5600 (riel gobierna)', Number(mj.cob_cash_cup) === 5600 && Number(mj.cob_cash_usd_cup) === 0,
    `cob_cash_cup=${mj.cob_cash_cup} cob_cash_usd_cup=${mj.cob_cash_usd_cup} fuente=${mj.fuente_efectivo || 'riel'}`);

  // T7: fb detector — la venta con riel NO cuenta como fallback
  const recon2 = await runSql(`
    SELECT public.fin_get_reconciliation('${store}', DATE '2026-11-21', DATE '2026-11-01', DATE '2026-11-21', NULL) AS r;`);
  const fb2 = recon2[0].r;
  const cajaCup = fb2.cuentas.find(c => c.cuenta === 'ACT_EFECTIVO_CUP');
  check('fb.n = 0 (venta con riel no es fallback)', Number(fb2.hallazgos?.ventas_con_fallback_usd?.n ?? fb2.hallazgos?.ventas_con_fallback_usd ?? 0) === 0,
    JSON.stringify(fb2.hallazgos?.ventas_con_fallback_usd));
  check('caja CUP calidad COMPLETA (v2)', cajaCup.calidad === 'COMPLETA');

  // ── Limpieza final ──
  await runSql(`
    DELETE FROM public.fin_movements WHERE store_id='${store}';
    DELETE FROM public.fin_entries WHERE store_id='${store}';
    SELECT public.e2e_hard_delete_store('${store}') AS deleted;`);
  console.log(`\nRESULTADO: ${PASS} PASS / ${FAIL} FAIL`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
