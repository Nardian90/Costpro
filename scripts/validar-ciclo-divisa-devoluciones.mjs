#!/usr/bin/env node
/**
 * VALIDACIÓN EN BD E2E AISLADA — fix/ciclo-divisa-devoluciones-20261113
 * Ciclo económico COMPLETO de la venta en divisa: venta + devolución (total/
 * parcial) + anulación/reversa + costo devuelto + idempotencia (sin doble
 * reconocimiento). Ejecuta contra la BD E2E AISLADA (lguovmvrozxgssupkwpf —
 * JAMÁS producción).
 *
 * FASE A (con la migración del PR #1615 aplicada — semántica VENTA):
 *   · Ventas USD (cobro USD total, cobro CUP, mixto, CUP) contabilizan ✓.
 *   · DEFECTO demostrado por la vía REAL (RPC create_devolution_v2):
 *     devolución USD con tasa no divisible → round() al céntimo USD rompe la
 *     invariante amount_cup = total canónico → ERR_UNBALANCED.
 *   · DEFECTO demostrado sintético (C7 original): devolución marcada
 *     currency='USD' → fin_compute_metrics multiplicaba ×tasa → ERR_UNBALANCED.
 * FASE B (aplica 20261114140000 — ciclo de devolución en divisa):
 *   · E1 devolución TOTAL USD (drift) republicada → asiento equilibrado.
 *   · E2 devolución PARCIAL USD (vía RPC) → equilibrada; costo = cost_at_sale
 *     ORIGINAL (no cost_average).
 *   · E3 devolución del resto (total) USD vía RPC → equilibrada.
 *   · E4 venta CUP + devolución CUP vía RPC → equilibrada (regresión).
 *   · E5 venta USD cobrada en CUP + devolución CUP → equilibrada.
 *   · E6 venta USD cobro mixto + devolución AS_PAID → equilibrada.
 *   · E7 anulación (fin_post_annulment_safe) → espejo invertido; idempotente;
 *     asiento de la venta intacto.
 *   · E8/E9 sin doble reconocimiento (re-publicar no duplica).
 *   · E10 sintética C7 republicada → equilibrada (total_cup = total_amount).
 * RESTAURACIÓN: funciones ORIGINALES re-instaladas (hash idéntico) y limpieza
 * total → NET DELTA 0.
 *
 * Uso: node scripts/validar-ciclo-divisa-devoluciones.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'lguovmvrozxgssupkwpf'; // BD E2E aislada — verificada por el guard
assertNotProduction({ mode: 'write', projectRef: REF, context: 'validar-ciclo-divisa-devoluciones.mjs' });

const E = process.env;
if (!E.SUPABASE_ACCESS_TOKEN) {
  for (const line of readFileSync(`${REPO}/.env`, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !E[m[1]]) E[m[1]] = m[2].trim();
  }
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2500)); return sql(query); }
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 800)}\n>>> ${query.slice(0, 200)}`);
  return JSON.parse(text || '[]');
}

const N = v => Number(v ?? 0);
const r2 = v => Math.round(N(v) * 100) / 100;
let FALLAS = 0;
const chk = (nombre, ok, detalle = '') => { if (!ok) FALLAS++; console.log(`  ${ok ? 'PASS' : 'FAIL'} · ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);

console.log('════ VALIDACIÓN CICLO DIVISA · DEVOLUCIONES · BD AISLADA ' + REF + ' ════');
console.log('Hora UTC:', new Date().toISOString());

// ── 0. contexto, pre-limpieza, snapshot, funciones originales ─────────────────
const store = (await sql(`SELECT id, name FROM public.stores ORDER BY created_at LIMIT 1`))[0];
const seller = (await sql(`SELECT id FROM public.profiles WHERE is_active ORDER BY created_at LIMIT 1`))[0];
// usuario con membresía ACTIVA en la tienda (autorización del RPC real
// create_devolution_v2 — has_store_access_as)
const devUser = (await sql(`SELECT user_id FROM public.user_store_memberships
  WHERE store_id='${store.id}' AND status='active' ORDER BY created_at LIMIT 1`))[0]?.user_id || seller.id;
if (!store || !seller) { console.error('FATAL: sin tienda/usuario en la BD aislada'); process.exit(1); }
console.log('Tienda de prueba:', store.name, '| usuario RPC:', devUser);
const t0 = (await sql(`SELECT now()::text AS t`))[0].t; // marca temporal del arranque

// ── líneas base ORIGINALES (determinismo ante residuos de corridas interrumpidas) ──
// La FASE A exige el create_devolution_v2 ORIGINAL; si una corrida previa
// murió antes de la restauración, la BD puede conservar la versión del fix.
// Se reinstalan AMBAS definiciones originales antes de empezar (idempotente).
await sql(readFileSync('/home/z/my-project/scripts/out/fin_compute_metrics-ORIGINAL.sql', 'utf8'));
await sql(readFileSync('/home/z/my-project/scripts/out/create_devolution_v2-aislada.sql', 'utf8'));
console.log('Funciones originales reinstaladas como línea base (determinismo).');

// pre-limpieza idempotente de residuos de ejecuciones interrumpidas
await sql(`BEGIN;
  DELETE FROM public.fin_movements WHERE entry_id IN
    (SELECT id FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')
       OR document_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%')));
  DELETE FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%'));
  DELETE FROM public.fin_posting_errors WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%'));
  ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.payment_transactions WHERE reference = 'validacion-ciclo-divisa'
     OR (ref_type = 'devolution' AND ref_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%')));
  ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.devolution_items WHERE devolution_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%'));
  DELETE FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%');
  DELETE FROM public.transaction_items WHERE transaction_id IN
    (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%');
  DELETE FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%';
  DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE 'TEST-CD-%');
  DELETE FROM public.inventory WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE 'TEST-CD-%');
  DELETE FROM public.products WHERE sku LIKE 'TEST-CD-%';
  DELETE FROM public.cash_movements WHERE reason LIKE '%VALIDACIÓN ciclo divisa%';
  DELETE FROM public.cash_register_sessions WHERE store_id = '${store.id}' AND opened_at >= '${t0}'::timestamptz;
  DELETE FROM public.idempotency_registry WHERE idempotency_key LIKE 'ciclo-div-%';
  DELETE FROM public.audit_logs WHERE action = 'DEVOLUTION_CREATED_V2' AND created_at >= '${t0}'::timestamptz;
  COMMIT;`);

const SNAP = `SELECT
  (SELECT count(*)::int FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%') AS ventas,
  (SELECT count(*)::int FROM public.transaction_items WHERE transaction_id IN
     (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')) AS v_items,
  (SELECT count(*)::int FROM public.payment_transactions WHERE reference='validacion-ciclo-divisa'
     OR ref_type='devolution') AS pagos,
  (SELECT count(*)::int FROM public.devolutions WHERE notes LIKE 'VALIDACIÓN ciclo divisa%'
     OR devolution_number LIKE 'TEST-CICLO-DIV-%') AS devoluciones,
  (SELECT count(*)::int FROM public.devolution_items WHERE devolution_id IN
     (SELECT id FROM public.devolutions WHERE notes LIKE 'VALIDACIÓN ciclo divisa%'
        OR devolution_number LIKE 'TEST-CICLO-DIV-%')) AS d_items,
  (SELECT count(*)::int FROM public.fin_entries) AS entries,
  (SELECT count(*)::int FROM public.fin_movements) AS movements,
  (SELECT count(*)::int FROM public.fin_posting_errors) AS errors,
  (SELECT count(*)::int FROM public.products WHERE sku LIKE 'TEST-CD-%') AS productos,
  (SELECT count(*)::int FROM public.stock_movements WHERE product_id IN
     (SELECT id FROM public.products WHERE sku LIKE 'TEST-CD-%')) AS kar_movs,
  (SELECT count(*)::int FROM public.inventory WHERE product_id IN
     (SELECT id FROM public.products WHERE sku LIKE 'TEST-CD-%')) AS inv_rows,
  (SELECT count(*)::int FROM public.cash_movements WHERE reason LIKE '%VALIDACIÓN ciclo divisa%') AS cash_movs,
  (SELECT count(*)::int FROM public.cash_register_sessions WHERE store_id='${store.id}' AND opened_at >= '${t0}'::timestamptz) AS sesiones,
  (SELECT count(*)::int FROM public.idempotency_registry WHERE idempotency_key LIKE 'ciclo-div-%') AS idem,
  (SELECT count(*)::int FROM public.audit_logs WHERE action='DEVOLUTION_CREATED_V2' AND created_at >= '${t0}'::timestamptz) AS audits,
  (SELECT coalesce(max(last_number), NULL) FROM public.document_sequences ds WHERE ds.store_id='${store.id}'
     AND ds.document_type='credit_note' AND ds.year = date_part('year', now())::int) AS seq_cn`;
const snap0 = (await sql(SNAP))[0];
// Líneas base ORIGINALES desde ARCHIVO (re-ejecutables aunque un run previo
// dejara aplicadas las versiones de la rama): la de producción (read-only,
// #1615 NO aplicado allí) y la extraída de la BD aislada antes de todo cambio.
const fnMetricsO = readFileSync('/home/z/my-project/scripts/out/fin_compute_metrics-ORIGINAL.sql', 'utf8');
const fnDevO = readFileSync('/home/z/my-project/scripts/out/create_devolution_v2-aislada.sql', 'utf8');
console.log('Snapshot ANTES:', JSON.stringify(snap0));
console.log('fin_compute_metrics:', sha(fnMetricsO), '| create_devolution_v2:', sha(fnDevO));

// ── helpers ──────────────────────────────────────────────────────────────────
const TS = () => Date.now();
let nP = 0;
async function crearProducto(nombre, costAvg) {
  nP++;
  return (await sql(`INSERT INTO public.products (name, sku, price, cost_price, cost_average, store_id, is_active, description)
    VALUES ('${nombre}', 'TEST-CD-${nP}', 100, 0, ${costAvg}, '${store.id}', true,
    'VALIDACIÓN ciclo divisa 20261113 — se elimina al final') RETURNING id`))[0].id;
}
async function crearVenta({ num, cur, rate, total, items, pagos, sinPagos = false, settle = null }) {
  const inv = `TEST-CICLO-DIV-${num}-${TS()}`;
  const t = (await sql(`INSERT INTO public.transactions
    (store_id, seller_id, total_amount, status, sale_currency, sale_exchange_rate, idempotency_key, invoice_number, notes, payment_method
     ${settle ? ', cash_received_cup, cash_received_usd' : ''})
    VALUES ('${store.id}', '${seller.id}', ${total}, 'pending', '${cur}', ${rate}, 'ciclo-div-${num}-${TS()}', '${inv}',
    'VALIDACIÓN ciclo divisa 20261113 — se elimina al final', 'cash'${settle ? `, ${settle.cup}, ${settle.usd}` : ''}) RETURNING id`))[0].id;
  for (const it of items) {
    await sql(`INSERT INTO public.transaction_items
      (transaction_id, product_id, quantity, price_at_sale, price_currency, price_at_sale_cup, cost_at_sale)
      VALUES ('${t}', '${it.pid}', ${it.qty}, ${it.price}, '${cur}', ${it.priceCup}, ${it.cost})`);
  }
  if (!sinPagos) {
    for (const p of pagos) {
      await sql(`INSERT INTO public.payment_transactions
        (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date, reference)
        VALUES ('${store.id}', 'sale', '${t}', '${t}', ${p.amount}, '${p.method}', '${p.cur}', ${p.rate}, 'in', now(), 'validacion-ciclo-divisa')`);
    }
  }
  await sql(`UPDATE public.transactions SET status='completed', completed_at=now() WHERE id='${t}'`);
  return t;
}
const entryDe = async (dt, id, ev = 'reconocimiento') => (await sql(`SELECT id, event FROM public.fin_entries e
  WHERE e.document_type='${dt}' AND e.document_id='${id}' AND e.event='${ev}' ORDER BY posted_at DESC LIMIT 1`))[0];
const movsDe = async entryId => (await sql(`SELECT category_code, sense, amount, currency, currency_origin FROM public.fin_movements m WHERE m.entry_id='${entryId}'`))
  .map(m => ({ cat: m.category_code, s: m.sense, amt: N(m.amount), cur: m.currency, curO: m.currency_origin }));
const errorDe = async (dt, id) => (await sql(`SELECT error_code, error_detail FROM public.fin_posting_errors
  WHERE document_type='${dt}' AND document_id='${id}' AND event='reconocimiento' ORDER BY created_at DESC LIMIT 1`))[0];
const nEntries = async (dt, id) => (await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='${dt}' AND document_id='${id}'`))[0].n;
const debCred = movs => ({
  d: r2(movs.filter(m => m.s === 'debito').reduce((s, m) => s + m.amt, 0)),
  c: r2(movs.filter(m => m.s === 'credito').reduce((s, m) => s + m.amt, 0)),
});
const tiene = (movs, cat, s, amt, curO) => movs.some(m => m.cat === cat && m.s === s && Math.abs(m.amt - amt) <= 0.01 && (curO ? m.curO === curO : true));
async function republicar(dt, id) {
  await sql(`DELETE FROM public.fin_posting_errors WHERE document_type='${dt}' AND document_id='${id}'`);
  await sql(`SELECT public.fin_post_document_safe('${dt}', '${id}', 'reconocimiento')`);
}
async function crearDevolucionRPC(saleId, items, method, refundCur) {
  const itemsJson = JSON.stringify(items.map(i => ({ product_id: i.pid, quantity: i.qty })));
  // impersonación service_role dentro de la transacción (auth.role()/auth.uid()
  // leen request.jwt.claims); p_user_id → devUser con membresía activa real.
  const r = (await sql(`BEGIN;
    SELECT set_config('request.jwt.claims', '{"role":"service_role","sub":"${devUser}"}', true);
    SELECT public.create_devolution_v2(
      p_store_id := '${store.id}', p_items := '${itemsJson.replace(/'/g, "''")}'::jsonb,
      p_reason := 'VALIDACIÓN ciclo divisa 20261113',
      p_original_transaction_id := '${saleId}', p_payment_method := '${method}',
      p_refund_currency := '${refundCur}', p_idempotency_key := 'ciclo-div-${TS()}',
      p_user_id := '${devUser}') AS dev_id;
    COMMIT;`))[0];
  const dev = r.dev_id && typeof r.dev_id === 'object' ? r.dev_id.devolution_id : r.dev_id;
  if (!dev) throw new Error('RPC devolución sin devolution_id: ' + JSON.stringify(r).slice(0, 300));
  return dev;
}

// ══ FASE A — semántica #1615 aplicada; defectos ANTES del fix ════════════════
console.log('\n── FASE A: aplica migración del PR #1615 (semántica VENTA) ──');
await sql(readFileSync(join(REPO, 'supabase/migrations/20261114120000_cp_fin_semantica_total_amount_cup.sql'), 'utf8'));
console.log('  migración 20261114120000 aplicada (rama #1615)');

// productos: cost_average 999 (DEBE ignorarse; el costo real es cost_at_sale)
const P1 = await crearProducto('Producto ciclo divisa 1', 999);
const P2 = await crearProducto('Producto ciclo divisa 2', 999);
const P3 = await crearProducto('Producto ciclo divisa 3', 999);
const P4 = await crearProducto('Producto ciclo divisa 4', 999);
const P5 = await crearProducto('Producto ciclo divisa 5', 999);
const P6 = await crearProducto('Producto ciclo divisa 6', 999);

// S1: venta USD 930, total canónico 100.000, cobro zelle USD íntegro (tasa NO divisible)
const S1 = await crearVenta({ num: 1, cur: 'USD', rate: 930, total: 100000,
  items: [{ pid: P1, qty: 2, price: 53.76, priceCup: 50000, cost: 400 }],
  pagos: [{ amount: '(100000::numeric/930::numeric)', method: 'zelle', cur: 'USD', rate: 930 }] });
let e = await entryDe('VENTA', S1);
chk('A·S1 venta USD cobrada íntegra en USD (tasa no divisible): contabiliza (regresión #1615)', !!e);
let mv = e ? await movsDe(e.id) : [];
chk('A·S1 D ACT_BANCOS 100.000 (zelle_usd) / C ING_VENTAS 100.000',
  tiene(mv, 'ACT_BANCOS', 'debito', 100000) && tiene(mv, 'ING_VENTAS', 'credito', 100000), JSON.stringify(mv));

// S2: venta USD 680 exacta, 2 productos (parcial/total por producto)
const S2 = await crearVenta({ num: 2, cur: 'USD', rate: 680, total: 748000,
  items: [{ pid: P2, qty: 1, price: 550, priceCup: 374000, cost: 500 },
          { pid: P3, qty: 1, price: 550, priceCup: 374000, cost: 700 }],
  pagos: [{ amount: 1100, method: 'zelle', cur: 'USD', rate: 680 }] });
e = await entryDe('VENTA', S2); chk('A·S2 venta USD 680 exacta: contabiliza', !!e);

// S3: venta USD cobrada en CUP
const S3 = await crearVenta({ num: 3, cur: 'USD', rate: 800, total: 160000,
  items: [{ pid: P4, qty: 2, price: 100, priceCup: 80000, cost: 300 }],
  pagos: [{ amount: 160000, method: 'cash', cur: 'CUP', rate: 1 }] });
e = await entryDe('VENTA', S3); chk('A·S3 venta USD cobrada en CUP: contabiliza', !!e);

// S4: venta CUP pura
const S4 = await crearVenta({ num: 4, cur: 'CUP', rate: 1, total: 2000,
  items: [{ pid: P5, qty: 1, price: 2000, priceCup: 2000, cost: 600 }],
  pagos: [{ amount: 2000, method: 'cash', cur: 'CUP', rate: 1 }] });
e = await entryDe('VENTA', S4); chk('A·S4 venta CUP: contabiliza', !!e);

// S5: venta USD con cobro mixto (zelle USD + cash CUP)
const S5 = await crearVenta({ num: 5, cur: 'USD', rate: 800, total: 100000,
  items: [{ pid: P6, qty: 1, price: 125, priceCup: 100000, cost: 250 }],
  pagos: [{ amount: 100, method: 'zelle', cur: 'USD', rate: 800 }, { amount: 20000, method: 'cash', cur: 'CUP', rate: 1 }] });
e = await entryDe('VENTA', S5); chk('A·S5 venta USD cobro mixto USD+CUP: contabiliza', !!e);

// D1: devolución TOTAL en USD por la vía REAL del RPC (tasa 930 no divisible)
const D1 = await crearDevolucionRPC(S1, [{ pid: P1, qty: 2 }], 'zelle', 'USD');
let eD1 = await entryDe('DEVOLUCION_VENTA', D1);
let errD1 = await errorDe('DEVOLUCION_VENTA', D1);
chk('A·D1 devolución TOTAL USD (RPC real, tasa no divisible): ANTES → ERR_UNBALANCED (round() rompe amount_cup = total canónico)',
  !eD1 && !!errD1 && /ERR_UNBALANCED/.test(errD1.error_code || ''), errD1 ? String(errD1.error_detail || errD1.error_code).slice(0, 90) : 'sin error');
const filaRefD1 = (await sql(`SELECT amount, exchange_rate, amount_cup FROM public.payment_transactions
  WHERE ref_type='devolution' AND ref_id='${D1}' AND direction='refund'`))[0];
console.log('    fila reembolso D1 (vía RPC, ANTES): amount=' + filaRefD1.amount + ' rate=' + filaRefD1.exchange_rate + ' amount_cup=' + filaRefD1.amount_cup);

// C7' sintética: devolución marcada currency='USD' (×tasa en métricas)
const dev7 = (await sql(`INSERT INTO public.devolutions
  (store_id, original_transaction_id, devolution_number, reason, total_amount, currency, exchange_rate, payment_method, status, notes)
  VALUES ('${store.id}', '${S1}', 'TEST-CICLO-DIV-7-${TS()}', 'Validación ciclo divisa', 37400, 'USD', 680, 'zelle', 'pending',
   'VALIDACIÓN ciclo divisa 20261113 — se elimina al final') RETURNING id`))[0].id;
await sql(`INSERT INTO public.payment_transactions
  (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date, reference)
  VALUES ('${store.id}', 'devolution', '${dev7}', '${S1}', 55, 'zelle', 'USD', 680, 'refund', now(), 'validacion-ciclo-divisa')`);
await sql(`UPDATE public.devolutions SET status='completed', processed_at=now() WHERE id='${dev7}'`);
let e7 = await entryDe('DEVOLUCION_VENTA', dev7);
let err7 = await errorDe('DEVOLUCION_VENTA', dev7);
chk('A·C7′ devolución currency=USD (sintética): ANTES → ERR_UNBALANCED (métricas ×tasa)',
  !e7 && !!err7 && /ERR_UNBALANCED/.test(err7.error_code || ''), err7 ? String(err7.error_detail || '').slice(0, 90) : 'sin error');

// ══ FASE B — aplica 20261114140000 (ciclo de devolución en divisa) ══════════
console.log('\n── FASE B: aplica migración 20261114140000 (ciclo divisa devoluciones) ──');
await sql(readFileSync(join(REPO, 'supabase/migrations/20261114140000_cp_fin_ciclo_devolucion_divisa.sql'), 'utf8'));
console.log('  migración 20261114140000 aplicada (BD aislada)');

// E1: devolución TOTAL en divisa con tasa NO divisible, creada DESPUÉS del fix
// (la fila del reembolso nace con la TASA EFECTIVA exacta → amount_cup = canónico).
// NOTA: D1 (creada ANTES del fix) conserva su error documentado — la migración
// NO reescribe filas históricas de reembolso (producción hoy: 0 devoluciones USD).
const S7 = await crearVenta({ num: 7, cur: 'USD', rate: 930, total: 100000,
  items: [{ pid: P1, qty: 2, price: 53.76, priceCup: 50000, cost: 400 }],
  pagos: [{ amount: '(100000::numeric/930::numeric)', method: 'zelle', cur: 'USD', rate: 930 }] });
chk('B·E1 venta S7 (USD 930 no divisible) para el ciclo post-fix: contabiliza', !!(await entryDe('VENTA', S7)));
const D1b = await crearDevolucionRPC(S7, [{ pid: P1, qty: 2 }], 'zelle', 'USD');
let eD1b = await entryDe('DEVOLUCION_VENTA', D1b); mv = eD1b ? await movsDe(eD1b.id) : [];
chk('B·E1 devolución TOTAL USD post-fix (RPC real, tasa no divisible): contabiliza', !!eD1b);
chk('B·E1 D ING_DEVOLUCIONES 100.000 / C ACT_BANCOS 100.000 (zelle_usd)',
  tiene(mv, 'ING_DEVOLUCIONES', 'debito', 100000) && tiene(mv, 'ACT_BANCOS', 'credito', 100000), JSON.stringify(mv));
chk('B·E1 costo devuelto CONSERVADO: D ACT_INVENTARIO 800 / C GAS_COSTO_VENTAS 800 (cost_at_sale 400×2, NO cost_average 999)',
  tiene(mv, 'ACT_INVENTARIO', 'debito', 800) && tiene(mv, 'GAS_COSTO_VENTAS', 'credito', 800));
chk('B·E1 equilibrado D=C', Math.abs(debCred(mv).d - debCred(mv).c) <= 0.01, JSON.stringify(debCred(mv)));
chk('B·E1 asiento de la venta S7 INTACTO (1 asiento VENTA)', (await nEntries('VENTA', S7)) === 1);
const filaRefD1b = (await sql(`SELECT amount, exchange_rate, amount_cup FROM public.payment_transactions
  WHERE ref_type='devolution' AND ref_id='${D1b}' AND direction='refund'`))[0];
chk('B·E1 fila de reembolso con tasa EFECTIVA: amount físico 107.53 USD · amount_cup = 100.000 exacto (invariante canónica)',
  N(filaRefD1b.amount) === 107.53 && Math.abs(N(filaRefD1b.amount_cup) - 100000) <= 0.01,
  `amount=${filaRefD1b.amount} rate=${filaRefD1b.exchange_rate} amount_cup=${filaRefD1b.amount_cup}`);
const errD1post = await errorDe('DEVOLUCION_VENTA', D1);
chk('B·E1 D1 (pre-fix) conserva su error documentado — la migración NO reescribe filas históricas (0 devoluciones USD reales hoy)',
  !!errD1post && /ERR_UNBALANCED/.test(errD1post.error_code || ''));

// E2: devolución PARCIAL (1 producto de 2) por la vía RPC → equilibrada
const D2 = await crearDevolucionRPC(S2, [{ pid: P2, qty: 1 }], 'zelle', 'USD');
let eD2 = await entryDe('DEVOLUCION_VENTA', D2); mv = eD2 ? await movsDe(eD2.id) : [];
chk('B·E2 devolución PARCIAL USD (RPC): contabiliza', !!eD2);
chk('B·E2 D ING_DEVOLUCIONES 374.000 / C ACT_BANCOS 374.000 + costo 500 (cost_at_sale de P2, NO 999)',
  tiene(mv, 'ING_DEVOLUCIONES', 'debito', 374000) && tiene(mv, 'ACT_BANCOS', 'credito', 374000)
  && tiene(mv, 'ACT_INVENTARIO', 'debito', 500) && tiene(mv, 'GAS_COSTO_VENTAS', 'credito', 500));
chk('B·E2 equilibrado D=C', Math.abs(debCred(mv).d - debCred(mv).c) <= 0.01, JSON.stringify(debCred(mv)));

// E3: devolución del RESTO (total) USD vía RPC
const D3 = await crearDevolucionRPC(S2, [{ pid: P3, qty: 1 }], 'zelle', 'USD');
let eD3 = await entryDe('DEVOLUCION_VENTA', D3); mv = eD3 ? await movsDe(eD3.id) : [];
chk('B·E3 devolución del resto USD (RPC): contabiliza y equilibrada',
  !!eD3 && tiene(mv, 'ING_DEVOLUCIONES', 'debito', 374000) && tiene(mv, 'ACT_BANCOS', 'credito', 374000)
  && Math.abs(debCred(mv).d - debCred(mv).c) <= 0.01);

// E4: venta CUP + devolución CUP (transfer) — regresión
const D4 = await crearDevolucionRPC(S4, [{ pid: P5, qty: 1 }], 'transfer', 'CUP');
let eD4 = await entryDe('DEVOLUCION_VENTA', D4); mv = eD4 ? await movsDe(eD4.id) : [];
chk('B·E4 venta CUP + devolución CUP: contabiliza', !!eD4);
chk('B·E4 D ING_DEVOLUCIONES 2.000 / C ACT_BANCOS 2.000 + costo 600 (cost_at_sale)',
  tiene(mv, 'ING_DEVOLUCIONES', 'debito', 2000) && tiene(mv, 'ACT_BANCOS', 'credito', 2000)
  && tiene(mv, 'ACT_INVENTARIO', 'debito', 600) && tiene(mv, 'GAS_COSTO_VENTAS', 'credito', 600));

// E5: venta USD cobrada en CUP + devolución reembolsada en CUP
const D5 = await crearDevolucionRPC(S3, [{ pid: P4, qty: 2 }], 'transfer', 'CUP');
let eD5 = await entryDe('DEVOLUCION_VENTA', D5); mv = eD5 ? await movsDe(eD5.id) : [];
chk('B·E5 venta USD cobrada CUP + devolución CUP: contabiliza', !!eD5);
chk('B·E5 D ING_DEVOLUCIONES 160.000 / C ACT_BANCOS 160.000 + costo 600',
  tiene(mv, 'ING_DEVOLUCIONES', 'debito', 160000) && tiene(mv, 'ACT_BANCOS', 'credito', 160000)
  && tiene(mv, 'ACT_INVENTARIO', 'debito', 600) && tiene(mv, 'GAS_COSTO_VENTAS', 'credito', 600));

// E6: venta USD cobro mixto + devolución AS_PAID (componentes CUP+USD).
// El AS_PAID exige método 'cash' + saldo físico por moneda → financiar el
// cajón con una venta S6 con liquidación explícita (settlement) previa.
const P7 = await crearProducto('Producto ciclo divisa 7', 999);
const S6 = await crearVenta({ num: 6, cur: 'USD', rate: 800, total: 2100000,
  items: [{ pid: P7, qty: 1, price: 2625, priceCup: 2100000, cost: 100 }],
  pagos: [{ amount: 2000, method: 'cash', cur: 'USD', rate: 800 }, { amount: 500000, method: 'cash', cur: 'CUP', rate: 1 }],
  settle: { cup: 500000, usd: 2000 } });
chk('B·E6 venta S6 (financiación del cajón, liquidación explícita): contabiliza', !!(await entryDe('VENTA', S6)));
const D6 = await crearDevolucionRPC(S5, [{ pid: P6, qty: 1 }], 'cash', 'AS_PAID');
let eD6 = await entryDe('DEVOLUCION_VENTA', D6); mv = eD6 ? await movsDe(eD6.id) : [];
chk('B·E6 venta USD mixta + devolución AS_PAID: contabiliza', !!eD6);
chk('B·E6 C ACT_EFECTIVO_CUP 20.000 + C ACT_EFECTIVO_USD 80.000 / D ING_DEVOLUCIONES 100.000',
  tiene(mv, 'ACT_EFECTIVO_CUP', 'credito', 20000) && tiene(mv, 'ACT_EFECTIVO_USD', 'credito', 80000)
  && tiene(mv, 'ING_DEVOLUCIONES', 'debito', 100000));
chk('B·E6 equilibrado D=C (componentes exactos)', Math.abs(debCred(mv).d - debCred(mv).c) <= 0.01, JSON.stringify(debCred(mv)));

// E7: anulación y reversión
const antesAnul = (await nEntries('DEVOLUCION_VENTA', D2));
await sql(`SELECT public.fin_post_annulment_safe('DEVOLUCION_VENTA', '${D2}')`);
let eAnul = await entryDe('DEVOLUCION_VENTA', D2, 'anulacion');
mv = eAnul ? await movsDe(eAnul.id) : [];
const mvRec = await movsDe((await entryDe('DEVOLUCION_VENTA', D2)).id);
chk('B·E7 anulación crea asiento espejo (event=anulacion)', !!eAnul);
chk('B·E7 espejo invertido: cada movimiento con sentido opuesto e igual importe',
  mv.length === mvRec.length && mv.every(m => mvRec.some(r2m => r2m.cat === m.cat && r2m.s !== m.s && Math.abs(r2m.amt - m.amt) <= 0.01)),
  `${mv.length} vs ${mvRec.length}`);
await sql(`SELECT public.fin_post_annulment_safe('DEVOLUCION_VENTA', '${D2}')`);
chk('B·E7 anulación idempotente (2ª llamada no añade asientos)', (await nEntries('DEVOLUCION_VENTA', D2)) === antesAnul + 1,
  `antes=${antesAnul} ahora=${await nEntries('DEVOLUCION_VENTA', D2)}`);
chk('B·E7 asiento de la venta S2 intacto tras la anulación', (await nEntries('VENTA', S2)) === 1);

// E8/E9: ausencia de doble reconocimiento
const nV1a = await nEntries('VENTA', S1);
await sql(`SELECT public.fin_post_document_safe('VENTA', '${S1}', 'reconocimiento')`);
chk('B·E8 re-publicar la venta NO duplica asientos', (await nEntries('VENTA', S1)) === nV1a, `${nV1a}`);
const nD1a = await nEntries('DEVOLUCION_VENTA', D1b);
await sql(`SELECT public.fin_post_document_safe('DEVOLUCION_VENTA', '${D1b}', 'reconocimiento')`);
chk('B·E9 re-publicar la devolución NO duplica asientos', (await nEntries('DEVOLUCION_VENTA', D1b)) === nD1a, `${nD1a}`);
const movIng = (await sql(`SELECT count(*)::int n FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type='VENTA' AND e.document_id='${S1}' AND m.category_code='ING_VENTAS'`))[0].n;
chk('B·E9 ingreso reconocido UNA sola vez (1 movimiento ING_VENTAS por venta)', movIng === 1, `${movIng}`);

// E10: C7' sintética republicada → equilibrada (métricas sin ×tasa)
await republicar('DEVOLUCION_VENTA', dev7);
e7 = await entryDe('DEVOLUCION_VENTA', dev7); mv = e7 ? await movsDe(e7.id) : [];
chk('B·E10 devolución currency=USD republicada: contabiliza (total_cup = total_amount, sin ×tasa)', !!e7);
chk('B·E10 D ING_DEVOLUCIONES 37.400 / C ACT_BANCOS 37.400',
  tiene(mv, 'ING_DEVOLUCIONES', 'debito', 37400) && tiene(mv, 'ACT_BANCOS', 'credito', 37400));

// ── restauración de funciones ORIGINALES + limpieza total ────────────────────
console.log('\n── Restauración y limpieza ──');
await sql(fnMetricsO);
await sql(fnDevO);
const fnMetricsT = (await sql(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_compute_metrics'`))[0].def;
const fnDevT = (await sql(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_devolution_v2'`))[0].def;
chk('fin_compute_metrics RESTAURADA (hash idéntico)', sha(fnMetricsT.trim()) === sha(fnMetricsO.trim()), `${sha(fnMetricsO.trim())}→${sha(fnMetricsT.trim())}`);
chk('create_devolution_v2 RESTAURADA (hash idéntico)', sha(fnDevT.trim()) === sha(fnDevO.trim()), `${sha(fnDevO.trim())}→${sha(fnDevT.trim())}`);

// restaurar la secuencia de credit_note (consumida por next_document_number)
if (snap0.seq_cn === null || snap0.seq_cn === undefined) {
  await sql(`DELETE FROM public.document_sequences ds WHERE ds.store_id='${store.id}' AND ds.document_type='credit_note' AND ds.year = date_part('year', now())::int`);
} else {
  await sql(`UPDATE public.document_sequences SET last_number=${snap0.seq_cn} WHERE store_id='${store.id}' AND document_type='credit_note' AND year = date_part('year', now())::int`);
}

await sql(`BEGIN;
  DELETE FROM public.fin_movements WHERE entry_id IN
    (SELECT id FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')
       OR document_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%')));
  DELETE FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%'));
  DELETE FROM public.fin_posting_errors WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%'));
  ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.payment_transactions WHERE reference = 'validacion-ciclo-divisa'
     OR (ref_type = 'devolution' AND ref_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%')));
  ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.devolution_items WHERE devolution_id IN (SELECT id FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%'));
  DELETE FROM public.devolutions WHERE (notes LIKE 'VALIDACIÓN ciclo divisa%' OR reason LIKE 'VALIDACIÓN ciclo divisa%' OR devolution_number LIKE 'TEST-CICLO-DIV-%');
  DELETE FROM public.transaction_items WHERE transaction_id IN
    (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%');
  DELETE FROM public.transactions WHERE invoice_number LIKE 'TEST-CICLO-DIV-%';
  DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE 'TEST-CD-%');
  DELETE FROM public.inventory WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE 'TEST-CD-%');
  DELETE FROM public.products WHERE sku LIKE 'TEST-CD-%';
  DELETE FROM public.cash_movements WHERE reason LIKE '%VALIDACIÓN ciclo divisa%';
  DELETE FROM public.cash_register_sessions WHERE store_id = '${store.id}' AND opened_at >= '${t0}'::timestamptz;
  DELETE FROM public.idempotency_registry WHERE idempotency_key LIKE 'ciclo-div-%';
  DELETE FROM public.audit_logs WHERE action = 'DEVOLUTION_CREATED_V2' AND created_at >= '${t0}'::timestamptz;
  COMMIT;`);

const snap1 = (await sql(SNAP))[0];
const net0 = JSON.stringify(snap0) === JSON.stringify(snap1);
chk('NET DELTA 0 (limpieza total; ambas funciones restauradas)', net0, 'antes=' + JSON.stringify(snap0) + ' después=' + JSON.stringify(snap1));

console.log('\n════ RESULTADO: ' + (FALLAS === 0 && net0
  ? 'PASS TOTAL (ciclo de divisa completo: venta+devolución+anulación coherentes con moneda original y equivalente CUP)'
  : 'FAIL: ' + FALLAS + ' comprobaciones') + ' ════');
process.exit(FALLAS === 0 && net0 ? 0 : 1);
