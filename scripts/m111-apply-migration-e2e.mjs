#!/usr/bin/env node
/**
 * m111-apply-migration-e2e.mjs — CP-FIN-110-POSTREVIEW-HARDENING-111.
 * Aplica la migración 20261122130000_cp_fin111_postreview_hardening.sql a la
 * BD AISLADA CostproE2E (Management API + guard canónico de aislamiento,
 * destino certificado). Idempotente → re-ejecutable sin daño.
 *
 * Uso: SUPABASE_ACCESS_TOKEN=... node scripts/m111-apply-migration-e2e.mjs [--check]
 *   --check: solo verifica marcas de la migración (sin aplicar).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const OUT = '/home/z/my-project/scripts/out/m111-audit';
mkdirSync(OUT, { recursive: true });

if (!SUPA_TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const MIGRATION = 'supabase/migrations/20261122130000_cp_fin111_postreview_hardening.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`);
  return JSON.parse(body);
}

async function main() {
  const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
  if (process.argv.includes('--check')) {
    const checks = await runSql(`
      SELECT
        (SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'fin_rectification_apply') AS rpc_rect,
        (SELECT pg_get_functiondef(p.oid) LIKE '%RECONOCIBLES%' FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'fin_generation_build') AS pase5_v111,
        (SELECT pg_get_functiondef(p.oid) LIKE '%CP-FIN-REC-001/v3%' FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'fin_get_reconciliation') AS recon_v3,
        (SELECT pg_get_functiondef(p.oid) LIKE '%GROUP BY lower(coalesce(pt.currency%' FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'fin_get_reconciliation') AS fb_cash_v111,
        (SELECT count(*)::int FROM information_schema.role_routine_grants
          WHERE specific_name LIKE 'fin_rectification_apply%' AND grantee = 'service_role') AS acl_service_role;
    `);
    const c = checks[0];
    const ok = !!c.rpc_rect && c.pase5_v111 && c.recon_v3 && c.fb_cash_v111 && Number(c.acl_service_role) >= 1;
    console.log('[m111-apply-e2e] --check:', JSON.stringify(c));
    writeFileSync(`${OUT}/m111-e2e-check.json`, JSON.stringify(checks, null, 1));
    console.log(ok ? 'MIGRACIÓN 111 PRESENTE en aislado (todas las marcas OK)' : 'MIGRACIÓN 111 AUSENTE O INCOMPLETA en aislado');
    process.exit(ok ? 0 : 1);
  }

  console.log(`[m111-apply-e2e] Aplicando ${MIGRATION} (${sql.length} bytes)…`);
  await runSql(sql);
  console.log('[m111-apply-e2e] SQL ejecutado sin error.');

  const post = await runSql(`
    SELECT
      (SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fin_rectification_apply') AS rpc_rect,
      (SELECT pg_get_functiondef(p.oid) LIKE '%RECONOCIBLES%' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fin_generation_build') AS pase5_v111,
      (SELECT pg_get_functiondef(p.oid) LIKE '%CP-FIN-REC-001/v3%' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fin_get_reconciliation') AS recon_v3,
      (SELECT count(*)::int FROM information_schema.role_routine_grants
        WHERE specific_name LIKE 'fin_rectification_apply%' AND grantee = 'service_role') AS acl_service_role,
      (SELECT count(*)::int FROM information_schema.role_routine_grants
        WHERE specific_name LIKE 'fin_rectification_apply%' AND grantee IN ('anon', 'authenticated')) AS acl_rechazada;
  `);
  const c = post[0];
  console.log('POST:', JSON.stringify(c));
  writeFileSync(`${OUT}/m111-e2e-post.json`, JSON.stringify(post, null, 1));
  const ok = !!c.rpc_rect && c.pase5_v111 && c.recon_v3 && Number(c.acl_service_role) >= 1 && Number(c.acl_rechazada) === 0;
  console.log(ok ? '8/8 MARCAS OK — migración 111 aplicada a la BD aislada' : 'MARCAS INCOMPLETAS — revisar');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
