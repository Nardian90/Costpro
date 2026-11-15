// ============================================================================
// M054 — CP-FIN-T12-PRODUCTION-MIGRATION-006 · CAPTURA DE ESTADO PREVIO (§6)
// READ-ONLY ESTRICTO sobre producción (Management API, solo SELECT).
// Congela: identidad de la BD, estado financiero de referencia (tabla §6),
// definiciones de funciones a reemplazar, triggers, RLS y privilegios.
// NO ESCRIBE nada en la BD. Guard: ref debe ser wthkddeleylijmonclxg.
// Uso: node scripts/m054-t12-prod-prestate.mjs [out.json]
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: destino no es producción identificada'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENTRY = '93bb5da9-0afd-4325-baad-a275710062c5';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';

const OUT = process.argv[2] || resolve('docs/audits/cp-fin-t12-production-migration-006/prestate-snapshot.json');

const out = { mision: 'CP-FIN-T12-PRODUCTION-MIGRATION-006', script: 'm054-t12-prod-prestate.mjs',
  capturado_utc: new Date().toISOString(), objetivo: { proyecto_ref: ref, etiqueta: 'CostproBD (PRODUCCIÓN)' } };

// ── 1. Identidad de la BD ──────────────────────────────────────────────────
out.identidad = (await q(`SELECT current_database() AS db, current_user AS usr, current_setting('server_version') AS pg, now() AS server_now`, 'identidad'))[0];

// ── 2. Estado financiero de referencia (tabla §6 de la misión) ─────────────
out.fvc_cabecera = await q(`SELECT id, document_number, status, total_cost, payment_status, created_at, updated_at FROM receipts WHERE id='${FVC}'`, 'FVC cabecera');
out.fvc_lineas = (await q(`SELECT count(*)::int AS n, round(sum(quantity*unit_cost*coalesce(tasa_cambio_recepcion,1))::numeric,2) AS suma_recomputada FROM receipt_items WHERE receipt_id='${FVC}'`, 'FVC líneas'))[0];
out.asiento_reconocimiento = await q(`SELECT id, event, status, document_type, document_id, reversal_of, posted_at,
  (SELECT coalesce(sum(amount_cup),0) FROM fin_movements WHERE entry_id=e.id AND sense='debito') AS suma_debito_cup,
  (SELECT coalesce(sum(amount_cup),0) FROM fin_movements WHERE entry_id=e.id AND sense='credito') AS suma_credito_cup
  FROM fin_entries e WHERE id='${ENTRY}'`, 'asiento 93bb5da9');
out.reversiones_asiento = await q(`SELECT count(*)::int AS n FROM fin_entries WHERE reversal_of='${ENTRY}'`, 'reversiones del asiento');
out.fin_movements_cxp_fvc = await q(`SELECT fm.id, fm.entry_id, fe.document_type, fe.document_number, fe.event, fm.category_code,
      fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description, fm.traza, fe.reversal_of
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='PAS_CXP_PROV' AND (fm.document_number LIKE '%VITALLCONS%' OR fe.document_id='${FVC}')
   ORDER BY fm.economic_date`, 'fin_movements CXP FVC/Vitallcons');
out.mayor_pas_cxp_prov = await q(`SELECT fe.document_type, fe.event, fm.sense, count(*)::int AS n_movs, sum(fm.amount_cup)::float8 AS total
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='PAS_CXP_PROV' GROUP BY fe.document_type, fe.event, fm.sense
   ORDER BY fe.document_type, fm.sense`, 'mayor PAS_CXP_PROV');
out.inventario_111_112 = await q(`SELECT product_id, store_id, quantity FROM inventory WHERE product_id IN ('${S111}','${S112}') AND store_id='${STORE}'`, 'inventario 111/112');
out.wac_log = await q(`SELECT product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at FROM wac_change_log WHERE product_id IN ('${S111}','${S112}') ORDER BY created_at`, 'wac_change_log');
out.cogs_ventas = await q(`WITH tx AS (
    SELECT sm.reference_id::uuid AS tx_id FROM public.stock_movements sm
    WHERE sm.product_id IN ('${S111}','${S112}') AND sm.movement_type='sale' AND sm.reference_id IS NOT NULL)
  SELECT coalesce(sum(fm.amount_cup),0) AS total, count(*)::int AS n
  FROM public.fin_movements fm JOIN public.fin_entries e ON e.id=fm.entry_id
  WHERE e.document_type='VENTA' AND e.document_id IN (SELECT tx_id FROM tx)
    AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'`, 'COGS ventas SKU (total)');

// movimientos/asientos totales y posteriores al corte 005 (2026-11-14T18:58Z)
out.conteos_totales = (await q(`SELECT (SELECT count(*)::int FROM fin_entries) AS fin_entries, (SELECT count(*)::int FROM fin_movements) AS fin_movements, (SELECT count(*)::int FROM receipts) AS receipts, (SELECT count(*)::int FROM receipt_items) AS receipt_items, (SELECT count(*)::int FROM fin_posting_errors) AS fin_posting_errors`, 'conteos totales'))[0];
out.movimientos_postcorte_111_112 = await q(`SELECT sm.id, p.sku, sm.movement_type, sm.quantity_change, sm.reference_doc, sm.movement_date, sm.created_at
   FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
   WHERE sm.product_id IN ('${S111}','${S112}') AND sm.created_at > '2026-11-14T18:58:17.447Z'
   ORDER BY sm.created_at`, 'kardex 111/112 post-corte 005');

// ── 3. Estado de esquema: funciones a reemplazar / triggers / RLS / ACL ────
out.func_def_annulment_actual = (await q(`SELECT pg_get_functiondef('public.fin_post_document_annulment(text,uuid)'::regprocedure) AS def`, 'def fin_post_document_annulment (pre)'))[0]?.def || null;
out.func_def_annulment_safe_actual = (await q(`SELECT pg_get_functiondef('public.fin_post_annulment_safe(text,uuid)'::regprocedure) AS def`, 'def fin_post_annulment_safe (pre)'))[0]?.def || null;
out.func_residual_existe = (await q(`SELECT to_regprocedure('public.fin_entry_reversal_residual(uuid)') IS NOT NULL AS existe`, 'fin_entry_reversal_residual pre-existencia'))[0];
out.func_t12block_existe = (await q(`SELECT to_regprocedure('public.fin_t12_block_receipt_annulment()') IS NOT NULL AS existe`, 'fin_t12_block_receipt_annulment pre-existencia'))[0];
out.triggers_receipts = await q(`SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def, p.proname AS func FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE c.relname='receipts' AND NOT t.tgisinternal ORDER BY t.tgname`, 'triggers de receipts (pre)');
out.rls_tablas = await q(`SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls FROM pg_class c WHERE c.relname IN ('receipts','receipt_items','fin_entries','fin_movements','fin_posting_errors','production_migration_ledger') AND c.relnamespace='public'::regnamespace`, 'RLS tablas clave (pre)');
out.privilegios_funciones = await q(`SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name IN ('fin_post_document_annulment','fin_post_annulment_safe','fin_entry_reversal_residual','fin_t12_block_receipt_annulment') ORDER BY routine_name, grantee`, 'privilegios funciones (pre)');
out.proacl_annulment = (await q(`SELECT coalesce(array_agg((pe.grantee::pg_catalog.text, pe.privilege_type)::text ORDER BY 1), '{}') AS acl FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) pe WHERE p.oid='public.fin_post_document_annulment(text,uuid)'::regprocedure`, 'proacl annulment (pre)'))[0];

// ── 4. Ledger de migraciones (pre) ─────────────────────────────────────────
out.ledger_t12_pre = (await q(`SELECT count(*)::int AS n FROM public.production_migration_ledger WHERE version='20261115100000'`, 'ledger T12 (pre)'))[0];
out.ledger_ultima = (await q(`SELECT version, file, applied_at, status FROM public.production_migration_ledger ORDER BY applied_at DESC LIMIT 1`, 'ledger última fila (pre)'))[0];

// ── 5. Hashes de secciones ─────────────────────────────────────────────────
out.hashes = {};
for (const k of ['fvc_cabecera','fvc_lineas','asiento_reconocimiento','reversiones_asiento','fin_movements_cxp_fvc','mayor_pas_cxp_prov','inventario_111_112','wac_log','cogs_ventas','conteos_totales','movimientos_postcorte_111_112','func_def_annulment_actual','func_def_annulment_safe_actual','triggers_receipts','rls_tablas','privilegios_funciones','proacl_annulment']) {
  out.hashes[k] = sha256(JSON.stringify(out[k]));
}

mkdirSync(resolve('docs/audits/cp-fin-t12-production-migration-006'), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Guardado: ${OUT} (${statSync(OUT).size} bytes)`);
console.log('PRE-STATE congelado — READ-ONLY. La BD no fue modificada.');
