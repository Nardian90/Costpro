/**
 * m008-cleanup-e2e-users.ts — limpieza de residuos de usuarios E2E en la BD
 * AISLADA (misma semántica que el guard e2e/scripts/data-hygiene-guard.cjs).
 * Correr con BUN (importa el fixture TS canónico hard-cleanup.ts, que maneja
 * tiendas propias, filas scoped y el RPC e2e_hard_delete_user con guardas).
 * Idempotente y re-ejecutable. Solo toca la BD aislada (assert-isolated-db).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { hardDeleteRunUser, countE2EResiduals } from '../e2e/fixtures/hard-cleanup';
import { sb } from '../e2e/fixtures/session.fixture';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Guard de aislamiento (CP-INFRA-011) — espejo CJS, solo lectura.
const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

// Cargar env lógico desde .env (el fixture lee process.env).
for (const l of readFileSync(join(REPO, '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const PROTECTED = new Set([
  'admin@costpro.com', 'admin@demo.com', 'belkis9999@gmail.com', 'adrianpompasantana@gmail.com',
  'almacen@demo.com', 'cajero@demo.com', 'encargado@demo.com', 'costo@demo.com',
  'landing.demo@costpro-e2e.com', 'qa.h1.a@costpro.test',
]);

// Mismos patrones que data-hygiene-guard.cjs (USER_OR).
const PATTERNS = ['e2e-', 'e2e80-', 'e2e2-', 'hot-test-', 'hot-regular@', 'f06dr-', 'audit-ph3-', 'esec-', 'gate-f406d-'];
const isResidual = (email: string | null): boolean => {
  if (!email) return false;
  const e = email.toLowerCase();
  if (PROTECTED.has(e)) return false;
  return PATTERNS.some((p) => e.startsWith(p));
};

const before = await countE2EResiduals();
console.log(`residuos ANTES: stores=${before.stores} users=${before.users}`);

const users = await sb.select<{ id: string; email: string | null }>('profiles', 'select=id,email');
const residuals = users.filter((u) => isResidual(u.email));
console.log(`usuarios residuales detectados: ${residuals.length}`);

let deleted = 0;
for (const u of residuals) {
  const ok = await hardDeleteRunUser(u.id);
  console.log(`  · ${ok ? 'ELIMINADO' : 'FALLO'} ${u.email ?? u.id}`);
  if (ok) deleted++;
}

const after = await countE2EResiduals();
console.log(`residuos DESPUÉS: stores=${after.stores} users=${after.users} (eliminados ${deleted}/${residuals.length})`);
process.exit(after.users === 0 && after.stores === 0 ? 0 : 1);
