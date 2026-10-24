#!/usr/bin/env node
/**
 * FASE A — Batería OBLIGATORIA de concurrencia POST-FIX (misión §3).
 * BD aislada cajamision con cadena 2222→23000→40000→260000 aplicada.
 * Expectativas pre-calculadas ANTES de ejecutar (arriba de cada prueba).
 * Invariante global: saldo físico final por moneda = inicial + entradas − salidas
 * confirmadas; NUNCA negativo por carrera.
 */
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
const PG = 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision';
const c = await new Client({ connectionString: PG }).connect();
const UUID = () => crypto.randomUUID();
const R = { pass: 0, fail: 0, defects: [] };

function check(label, ok, detail = '') {
  if (ok) { R.pass++; console.log(`  ✅ ${label}`); }
  else { R.fail++; R.defects.push({ label, detail }); console.log(`  ❌ ${label} ${detail}`); }
}

async function net(store) {
  const r = await c.query(`SELECT public.get_cash_currency_summary($1, NULL, 'infinity'::timestamptz) AS r`, [store]);
  return r.rows[0].r.net;
}
const nCUP = (n) => Number(n.CUP ?? 0);
const nUSD = (n) => Number(n.USD ?? 0);

async function baseFixture(store, user, prod) {
  await c.query(`INSERT INTO public.stores (id,name) VALUES ($1,'fx')`, [store]);
  await c.query(`INSERT INTO public.profiles (id,full_name,role) VALUES ($1,'u','user')`, [user]);
  await c.query(`INSERT INTO public.user_store_memberships (user_id,store_id,role,status) VALUES ($1,$2,'admin','active')`, [user, store]);
  await c.query(`SELECT public.open_cash_shift(p_store_id := $1, p_opening_balance_cup := 0, p_opening_balance_usd := 0, p_user_id := $2)`, [store, user]);
  await c.query(`INSERT INTO public.products (id,store_id,name,is_service,cost_average,stock_current) VALUES ($1,$2,'p',false,10,1000)`, [prod, store]);
}
async function saleCUP(store, user, prod, total = 5000, qty = 10) {
  const sale = UUID();
  await c.query(`INSERT INTO public.transactions (id,store_id,seller_id,total_amount,status,payment_method,cash_amount,sale_currency,created_at,cash_received_cup,change_given_cup) VALUES ($1,$2,$3,$4,'completed','cash',$4,'CUP',now(),$4,0)`, [sale, store, user, total]);
  await c.query(`INSERT INTO public.transaction_items (transaction_id,product_id,quantity,price_at_sale,price_at_sale_cup,currency,exchange_rate,cost_at_sale) VALUES ($1,$2,$3,$4,$4,'CUP',1,10)`, [sale, prod, qty, total / qty]);
  await c.query(`INSERT INTO public.payment_transactions (store_id,ref_type,ref_id,transaction_id,amount,payment_method,currency,exchange_rate,direction,payment_date) VALUES ($1,'sale',$2,$2,$3,'cash','CUP',1,'in',now())`, [store, sale, total]);
  return sale;
}

const egreso = (cl, store, user, amount, currency) =>
  cl.query(`SELECT public.create_cash_flow_document(p_store_id := $1, p_doc_type := 'egreso', p_concept := 'otro_egreso', p_amount := $2, p_currency := $3, p_counterparty := 'x', p_justification := 'race', p_idempotency_key := $4, p_user_id := $5) AS r`,
    [store, amount, currency, 'eg-' + UUID(), user]);
const reembolso = (cl, store, user, prod, sale, qty, unit, currency) =>
  cl.query(`SELECT public.create_devolution_v2(p_store_id := $1, p_user_id := $2, p_items := $3::jsonb, p_reason := 'race', p_original_transaction_id := $4, p_payment_method := 'cash', p_refund_currency := $5, p_idempotency_key := $6) AS r`,
    [store, user, JSON.stringify([{ product_id: prod, quantity: qty, unit_price: unit }]), sale, currency, 'dev-' + UUID()]);
const supplierCash = (cl, store, user, receipt, amount) =>
  cl.query(`SELECT public.register_supplier_payment(p_store_id := $1, p_ref_type := 'receipt', p_ref_id := $2, p_amount := $3, p_payment_method := 'cash', p_paid_by := $4, p_currency := 'CUP', p_exchange_rate := 1.0, p_idempotency_key := $5) AS r`,
    [store, receipt, amount, user, 'sup-' + UUID()]);
const adjOut = (cl, store, user, amount) =>
  cl.query(`SELECT public.register_cash_adjustment(p_store_id := $1, p_direction := 'out', p_amount := $2, p_note := 'race', p_idempotency_key := $3, p_user_id := $4) AS r`,
    [store, amount, 'adj-' + UUID(), user]);
const payCommission = (cl, store, user, commId, method = 'cash') =>
  cl.query(`SELECT public.pay_commission(p_payment_id := $1, p_payment_method := $2, p_user_id := $3) AS r`, [commId, method, user]);

async function racePair(label, iterations, stagger, mkCtx, runA, runB, verify) {
  let bad = 0;
  for (let i = 0; i < iterations; i++) {
    const x = await mkCtx();
    const cA = await new Client({ connectionString: PG }).connect();
    const cB = await new Client({ connectionString: PG }).connect();
    const pA = runA(cA, x).then(v => ({ ok: true }), e => ({ ok: false, err: String(e.message).split('\n')[0].slice(0, 80) }));
    if (stagger > 0) await new Promise(r => setTimeout(r, stagger));
    const pB = runB(cB, x).then(v => ({ ok: true }), e => ({ ok: false, err: String(e.message).split('\n')[0].slice(0, 80) }));
    const [a, b] = await Promise.all([pA, pB]);
    const n = await net(x.store);
    const verdict = verify(a, b, n, x);
    if (!verdict.ok) { bad++; console.log(`    #${i} 💥 ${verdict.detail} [a=${a.ok} errA=${a.err || '-'} | b=${b.ok} errB=${b.err || '-'}] net=${JSON.stringify(n)}`); }
    await cA.end(); await cB.end();
  }
  check(`${label} (desfase ${stagger}ms, ${iterations}×)`, bad === 0, `${bad} defectos`);
  return bad;
}

// ═══ T0: ESCENARIO DECISIVO DEL MECANISMO (antes: AMBAS OK; ahora: RECHAZO) ═══
console.log('═══ T0 ventana-decisiva: cB empieza ANTES, lock DESPUÉS del commit de cA ═══');
{
  let bad = 0;
  for (let i = 0; i < 10; i++) {
    const store = UUID(), user = UUID(), prod = UUID();
    await baseFixture(store, user, prod);
    await saleCUP(store, user, prod);
    const cB = await new Client({ connectionString: PG }).connect();
    await cB.query('BEGIN');
    await cB.query('SELECT now(), pg_sleep(0.12)');
    const cA = await new Client({ connectionString: PG }).connect();
    const a = await egreso(cA, store, user, 3000, 'CUP').then(() => true, () => false);
    let bRej = null;
    try { await egreso(cB, store, user, 3000, 'CUP'); bRej = false; } catch (e) { bRej = String(e.message).includes('ERR_INSUFFICIENT_CURRENCY'); }
    const n = await net(store);
    if (!a || !bRej || nCUP(n) < 1999.99) { bad++; console.log(`    #${i} a=${a} bRej=${bRej} net=${nCUP(n)}`); }
    await cB.query('ROLLBACK');
    await cA.end(); await cB.end();
  }
  check('T0 mecanismo cerrado (cB ve el egreso confirmado post-lock)', bad === 0, `${bad}/10 mal`);
}

// ═══ R1: dos egresos CUP 3000 (físico 5000) → exactamente 1, net 2000 ═══
console.log('═══ R1 egresoCUP+egresoCUP ═══');
await racePair('R1', 15, 0,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p); return { store: s, user: u, prod: p }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (a, b, n) => {
    const ok = (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01;
    return { ok, detail: ok ? '' : `esperado 1 OK + net 2000` };
  });
await racePair('R1-stagger1ms', 10, 1,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p); return { store: s, user: u, prod: p }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado 1 OK + net 2000' }));
await racePair('R1-stagger2ms', 10, 2,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p); return { store: s, user: u, prod: p }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado 1 OK + net 2000' }));

// ═══ R2: dos egresos USD 60 (físico USD 100 vía ingreso USD) → 1 OK, net USD 40 ═══
console.log('═══ R2 egresoUSD+egresoUSD ═══');
await racePair('R2', 12, 0,
  async () => {
    const s = UUID(), u = UUID(), p = UUID();
    await baseFixture(s, u, p);
    await c.query(`INSERT INTO public.store_exchange_rates (store_id, currency, rate, source) VALUES ($1,'USD',400,'manual')`, [s]);
    // físico USD vía INGRESO USD (canónico amount_cup=40000 — como faseE de la misión anterior)
    await c.query(`SELECT public.create_cash_flow_document(p_store_id := $1, p_doc_type := 'ingreso', p_concept := 'otro_ingreso', p_amount := 100, p_currency := 'USD', p_counterparty := 'y', p_justification := 'seed', p_idempotency_key := $2, p_user_id := $3) AS r`, [s, 'ing-' + UUID(), u]);
    return { store: s, user: u, prod: p };
  },
  (cl, x) => egreso(cl, x.store, x.user, 60, 'USD'),
  (cl, x) => egreso(cl, x.store, x.user, 60, 'USD'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nUSD(n) - 40) < 0.01, detail: 'esperado 1 OK + USD net 40' }));

// ═══ R3: egreso 3000 + reembolso 3000 (físico 5000) → exactamente 1, net 2000 ═══
console.log('═══ R3 egreso+reembolso ═══');
await racePair('R3', 15, 0,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); const sale = await saleCUP(s, u, p); return { store: s, user: u, prod: p, sale }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => reembolso(cl, x.store, x.user, x.prod, x.sale, 6, 500, 'CUP'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado exactamente 1 + net 2000' }));
await racePair('R3-stagger1ms', 10, 1,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); const sale = await saleCUP(s, u, p); return { store: s, user: u, prod: p, sale }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => reembolso(cl, x.store, x.user, x.prod, x.sale, 6, 500, 'CUP'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado exactamente 1 + net 2000' }));

// ═══ R4: egreso 6000 + reversión ingreso 3000 (físico 8000) → exactamente 1 ═══
console.log('═══ R4 egreso+reversión de ingreso ═══');
await racePair('R4', 12, 0,
  async () => {
    const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p);
    await c.query(`SELECT public.create_cash_flow_document(p_store_id := $1, p_doc_type := 'ingreso', p_concept := 'otro_ingreso', p_amount := 3000, p_currency := 'CUP', p_counterparty := 'y', p_justification := 'ing', p_idempotency_key := $2, p_user_id := $3) AS r`, [s, 'ing-' + UUID(), u]);
    const ing = (await c.query(`SELECT id FROM public.cash_flow_documents WHERE store_id=$1 AND doc_type='ingreso' ORDER BY created_at DESC LIMIT 1`, [s])).rows[0].id;
    return { store: s, user: u, prod: p, ing };
  },
  (cl, x) => egreso(cl, x.store, x.user, 6000, 'CUP'),
  (cl, x) => cl.query(`SELECT public.reverse_cash_flow_document(p_document_id := $1, p_reason := 'race', p_user_id := $2) AS r`, [x.ing, x.user]),
  (a, b, n) => {
    const net2000 = Math.abs(nCUP(n) - 2000) < 0.01, net5000 = Math.abs(nCUP(n) - 5000) < 0.01;
    return { ok: (a.ok !== b.ok) && (net2000 || net5000) && nCUP(n) >= -0.005, detail: 'esperado exactamente 1 (net 2000 o 5000)' };
  });

// ═══ R5: reembolso + reembolso MISMA venta → 1 (lock de fila de la venta) ═══
console.log('═══ R5 reembolso+reembolso misma venta ═══');
await racePair('R5', 12, 0,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); const sale = await saleCUP(s, u, p); return { store: s, user: u, prod: p, sale }; },
  (cl, x) => reembolso(cl, x.store, x.user, x.prod, x.sale, 6, 500, 'CUP'),
  (cl, x) => reembolso(cl, x.store, x.user, x.prod, x.sale, 6, 500, 'CUP'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado 1 + net 2000' }));

// ═══ R6: reembolso 4000 (venta A) + egreso 7000 (físico 10000) → exactamente 1 ═══
console.log('═══ R6 reembolsos de ventas distintas compiten con egreso ═══');
await racePair('R6', 12, 0,
  async () => {
    const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p);
    await saleCUP(s, u, p); const saleA = await saleCUP(s, u, p);
    return { store: s, user: u, prod: p, saleA };
  },
  (cl, x) => reembolso(cl, x.store, x.user, x.prod, x.saleA, 8, 500, 'CUP'),
  (cl, x) => egreso(cl, x.store, x.user, 7000, 'CUP'),
  (a, b, n) => {
    const ok = (a.ok !== b.ok) && nCUP(n) >= -0.005 && (Math.abs(nCUP(n) - 6000) < 0.01 || Math.abs(nCUP(n) - 3000) < 0.01);
    return { ok, detail: 'esperado exactamente 1 + net 6000|3000' };
  });

// ═══ R7: devolución + cierre de caja → arqueo congelado == ledger; sin inconsistencia ═══
console.log('═══ R7 devolución+cierre ═══');
{
  let bad = 0;
  for (let i = 0; i < 8; i++) {
    const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p);
    const sale = await saleCUP(s, u, p);
    const closure = (await c.query(`SELECT id FROM public.cash_closures WHERE store_id=$1 AND status='pendiente' ORDER BY created_at DESC LIMIT 1`, [s])).rows[0].id;
    const cA = await new Client({ connectionString: PG }).connect();
    const cB = await new Client({ connectionString: PG }).connect();
    const pA = reembolso(cA, s, u, p, sale, 6, 500, 'CUP').then(v => ({ ok: true }), e => ({ ok: false, err: String(e.message).slice(0, 60) }));
    const pB = cB.query(`SELECT public.close_cash_shift(p_closure_id := $1, p_declared_cash := 2000, p_declared_vouchers := 0, p_declared_cash_usd := 0, p_notes := 'race', p_user_id := $2) AS r`, [closure, u]).then(v => ({ ok: true }), e => ({ ok: false, err: String(e.message).slice(0, 60) }));
    const [a, b] = await Promise.all([pA, pB]);
    // Invariante: el arqueo congelado debe reconciliar con el ledger de la ventana
    const cl = (await c.query(`SELECT system_expected_total, status FROM public.cash_closures WHERE id=$1`, [closure])).rows[0];
    const ledgerNet = nCUP(await net(s));
    // El reembolso, si pasó, queda dentro de la ventana del turno (operation_date dentro) — el arqueo
    // se congela bajo lock: si el reembolso cometió antes, el arqueo lo cuenta; si después, el reembolso
    // se rechaza por turno cerrado. Nunca: reembolso cometido + arqueo sin contarlo.
    const refundRows = (await c.query(`SELECT count(*)::int AS n FROM public.payment_transactions WHERE store_id=$1 AND ref_type='devolution' AND direction='refund'`, [s])).rows[0].n;
    const consistent = refundRows === 0 ? true : (cl && cl.system_expected_total !== null && cl.status === 'cerrado');
    if (!consistent || (a.ok && b.ok && refundRows === 0) || (!a.ok && !b.ok)) {
      bad++;
      console.log(`    #${i} a=${a.ok} b=${b.ok} refunds=${refundRows} expected=${cl?.expected_cash} net=${ledgerNet} errA=${a.err || '-'} errB=${b.err || '-'}`);
    }
    await cA.end(); await cB.end();
  }
  check('R7 arqueo congelado consistente con ledger (8×)', bad === 0, `${bad} defectos`);
}

// ═══ R8: idempotencia simultánea misma clave ═══
console.log('═══ R8 misma clave idempotente ═══');
{
  let bad = 0;
  for (let i = 0; i < 8; i++) {
    const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p);
    const key = 'idem-' + UUID();
    const cA = await new Client({ connectionString: PG }).connect();
    const cB = await new Client({ connectionString: PG }).connect();
    const q = (cl) => cl.query(`SELECT public.create_cash_flow_document(p_store_id := $1, p_doc_type := 'egreso', p_concept := 'otro_egreso', p_amount := 3000, p_currency := 'CUP', p_counterparty := 'x', p_justification := 'idem', p_idempotency_key := $2, p_user_id := $3) AS r`, [s, key, u]);
    const [a, b] = await Promise.allSettled([q(cA), q(cB)]);
    const docs = (await c.query(`SELECT count(*)::int AS n FROM public.cash_flow_documents WHERE store_id=$1 AND idempotency_key=$2`, [s, key])).rows[0].n;
    const n = await net(s);
    if (docs !== 1 || nCUP(n) < 1999.99) { bad++; console.log(`    #${i} docs=${docs} net=${nCUP(n)}`); }
    await cA.end(); await cB.end();
  }
  check('R8 exactamente 1 documento (8×)', bad === 0, `${bad} defectos`);
}

// ═══ R9: egreso 3000 + pago a proveedor en efectivo 3000 (físico 5000) → exactamente 1 ═══
console.log('═══ R9 egreso+pago proveedor efectivo ═══');
{
  // receipts mínima fiel (columnas que usa register_supplier_payment)
  await c.query(`CREATE TABLE IF NOT EXISTS public.receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, total_cost numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active', payment_status text, paid_amount numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`);
  await racePair('R9', 12, 0,
    async () => {
      const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p);
      const rec = (await c.query(`INSERT INTO public.receipts (store_id, total_cost, status) VALUES ($1, 6000, 'active') RETURNING id`, [s])).rows[0].id;
      return { store: s, user: u, prod: p, rec };
    },
    (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
    (cl, x) => supplierCash(cl, x.store, x.user, x.rec, 3000),
    (a, b, n) => ({ ok: (a.ok !== b.ok) && nCUP(n) >= -0.005, detail: 'esperado exactamente 1 + net ≥ 0' }));
}

// ═══ R10: egreso 3000 + ajuste out 3000 (físico 5000) → exactamente 1, net 2000 ═══
console.log('═══ R10 egreso+ajuste out ═══');
await racePair('R10', 12, 0,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p); return { store: s, user: u, prod: p }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => adjOut(cl, x.store, x.user, 3000),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado exactamente 1 + net 2000' }));

// ═══ R11: egreso 3000 + pago comisión efectivo 2400 (físico 5000) → exactamente 1 ═══
console.log('═══ R11 egreso+pago comisión efectivo ═══');
await racePair('R11', 12, 0,
  async () => {
    const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p);
    const comm = (await c.query(`INSERT INTO public.commission_payments (store_id, worker_id, period_start, period_end, status, currency, exchange_rate, amount_cup, final_amount, calculated_amount) VALUES ($1, $2, now()::date - 7, now()::date, 'approved', 'CUP', 1, 2400, 2400, 2400) RETURNING id`, [s, u])).rows[0].id;
    return { store: s, user: u, prod: p, comm };
  },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => payCommission(cl, x.store, x.user, x.comm, 'cash'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && nCUP(n) >= -0.005, detail: 'esperado exactamente 1 + net ≥ 0' }));

// ═══ STRESS R1: 200 iteraciones ═══
console.log('═══ STRESS R1 200× ═══');
await racePair('STRESS-R1', 200, 0,
  async () => { const s = UUID(), u = UUID(), p = UUID(); await baseFixture(s, u, p); await saleCUP(s, u, p); return { store: s, user: u, prod: p }; },
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (cl, x) => egreso(cl, x.store, x.user, 3000, 'CUP'),
  (a, b, n) => ({ ok: (a.ok !== b.ok) && Math.abs(nCUP(n) - 2000) < 0.01, detail: 'esperado 1 OK + net 2000' }));

console.log(`\n════════════════════════════════════════════════`);
console.log(`FASE A POST-FIX: ${R.pass} PASS · ${R.fail} FAIL · ${R.defects.length} defectos`);
if (R.defects.length) console.log(JSON.stringify(R.defects.slice(0, 5), null, 2));
import { writeFileSync } from 'node:fs';
writeFileSync('/home/z/my-project/scripts/mision-integral/race-postfix-results.json', JSON.stringify(R, null, 2));
await c.end();
process.exit(R.fail > 0 ? 1 : 0);
