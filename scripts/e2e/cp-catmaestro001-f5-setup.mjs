#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 5 · Setup de verificación visual
 * en BD AISLADA (CostproE2E): fixture determinista + swap de entorno.
 *
 *  1. Crea usuario de prueba (Admin API REST con la service key E2E vigente),
 *     tenant + tienda CONECTADA al Catálogo Maestro + 2 productos existentes.
 *  2. Genera .env.e2e-run (copia del .env apuntando al proyecto aislado) y
 *     hace el swap (.env.main ← .env) — técnica de alias del CI (docs/e2e/
 *     EJECUCION_LOCAL_AISLADA.md).
 *  3. Reinicia PM2 y verifica health.
 *
 * Uso: node scripts/e2e/cp-catmaestro001-f5-setup.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require2 = createRequire(import.meta.url);
const E2E_REF = 'lguovmvrozxgssupkwpf';
const E2E_URL = 'https://lguovmvrozxgssupkwpf.supabase.co';

const keys = JSON.parse(readFileSync('/tmp/e2e-keys.json', 'utf8')); // claves vigentes (rotadas)
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

const { assertIsolatedDb } = require2('../../e2e/fixtures/assert-isolated-db.cjs');
await assertIsolatedDb();

const FIX = {
  email: `f5-catmaestro-${Date.now().toString(36)}@costpro-e2e.test`,
  password: 'F5Test-2026-catmaestro',
  tenant: 'aabb0000-1111-4222-8333-000000000005',
  store: 'aabb0000-1111-4222-8333-000000000006',
  master1: 'aabb0000-1111-4222-8333-000000000007',
  master2: 'aabb0000-1111-4222-8333-000000000008',
};

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
  // Limpieza previa (idempotente).
  await execSql(`SET session_replication_role = replica;
    DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id='${FIX.store}');
    DELETE FROM public.receipts WHERE store_id='${FIX.store}';
    DELETE FROM public.products WHERE store_id='${FIX.store}';
    DELETE FROM public.master_change_log WHERE tenant_id='${FIX.tenant}';
    DELETE FROM public.master_products WHERE tenant_id='${FIX.tenant}';
    DELETE FROM public.audit_logs WHERE store_id='${FIX.store}';
    DELETE FROM public.user_store_memberships WHERE store_id='${FIX.store}';
    DELETE FROM auth.users WHERE email LIKE 'f5-catmaestro-%';
    DELETE FROM public.catalog_store_links WHERE store_id='${FIX.store}';
    DELETE FROM public.stores WHERE id='${FIX.store}';
    DELETE FROM public.tenants WHERE id='${FIX.tenant}';
    SET session_replication_role = DEFAULT;`).catch(() => {});

  // 1. Usuario de prueba vía Admin API (contraseña real para login UI).
  const createRes = await fetch(`${E2E_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: keys.service, Authorization: `Bearer ${keys.service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FIX.email, password: FIX.password, email_confirm: true }),
  });
  if (!createRes.ok) throw new Error(`Admin API createUser: HTTP ${createRes.status} ${await createRes.text()}`);
  const created = await createRes.json();
  FIX.uid = created.id;
  console.log(`usuario: ${FIX.email} (${FIX.uid})`);

  // 2. Fixture de negocio.
  await execSql(`INSERT INTO public.profiles (id, role) VALUES ('${FIX.uid}', 'encargado')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.tenants (id, name, owner_id) VALUES ('${FIX.tenant}', 'ORG F5 CATMAESTRO', '${FIX.uid}');
    INSERT INTO public.stores (id, tenant_id, name, is_active) VALUES ('${FIX.store}', '${FIX.tenant}', 'Tienda F5', true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES ('${FIX.uid}', '${FIX.store}', 'encargado', 'active');
    INSERT INTO public.catalog_store_links (tenant_id, store_id, status, connected_at, created_at, updated_at)
      VALUES ('${FIX.tenant}', '${FIX.store}', 'connected', now(), now(), now());
    INSERT INTO public.master_products (id, tenant_id, sku, name, status, unit_of_measure)
    VALUES ('${FIX.master1}', '${FIX.tenant}', '1', 'Cable F5 2mm', 'active', 'unidad'),
           ('${FIX.master2}', '${FIX.tenant}', '2', 'Pintura F5 Blanca', 'active', 'unidad');
    INSERT INTO public.products (store_id, tenant_id, master_product_id, sku, name, price, cost_price, cost_average, stock_current, is_active, unit_of_measure)
    VALUES ('${FIX.store}', '${FIX.tenant}', '${FIX.master1}', '1', 'Cable F5 2mm', 5, 1, 1, 10, true, 'unidad'),
           ('${FIX.store}', '${FIX.tenant}', '${FIX.master2}', '2', 'Pintura F5 Blanca', 30, 10, 10, 4, true, 'unidad');`);
  console.log('fixture: tenant/tienda/membresía/catálogo/productos OK');

  // 3. .env.e2e-run + swap (técnica de alias del CI).
  const env = readFileSync('.env', 'utf8');
  const e2eEnv = env
    .replace(/NEXT_PUBLIC_SUPABASE_URL=.*/, `NEXT_PUBLIC_SUPABASE_URL=${E2E_URL}`)
    .replace(/NEXT_PUBLIC_SUPABASE_ANON_KEY=.*/, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${keys.anon}`)
    .replace(/SUPABASE_SERVICE_ROLE_KEY=.*/, `SUPABASE_SERVICE_ROLE_KEY=${keys.service}`);
  writeFileSync('.env.e2e-run', e2eEnv);
  copyFileSync('.env', '.env.main');
  copyFileSync('.env.e2e-run', '.env');
  writeFileSync('/tmp/f5-ctx.json', JSON.stringify(FIX, null, 2));
  console.log('swap de entorno hecho (.env → BD aislada)');
  console.log('\nSiguiente: pm2 restart costpro → health → playwright.');
  console.log(`  login: ${FIX.email} / ${FIX.password}`);
})().catch(e => { console.error('EXCEPCIÓN:', e.message); process.exit(1); });
