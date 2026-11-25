#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 1 · Aplicación en PRODUCCIÓN (one-shot)
 * ============================================================================
 * Regla de oro del proyecto: la renumeración de ENERVIDA se validó primero en
 * la BD aislada (14/14 pruebas). Este script aplica en producción UNA VEZ:
 *
 *   1. Aplica la migración 20261125130000 (CREATE FUNCTION + guard).
 *   2. DRY-RUN y verificación del mapeo esperado (16 productos, códigos
 *      257..272, receipt_items=16, stock_movements=16 — aborta si difiere).
 *   3. APLICACIÓN (transacción única dentro de la función; actor =
 *      superadministrador propietario, creador de la recepción).
 *   4. POST-VERIFICACIÓN completa de integridad (read-only).
 *
 * El resultado completo se imprime y se copia a docs/audits/ por el operador.
 *
 * Uso (doble flag obligatorio — guard CP-INFRA-019):
 *   ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cp-catmaestro001-apply-prod.mjs --confirm-prod
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertNotProduction } from './lib/assert-not-production.mjs';

const args = process.argv.slice(2);
const confirmProd = args.includes('--confirm-prod');
const onlyVerify = args.includes('--verify');

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];

// Guard: escritura en producción exige el doble flag explícito.
if (!onlyVerify) {
  assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'cp-catmaestro001-apply-prod' });
  if (!confirmProd) {
    console.error('BLOQUEADO: producción exige --confirm-prod (regla de oro).');
    process.exit(1);
  }
} else {
  assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'cp-catmaestro001-apply-prod-verify' });
}

const TENANT = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const RECEIPT = '47380573-a546-4286-80fb-8d5ba374551e';
const ACTOR = 'a1111111-1111-1111-1111-111111111111'; // superadmin creador de la recepción

async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 800)}`);
  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

(async () => {
  console.log(`=== CP-CATMAESTRO-001 · FASE 1 · ${onlyVerify ? 'VERIFICACIÓN' : 'APLICACIÓN'} PRODUCCIÓN (${ref}) ===\n`);

  if (!onlyVerify) {
    // 1. Migración (CREATE FUNCTION idempotente + guard).
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261125130000_cp_catmaestro001_renumber_enervida_auto.sql'), 'utf8');
    await execSql(sql);
    await execSql("NOTIFY pgrst, 'reload schema'");
    console.log('[1] Migración aplicada (función cp_catmaestro001_renumber_auto_masters creada).\n');

    // 2. Dry-run + validación del mapeo esperado.
    const dry = await execSql(`SELECT public.cp_catmaestro001_renumber_auto_masters(p_dry_run := true, p_actor_id := '${ACTOR}') AS res;`);
    const dryRes = dry[0].res;
    console.log('[2] DRY-RUN:');
    for (const m of dryRes.mapping) {
      console.log(`    ${m.old_sku}  →  ${m.new_sku}   (${m.name}) [${m.state}]`);
    }
    const expectedCodes = Array.from({ length: 16 }, (_, i) => String(257 + i)).join(',');
    const dryCodes = dryRes.mapping.filter(m => m.state === 'to_renumber').map(m => m.new_sku).join(',');
    const dryOk = dryRes.to_renumber === 16 && dryCodes === expectedCodes
      && dryRes.receipt_items_before === 16 && dryRes.stock_movements_before === 16;
    console.log(`    to_renumber=${dryRes.to_renumber} codes=${dryCodes}`);
    console.log(`    receipt_items=${dryRes.receipt_items_before} stock_movements=${dryRes.stock_movements_before}`);
    if (!dryOk) {
      console.error('\nABORTADO: el dry-run NO coincide con el mapeo esperado (16 × 257..272). NADA se ha modificado.');
      process.exit(1);
    }
    console.log('    → mapeo EXACTO al esperado (16 × 257..272).\n');

    // 3. Aplicación (transacción única dentro de la función).
    const app = await execSql(`SELECT public.cp_catmaestro001_renumber_auto_masters(p_dry_run := false, p_actor_id := '${ACTOR}') AS res;`);
    const appRes = app[0].res;
    console.log('[3] APLICACIÓN:');
    for (const m of appRes.mapping) {
      console.log(`    ${m.old_sku}  →  ${m.new_sku}   (${m.name}) [${m.state}]`);
    }
    console.log(`    applied=${appRes.applied} already=${appRes.already_renumbered}`);
    console.log(`    receipt_items ${appRes.receipt_items_before}→${appRes.receipt_items_after}  movements ${appRes.stock_movements_before}→${appRes.stock_movements_after}  kardex ${appRes.kardex_before}→${appRes.kardex_after}\n`);
  }

  // 4. POST-VERIFICACIÓN (read-only).
  console.log('[4] POST-VERIFICACIÓN:');
  const expected = ['257','258','259','260','261','262','263','264','265','266','267','268','269','270','271','272'];

  const renumbered = await execSql(`SELECT mp.sku, mp.name, p.sku AS local_sku, p.stock_current
    FROM public.master_products mp
    LEFT JOIN public.products p ON p.master_product_id = mp.id AND p.store_id = '${STORE}'
    WHERE mp.tenant_id = '${TENANT}' AND mp.sku ~ '^[0-9]+$' AND mp.sku::bigint BETWEEN 257 AND 272
    ORDER BY mp.sku::int;`);
  console.log(`    maestros 257..272: ${renumbered.length} (esperado 16)`);
  const skusOk = renumbered.length === 16 && renumbered.every(r => r.sku === r.local_sku);
  let i = 0;
  for (const r of renumbered) {
    const mark = (r.sku === expected[i] && r.sku === r.local_sku) ? '✓' : '✗';
    console.log(`    ${mark} ${r.sku} · ${r.name} · local=${r.local_sku} · stock=${r.stock_current}`);
    i++;
  }

  const autos = await execSql(`SELECT sku, name FROM public.master_products WHERE tenant_id='${TENANT}' AND sku ILIKE 'AUTO-%' ORDER BY sku;`);
  console.log(`\n    maestros AUTO-* restantes del tenant: ${autos.length} (esperado 1 = Cable para Ecoflow, recepción ENT-000003 ajena)`);
  autos.forEach(a => console.log(`      · ${a.sku} (${a.name})`));

  const itemsCount = await execSql(`SELECT COUNT(*) AS n FROM public.receipt_items WHERE receipt_id='${RECEIPT}';`);
  const movements = await execSql(`SELECT COUNT(*) AS n FROM public.stock_movements WHERE notes='${RECEIPT}';`);
  const receipt = await execSql(`SELECT total_cost, status, document_number FROM public.receipts WHERE id='${RECEIPT}';`);
  const changeLog = await execSql(`SELECT COUNT(*) AS n FROM public.master_change_log WHERE tenant_id='${TENANT}' AND field='sku' AND new_value IN ('257','258','259','260','261','262','263','264','265','266','267','268','269','270','271','272');`);
  const audits = await execSql(`SELECT COUNT(*) AS n FROM public.audit_logs WHERE action='CP_CATMAESTRO001_SKU_RENUMBER' AND created_at > now() - interval '1 hour';`);

  console.log(`    receipt_items de ENT-000005-2026: ${itemsCount[0].n} (esperado 16)`);
  console.log(`    stock_movements enlazados: ${movements[0].n} (esperado 16)`);
  console.log(`    recepción: total=${receipt[0].total_cost} status=${receipt[0].status} doc=${receipt[0].document_number} (esperado 756/active/ENT-000005-2026)`);
  console.log(`    master_change_log sku→257..272: ${changeLog[0].n} (esperado 16)`);
  console.log(`    audit_logs CP_CATMAESTRO001 (1h): ${audits[0].n}`);

  const allOk = skusOk
    && itemsCount[0].n === 16 && movements[0].n === 16
    && autos.length === 1 && receipt[0].total_cost === '756'
    && changeLog[0].n === 16 && audits[0].n >= 16;
  console.log(`\n=== RESULTADO POST-VERIFICACIÓN: ${allOk ? 'INTEGRIDAD CONFIRMADA ✔' : 'REVISAR — HAY DESVIACIONES'} ===`);
  if (!allOk) process.exit(1);
})();
