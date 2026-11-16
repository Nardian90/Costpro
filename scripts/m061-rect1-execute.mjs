// ============================================================================
// M061 — CP-FIN-FINAL-VALUATION-EXECUTION-009 · RECT-1: EJECUCIÓN AUTORIZADA
// ============================================================================
// Ejecuta RECT-1 (151.299.851 CUP) conforme a RECT004_PRODUCTION_RUNBOOK.md §5
// y RECT004_ADDENDUM_T12_GUARD.md, con la autorización expresa del propietario
// contenida en la misión 009 (§1). UNA sola vez (regla de oro 11g).
//
// MODO --probe : valida la semántica transaccional del canal (Management API
//                /database/query) contra la BD E2E AISLADA (lguovmvrozxgssupkwpf).
// MODO (default): ejecuta la transacción gobernada de RECT-1 en PRODUCCIÓN:
//   · UNA sola llamada API = UNA transacción atómica (BEGIN…COMMIT).
//   · Advisory lock pg_advisory_xact_lock por documento (serializa concurrencia).
//   · Escape hatch M021: SET LOCAL app.allow_receipt_item_edit='on' (solo sesión).
//   · Pre-flight DENTRO de la transacción (cierra la ventana TOCTOU):
//     (a) deuda 100% pendiente · (b) líneas íntegras · (c) sin RECT previa.
//   · S1..S6 del runbook con guards de conteo (A-5): 2/1/2 filas esperadas.
//     — S3 lleva filtro de producto (hallazgo 009: sin filtro tocaría capas
//       de las líneas protegidas fuera del alcance autorizado).
//   · Verificación intra-transacción D=C (A-6) → si falla, ROLLBACK atómico.
//   · Idempotencia: ids deterministas + ON CONFLICT DO NOTHING + guards <> objetivo.
//
// Uso:
//   node scripts/m061-rect1-execute.mjs --probe     (sonda E2E, sin producción)
//   node scripts/m061-rect1-execute.mjs --execute   (RECT-1 en producción)
//   node scripts/m061-rect1-execute.mjs --verify    (post-verificación read-only)
// Sin --execute la producción NUNCA se escribe (por defecto solo --verify).
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

// ── Constantes del runbook (verificadas por m060-preflight 19/19 PASS) ───────
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const ORIG = '93bb5da9-0afd-4325-baad-a275710062c5';
const L111 = '80a1767b-8902-48c6-833b-abf713bdc7b0';
const L112 = '9c9e6010-b848-4d0f-b667-304282f7584b';
const P111 = '5f58e2b1-156b-46b2-8f6d-c491b15a350c';
const P112 = '8552e290-b627-4b75-b9af-7779399ab22b';
const IMPORTE = 151299851; // CUP — autorizado por el propietario (misión 009 §1)
const SEG = '7ec90009-0000-4000-8000'; // segmento determinista misión 009
const E_RECT1 = `${SEG}-d0b300000001`;
const FM_CXP = `${SEG}-f0b300000001`;
const FM_INV = `${SEG}-f0b300000002`;
const WCL111 = `${SEG}-9cb300000001`;
const WCL112 = `${SEG}-9cb300000002`;
const AUD = (n) => `${SEG}-e0b3${String(n).padStart(8, '0')}`;
const TRACE = 'RECT-PROD';
const MISION = 'CP-FIN-VALUATION-RECTIFICATION-003/004';
const MISION_EJEC = 'CP-FIN-FINAL-VALUATION-EXECUTION-009';

async function qApi(ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, rows: res.ok ? JSON.parse(text || '[]') : null };
}
const qProd = (sql) => qApi('wthkddeleylijmonclxg', sql);
const qE2E = (sql) => qApi('lguovmvrozxgssupkwpf', sql);

// ═════════════════════════════ MODO --probe ══════════════════════════════════
if (MODE === '--probe') {
  const SCHEMA = 'rect_probe_009';
  const results = {};
  let pass = true;
  const chk = (id, cond, detalle) => {
    results[id] = { resultado: cond ? 'PASS' : 'FAIL', detalle: String(detalle).slice(0, 300) };
    console.log(`${cond ? 'PASS' : 'FAIL'} — ${id}: ${detalle}`);
    pass = pass && cond;
  };
  await qE2E(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  // P1: transacción COMPLETA en una llamada (BEGIN..COMMIT) + RETURNING visible
  const r1 = await qE2E(`BEGIN;\nCREATE SCHEMA ${SCHEMA};\nCREATE TABLE ${SCHEMA}.t(a int);\nINSERT INTO ${SCHEMA}.t(a) VALUES (42) RETURNING a;\nCOMMIT;`);
  chk('P1_txn_completa_en_una_llamada', r1.ok && Array.isArray(r1.rows) && r1.rows.length === 1 && r1.rows[0].a === 42, `status=${r1.status} rows=${JSON.stringify(r1.rows)}`);
  // P2: el COMMIT de la llamada anterior PERSISTE en otra sesión/call (sin afinidad de pooler)
  const r2b = await qE2E(`SELECT count(*)::int AS n FROM ${SCHEMA}.t`);
  chk('P2_commit_persiste_entre_llamadas', r2b.ok && r2b.rows?.[0]?.n === 1, `n=${JSON.stringify(r2b.rows)}`);
  // P3: ROLLBACK revierte (verificado entre llamadas)
  const r3 = await qE2E(`BEGIN; INSERT INTO ${SCHEMA}.t(a) VALUES (999); ROLLBACK;`);
  const r3b = await qE2E(`SELECT count(*)::int AS n FROM ${SCHEMA}.t`);
  chk('P3_rollback_revierte', r3.ok && r3b.ok && r3b.rows?.[0]?.n === 1, `rb_ok=${r3.ok} n=${JSON.stringify(r3b.rows)}`);
  // P4: error a mitad de transacción → llamada falla y NADA persiste (atómico)
  const r4 = await qE2E(`BEGIN; INSERT INTO ${SCHEMA}.t(a) VALUES (555); SELECT 1/0; COMMIT;`);
  const r4b = await qE2E(`SELECT count(*)::int AS n FROM ${SCHEMA}.t`);
  chk('P4_error_atomico', !r4.ok && r4b.ok && r4b.rows?.[0]?.n === 1, `error_ok=${!r4.ok} n=${JSON.stringify(r4b.rows)}`);
  // P5: patrón exacto del execute — DML dentro de DO block + COMMIT en una llamada
  const r5 = await qE2E(`BEGIN; INSERT INTO ${SCHEMA}.t(a) VALUES (11); DO $p$ BEGIN PERFORM 1; END $p$; COMMIT;`);
  const r5b = await qE2E(`SELECT count(*)::int AS n FROM ${SCHEMA}.t`);
  chk('P5_do_block_commit', r5.ok === true && r5b.ok && r5b.rows?.[0]?.n === 2, `ok=${r5.ok} n=${JSON.stringify(r5b.rows)}`);
  // Limpieza final (net delta 0)
  const r6 = await qE2E(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  chk('LIMPIEZA', r6.ok, 'esquema de prueba eliminado (net delta 0)');
  console.log(`\nSONDA E2E: ${pass ? 'APROBADA — semántica transaccional confirmada (1 llamada = 1 transacción atómica persistente)' : 'RECHAZADA — no ejecutar RECT con este canal'}`);
  writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m061-sonda-transaccional-e2e.json'),
    JSON.stringify({ fecha_utc: new Date().toISOString(), bd: 'lguovmvrozxgssupkwpf (E2E AISLADA)', proposito: 'validar canal antes de producción', resultados: results, veredicto: pass ? 'APROBADA' : 'RECHAZADA' }, null, 2));
  process.exit(pass ? 0 : 1);
}

// ═════════════════════════════ MODO --execute ════════════════════════════════
if (MODE === '--execute') {
  console.log('RECT-1 — TRANSACCIÓN GOBERNADA (misión 009 · autorización expresa del propietario)');
  const SQL = `BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'${FVC}'));
SET LOCAL app.allow_receipt_item_edit = 'on';
CREATE TEMP TABLE rect1_result(paso text, payload jsonb);
DO $do$
DECLARE
  v_chk record; v_n int; v_r int; v_j jsonb; v_d numeric;
BEGIN
  -- PRE-FLIGHT (a): deuda 100% pendiente (A-1)
  SELECT payment_status, paid_amount, status INTO v_chk FROM public.receipts WHERE id='${FVC}';
  IF NOT FOUND OR v_chk.payment_status <> 'unpaid' OR v_chk.paid_amount > 0 OR v_chk.status IN ('voided','reversed') THEN
    RAISE EXCEPTION 'ABORTO-1: deuda/estado cambió: %', to_jsonb(v_chk);
  END IF;
  -- PRE-FLIGHT (b): el exceso sigue íntegro (A-2)
  SELECT count(*) INTO v_n FROM public.receipt_items
    WHERE receipt_id='${FVC}' AND product_id IN ('${S111}','${S112}')
      AND unit_cost IN (2500,1000) AND moneda_recepcion='USD' AND tasa_cambio_recepcion=680;
  IF v_n <> 2 THEN RAISE EXCEPTION 'ABORTO-2: líneas tocadas: %', v_n; END IF;
  -- PRE-FLIGHT (c): no existe RECT previa (A-3 / idempotencia)
  SELECT count(*) INTO v_r FROM public.fin_entries WHERE document_id='${FVC}' AND event='ajuste_manual';
  IF v_r > 0 THEN RAISE EXCEPTION 'ABORTO-3: ajuste_manual ya presente: %', v_r; END IF;

  -- S1: 2 líneas → costo real 1 CUP (esperado exactamente 2 filas)
  WITH u AS (UPDATE public.receipt_items SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
    WHERE receipt_id='${FVC}' AND product_id IN ('${S111}','${S112}')
      AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)
    RETURNING id, product_id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes)
  SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') INTO v_j FROM u;
  INSERT INTO rect1_result VALUES ('S1', v_j);
  IF (SELECT count(*) FROM jsonb_array_elements(v_j)) <> 2 THEN RAISE EXCEPTION 'A-5: S1 filas <> 2'; END IF;

  -- S2: cabecera → total corregido (esperado 1 fila: 192.039.436 → 40.739.585,00)
  WITH u AS (UPDATE public.receipts SET total_cost=40739585.00, updated_at=now()
    WHERE id='${FVC}' AND total_cost<>40739585.00
    RETURNING id, total_cost AS antes)
  SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') INTO v_j FROM u;
  INSERT INTO rect1_result VALUES ('S2', v_j);
  IF (SELECT count(*) FROM jsonb_array_elements(v_j)) <> 1 THEN RAISE EXCEPTION 'A-5: S2 filas <> 1'; END IF;

  -- S3: capas de compra kardex → uc 1 (esperado 2 filas · 1.700.000→1 · 680.000→1).
  -- Filtro de producto OBLIGATORIO (hallazgo misión 009): el S3 literal del runbook
  -- (solo reference_id+movement_type) tocaría capas de líneas protegidas fuera de alcance.
  WITH u AS (UPDATE public.stock_movements SET unit_cost=1
    WHERE reference_id='${FVC}' AND movement_type='purchase'
      AND product_id IN ('${S111}','${S112}') AND unit_cost<>1
    RETURNING id, product_id, unit_cost AS antes)
  SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') INTO v_j FROM u;
  INSERT INTO rect1_result VALUES ('S3', v_j);
  IF (SELECT count(*) FROM jsonb_array_elements(v_j)) <> 2 THEN RAISE EXCEPTION 'A-5: S3 filas <> 2'; END IF;

  -- S4: wac_change_log (2 filas idempotentes, ids deterministas)
  INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
  VALUES ('${WCL111}','${STORE}','${S111}',1,1,'rectificacion',10,1,
          '{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","documento":"FAC-VITALLCONS-001","decision":"costo real 1 CUP/u (autorización expresa del propietario, misión 009)","metodo":"governed_admin_write (escape hatch M021)"}'::jsonb, now()),
         ('${WCL112}','${STORE}','${S112}',1,1,'rectificacion',20,1,
          '{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","documento":"FAC-VITALLCONS-001","decision":"costo real 1 CUP/u (autorización expresa del propietario, misión 009)","metodo":"governed_admin_write (escape hatch M021)"}'::jsonb, now())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect1_result VALUES ('S4', to_jsonb(v_n));
  IF v_n <> 2 THEN RAISE EXCEPTION 'A-5: S4 filas % <> 2', v_n; END IF;

  -- S5: ASIENTO RECT-1 (id determinista; document_id + reversal_of enlazados)
  INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event,
    reversal_of, economic_date, posted_at, status, description, movements_snapshot)
  VALUES ('${E_RECT1}','${STORE}','RECEPCION','${FVC}','FAC-VITALLCONS-001-RECT','ajuste_manual',
    '${ORIG}','2026-07-01',now(),'posted',
    'Rectificación ${MISION}: reversión del exceso de reconocimiento SKU 111/112 (precio de venta importado como costo USD; costo real 1 CUP/u)',
    '[{"traza":{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-cxp-d"},"amount":151299851,"sentido":"debito","currency":"CUP","categoria":"PAS_CXP_PROV"},
      {"traza":{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-inv-c"},"amount":151299851,"sentido":"credito","currency":"CUP","categoria":"ACT_INVENTARIO"}]'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect1_result VALUES ('S5_entry', to_jsonb(v_n));
  IF v_n <> 1 THEN RAISE EXCEPTION 'A-5: S5 entry filas % <> 1', v_n; END IF;

  INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency,
    exchange_rate, economic_date, description, traza)
  VALUES ('${FM_CXP}','${E_RECT1}','${STORE}','PAS_CXP_PROV','debito',151299851.00,'CUP',1,'2026-07-01',
    'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-cxp-d"}'::jsonb),
         ('${FM_INV}','${E_RECT1}','${STORE}','ACT_INVENTARIO','credito',151299851.00,'CUP',1,'2026-07-01',
    'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","regla":"rect-inv-c"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect1_result VALUES ('S5_movements', to_jsonb(v_n));
  IF v_n <> 2 THEN RAISE EXCEPTION 'A-5: S5 movements filas % <> 2', v_n; END IF;

  -- S6: auditoría por fila (6 filas: 2 VALUATION + 1 TOTAL + 2 MOV_UC + 1 ENTRY;
  --     ids deterministas; trace_id 'RECT-PROD'; + la nativa del motor si procede)
  INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id) VALUES
   ('${AUD(1)}',now(),'receipt_items','${L111}','SYSTEM_RECT_VALUATION','{"uc":2500,"moneda":"USD","tasa":680}','{"uc":1,"moneda":"CUP","tasa":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","motivo":"costo real 1 CUP/u (decisión propietario)"}','${STORE}','${TRACE}'),
   ('${AUD(2)}',now(),'receipt_items','${L112}','SYSTEM_RECT_VALUATION','{"uc":1000,"moneda":"USD","tasa":680}','{"uc":1,"moneda":"CUP","tasa":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}"}','${STORE}','${TRACE}'),
   ('${AUD(3)}',now(),'receipts','${FVC}','SYSTEM_RECT_TOTAL','{"total_cost":192039436}','{"total_cost":40739585}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}"}','${STORE}','${TRACE}'),
   ('${AUD(4)}',now(),'stock_movements','${P111}','SYSTEM_RECT_MOV_UC','{"uc":1700000}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}"}','${STORE}','${TRACE}'),
   ('${AUD(5)}',now(),'stock_movements','${P112}','SYSTEM_RECT_MOV_UC','{"uc":680000}','{"uc":1}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}"}','${STORE}','${TRACE}'),
   ('${AUD(6)}',now(),'fin_entries','${E_RECT1}','SYSTEM_RECT_ENTRY','{"asiento":"${ORIG}","importe":192039436}','{"asiento":"RECT-1","reversal_of":"${ORIG}","debito":{"PAS_CXP_PROV":151299851},"credito":{"ACT_INVENTARIO":151299851}}','{"mision":"${MISION}","mision_ejecucion":"${MISION_EJEC}","documento":"FAC-VITALLCONS-001-RECT"}','${STORE}','${TRACE}')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rect1_result VALUES ('S6_audit', to_jsonb(v_n));
  IF v_n <> 6 THEN RAISE EXCEPTION 'A-5: S6 audit filas % <> 6', v_n; END IF;

  -- VERIFICACIÓN DENTRO DE LA TRANSACCIÓN (A-6): D=C de RECT-1 → 0.00
  SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END) INTO v_d
    FROM public.fin_movements WHERE entry_id='${E_RECT1}';
  INSERT INTO rect1_result VALUES ('balance_debe', to_jsonb(v_d));
  IF v_d IS NULL OR v_d <> 0 THEN RAISE EXCEPTION 'A-6: D=C=% — ROLLBACK', v_d; END IF;
END $do$;
COMMIT;
SELECT paso, payload FROM rect1_result ORDER BY paso;`;

  const t0 = new Date();
  const res = await qProd(SQL);
  const ev = { mision: MISION_EJEC, operacion: 'RECT-1', fecha_inicio_utc: t0.toISOString(),
    fecha_fin_utc: new Date().toISOString(), canal: 'Management API /database/query (1 llamada = 1 transacción)',
    proyecto: 'wthkddeleylijmonclxg (producción)', autorizacion: 'Propietario — misión 009 §1',
    ids: { entry: E_RECT1, movements: [FM_CXP, FM_INV], wac: [WCL111, WCL112], audit: [1,2,3,4,5,6].map(AUD) },
    nota_tecnica_s3: 'S3 con filtro de producto (hallazgo 009) — alcance autorizado preservado: solo P111/P112',
    nota_respuesta: 'Éxito = HTTP OK (los guards internos A-1..A-6 con RAISE son la barrera; cualquier desviación → HTTP 400 y ROLLBACK atómico). Los detalles por fila se capturan en --verify y en audit_logs (old_data/new_data).',
    http_status: res.status, respuesta: res.rows, texto_error: res.ok ? null : res.text, };
  if (res.ok) {
    ev.resultado = 'RECT-1 COMMITED — transacción gobernada aplicada (guards A-5/A-6 superados); verificar con --verify';
    writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m061-rect1-ejecucion.json'), JSON.stringify(ev, null, 2));
    console.log('COMMIT OK (HTTP', res.status + ') — filas devueltas:', Array.isArray(res.rows) ? res.rows.length : 0);
    if (Array.isArray(res.rows)) for (const r of res.rows) console.log(`  ${r.paso}: ${JSON.stringify(r.payload).slice(0, 180)}`);
  } else {
    ev.resultado = 'FALLO — la transacción NO se aplicó (atómica; estado anterior intacto)';
    writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m061-rect1-ejecucion-fallo.json'), JSON.stringify(ev, null, 2));
    console.error('FALLO DE TRANSACCIÓN:', res.text.slice(0, 600));
    process.exit(1);
  }
  process.exit(0);
}

// ═════════════════════════════ MODO --verify (read-only) ═════════════════════
if (MODE === '--verify') {
  // Post-verificación inmediata de RECT-1 (runbook §7 ítems aplicables a RECT-1)
  const checks = [];
  const chk = (id, control, pass, detalle) => {
    checks.push({ id, control, resultado: pass ? 'PASS' : 'FAIL', detalle: String(detalle ?? '').slice(0, 300) });
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${control} · ${String(detalle ?? '').slice(0, 160)}`);
  };
  const [hdr] = (await qProd(`SELECT total_cost, payment_status, paid_amount, status FROM public.receipts WHERE id='${FVC}'`)).rows;
  chk('V1', 'Cabecera total_cost=40.739.585,00 · unpaid · active', hdr && Number(hdr.total_cost) === 40739585 && hdr.payment_status === 'unpaid' && hdr.status === 'active', JSON.stringify(hdr));
  const lines = (await qProd(`SELECT p.sku, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id WHERE ri.receipt_id='${FVC}' AND p.sku IN ('111','112') ORDER BY p.sku`)).rows;
  chk('V2', 'Líneas 111/112 a 1 CUP @ tasa 1', lines.length === 2 && lines.every((l) => Number(l.unit_cost) === 1 && l.moneda_recepcion === 'CUP' && Number(l.tasa_cambio_recepcion) === 1), JSON.stringify(lines));
  const compras = (await qProd(`SELECT id, product_id, unit_cost FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase' AND product_id IN ('${S111}','${S112}') ORDER BY product_id`)).rows;
  chk('V3', 'Capas de compra 111/112 a uc=1', compras.length === 2 && compras.every((c) => Number(c.unit_cost) === 1), JSON.stringify(compras.map((c) => c.id)));
  const entries = (await qProd(`SELECT id, document_type, document_number, event, status, reversal_of FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`)).rows;
  chk('V4', 'Asientos FVC = 2: original intacto + RECT-1 (reversal_of=original, ajuste_manual, posted)',
    entries.length === 2 && entries[0].id === ORIG && entries[0].status === 'posted' && !entries[0].reversal_of
      && entries[1].id === E_RECT1 && entries[1].event === 'ajuste_manual' && entries[1].status === 'posted' && entries[1].reversal_of === ORIG, JSON.stringify(entries));
  const bal = (await qProd(`SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END)::numeric AS d FROM public.fin_movements WHERE entry_id='${E_RECT1}'`)).rows[0];
  chk('V5', 'RECT-1 equilibrada D=C=0,00 y par exacto (D CXP 151.299.851 / C INV 151.299.851)',
    Number(bal.d) === 0, `balance=${bal.d}`);
  const pair = (await qProd(`SELECT category_code, sense, amount FROM public.fin_movements WHERE entry_id='${E_RECT1}' ORDER BY category_code`)).rows;
  chk('V6', 'Movimientos de RECT-1 exactos', pair.length === 2 && pair.some((m) => m.category_code === 'PAS_CXP_PROV' && m.sense === 'debito' && Number(m.amount) === 151299851) && pair.some((m) => m.category_code === 'ACT_INVENTARIO' && m.sense === 'credito' && Number(m.amount) === 151299851), JSON.stringify(pair));
  // Idempotencia (runbook §7 ítem 8): conteo read-only equivalente a la re-ejecución
  // de S1/S2/S3 — las cláusulas WHERE (<> objetivo) devuelven 0 filas ⇒ re-ejecutar no tocaría nada.
  const idem = (await qProd(`SELECT
    (SELECT count(*)::int FROM public.receipt_items WHERE receipt_id='${FVC}' AND product_id IN ('${S111}','${S112}') AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)) AS s1,
    (SELECT count(*)::int FROM public.receipts WHERE id='${FVC}' AND total_cost<>40739585.00) AS s2,
    (SELECT count(*)::int FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase' AND product_id IN ('${S111}','${S112}') AND unit_cost<>1) AS s3`)).rows[0];
  chk('V7', 'Idempotencia: re-ejecución de S1/S2/S3 tocaría 0 filas (conteo read-only de las cláusulas WHERE)',
    idem.s1 === 0 && idem.s2 === 0 && idem.s3 === 0, JSON.stringify(idem));
  const audit = (await qProd(`SELECT action, count(*)::int AS n FROM public.audit_logs WHERE trace_id='RECT-PROD' AND action IN ('SYSTEM_RECT_VALUATION','SYSTEM_RECT_TOTAL','SYSTEM_RECT_MOV_UC','SYSTEM_RECT_ENTRY') GROUP BY 1 ORDER BY 1`)).rows;
  chk('V8', 'Auditoría RECT-1 registrada (2 VALUATION + 1 TOTAL + 2 MOV_UC + 1 ENTRY)',
    audit.reduce((a, r) => a + r.n, 0) === 6 && audit.find((r) => r.action === 'SYSTEM_RECT_VALUATION')?.n === 2, JSON.stringify(audit));
  const otros = (await qProd(`SELECT count(*)::int AS n FROM public.receipt_items WHERE receipt_id='${FVC}' AND updated_at > now() - interval '10 minutes' AND product_id NOT IN ('${S111}','${S112}')`)).rows[0];
  chk('V9', 'Ninguna otra línea de la recepción fue modificada', otros.n === 0, `otras_lineas_tocadas=${otros.n}`);
  const fails = checks.filter((c) => c.resultado === 'FAIL');
  const veredicto = fails.length === 0 ? 'RECT-1 VERIFICADA — lista para RECT-2' : `RECT-1 CON ${fails.length} FALLO(S): ${fails.map((f) => f.id).join(',')} — NO continuar con RECT-2`;
  writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m061-rect1-postverificacion.json'),
    JSON.stringify({ fecha_utc: new Date().toISOString(), modo: '--verify', checks, total: { pass: checks.length - fails.length, fail: fails.length }, veredicto }, null, 2));
  console.log(`\n${veredicto}`);
  process.exit(fails.length === 0 ? 0 : 1);
}
console.error('Modo no reconocido. Usa --probe | --execute | --verify');
process.exit(2);
