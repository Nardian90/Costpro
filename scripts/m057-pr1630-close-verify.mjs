// ============================================================================
// M057 — CP-FIN-T12-PR-CLOSE-007 · VERIFICACIÓN READ-ONLY PARA CIERRE PR #1630
// Solo SELECT contra producción (Management API /database/query; el POST es
// exclusivamente el transporte del endpoint). Sin DML/DDL en la BD.
// Guard: el destino debe ser producción identificada (wthkddeleylijmonclxg).
// Uso: node scripts/m057-pr1630-close-verify.mjs premerge|postmerge [out.json]
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const MODE = process.argv[2];
if (MODE !== 'premerge' && MODE !== 'postmerge') {
  console.error('Uso: node scripts/m057-pr1630-close-verify.mjs premerge|postmerge [out.json]');
  process.exit(1);
}

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN ausente en .env local'); process.exit(2); }
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción identificada (wthkddeleylijmonclxg)');
  process.exit(2);
}

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
const cuerpo = (defTexto) => {
  const partes = String(defTexto ?? '').split('$function$');
  return partes.length >= 3 ? partes[1] : null;
};

const DIR = 'docs/audits/cp-fin-t12-production-migration-006/';
const MIG = readFileSync(resolve('supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql'), 'utf8');
const shaAprobado = sha256(MIG);
const partesMig = MIG.split('$function$');
if (partesMig.length !== 7) { console.error(`FALLO DE EXTRACCIÓN: pares $function$ inesperados (${partesMig.length - 1})`); process.exit(2); }
const cuerpoHelperMig = partesMig[1];
const cuerpoMotorMig = partesMig[3];
const cuerpoT12Mig = partesMig[5];

// Invariantes financieros de referencia (misión 006, tabla §6)
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENTRY = '93bb5da9-0afd-4325-baad-a275710062c5';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const checks = [];
const chk = (id, nombre, pass, detalle) => {
  checks.push({ id, control: nombre, resultado: pass ? 'PASS' : 'FAIL', detalle: detalle ?? null });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${nombre}${detalle ? ' · ' + String(detalle).slice(0, 140) : ''}`);
};

const out = {
  mision: 'CP-FIN-T12-PR-CLOSE-007',
  script: 'm057-pr1630-close-verify.mjs',
  modo: MODE,
  capturado_utc: new Date().toISOString(),
  objetivo: { proyecto_ref: ref, etiqueta: 'CostproBD (PRODUCCIÓN)', solo_lectura: true },
  sha_migracion_aprobada: shaAprobado,
  checks
};

// ── A. Ledger: única aplicación de la migración T12 ────────────────────────
const ledgerRows = await q(`SELECT version, file, sha256, mechanism, status, applied_at FROM public.production_migration_ledger WHERE version='20261115100000'`, 'A ledger T12');
chk('A1', 'Ledger registra exactamente UNA aplicación de 20261115100000', ledgerRows.length === 1, `filas=${ledgerRows.length}`);
chk('A2', 'SHA-256 de la migración en el ledger = archivo aprobado', ledgerRows[0]?.sha256 === shaAprobado, `ledger=${(ledgerRows[0]?.sha256 ?? '').slice(0, 12)}… aprobado=${shaAprobado.slice(0, 12)}…`);
chk('A3', 'Estado de la aplicación = applied', ledgerRows[0]?.status === 'applied', ledgerRows[0]?.status ?? null);
const ledgerTotal = await q(`SELECT count(*)::int AS n FROM public.production_migration_ledger`, 'A ledger total');
const ledgerPostT12 = await q(`SELECT version, applied_by, applied_at FROM public.production_migration_ledger WHERE applied_at > '${(ledgerRows[0] ?? {}).applied_at ?? '1970-01-01'}' ORDER BY applied_at`, 'A ledger post-T12');
// 60 filas al cierre de la misión 006 (incluye T12). Cualquier entrada posterior
// pertenece a OTRAS misiones autorizadas — se documenta, no se interpreta como drift de T12.
chk('A4', 'Ledger: base 60 (cierre 006) + entradas posteriores de otras misiones documentadas (total=' + ledgerTotal[0]?.n + ')',
  ledgerTotal[0]?.n >= 60 && ledgerPostT12.every(r => !String(r.version).startsWith('20261115100000')),
  'post-T12=' + JSON.stringify(ledgerPostT12));

// ── B. Helper fin_entry_reversal_residual (función señalada por el gate) ────
const helperDef = await q(`SELECT pg_get_functiondef('public.fin_entry_reversal_residual(uuid)'::regprocedure) AS def`, 'B helper def');
const cuerpoHelperVivo = cuerpo(helperDef[0]?.def);
chk('B1', 'Helper existe en producción', !!cuerpoHelperVivo);
chk('B2', 'Cuerpo vivo del helper = cuerpo aprobado en migración T12 (hash)', sha256(cuerpoHelperVivo ?? '') === sha256(cuerpoHelperMig));
const helperMeta = await q(`SELECT prosecdef, provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_entry_reversal_residual'`, 'B helper meta');
chk('B3', 'Helper SECURITY DEFINER STABLE (sin escritura)', helperMeta[0]?.prosecdef === true && helperMeta[0]?.provolatile === 's', JSON.stringify(helperMeta[0] ?? {}));
const helperAcl = await q(`SELECT coalesce(array_to_string(ARRAY(SELECT COALESCE(r.rolname, grantee::text) || '=' || privilege_type FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) LEFT JOIN pg_roles r ON r.oid = grantee), ', '),'(null=default)') AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_entry_reversal_residual'`, 'B helper acl');
chk('B4', 'ACL del helper: sin PUBLIC ni anon con EXECUTE', !/(^|, )\s*(PUBLIC|anon)\s*=/.test(helperAcl[0]?.acl ?? 'PUBLIC'), helperAcl[0]?.acl ?? null);

// ── C. Motor fin_post_document_annulment (T12) ──────────────────────────────
const motorDef = await q(`SELECT pg_get_functiondef('public.fin_post_document_annulment(text, uuid)'::regprocedure) AS def`, 'C motor def');
const cuerpoMotorVivo = cuerpo(motorDef[0]?.def);
chk('C1', 'Motor existe en producción (firma text, uuid)', !!cuerpoMotorVivo);
chk('C2', 'Cuerpo vivo del motor = cuerpo aprobado en migración T12 (hash)', sha256(cuerpoMotorVivo ?? '') === sha256(cuerpoMotorMig));
chk('C3', 'Motor contiene ERR_PARTIAL_REVERSAL_PENDING', (cuerpoMotorVivo ?? '').includes('ERR_PARTIAL_REVERSAL_PENDING'));

// ── D. Trigger fin_t12_receipt_annulment_block ──────────────────────────────
const trig = await q(`SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def, pg_get_functiondef(t.tgfoid) AS fdef FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='receipts' AND t.tgname='fin_t12_receipt_annulment_block'`, 'D trigger');
const cuerpoTrigVivo = cuerpo(trig[0]?.fdef);
chk('D1', 'Trigger existe y habilitado', trig.length === 1 && (trig[0]?.tgenabled === 'O' || trig[0]?.tgenabled === 'A'), `tgenabled=${trig[0]?.tgenabled ?? 'null'}`);
chk('D2', 'Cuerpo vivo de la función trigger = código aprobado (hash)', sha256(cuerpoTrigVivo ?? '') === sha256(cuerpoT12Mig));
chk('D3', 'Trigger montado en receipts BEFORE UPDATE OF status', /BEFORE UPDATE OF status ON public\.receipts/.test(trig[0]?.def ?? ''));
const otrosTrig = await q(`SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='receipts' AND NOT t.tgisinternal AND t.tgname <> 'fin_t12_receipt_annulment_block'`, 'D otros triggers');
chk('D4', 'Ningún otro trigger de receipts deshabilitado (D)', otrosTrig.every(t => t.tgenabled !== 'D'), JSON.stringify(otrosTrig));

// ── E. Invariantes financieros (misiones 006/007: cero cambios) ────────────
const fvc = await q(`SELECT id, status, total_cost FROM receipts WHERE id='${FVC}'`, 'E FVC cabecera');
chk('E1', 'FAC-VITALLCONS-001 sigue active', String(fvc[0]?.status).toLowerCase() === 'active', `status=${fvc[0]?.status}`);
chk('E2', 'Total de cabecera = 192039436.000000000', String(fvc[0]?.total_cost ?? '') === '192039436.000000000', String(fvc[0]?.total_cost));
const lineas = await q(`SELECT count(*)::int AS n, round(sum(quantity*unit_cost*coalesce(tasa_cambio_recepcion,1))::numeric,2) AS suma_recomputada FROM receipt_items WHERE receipt_id='${FVC}'`, 'E FVC líneas');
chk('E3', 'Líneas de la recepción = 101 y suma recomputada = 192039436.00', lineas[0]?.n === 101 && String(lineas[0]?.suma_recomputada) === '192039436.00', `n=${lineas[0]?.n} suma=${lineas[0]?.suma_recomputada}`);
const asientos = await q(`SELECT count(*)::int AS n, (array_agg(id ORDER BY posted_at))[1] AS first_id FROM public.fin_entries WHERE document_id='${FVC}' AND document_type='RECEPCION' AND status='posted' AND event IN ('reconocimiento','pago')`, 'E asientos posted');
chk('E4', 'Asiento posted original único e intacto', asientos[0]?.n === 1 && asientos[0]?.first_id === ENTRY, `n=${asientos[0]?.n} id=${asientos[0]?.first_id}`);
const revs = await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE reversal_of='${ENTRY}'`, 'E reversiones');
chk('E5', 'Cero reversiones vinculadas a la recepción', revs[0]?.n === 0, `n=${revs[0]?.n}`);
const cxp = await q(`SELECT payment_status FROM receipts WHERE id='${FVC}'`, 'E CXP estado');
chk('E6', 'CXP de la recepción pendiente de pago (unpaid)', cxp[0]?.payment_status === 'unpaid', `payment_status=${cxp[0]?.payment_status}`);
const stocks = await q(`SELECT id, stock_current FROM public.products WHERE id IN ('${S111}','${S112}') ORDER BY id`, 'E stocks');
const qty111 = stocks.find(r => r.id === S111)?.stock_current;
const qty112 = stocks.find(r => r.id === S112)?.stock_current;
chk('E7', 'Stock SKU111 = 10', Number(qty111) === 10, `qty=${qty111}`);
chk('E8', 'Stock SKU112 = 20', Number(qty112) === 20, `qty=${qty112}`);
const wac = await q(`SELECT id, cost_average FROM public.products WHERE id IN ('${S111}','${S112}') ORDER BY id`, 'E WAC');
chk('E9', 'WAC SKU111/SKU112 = 1 CUP', Number(wac.find(r => r.id === S111)?.cost_average) === 1 && Number(wac.find(r => r.id === S112)?.cost_average) === 1, JSON.stringify(wac.map(r => ({ id: r.id.slice(0, 8), wac: r.cost_average }))));
const cogs = await q(`WITH tx AS (
    SELECT sm.reference_id::uuid AS tx_id FROM public.stock_movements sm
    WHERE sm.product_id IN ('${S111}','${S112}') AND sm.movement_type='sale' AND sm.reference_id IS NOT NULL)
  SELECT coalesce(sum(fm.amount_cup),0) AS total, count(*)::int AS n
  FROM public.fin_movements fm JOIN public.fin_entries e ON e.id=fm.entry_id
  WHERE e.document_type='VENTA' AND e.document_id IN (SELECT tx_id FROM tx)
    AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'`, 'E COGS');
chk('E10', 'COGS ventas SKU111/112 = 7 CUP (sin cambios)', Number(cogs[0]?.total) === 7 && Number(cogs[0]?.n) > 0, `total=${cogs[0]?.total} n=${cogs[0]?.n}`);
const errores = await q(`SELECT count(*)::int AS n FROM public.fin_posting_errors`, 'E fin_posting_errors');
chk('E11', 'fin_posting_errors = 0 (sin intentos de anulación bloqueada ni errores)', errores[0]?.n === 0, `n=${errores[0]?.n}`);

// ── F. Superficie de funciones (drift general) ──────────────────────────────
const census = await q(`SELECT count(*)::int AS sd FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef`, 'F census SD');
out.census = { security_definer: census[0]?.sd };

const fails = checks.filter(c => c.resultado === 'FAIL').length;
out.veredicto = fails === 0 ? 'PASS' : 'FAIL';
out.resumen = { total: checks.length, pass: checks.length - fails, fail: fails };

const OUT = process.argv[3] || resolve(DIR, `pr1630-${MODE}-evidence.json`);
writeFileSync(resolve(OUT), JSON.stringify(out, null, 2));
console.log(`\nVEREDICTO (${MODE}): ${out.veredicto} (${checks.length - fails}/${checks.length} PASS) → ${OUT}`);
process.exit(fails === 0 ? 0 : 1);
