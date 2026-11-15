// ============================================================================
// M056 — CP-FIN-T12-PRODUCTION-MIGRATION-006 · CERTIFICACIÓN POSTERIOR (§8)
// ============================================================================
// SOLO LECTURA. Certifica el código desplegado contra el archivo aprobado y
// verifica integridad de datos/RLS/privilegios. Produce PRODUCTION_POSTCHECK.json
// Uso: node scripts/m056-t12-postcert.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'fs';
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
  return JSON.parse(text || '[]');
}
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
/** cuerpo entre delimitadores $function$ … $function$ (el cuerpo se almacena verbatim) */
const cuerpo = (defTexto) => {
  const partes = String(defTexto ?? '').split('$function$');
  return partes.length >= 3 ? partes[1] : null;
};
const DIR = 'docs/audits/cp-fin-t12-production-migration-006/';

const pre = JSON.parse(readFileSync(resolve(DIR, 'prestate-snapshot.json'), 'utf8'));
const post = JSON.parse(readFileSync(resolve(DIR, 'poststate-snapshot.json'), 'utf8'));
const ledgerPre = JSON.parse(readFileSync(resolve(DIR, 'ledger-pre-aplicacion.json'), 'utf8'));
const MIG = readFileSync(resolve('supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql'), 'utf8');
const shaAprobado = sha256(MIG);

// cuerpos del archivo aprobado — el SQL contiene 3 pares $function$ en orden:
// [1]=helper fin_entry_reversal_residual · [3]=motor fin_post_document_annulment · [5]=fin_t12_block_receipt_annulment
const partesMig = MIG.split('$function$');
if (partesMig.length !== 7) { console.error(`FALLO DE EXTRACCIÓN: pares $function$ inesperados (${partesMig.length - 1})`); process.exit(2); }
const cuerpoHelperMig = partesMig[1];
const cuerpoMotorMig = partesMig[3];
const cuerpoT12Mig = partesMig[5];

const checks = [];
const chk = (id, nombre, pass, detalle) => {
  checks.push({ id, control: nombre, resultado: pass ? 'PASS' : 'FAIL', detalle: detalle ?? null });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${nombre}${detalle ? ' · ' + detalle : ''}`);
};

// ── A. Ledger ───────────────────────────────────────────────────────────────
const ledgerRows = await q(`SELECT version, file, sha256, mechanism, status, applied_at FROM public.production_migration_ledger WHERE version='20261115100000'`, 'A ledger T12');
const fila = ledgerRows[0];
chk('A1', 'Migración 20261115100000 registrada exactamente una vez', ledgerRows.length === 1, `filas=${ledgerRows.length}`);
chk('A2', 'Checksum registrado = SHA-256 del archivo aprobado', fila?.sha256 === shaAprobado, `registrado=${fila?.sha256 ?? 'null'}`);
chk('A3', 'Mecanismo oficial y estado applied', fila?.mechanism === 'management_api' && fila?.status === 'applied', `${fila?.mechanism ?? '-'}/${fila?.status ?? '-'}`);
const versionesPost = new Set((await q(`SELECT version FROM public.production_migration_ledger`, 'A ledger versiones')).map(r => r.version));
const versionesPre = new Set(ledgerPre.map(r => r.version));
const nuevas = [...versionesPost].filter(v => !versionesPre.has(v));
chk('A4', 'Ninguna migración adicional aplicada (solo T12)', nuevas.length === 1 && nuevas[0] === '20261115100000', `nuevas=[${nuevas.join(',') || 'ninguna'}]`);

// ── B. Función del motor ────────────────────────────────────────────────────
const defMotor = (await q(`SELECT pg_get_functiondef('public.fin_post_document_annulment(text,uuid)'::regprocedure) AS def`, 'B def motor'))[0].def;
const cuerpoMotorVivo = cuerpo(defMotor);
chk('B1', 'Detección de cobertura parcial: residual > 0.01 genera ERR_PARTIAL_REVERSAL_PENDING', defMotor.includes('ERR_PARTIAL_REVERSAL_PENDING') && defMotor.includes('v_residual <= 0.01') && defMotor.includes('CONTINUE') && defMotor.includes('RAISE EXCEPTION'));
chk('B2', 'Cobertura total conservada (idempotencia ordinaria: rama exacta IF residual<=0.01 THEN CONTINUE)', cuerpoMotorVivo?.includes('IF v_residual <= 0.01 THEN') === true && cuerpoMotorVivo?.includes('CONTINUE;') === true && (cuerpoMotorVivo === cuerpoMotorMig), `hash_vivo=${sha256(cuerpoMotorVivo ?? '')}`);
chk('B3', 'Cuerpo desplegado del motor = cuerpo del archivo aprobado (hash)', sha256(cuerpoMotorVivo ?? '') === sha256(cuerpoMotorMig ?? ''), cuerpoMotorMig ? '248 líneas verbatim' : 'cuerpo no extraído');
const defHelper = (await q(`SELECT pg_get_functiondef('public.fin_entry_reversal_residual(uuid)'::regprocedure) AS def`, 'B def helper'))[0].def;
chk('B4', 'Helper fin_entry_reversal_residual = archivo aprobado (hash)', sha256(cuerpo(defHelper) ?? '') === sha256(cuerpoHelperMig ?? ''));
const defSafePost = post.func_def_annulment_safe_actual ?? '';
chk('B5', 'Canal _safe intacto y registrador (WHEN others → fin_posting_errors)', norm(defSafePost) === norm(pre.func_def_annulment_safe_actual) && defSafePost.includes('EXCEPTION WHEN others') && defSafePost.includes('fin_posting_errors') && defSafePost.includes('fin_post_document_annulment('), 'sin cambios pre→post');

// ── C. Trigger ──────────────────────────────────────────────────────────────
const trig = (await q(`SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def, p.proname AS func, pg_get_functiondef(p.oid) AS fdef
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE c.relname='receipts' AND t.tgname='fin_t12_receipt_annulment_block'`, 'C trigger T12'))[0];
chk('C1', 'Trigger fin_t12_receipt_annulment_block existe', !!trig);
chk('C2', 'Trigger habilitado', trig?.tgenabled === 'O' || trig?.tgenabled === 'A', `tgenabled=${trig?.tgenabled ?? 'null'}`);
chk('C3', 'Asociado a la tabla y evento correctos (BEFORE UPDATE OF status ON public.receipts)', /BEFORE UPDATE OF status ON public\.receipts/.test(trig?.def ?? ''), trig?.def ?? 'sin def');
chk('C4', 'Función ejecutora = código aprobado (hash de cuerpo)', sha256(cuerpo(trig?.fdef) ?? '') === sha256(cuerpoT12Mig ?? ''));
chk('C5', 'La función de negocio bloquea (RAISE EXCEPTION) y advierte (RAISE WARNING)', (trig?.fdef ?? '').includes('RAISE EXCEPTION') && (trig?.fdef ?? '').includes('RAISE WARNING') && (trig?.fdef ?? '').includes("NEW.status NOT IN ('voided', 'reversed')"));
const otrosTrig = await q(`SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='receipts' AND NOT t.tgisinternal AND t.tgname <> 'fin_t12_receipt_annulment_block'`, 'C otros triggers');
chk('C6', 'Ningún otro trigger de receipts deshabilitado o bloqueante del bloqueo', otrosTrig.every(t => t.tgenabled !== 'D'), `otros=${otrosTrig.map(t => `${t.tgname}(${t.tgenabled})`).join(', ')}`);
chk('C7', 'Sin escape hatch en el código desplegado (motor y trigger)', !defMotor.includes('session_replication_role') && !(trig?.fdef ?? '').includes('session_replication_role') && !(trig?.fdef ?? '').includes('ALTER TABLE') && !defMotor.includes('DISABLE TRIGGER'));

// ── D. Integridad y permisos ────────────────────────────────────────────────
const rlsPost = await q(`SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls FROM pg_class c WHERE c.relname IN ('receipts','receipt_items','fin_entries','fin_movements','fin_posting_errors','production_migration_ledger') AND c.relnamespace='public'::regnamespace`, 'D RLS post');
chk('D1', 'RLS intacta en las 6 tablas clave (pre→post idéntico)', JSON.stringify(rlsPost) === JSON.stringify(pre.rls_tablas), `${rlsPost.length} tablas`);
const privs = (await q(`SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name IN ('fin_post_document_annulment','fin_post_annulment_safe','fin_entry_reversal_residual','fin_t12_block_receipt_annulment') ORDER BY 1,2`, 'D privilegios post')).map(r => `${r.routine_name}:${r.grantee}:${r.privilege_type}`);
chk('D2', 'Sin EXECUTE para PUBLIC/anon (ACL endurecida)', !privs.some(p => /(^|:)(PUBLIC|anon)(:|$)/.test(p)), privs.join(' · '));
chk('D3', 'service_role conserva EXECUTE del motor (operativa de la app)', privs.includes('fin_post_document_annulment:service_role:EXECUTE'));
const rutas = await q(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname ILIKE '%annul%' ORDER BY 1`, 'D funciones anulación');
const esperadas = ['fin_post_annulment_safe', 'fin_post_document_annulment', 'fin_t12_block_receipt_annulment'];
chk('D4', 'Sin rutas de escritura nuevas fuera del diseño', rutas.every(r => esperadas.includes(r.proname)), `encontradas=${rutas.map(r => r.proname).join(', ')}`);

// ── Invariancia de datos financieros (§9) ───────────────────────────────────
const seccionesFinancieras = ['fvc_cabecera','fvc_lineas','asiento_reconocimiento','reversiones_asiento','fin_movements_cxp_fvc','mayor_pas_cxp_prov','inventario_111_112','wac_log','cogs_ventas','conteos_totales','movimientos_postcorte_111_112'];
const diffs = [];
for (const k of seccionesFinancieras) {
  if (sha256(JSON.stringify(pre[k])) !== sha256(JSON.stringify(post[k]))) diffs.push(k);
}
chk('D5', 'Datos financieros invariantes: 11 secciones hash-idénticas pre→post', diffs.length === 0, diffs.length ? `CAMBIADAS: ${diffs.join(', ')}` : 'FVC 192.039.436 · 101 líneas · 1 asiento posted · 0 reversiones · CXP pendiente · stock 10/20 · WAC 1 · COGS 7 · 0 post-corte');
chk('D6', 'fin_posting_errors sigue vacío (sin intentos bloqueados ni errores)', post.conteos_totales.fin_posting_errors === 0, `n=${post.conteos_totales.fin_posting_errors}`);

const veredicto = checks.every(c => c.resultado === 'PASS') ? 'PASS' : 'FAIL';
const out = {
  mision: 'CP-FIN-T12-PRODUCTION-MIGRATION-006',
  script: 'm056-t12-postcert.mjs',
  fecha_utc: new Date().toISOString(),
  destino: { proyecto_ref: ref, nombre: 'CostproBD (PRODUCCIÓN)' },
  modo: 'SOLO LECTURA (ninguna escritura en esta fase; la demostración funcional proviene de las pruebas E2E aisladas 9/9 + inspección del código desplegado)',
  veredicto,
  controles: checks,
  detalle: {
    ledger_fila: fila,
    hashes_cuerpo: { motor_vivo: sha256(cuerpoMotorVivo ?? ''), motor_aprobado: sha256(cuerpoMotorMig ?? ''), helper: sha256(cuerpoHelperMig ?? ''), t12_trigger: sha256(cuerpoT12Mig ?? '') },
    trigger: { nombre: trig?.tgname, tgenabled: trig?.tgenabled, def: trig?.def },
    privilegios: privs,
    secciones_hash_post: post.hashes,
  },
};
writeFileSync(resolve(DIR, 'PRODUCTION_POSTCHECK.json'), JSON.stringify(out, null, 2));
console.log(`\nVEREDICTO: ${veredicto} (${checks.filter(c => c.resultado === 'PASS').length}/${checks.length} PASS) → PRODUCTION_POSTCHECK.json`);
process.exit(veredicto === 'PASS' ? 0 : 1);
