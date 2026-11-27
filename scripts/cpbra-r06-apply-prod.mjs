#!/usr/bin/env node
/**
 * cpbra-r06-apply-prod.mjs — CP-BRA-R06-FINAL-CERTIFICATION-001.
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración de
 * autorización de recepciones R-06
 * (20261128120000_cpbra_r06_reception_authorization.sql) UNA SOLA VEZ
 * (regla de oro §11g), por el canal gobernado (patrón cpbra-tp/r03/r26):
 *   · guard scripts/lib/assert-not-production.mjs con el doble flag explícito;
 *   · PRE: captura del estado previo (drift pre-aplicación) + detección de
 *     «ya aplicada» (idempotente — si las marcas están, se SALTA);
 *   · aplicación UNA SOLA VEZ + NOTIFY pgrst (recarga PostgREST);
 *   · POST: verificación de marcas re-ejecutable (--check) + hash de cuerpo
 *     de register_reception (PRE→POST) como evidencia del cambio de barrera.
 *
 *   Check producción: node scripts/cpbra-r06-apply-prod.mjs --check
 *   Aplicación:      ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpbra-r06-apply-prod.mjs
 * Expediente: docs/audits/CP-BRA-R06-FINAL-CERTIFICATION-001/PRODUCTION-APPLICATION.md
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const MIG_FILE = 'supabase/migrations/20261128120000_cpbra_r06_reception_authorization.sql';

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpbra-r06-apply-prod.mjs' });

const apiBase = `https://api.supabase.com/v1/projects/${PROD_REF}/database/query`;
async function runSql(query) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const sqlPath = join(REPO, MIG_FILE);
const fileSha = createHash('sha256').update(readFileSync(sqlPath)).digest('hex');
console.log(`[sha256] ${MIG_FILE}\n  ${fileSha}`);

/* ── Firmas regprocedure de los 10 RPC con gate ─────────────────────────── */
const SIG = {
  register_reception: 'public.register_reception(uuid,text,timestamp with time zone,text,jsonb,uuid,uuid,text,text,text,text)',
  receive_against_po: 'public.receive_against_po(uuid,jsonb,uuid,timestamp with time zone,text)',
  confirm_pending_reception: 'public.confirm_pending_reception(uuid,uuid,timestamp with time zone)',
  void_pending_reception: 'public.void_pending_reception(uuid,uuid,text,timestamp with time zone)',
  reverse_receipt_v2: 'public.reverse_receipt_v2(uuid,text,uuid)',
  delete_pending_reception: 'public.delete_pending_reception(uuid,uuid)',
  save_pending_reception_changes: 'public.save_pending_reception_changes(uuid,jsonb,jsonb,jsonb,uuid)',
  add_reception_items: 'public.add_reception_items(uuid,jsonb,uuid)',
  update_reception_items: 'public.update_reception_items(uuid,jsonb,uuid)',
  update_receipt_item_tasa: 'public.update_receipt_item_tasa(uuid,numeric,text,text,uuid)',
};
const fn = (name) => `pg_get_functiondef('${SIG[name]}'::regprocedure)`;

/* ── PRE: estado previo en producción ──────────────────────────────────── */
const pre = await runSql(`
  SELECT
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='can_create_reception') AS helpers_presentes,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='receipts'
      AND policyname='receipts_tenant_update') AS policy_tenant_update,
    md5(${fn('register_reception')}) AS body_hash_register_prev,
    (SELECT ${fn('register_reception')} LIKE '%has_store_access_as%') AS gate_previo_register,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname='receipts' AND t.tgname='trg_receipts_pin_creator' AND NOT t.tgisinternal) AS trigger_previo;
`);
console.log('\n=== PRE (evidencia del estado previo en producción) ===');
console.log(JSON.stringify(pre[0], null, 1));
const p = pre[0];

if (p.helpers_presentes >= 1 && p.trigger_previo === 1) {
  console.log('\n→ R-06 YA APLICADA en producción (helpers + trigger presentes). Nada que hacer.');
  const ok = await checkMarks();
  process.exit(ok ? 0 : 1);
}

/* ── POST: marcas re-ejecutables ────────────────────────────────────────── */
const MARKS = {
  helper_superadmin_uid: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_superadmin_uid')`,
  helper_can_create: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='can_create_reception')`,
  helper_can_manage: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='can_manage_reception')`,
  acl_helpers_sin_public: `NOT has_function_privilege('anon', 'public.can_create_reception(uuid, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.can_manage_reception(uuid, uuid, uuid)', 'EXECUTE')`,
  gate_register: `${fn('register_reception')} LIKE '%can_create_reception(v_caller_uid, p_store_id)%'`,
  gate_receive_against_po: `${fn('receive_against_po')} LIKE '%can_create_reception(auth.uid(), v_store_id)%'`,
  gate_confirm: `${fn('confirm_pending_reception')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id)%'`,
  audit_confirm_en_bd: `${fn('confirm_pending_reception')} LIKE '%RECEPTION_CONFIRMED_PENDING%'`,
  gate_void: `${fn('void_pending_reception')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_receipt.store_id)%'`,
  gate_reverse: `${fn('reverse_receipt_v2')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_receipt.store_id)%'`,
  gate_delete_draft: `${fn('delete_pending_reception')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id)%'`,
  gate_save_draft: `${fn('save_pending_reception_changes')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id)%'`,
  gate_add_items: `${fn('add_reception_items')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id)%'`,
  gate_update_items: `${fn('update_reception_items')} LIKE '%can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id)%'`,
  gate_tasa: `${fn('update_receipt_item_tasa')} LIKE '%can_manage_reception(v_caller_uid, v_item.receipt_creator, v_store_id)%'`,
  viejo_gate_register_retirado: `NOT (${fn('register_reception')} LIKE '%has_store_access_as%')`,
  trigger_pin_creator: `(SELECT count(*) = 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname='receipts' AND t.tgname='trg_receipts_pin_creator' AND NOT t.tgisinternal)`,
  trigger_inmutable: `pg_get_functiondef('public.receipts_pin_creator()'::regprocedure) LIKE '%ERR_CREATOR_IMMUTABLE%'`,
  policy_insert_encargado: `(SELECT count(*) = 1 FROM pg_policies WHERE schemaname='public' AND tablename='receipts'
    AND policyname='receipts_insert_rls' AND with_check LIKE '%encargado%')`,
  policy_update_creador: `(SELECT count(*) = 1 FROM pg_policies WHERE schemaname='public' AND tablename='receipts'
    AND policyname='receipts_update_rls' AND qual LIKE '%user_id = auth.uid()%')`,
  policy_tenant_update_retirada: `(SELECT count(*) = 0 FROM pg_policies WHERE schemaname='public' AND tablename='receipts'
    AND policyname='receipts_tenant_update')`,
  policy_delete_pendiente: `(SELECT count(*) = 1 FROM pg_policies WHERE schemaname='public' AND tablename='receipts'
    AND policyname='receipts_delete_rls' AND qual LIKE '%pending%')`,
  policy_items_insert_encargado: `(SELECT count(*) = 1 FROM pg_policies WHERE schemaname='public' AND tablename='receipt_items'
    AND policyname='receipt_items_insert_isolated' AND with_check LIKE '%encargado%')`,
};

async function checkMarks() {
  let allOk = true;
  for (const [k, q] of Object.entries(MARKS)) {
    let ok = false;
    try {
      const rows = await runSql(`SELECT (${q}) AS ok`);
      ok = rows[0]?.ok === true;
    } catch (e) {
      ok = false; // función/objeto aún no presente — marca ausente, no crash del chequeo
    }
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${k}`);
  }
  return allOk;
}

console.log('\nDestino: wthkddeleylijmonclxg (PRODUCCIÓN CostproBD)');

if (checkOnly) {
  console.log('\n== --check (no escribe) ==');
  const ok = await checkMarks();
  console.log(ok ? '\nCHECK OK — R-06 presente en producción.' : '\nCHECK: marcas ausentes (migración NO aplicada en producción).');
  process.exit(ok ? 0 : 1);
}

console.log('\n== Aplicando (UNA SOLA VEZ) ==');
try {
  await runSql(readFileSync(sqlPath, 'utf8'));
  console.log('SQL ejecutado sin error.');
} catch (e) {
  console.error(`FALLO al aplicar: ${String(e.message).slice(0, 400)}`);
  process.exit(1);
}

console.log('\n== Recarga PostgREST (mecanismo canónico) ==');
await runSql("NOTIFY pgrst, 'reload schema';");
console.log("NOTIFY pgrst 'reload schema' enviado.");

console.log('\n== POST: verificación de marcas ==');
const okNow = await checkMarks();
if (!okNow) { console.error('FALLO: marcas ausentes tras aplicar. DETENER y diagnosticar.'); process.exit(1); }

const post = await runSql(`SELECT md5(${fn('register_reception')}) AS body_hash_register_post;`);
console.log(`\nbody_hash register_reception: PRE ${p.body_hash_register_prev} → POST ${post[0]?.body_hash_register_post}`);
console.log('\n→ R-06 aplicada y verificada en producción (encargado crea, creador interviene, superadmin global).');
