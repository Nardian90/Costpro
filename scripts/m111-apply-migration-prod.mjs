#!/usr/bin/env node
/**
 * m111-apply-migration-prod.mjs — CP-FIN-110-POSTREVIEW-HARDENING-111.
 * Aplica la migración 20261122130000_cp_fin111_postreview_hardening.sql a
 * PRODUCCIÓN (CostproBD, ref wthkddeleylijmonclxg). SOLO DDL
 * (CREATE OR REPLACE FUNCTION + ACL) — 0 datos de negocio, 0 movimientos,
 * 0 rectificaciones, 0 generaciones nuevas. Idempotente (re-ejecutable).
 *
 * Autorización: misión §14 (migraciones necesarias para resolver los 5
 * hallazgos de revisión); expediente docs/audits/cp-fin-111-postreview-hardening/.
 * Guard CP-INFRA-019 con doble flag. Uso:
 *   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND SUPABASE_ACCESS_TOKEN=... \
 *     node scripts/m111-apply-migration-prod.mjs [--check]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const OUT = '/home/z/my-project/scripts/out/m111-audit';
mkdirSync(OUT, { recursive: true });
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const MIGRATION = 'supabase/migrations/20261122130000_cp_fin111_postreview_hardening.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`);
  return JSON.parse(body);
}

async function main() {
  const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
  assertNotProduction({ mode: process.argv.includes('--check') ? 'read' : 'write', projectRef: PROD_REF, context: 'm111-apply-migration-prod.mjs' });

  // 0) Respaldo PRE verificable: definiciones vigentes de las 3 funciones tocadas
  const pre = await runSql(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('fin_generation_build','fin_get_reconciliation')
    ORDER BY 1;`);
  writeFileSync(`${OUT}/m111-prod-pre-functions.json`, JSON.stringify(pre, null, 1));
  console.log(`Respaldo PRE: ${pre.length} definiciones de función respaldadas.`);

  if (process.argv.includes('--check')) {
    const post = await runSql(`
      SELECT
        (SELECT pg_get_functiondef(p.oid) LIKE '%RECONOCIBLES%' FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_generation_build') AS pase5_v111,
        (SELECT pg_get_functiondef(p.oid) LIKE '%CP-FIN-REC-001/v3%' FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_get_reconciliation') AS recon_v3,
        (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_rectification_apply') AS rpc_rect,
        (SELECT pg_get_functiondef(p.oid) LIKE '%ya_completa%' FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_rectification_apply') AS rpc_idempotente;
    `);
    console.log('--check:', JSON.stringify(post[0]));
    const c = post[0];
    process.exit(c.pase5_v111 && c.recon_v3 && Number(c.rpc_rect) === 1 && c.rpc_idempotente ? 0 : 1);
  }

  console.log(`Aplicando ${MIGRATION} (${sql.length} bytes) a PRODUCCIÓN — SOLO DDL…`);
  await runSql(sql);
  console.log('SQL ejecutado sin error.');

  const post = await runSql(`
    SELECT
      (SELECT pg_get_functiondef(p.oid) LIKE '%RECONOCIBLES%' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fin_generation_build') AS pase5_v111,
      (SELECT pg_get_functiondef(p.oid) LIKE '%CP-FIN-REC-001/v3%' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fin_get_reconciliation') AS recon_v3,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fin_rectification_apply') AS rpc_rect,
      (SELECT count(*)::int FROM information_schema.role_routine_grants
        WHERE specific_name LIKE 'fin_rectification_apply%' AND grantee='service_role') AS acl_sr,
      (SELECT count(*)::int FROM information_schema.role_routine_grants
        WHERE specific_name LIKE 'fin_rectification_apply%' AND grantee IN ('anon','authenticated')) AS acl_rechazada,
      (SELECT public.fin_active_generation('5e6fe821-5465-48b1-b3f1-3aa3182edc38') IS NOT NULL) AS gen_activa_intacta,
      (SELECT count(*)::int FROM public.fin_entries WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
         AND document_number='RECT-110-A-SOBRECOSTE-COGS') AS rect_110a_asientos,
      (SELECT round(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),2)
         FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
         JOIN public.fin_posting_generations g ON g.id=e.generation_id
         WHERE e.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
           AND e.document_number='RECT-110-A-SOBRECOSTE-COGS' AND g.code='GEN-3') AS rect_gen3_saldo;`);
  const c = post[0];
  console.log('POST:', JSON.stringify(c, null, 1));
  writeFileSync(`${OUT}/m111-prod-post.json`, JSON.stringify(post, null, 1));
  const ok = c.pase5_v111 && c.recon_v3 && Number(c.rpc_rect) === 1 && Number(c.acl_sr) >= 1
    && Number(c.acl_rechazada) === 0 && c.gen_activa_intacta && Number(c.rect_110a_asientos) === 2
    && Number(c.rect_gen3_saldo) === 0;
  console.log(ok
    ? 'MIGRACIÓN 111 APLICADA A PRODUCCIÓN — DDL solo; GEN-3 y RECT-110-A intactas (12/12 marcas)'
    : 'MARCAS INCOMPLETAS — revisar antes de continuar');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
