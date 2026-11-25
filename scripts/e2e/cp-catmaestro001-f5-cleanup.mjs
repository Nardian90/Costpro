#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 5 · Limpieza net-zero del fixture
 * en BD AISLADA y restauración del entorno principal (.env principal + PM2).
 *
 * Uso: node scripts/e2e/cp-catmaestro001-f5-cleanup.mjs
 */
import { readFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require2 = createRequire(import.meta.url);
const E2E_REF = 'lguovmvrozxgssupkwpf';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }
const { assertIsolatedDb } = require2('../../e2e/fixtures/assert-isolated-db.cjs');
await assertIsolatedDb();

const FIX = JSON.parse(readFileSync('/tmp/f5-ctx.json', 'utf8'));

async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 500)}`);
  try { const rows = JSON.parse(text); return Array.isArray(rows) ? rows : []; } catch { return []; }
}

(async () => {
  await execSql(`SET session_replication_role = replica;
    DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id='${FIX.store}');
    DELETE FROM public.receipts WHERE store_id='${FIX.store}';
    DELETE FROM public.products WHERE store_id='${FIX.store}';
    DELETE FROM public.master_change_log WHERE tenant_id='${FIX.tenant}';
    DELETE FROM public.master_products WHERE tenant_id='${FIX.tenant}';
    DELETE FROM public.audit_logs WHERE store_id='${FIX.store}';
    DELETE FROM public.user_store_memberships WHERE store_id='${FIX.store}';
    DELETE FROM auth.users WHERE id='${FIX.uid}';
    DELETE FROM public.catalog_store_links WHERE store_id='${FIX.store}';
    DELETE FROM public.stores WHERE id='${FIX.store}';
    DELETE FROM public.tenants WHERE id='${FIX.tenant}';
    SET session_replication_role = DEFAULT;`);

  const residue = await execSql(`SELECT
    (SELECT COUNT(*) FROM public.products WHERE store_id='${FIX.store}') AS p,
    (SELECT COUNT(*) FROM public.master_products WHERE tenant_id='${FIX.tenant}') AS m,
    (SELECT COUNT(*) FROM public.receipts WHERE store_id='${FIX.store}') AS r,
    (SELECT COUNT(*) FROM public.stores WHERE id='${FIX.store}') AS s,
    (SELECT COUNT(*) FROM public.tenants WHERE id='${FIX.tenant}') AS t,
    (SELECT COUNT(*) FROM auth.users WHERE id='${FIX.uid}') AS u,
    (SELECT COUNT(*) FROM public.user_store_memberships WHERE user_id='${FIX.uid}') AS mm;`);
  console.log('residuo fixture:', JSON.stringify(residue[0]));

  // Restauración del entorno principal (sección 5/7 del prompt).
  copyFileSync('.env.main', '.env');
  console.log('.env restaurado (producción del propietario) — falta: pm2 restart costpro');
  const passed = Object.values(residue[0]).every(v => Number(v) === 0);
  console.log(passed ? 'CLEANUP NET-ZERO: OK' : 'CLEANUP: RESIDUOS');
  process.exit(passed ? 0 : 1);
})().catch(e => { console.error('EXCEPCIÓN:', e.message); process.exit(1); });
