// ============================================================================
// M060 — CP-FIN-FINAL-VALUATION-EXECUTION-009 · §3 PREFLIGHT FINANCIERO
// ============================================================================
// Comprobaciones de solo lectura EXCLUSIVAMENTE previas a la ejecución autorizada
// de RECT-1 (151.299.851 CUP) y RECT-2 (24 CUP) según RECT004_PRODUCTION_RUNBOOK.md
// y RECT004_ADDENDUM_T12_GUARD.md, con la autorización expresa del propietario
// contenida en la misión 009.
//
// Condiciones §3 de la misión (S1..S10) + verificaciones técnicas (T1..T9):
//   S1  FVC activa y sin liquidación.
//   S2  Asiento original identificado inequívocamente (único, posted, sin reversa).
//   S3  Deuda pendiente en la parte a corregir (CXP crédito íntegro).
//   S4  Sin pagos/anticipos/compensaciones/notas/reversiones que cambien contrapartida.
//   S5  SKU111/112 conservan 2.500/1.000 USD@680 (exceso íntegro 151.299.851).
//   S6  Cantidades/movimientos compatibles con el runbook (kardex 21, stocks 10/20,
//       salidas uc=0 = 7 filas / 26 u — ids EXACTOS vs constantes congeladas).
//   S7  Documentos de los 24 CUP sin contabilización previa.
//   S8  Reingreso VS-000223 correctamente tratado (par neto 0, uc=1, sin asiento).
//   S9  T12 habilitada en producción (trigger activo + motor v2 residual).
//   S10 Hardening de privilegios vigente (ACLs m059 + RLS 9 tablas).
//   T1..T9 esquema/constraint/triggers/columnas/ids/baselines para la ejecución.
//
// READ-ONLY ESTRICTO: ninguna sentencia de escritura. Canal: Management API
// /database/query (SELECT). Guard de ref de producción inline (fail-closed).
// Uso: node scripts/m060-rect-preflight.mjs
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} fila(s)`);
  return rows;
}

// ── Constantes congeladas (expediente RECT004 / m050b verificado 20/20) ──────
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const ORIG = '93bb5da9-0afd-4325-baad-a275710062c5';
const L111 = '80a1767b-8902-48c6-833b-abf713bdc7b0';   // línea recepción SKU111
const L112 = '9c9e6010-b848-4d0f-b667-304282f7584b';   // línea recepción SKU112
const P111 = '5f58e2b1-156b-46b2-8f6d-c491b15a350c';   // capa compra SKU111 (uc 1.700.000)
const P112 = '8552e290-b627-4b75-b9af-7779399ab22b';   // capa compra SKU112 (uc 680.000)
// Las 7 salidas uc=0 (24 CUP RECT-2 + 2 u de ventas ya costeadas por el motor):
const EXITS7 = ['68a3ff08-a301-4232-937a-85f183452d5c','a1330957-1e49-43ed-a309-c7a20c2ee714',
  'a8a82720-df49-485d-949c-acfc082fc3b6','335e2fcc-f4d3-426b-a7ff-878af184acab',
  '673ede95-75cc-4c4e-aa19-1dc893c5cd79','9d47f6c1-756a-4e0f-9e56-85d1dc2ca557',
  '25db100f-9238-45b4-b53e-c3559eb60651'];
// Precios de venta maestros congelados (NO se modifican; RECT no toca columnas de precio)
const PRICE_FROZEN = { '111': { price: '2000', price_currency: 'CUP' },
                       '112': { price: '1000', price_currency: 'USD' } };
// Segmento determinista de ids de la misión 009 (producción; distinto del de E2E)
const SEG = '7ec90009-0000-4000-8000';
const IDS = {
  rect1_entry: `${SEG}-d0b300000001`, rect2_entry: `${SEG}-d0b300000002`,
  fm_r1_cxp: `${SEG}-f0b300000001`, fm_r1_inv: `${SEG}-f0b300000002`,
  fm_r2_vales: `${SEG}-f0b300000003`, fm_r2_perdida: `${SEG}-f0b300000004`, fm_r2_inv: `${SEG}-f0b300000005`,
  wcl_111: `${SEG}-9cb300000001`, wcl_112: `${SEG}-9cb300000002`,
  aud: Array.from({ length: 14 }, (_, i) => `${SEG}-e0b3${String(i + 1).padStart(8, '0')}`),
};

const checks = [];
const chk = (id, control, pass, detalle) => {
  checks.push({ id, control, resultado: pass ? 'PASS' : 'FAIL', detalle: String(detalle ?? '').slice(0, 400) });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${control}${detalle ? ' · ' + String(detalle).slice(0, 200) : ''}`);
  return pass;
};
const num = (v) => (v === null || v === undefined ? null : Number(v));
const eq = (a, b) => num(a) === num(b);

const out = { mision: 'CP-FIN-FINAL-VALUATION-EXECUTION-009', script: 'm060-rect-preflight.mjs',
  fecha_utc: new Date().toISOString(), canal: 'Management API /database/query — SOLO SELECT',
  proyecto: ref, autorizacion: 'RECT-1 y RECT-2 expresamente autorizadas por el propietario en la misión 009',
  constantes: { FVC, STORE, ORIG, L111, L112, P111, P112, EXITS7, ids_mision_009: IDS }, checks: {}, baselines: {} };
let ok = true;

// ══ S1: FVC activa ════════════════════════════════════════════════════════════
const [r] = await q(`SELECT id, status, total_cost, payment_status, paid_amount, paid_at, reversed_at, due_date FROM public.receipts WHERE id='${FVC}'`, 'S1 FVC');
out.baselines.receipts_fvc = r;
ok &= chk('S1', 'FVC activa, unpaid, sin reversa, total 192.039.436',
  r && r.status === 'active' && r.payment_status === 'unpaid' && eq(r.paid_amount, 0) && !r.paid_at && !r.reversed_at && eq(r.total_cost, 192039436),
  `status=${r?.status} pay=${r?.payment_status} paid=${r?.paid_amount} total=${r?.total_cost}`);

// ══ S2: asiento original inequívoco ═══════════════════════════════════════════
const fvcEntries = await q(`SELECT id, store_id, document_type, document_id, event, status, reversal_of FROM public.fin_entries WHERE document_id='${FVC}'`, 'S2 asientos FVC');
const orig = fvcEntries.find((e) => e.id === ORIG);
const fmOrig = await q(`SELECT category_code, sense, amount_cup FROM public.fin_movements WHERE entry_id='${ORIG}' ORDER BY category_code`, 'S2 movs original');
const fmOk = fmOrig.length === 2
  && fmOrig.some((m) => m.category_code === 'ACT_INVENTARIO' && m.sense === 'debito' && eq(m.amount_cup, 192039436))
  && fmOrig.some((m) => m.category_code === 'PAS_CXP_PROV' && m.sense === 'credito' && eq(m.amount_cup, 192039436));
ok &= chk('S2', 'Asiento original único (93bb5da9, reconocimiento, posted, sin reversal_of) y par D/C 192.039.436',
  fvcEntries.length === 1 && orig && orig.event === 'reconocimiento' && orig.status === 'posted' && !orig.reversal_of && orig.store_id === STORE && fmOk,
  `n=${fvcEntries.length} event=${orig?.event} status=${orig?.status} fm=${JSON.stringify(fmOrig)}`);

// ══ S3: deuda pendiente en la parte a corregir ════════════════════════════════
const cxp = await q(`SELECT coalesce(sum(CASE WHEN sense='credito' THEN amount_cup ELSE -amount_cup END),0)::numeric AS neto FROM public.fin_movements WHERE category_code='PAS_CXP_PROV'`, 'S3 X_cxp');
const X_cxp = num(cxp[0]?.neto);
out.baselines.X_cxp = X_cxp;
ok &= chk('S3', 'Deuda 100% pendiente (unpaid/paid 0) y CXP global neta > exceso autorizado',
  r?.payment_status === 'unpaid' && eq(r?.paid_amount, 0) && X_cxp !== null && X_cxp > 151299851,
  `X_cxp=${X_cxp}`);

// ══ S4: sin pagos / anticipos / reversiones que cambien la contrapartida ═════
const ptFvc = await q(`SELECT count(*)::int AS n FROM public.payment_transactions WHERE ref_id='${FVC}' OR reference ILIKE '%vitallcons%' OR notes ILIKE '%vitallcons%' OR reference ILIKE '%FAC-VITALLCONS%' OR notes ILIKE '%FAC-VITALLCONS%'`, 'S4 pagos FVC');
const revs = await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE reversal_of IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}')`, 'S4 reversiones FVC');
const dup = await q(`SELECT count(*)::int AS n FROM (SELECT reference_doc FROM public.receipts WHERE supplier ILIKE '%vitallcons%' OR reference_doc ILIKE '%vitallcons%' OR document_number ILIKE '%vitallcons%' GROUP BY 1 HAVING count(*)>1) t`, 'S4 duplicados proveedor');
ok &= chk('S4', 'Cero pagos FVC/proveedor, cero reversiones del asiento original, cero duplicados',
  ptFvc[0].n === 0 && revs[0].n === 0 && dup[0].n === 0,
  `pagos=${ptFvc[0].n} reversiones=${revs[0].n} duplicados=${dup[0].n}`);

// ══ S5: costos vigentes y exceso íntegro ══════════════════════════════════════
const lines = await q(`SELECT ri.id, p.sku, ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion, p.price, p.price_currency FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id WHERE ri.receipt_id='${FVC}' AND p.sku IN ('111','112') ORDER BY p.sku`, 'S5 líneas');
const l111 = lines.find((l) => l.sku === '111'), l112 = lines.find((l) => l.sku === '112');
const excessOk = l111 && l112 && eq(l111.quantity * l111.unit_cost * l111.tasa_cambio_recepcion - l111.quantity * 1, 83299951)
  && eq(l112.quantity * l112.unit_cost * l112.tasa_cambio_recepcion - l112.quantity * 1, 67999900);
const priceOk = lines.every((l) => PRICE_FROZEN[l.sku] && String(l.price) === PRICE_FROZEN[l.sku].price && l.price_currency === PRICE_FROZEN[l.sku].price_currency);
ok &= chk('S5', 'Líneas 111/112 intactas (49@2500 USD@680, 100@1000 USD@680) y exceso = 151.299.851 exacto',
  lines.length === 2 && l111?.id === L111 && l112?.id === L112 && eq(l111.unit_cost, 2500) && eq(l112.unit_cost, 1000)
    && l111.moneda_recepcion === 'USD' && l112.moneda_recepcion === 'USD' && eq(l111.tasa_cambio_recepcion, 680) && eq(l112.tasa_cambio_recepcion, 680) && excessOk,
  `l111=${l111?.unit_cost}/${l111?.moneda_recepcion}@${l111?.tasa_cambio_recepcion} l112=${l112?.unit_cost}/${l112?.moneda_recepcion}@${l112?.tasa_cambio_recepcion}`);
out.baselines.precios_venta = lines.map((l) => ({ sku: l.sku, price: l.price, price_currency: l.price_currency }));
ok &= chk('S5b', 'Precios de venta maestros = congelados (2000 CUP / 1000 USD) — RECT no toca precios', priceOk,
  JSON.stringify(out.baselines.precios_venta));

// ══ S6: cantidades y movimientos compatibles con el runbook ═══════════════════
const kardex = await q(`SELECT id, product_id, movement_type, quantity_change, unit_cost, reference_id, reference_doc FROM public.stock_movements WHERE store_id='${STORE}' AND product_id IN ('${S111}','${S112}') ORDER BY movement_date`, 'S6 kardex');
const exits0 = kardex.filter((k) => num(k.quantity_change) < 0 && eq(k.unit_cost, 0));
const exitIdsOk = exits0.length === EXITS7.length && exits0.every((k) => EXITS7.includes(k.id));
const stocks = await q(`SELECT p.sku, p.stock_current, i.quantity AS inv FROM public.products p LEFT JOIN public.inventory i ON i.product_id=p.id AND i.store_id='${STORE}' WHERE p.id IN ('${S111}','${S112}') ORDER BY p.sku`, 'S6 stocks');
const stockOk = stocks.length === 2 && stocks.every((s) => (s.sku === '111' && eq(s.stock_current, 10) && eq(s.inv, 10)) || (s.sku === '112' && eq(s.stock_current, 20) && eq(s.inv, 20)));
const nuevos = await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE product_id IN ('${S111}','${S112}') AND created_at > '2026-11-14T18:58:17Z'`, 'S6 nuevos post-corte');
out.baselines.exits7 = exits0.map((k) => ({ id: k.id, sku: num(k.quantity_change) < 0 ? (k.product_id === S111 ? '111' : '112') : null, q: num(k.quantity_change), tipo: k.movement_type, doc: k.reference_doc }));
ok &= chk('S6', 'Kardex 21 movimientos, salidas uc=0 = EXACTAMENTE las 7 filas congeladas / 26 u, stocks 10/20, sin movimientos nuevos post-corte',
  kardex.length === 21 && exits0.length === 7 && exitIdsOk && Math.abs(exits0.reduce((a, k) => a + num(k.quantity_change), 0)) === 26 && stockOk && nuevos[0].n === 0,
  `kardex=${kardex.length} exits=${exits0.length} u=${Math.abs(exits0.reduce((a, k) => a + num(k.quantity_change), 0))} ids_ok=${exitIdsOk} nuevos=${nuevos[0].n}`);

// ══ S7: documentos de los 24 CUP sin contabilización previa ══════════════════
const valesSin = await q(`SELECT s.id, s.slip_number, s.status FROM public.issue_slips s WHERE s.slip_number IN ('VS-000037-2026','VS-000138-2026','VS-000139-2026') AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_id=s.id OR fe.document_number=s.slip_number) ORDER BY s.slip_number`, 'S7 vales sin asiento');
const valesEstado = await q(`SELECT slip_number, status FROM public.issue_slips WHERE slip_number IN ('VS-000037-2026','VS-000138-2026','VS-000139-2026','VS-000223-2026') ORDER BY slip_number`, 'S7 estados vales');
const adjSin = await q(`SELECT count(*)::int AS n FROM public.stock_movements sm WHERE sm.product_id IN ('${S111}','${S112}') AND sm.movement_type='adjustment' AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_id=sm.reference_id::uuid)`, 'S7 ajustes sin asiento');
const invAdj = await q(`SELECT count(*)::int AS n FROM public.inventory_adjustments WHERE store_id='${STORE}' AND created_at BETWEEN '2026-08-01' AND '2026-09-01'`, 'S7 inventory_adjustments agosto');
const valesOk = valesSin.length === 3 && valesEstado.every((v) => v.status === (v.slip_number === 'VS-000223-2026' ? 'reversed' : 'completed'));
ok &= chk('S7', 'VS-37/138/139 completed y SIN asiento; 2 ajustes de cuadre SIN asiento; sin inventory_adjustments',
  valesOk && adjSin[0].n === 2 && invAdj[0].n === 0,
  `vales_sin=${valesSin.length} estados=${JSON.stringify(valesEstado)} adj_sin=${adjSin[0].n} inv_adj=${invAdj[0].n}`);

// ══ S8: reingreso VS-000223 correctamente tratado ═════════════════════════════
const vs223 = kardex.filter((k) => (k.reference_doc || '').includes('VS-000223'));
const parNeto = vs223.length === 2 && Math.abs(vs223.reduce((a, k) => a + num(k.quantity_change), 0)) === 0
  && vs223.every((k) => eq(k.unit_cost, 1));
const vs223Entry = await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE document_number='VS-000223-2026' OR document_id='e4e811da-6722-468c-b4fd-14ff8fb5f084'`, 'S8 asientos VS223');
ok &= chk('S8', 'VS-000223: vale reversed, par salida/reingreso neto 0 a uc=1, sin asiento, fuera del alcance uc=0',
  valesEstado.find((v) => v.slip_number === 'VS-000223-2026')?.status === 'reversed' && parNeto && vs223Entry[0].n === 0 && !vs223.some((k) => EXITS7.includes(k.id)),
  `par=${JSON.stringify(vs223.map((k) => [k.movement_type, num(k.quantity_change), num(k.unit_cost)]))} asientos=${vs223Entry[0].n}`);

// ══ S9: T12 habilitada en producción ══════════════════════════════════════════
const t12trg = await q(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.receipts'::regclass AND tgname='fin_t12_receipt_annulment_block'`, 'S9 trigger T12');
const motor = await q(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_post_document_annulment'`, 'S9 motor');
const residFn = await q(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_entry_reversal_residual'`, 'S9 fn residual');
const motorV2 = motor.length === 1 && (motor[0].prosrc || '').includes('ERR_PARTIAL'); // código real: ERR_PARTIAL_REVERSAL_PENDING
ok &= chk('S9', 'T12 en producción: trigger habilitado (tgenabled=O) + motor v2 con ERR_PARTIAL_REVERSAL_PENDING + fn residual',
  t12trg.length === 1 && t12trg[0].tgenabled === 'O' && motorV2 && residFn[0].n === 1,
  `trigger=${t12trg[0]?.tgenabled} motor_v2=${motorV2} resid=${residFn[0].n}`);

// ══ S10: hardening de privilegios vigente ═════════════════════════════════════
const acls = await q(`SELECT p.proname, p.prosecdef, coalesce(array_to_string(ARRAY(SELECT COALESCE(r.rolname, grantee::text) || '=' || privilege_type FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) LEFT JOIN pg_roles r ON r.oid=grantee), ', '),'(default)') AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fin_post_document_annulment','fin_t12_block_receipt_annulment','fin_entry_reversal_residual') ORDER BY p.proname`, 'S10 ACLs');
const aclMotor = acls.find((a) => a.proname === 'fin_post_document_annulment');
const rolesMotor = aclMotor ? (aclMotor.acl.match(/[A-Za-z_]+=/g) ?? []).map((s) => s.replace(/=$/, '')).filter((x) => x !== 'postgres') : [];
const TABLAS = ['receipts','receipt_items','products','fin_entries','fin_movements','fin_posting_errors','production_migration_ledger','payment_transactions','stock_movements'];
const rls = await q(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${TABLAS.map((t) => `'${t}'`).join(',')})`, 'S10 RLS');
ok &= chk('S10', 'Hardening vigente: motor ACL {postgres,service_role}, helper/trigger SD, RLS activa en 9 tablas',
  aclMotor && acls.every((a) => a.prosecdef === true) && rolesMotor.every((x) => x === 'service_role') && rls.length === 9 && rls.every((x) => x.relrowsecurity === true),
  `motor=${aclMotor?.acl} rls=${rls.length}`);

// ══ T1: índice único uq_fin_entries_doc_event (idempotencia por tupla documento) ═
const con = await q(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_fin_entries_doc_event'`, 'T1 índice único');
out.checks.T1_constraint = con[0]?.indexdef;
ok &= chk('T1', 'Índice ÚNICO uq_fin_entries_doc_event existe (document_type, document_id, event, coalesce(payment_ref))',
  con.length === 1 && (con[0]?.indexdef || '').includes('UNIQUE INDEX') && (con[0]?.indexdef || '').includes('payment_ref'), con[0]?.indexdef);

// ══ T2: triggers de receipts y receipt_items (que S1/S2 no disparen re-post) ═
const trgs = await q(`SELECT tgname, pg_get_triggerdef(t.oid) AS def, t.tgenabled FROM pg_trigger t WHERE t.tgrelid IN ('public.receipts'::regclass,'public.receipt_items'::regclass) AND NOT t.tgisinternal ORDER BY tgrelid::regclass::text, tgname`, 'T2 triggers');
out.checks.T2_triggers = trgs.map((t) => ({ name: t.tgname, enabled: t.tgenabled, def: t.def }));
// Trigger CONOCIDOS de receipts + qué hacen ante el UPDATE de S2 (solo total_cost, status intacto):
const KNOWN = ['fin_t12_receipt_annulment_block','fin_trg_receipts','trg_audit_receipt_changes','trg_cp_infra_020_block_truncate','trg_receipts_assign_document_number','trg_set_due_date_receipt','trg_validate_receipt_transition'];
const trgReceipts = trgs.filter((t) => t.def.includes('ON public.receipts '));
const desconocidos = trgReceipts.filter((t) => !KNOWN.includes(t.tgname)).map((t) => t.tgname);
const t12Before = trgs.find((t) => t.tgname === 'fin_t12_receipt_annulment_block');
const motorSrc = await q(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_trg_receipts'`, 'T2 src motor');
// El motor solo actúa con transición de status: post en INSERT/reactivación; anulación en voided/reversed.
const motorSoloStatus = motorSrc.length === 1 && (motorSrc[0].prosrc || '').includes("OLD.status <> 'active'") && (motorSrc[0].prosrc || "").includes("NEW.status IN ('voided', 'reversed')");
const auditSrc = await q(`SELECT coalesce(position('fin_' in coalesce(prosrc,'')),0)::int AS pos_fin, position('OLD.status != NEW.status' in coalesce(prosrc,''))::int AS pos_status FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='log_transaction_changes'`, 'T2 src auditoría');
out.checks.T2_analisis = { desconocidos, motorSoloStatus, audit_nunca_toca_fin: auditSrc[0]?.pos_fin === 0, audit_solo_cambio_status: (auditSrc[0]?.pos_status ?? 0) > 0 };
ok &= chk('T2', 'El UPDATE de total_cost de S2 no dispara acción financiera ni re-posting (motor solo en transición de status; auditoría solo en cambio de status; sin triggers desconocidos) y T12 es BEFORE UPDATE OF status',
  desconocidos.length === 0 && !!t12Before && /BEFORE UPDATE OF status/i.test(t12Before.def) && motorSoloStatus && auditSrc[0]?.pos_fin === 0 && (auditSrc[0]?.pos_status ?? 0) > 0,
  `triggers=${trgReceipts.map((t) => t.tgname).join(',')} motor_solo_status=${motorSoloStatus}`);

// ══ T3: columnas requeridas por el runbook ═══════════════════════════════════
const cols = await q(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('fin_entries','fin_movements','wac_change_log','audit_logs') ORDER BY table_name, ordinal_position`, 'T3 columnas');
const need = { fin_entries: ['id','store_id','document_type','document_id','document_number','event','reversal_of','economic_date','posted_at','status','description','movements_snapshot'],
  fin_movements: ['id','entry_id','store_id','category_code','sense','amount','currency','exchange_rate','economic_date','description','traza'],
  wac_change_log: ['id','store_id','product_id','wac_before','wac_after','event','qty_in','uc_in','source_ref','created_at'],
  audit_logs: ['id','created_at','table_name','record_id','action','old_data','new_data','metadata','store_id','trace_id'] };
const missing = [];
for (const [t, list] of Object.entries(need)) for (const c of list) if (!cols.some((x) => x.table_name === t && x.column_name === c)) missing.push(`${t}.${c}`);
const wclChangedBy = cols.find((x) => x.table_name === 'wac_change_log' && x.column_name === 'changed_by');
const recIdType = cols.find((x) => x.table_name === 'audit_logs' && x.column_name === 'record_id')?.data_type;
out.checks.T3 = { missing, wcl_changed_by: wclChangedBy?.is_nullable, audit_record_id_type: recIdType };
ok &= chk('T3', 'Columnas del runbook presentes; wac_change_log.changed_by anulable o con default; audit_logs.record_id uuid',
  missing.length === 0 && (!wclChangedBy || wclChangedBy.is_nullable === 'YES') && recIdType === 'uuid',
  `missing=${JSON.stringify(missing)} changed_by=${wclChangedBy?.is_nullable} record_id=${recIdType}`);

// ══ T4: capas de compra objetivo de S3 ════════════════════════════════════════
// NOTA TÉCNICA (hallazgo misión 009): el S3 literal del runbook (solo reference_id +
// movement_type) tocaría en producción TODAS las capas de compra de la FVC con uc<>1
// (101 filas: las 99 líneas protegidas fuera de alcance). El alcance autorizado y el
// propio runbook («esperado: 2 filas · 1.700.000→1 · 680.000→1») exigen el filtro de
// producto que se añade a la ejecución: AND product_id IN (S111,S112).
const comprasTodas = await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase' AND unit_cost <> 1`, 'T4 capas uc<>1 sin filtro');
const compras = await q(`SELECT id, product_id, quantity_change, unit_cost FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase' AND product_id IN ('${S111}','${S112}') ORDER BY product_id`, 'T4 capas compra');
const comprasOk = compras.length === 2 && compras.some((c) => c.id === P111 && eq(c.unit_cost, 1700000)) && compras.some((c) => c.id === P112 && eq(c.unit_cost, 680000));
out.checks.T4_nota_tecnica = `S3 del runbook ejecutado CON filtro de producto (hallazgo 009: sin filtro tocaría ${comprasTodas[0].n} capas — ${comprasTodas[0].n - 2} fuera del alcance autorizado). Alcance económico autorizado PRESERVADO: solo P111/P112.`;
ok &= chk('T4', `Capas de compra S3 = exactamente las 2 congeladas (1.700.000 / 680.000); sin filtro de producto el S3 literal tocaría ${comprasTodas[0].n} capas`,
  comprasOk && comprasTodas[0].n > 2, JSON.stringify(compras.map((c) => [c.id, num(c.unit_cost)])) + ` · sin_filtro=${comprasTodas[0].n}`);

// ══ T5: baseline auditoría RECT-PROD ══════════════════════════════════════════
const audBase = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE trace_id='RECT-PROD'`, 'T5 baseline auditoría');
ok &= chk('T5', 'Sin auditoría previa RECT-PROD (la rectificación no se ha ejecutado antes)', audBase[0].n === 0, `n=${audBase[0].n}`);

// ══ T6: baseline fin_posting_errors ═══════════════════════════════════════════
const fpe = await q(`SELECT count(*)::int AS n, coalesce(array_to_string(ARRAY(SELECT error_code || ':' || cnt FROM (SELECT error_code, count(*)::int AS cnt FROM public.fin_posting_errors GROUP BY 1) s), ', '),'(ninguno)') AS codes FROM public.fin_posting_errors`, 'T6 fin_posting_errors');
out.baselines.fin_posting_errors = fpe[0];
ok &= chk('T6', 'fin_posting_errors: baseline registrada (comparar tras ejecución)', fpe.length === 1, `n=${fpe[0].n} ${fpe[0].codes}`);

// ══ T7: baselines de los 5 mayores (antes) ════════════════════════════════════
const mayores = await q(`SELECT category_code, coalesce(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),0)::numeric AS neto_debito_minus_credito, count(*)::int AS n_movs FROM public.fin_movements WHERE category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_VALES','GAS_PERDIDA_INV','GAS_COSTO_VENTAS') GROUP BY 1 ORDER BY 1`, 'T7 mayores');
out.baselines.mayores_antes = Object.fromEntries(mayores.map((m) => [m.category_code, { neto: num(m.neto_debito_minus_credito), n: m.n_movs }]));
const X_act = out.baselines.mayores_antes.ACT_INVENTARIO?.neto;
out.baselines.X_act = X_act;
out.baselines.esperado_despues = {
  ACT_INVENTARIO: X_act !== null ? X_act - 151299851 - 24 : null,
  PAS_CXP_PROV: X_cxp !== null ? X_cxp - 151299851 : null,
};
ok &= chk('T7', 'Baselines de los 5 mayores capturadas (X_act/X_cxp anotados para el después)',
  ['ACT_INVENTARIO','PAS_CXP_PROV','GAS_VALES','GAS_PERDIDA_INV','GAS_COSTO_VENTAS'].every((c) => out.baselines.mayores_antes[c] !== undefined),
  `X_act=${X_act} X_cxp=${X_cxp}`);

// ══ T8: colisiones de ids deterministas ═══════════════════════════════════════
const allIds = [IDS.rect1_entry, IDS.rect2_entry, IDS.fm_r1_cxp, IDS.fm_r1_inv, IDS.fm_r2_vales, IDS.fm_r2_perdida, IDS.fm_r2_inv, IDS.wcl_111, IDS.wcl_112, ...IDS.aud];
const idList = allIds.map((i) => `'${i}'`).join(',');
const colEnt = await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE id IN (${idList})`, 'T8 colisión fin_entries');
const colFm = await q(`SELECT count(*)::int AS n FROM public.fin_movements WHERE id IN (${idList})`, 'T8 colisión fin_movements');
const colWcl = await q(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE id IN (${idList})`, 'T8 colisión wac');
const colAud = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE id IN (${idList})`, 'T8 colisión audit');
ok &= chk('T8', 'Los 22 ids deterministas de la misión 009 NO colisionan en producción',
  colEnt[0].n === 0 && colFm[0].n === 0 && colWcl[0].n === 0 && colAud[0].n === 0,
  `entries=${colEnt[0].n} movements=${colFm[0].n} wcl=${colWcl[0].n} audit=${colAud[0].n}`);

// ══ T9: sin wac_change_log 'rectificacion' previo para estos SKU ═════════════
const wclPrev = await q(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE product_id IN ('${S111}','${S112}') AND event='rectificacion'`, 'T9 wac previo');
ok &= chk('T9', 'Sin filas event=rectificacion previas para SKU 111/112 (S4 idempotente)', wclPrev[0].n === 0, `n=${wclPrev[0].n}`);

// ══ Resumen ═══════════════════════════════════════════════════════════════════
const fails = checks.filter((c) => c.resultado === 'FAIL');
out.checks.resultados = checks;
out.total = { checks: checks.length, pass: checks.length - fails.length, fail: fails.length };
out.veredicto = fails.length === 0
  ? 'PREFLIGHT APROBADO — las 10 condiciones §3 de la misión y las verificaciones técnicas se cumplen; autorizada la ejecución de RECT-1 y luego RECT-2'
  : `PREFLIGHT RECHAZADO — ${fails.length} condición(es) en fallo: ${fails.map((f) => f.id).join(',')} (detener; no ejecutar)`;
mkdirSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias'), { recursive: true });
writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m060-preflight-evidencia.json'), JSON.stringify(out, null, 2));
console.log(`\n${out.veredicto}`);
console.log(`Evidencia: docs/audits/cp-fin-valuation-execution-009/evidencias/m060-preflight-evidencia.json`);
process.exit(fails.length === 0 ? 0 : 1);
