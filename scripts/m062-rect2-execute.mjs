// ============================================================================
// M062 — CP-FIN-FINAL-VALUATION-EXECUTION-009 · RECT-2: EJECUCIÓN AUTORIZADA
// ============================================================================
// Ejecuta RECT-2 (24 CUP) conforme a RECT004_PRODUCTION_RUNBOOK.md §6, con la
// autorización expresa del propietario de la misión 009 (§1). Transacción
// SEPARADA de RECT-1 (independencia demostrada m050e). Requiere RECT-1 aplicada.
//
//   · UNA llamada API = UNA transacción atómica; advisory lock 'fin:RECEP2:'.
//   · Pre-guard interno: RECT-1 presente y posted (reanudación §9 del runbook).
//   · T1: las 26 salidas subvaluadas → uc=1 (esperado EXACTAMENTE las 7 filas
//     congeladas / 26 u — ids verificados contra constantes; si difieren → A-5).
//   · T2: asiento RECT-2 D GAS_VALES 6 + D GAS_PERDIDA_INV 18 / C ACT_INVENTARIO 24.
//   · T3: auditoría por fila (7 MOV_SALIDA + 1 ENTRY; ids deterministas).
//   · PROHIBIDO debitar GAS_COSTO_VENTAS (COGS 7 CUP del motor ya reconocido).
//   · VS-000223 (par neto 0) NO se contabiliza — sus salidas NO están a uc=0.
//
// Uso:
//   node scripts/m062-rect2-execute.mjs --execute   (RECT-2 en producción)
//   node scripts/m062-rect2-execute.mjs --verify    (post-verificación read-only)
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const MODE = process.argv[2] || '--verify';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const ORIG = '93bb5da9-0afd-4325-baad-a275710062c5';
const SEG = '7ec90009-0000-4000-8000';
const E_RECT2 = `${SEG}-d0b300000002`;
const FM_VALES = `${SEG}-f0b300000003`;
const FM_PERDIDA = `${SEG}-f0b300000004`;
const FM_INV = `${SEG}-f0b300000005`;
const AUD = (n) => `${SEG}-e0b3${String(n).padStart(8, '0')}`;
const TRACE = 'RECT-PROD';
const MISION = 'CP-FIN-VALUATION-RECTIFICATION-003/004';
const MISION_EJEC = 'CP-FIN-FINAL-VALUATION-EXECUTION-009';
// Las 7 salidas uc=0 congeladas (ids) — el UPDATE T1 debe tocar EXACTAMENTE estas:
const EXITS7 = ['68a3ff08-a301-4232-937a-85f183452d5c','a1330957-1e49-43ed-a309-c7a20c2ee714',
  'a8a82720-df49-485d-949c-acfc082fc3b6','335e2fcc-f4d3-426b-a7ff-878af184acab',
  '673ede95-75cc-4c4e-aa19-1dc893c5cd79','9d47f6c1-756a-4e0f-9e56-85d1dc2ca557',
  '25db100f-9238-45b4-b53e-c3559eb60651'];

async function qApi(ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, rows: res.ok ? JSON.parse(text || '[]') : null };
}
const qProd = (sql) => qApi('wthkddeleylijmonclxg', sql);

// ═════════════════════════════ MODO --execute ════════════════════════════════
if (MODE === '--execute') {
  console.log('RECT-2 — TRANSACCIÓN GOBERNADA (misión 009 · autorización expresa del propietario)');
  const SQL = `BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEP2:'||'${FVC}'));
CREATE TEMP TABLE rect2_result(paso text, payload jsonb);
DO $do$
DECLARE
  v_n int; v_j jsonb; v_d numeric; v_ids text; v_ok boolean;
BEGIN
  -- PRE-GUARD: RECT-1 aplicada y posted (estado intermedio válido §9; si no → abortar)
  SELECT count(*) INTO v_n FROM public.fin_entries
    WHERE id='${SEG}-d0b300000001' AND document_id='${FVC}' AND event='ajuste_manual' AND status='posted';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ABORTO-0: RECT-1 no está aplicada (filas %) — ejecutar §5 primero', v_n; END IF;
  -- PRE-GUARD: sin RECT-2 previa (idempotencia)
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE id='${E_RECT2}' OR
    (document_id='${FVC}' AND document_type='AJUSTE_INVENTARIO' AND event='ajuste_manual');
  IF v_n > 0 THEN RAISE EXCEPTION 'ABORTO-3: RECT-2 ya presente (%) — verificar estado', v_n; END IF;

  -- T1: las 26 salidas subvaluadas → uc 1 (esperado EXACTAMENTE las 7 filas congeladas)
  WITH u AS (UPDATE public.stock_movements SET unit_cost=1
    WHERE store_id='${STORE}' AND product_id IN ('${S111}','${S112}')
      AND quantity_change<0 AND unit_cost=0
    RETURNING id, product_id, quantity_change, unit_cost AS antes)
  SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') INTO v_j FROM u;
  INSERT INTO rect2_result VALUES ('T1', v_j);
  IF (SELECT count(*) FROM jsonb_array_elements(v_j)) <> 7 THEN RAISE EXCEPTION 'A-5: T1 filas <> 7'; END IF;
  SELECT bool_and((u->>'id') = ANY(ARRAY['${EXITS7.join("','")}'])) INTO v_ok FROM jsonb_array_elements(v_j) u;
  SELECT coalesce(sum(abs((u->>'quantity_change')::numeric)),0) INTO v_d FROM jsonb_array_elements(v_j) u;
  IF NOT v_ok OR v_d <> 26 THEN RAISE EXCEPTION 'A-5: T1 ids/unidades difieren de las 7 salidas congeladas (u=%)', v_d; END IF;

  -- T2: ASIENTO RECT-2 (id determinista; PROHIBIDO GAS_COSTO_VENTAS)
  INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event,
    economic_date, posted_at, status, description, movements_snapshot)
  VALUES ('${E_RECT2}','${STORE}','AJUSTE_INVENTARIO','${FVC}','FAC-VITALLCONS-001-RECT-SAL','ajuste_manual',
    '2026-11-15',now(),'posted',
    'Rectificación ${MISION}: reconocimiento de salidas nunca contabilizadas (6 u vales VS-37/138/139 + 18 u ajustes cuadre × 1 CUP)',
    '[{"traza":{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-vales-d"},"amount":6,"sentido":"debito","currency":"CUP","categoria":"GAS_VALES"},
      {"traza":{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-perdida-d"},"amount":18,"sentido":"debito","currency":"CUP","categoria":"GAS_PERDIDA_INV"},
      {"traza":{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-inv-c"},"amount":24,"sentido":"credito","currency":"CUP","categoria":"ACT_INVENTARIO"}]'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect2_result VALUES ('T2_entry', to_jsonb(v_n));
  IF v_n <> 1 THEN RAISE EXCEPTION 'A-5: T2 entry filas % <> 1', v_n; END IF;

  INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency,
    exchange_rate, economic_date, description, traza) VALUES
   ('${FM_VALES}','${E_RECT2}','${STORE}','GAS_VALES','debito',6.00,'CUP',1,'2026-11-15',
    'Vales sin asiento: VS-000037 (4 u) + VS-000138 (1 u) + VS-000139 (1 u)','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-vales-d"}'::jsonb),
   ('${FM_PERDIDA}','${E_RECT2}','${STORE}','GAS_PERDIDA_INV','debito',18.00,'CUP',1,'2026-11-15',
    'Ajustes de cuadre importación: sku=111 Δ−1 + sku=112 Δ−17','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-perdida-d"}'::jsonb),
   ('${FM_INV}','${E_RECT2}','${STORE}','ACT_INVENTARIO','credito',24.00,'CUP',1,'2026-11-15',
    'Salidas SKU 111/112 (24 u × 1 CUP)','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-inv-c"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect2_result VALUES ('T2_movements', to_jsonb(v_n));
  IF v_n <> 3 THEN RAISE EXCEPTION 'A-5: T2 movements filas % <> 3', v_n; END IF;

  -- T3: auditoría por fila (7 MOV_SALIDA + 1 ENTRY; ids deterministas; trace RECT-PROD)
  INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id) VALUES
   ('${AUD(7)}',now(),'stock_movements','68a3ff08-a301-4232-937a-85f183452d5c','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"Venta POS v2 2026-07-24 sku111 q-1 (COGS ya en mayor)"}','${STORE}','${TRACE}'),
   ('${AUD(8)}',now(),'stock_movements','a1330957-1e49-43ed-a309-c7a20c2ee714','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"Cuadre importación sku111 Δ-1 (GAS_PERDIDA_INV)"}','${STORE}','${TRACE}'),
   ('${AUD(9)}',now(),'stock_movements','a8a82720-df49-485d-949c-acfc082fc3b6','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"Cuadre importación sku112 Δ-17 (GAS_PERDIDA_INV)"}','${STORE}','${TRACE}'),
   ('${AUD(10)}',now(),'stock_movements','335e2fcc-f4d3-426b-a7ff-878af184acab','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"VS-000037-2026 4u (GAS_VALES)"}','${STORE}','${TRACE}'),
   ('${AUD(11)}',now(),'stock_movements','673ede95-75cc-4c4e-aa19-1dc893c5cd79','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"Venta POS v2 2026-10-04 sku111 q-1 (COGS ya en mayor)"}','${STORE}','${TRACE}'),
   ('${AUD(12)}',now(),'stock_movements','9d47f6c1-756a-4e0f-9e56-85d1dc2ca557','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"VS-000138-2026 1u (GAS_VALES)"}','${STORE}','${TRACE}'),
   ('${AUD(13)}',now(),'stock_movements','25db100f-9238-45b4-b53e-c3559eb60651','SYSTEM_RECT_MOV_SALIDA','{"uc":0}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","doc":"VS-000139-2026 1u (GAS_VALES)"}','${STORE}','${TRACE}'),
   ('${AUD(14)}',now(),'fin_entries','${E_RECT2}','SYSTEM_RECT_ENTRY','{"asiento":null,"importe":0}','{"asiento":"RECT-2","debito":{"GAS_VALES":6,"GAS_PERDIDA_INV":18},"credito":{"ACT_INVENTARIO":24}}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","documento":"FAC-VITALLCONS-001-RECT-SAL"}','${STORE}','${TRACE}')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect2_result VALUES ('T3_audit', to_jsonb(v_n));
  IF v_n <> 8 THEN RAISE EXCEPTION 'A-5: T3 audit filas % <> 8', v_n; END IF;

  -- VERIFICACIÓN DENTRO DE LA TRANSACCIÓN (A-6): D=C de RECT-2 → 0.00
  SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END) INTO v_d
    FROM public.fin_movements WHERE entry_id='${E_RECT2}';
  INSERT INTO rect2_result VALUES ('balance_debe', to_jsonb(v_d));
  IF v_d IS NULL OR v_d <> 0 THEN RAISE EXCEPTION 'A-6: D=C=% — ROLLBACK', v_d; END IF;
END $do$;
COMMIT;
SELECT paso, payload FROM rect2_result ORDER BY paso;`;

  const t0 = new Date();
  const res = await qProd(SQL);
  const ev = { mision: MISION_EJEC, operacion: 'RECT-2', fecha_inicio_utc: t0.toISOString(),
    fecha_fin_utc: new Date().toISOString(), canal: 'Management API /database/query (1 llamada = 1 transacción)',
    proyecto: 'wthkddeleylijmonclxg (producción)', autorizacion: 'Propietario — misión 009 §1',
    ids: { entry: E_RECT2, movements: [FM_VALES, FM_PERDIDA, FM_INV], audit: [7,8,9,10,11,12,13,14].map(AUD) },
    nota_respuesta: 'Éxito = HTTP OK (guards internos con RAISE como barrera; desviación → HTTP 400 y ROLLBACK atómico; RECT-1 conserva su estado). Detalles en --verify y audit_logs.',
    http_status: res.status, respuesta: res.rows, texto_error: res.ok ? null : res.text };
  if (res.ok) {
    ev.resultado = 'RECT-2 COMMITED — transacción gobernada aplicada (guards A-5/A-6 superados); verificar con --verify';
    writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m062-rect2-ejecucion.json'), JSON.stringify(ev, null, 2));
    console.log('COMMIT OK (HTTP', res.status + ') — filas devueltas:', Array.isArray(res.rows) ? res.rows.length : 0);
    if (Array.isArray(res.rows)) for (const r of res.rows) console.log(`  ${r.paso}: ${JSON.stringify(r.payload).slice(0, 180)}`);
  } else {
    ev.resultado = 'FALLO — la transacción NO se aplicó (atómica; RECT-1 conserva su estado correcto)';
    writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m062-rect2-ejecucion-fallo.json'), JSON.stringify(ev, null, 2));
    console.error('FALLO DE TRANSACCIÓN:', res.text.slice(0, 600));
    process.exit(1);
  }
  process.exit(0);
}

// ═════════════════════════════ MODO --verify (read-only) ═════════════════════
if (MODE === '--verify') {
  const checks = [];
  const chk = (id, control, pass, detalle) => {
    checks.push({ id, control, resultado: pass ? 'PASS' : 'FAIL', detalle: String(detalle ?? '').slice(0, 300) });
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${control} · ${String(detalle ?? '').slice(0, 160)}`);
  };
  const [g2] = (await qProd(`SELECT coalesce(sum(CASE WHEN sense='debito' THEN amount ELSE -amount END),0)::numeric AS d,
    coalesce(sum(CASE WHEN category_code='GAS_VALES' AND sense='debito' THEN amount END),0)::numeric AS vales,
    coalesce(sum(CASE WHEN category_code='GAS_PERDIDA_INV' AND sense='debito' THEN amount END),0)::numeric AS perdida,
    coalesce(sum(CASE WHEN category_code='ACT_INVENTARIO' AND sense='credito' THEN amount END),0)::numeric AS inv
    FROM public.fin_movements WHERE entry_id='${E_RECT2}'`)).rows;
  chk('W1', 'RECT-2 equilibrada (D=C=0,00) con exactamente D VALES 6 + D PERDIDA 18 / C INV 24',
    Number(g2.d) === 0 && Number(g2.vales) === 6 && Number(g2.perdida) === 18 && Number(g2.inv) === 24, JSON.stringify(g2));
  const [g3] = (await qProd(`SELECT count(*)::int AS n FROM public.stock_movements WHERE store_id='${STORE}' AND product_id IN ('${S111}','${S112}') AND quantity_change<0 AND unit_cost=0`)).rows;
  chk('W2', 'Salidas uc=0 restantes = 0 filas', g3.n === 0, `n=${g3.n}`);
  const t1rows = (await qProd(`SELECT id, unit_cost FROM public.stock_movements WHERE id IN ('${EXITS7.join("','")}')`)).rows;
  chk('W3', 'Las 7 salidas congeladas quedan a uc=1 (26 u valorizadas)', t1rows.length === 7 && t1rows.every((r) => Number(r.unit_cost) === 1), `n=${t1rows.length}`);
  const cogs = (await qProd(`SELECT count(*)::int AS asientos, coalesce(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),0)::numeric AS total FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id WHERE fm.category_code='GAS_COSTO_VENTAS' AND fe.document_id IN (
    SELECT sm.reference_id::uuid FROM public.stock_movements sm WHERE sm.product_id IN ('${S111}','${S112}') AND sm.movement_type='sale' AND sm.reference_id ~ '^[0-9a-f-]{36}$')`)).rows[0];
  const cogsNuevo = (await qProd(`SELECT count(*)::int AS n FROM public.fin_movements WHERE category_code='GAS_COSTO_VENTAS' AND (entry_id='${E_RECT2}' OR entry_id IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}'))`)).rows[0];
  chk('W4', 'COGS del motor de las 5 ventas SKU111/112 intacto: 7 CUP (sin duplicación) y CERO GAS_COSTO_VENTAS nuevo en RECT-2/FVC',
    Number(cogs.total) === 7 && cogs.asientos === 5 && cogsNuevo.n === 0, `cogs_5_ventas=${JSON.stringify(cogs)} · nuevo_asociado_RECT_FVC=${cogsNuevo.n}`);
  const entries = (await qProd(`SELECT id, document_type, document_number, event, status, reversal_of FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`)).rows;
  chk('W5', 'Asientos de la FVC = 3: original + RECT-1 + RECT-2, todos posted',
    entries.length === 3 && entries.every((e) => e.status === 'posted'), JSON.stringify(entries.map((e) => [e.document_number, e.event])));
  const audit = (await qProd(`SELECT action, count(*)::int AS n FROM public.audit_logs WHERE trace_id='RECT-PROD' GROUP BY 1 ORDER BY 1`)).rows;
  const audTot = audit.reduce((a, r) => a + r.n, 0);
  chk('W6', 'Auditoría total RECT-PROD = 14 filas (6 de RECT-1 + 8 de RECT-2)', audTot === 14, JSON.stringify(audit));
  const fails = checks.filter((c) => c.resultado === 'FAIL');
  const veredicto = fails.length === 0 ? 'RECT-2 VERIFICADA — ejecución completa; procede la certificación m063' : `RECT-2 CON ${fails.length} FALLO(S): ${fails.map((f) => f.id).join(',')}`;
  writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m062-rect2-postverificacion.json'),
    JSON.stringify({ fecha_utc: new Date().toISOString(), modo: '--verify', checks, total: { pass: checks.length - fails.length, fail: fails.length }, veredicto }, null, 2));
  console.log(`\n${veredicto}`);
  process.exit(fails.length === 0 ? 0 : 1);
}
console.error('Modo no reconocido. Usa --execute | --verify');
process.exit(2);
