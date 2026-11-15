#!/usr/bin/env node
/**
 * val004-apply-prod.mjs — Aplicación ATÓMICA de las migraciones
 * CP-VALUATION-NOMINAL-ACTIVATION-004 a PRODUCCIÓN (CostproBD wthkddeleylijmonclxg)
 * vía Management API, siguiendo docs/OPERATIONS/PROCESO_CAMBIOS_PRODUCCION.md.
 *
 * Autorización: adenda vinculante CP-VALUATION-NOMINAL-ACTIVATION-004 (2026-11-15):
 *   «aplica la migración correctiva y la normalización de los 64 productos en
 *   producción, utilizando el protocolo de despliegue habitual» — decisión ya
 *   otorgada por el propietario (no se requiere compuerta adicional).
 *
 * DOBLE GUARD (fail-closed):
 *   · GUARD-1: este script SOLO opera contra el ref de producción fijo y exige
 *     los DOS flags explícitos del operador:
 *       ALLOW_PROD=read-only  ALLOW_PROD_WRITE=I_UNDERSTAND
 *   · GUARD-2: guard canónico CP-INFRA-019 (scripts/lib/assert-not-production.mjs)
 *     con mode='write' contra el ref real — registra la autorización explícita.
 *
 * LOTE ÚNICO ATÓMICO por migración (una sola llamada /database/query):
 *   [pre-verificación fail-closed] + [migración con sus verificaciones internas]
 *   + [INSERT en production_migration_ledger (paso 2 del protocolo, MISMO ciclo)]
 *   Si cualquier punto falla, el lote completo se revierte.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: falta SUPABASE_ACCESS_TOKEN'); process.exit(1); }

// GUARD-1: doble flag del operador (frase literal del proceso)
if (process.env.ALLOW_PROD !== 'read-only' || process.env.ALLOW_PROD_WRITE !== 'I_UNDERSTAND') {
  console.error('FALLO (fail-closed): escritura en producción requiere los DOBLE flags:\n' +
    '  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND');
  process.exit(1);
}

// GUARD-2: guard canónico (registra la autorización explícita en stderr)
const { assertNotProduction } = await import('./lib/assert-not-production.mjs');
assertNotProduction({ projectRef: PROD_REF, mode: 'write', context: 'val004-apply-prod' });

const MIGS = process.argv.slice(2).filter(a => /^\d{14}_.*\.sql$/.test(a.split('/').pop()));
if (!MIGS.length) { console.error('Uso: node scripts/val004-apply-prod.mjs <mig1.sql> <mig2.sql> ...'); process.exit(1); }

const q = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch { return t; }
};

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ── PRE-VERIFICACIÓN (fuera del lote, read-only): estado esperado ───────────
console.log('== PRE-VERIFICACIÓN (read-only) ==');
const pre = await q(`
  SELECT
    (SELECT count(*)::int FROM public.products WHERE cost_average = 0) AS en_cero,
    (SELECT count(*)::int FROM public.products p JOIN public.stores s ON s.id = p.store_id
      WHERE p.cost_average = 0 AND s.name <> 'PUERTO PADRE') AS en_cero_no_pp,
    (SELECT count(*)::int FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgname = 'trg_guard_wac_writer' AND t.tgenabled IN ('A','O')) AS guard,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_recalc_wac') AS fn_wac,
    (SELECT count(*)::int FROM public.production_migration_ledger
      WHERE version IN ('20261115120000', '20261115120100') AND status = 'applied') AS ya_aplicadas;`);
const p0 = pre[0];
console.log(JSON.stringify(p0));
if (p0.guard !== 1 || p0.fn_wac !== 1) throw new Error(`ABORT: guard WAC ausente (${p0.guard}) o fn_recalc_wac ausente (${p0.fn_wac})`);
if (p0.ya_aplicadas > 0) {
  console.log(`Las migraciones ya constan aplicadas (${p0.ya_aplicadas}/2) en el libro — nada que hacer (idempotente).`);
  if (!process.argv.includes('--verify-only')) process.exit(0);
  console.log('--verify-only: continuando a la verificación post...');
}
if (p0.ya_aplicadas === 0 && (p0.en_cero !== 64 || p0.en_cero_no_pp !== 0)) {
  throw new Error(`ABORT: universo en cero inesperado (${p0.en_cero} filas, ${p0.en_cero_no_pp} fuera de PUERTO PADRE) — re-verificar con la misión antes de aplicar`);
}

const EVID = 'audit-evidence/CP-VALUATION-NOMINAL-ACTIVATION-004';
const VERIFY_ONLY = process.argv.includes('--verify-only');
if (VERIFY_ONLY) console.log('== MODO --verify-only: SIN escritura de migraciones ==');
for (const file of VERIFY_ONLY ? [] : MIGS) {
  const version = file.split('/').pop().replace(/\.sql$/, '').split('_')[0];
  const sql = readFileSync(file, 'utf8');
  const sha = sha256(sql);

  // Fila del libro (paso 2 del protocolo) — se ejecuta EN EL MISMO lote
  const ledgerRow = `
    INSERT INTO public.production_migration_ledger
      (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
    VALUES ('${version}', 'supabase/migrations/${file.split('/').pop()}', '${sha}', now(),
            'management_api', '${EVID}', 'agent-cp-valuation-nominal-activation-004', 'applied',
            'CP-VALUATION-NOMINAL-ACTIVATION-004: autorización expresa del propietario (adenda 2026-11-15); aplicada en lote único atómico con verificación fail-closed interna')`;

  console.log(`== APLICANDO ${version} (lote único: migración + verificación interna + libro) ==`);
  const batch = `${sql}\n\n-- ── paso 2 del protocolo: fila del libro en el MISMO ciclo ──\n${ledgerRow};`;
  const r = await q(batch);
  console.log(`OK ${version}: ${JSON.stringify(r).slice(0, 400)}`);
}

// ── VERIFICACIÓN POST (lote separado, read-only) ────────────────────────────
console.log('== VERIFICACIÓN POST ==');
const post = await q(`
  SELECT
    (SELECT count(*)::int FROM public.products WHERE cost_average = 0) AS en_cero,
    (SELECT count(*)::int FROM public.products WHERE cost_average IS NULL) AS nulos,
    (SELECT count(*)::int FROM public.products WHERE cost_average < 0) AS negativos,
    (SELECT count(*)::int FROM public.products WHERE cost_average = 1) AS en_1,
    (SELECT count(*)::int FROM public.products WHERE cost_average > 1) AS mayores,
    (SELECT count(*)::int FROM public.products) AS total,
    (SELECT count(*)::int FROM public.products p JOIN public.stores s ON s.id = p.store_id
      WHERE p.cost_average = 1 AND s.name = 'PUERTO PADRE') AS pp_en_1,
    (SELECT count(*)::int FROM public.products p JOIN public.stores s ON s.id = p.store_id
      WHERE p.cost_average = 1 AND s.name = 'PUERTO PADRE' AND p.created_at >= '2026-11-14 19:00:00+00') AS pp_64_en_1,
    (SELECT count(*)::int FROM public.wac_change_log WHERE event LIKE 'cp_valuation_004_nominal%') AS wlog_nominal,
    (SELECT count(*)::int FROM public.cp_cost_nominal_pp64_20261115_audit) AS snapshot_pp64,
    (SELECT count(*)::int FROM public.audit_logs WHERE action = 'COST_NOMINAL_PP64_OWNER_DECISION') AS audit_global,
    (SELECT count(*)::int FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgname = 'trg_guard_wac_writer' AND t.tgenabled IN ('A','O')) AS guard,
    (SELECT count(*)::int FROM public.products WHERE price < 0) AS precios_neg,
    (SELECT (pg_get_functiondef(p.oid) LIKE '%nominal_1cup_owner_policy%') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'activate_master_product' LIMIT 1) AS rpc_nominal,
    (SELECT count(*)::int FROM public.production_migration_ledger
      WHERE version IN ('20261115120000','20261115120100') AND status = 'applied') AS libro_ok;`);
const v = post[0];
console.log(JSON.stringify(v, null, 1));

const checks = [
  ['universo en cero = 0', v.en_cero === 0],
  ['nulos = 0', v.nulos === 0],
  ['negativos = 0', v.negativos === 0],
  ['los 64 PP en 1 CUP', v.pp_64_en_1 === 64],
  ['snapshot auditable ≥ 64', v.snapshot_pp64 >= 64],
  ['asientos wac_change_log ≥ 64', v.wlog_nominal >= 64],
  ['asiento global presente', v.audit_global >= 1],
  ['guard WAC activo', v.guard === 1],
  ['RPC con política nominal', v.rpc_nominal === true],
  ['libro con las 2 filas', v.libro_ok === 2],
  ['precios íntegros', v.precios_neg === 0],
];
let fail = 0;
for (const [name, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) fail++; }
if (fail) { console.error(`VERIFICACIÓN POST: ${fail} fallos — NO declarar aplicada`); process.exit(1); }
console.log('VERIFICACIÓN POST COMPLETA: TODOS LOS CONTROLES OK');
