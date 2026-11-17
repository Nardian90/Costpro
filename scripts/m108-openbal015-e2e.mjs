#!/usr/bin/env node
// ============================================================================
// M108 — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · BATERÍA E2E
// BD AISLADA CostproE2E (lguovmvrozxgssupkwpf) — NUNCA producción.
// Fases:
//   --setup    aplica la migración 20261118120000 al aislado + fixture fiel
//              (ventas espejo de 28e94349 / 8757444f / 8ab7becf / 68e7464d,
//              cash_flow_documents de entrega y ordinario)
//   --execute  contabiliza por el motor (regla v2) y aplica saldos iniciales
//   --verify   V1..V12: fallback físico, diferencia de cobro, entrega_efectivo
//              → activo, guard físico de caja, apertura completa/cero/dup,
//              inmutabilidad, completitud, ecuación
//   --idem     re-ejecución → 0 cambios (idempotencia del motor + guards)
//   --rollback transacción abortada deliberadamente → 0 persistencia
//   --cleanup  elimina el fixture y certifica NET DELTA = 0
// Guard assert-not-production: E2E libre; producción fail-closed.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MODE = process.argv[2] || '';
const OUT = 'scripts/out/m015';
const E2E = 'lguovmvrozxgssupkwpf';
const MIGRATION = 'supabase/migrations/20261118120000_cp_fin_015_opening_cash_usd.sql';
const MISION = 'CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015';

const ENV = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2].trim();
}
const TOKEN = ENV.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN ausente en .env');

// Fixture determinista (segmento 0e15)
// Usuario: auth.users EXISTENTE del aislado (profiles.id FK → auth.users).
const F = {
  store: '0e15a000-0000-4000-8000-000000000001',
  user: '0e15b000-0000-4000-8000-000000000001',
  worker: '0e15b000-0000-4000-8000-000000000002',
  P: (n) => `0e15c000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  S: (n) => `0e15d000-0000-4000-8000-${String(n).padStart(12, '0')}`,  // transacciones
  SI: (n) => `0e15e000-0000-4000-8000-${String(n).padStart(12, '0')}`, // items
  PT: (n) => `0e15f000-0000-4000-8000-${String(n).padStart(12, '0')}`, // payment_transactions
  CF: (n) => `0e15a000-0000-4000-8000-${String(n).padStart(12, '0')}`, // cash_flow_documents
  OB: (n) => `0e15b000-0000-4000-8000-${String(n).padStart(12, '0')}`, // fin_opening_balances
};
const results = { mision: MISION, fases: [] };
function fase(n, nombre, ok, detalle) {
  results.fases.push({ fase: n, nombre, ok, detalle });
  console.log(`${ok ? "PASS" : "FAIL"} · F${n} ${nombre} · ${JSON.stringify(detalle).slice(0,300)}`);
  if (!ok) { write(); throw new Error(`Fase F${n} fallida`); }
}
function write() {
  mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
  writeFileSync(resolve(process.cwd(), `${OUT}/e2e-resultados.json`), JSON.stringify({ ...results, generado: new Date().toISOString() }, null, 1));
}

async function q(sql, label, expectFail = false) {
  assertNotProduction({ mode: 'write', projectRef: E2E, context: `m108:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (expectFail) return { __error: text };
    throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text || '[]');
}
const one = (rows, k) => rows[0]?.[k];
const money = (x) => Number(x).toFixed(2);
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// ── SETUP ────────────────────────────────────────────────────────────────────
if (MODE === '--setup') {
  console.log('══ FASE 0 · Aplicación de la migración al aislado ══');
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
  const r0 = await q(sql, 'aplicar_migracion');
  console.log(`Migración aplicada (${r0.length} filas).`);
  const chk = await q(`SELECT (SELECT count(*) FROM public.fin_rule_versions WHERE document_type='VENTA' AND version=2 AND status='active') v2venta,
    (SELECT count(*) FROM public.fin_rule_versions WHERE document_type='FLUJO_CAJA' AND version=2 AND status='active') v2fc,
    (SELECT count(*) FROM pg_trigger WHERE tgname='fin_opening_applied_guard') trig,
    (SELECT count(*) FROM public.fin_metric_catalog WHERE metric='diferencia_cobro_debe_cup') cat;`);
  const migrOk = one(chk, 'v2venta') === 1 && one(chk, 'v2fc') === 1 && one(chk, 'trig') === 1 && one(chk, 'cat') === 1;
  fase(0, 'migración_v2_activa', migrOk, JSON.stringify(chk[0]));

  console.log('══ Fixture ══');
  const TENANT = one(await q(`SELECT id FROM public.tenants ORDER BY created_at LIMIT 1;`, 'tenant_base'), 'id');
  await q(`
BEGIN;
INSERT INTO public.stores (id, name, created_at) VALUES ('${F.store}', 'E2E-015-CAJA-USD', now())
ON CONFLICT (id) DO NOTHING;
-- Usuario auth del fixture creado AQUÍ (patrón verify-nominas-pg.mjs;
-- idempotente ON CONFLICT). Antes dependía de un usuario preexistente que la
-- pre-limpieza m108b elimina correctamente (era residuo de la sesión cortada).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('${F.user}', 'e2e015-openbal@costpro.test', 'x', now(), now(), now(), '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, role, active_store_id) VALUES
  ('${F.user}', 'e2e015-openbal@costpro.test', 'E2E 015 Admin', 'admin', '${F.store}')
ON CONFLICT (id) DO NOTHING;
-- asegurar estado activo y admin en re-ejecuciones
UPDATE public.profiles SET is_active = true, role = 'admin', active_store_id = '${F.store}' WHERE id = '${F.user}';
-- Tasa USD de la tienda (precedencia store_exchange_rates sobre la global; el
-- motor y create_cash_flow_document son fail-closed sin tasa configurada)
INSERT INTO public.store_exchange_rates (store_id, currency, rate, updated_by)
SELECT '${F.store}', 'USD', 800, '${F.user}'
WHERE NOT EXISTS (SELECT 1 FROM public.store_exchange_rates WHERE store_id = '${F.store}' AND currency = 'USD');
INSERT INTO public.products (id, store_id, tenant_id, sku, name, stock_current, cost_average, price, is_service, is_active, barcode, updated_at)
VALUES
  ('${F.P(1)}', '${F.store}', '${TENANT}', 'E2E-015-P1', 'Panel Test 640W', 10, 1.00, 170100, false, true, 'E2E-015-P1', now()),
  ('${F.P(2)}', '${F.store}', '${TENANT}', 'E2E-015-P2', 'Batería Test', 10, 1.00, 2000, false, true, 'E2E-015-P2', now()),
  ('${F.P(3)}', '${F.store}', '${TENANT}', 'E2E-015-P3', 'Kit Test', 10, 0.30, 5670, false, true, 'E2E-015-P3', now()),
  ('${F.P(4)}', '${F.store}', '${TENANT}', 'E2E-015-P4', 'Control Test', 10, 1.00, 32000, false, true, 'E2E-015-P4', now()),
  ('${F.P(5)}', '${F.store}', '${TENANT}', 'E2E-015-P5', 'Overpay Test', 10, 1.00, 15800, false, true, 'E2E-015-P5', now()),
  ('${F.P(6)}', '${F.store}', '${TENANT}', 'E2E-015-P6', 'Mixto Test', 10, 1.00, 289750, false, true, 'E2E-015-P6', now())
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'fixture_base');

  // S1 = espejo 28e94349 (sin pagos a nivel venta; cobro físico: 207 USD @810 + CUP 2,000; total 177,770)
  // S2 = control 8757444f (pago USD 40 @800 registrado a nivel venta; total 32,000)
  // S3 = 8ab7becf (exceso 200; total 15,800; pago CUP 16,000)
  // S4 = 68e7464d (mixto mal clasificado: solo para MÉTRICAS, no se contabiliza)
  // Flujo REAL de la app (lección del residuo de la sesión cortada): el trigger
  // fin_trg_transactions auto-postea la VENTA en cuanto status='completed'. Si se
  // inserta la venta YA completada, el posteo ocurre ANTES de insertar los pagos →
  // métricas incompletas (patrón del bug de producción 68e7464d/23ccd04f). Orden
  // correcto: venta 'pending' → items → payment_transactions → UPDATE completed.
  await q(`
BEGIN;
INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, created_at, completed_at,
  payment_method, cash_amount, sale_currency, sale_exchange_rate)
VALUES
  ('${F.S(1)}', '${F.store}', '${F.user}', 177770.00, 'pending', '2026-10-19 12:00:00+00', NULL, 'cash', 169670, 'CUP', 1.0),
  ('${F.S(2)}', '${F.store}', '${F.user}', 32000.00, 'pending', '2026-10-26 15:07:20+00', NULL, 'cash', 0, 'CUP', 1.0),
  ('${F.S(3)}', '${F.store}', '${F.user}', 15800.00, 'pending', '2026-10-16 15:00:00+00', NULL, 'cash', 16000, 'CUP', 1.0),
  ('${F.S(4)}', '${F.store}', '${F.user}', 289750.00, 'pending', '2026-10-17 12:00:00+00', NULL, 'cash', 289750, 'CUP', 1.0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.transaction_items (id, transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup,
  cost_at_sale, cash_currency, cash_paid, exchange_rate, currency, created_at) VALUES
  ('${F.SI(1)}', '${F.S(1)}', '${F.P(3)}', 1, 7, 5670, 0.3007518796992481, 'USD', 7, 810, 'USD', '2026-10-19 12:00:00+00'),
  ('${F.SI(2)}', '${F.S(1)}', '${F.P(2)}', 1, 2000, 2000, 1.0, 'CUP', 2000, 1, 'CUP', '2026-10-19 12:00:00+00'),
  ('${F.SI(3)}', '${F.S(1)}', '${F.P(1)}', 1, 210, 170100, 1.0, 'USD', 200, 810, 'USD', '2026-10-19 12:00:00+00'),
  ('${F.SI(4)}', '${F.S(2)}', '${F.P(4)}', 1, 40, 32000, 1.0, 'USD', 40, 800, 'USD', '2026-10-26 15:07:20+00'),
  ('${F.SI(5)}', '${F.S(3)}', '${F.P(5)}', 1, 20, 15800, 1.0, NULL, NULL, NULL, 'USD', '2026-10-16 15:00:00+00'),
  ('${F.SI(6)}', '${F.S(4)}', '${F.P(6)}', 1, 150, 120750, 1.0, 'USD', 150, 805, 'USD', '2026-10-17 12:00:00+00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.payment_transactions (id, store_id, ref_type, ref_id, amount, payment_method, currency,
  exchange_rate, direction, payment_date, paid_by, transaction_id) VALUES
  ('${F.PT(2)}', '${F.store}', 'sale', '${F.S(2)}', 40, 'cash', 'USD', 800, 'in', '2026-10-26 15:07:20+00', '${F.user}', '${F.S(2)}'),
  ('${F.PT(3)}', '${F.store}', 'sale', '${F.S(3)}', 16000, 'cash', 'CUP', 1, 'in', '2026-10-16 15:00:00+00', '${F.user}', '${F.S(3)}')
ON CONFLICT (id) DO NOTHING;
-- Completar DESPUÉS de los pagos (dispara fin_trg_transactions con datos completos).
-- S4 permanece 'pending': su rol en la batería es SOLO de métricas (V6/V7).
UPDATE public.transactions SET status = 'completed', completed_at = created_at
WHERE id IN ('${F.S(1)}', '${F.S(2)}', '${F.S(3)}');
INSERT INTO public.cash_flow_documents (id, store_id, document_number, doc_type, concept, amount, currency,
  exchange_rate, payment_method, operation_date, status, responsible_user_id, counterparty, justification, created_by, confirmed_by)
VALUES
  ('${F.CF(1)}', '${F.store}', 'IE-E2E015-USD', 'egreso', 'entrega_efectivo', 100, 'USD', 800, 'cash',
   '2026-10-23 12:00:00+00', 'confirmado', '${F.user}', 'Belkis', 'Entrega para ingresar al banco (fixture)', '${F.user}', '${F.user}'),
  ('${F.CF(2)}', '${F.store}', 'IE-E2E015-CUP', 'egreso', 'otro_egreso', 500, 'CUP', 1, 'cash',
   '2026-10-23 12:00:00+00', 'confirmado', '${F.user}', 'Local', 'Gasto ordinario (fixture)', '${F.user}', '${F.user}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'fixture_documentos');
  fase(0.5, 'fixture_creado', true, 'store + profiles + 6 productos + 4 ventas + 9 items + 2 pagos + 2 flujos (auto-posteo por trigger)');
  write();
  process.exit(0);
}

// ── EXECUTE ──────────────────────────────────────────────────────────────────
if (MODE === '--execute') {
  // El motor auto-postea por triggers (fin_trg_transactions / fin_trg_cash_flow_documents)
  // al completar los documentos del fixture. Esta fase CERTIFICA el auto-posteo:
  // 5 asientos presentes y 0 errores de posteo para los documentos objetivo.
  console.log('══ Certificación del auto-posteo (regla v2) ══');
  const docs = [
    ['VENTA', F.S(1), 'S1_mixto_carve'], ['VENTA', F.S(2), 'S2_control'],
    ['VENTA', F.S(3), 'S3_exceso'], ['FLUJO_CAJA', F.CF(1), 'CF1_entrega_usd'],
    ['FLUJO_CAJA', F.CF(2), 'CF2_ordinario'],
  ];
  const entries = {};
  for (const [dt, id, label] of docs) {
    const e = one(await q(`SELECT id FROM public.fin_entries WHERE document_type='${dt}' AND document_id='${id}' AND event='reconocimiento'`, `entry_${label}`), 'id');
    entries[label] = e;
    console.log(`${label}: ${e ?? 'AUSENTE'}`);
  }
  const errs = one(await q(`SELECT count(*) n FROM public.fin_posting_errors WHERE store_id='${F.store}'`, 'posting_errors'), 'n');
  const nAll = Object.values(entries).filter(Boolean).length;
  if (nAll !== 5 || Number(errs) !== 0) throw new Error(`Auto-posteo incompleto: ${nAll}/5 asientos, ${errs} errores de posteo`);
  console.log(`Auto-posteo certificado: 5/5 asientos · fin_posting_errors=0`);
  results.auto_posteo = entries;
  write();
  process.exit(0);
}

// ── VERIFY ───────────────────────────────────────────────────────────────────
if (MODE === '--verify') {
  const mvs = (entry) => q(`SELECT category_code, sense, round(amount_cup,2) a FROM public.fin_movements WHERE entry_id='${entry}' ORDER BY category_code, sense;`, `movs_${entry.slice(0,8)}`);

  console.log('══ V1 · S1 (carve físico + diferencia) ══');
  const e1 = one(await q(`SELECT id FROM public.fin_entries WHERE document_id='${F.S(1)}' AND event='reconocimiento'`, 'e_S1'), 'id');
  const v1 = await mvs(e1);
  const map = (rows) => Object.fromEntries(rows.map((r) => [`${r.category_code}:${r.sense}`, Number(r.a)]));
  const m1 = map(v1);
  const ok1 = eq(m1['ACT_EFECTIVO_USD:debito'], 167670) && eq(m1['ACT_EFECTIVO_CUP:debito'], 2000)
    && eq(m1['ING_DESCUENTOS:debito'], 8100) && eq(m1['ING_VENTAS:credito'], 177770)
    && eq(m1['GAS_COSTO_VENTAS:debito'], 2.30) && eq(m1['ACT_INVENTARIO:credito'], 2.30);
  fase(1, 'S1_carve_y_diferencia', ok1, JSON.stringify(m1));

  console.log('══ V2 · S2 control (pago USD a nivel venta: sin override) ══');
  const e2 = one(await q(`SELECT id FROM public.fin_entries WHERE document_id='${F.S(2)}'`, 'e_S2'), 'id');
  const m2 = map(await mvs(e2));
  const ok2 = eq(m2['ACT_EFECTIVO_USD:debito'], 32000) && eq(m2['ING_VENTAS:credito'], 32000)
    && m2['ING_DESCUENTOS:debito'] === undefined && m2['ING_DESCUENTOS:credito'] === undefined;
  fase(2, 'S2_control_sin_cambios', ok2, JSON.stringify(m2));

  console.log('══ V3 · S3 exceso aceptado (ING_DESCUENTOS crédito 200) ══');
  const e3 = one(await q(`SELECT id FROM public.fin_entries WHERE document_id='${F.S(3)}'`, 'e_S3'), 'id');
  const m3 = map(await mvs(e3));
  const ok3 = eq(m3['ACT_EFECTIVO_CUP:debito'], 16000) && eq(m3['ING_VENTAS:credito'], 15800)
    && eq(m3['ING_DESCUENTOS:credito'], 200);
  fase(3, 'S3_exceso_credito', ok3, JSON.stringify(m3));

  console.log('══ V4 · CF1 entrega_efectivo USD → ACT_OTROS_CORR (no gasto) ══');
  const e4 = one(await q(`SELECT id FROM public.fin_entries WHERE document_id='${F.CF(1)}'`, 'e_CF1'), 'id');
  const m4 = map(await mvs(e4));
  const ok4 = eq(m4['ACT_OTROS_CORR:debito'], 80000) && eq(m4['ACT_EFECTIVO_USD:credito'], 80000)
    && m4['GAS_OTROS_OPER:debito'] === undefined;
  fase(4, 'entrega_efectivo_activo', ok4, JSON.stringify(m4));

  console.log('══ V5 · CF2 egreso ordinario → GAS_OTROS_OPER (sin cambios) ══');
  const e5 = one(await q(`SELECT id FROM public.fin_entries WHERE document_id='${F.CF(2)}'`, 'e_CF2'), 'id');
  const m5 = map(await mvs(e5));
  const ok5 = eq(m5['GAS_OTROS_OPER:debito'], 500) && eq(m5['ACT_EFECTIVO_CUP:credito'], 500);
  fase(5, 'egreso_ordinario_gasto', ok5, JSON.stringify(m5));

  console.log('══ V6 · métricas S4 (mixto mal clasificado, solo lectura) ══');
  const s4 = await q(`SELECT (metrics ->> 'cob_cash_cup') ccup, (metrics ->> 'cob_cash_usd_cup') cusd,
    (metrics ->> 'fuente_efectivo') fuente
    FROM (SELECT public.fin_compute_metrics('VENTA', '${F.S(4)}', 'reconocimiento', NULL) AS metrics) t;`, 'metrics_S4');
  const ok6 = eq(one(s4, 'ccup'), 169000) && eq(one(s4, 'cusd'), 120750) && one(s4, 'fuente') === 'carve_items';
  fase(6, 'S4_metrics_carve', ok6, JSON.stringify(s4[0]));

  console.log('══ V7 · guard físico de caja (entrega USD sin billetes suficientes) ══');
  // firma: (store, doc_type, concept, amount, currency, rate, date, counterparty,
  //         justification, notes, related_document_id, idempotency_key, user_id)
  // Actor por claim.sub (patrón canónico run_postgres_validation.sh).
  // entrega_efectivo es la ÚNICA operación válida FUERA de turno (misión caja
  // D4) y su validación es contra el SALDO FÍSICO del libro en la moneda —
  // «con o sin turno, el cajón es el cajón»: el guard más relevante para M-015.
  const guard = await q(`BEGIN;
    SELECT set_config('request.jwt.claim.sub', '${F.user}', true);
    SELECT public.create_cash_flow_document('${F.store}', 'egreso', 'entrega_efectivo', 999999, 'USD', 800, NULL, 'Belkis', 'sin billetes suficientes (test guard)', 'test guard', NULL, NULL, '${F.user}') AS r;
    COMMIT;`, 'guard_caja', true);
  const ok7 = guard.__error && guard.__error.includes('ERR_INSUFFICIENT_CURRENCY');
  fase(7, 'guard_caja_fisica', !!ok7, ok7 ? 'ERR_INSUFFICIENT_CURRENCY' : (guard.__error || 'no falló'));

  console.log('══ V8 · saldo inicial USD completo (create → apply) ══');
  await q(`INSERT INTO public.fin_opening_balances (id, store_id, category_code, amount, currency, exchange_rate, amount_cup, as_of_date, notes, created_by)
    VALUES ('${F.OB(1)}', '${F.store}', 'ACT_EFECTIVO_USD', 367, 'USD', 800, 293600, '2026-06-30',
    'Fondo USD existente al 30-06 (arqueo documentado)', '${F.user}') ON CONFLICT (id) DO NOTHING;`, 'ob1_insert');
  const ob1 = await q(`BEGIN; SELECT set_config('request.jwt.claim.sub', '${F.user}', true); SELECT public.fin_apply_opening_balance('${F.OB(1)}', '${F.user}') AS r; COMMIT;`, 'ob1_apply');
  const ob1r = ob1[0]?.r;
  const ob1mov = await q(`SELECT m.sense, m.amount, m.currency_origin, m.exchange_rate FROM public.fin_movements m WHERE m.entry_id='${ob1r?.entry_id}';`, 'ob1_movs');
  let ok8 = ob1r?.status === 'success' && ob1mov.length === 1 && ob1mov[0].sense === 'debito'
    && eq(ob1mov[0].amount, 367) && ob1mov[0].currency_origin === 'USD' && eq(ob1mov[0].exchange_rate, 800);
  // Contrapartida patrimonial de la apertura (la ecuación exige el par activo↔PAT_CAPITAL)
  const ob2ins = await q(`INSERT INTO public.fin_opening_balances (store_id, category_code, amount, currency, amount_cup, as_of_date, notes, created_by)
    VALUES ('${F.store}', 'PAT_CAPITAL', 293600, 'CUP', 293600, '2026-06-30',
    'Contrapartida patrimonial del fondo USD de apertura (fixture)', '${F.user}') RETURNING id;`, 'ob2_insert');
  const ob2Id = one(ob2ins, 'id');
  const ob2 = one(await q(`BEGIN; SELECT set_config('request.jwt.claim.sub', '${F.user}', true); SELECT public.fin_apply_opening_balance('${ob2Id}', '${F.user}') AS r; COMMIT;`, 'ob2_apply'), 'r');
  ok8 = ok8 && ob2?.status === 'success';
  fase(8, 'apertura_usd_aplicada', ok8, JSON.stringify({ r: ob1r, movs: ob1mov }));

  console.log('══ V9 · duplicado + cero sin notas + inmutabilidad ══');
  const dup = await q(`INSERT INTO public.fin_opening_balances (store_id, category_code, amount, currency, exchange_rate, amount_cup, as_of_date, created_by)
    VALUES ('${F.store}', 'ACT_EFECTIVO_USD', 10, 'USD', 800, 8000, '2026-06-30', '${F.user}') RETURNING id;`, 'ob_dup', true);
  const ok9a = dup.__error && dup.__error.includes('23505');
  const zeroSinNotas = await q(`INSERT INTO public.fin_opening_balances (store_id, category_code, amount, currency, amount_cup, as_of_date, created_by)
    VALUES ('${F.store}', 'ACT_BANCOS', 0, 'CUP', 0, '2026-06-30', '${F.user}') RETURNING id;`, 'ob_zero_sin_notas');
  const zeroId = one(zeroSinNotas, 'id');
  const zeroFail = await q(`BEGIN; SELECT set_config('request.jwt.claim.sub', '${F.user}', true); SELECT public.fin_apply_opening_balance('${zeroId}', '${F.user}') AS r; COMMIT;`, 'ob_zero_sin_notas_apply', true);
  const ok9b = zeroFail.__error && zeroFail.__error.includes('ERR_OPENING_ZERO_NEEDS_NOTES');
  const immut = await q(`UPDATE public.fin_opening_balances SET amount = 500 WHERE id = '${F.OB(1)}' RETURNING id;`, 'ob_inmutable', true);
  const ok9c = immut.__error && immut.__error.includes('ERR_OPENING_APPLIED_IMMUTABLE');
  fase(9, 'dup_cero_sin_notas_inmutabilidad', ok9a && ok9b && ok9c,
    `dup=${ok9a} ceroSinNotas=${ok9b} inmutable=${ok9c}`);

  console.log('══ V10 · declaración en cero (con notas) + completitud ══');
  const zero = await q(`UPDATE public.fin_opening_balances SET notes = 'Sin saldos preexistentes: sin ventas, pagos ni flujo de caja anterior al 01-07 (verificado)' WHERE id = '${zeroId}' RETURNING id;`, 'ob_zero_notas');
  const zeroR = one(await q(`BEGIN; SELECT set_config('request.jwt.claim.sub', '${F.user}', true); SELECT public.fin_apply_opening_balance('${zeroId}', '${F.user}') AS r; COMMIT;`, 'ob_zero_apply'), 'r');
  const zeroMovs = one(await q(`SELECT count(*) n FROM public.fin_movements WHERE entry_id='${zeroR.entry_id}';`, 'ob_zero_movs'), 'n');
  const bs = await q(`SELECT (public.fin_get_balance_sheet('${F.store}', '2026-11-17', '${F.user}') -> 'completitud') AS c;`, 'completitud');
  const comp = bs[0]?.c;
  const ok10 = zeroR?.status === 'success' && zeroR?.cero === true && Number(zeroMovs) === 0
    && comp?.sin_apertura === false && comp?.apertura_tardia === false
    && comp?.primera_apertura === '2026-06-30';
  fase(10, 'declaracion_cero_y_completitud', ok10, JSON.stringify({ zeroR, movs: zeroMovs, comp }));

  console.log('══ V11 · ecuación contable del balance ══');
  const ec = one(await q(`SELECT (public.fin_get_balance_sheet('${F.store}', '2026-11-17', '${F.user}') -> 'ecuacion') AS e;`, 'ecuacion'), 'e');
  const ok11 = ec?.equilibrado === true && Math.abs(Number(ec?.diferencia ?? 1)) < 0.01;
  fase(11, 'ecuacion_cuadrada', ok11, JSON.stringify(ec));

  console.log('══ V12 · idempotencia de la contabilización ══');
  const e1b = one(await q(`SELECT public.fin_post_document('VENTA', '${F.S(1)}', 'reconocimiento', NULL, '${F.user}') AS entry;`, 'post_S1_re'), 'entry');
  const nEntries = one(await q(`SELECT count(*) n FROM public.fin_entries WHERE store_id='${F.store}';`, 'n_entries'), 'n');
  const ok12 = e1b === null && Number(nEntries) === 8; // S1,S2,S3,CF1,CF2,OB1,OB-PAT,OB-zero
  fase(12, 'idempotencia_motor', ok12, `re-post=${e1b} entries=${nEntries}`);
  write();
  process.exit(0);
}

// ── ROLLBACK ─────────────────────────────────────────────────────────────────
if (MODE === '--rollback') {
  const pre = one(await q(`SELECT count(*) n FROM public.fin_entries WHERE store_id='${F.store}';`, 'pre_rollback'), 'n');
  const rb = await q(`
BEGIN;
SELECT public.fin_post_document('VENTA', '${F.S(1)}', 'reconocimiento', NULL, '${F.user}');
RAISE EXCEPTION 'ABORT_DELIBERADO_M108';
COMMIT;`, 'rollback_abort', true);
  const post = one(await q(`SELECT count(*) n FROM public.fin_entries WHERE store_id='${F.store}';`, 'post_rollback'), 'n');
  const ok = pre === post && rb.__error && rb.__error.includes('ABORT_DELIBERADO_M108');
  fase(13, 'rollback_0_persistencia', ok, `entries pre=${pre} post=${post}`);
  write();
  process.exit(0);
}

// ── CLEANUP ──────────────────────────────────────────────────────────────────
if (MODE === '--cleanup') {
  const pre = await q(`
SELECT (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') ents,
       (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') movs,
       (SELECT count(*) FROM public.transactions WHERE store_id='${F.store}') txs,
       (SELECT count(*) FROM public.cash_flow_documents WHERE store_id='${F.store}') cfs,
       (SELECT count(*) FROM public.fin_opening_balances WHERE store_id='${F.store}') obs,
       (SELECT count(*) FROM public.products WHERE store_id='${F.store}') prods,
       (SELECT count(*) FROM public.stores WHERE id='${F.store}') stores,
       (SELECT count(*) FROM public.profiles WHERE id='${F.user}') profs,
       (SELECT count(*) FROM auth.users WHERE id='${F.user}') ausers,
       (SELECT count(*) FROM public.fin_posting_errors WHERE store_id='${F.store}') perrs,
       (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') audits;`, 'pre_cleanup');
  console.log('Pre-cleanup:', JSON.stringify(pre[0]));

  await q(`
BEGIN;
-- RPC oficiales E2E (profiles/auth.users tienen guards de borrado físico;
-- payment_transactions exige app.restore_mode): mecanismo canónico del repo.
SELECT public.e2e_hard_delete_store('${F.store}');
SELECT public.e2e_hard_delete_user('${F.user}');
DELETE FROM public.store_exchange_rates WHERE store_id='${F.store}';
DELETE FROM public.fin_movements WHERE store_id='${F.store}';
DELETE FROM public.fin_entries WHERE store_id='${F.store}';
DELETE FROM public.fin_opening_balances WHERE store_id='${F.store}';
DELETE FROM public.fin_posting_errors WHERE store_id='${F.store}';
DELETE FROM public.audit_logs WHERE store_id='${F.store}';
COMMIT;`, 'cleanup');

  const post = await q(`
SELECT (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') ents,
       (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') movs,
       (SELECT count(*) FROM public.transactions WHERE store_id='${F.store}') txs,
       (SELECT count(*) FROM public.cash_flow_documents WHERE store_id='${F.store}') cfs,
       (SELECT count(*) FROM public.fin_opening_balances WHERE store_id='${F.store}') obs,
       (SELECT count(*) FROM public.products WHERE store_id='${F.store}') prods,
       (SELECT count(*) FROM public.stores WHERE id='${F.store}') stores,
       (SELECT count(*) FROM public.profiles WHERE id='${F.user}') profs,
       (SELECT count(*) FROM auth.users WHERE id='${F.user}') ausers,
       (SELECT count(*) FROM public.fin_posting_errors WHERE store_id='${F.store}') perrs,
       (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') audits;`, 'post_cleanup');
  const p = post[0];
  const ok = Object.values(p).every((v) => Number(v) === 0);
  fase(14, 'cleanup_NET_DELTA_0', ok, JSON.stringify(p));
  write();
  process.exit(0);
}

console.log('Uso: node scripts/m108-openbal015-e2e.mjs [--setup|--execute|--verify|--rollback|--cleanup]');
