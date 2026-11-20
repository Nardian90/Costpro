#!/usr/bin/env node
/**
 * cpfin004-apply-e2e.mjs — Aplica las migraciones de CP-FIN-004
 * (20261120200000 + 20261120210000) a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento).
 *
 * M1 y M2 se aplican en TRANSACCIONES SEPARADAS (POST distintos): M2 usa el
 * valor de enum añadido por M1 (ALTER TYPE ADD VALUE) y PostgreSQL exige que
 * la alteración esté comprometida antes de su uso.
 *
 * Uso: node scripts/e2e/cpfin004-apply-e2e.mjs [--check]
 *   --check: solo verifica marcas (sin aplicar).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const M1 = 'supabase/migrations/20261120200000_cp_fin004_external_transfer_contract.sql';
const M2 = 'supabase/migrations/20261120210000_cp_fin004_engine_rules_normalization.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 600)}`);
  return JSON.parse(body);
}

const CHECK_QUERIES = {
  'mapeo external_transfer USD activo': `SELECT count(*)::int n FROM public.fin_account_mapping WHERE payment_method='external_transfer' AND currency='USD' AND is_active`,
  'columna transactions.external_transfer_amount': `SELECT count(*)::int n FROM information_schema.columns WHERE table_name='transactions' AND column_name='external_transfer_amount'`,
  'regla VENTA v4 con métrica canónica': `SELECT count(*)::int n FROM public.fin_rule_versions WHERE document_type='VENTA' AND status='active' AND movements::text LIKE '%cob_external_transfer_usd_cup%'`,
  'normalizador cp_fin004 presente': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cp_fin004_normalize_enervida_payments'`,
};

if (process.argv.includes('--check')) {
  let ok = true;
  for (const [name, q] of Object.entries(CHECK_QUERIES)) {
    const rows = await runSql(q);
    const n = Number(rows[0]?.n ?? 0);
    console.log(`${n > 0 ? 'OK ' : 'FALLO'} · ${name}: ${n}`);
    if (n === 0) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

for (const file of [M1, M2]) {
  const sql = readFileSync(join(REPO, file), 'utf8');
  console.log(`[cpfin004-apply-e2e] Aplicando ${file} (lote único transaccional separado)...`);
  await runSql(sql);
  console.log(`[cpfin004-apply-e2e] ${file}: OK`);
}

// Verificación posterior
let ok = true;
for (const [name, q] of Object.entries(CHECK_QUERIES)) {
  const rows = await runSql(q);
  const n = Number(rows[0]?.n ?? 0);
  console.log(`${n > 0 ? 'OK ' : 'FALLO'} · ${name}: ${n}`);
  if (n === 0) ok = false;
}
console.log(ok ? 'CP-FIN-004: BD aislada PREPARADA' : 'CP-FIN-004: verificación INCOMPLETA');
process.exit(ok ? 0 : 1);
