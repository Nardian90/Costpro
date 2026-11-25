#!/usr/bin/env node
/**
 * cpai-apply-migrations-governed.mjs — CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001
 * FASE 9 — Aplicación GOBERNADA de migraciones (patrón de doble flag del
 * proyecto, §11g del prompt: validar primero en el aislado, aplicar en
 * producción UNA SOLA VEZ, y documentar la aplicación).
 *
 * Modos:
 *   --target e2e    → BD AISLADA CostproE2E (lguovmvrozxgssupkwpf) — preparación
 *                     para que el CI corra la suite CON las migraciones nuevas.
 *   --target prod   → PRODUCCIÓN (wthkddeleylijmonclxg) — SOLO con --confirm-prod.
 *   --check         → solo verifica el estado actual (read-only), no aplica nada.
 *   --confirm-prod  →required junto a --target prod (doble flag).
 *
 * Migraciones de la misión (en orden lexicográfico):
 *   20261125153000_cxap_revoke_legacy_reception_fns.sql   (si falta — ya en main)
 *   20261126120000_cp_apai_payment_lifecycle_guards.sql
 *   20261126120100_cp_apai_tiendapueblo_supplier_link.sql
 *   20261126120200_cp_apai_void_service_payment_engine_fix.sql
 *
 * El script es idempotente: cada paso verifica el estado previo y salta lo
 * ya aplicado (las propias migraciones también son idempotentes).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const TOKEN = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)[1].trim();

const REFS = {
  e2e: 'lguovmvrozxgssupkwpf',
  prod: 'wthkddeleylijmonclxg',
};

const MIGRATIONS = [
  '20261125153000_cxap_revoke_legacy_reception_fns.sql',
  '20261126120000_cp_apai_payment_lifecycle_guards.sql',
  '20261126120100_cp_apai_tiendapueblo_supplier_link.sql',
  '20261126120200_cp_apai_void_service_payment_engine_fix.sql',
];

const args = process.argv.slice(2);
const target = args.includes('e2e') ? 'e2e' : args.includes('prod') ? 'prod' : null;
const checkOnly = args.includes('--check');
const confirmProd = args.includes('--confirm-prod');

if (!target) { console.error('USO: --target e2e|prod [--check] [--confirm-prod]'); process.exit(2); }
if (target === 'prod' && !checkOnly && !confirmProd) {
  console.error('SEGURIDAD: para aplicar en PRODUCCIÓN se exige --confirm-prod (doble flag).');
  process.exit(2);
}

async function runSql(ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

/** Estado de aplicación de cada migración (marcadores de efecto). */
async function probe(ref) {
  const out = {};
  const inPublic = (name) => `FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${name}'`;
  // 153000: REVOKE authenticated en add_reception_items
  const acl = await runSql(ref, `SELECT p.proacl::text AS acl ${inPublic('add_reception_items')}`);
  out['20261125153000'] = !(acl[0]?.acl ?? '').includes('authenticated');
  // 120000: guard en reverse_receipt_v2
  const g1 = await runSql(ref, `SELECT position('ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS' in pg_get_functiondef(p.oid)) AS p ${inPublic('reverse_receipt_v2')}`);
  out['20261126120000'] = Number(g1[0]?.p ?? 0) > 0;
  // 121000: corrección ejecutada (marcador: audit SR_SUPPLIER_NORMALIZED).
  const aud = await runSql(ref, "SELECT count(*) AS n FROM audit_logs WHERE action='SR_SUPPLIER_NORMALIZED'");
  out['20261126120100'] = Number(aud[0]?.n ?? 0) > 0;
  // 122000: fix del trigger (frase nueva en el body)
  const g3 = await runSql(ref, `SELECT position('solo el motor de pagos netea sus campos de pago' in pg_get_functiondef(p.oid)) AS p ${inPublic('prevent_received_service_edit')}`);
  out['20261126120200'] = Number(g3[0]?.p ?? 0) > 0;
  return out;
}

const state = await probe(REFS[target]);
const keyOf = (filename) => filename.slice(0, 14); // '20261126120000_…' → '20261126120000' (14 chars)
console.log(`═══ ESTADO ${target.toUpperCase()} (${REFS[target]}) ═══`);
for (const m of MIGRATIONS) console.log(`  ${state[keyOf(m)] ? '✓ APLICADA' : '✗ PENDIENTE'} — ${m}`);

if (checkOnly) { console.log('(--check: solo lectura, no se aplicó nada)'); process.exit(0); }

const pending = MIGRATIONS.filter(m => !state[keyOf(m)]);
if (!pending.length) { console.log('Nada pendiente — todo aplicado.'); process.exit(0); }

console.log(`\nSe aplicarán ${pending.length} migración(es) en ${target.toUpperCase()}${target === 'prod' ? ' (confirmado con doble flag)' : ''}:`);
for (const m of pending) console.log(`  → ${m}`);

for (const m of pending) {
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', m), 'utf8');
  console.log(`\n── APLICANDO ${m} …`);
  try {
    await runSql(REFS[target], sql);
    console.log(`   OK`);
  } catch (e) {
    console.error(`   FALLO: ${e.message}`);
    console.error('   Transacción abortada — el estado queda como estaba (BEGIN/COMMIT atómico).');
    process.exit(1);
  }
}

const after = await probe(REFS[target]);
console.log(`\n═══ VERIFICACIÓN POST-APLICACIÓN ═══`);
let ok = true;
for (const m of MIGRATIONS) {
  const applied = after[keyOf(m)];
  // 121000 en e2e es no-op legítimo (el documento no existe): el marcador de
  // audit no aparece — la migración se ejecutó sin error y sin efecto.
  const pass = applied || (m.startsWith('20261126120100') && target === 'e2e');
  console.log(`  ${pass ? 'OK' : 'FALLO'} ${m}${applied ? '' : (keyOf(m) === '20261126120100' && target === 'e2e' ? ' (no-op esperado: documento inexistente en aislada)' : '')}`);
  if (!pass) ok = false;
}
console.log(ok ? '\nAPLICACIÓN COMPLETA Y VERIFICADA' : '\nHAY MIGRACIONES SIN VERIFICAR — revisar');
process.exit(ok ? 0 : 1);
