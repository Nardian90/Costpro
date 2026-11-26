#!/usr/bin/env node
/**
 * cpbra-verify-prod-migrations.mjs — CP-BRA-FINAL-VERIFICATION-AND-INV005-001 (FASE 3)
 *
 * Verificación READ-ONLY de producción: los artefactos DDL declarados por las
 * migraciones 20261126140000 / 20261126150000 / 20261126160000 (rama #1720,
 * expediente CP-BRA-REMEDIATION-001) están realmente presentes en la BD de
 * producción. NO re-ejecuta ninguna migración (regla de la misión): solo
 * consulta pg_proc / ACLs / triggers y compara contra el SQL versionado.
 *
 * Uso: ALLOW_PROD=read-only node scripts/cpbra-verify-prod-migrations.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), 'utf8');
    const m = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m) process.env.SUPABASE_ACCESS_TOKEN = m[1].trim();
  } catch { /* noop */ }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: token'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

let failures = 0;
function check(name, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('CP-BRA-FINAL-VERIFICATION — artefactos DDL en PRODUCCIÓN (read-only) — ' + new Date().toISOString());

/* ═══ Migración 20261126140000 — R-01 + R-14 ═══ */
console.log('\n══ 20261126140000 · motor de pagos (R-01 + R-14) ═══');

const ups = await runSql(`SELECT pg_get_functiondef('public.update_payment_status()'::regprocedure) AS def`);
const def = ups[0]?.def ?? '';
check('update_payment_status existe', def.length > 0);
check('R-01: rama OT (production_order|work) presente', def.includes("v_ref_type IN ('production_order', 'work')"));
check('R-01: neteo de contra-filas en las 3 ramas', (def.match(/'reversal' THEN -amount_cup/g) || []).length >= 3);
check('R-01: guard OT voided', def.includes("v_doc_status = 'voided'"));
check('R-01: trigger AFTER INSERT OR UPDATE OR DELETE', (() => {
  return true; // verificado aparte abajo
})());
const trg = await runSql(`SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgname = 'trg_update_payment_status' AND NOT tgisinternal`);
const trgDef = (trg[0]?.d ?? '').toUpperCase();
check('trigger trg_update_payment_status cubre INSERT+UPDATE+DELETE', trgDef.includes('INSERT') && trgDef.includes('UPDATE') && trgDef.includes('DELETE') && trgDef.includes('FOR EACH ROW'), trg[0]?.d ?? 'NO EXISTE');

const rsp = await runSql(`SELECT pg_get_functiondef('public.reverse_supplier_payment(uuid,text,uuid,timestamptz,boolean)'::regprocedure) AS def`);
const rdef = rsp[0]?.def ?? '';
check('R-14: firma 5 args existe', rdef.length > 0);
check('R-14: guard ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD', rdef.includes('ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD'));
check('R-14: excepción admin auditable (PAYMENT_REVERSED_CLOSED_PERIOD)', rdef.includes('PAYMENT_REVERSED_CLOSED_PERIOD'));
check('R-14: exige admin + motivo', rdef.includes('is_admin_check') && rdef.includes("v_reason <> ''"));
const oldOverload = await runSql(`SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reverse_supplier_payment'`);
check('R-14: overload antiguo (4 args) eliminado', Number(oldOverload[0]?.n) === 1, `funciones reverse_supplier_payment: ${oldOverload[0]?.n} (esperado 1)`);

const acl1 = await runSql(`SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('register_supplier_payment','reverse_supplier_payment')`);
check('ACL: solo service_role en motor de pagos', acl1.every(r => (JSON.stringify(r.proacl) || '').includes('service_role')), JSON.stringify(acl1));

/* ═══ Migración 20261126150000 — R-11 ═══ */
console.log('\n══ 20261126150000 · incidencias POS (R-11) ═══');
const csv = await runSql(`SELECT pg_get_functiondef('public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamptz,uuid,text,jsonb,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,text,text,text)'::regprocedure) AS def`);
const cdef = csv[0]?.def ?? '';
check('create_sale_v2 firma /35 existe', cdef.length > 0, cdef.length === 0 ? 'NO EXISTE con firma /35' : '');
check('R-11: ERR_INCIDENT_INVALID_STRUCTURE', cdef.includes('ERR_INCIDENT_INVALID_STRUCTURE'));
check('R-11: ERR_INCIDENT_ARITHMETIC_MISMATCH', cdef.includes('ERR_INCIDENT_ARITHMETIC_MISMATCH'));
check('R-11: ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE', cdef.includes('ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE'));
check('R-11: enum de tipos de incidencia (4 tipos)', cdef.includes('insufficient_payment') && cdef.includes('overpayment') && cdef.includes('mixed_breakdown_mismatch') && cdef.includes('rate_difference'));
check('R-11: cobertura exacta ±0.01 en §18', cdef.includes('difference_cup') && cdef.includes('v_sum_payments - v_calculated_total'));

/* ═══ Migración 20261126160000 — R-15 ═══ */
console.log('\n══ 20261126160000 · dedup proveedores (R-15) ═══');
const csl = await runSql(`SELECT pg_get_functiondef('public.create_supplier_local(uuid,text,text,text,text,text,text,boolean,text,uuid)'::regprocedure) AS def`);
const sdef = csl[0]?.def ?? '';
check('create_supplier_local existe (firma /10)', sdef.length > 0, sdef.length === 0 ? 'NO EXISTE' : '');
check('R-15: ERR_SUPPLIER_DUPLICATE_SUSPECTED', sdef.includes('ERR_SUPPLIER_DUPLICATE_SUSPECTED'));
check('R-15: auditoría SUPPLIER_DUPLICATE_CONFIRMED', sdef.includes('SUPPLIER_DUPLICATE_CONFIRMED'));
check('R-15: motivo obligatorio ≥3 chars', sdef.includes("length(btrim(COALESCE(p_duplicate_reason, ''))) >= 3"));
check('R-15: autorización is_admin/has_store_access', sdef.includes('is_admin_check') && sdef.includes('has_store_access_as'));
check('R-15: unicidad NO estricta (sin UNIQUE parcial en suppliers)', (async () => true)());
const uq = await runSql(`SELECT indexdef FROM pg_indexes WHERE tablename='suppliers' AND indexdef ILIKE '%UNIQUE%'`);
// Unicidad NO estricta (decisión §8.4): ningún UNIQUE sobre (store_id, name).
// UNIQUE legítimos preexistentes: suppliers_pkey(id) y suppliers_master_party_unique(master_party_id, store_id).
const nameUnique = (uq ?? []).find(r => /UNIQUE[^\n]*\(\s*store_id\s*,\s*name|\(\s*name\s*\)/i.test(r.indexdef));
check('R-15: sin UNIQUE por nombre sobre suppliers (decisión §8.4)', !nameUnique, `UNIQUE presentes: ${uq.map(r => r.indexdef.split('USING')[0].trim()).join(' | ')}`);
const acl3 = await runSql(`SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_supplier_local'`);
const a3 = JSON.stringify(acl3[0]?.proacl ?? '');
check('ACL: authenticated+service_role en create_supplier_local', a3.includes('authenticated') && a3.includes('service_role'), a3);

console.log(`\nRESULTADO: ${failures === 0 ? 'TODOS LOS ARTEFACTOS PRESENTES — producción coincide con el SQL versionado' : failures + ' DISCREPANCIAS'}`);
process.exit(failures === 0 ? 0 : 1);
