/**
 * MISIÓN AUDITORÍA CAJA (2026-10-24) — Fase 4/5: certificación contable.
 *
 * Ejecuta los casos A–F del brief contra la BD AISLADA cajamision con los
 * RPC REALES (create_cash_flow_document, reverse_cash_flow_document,
 * get_cash_flow_summary, get_cash_currency_summary, open_cash_shift) y datos
 * 100% sintéticos. NUNCA producción.
 *
 * Cifras esperadas calculadas ANTES de ejecutar (regla §7.3: no deducir el
 * esperado del resultado del sistema).
 */
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
import { writeFileSync } from 'node:fs';

const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision' });
await c.connect();

const results = [];
let pass = 0, fail = 0;
function check(id, desc, expected, observed) {
  const ok = JSON.stringify(expected) === JSON.stringify(observed);
  ok ? pass++ : fail++;
  results.push({ id, desc, expected, observed, status: ok ? 'PASS' : 'FAIL' });
  console.log(`${ok ? '✅' : '❌'} ${id} · ${desc}${ok ? '' : `\n   esperado: ${JSON.stringify(expected)}\n   observado: ${JSON.stringify(observed)}`}`);
}

async function rpc(name, args) {
  try {
    const keys = Object.keys(args);
    const params = keys.map((k, i) => `${k} := $${i + 1}`).join(', ');
    const r = await c.query(`SELECT public.${name}(${params}) AS r`, keys.map(k => args[k]));
    return { ok: true, data: r.rows[0].r };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

async function net(store) {
  const r = await c.query(`SELECT public.get_cash_currency_summary($1, NULL, NULL) AS r`, [store]);
  return r.rows[0].r.net;
}
async function summary(store) {
  const r = await c.query(`SELECT public.get_cash_flow_summary($1, NULL, NULL) AS r`, [store]);
  return r.rows[0].r;
}
const count = async (table, where) =>
  (await c.query(`SELECT count(*)::int AS n FROM public.${table} WHERE ${where}`)).rows[0].n;

// ══ SEED (datos sintéticos) ══
const S1 = 'aaaaaaa1-0000-4000-8000-000000000001';
const S2 = 'aaaaaaa2-0000-4000-8000-000000000002';
const U_ADMIN = 'bbbbbbb1-0000-4000-8000-000000000001';
const U_ENCAR = 'bbbbbbb2-0000-4000-8000-000000000002';
const U_CLERK = 'bbbbbbb3-0000-4000-8000-000000000003';
const U_OTHER = 'bbbbbbb4-0000-4000-8000-000000000004';

await c.query(`
INSERT INTO public.stores (id, name) VALUES
  ('${S1}', 'QA-AUDIT-CAJA-S1'), ('${S2}', 'QA-AUDIT-CAJA-S2')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, role) VALUES
  ('${U_ADMIN}', 'Admin Sintético', 'admin'),
  ('${U_ENCAR}', 'Encargado S1', 'encargado'),
  ('${U_CLERK}', 'Cajero S1', 'clerk'),
  ('${U_OTHER}', 'Encargado S2', 'encargado')
ON CONFLICT DO NOTHING;
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('${U_ENCAR}', '${S1}', 'encargado', 'active'),
  ('${U_CLERK}', '${S1}', 'clerk', 'active'),
  ('${U_OTHER}', '${S2}', 'encargado', 'active')
ON CONFLICT DO NOTHING;
INSERT INTO public.exchange_rates (rate_date, currency, source, rate) VALUES
  (CURRENT_DATE, 'USD', 'elToque', 480);
`);

// Apertura de turno con fondo 0/0 (el fondo llegará SOLO por constitución)
const op = await rpc('open_cash_shift', { p_store_id: S1, p_opening_balance_cup: 0, p_opening_balance_usd: 0, p_user_id: U_ADMIN });
if (!op.ok) { console.log('open_cash_shift FALLÓ:', op.err); process.exit(1); }

// ══ CASO A — Fondo de cambio ══
console.log('\n═══ CASO A · Fondo de cambio ═══');
const ID1 = 'idem-a1-0001';
const a1 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'constitucion_fondo',
  p_amount: 5000, p_currency: 'CUP', p_justification: 'fixture: constitución',
  p_idempotency_key: ID1, p_user_id: U_ENCAR,
});
check('A1', 'constitución 5000 CUP: documento confirmado', true, a1.ok && a1.data.status === 'success');
if (!a1.ok) console.log('   A1 ERROR:', a1.err);
check('A1-net', 'net CUP tras constitución = 5000', { CUP: 5000 }, { CUP: Number((await net(S1)).CUP) });
check('A1-fondo', 'fondo vigente = 5000 (sin turno-declarado, fondo=flujo)', 5000, Number((await summary(S1)).fondo_vigente));

const a2 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'reposicion_fondo',
  p_amount: 2000, p_currency: 'CUP', p_justification: 'fixture: reposición',
  p_user_id: U_ENCAR,
});
check('A2', 'reposición 2000 CUP OK', true, a2.ok);
check('A2-net', 'net CUP 7000 (reposición = movimiento posterior, sin doble conteo)', 7000, Number((await net(S1)).CUP));

const a3 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'egreso', p_concept: 'devolucion_parcial_fondo',
  p_amount: 1500, p_currency: 'CUP', p_justification: 'fixture: devolución parcial',
  p_related_document_id: a1.data.document_id, p_user_id: U_ENCAR,
});
check('A3', 'devolución parcial 1500 OK (vinculada al origen)', true, a3.ok);
check('A3-net', 'net CUP 5500', 5500, Number((await net(S1)).CUP));

const a4 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'egreso', p_concept: 'devolucion_total_fondo',
  p_amount: 5500, p_currency: 'CUP', p_justification: 'fixture: devolución total',
  p_user_id: U_ENCAR,
});
check('A4', 'devolución total 5500 OK', true, a4.ok);
check('A4-net', 'net CUP 0 · fondo agotado', { CUP: 0, USD: 0 }, { CUP: Number((await net(S1)).CUP), USD: Number((await net(S1)).USD) });

const a5 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'egreso', p_concept: 'devolucion_total_fondo',
  p_amount: 100, p_currency: 'CUP', p_justification: 'fixture: excede fondo',
  p_user_id: U_ENCAR,
});
check('A5', 'devolución > fondo disponible RECHAZADA (fondo agotado: ERR_FUND_INSUFFICIENT o el guard de efectivo disponible)', true,
  !a5.ok && /ERR_FUND_INSUFFICIENT|ERR_INSUFFICIENT_CASH/.test(a5.err));

const docsBefore = await count('cash_flow_documents', `store_id='${S1}'`);
const a6 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'constitucion_fondo',
  p_amount: 5000, p_currency: 'CUP', p_justification: 'fixture: constitución',
  p_idempotency_key: ID1, p_user_id: U_ENCAR,
});
const docsAfter = await count('cash_flow_documents', `store_id='${S1}'`);
check('A6', 'reintento (misma clave + mismo payload) → replay benigno con MISMO documento', a1.data.document_id, a6.ok ? a6.data.document_id : a6.err);
check('A6-rows', 'replay NO crea filas nuevas', docsBefore, docsAfter);
check('A6-net', 'replay NO altera el saldo', { CUP: 0, USD: 0 }, { CUP: Number((await net(S1)).CUP), USD: Number((await net(S1)).USD) });

// ══ CASO B — Ingresos/egresos ordinarios ══
console.log('\n═══ CASO B · Ingresos y egresos ordinarios ═══');
const IDB1 = 'idem-b1-0001';
const b1 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 1000, p_currency: 'CUP', p_justification: 'fixture: ingreso',
  p_idempotency_key: IDB1, p_user_id: U_ENCAR,
});
check('B1', 'ingreso válido 1000 CUP', true, b1.ok);
check('B1-net', 'net CUP 1000', 1000, Number((await net(S1)).CUP));

const b2 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'egreso', p_concept: 'otro_egreso',
  p_amount: 300, p_currency: 'CUP', p_justification: 'fixture: egreso',
  p_user_id: U_ENCAR,
});
check('B2', 'egreso válido 300 CUP', true, b2.ok);
check('B2-net', 'net CUP 700', 700, Number((await net(S1)).CUP));

const b3 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 50, p_currency: 'CUP', p_justification: null, p_user_id: U_ENCAR,
});
check('B3', 'justificación ausente RECHAZADA', true, !b3.ok && b3.err.includes('ERR_JUSTIFICATION_REQUIRED'));

const b4a = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 0, p_currency: 'CUP', p_justification: 'x', p_user_id: U_ENCAR,
});
check('B4a', 'importe cero RECHAZADO', true, !b4a.ok && b4a.err.includes('ERR_INVALID_AMOUNT'));
const b4b = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: -5, p_currency: 'CUP', p_justification: 'x', p_user_id: U_ENCAR,
});
check('B4b', 'importe negativo RECHAZADO', true, !b4b.ok && b4b.err.includes('ERR_INVALID_AMOUNT'));
const b4c = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10.123, p_currency: 'CUP', p_justification: 'x', p_user_id: U_ENCAR,
});
check('B4c', 'importe con 3 decimales RECHAZADO', true, !b4c.ok && b4c.err.includes('ERR_AMOUNT_PRECISION'));

const b5a = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10, p_currency: 'CUP', p_justification: 'x',
  p_operation_date: new Date(Date.now() + 86400000).toISOString(),
  p_user_id: U_ENCAR,
});
check('B5a', 'fecha futura RECHAZADA (gate global)', true, !b5a.ok && /ERR_FUTURE|posterior/.test(b5a.err));
const b5b = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10, p_currency: 'CUP', p_justification: 'x',
  p_operation_date: new Date(Date.now() - 210 * 86400000).toISOString(),
  p_user_id: U_ENCAR,
});
check('B5b', 'fecha >6 meses atrás RECHAZADA', true, !b5b.ok && /ERR_BACKDATED|6 meses/.test(b5b.err));
const b5c = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10, p_currency: 'CUP', p_justification: 'x',
  p_operation_date: new Date(Date.now() - 10 * 86400000).toISOString(),
  p_user_id: U_ENCAR,
});
check('B5c', 'fecha anterior a la apertura del turno RECHAZADA (ERR_DATE_OUTSIDE_SHIFT)', true, !b5c.ok && b5c.err.includes('ERR_DATE_OUTSIDE_SHIFT'));

const b7a = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 1000, p_currency: 'CUP', p_justification: 'fixture: ingreso',
  p_idempotency_key: IDB1, p_user_id: U_ENCAR,
});
check('B7a', 'solicitud duplicada (misma clave+payload) → replay benigno', b1.data.document_id, b7a.ok ? b7a.data.document_id : b7a.err);
const b7b = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 999, p_currency: 'CUP', p_justification: 'fixture: otro importe',
  p_idempotency_key: IDB1, p_user_id: U_ENCAR,
});
check('B7b', 'misma clave + payload DISTINTO RECHAZADO (reuse)', true, !b7b.ok && b7b.err.includes('ERR_IDEMPOTENCY_KEY_REUSE'));

const b8a = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10, p_currency: 'CUP', p_justification: 'x', p_user_id: U_OTHER,
});
check('B8a', 'usuario de OTRA tienda RECHAZADO (aislamiento multitienda)', true, !b8a.ok && b8a.err.includes('ERR_UNAUTHORIZED'));
const b8b = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'egreso', p_concept: 'entrega_efectivo',
  p_amount: 10, p_currency: 'CUP', p_justification: 'x',
  p_counterparty: 'Receptor', p_user_id: U_CLERK,
});
check('B8b', 'clerk NO puede entregar efectivo (rol de autoridad)', true, !b8b.ok && b8b.err.includes('ERR_DELIVERY_ROLE'));
const b8c = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10, p_currency: 'CUP', p_justification: 'x', p_user_id: '99999999-9999-4999-8999-999999999999',
});
check('B8c', 'usuario inexistente RECHAZADO (fail-closed)', true, !b8c.ok && b8c.err.includes('ERR_UNAUTHORIZED'));

// ══ CASO C — Monedas ══
console.log('\n═══ CASO C · Monedas (CUP/USD separados) ═══');
const c1 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 20, p_currency: 'USD', p_justification: 'fixture: USD',
  p_user_id: U_ENCAR,
});
check('C1', 'ingreso 20 USD OK (tasa elToque 480)', true, c1.ok);
check('C1-doc', 'documento USD: canónico amount_cup = 9600', 9600, Number(c1.data.amount_cup ?? (await c.query(`SELECT amount_cup FROM public.cash_flow_documents WHERE id='${c1.data.document_id}'`)).rows[0].amount_cup));
const netC = await net(S1);
check('C2', 'net por moneda SEPARADO: CUP 700 · USD 20 (sin conversión implícita)', { CUP: 700, USD: 20 }, { CUP: Number(netC.CUP), USD: Number(netC.USD) });
const sumC = await summary(S1);
check('C3', 'flujo del período por moneda (in_usd 20 · in_cup 8000)', { in_cup: 8000, in_usd: 20 }, { in_cup: Number(sumC.period.in_cup), in_usd: Number(sumC.period.in_usd) });

// ══ CASO D — Reversión y consistencia ══
console.log('\n═══ CASO D · Reversión ═══');
const netBeforeD = await net(S1);
const d1 = await rpc('reverse_cash_flow_document', {
  p_document_id: b2.data.document_id, p_reason: 'fixture: anulación del egreso 300',
  p_user_id: U_ENCAR,
});
check('D1', 'reversión del egreso 300 OK', true, d1.ok);
const netAfterD = await net(S1);
check('D1-net', 'reversión compensa EXACTAMENTE (+300 CUP, una sola vez)', Number(netBeforeD.CUP) + 300, Number(netAfterD.CUP));
const d1doc = (await c.query(`SELECT status, annulment_payment_transaction_id FROM public.cash_flow_documents WHERE id='${b2.data.document_id}'`)).rows[0];
check('D1-doc', 'documento original marcado anulado (no borrado) + contra-movimiento vinculado', { status: 'anulado', contra: true }, { status: d1doc.status, contra: d1doc.annulment_payment_transaction_id != null });
const d1contra = (await c.query(`SELECT direction, amount_cup, ref_type FROM public.payment_transactions WHERE id='${d1doc.annulment_payment_transaction_id}'`)).rows[0];
check('D1-contra', 'contra-movimiento: direction in · 300 CUP · ref cash_flow (trazabilidad)', { direction: 'in', amount: 300, ref: 'cash_flow' }, { direction: d1contra.direction, amount: Number(d1contra.amount_cup), ref: d1contra.ref_type });

const d2 = await rpc('reverse_cash_flow_document', {
  p_document_id: b2.data.document_id, p_reason: 'segundo intento',
  p_user_id: U_ENCAR,
});
check('D2', 'segundo intento de reversión RECHAZADO (sin efecto duplicado)', true, !d2.ok);
check('D2-net', 'saldo intacto tras el segundo intento', Number(netAfterD.CUP), Number((await net(S1)).CUP));

// D3: reversión concurrente (dos llamadas paralelas sobre el mismo documento)
const e1doc = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'egreso', p_concept: 'otro_egreso',
  p_amount: 100, p_currency: 'CUP', p_justification: 'fixture: para reversión concurrente',
  p_user_id: U_ENCAR,
});
const netPreD3 = await net(S1);
const [r1, r2] = await Promise.all([
  rpc('reverse_cash_flow_document', { p_document_id: e1doc.data.document_id, p_reason: 'concurrente A', p_user_id: U_ENCAR }),
  rpc('reverse_cash_flow_document', { p_document_id: e1doc.data.document_id, p_reason: 'concurrente B', p_user_id: U_ENCAR }),
]);
const oneSuccess = (r1.ok ? 1 : 0) + (r2.ok ? 1 : 0);
check('D3', 'reversión CONCURRENTE: exactamente UNA de las dos prevalece', 1, oneSuccess);
check('D3-net', 'efecto de la reversión concurrente = +100 (una vez)', Number(netPreD3.CUP) + 100, Number((await net(S1)).CUP));

// D4: egresos concurrentes que exceden el saldo CANÓNICO (fórmula v2.21.0 que
// usa el propio RPC: incluye el ingreso USD a tasa de operación). El advisory
// lock + snapshots frescos (verificado: PL/pgSQL relee lo commiteado tras la
// espera del lock) deben impedir el doble gasto.
const canonicoPre = Number((await summary(S1)).expected_cash);
const egresoAgotador = Math.round((canonicoPre - 50) * 100) / 100;
const [g1, g2] = await Promise.all([
  rpc('create_cash_flow_document', { p_store_id: S1, p_doc_type: 'egreso', p_concept: 'otro_egreso', p_amount: egresoAgotador, p_currency: 'CUP', p_justification: 'doble gasto A', p_user_id: U_ENCAR }),
  rpc('create_cash_flow_document', { p_store_id: S1, p_doc_type: 'egreso', p_concept: 'otro_egreso', p_amount: egresoAgotador, p_currency: 'CUP', p_justification: 'doble gasto B', p_user_id: U_ENCAR }),
]);
check('D4', 'doble gasto concurrente: solo UN egreso pasa (advisory lock)', 1, (g1.ok ? 1 : 0) + (g2.ok ? 1 : 0));
check('D4-net', 'canónico final tras doble gasto = 50 (no negativo)', 50, Number((await summary(S1)).expected_cash));

// ══ CASO E — Fechas y cierres ══
console.log('\n═══ CASO E · Fechas ═══');
// Fecha efectiva explícita: 2 s atrás, pero SIEMPRE posterior a la apertura
// del turno (el cert completo puede correr en pocos segundos).
const opDateRow = (await c.query(`SELECT c.created_at AS shift_start, now() AS n
  FROM public.cash_closures c WHERE c.store_id = $1 AND c.status = 'pendiente'
  ORDER BY c.created_at DESC LIMIT 1`, [S1])).rows[0];
// punto medio apertura↔ahora: SIEMPRE estrictamente dentro de la ventana del turno
const opDateExplicit = new Date((opDateRow.shift_start.getTime() + opDateRow.n.getTime()) / 2);
const e2 = await rpc('create_cash_flow_document', {
  p_store_id: S1, p_doc_type: 'ingreso', p_concept: 'otro_ingreso',
  p_amount: 10, p_currency: 'CUP', p_justification: 'fixture: fecha efectiva explícita',
  p_operation_date: opDateExplicit.toISOString(), p_user_id: U_ENCAR,
});
if (!e2.ok) console.log('   E1 ERROR:', e2.err);
const e2pt = (await c.query(`SELECT payment_date, created_at FROM public.payment_transactions WHERE ref_id='${e2.data.document_id}'`)).rows[0];
check('E1', 'fecha efectiva ≠ creación: payment_date = fecha operativa (no NOW())', true,
  e2.ok && Math.abs(new Date(e2pt.payment_date).getTime() - opDateExplicit.getTime()) < 2000
  && new Date(e2pt.created_at).getTime() > new Date(e2pt.payment_date).getTime());

// ESPEJO SQL independiente (mismas fuentes y reglas de signo/moneda que el
// RPC get_cash_currency_summary — verificación §7.1: una sola verdad).
const mirror = (await c.query(`
  WITH pt AS (
    SELECT
      COALESCE(SUM(CASE WHEN direction='in'  AND currency='CUP' THEN amount ELSE 0 END),0) AS cfi_cup,
      COALESCE(SUM(CASE WHEN direction='out' AND currency='CUP' THEN amount ELSE 0 END),0) AS cfo_cup,
      COALESCE(SUM(CASE WHEN direction='in'  AND currency='USD' THEN amount ELSE 0 END),0) AS cfi_usd,
      COALESCE(SUM(CASE WHEN direction='out' AND currency='USD' THEN amount ELSE 0 END),0) AS cfo_usd
    FROM public.payment_transactions
    WHERE store_id='${S1}' AND payment_method='cash' AND ref_type='cash_flow'
      AND payment_date > '1970-01-01' AND payment_date <= now()
  ),
  sales AS (
    SELECT
      COALESCE(SUM(COALESCE(cash_received_cup,0) - COALESCE(change_given_cup,0)),0) AS settle_cup,
      COALESCE(SUM(COALESCE(cash_received_usd,0) - COALESCE(change_given_usd,0)),0) AS settle_usd,
      COALESCE(SUM(CASE WHEN cash_received_cup IS NULL AND cash_received_usd IS NULL
        AND change_given_cup IS NULL AND change_given_usd IS NULL
        AND COALESCE(cash_amount,0) > 0 THEN cash_amount ELSE 0 END),0) AS legacy_cup
    FROM public.transactions
    WHERE store_id='${S1}' AND status='completed' AND created_at <= now()
  )
  SELECT (SELECT settle_cup + legacy_cup + cfi_cup - cfo_cup FROM sales, pt) AS mirror_cup,
         (SELECT settle_usd + cfi_usd - cfo_usd FROM sales, pt) AS mirror_usd
`)).rows[0];
const netE2 = await net(S1);
check('E2', 'libro por moneda = espejo SQL independiente (mismas fuentes y reglas)',
  { CUP: Math.round(Number(mirror.mirror_cup)), USD: Math.round(Number(mirror.mirror_usd)) },
  { CUP: Math.round(Number(netE2.CUP)), USD: Math.round(Number(netE2.USD)) });

// ══ CASO F — Integridad entre componentes ══
console.log('\n═══ CASO F · Integridad entre componentes ═══');
const docs = (await c.query(`SELECT d.id, d.status, count(pt.id)::int AS pts
  FROM public.cash_flow_documents d
  LEFT JOIN public.payment_transactions pt ON pt.ref_id = d.id AND pt.ref_type='cash_flow'
  WHERE d.store_id='${S1}' GROUP BY d.id, d.status`)).rows;
const badDocs = docs.filter(d => (d.status === 'confirmado' && d.pts !== 1) || (d.status === 'anulado' && d.pts !== 2));
check('F1', 'cada documento confirmado=1 PT · anulado=2 PT (original+contra) · sin huérfanos', 0, badDocs.length);

const netPreSale = await net(S1);
await c.query(`INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, cash_amount, sale_currency, sale_exchange_rate, cash_received_cup, change_given_cup)
  VALUES ('ccccccc1-0000-4000-8000-000000000001', '${S1}', '${U_CLERK}', 500, 'completed', 'cash', 500, 'CUP', 1, 600, 100)`);
const netSale = await net(S1);
check('F2', 'venta 500 CUP (cobro 600, vuelto 100): net CUP += 500 — contada UNA vez', Number(netPreSale.CUP) + 500, Number(netSale.CUP));
// La venta NO crea payment_transactions (los cobros de venta entran SOLO por
// transactions) — sin doble contabilización en el ledger.
const salePts = await count('payment_transactions', `transaction_id='ccccccc1-0000-4000-8000-000000000001' OR (ref_type='sale' AND ref_id='ccccccc1-0000-4000-8000-000000000001')`);
check('F2b', 'la venta no genera PT ref_type=sale (una sola contabilización)', 0, salePts);

// F3: aislamiento — S2 no ve nada de S1
const s2net = await net(S2);
check('F3', 'aislamiento multitienda: S2 net 0/0 (nada de S1)', { CUP: 0, USD: 0 }, { CUP: Number(s2net.CUP), USD: Number(s2net.USD) });
const s2docs = await count('cash_flow_documents', `store_id='${S2}'`);
check('F3b', 'S2 sin documentos', 0, s2docs);

// F4: usuario S2 intenta anular documento de S1
const d5 = await rpc('reverse_cash_flow_document', {
  p_document_id: c1.data.document_id, p_reason: 'intento desde otra tienda', p_user_id: U_OTHER,
});
check('F4', 'usuario de otra tienda NO puede anular documentos ajenos', true, !d5.ok && d5.err.includes('ERR_UNAUTHORIZED'));

// ══ RESUMEN ══
const report = { generated: new Date().toISOString(), db: 'cajamision (aislada, PG 18.4)', pass, fail, results };
writeFileSync('/home/z/my-project/scripts/cert-contable-results.json', JSON.stringify(report, null, 2));
console.log(`\n══════════════════════════════════════`);
console.log(`CERTIFICACIÓN CONTABLE: ${pass} PASS · ${fail} FAIL de ${pass + fail} comprobaciones`);
console.log(`Resultado JSON → /home/z/my-project/scripts/cert-contable-results.json`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
