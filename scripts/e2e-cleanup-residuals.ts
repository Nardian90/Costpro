/**
 * Limpieza de residuos E2E pre-batch (FASE 2 + GUARDRAIL FASE 15).
 *
 * Usa el mecanismo nativo del repo (e2e/fixtures/hard-cleanup.ts):
 *   - hardDeleteTestStore  → tienda + hijos de negocio (hard)
 *   - hardDeleteRunUser    → usuario run (hard)
 *   - PROTECTED_STORE_IDS  → nunca tocadas
 *
 * Ejecutar: bun scripts/e2e-cleanup-residuals.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import {
  PROTECTED_STORE_IDS,
  isTestStoreName,
  hardDeleteTestStore,
  hardDeleteRunUser,
} from '../e2e/fixtures/hard-cleanup';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function svcGet(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

const USER_EMAIL_RE = /^(e2e-|e2e80-|e2e2-|hot-test-|hot-regular|f06dr-|audit-ph3-|esec-|gate-f406d-|fase-d-|test_no_admin|fc\.e2e\.|fc-access-e2e-|fc-mvp-smoke|qa-costpro-)/
  .source || '';
function isTestUserEmail(email: string): boolean {
  const e = (email || '').toLowerCase();
  return new RegExp(USER_EMAIL_RE).test(e)
    || /@costpro\.test$|@fixture\.local$|@fixture\.costpro$|@audit\.costpro\.test$|@costpro\.local$/.test(e);
}

(async () => {
  // ── Antes: verificar protegidas presentes ──────────────────────────────
  console.log('PROTEGIDAS antes:');
  for (const id of PROTECTED_STORE_IDS) {
    const rows = await svcGet(`/stores?select=id,name&id=eq.${id}`);
    console.log(`  ${rows.length === 1 ? 'OK      ' : 'MISSING!'} ${rows[0]?.name ?? id}`);
  }

  // ── Tiendas residuales ────────────────────────────────────────────────
  const stores = await svcGet('/stores?select=id,name,is_active&order=created_at.asc&limit=1000');
  const residualStores = stores.filter(
    (s) => !PROTECTED_STORE_IDS.includes(s.id) && isTestStoreName(s.name),
  );
  console.log(`\nTiendas con patrón test: ${residualStores.length} (de ${stores.length} totales)`);
  let delStores = 0;
  for (const s of residualStores) {
    try {
      await hardDeleteTestStore(s.id);
      delStores++;
      process.stdout.write(`  deleted ${s.name}\n`);
    } catch (e: any) {
      console.log(`  ERROR ${s.name}: ${e?.message ?? e}`);
    }
  }
  console.log(`Tiendas hard-deleted: ${delStores}/${residualStores.length}`);

  // ── Usuarios residuales (profiles) ────────────────────────────────────
  const profiles = await svcGet('/profiles?select=id,email&limit=1000');
  const residualUsers = profiles.filter((p) => isTestUserEmail(p.email || ''));
  console.log(`\nPerfiles de test: ${residualUsers.length} (de ${profiles.length} totales)`);
  let delUsers = 0;
  for (const u of residualUsers) {
    try {
      const ok = await hardDeleteRunUser(u.id);
      if (ok) {
        delUsers++;
        process.stdout.write(`  deleted ${u.email}\n`);
      } else {
        console.log(`  skip ${u.email} (hardDeleteRunUser=false)`);
      }
    } catch (e: any) {
      console.log(`  ERROR ${u.email}: ${e?.message ?? e}`);
    }
  }
  console.log(`Usuarios hard-deleted: ${delUsers}/${residualUsers.length}`);

  // ── Protegidas después: verificar intactas ────────────────────────────
  console.log('\nPROTEGIDAS después:');
  let ok = true;
  for (const id of PROTECTED_STORE_IDS) {
    const rows = await svcGet(`/stores?select=id,name&id=eq.${id}`);
    if (rows.length !== 1) ok = false;
    console.log(`  ${rows.length === 1 ? 'OK      ' : 'MISSING!'} ${rows[0]?.name ?? id}`);
  }
  console.log(ok ? '\nLIMPIEZA COMPLETADA — protegidas intactas' : '\nFALLO: protegida ausente — REVISAR');
  process.exit(ok ? 0 : 1);
})();
