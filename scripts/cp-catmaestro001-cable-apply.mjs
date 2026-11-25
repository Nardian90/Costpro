#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 (continuación) — RENUMERACIÓN
 * «Cable para Ecoflow» (ENT-000003-2026) en PRODUCCIÓN (one-shot).
 * ============================================================================
 * Autorización del propietario (2026-11-25): «si es correcto renumera Cable
 * para Ecoflow (recepción ENT-000003-2026)». Misma maquinaria auditable de
 * la fase 1 (cp_catmaestro001_renumber_auto_masters) con parámetros
 * EXPLÍCITOS de esta recepción:
 *
 *   · receipt ENT-000003-2026 = 2b74e9cf-0c98-4fd2-b5e2-ef274d82ece7
 *     (ENERVIDA-VITALLCONS, status=active, 1 ítem qty=1 costo=1)
 *   · maestro 59935685-f96a-4e41-a86e-eb7738768104 sku AUTO-MWTIJE8Y-1
 *     (único AUTO-* restante en el tenant; 1 fila local en ENERVIDA, 0 en
 *     otras tiendas — verificado fase 0-C read-only)
 *   · consecutivo actual 1..272 contiguo + outliers 998/999 → código
 *     esperado 273 (dry-run usa la misma regla del generador oficial).
 *
 * Pasos: DRY-RUN con validación del mapeo esperado → APLICACIÓN
 * (transacción única dentro de la función) → POST-VERIFICACIÓN read-only
 * (maestro/local renumerados, ítems/movimientos/kardex/saldos INTACTOS).
 *
 * Uso (doble flag obligatorio — guard CP-INFRA-019):
 *   ALLOW_PROD=read-only node scripts/cp-catmaestro001-cable-apply.mjs --verify
 *   ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cp-catmaestro001-cable-apply.mjs --confirm-prod
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

if (!onlyVerify) {
  assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'cp-catmaestro001-cable-apply' });
  if (!confirmProd) { console.error('BLOQUEADO: producción exige --confirm-prod (regla de oro).'); process.exit(1); }
} else {
  assertNotProduction({ mode: 'read', url: SUPABASE_URL, context: 'cp-catmaestro001-cable-verify' });
}

// ── Parámetros verificados fase 0-C (read-only) ────────────────────────────
const TENANT = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const RECEIPT = '2b74e9cf-0c98-4fd2-b5e2-ef274d82ece7'; // ENT-000003-2026
const MASTER = '59935685-f96a-4e41-a86e-eb7738768104';
const OLD_SKU = 'AUTO-MWTIJE8Y-1';
const NAME = 'Cable para Ecoflow';
const ACTOR = 'a1111111-1111-1111-1111-111111111111'; // superadmin (mismo actor fase 1)
const PAIRS = JSON.stringify([{ master_id: MASTER, old_sku: OLD_SKU, name: NAME }]);
const EXPECTED_NEW_SKU = '273';

async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 800)}`);
  try { const rows = JSON.parse(text); return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}

async function rpc(dryRun) {
  const q = `SELECT public.cp_catmaestro001_renumber_auto_masters(
      p_dry_run := ${dryRun}, p_actor_id := '${ACTOR}',
      p_tenant := '${TENANT}', p_store := '${STORE}', p_receipt := '${RECEIPT}',
      p_pairs := '${PAIRS.replace(/'/g, "''")}'::jsonb) AS res;`;
  const rows = await execSql(q);
  return rows[0] ? rows[0].res : null;
}

(async () => {
  console.log(`=== CABLE PARA ECOFLOW · ${onlyVerify ? 'VERIFICACIÓN' : 'RENUMERACIÓN'} PRODUCCIÓN (${ref}) ===\n`);

  if (onlyVerify) {
    const m = await execSql(`SELECT sku FROM public.master_products WHERE id = '${MASTER}'::uuid`);
    const l = await execSql(`SELECT sku FROM public.products WHERE id = 'a69286d3-fd2b-4f80-a1d5-e7e2e4b634e1'::uuid`);
    const autos = await execSql(`SELECT COUNT(*)::int AS n FROM public.master_products WHERE sku LIKE 'AUTO-%'`);
    console.log(`    maestro sku=${m[0]?.sku} | local sku=${l[0]?.sku} | AUTO-* restantes=${autos[0].n}`);
    return;
  }

  // 1. DRY-RUN
  console.log('[1] DRY-RUN:');
  const dry = await rpc(true);
  if (!dry) throw new Error('dry-run sin resultado');
  const dmap = dry.mapping[0];
  console.log(`    ${dmap.old_sku} → ${dmap.new_sku} (${dmap.name}) [${dmap.state}]`);
  const dryOk = dry.to_renumber === 1
    && dmap.new_sku === EXPECTED_NEW_SKU
    && dry.receipt_items_before === 1
    && dry.stock_movements_before === 1;
  console.log(`    to_renumber=${dry.to_renumber} receipt_items=${dry.receipt_items_before} stock_movements=${dry.stock_movements_before}`);
  if (!dryOk) { console.error('    ABORTADO: el mapeo del dry-run no coincide con lo esperado (273 / 1 ítem / 1 movimiento).'); process.exit(1); }
  if (dmap.local_id !== 'a69286d3-fd2b-4f80-a1d5-e7e2e4b634e1') { console.error('    ABORTADO: local_id inesperado'); process.exit(1); }

  // 2. APLICACIÓN
  console.log('\n[2] APLICACIÓN (transacción única):');
  const app = await rpc(false);
  const amap = app.mapping[0];
  console.log(`    ${amap.old_sku} → ${amap.new_sku} [${amap.state}] applied=${app.applied} already=${app.already_renumbered}`);
  if (app.applied !== 1 || amap.new_sku !== EXPECTED_NEW_SKU) { console.error('    APLICACIÓN ANÓMALA — verificar'); process.exit(1); }

  // 3. POST-VERIFICACIÓN (read-only)
  console.log('\n[3] POST-VERIFICACIÓN de integridad:');
  const m = await execSql(`SELECT sku, name FROM public.master_products WHERE id = '${MASTER}'::uuid`);
  const l = await execSql(`SELECT sku FROM public.products WHERE id = 'a69286d3-fd2b-4f80-a1d5-e7e2e4b634e1'::uuid`);
  const item = await execSql(`SELECT quantity, unit_cost FROM public.receipt_items WHERE receipt_id = '${RECEIPT}'::uuid`);
  const movs = await execSql(`SELECT COUNT(*)::int AS n FROM public.stock_movements WHERE notes = '${RECEIPT}'::text`);
  const kx = await execSql(`SELECT COUNT(*)::int AS n FROM public.kardex_entries ke WHERE ke.product_id IN ('${MASTER}'::uuid, 'a69286d3-fd2b-4f80-a1d5-e7e2e4b634e1'::uuid)`);
  const autos = await execSql(`SELECT COUNT(*)::int AS n FROM public.master_products WHERE sku LIKE 'AUTO-%'`);
  const num = await execSql(`SELECT COUNT(*)::int AS n, MAX(sku) AS mx FROM public.master_products WHERE tenant_id = '${TENANT}'::uuid AND sku ~ '^[0-9]{1,9}$'`);
  const receipt2 = await execSql(`SELECT total_cost, status FROM public.receipts WHERE id = '${RECEIPT}'::uuid`);
  console.log(`    maestro: sku=${m[0].sku} nombre="${m[0].name}"`);
  console.log(`    local:   sku=${l[0].sku}`);
  console.log(`    ítem:    qty=${item[0].quantity} costo=${item[0].unit_cost}`);
  console.log(`    movimientos=${movs[0].n} kardex=${kx[0].n} (línea base fase 0: 1 y 2)`);
  console.log(`    AUTO-* restantes=${autos[0].n} | numéricos=${num[0].n} max=${num[0].mx}`);
  console.log(`    recepción: total=${receipt2[0].total_cost} status=${receipt2[0].status}`);
  const ok = m[0].sku === EXPECTED_NEW_SKU && l[0].sku === EXPECTED_NEW_SKU
    && movs[0].n === 1 && kx[0].n === 2 && autos[0].n === 0 && num[0].mx === '999';
  console.log(`\n=== RESULTADO: ${ok ? 'OK — renumerado e íntegro' : 'REVISAR'} ===`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
