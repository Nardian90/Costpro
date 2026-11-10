#!/usr/bin/env node
/**
 * fc-e2e-clean-orphans.mjs — Limpieza de profiles huérfanos de runs E2E
 * ============================================================================
 * PR #1598 (validación E2E pre-merge). Durante corridas E2E abortadas se
 * detectaron identities Auth eliminadas con rows de `profiles` huérfanas:
 *
 *   - e2e_hard_delete_user() hace `RETURN false` SIN tocar el profile cuando
 *     la identidad Auth ya no existe (early-return), y hardDeleteRunUser
 *     trata `false` como "manejado" (return true) → el profile queda vivo;
 *   - el trigger prevent_hard_delete_profile (v2_14_2) bloquea DELETE físico
 *     vía REST, así que el residuo no se puede limpiar por PostgREST.
 *
 * Este script limpia EXACTAMENTE los profiles huérfanos (sin identidad Auth
 * viva) cuyo email matchea los patrones E2E del guard de higiene, usando el
 * mismo mecanismo del RPC oficial: deshabilitar el trigger → DELETE →
 * re-habilitar. Guardas:
 *   - SOLO BD aislada (E2E_SUPABASE_DB_URL de CostproE2E — rechaza producción
 *     por ref, fail-closed);
 *   - SOLO emails de test E2E (mismos patrones que data-hygiene-guard.cjs);
 *   - SOLO huérfanos reales (NOT EXISTS en auth.users);
 *   - idempotente y read-only-safe (dry-run con --dry-run).
 *
 * Uso (con las variables E2E_* exportadas — guard canónico incluido):
 *   node scripts/e2e/fc-e2e-clean-orphans.mjs [--dry-run]
 */
import pg from 'pg';
import { lookup } from 'dns/promises';
import { URL as URLLib } from 'url';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// GUARD CANÓNICO DEL REPO (CP-INFRA-011) — fail-closed contra producción.
const { assertIsolatedDb } = await import(
  pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.ts')).href
).catch(() => ({}));
const guard = assertIsolatedDb
  ? { assertIsolatedDb }
  : await import(pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.cjs')).href);
if (!guard?.assertIsolatedDb) {
  console.error('FALLO DE SEGURIDAD: no se pudo cargar el guard canónico. Abortando.');
  process.exit(2);
}
await guard.assertIsolatedDb();

const DB_URL = process.env.E2E_SUPABASE_DB_URL || '';
const ALLOWED_REF = (process.env.E2E_ALLOWED_REMOTE_REF || 'lguovmvrozxgssupkwpf');
const DRY = process.argv.includes('--dry-run');

if (!DB_URL) {
  console.error('✗ Falta E2E_SUPABASE_DB_URL (BD aislada CostproE2E).');
  process.exit(2);
}

// Mismos patrones que e2e/scripts/data-hygiene-guard.cjs (USER_OR)
const EMAIL_OR = [
  "email ~* '^e2e-'", "email ~* '^e2e80-'", "email ~* '^e2e2-'",
  "email ~* '^hot-test-'", "email ~* '^hot-regular@'", "email ~* '^f06dr-'",
  "email ~* '^audit-ph3-'", "email ~* '^esec-'", "email ~* '^gate-f406d-'",
].join(' OR ');

const SELECT_ORPHANS = `
SELECT p.id, p.email, p.full_name, p.created_at
FROM public.profiles p
WHERE (${EMAIL_OR})
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ORDER BY p.created_at DESC
LIMIT 200`;

// El dominio db.<ref>.supabase.co de CostproE2E solo publica AAAA (IPv6) y el
// sandbox no tiene ruta IPv6 — se usa el POOLER (IPv4, sesión 5432):
//   postgresql://postgres.<ref>:<pass>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
// E2E_SUPABASE_DB_URL se usa solo como fuente de credenciales y verificación
// del ref (fail-closed contra producción).
const u = new URLLib(DB_URL);
const POOLER_URL = process.env.E2E_SUPABASE_POOLER_URL
  || `postgresql://postgres.${ALLOWED_REF}:${decodeURIComponent(u.password || '')}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const pu = new URLLib(POOLER_URL);
if (!pu.hostname.includes('pooler.supabase.com')) {
  console.error('✗ E2E_SUPABASE_POOLER_URL no apunta al pooler de Supabase — ABORT.');
  process.exit(1);
}
const client = new pg.Client({
  host: pu.hostname,
  port: Number(pu.port || 5432),
  user: decodeURIComponent(pu.username || ''),
  password: decodeURIComponent(pu.password || ''),
  database: pu.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(SELECT_ORPHANS);
console.log(`[fc-e2e-clean-orphans] huérfanos detectados: ${rows.length}`);
for (const r of rows) {
  console.log(`  · ${r.id}  ${r.email}  (${r.full_name ?? ''})`);
}
if (rows.length === 0) {
  await client.end();
  console.log('PASS — sin residuos');
  process.exit(0);
}
if (DRY) {
  await client.end();
  console.log('[dry-run] no se eliminó nada');
  process.exit(0);
}

// Mismo mecanismo del RPC e2e_hard_delete_user: toggle del trigger en la
// MISMA transacción del borrado puntual.
const ids = rows.map(r => r.id);
await client.query('BEGIN');
try {
  await client.query('ALTER TABLE public.profiles DISABLE TRIGGER prevent_hard_delete_profile');
  const del = await client.query(
    'DELETE FROM public.profiles WHERE id = ANY($1::uuid[]) RETURNING id', [ids],
  );
  await client.query('ALTER TABLE public.profiles ENABLE TRIGGER prevent_hard_delete_profile');
  await client.query('COMMIT');
  console.log(`[fc-e2e-clean-orphans] eliminados ${del.rowCount} profiles huérfanos`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  await client.query('ALTER TABLE public.profiles ENABLE TRIGGER prevent_hard_delete_profile').catch(() => {});
  console.error('✗ Error durante la limpieza:', e.message);
  process.exit(1);
}
await client.end();
console.log('PASS — residuos eliminados');
