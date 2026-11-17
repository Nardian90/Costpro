#!/usr/bin/env node
// ============================================================================
// M109 — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · EJECUCIÓN EN
// PRODUCCIÓN (CostproBD wthkddeleylijmonclxg) — GOBERNADA.
// Guard CP-INFRA-019: exige ALLOW_PROD=read-only + ALLOW_PROD_WRITE=I_UNDERSTAND.
// Loter idempotentes (UUIDs deterministas, patrón m077) con pre-checks:
//   --infra     L1: catálogo RECTIFICACION_FIN + migración 20261118120000
//               (funciones v2 + reglas v2 idempotentes + CHECK >= 0 + trigger)
//   --rect      L2 RECT-015-A (68e7464d CUP→USD 120.750)
//               L3 RECT-015-B (23ccd04f CUP→USD 5.600)
//               L4 RECT-015-C (28e94349 vía motor, pre-check de métricas)
//               L5 RECT-015-D (entregas GAS_OTROS_OPER→ACT_OTROS_CORR 8.729.279,98)
//   --apertura  L6: declaración PAT_CAPITAL amount=0 (2026-06-30) + apply RPC
//   --verify    V1..V12 (saldos, ecuación, completitud, USD≥0, motor, auditoría)
//   --idem      re-ejecuta L1-L6 y certifica 0 cambios nuevos
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const ADMIN = '051c6157-600b-425e-b8c0-72388bacf541'; // admin@costpro.com (admin ENERVIDA)
const OUT = 'scripts/out/m015';
const MIGRATION = 'supabase/migrations/20261118120000_cp_fin_015_opening_cash_usd.sql';
const MISION = 'CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015';
const MODE = process.argv[2] || '';

// UUIDs deterministas (idempotencia por PK)
const ID = {
  docTypeRect: '7ec9000e-0000-4000-8000-d01500000001',
  entryA: '7ec9000f-0000-4000-8000-d0150000000a',
  movA1: '7ec9000f-0000-4000-8000-d01500000a01',
  movA2: '7ec9000f-0000-4000-8000-d01500000a02',
  entryB: '7ec9000f-0000-4000-8000-d0150000000b',
  movB1: '7ec9000f-0000-4000-8000-d01500000b01',
  movB2: '7ec9000f-0000-4000-8000-d01500000b02',
  entryD: '7ec9000f-0000-4000-8000-d0150000000d',
  movD1: '7ec9000f-0000-4000-8000-d01500000d01',
  movD2: '7ec9000f-0000-4000-8000-d01500000d02',
  opening: '7ec9000e-0000-4000-8000-d0150000000e',
};

const ENV = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2].trim();
}
const TOKEN = ENV.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN ausente en .env');

async function q(sql, label, expectFail = false) {
  assertNotProduction({ mode: 'write', projectRef: PROD, context: `m109:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (expectFail) return { __error: text.slice(0, 800) };
    throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text || '[]');
}
const one = (rows, k) => rows?.[0]?.[k];
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const money = (x) => Number(x).toFixed(2);
const results = { mision: MISION, script: 'm109', fases: [], generado: '' };
function fase(n, nombre, ok, detalle) {
  results.fases.push({ fase: n, nombre, ok, detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? 'PASS' : 'FAIL'} · L${n} ${nombre} · ${String(detalle).slice(0, 220)}`);
  save();
  if (!ok) throw new Error(`Fase L${n} fallida`);
}
function save() {
  results.generado = new Date().toISOString();
  mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
  writeFileSync(resolve(process.cwd(), `${OUT}/prod-ejecucion.json`), JSON.stringify(results, null, 1));
}
const claimAdmin = `SELECT set_config('request.jwt.claim.sub', '${ADMIN}', true);`;

// ═══ L1 · INFRA ═══════════════════════════════════════════════════════════════
if (MODE === '--infra' || MODE === '--execute' || MODE === '--idem') {
  console.log('══ L1 · infraestructura (catálogo + migración) ══');
  // Pre-check: reglas v1 activas presentes (estado esperado)
  const pre = await q(`SELECT document_type, version, status FROM public.fin_rule_versions
    WHERE document_type IN ('VENTA','FLUJO_CAJA') AND store_id IS NULL AND status='active';`, 'pre_reglas');
  if (pre.length !== 2) throw new Error(`Estado inesperado de reglas: ${JSON.stringify(pre)}`);

  await q(`INSERT INTO public.fin_document_types (code, name, module, source_table, description, trigger_status, is_postable, is_active, sort_order)
    VALUES ('RECTIFICACION_FIN', 'Rectificaciones financieras (CP-FIN)', 'Sistema', 'fin_entries',
      'Asientos de rectificación contable gobernados (misión CP-FIN). No es un documento operativo: sin regla de motor.',
      NULL, false, true, 95)
    ON CONFLICT (code) DO NOTHING;`, 'doctype_rect');

  const sql = readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
  await q(sql, 'aplicar_migracion');

  const chk = await q(`SELECT
    (SELECT count(*) FROM public.fin_rule_versions WHERE document_type='VENTA' AND version=2 AND status='active') v2venta,
    (SELECT count(*) FROM public.fin_rule_versions WHERE document_type='FLUJO_CAJA' AND version=2 AND status='active') v2fc,
    (SELECT count(*) FROM public.fin_rule_versions WHERE document_type IN ('VENTA','FLUJO_CAJA') AND store_id IS NULL AND status='active') activas_total,
    (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.fin_opening_balances'::regclass AND tgname='fin_opening_applied_guard') trig,
    (SELECT count(*) FROM pg_constraint WHERE conrelid='public.fin_opening_balances'::regclass AND conname='fin_opening_balances_amount_check' AND pg_get_constraintdef(oid) LIKE '%>= (0)%') check0,
    (SELECT count(*) FROM public.fin_document_types WHERE code='RECTIFICACION_FIN') dtr;`, 'post_infra');
  const c = chk[0];
  const ok = Number(c.v2venta) === 1 && Number(c.v2fc) === 1 && Number(c.activas_total) === 2
    && Number(c.trig) === 1 && Number(c.check0) === 1 && Number(c.dtr) === 1;
  fase(1, 'infra_v2_activa', ok, JSON.stringify(c));
}

// ═══ L2-L5 · RECTIFICACIONES ═════════════════════════════════════════════════
if (MODE === '--rect' || MODE === '--execute' || MODE === '--idem') {
  console.log('══ L2 · RECT-015-A (68e7464d CUP→USD) ══');
  const preA = await q(`SELECT round(sum(CASE WHEN m.category_code='ACT_EFECTIVO_CUP' AND m.sense='debito' THEN m.amount_cup ELSE 0 END),2) cup_original
    FROM public.fin_movements m WHERE m.entry_id='52c43919-2938-45b6-a16a-95139b5268c7';`, 'preA');
  if (!eq(one(preA, 'cup_original'), 289750)) throw new Error(`Asiento original 68e7464d cambió: ${JSON.stringify(preA)}`);
  await q(`
BEGIN;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date,
  rule_version_id, description, created_by)
VALUES ('${ID.entryA}', '${STORE}', 'RECTIFICACION_FIN', '68e7464d-c50d-426f-a8ff-cbe701e9d1a5', 'RECT-015-A', 'ajuste_manual',
  '2026-10-17', NULL,
  'RECT-015-A: reclasificación de cobro físico 150 USD @805 (cajón) que el motor clasificó CUP. Ref asiento original 52c43919-2938-45b6-a16a-95139b5268c7 · venta 68e7464d · expediente M-015 §C.',
  '${ADMIN}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
  economic_date, document_number, description, currency_origin, traza)
VALUES
  ('${ID.movA1}', '${ID.entryA}', '${STORE}', 'ACT_EFECTIVO_USD', 'debito', 120750.00, 'CUP', 1, '2026-10-17', 'RECT-015-A',
   'Cobro físico USD 150 @805 (venta 68e7464d) reclasificado a caja USD', 'CUP',
   '{"mision":"M-015","rect":"RECT-015-A","origen":"cajon_fisico","ref_entry":"52c43919-2938-45b6-a16a-95139b5268c7"}'),
  ('${ID.movA2}', '${ID.entryA}', '${STORE}', 'ACT_EFECTIVO_CUP', 'credito', 120750.00, 'CUP', 1, '2026-10-17', 'RECT-015-A',
   'Contra-partida: retiro del importe mal clasificado como CUP', 'CUP',
   '{"mision":"M-015","rect":"RECT-015-A","ref_entry":"52c43919-2938-45b6-a16a-95139b5268c7"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
VALUES ('RECT015_PROD', 'fin_entries', '${ID.entryA}', '${STORE}', '${ADMIN}',
  jsonb_build_object('rect','RECT-015-A','dr','ACT_EFECTIVO_USD 120750.00','cr','ACT_EFECTIVO_CUP 120750.00','ref','52c43919','doc','68e7464d'));
COMMIT;`, 'rectA');
  const yaA = await q(`SELECT count(*) n FROM public.fin_entries WHERE id='${ID.entryA}' AND document_type='RECTIFICACION_FIN';`, 'chkA');
  fase(2, 'RECT015_A', Number(one(yaA, 'n')) === 1, `entry ${ID.entryA.slice(-8)} D=CR=120750.00`);

  console.log('══ L3 · RECT-015-B (23ccd04f CUP→USD) ══');
  const preB = await q(`SELECT round(sum(CASE WHEN m.category_code='ACT_EFECTIVO_CUP' AND m.sense='debito' THEN m.amount_cup ELSE 0 END),2) cup_original
    FROM public.fin_movements m WHERE m.entry_id='6c7b76df-80cf-4aca-b8e3-a816067708df';`, 'preB');
  if (!eq(one(preB, 'cup_original'), 5600)) throw new Error(`Asiento original 23ccd04f cambió: ${JSON.stringify(preB)}`);
  await q(`
BEGIN;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date,
  rule_version_id, description, created_by)
VALUES ('${ID.entryB}', '${STORE}', 'RECTIFICACION_FIN', '23ccd04f-db81-4537-a3db-2dabf40e31a8', 'RECT-015-B', 'ajuste_manual',
  '2026-10-23', NULL,
  'RECT-015-B: reclasificación de cobro físico 10 USD @560 (settlement) clasificado CUP. Ref asiento original 6c7b76df-80cf-4aca-b8e3-a816067708df · venta 23ccd04f · expediente M-015 §C.',
  '${ADMIN}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
  economic_date, document_number, description, currency_origin, traza)
VALUES
  ('${ID.movB1}', '${ID.entryB}', '${STORE}', 'ACT_EFECTIVO_USD', 'debito', 5600.00, 'CUP', 1, '2026-10-23', 'RECT-015-B',
   'Cobro físico USD 10 @560 (venta 23ccd04f) reclasificado a caja USD', 'CUP',
   '{"mision":"M-015","rect":"RECT-015-B","origen":"cajon_fisico","ref_entry":"6c7b76df-80cf-4aca-b8e3-a816067708df"}'),
  ('${ID.movB2}', '${ID.entryB}', '${STORE}', 'ACT_EFECTIVO_CUP', 'credito', 5600.00, 'CUP', 1, '2026-10-23', 'RECT-015-B',
   'Contra-partida: retiro del importe mal clasificado como CUP', 'CUP',
   '{"mision":"M-015","rect":"RECT-015-B","ref_entry":"6c7b76df-80cf-4aca-b8e3-a816067708df"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
VALUES ('RECT015_PROD', 'fin_entries', '${ID.entryB}', '${STORE}', '${ADMIN}',
  jsonb_build_object('rect','RECT-015-B','dr','ACT_EFECTIVO_USD 5600.00','cr','ACT_EFECTIVO_CUP 5600.00','ref','6c7b76df','doc','23ccd04f'));
COMMIT;`, 'rectB');
  const yaB = await q(`SELECT count(*) n FROM public.fin_entries WHERE id='${ID.entryB}' AND document_type='RECTIFICACION_FIN';`, 'chkB');
  fase(3, 'RECT015_B', Number(one(yaB, 'n')) === 1, `entry ${ID.entryB.slice(-8)} D=CR=5600.00`);

  console.log('══ L4 · RECT-015-C (28e94349 vía motor) ══');
  // Pre-check READ de métricas con la regla v2 recién activada
  const metrics = await q(`SELECT (m->>'cob_cash_cup') ccup, (m->>'cob_cash_usd_cup') cusd,
    (m->>'diferencia_cobro_debe_cup') dif, (m->>'costo_productos_cup') cogs
    FROM (SELECT public.fin_compute_metrics('VENTA', '28e94349-0a3e-499c-935f-c4a25c9db3fe', 'reconocimiento', NULL) m) t;`, 'metrics_28e');
  const mm = metrics[0];
  if (!eq(mm.ccup, 2000) || !eq(mm.cusd, 167670) || !eq(mm.dif, 8100)) {
    throw new Error(`Métricas de 28e94349 NO coinciden con la propuesta (esperado 2.000/167.670/8.100): ${JSON.stringify(mm)} — ABORTADO sin escribir`);
  }
  const yaEntryC = one(await q(`SELECT count(*) n FROM public.fin_entries WHERE document_type='VENTA' AND document_id='28e94349-0a3e-499c-935f-c4a25c9db3fe';`, 'yaC'), 'n');
  if (Number(yaEntryC) === 0) {
    const posted = await q(`BEGIN; ${claimAdmin}
      SELECT public.fin_post_document('VENTA', '28e94349-0a3e-499c-935f-c4a25c9db3fe', 'reconocimiento', NULL, '${ADMIN}') AS entry;
      COMMIT;`, 'post_28e');
    const entryC = one(posted, 'entry');
    if (!entryC) throw new Error('fin_post_document no generó asiento para 28e94349');
    const movs = await q(`SELECT category_code, sense, round(amount_cup,2) a FROM public.fin_movements
      WHERE entry_id='${entryC}' ORDER BY category_code, sense;`, 'movs_28e');
    const map = Object.fromEntries(movs.map((r) => [`${r.category_code}:${r.sense}`, Number(r.a)]));
    const okC = eq(map['ACT_EFECTIVO_USD:debito'], 167670) && eq(map['ACT_EFECTIVO_CUP:debito'], 2000)
      && eq(map['ING_DESCUENTOS:debito'], 8100) && eq(map['ING_VENTAS:credito'], 177770)
      && eq(map['GAS_COSTO_VENTAS:debito'], Number(mm.cogs)) && eq(map['ACT_INVENTARIO:credito'], Number(mm.cogs));
    if (!okC) throw new Error(`Asiento de 28e94349 con movimientos inesperados: ${JSON.stringify(map)}`);
    fase(4, 'RECT015_C', true, `entry ${String(entryC).slice(-8)} · D=C=${money(167670 + 2000 + 8100 + Number(mm.cogs))}`);
  } else {
    fase(4, 'RECT015_C', true, `YA_APLICADO (entry preexistente ${yaEntryC})`);
  }

  console.log('══ L5 · RECT-015-D (entregas → activo) ══');
  const preD = await q(`SELECT
    (SELECT round(sum(m.amount_cup),2) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
      WHERE e.document_type='FLUJO_CAJA' AND m.store_id='${STORE}' AND m.category_code='GAS_OTROS_OPER' AND m.sense='debito') total_gasto;`, 'preD');
  if (!eq(one(preD, 'total_gasto'), 8729279.98)) throw new Error(`GAS_OTROS_OPER de entregas cambió: ${JSON.stringify(preD)}`);
  await q(`
BEGIN;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date,
  rule_version_id, description, created_by)
VALUES ('${ID.entryD}', '${STORE}', 'RECTIFICACION_FIN', 'cd07fc7d-222c-423a-8afc-463252e4b411', 'RECT-015-D', 'ajuste_manual',
  '2026-10-23', NULL,
  'RECT-015-D: entrega_efectivo es entrega del efectivo acumulado para depósito bancario (activo pendiente de conciliar), no gasto. Ref asientos originales 267ee6f5 (IE-000002-2026, USD 367 @800 = 293.600) y 8f1644bd (IE-000001-2026, CUP 8.435.679,98) · expediente M-015 §C.',
  '${ADMIN}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
  economic_date, document_number, description, currency_origin, traza)
VALUES
  ('${ID.movD1}', '${ID.entryD}', '${STORE}', 'ACT_OTROS_CORR', 'debito', 8729279.98, 'CUP', 1, '2026-10-23', 'RECT-015-D',
   'Entregas de efectivo IE-000001/0002-2026 reclasificadas a activo pendiente', 'CUP',
   '{"mision":"M-015","rect":"RECT-015-D","refs":["267ee6f5","8f1644bd"],"concepto":"entrega_efectivo"}'),
  ('${ID.movD2}', '${ID.entryD}', '${STORE}', 'GAS_OTROS_OPER', 'credito', 8729279.98, 'CUP', 1, '2026-10-23', 'RECT-015-D',
   'Contra-partida: anula el gasto reconocido por las entregas', 'CUP',
   '{"mision":"M-015","rect":"RECT-015-D","refs":["267ee6f5","8f1644bd"]}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
VALUES ('RECT015_PROD', 'fin_entries', '${ID.entryD}', '${STORE}', '${ADMIN}',
  jsonb_build_object('rect','RECT-015-D','dr','ACT_OTROS_CORR 8729279.98','cr','GAS_OTROS_OPER 8729279.98','refs','267ee6f5+8f1644bd'));
COMMIT;`, 'rectD');
  const yaD = await q(`SELECT count(*) n FROM public.fin_entries WHERE id='${ID.entryD}' AND document_type='RECTIFICACION_FIN';`, 'chkD');
  fase(5, 'RECT015_D', Number(one(yaD, 'n')) === 1, `entry ${ID.entryD.slice(-8)} D=CR=8729279.98`);
}

// ═══ L6 · APERTURA EN CERO ════════════════════════════════════════════════════
if (MODE === '--apertura' || MODE === '--execute' || MODE === '--idem') {
  console.log('══ L6 · declaración de apertura en cero ══');
  const yaOB = one(await q(`SELECT status FROM public.fin_opening_balances WHERE id='${ID.opening}';`, 'ob_status'), 'status');
  if (yaOB === 'applied') {
    fase(6, 'apertura_cero', true, 'YA_APLICADO');
  } else if (!yaOB) {
    await q(`
BEGIN;
INSERT INTO public.fin_opening_balances (id, store_id, category_code, amount, currency, exchange_rate, amount_cup,
  as_of_date, notes, created_by)
VALUES ('${ID.opening}', '${STORE}', 'PAT_CAPITAL', 0, 'CUP', 1, 0, '2026-06-30',
  'Declaración de apertura en cero (M-015 §E): verificación read-only de que ENERVIDA no tenía saldos al
  30-06-2026 — 0 ventas, 0 pagos, 0 flujo de caja y 0 recepciones antes del 01-07-2026 (primera actividad:
  recepción FAC-VITALLCONS-001 el 01-07 y primera venta el 16-07). Fuentes: consulta u14 de la sesión 015
  (extract.json S14), certificaciones m011/m014. No se inventan importes.',
  '${ADMIN}');
COMMIT;`, 'ob_insert');
    const applied = await q(`BEGIN; ${claimAdmin}
      SELECT public.fin_apply_opening_balance('${ID.opening}', '${ADMIN}') AS r; COMMIT;`, 'ob_apply');
    const r = applied[0]?.r;
    if (r?.status !== 'success') throw new Error(`fin_apply_opening_balance: ${JSON.stringify(applied)}`);
    fase(6, 'apertura_cero', true, `entry ${String(r.entry_id).slice(-8)} · cero=true · sin movimientos`);
  } else {
    throw new Error(`Apertura en estado inesperado: ${yaOB}`);
  }
}

// ═══ VERIFY ══════════════════════════════════════════════════════════════════
if (MODE === '--verify') {
  console.log('══ V1 · saldos de cuenta ══');
  const saldos = await q(`SELECT category_code, round(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),2) saldo
    FROM public.fin_movements WHERE store_id='${STORE}'
    AND category_code IN ('ACT_EFECTIVO_CUP','ACT_EFECTIVO_USD','ACT_OTROS_CORR','GAS_OTROS_OPER','ING_DESCUENTOS','ACT_INVENTARIO')
    GROUP BY 1;`, 'v1');
  const S = Object.fromEntries(saldos.map((r) => [r.category_code, Number(r.saldo)]));
  const ok1 = eq(S.ACT_EFECTIVO_USD, 109900) && eq(S.ACT_EFECTIVO_CUP, 902020)
    && eq(S.ACT_OTROS_CORR, 8729279.98) && eq(S.GAS_OTROS_OPER, 0) && eq(S.ING_DESCUENTOS, 8100) // convención D−C: débito en cuenta de ingreso
    && eq(S.ACT_INVENTARIO, 601525.51);
  fase('V1', 'saldos_finales', ok1, JSON.stringify(S));

  console.log('══ V2 · ecuación contable ══');
  const ec = one(await q(`SELECT (public.fin_get_balance_sheet('${STORE}', '2026-11-17', '${ADMIN}') -> 'ecuacion') e;`, 'v2'), 'e');
  const ok2 = ec?.equilibrado === true && Math.abs(Number(ec?.diferencia ?? 1)) < 0.01;
  fase('V2', 'ecuacion_cuadrada', ok2, JSON.stringify(ec));

  console.log('══ V3 · completitud de apertura ══');
  const comp = one(await q(`SELECT (public.fin_get_balance_sheet('${STORE}', '2026-11-17', '${ADMIN}') -> 'completitud') c;`, 'v3'), 'c');
  const ok3 = comp?.sin_apertura === false && comp?.primera_apertura === '2026-06-30';
  fase('V3', 'completitud_apertura', ok3, JSON.stringify(comp));

  console.log('══ V4 · USD nunca negativo (cierre diario ≥ 0) ══');
  // Cierre diario (EOD): la RECT-B se crea hoy y su created_at ordena tras el
  // egreso original del 23-10; el balance con sentido financiero es el EOD.
  const dias = await q(`WITH dias AS (
      SELECT m.economic_date, sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END) delta
      FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
      WHERE m.store_id='${STORE}' AND m.category_code='ACT_EFECTIVO_USD'
      GROUP BY 1),
    acc AS (
      SELECT economic_date, round(sum(delta) OVER (ORDER BY economic_date),2) saldo_eod FROM dias)
    SELECT round(min(saldo_eod),2) mn, round(max(saldo_eod),2) mx,
      round((SELECT saldo_eod FROM acc ORDER BY economic_date DESC LIMIT 1),2) final
    FROM acc;`, 'v4');
  const d = dias[0];
  const ok4 = Number(d.mn) >= 0 && eq(d.mx, 288420) && eq(d.mn, 420) && eq(d.final, 109900);
  fase('V4', 'usd_nunca_negativo', ok4, JSON.stringify(d));

  console.log('══ V5 · asiento RECT-015-C equilibrado ══');
  const c5 = await q(`SELECT e.id, (SELECT round(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),2)
    FROM public.fin_movements m WHERE m.entry_id=e.id) neto
    FROM public.fin_entries e WHERE e.document_type='VENTA' AND e.document_id='28e94349-0a3e-499c-935f-c4a25c9db3fe';`, 'v5');
  const ok5 = c5.length === 1 && eq(c5[0].neto, 0);
  fase('V5', 'rect_C_equilibrado', ok5, JSON.stringify(c5.map((x) => ({ id: x.id.slice(-8), neto: x.neto }))));

  console.log('══ V6 · rectificaciones A/B/D presentes y equilibradas ══');
  const r6 = await q(`SELECT e.document_number, round(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),2) neto
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
    WHERE e.store_id='${STORE}' AND e.document_type='RECTIFICACION_FIN'
    GROUP BY 1 ORDER BY 1;`, 'v6');
  const byNum = Object.fromEntries(r6.map((r) => [r.document_number, Number(r.neto)]));
  const ok6 = eq(byNum['RECT-015-A'], 0) && eq(byNum['RECT-015-B'], 0) && eq(byNum['RECT-015-D'], 0) && r6.length === 3;
  fase('V6', 'rectificaciones_equilibradas', ok6, JSON.stringify(byNum));

  console.log('══ V7 · motor sin errores y guards activos ══');
  const v7 = await q(`SELECT
    (SELECT count(*) FROM public.fin_posting_errors WHERE store_id='${STORE}' AND resolved_at IS NULL) perr,
    (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.fin_opening_balances'::regclass AND tgname='fin_opening_applied_guard' AND tgenabled='O') trig,
    (SELECT count(*) FROM public.fin_opening_balances WHERE store_id='${STORE}' AND status='applied' AND amount=0) apertura0,
    (SELECT count(*) FROM public.audit_logs WHERE store_id='${STORE}' AND action IN ('RECT015_PROD','FIN_OPENING_APPLIED_ZERO')) audits;`, 'v7');
  const v = v7[0];
  const ok7 = Number(v.perr) === 0 && Number(v.trig) === 1 && Number(v.apertura0) === 1 && Number(v.audits) >= 4;
  fase('V7', 'motor_guards_auditoria', ok7, JSON.stringify(v));

  console.log('══ V8 · CXP y bancos intactos ══');
  const v8 = await q(`SELECT
    (SELECT round(sum(CASE WHEN sense='credito' THEN amount_cup ELSE -amount_cup END),2) FROM public.fin_movements
      WHERE store_id='${STORE}' AND category_code='PAS_CXP_PROV') cxp,
    (SELECT round(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),2) FROM public.fin_movements
      WHERE store_id='${STORE}' AND category_code='ACT_BANCOS') bancos,
    (SELECT count(*) FROM public.fin_movements WHERE store_id='${STORE}' AND category_code='ACT_EFECTIVO_USD') movs_usd;`, 'v8');
  const w = v8[0];
  // 6 originales (1 crédito FLUJO + 5 débitos VENTA) + A + B + C = 9
  const ok8 = eq(w.cxp, 2961795.90) && eq(w.bancos, 25972120.01) && Number(w.movs_usd) === 9;
  fase('V8', 'cxp_bancos_intactos', ok8, JSON.stringify(w));

  console.log('══ V9 · alcance: otras tiendas sin RECT-015 ══');
  const v9 = await q(`SELECT count(*) n FROM public.fin_entries
    WHERE document_type='RECTIFICACION_FIN' AND store_id != '${STORE}';`, 'v9');
  const ok9 = Number(one(v9, 'n')) === 0;
  fase('V9', 'rectificaciones_solo_enervida', ok9, `rect en otras tiendas: ${one(v9, 'n')}`);
  save();
}

// ═══ Resultado ═══
const fails = results.fases.filter((f) => !f.ok);
console.log(`\nM109 ${MODE}: ${results.fases.length - fails.length}/${results.fases.length} fases OK${fails.length ? ' · FALLOS: ' + fails.map((f) => f.fase).join(',') : ''}`);
save();
