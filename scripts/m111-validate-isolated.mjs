#!/usr/bin/env node
/**
 * m111-validate-isolated.mjs — CP-FIN-110-POSTREVIEW-HARDENING-111.
 * Validación funcional en BD AISLADA de la migración
 * 20261122130000_cp_fin111_postreview_hardening.sql:
 *   P0-1  órdenes closed-completadas: reconocimiento vía pase 5 del build +
 *         fuentes de conciliación; voided/closed-sin-evidencia/draft-pagada
 *         NO reconocen y su anticipo permanece en PAS_ANTICIPOS_CLI;
 *   P0-2  CxC multimoneda: presupuesto convertido ANTES de restar pagos
 *         (ejemplo obligatorio 100 USD @ 800, pagado 10 USD → CxC 72.000);
 *   P0-3  fallback de efectivo: métrica aplica fallback con fila de
 *         transferencia (sin fila de efectivo); detector lo cuenta; calidad
 *         PARCIAL; venta con cobro efectivo REAL no se detecta ni duplica;
 *   P0-4  fin_rectification_apply: atomicidad (fallo antes/durante → nada
 *         escrito), reintento, repetición completa, registro parcial → error
 *         explícito y reparación controlada; desequilibrio → error; concurrencia.
 *
 * Self-cleaning: pre-limpieza por prefijo M111VAL + limpieza final.
 * Uso: SUPABASE_ACCESS_TOKEN=... node scripts/m111-validate-isolated.mjs
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
const expectError = async (name, promise, errLike) => {
  try {
    await promise;
    check(name, false, 'NO lanzó error');
  } catch (e) {
    check(name, e.message.includes(errLike), `error=${e.message.slice(0, 140)}`);
  }
};

async function main() {
  // ── Pre-limpieza (idempotente) ──
  const residual = await runSql(`SELECT id FROM public.stores WHERE name ILIKE '%M111VAL%'`);
  for (const s of residual) {
    await runSql(`SELECT public.e2e_hard_delete_store('${s.id}') AS deleted;`);
  }

  // ── Fixture: tienda + órdenes para cada caso P0-1 ──
  const setup = await runSql(`INSERT INTO public.stores (id, name) VALUES (gen_random_uuid(), 'TEST-M111VAL') RETURNING id;`);
  const store = setup[0].id;

  const mkOrder = async (num, extra = {}) => {
    const base = {
      status: `'draft'`, paid_amount: `0`,
      ...extra,
    };
    const cols = ['order_number', 'order_type', 'customer_name', 'budget_total', 'budget_currency',
      'paid_amount', 'order_date', 'status'];
    const vals = [`'${num}'`, `'work'`, `'M111 Cliente'`, `80000`, `'CUP'`, base.paid_amount, `DATE '2026-11-01'`, base.status];
    for (const [k, v] of Object.entries(extra)) {
      if (!cols.includes(k)) { cols.push(k); vals.push(v); }
    }
    const r = await runSql(`
      INSERT INTO public.production_orders (id, store_id, ${cols.join(', ')})
      VALUES (gen_random_uuid(), '${store}', ${vals.join(', ')})
      RETURNING id;`);
    return r[0].id;
  };
  const mkAdvance = async (orderId, method, currency, amount, rate, date) => {
    const r = await runSql(`
      INSERT INTO public.payment_transactions (id, store_id, ref_type, ref_id, payment_method, currency,
        amount, exchange_rate, direction, payment_date)
      VALUES (gen_random_uuid(), '${store}', 'work', '${orderId}', '${method}', '${currency}',
        ${amount}, ${rate}, 'in', '${date}')
      RETURNING id;`);
    return r[0].id;
  };

  // ORD-1: completed con anticipo CUP 20.000 (caso clásico — trigger)
  const ord1 = await mkOrder('M111VAL-ORD-1', {});
  await mkAdvance(ord1, 'cash', 'CUP', 20000, 1, '2026-11-05 12:00+00');

  // ORD-2 (P0-1): CLOSED con finalización histórica válida + anticipo TE 100 @ 800 = 80.000
  const ord2 = await mkOrder('M111VAL-ORD-2', {
    status: `'closed'`, completion_date: `DATE '2026-11-10'`,
    closed_at: `'2026-11-12 10:00+00'`, payment_status: `'paid'`, paid_amount: `80000`,
  });
  await mkAdvance(ord2, 'external_transfer', 'USD', 100, 800, '2026-11-06 12:00+00');

  // ORD-3 (P0-1): VOIDED con anticipo cash CUP 5.000
  const ord3 = await mkOrder('M111VAL-ORD-3', {
    status: `'voided'`, reversed_at: `'2026-11-12 10:00+00'`, reversal_reason: `'prueba voided'`,
  });
  await mkAdvance(ord3, 'cash', 'CUP', 5000, 1, '2026-11-06 12:00+00');

  // ORD-4 (P0-1): CLOSED SIN evidencia de finalización (closed_sin_evidencia) + anticipo 5.000
  const ord4 = await mkOrder('M111VAL-ORD-4', {
    status: `'closed'`, closed_at: `'2026-11-12 10:00+00'`, completion_date: `NULL`,
  });
  await mkAdvance(ord4, 'cash', 'CUP', 5000, 1, '2026-11-06 12:00+00');

  // ORD-5 (P0-1): completamente PAGADA pero NO ejecutada (draft) + anticipo 80.000
  const ord5 = await mkOrder('M111VAL-ORD-5', { paid_amount: `80000`, payment_status: `'paid'` });
  await mkAdvance(ord5, 'cash', 'CUP', 80000, 1, '2026-11-06 12:00+00');

  // ORD-6 (P0-2): USD — presupuesto 100 @ 800 = 80.000; pagado 10 USD = 8.000 CUP
  const ord6 = await runSql(`
    INSERT INTO public.production_orders (id, store_id, order_number, order_type, customer_name,
      budget_total, budget_currency, budget_exchange_rate, paid_amount, order_date, status)
    VALUES (gen_random_uuid(), '${store}', 'M111VAL-ORD-6', 'work', 'M111 Cliente',
            100, 'USD', 800, 8000, DATE '2026-11-01', 'draft')
    RETURNING id;`);
  const ord6id = ord6[0].id;
  await mkAdvance(ord6id, 'external_transfer', 'USD', 10, 800, '2026-11-06 12:00+00');

  // ORD-1 y ORD-6 se completan (transiciones válidas — trigger reconoce)
  for (const id of [ord1, ord6id]) {
    await runSql(`UPDATE public.production_orders SET status='approved' WHERE id='${id}';`);
    await runSql(`UPDATE public.production_orders SET status='in_progress' WHERE id='${id}';`);
    await runSql(`UPDATE public.production_orders SET status='completed' WHERE id='${id}';`);
  }

  // T1 — anticipos: TODAS las órdenes (incl. voided/closed-sin-evidencia/draft) tienen asiento de pago
  // (generation_id IS NULL: posteados por el trigger ANTES de la generación candidata;
  //  el pase 1 los copia a la candidata → el par existe en ambas generaciones)
  const pagos = await runSql(`
    SELECT e.id AS entry_id, e.document_id, e.payment_ref, m.category_code, m.sense, m.amount_cup
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.store_id='${store}' AND e.document_type='ORDEN_TRABAJO' AND e.event='pago'
      AND e.generation_id IS NULL;`);
  const nPagos = new Set(pagos.map(r => r.entry_id)).size;
  check('T1 anticipos: 6 asientos de pago (riel completo, gen pre-candidata)', nPagos === 6, `asientos=${nPagos}`);
  const pasivoCredito = pagos.filter(r => r.category_code === 'PAS_ANTICIPOS_CLI' && r.sense === 'credito')
    .reduce((a, r) => a + Number(r.amount_cup), 0);
  // 20.000 (ORD-1) + 80.000 (ORD-2 TE) + 5.000 (ORD-3) + 5.000 (ORD-4) + 80.000 (ORD-5) + 8.000 (ORD-6 TE)
  check('T1 pasivo = 198.000 (todas las órdenes, incl. no ejecutadas)', pasivoCredito === 198000, `Σ=${pasivoCredito}`);

  // T2 — reconocimientos por trigger SOLO para ORD-1 y ORD-6 (completed)
  const recs = await runSql(`
    SELECT e.document_id, m.category_code, m.sense, m.amount_cup
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.store_id='${store}' AND e.document_type='ORDEN_TRABAJO' AND e.event='reconocimiento'
      AND e.generation_id IS NULL;`);
  const recDocs = new Set(recs.map(r => r.document_id));
  check('T2 trigger reconoce ORD-1 (completed)', recDocs.has(ord1));
  check('T2 trigger reconoce ORD-6 (completed USD)', recDocs.has(ord6id));
  check('T2 NO reconoce ORD-2 (closed pre-migración)', !recDocs.has(ord2));
  check('T2 NO reconoce ORD-3 (voided)', !recDocs.has(ord3));
  check('T2 NO reconoce ORD-4 (closed sin evidencia)', !recDocs.has(ord4));
  check('T2 NO reconoce ORD-5 (draft pagada)', !recDocs.has(ord5));

  // T3 — métrica P0-2 de ORD-6: ejemplo obligatorio (100 USD @ 800, pagado 8.000 CUP → CxC 72.000)
  const m6 = await runSql(`SELECT public.fin_compute_metrics('ORDEN_TRABAJO', '${ord6id}', 'reconocimiento') AS m;`);
  const mj6 = m6[0].m;
  check('T3 total_cup = 80.000 (100×800)', Number(mj6.total_cup) === 80000, `total=${mj6.total_cup}`);
  check('T3 anticipos_aplicados_cup = 8.000', Number(mj6.anticipos_aplicados_cup) === 8000, `aplicados=${mj6.anticipos_aplicados_cup}`);
  check('T3 pendiente_cup = 72.000 (CxC correcta)', Number(mj6.pendiente_cup) === 72000, `pendiente=${mj6.pendiente_cup}`);
  const rec6 = recs.filter(r => r.document_id === ord6id);
  check('T3 mayor: Dr ACT_CXC 72.000', rec6.some(r => r.category_code === 'ACT_CXC' && r.sense === 'debito' && Number(r.amount_cup) === 72000));
  check('T3 mayor: Cr ING_SERVICIOS_PREST 80.000', rec6.some(r => r.category_code === 'ING_SERVICIOS_PREST' && r.sense === 'credito' && Number(r.amount_cup) === 80000));

  // T4 — identidad global (partida doble) tras trigger
  const bal = await runSql(`
    SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2) AS saldo
    FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id WHERE e.store_id='${store}';`);
  check('T4 identidad global = 0', Number(bal[0].saldo) === 0, `Σ=${bal[0].saldo}`);

  // ── P0-1 pase 5: generación candidata recupera ORD-2 (closed completada) ──
  const gen = await runSql(`SELECT public.fin_generation_create('${store}', 'GEN-111TEST', 'test P0-1 pase 5', NULL) AS g;`);
  const genId = gen[0].g;
  const build = await runSql(`SELECT public.fin_generation_build('${store}', '${genId}', false, NULL, NULL) AS b;`);
  const bj = build[0].b;
  console.log('T5 build:', JSON.stringify({ repostados: bj.repostados, ya_existentes: bj.ya_existentes, errores: bj.errores }));
  check('T5 build sin errores', Number(bj.errores) === 0, JSON.stringify(bj.detalle_errores || []));
  const recGen = await runSql(`
    SELECT DISTINCT e.document_id FROM public.fin_entries e
    WHERE e.store_id='${store}' AND e.generation_id='${genId}' AND e.document_type='ORDEN_TRABAJO' AND e.event='reconocimiento';`);
  const recGenDocs = new Set(recGen.map(r => r.document_id));
  check('T5 pase 5 RECONOCE ORD-2 (closed con evidencia)', recGenDocs.has(ord2));
  check('T5 pase 5 NO reconoce ORD-3 (voided)', !recGenDocs.has(ord3));
  check('T5 pase 5 NO reconoce ORD-4 (closed sin evidencia)', !recGenDocs.has(ord4));
  check('T5 pase 5 NO reconoce ORD-5 (draft pagada)', !recGenDocs.has(ord5));
  const balGen = await runSql(`
    SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2) AS saldo
    FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id WHERE e.generation_id='${genId}';`);
  check('T5 candidata equilibrada', Number(balGen[0].saldo) === 0, `Σ=${balGen[0].saldo}`);

  // Validar y activar la generación para que la conciliación la lea
  const val = await runSql(`SELECT public.fin_generation_validate('${store}', '${genId}', NULL) AS v;`);
  check('T6 validate ok', val[0].v.ok === true || val[0].v.status === 'ok' || val[0].v.identidad === 0, JSON.stringify(val[0].v).slice(0, 200));
  await runSql(`SELECT public.fin_generation_activate('${store}', '${genId}', NULL) AS a;`);

  // T7 — conciliación v3 (P0-1 fuentes + P0-2 unidades)
  const rec = await runSql(`
    SELECT public.fin_get_reconciliation('${store}', DATE '2026-11-21', DATE '2026-11-01', DATE '2026-11-21', NULL) AS r;`);
  const rj = rec[0].r;
  check('T7 metodología v3', rj.ejecucion.metodologia_version === 'CP-FIN-REC-001/v3', rj.ejecucion.metodologia_version);
  const cxc = rj.cuentas.find(c => c.cuenta === 'ACT_CXC');
  const ant = rj.cuentas.find(c => c.cuenta === 'PAS_ANTICIPOS_CLI');
  const isp = rj.cuentas.find(c => c.cuenta === 'ING_SERVICIOS_PREST');
  const cajaCup = rj.cuentas.find(c => c.cuenta === 'ACT_EFECTIVO_CUP');
  const te = rj.cuentas.find(c => c.cuenta === 'ACT_TRANSF_EXTERIOR');
  // Recognizables: ORD-1 (CxC 60.000 + ING 80.000), ORD-2 (CxC 0 + ING 80.000), ORD-6 (CxC 72.000 + ING 80.000)
  check('T7 ACT_CXC op = 132.000 (60k ORD-1 + 72k ORD-6; ORD-2 pagada completa)', Number(cxc.valor_operacional) === 132000,
    `op=${cxc.valor_operacional} cont=${cxc.valor_contable}`);
  check('T7 ACT_CXC CONCILIADO (dif 0)', cxc.estado === 'CONCILIADO' && Number(cxc.diferencia) === 0,
    `estado=${cxc.estado} dif=${cxc.diferencia}`);
  check('T7 ING_SERVICIOS_PREST op = 240.000 (3 órdenes reconocibles)', Number(isp.valor_operacional) === 240000, `op=${isp.valor_operacional}`);
  check('T7 ING_SERVICIOS_PREST CONCILIADO', isp.estado === 'CONCILIADO' && Number(isp.diferencia) === 0,
    `estado=${isp.estado} dif=${isp.diferencia}`);
  // No reconocibles: ORD-3 5.000 + ORD-4 5.000 + ORD-5 80.000 = 90.000 (anticipos que quedan en pasivo)
  check('T7 PAS_ANTICIPOS_CLI op = 90.000 (voided+closedSinEvid+draft)', Number(ant.valor_operacional) === 90000,
    `op=${ant.valor_operacional} cont=${ant.valor_contable}`);
  check('T7 PAS_ANTICIPOS_CLI CONCILIADO', ant.estado === 'CONCILIADO' && Number(ant.diferencia) === 0,
    `estado=${ant.estado} dif=${ant.diferencia}`);
  check('T7 TE op = 80.000 (anticipo ORD-2) + 8.000 (ORD-6) = 88.000', Number(te.valor_operacional) === 88000, `op=${te.valor_operacional}`);
  const dpOt = (rj.hallazgos?.documentos_pendientes || []).find(d => d.tipo === 'ORDEN_TRABAJO');
  check('T7 docs_pend ORDEN_TRABAJO = 0 (pase 5 cubrió)', dpOt ? Number(dpOt.pendientes) === 0 : true,
    JSON.stringify(rj.hallazgos?.documentos_pendientes || []));

  // ── P0-3: venta legacy con liquidación de efectivo + SOLO transferencia en el riel ──
  const seller = await runSql(`SELECT id FROM public.profiles WHERE is_active = true LIMIT 1;`);
  const sellerId = seller.length ? seller[0].id : null;
  await runSql(`
    INSERT INTO public.products (id, store_id, sku, name, stock_current, cost_average, cost_price, price, is_active)
    VALUES (gen_random_uuid(), '${store}', 'M111VAL-PROD', 'Producto P0-3', 100, 0, 0, 0, true);`);
  // Venta A (legacy mixed): pools consistentes (2.000 cash + 8.000 transfer = 10.000 total);
  // settlement USD histórico (cash_received_usd = 10); el riel SOLO registró la transferencia.
  const mkSaleA = async () => {
    const v = await runSql(`
      INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, sale_currency,
        cash_amount, transfer_amount, cash_received_usd, change_given_usd, cash_received_cup, change_given_cup, created_at)
      VALUES (gen_random_uuid(), '${store}', ${sellerId ? `'${sellerId}'` : 'NULL'}, 10000, 'pending', 'mixed', 'CUP',
        2000, 8000, 10, 0, 2000, 0, '2026-11-15 12:00+00')
      RETURNING id;`);
    const vid = v[0].id;
    await runSql(`
      INSERT INTO public.payment_transactions (id, store_id, ref_type, ref_id, transaction_id, payment_method, currency,
        amount, exchange_rate, direction, payment_date)
      VALUES (gen_random_uuid(), '${store}', 'sale', '${vid}', '${vid}', 'transfer', 'CUP', 8000, 1, 'in', '2026-11-15 12:00+00');`);
    await runSql(`
      INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, price_currency, price_at_sale_cup, cost_at_sale, currency, exchange_rate)
      SELECT '${vid}', p.id, 1, 10000, 'CUP', 10000, 0, 'CUP', 1
      FROM public.products p WHERE p.store_id = '${store}' LIMIT 1;`);
    await runSql(`UPDATE public.transactions SET status='completed', completed_at='2026-11-15 12:00+00' WHERE id='${vid}';`);
    return vid;
  };
  const ventaA = await mkSaleA();
  // Venta B: cobro efectivo REAL en el riel — NO debe ser fallback ni duplicar
  const ventaB = await runSql(`
    INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, sale_currency,
      cash_amount, created_at)
    VALUES (gen_random_uuid(), '${store}', ${sellerId ? `'${sellerId}'` : 'NULL'}, 5000, 'pending', 'cash', 'CUP', 5000, '2026-11-16 12:00+00')
    RETURNING id;`);
  const ventaBId = ventaB[0].id;
  await runSql(`
    INSERT INTO public.payment_transactions (id, store_id, ref_type, ref_id, transaction_id, payment_method, currency,
      amount, exchange_rate, direction, payment_date)
    VALUES (gen_random_uuid(), '${store}', 'sale', '${ventaBId}', '${ventaBId}', 'cash', 'CUP', 5000, 1, 'in', '2026-11-16 12:00+00');`);
  await runSql(`
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, price_currency, price_at_sale_cup, cost_at_sale, currency, exchange_rate)
    SELECT '${ventaBId}', p.id, 1, 5000, 'CUP', 5000, 0, 'CUP', 1
    FROM public.products p WHERE p.store_id = '${store}' LIMIT 1;`);
  await runSql(`UPDATE public.transactions SET status='completed', completed_at='2026-11-16 12:00+00' WHERE id='${ventaBId}';`);

  const mA = await runSql(`SELECT public.fin_compute_metrics('VENTA', '${ventaA}', 'reconocimiento') AS m;`);
  const mjA = mA[0].m;
  check('P0-3 métrica A: fallback aplica (cob_cash_cup = 2.000 settlement) pese a fila de transferencia',
    Number(mjA.cob_cash_cup) === 2000 && mjA.fuente_efectivo === 'settlement',
    `cash=${mjA.cob_cash_cup} usd=${mjA.cob_cash_usd_cup} fuente=${mjA.fuente_efectivo}`);
  check('P0-3 métrica A: total cobros = total (sin duplicar transferencia)',
    Number(mjA.cob_total_cup) === 10000, `cob_total=${mjA.cob_total_cup} (cash ${mjA.cob_cash_cup} + transf ${mjA.cob_transfer_cup})`);
  const mB = await runSql(`SELECT public.fin_compute_metrics('VENTA', '${ventaBId}', 'reconocimiento') AS m;`);
  const mjB = mB[0].m;
  check('P0-3 métrica B: cobro real en el riel → SIN fallback ni duplicación',
    Number(mjB.cob_cash_cup) === 5000 && !mjB.fuente_efectivo,
    `cash=${mjB.cob_cash_cup} fuente=${mjB.fuente_efectivo || 'riel'}`);

  // Detector v3: ventaA cuenta (settlement con efectivo y sin fila de efectivo en el riel), ventaB NO
  const recon3 = await runSql(`
    SELECT public.fin_get_reconciliation('${store}', DATE '2026-11-21', DATE '2026-11-01', DATE '2026-11-21', NULL) AS r;`);
  const rj3 = recon3[0].r;
  const fbN = Number(rj3.hallazgos?.ventas_con_fallback_usd?.n ?? rj3.hallazgos?.ventas_con_fallback_usd ?? 0);
  check('P0-3 detector: fb.n = 1 (solo la venta legacy)', fbN === 1, `fb.n=${fbN}`);
  const cajaCup3 = rj3.cuentas.find(c => c.cuenta === 'ACT_EFECTIVO_CUP');
  check('P0-3 calidad de caja CUP = PARCIAL (fallback detectado, NO se declara COMPLETA)', cajaCup3.calidad === 'PARCIAL', `calidad=${cajaCup3.calidad} estado=${cajaCup3.estado}`);
  // El efectivo del fallback (2.000) NO está en el riel → el mayor lo refleja y el
  // operacional no: la cuenta queda ALERTA con calidad PARCIAL — honesto por diseño.
  check('P0-3 el fallback del mayor es documentado (no COMPLETA)',
    Number(cajaCup3.diferencia) === -2000 && cajaCup3.estado === 'ALERTA',
    `dif=${cajaCup3.diferencia} estado=${cajaCup3.estado}`);
  const bancos3 = rj3.cuentas.find(c => c.cuenta === 'ACT_BANCOS');
  check('P0-3 ACT_BANCOS conciliado (transferencia del riel contabilizada una sola vez)',
    Number(bancos3.diferencia) === 0 && bancos3.estado === 'CONCILIADO', `dif=${bancos3.diferencia} estado=${bancos3.estado}`);

  // ── P0-4: fin_rectification_apply — atomicidad, idempotencia, reparación ──
  const MOV_OK = JSON.stringify([
    { categoria: 'ACT_EFECTIVO_CUP', sentido: 'debito', amount: 123.45, description: 'P0-4 test Dr' },
    { categoria: 'GAS_OTROS_OPER', sentido: 'credito', amount: 123.45, description: 'P0-4 test Cr' },
  ]).replace(/'/g, "''");
  const DOC = 'RECT-111-TEST';
  const call = (movs, repair = false, doc = DOC) => runSql(
    `SELECT public.fin_rectification_apply('${store}', '${doc}', 'AJUSTE_INVENTARIO', DATE '2026-11-15', 'Rectificación ficticia de prueba P0-4', '${movs}', '${genId}', NULL, ${repair}) AS r;`);

  // 4.1 fallo ANTES de crear el asiento (categoría inválida → validación previa)
  await expectError('P0-4.1 categoría inválida → error, nada escrito',
    call(JSON.stringify([{ categoria: 'NO_EXISTE_111', sentido: 'debito', amount: 1 }, { categoria: 'ACT_EFECTIVO_CUP', sentido: 'credito', amount: 1 }]).replace(/'/g, "''")),
    'ERR_CATEGORIA_INVALIDA');
  const c41 = await runSql(`SELECT count(*)::int AS n FROM public.fin_entries WHERE store_id='${store}' AND document_number='RECT-111-TEST';`);
  check('P0-4.1 tras fallo previo: 0 asientos', Number(c41[0].n) === 0, `n=${c41[0].n}`);

  // 4.2 fallo DURANTE la inserción de movimientos (exchange_rate no numérico pasa la
  //     validación estructural y falla en el INSERT → rollback TOTAL: sin asiento)
  await expectError('P0-4.2 fallo durante movimientos → rollback total',
    call(JSON.stringify([
      { categoria: 'ACT_EFECTIVO_CUP', sentido: 'debito', amount: 50, exchange_rate: 'ABC' },
      { categoria: 'GAS_OTROS_OPER', sentido: 'credito', amount: 50 },
    ]).replace(/'/g, "''")),
    'numeric');
  const c42 = await runSql(`
    SELECT (SELECT count(*)::int FROM public.fin_entries WHERE store_id='${store}' AND document_number='RECT-111-TEST') AS entradas,
           (SELECT count(*)::int FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
             WHERE e.store_id='${store}' AND e.document_number='RECT-111-TEST') AS movimientos;`);
  check('P0-4.2 tras fallo en movimientos: 0 entradas, 0 movimientos (atómico)',
    Number(c42[0].entradas) === 0 && Number(c42[0].movimientos) === 0, JSON.stringify(c42[0]));

  // 4.3 desequilibrio → error antes de escribir
  await expectError('P0-4.3 desequilibrada → error',
    call(JSON.stringify([{ categoria: 'ACT_EFECTIVO_CUP', sentido: 'debito', amount: 100 }, { categoria: 'GAS_OTROS_OPER', sentido: 'credito', amount: 90 }]).replace(/'/g, "''")),
    'ERR_RECTIFICACION_DESQUILIBRADA');

  // 4.4 reintento tras fallos → creada; partida doble + documento de auditoría
  const ok = await call(MOV_OK);
  const rjOk = ok[0].r;
  check('P0-4.4 reintento: creada', rjOk.status === 'creada', JSON.stringify(rjOk));
  const c44 = await runSql(`
    SELECT e.id,
           (SELECT count(*)::int FROM public.fin_movements m WHERE m.entry_id = e.id) AS n_mov,
           (SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2) FROM public.fin_movements m WHERE m.entry_id = e.id) AS saldo,
           (SELECT count(*)::int FROM public.audit_logs a WHERE a.record_id = e.id AND a.action = 'SYSTEM_RECTIFICATION_APPLIED') AS audits
    FROM public.fin_entries e WHERE e.store_id='${store}' AND e.document_number='RECT-111-TEST';`);
  check('P0-4.4 asiento único, 2 movimientos equilibrados, 1 documento de auditoría',
    c44.length === 1 && Number(c44[0].n_mov) === 2 && Number(c44[0].saldo) === 0 && Number(c44[0].audits) === 1,
    JSON.stringify(c44[0]));

  // 4.5 repetición de una rectificación YA completada → ya_completa, sin duplicar
  const again = await call(MOV_OK);
  check('P0-4.5 repetición → ya_completa (mismo asiento)', again[0].r.status === 'ya_completa' && again[0].r.entry_id === rjOk.entry_id,
    JSON.stringify(again[0].r));
  const c45 = await runSql(`SELECT count(*)::int AS n FROM public.fin_entries WHERE store_id='${store}' AND document_number='RECT-111-TEST';`);
  check('P0-4.5 sigue habiendo 1 asiento', Number(c45[0].n) === 1, `n=${c45[0].n}`);

  // 4.6 registro PARCIAL (patrón del hallazgo): asiento con 1 movimiento → error explícito
  const partial = await runSql(`
    INSERT INTO public.fin_entries (store_id, document_type, document_number, event, economic_date, description, generation_id)
    VALUES ('${store}', 'AJUSTE_INVENTARIO', 'RECT-111-TEST-PARCIAL', 'ajuste_manual', DATE '2026-11-15', 'patrón parcial del hallazgo m110', '${genId}')
    RETURNING id;`);
  const partialId = partial[0].id;
  await runSql(`
    INSERT INTO public.fin_movements (entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number)
    VALUES ('${partialId}', '${store}', 'ACT_EFECTIVO_CUP', 'debito', 100, 'CUP', 1, DATE '2026-11-15', 'RECT-111-TEST-PARCIAL');`);
  await expectError('P0-4.6 parcial sin reparar → ERR_RECTIFICACION_PARCIAL (NO falso éxito)',
    call(MOV_OK, false, 'RECT-111-TEST-PARCIAL'), 'ERR_RECTIFICACION_PARCIAL');
  // 4.7 reparación controlada
  const rep = await call(MOV_OK, true, 'RECT-111-TEST-PARCIAL');
  check('P0-4.7 reparación controlada → reparada', rep[0].r.status === 'reparada', JSON.stringify(rep[0].r));
  const c47 = await runSql(`
    SELECT (SELECT count(*)::int FROM public.fin_movements m WHERE m.entry_id='${partialId}') AS n_mov,
           (SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2) FROM public.fin_movements m WHERE m.entry_id='${partialId}') AS saldo,
           (SELECT count(*)::int FROM public.audit_logs a WHERE a.record_id='${partialId}' AND a.action='SYSTEM_RECTIFICATION_REPAIRED') AS audits;`);
  check('P0-4.7 reparado: 2 movimientos, saldo 0, traza de auditoría',
    Number(c47[0].n_mov) === 2 && Number(c47[0].saldo) === 0 && Number(c47[0].audits) === 1, JSON.stringify(c47[0]));

  // 4.8 concurrencia: dos llamadas simultáneas → exactamente 1 asiento completo
  const DOC2 = 'RECT-111-TEST-CONC';
  const MOV2 = JSON.stringify([
    { categoria: 'ACT_BANCOS', sentido: 'debito', amount: 10 },
    { categoria: 'ACT_EFECTIVO_CUP', sentido: 'credito', amount: 10 },
  ]).replace(/'/g, "''");
  const results = await Promise.allSettled([
    call(MOV2, false, DOC2), call(MOV2, false, DOC2),
  ]);
  const statuses = results.filter(r => r.status === 'fulfilled').map(r => r.value[0].r.status);
  const cconc = await runSql(`
    SELECT (SELECT count(*)::int FROM public.fin_entries WHERE store_id='${store}' AND document_number='${DOC2}') AS entradas,
           (SELECT count(*)::int FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
             WHERE e.store_id='${store}' AND e.document_number='${DOC2}') AS movimientos;`);
  check('P0-4.8 concurrencia: exactamente 1 asiento con 2 movimientos',
    Number(cconc[0].entradas) === 1 && Number(cconc[0].movimientos) === 2,
    `results=${JSON.stringify(statuses)} entradas=${cconc[0].entradas} mov=${cconc[0].movimientos}`);

  // T9 — identidad global final (todo el ciclo)
  const bal9 = await runSql(`
    SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2) AS saldo
    FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id WHERE e.store_id='${store}';`);
  check('T9 identidad global final = 0', Number(bal9[0].saldo) === 0, `Σ=${bal9[0].saldo}`);

  // ── Limpieza final ──
  await runSql(`
    DELETE FROM public.fin_movements WHERE store_id='${store}';
    DELETE FROM public.fin_entries WHERE store_id='${store}';
    SELECT public.e2e_hard_delete_store('${store}') AS deleted;`);
  const resid = await runSql(`SELECT count(*)::int AS n FROM public.stores WHERE name ILIKE '%M111VAL%';`);
  check('residuo 0 (tienda eliminada)', Number(resid[0].n) === 0, `n=${resid[0].n}`);

  console.log(`\nRESULTADO: ${PASS} PASS / ${FAIL} FAIL`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
