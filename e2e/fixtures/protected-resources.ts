/**
 * GOBERNANZA E2E — Carga de recursos protegidos (fuente única de verdad)
 * ============================================================================
 * PROBLEMA (reproducido el 2026-10-09): los pilotos persistentes
 * 'E2E PILOT A/B CostPro' fueron re-provisionados y registrados en
 * e2e/config/protected-resources.json, pero el código seguía protegiendo
 * SOLO las 3 tiendas de negocio (hardcodeadas) → el barrido residual de
 * cualquier run posterior (sweepResidualsSince → hardDeleteTestStore) los
 * hard-borró: el nombre "E2E PILOT A CostPro" coincide con el patrón de
 * artefacto de test y su UUID no estaba en la lista de protección.
 * Riesgo gemelo: el RPC e2e_hard_delete_user acepta cualquier email
 * @costpro.test → la fixture protegida qa.h1.a@costpro.test era borrable.
 *
 * SOLUCIÓN: este módulo es el ÚNICO punto que resuelve la lista de
 * recursos protegidos. La fuente es e2e/config/protected-resources.json
 * (revisable en PR, sincronizada con la BD por el script oficial de
 * provisión). Si el JSON no se puede leer, cae a un mínimo hardcodeado
 * FAIL-SAFE: la protección nunca queda más débil que la actual.
 *
 * Consumidores: hard-cleanup.ts (guardas de borrado), run-env.ts (guard de
 * entorno + reconciliación), data-hygiene-guard.cjs (equivalente CJS inline).
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface ProtectedResourcesFile {
  protectedStores: Array<{ id: string; name: string; reason: string }>;
  protectedStoreNamesExact: string[];
  protectedUsers: Array<{ email: string; reason: string }>;
  allowedProjectRefs?: string[];
}

/** Mínimo fail-safe: se usa SOLO si el JSON de gobernanza no se puede leer. */
const FALLBACK_STORE_IDS = [
  'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', // TIENDA CENTRAL COSTPRO
  '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', // Puerto Padre VITALLCONS
  '5e6fe821-5465-48b1-b3f1-3aa3182edc38', // ENERVIDA-VITALLCONS
];
const FALLBACK_STORE_NAMES = [
  'TIENDA CENTRAL COSTPRO',
  'Puerto Padre VITALLCONS',
  'ENERVIDA-VITALLCONS',
];
const FALLBACK_USER_EMAILS = [
  'admin@costpro.com',
  'admin@demo.com',
  'belkis9999@gmail.com',
  'adrianpompasantana@gmail.com',
];

function loadProtectedFile(): ProtectedResourcesFile | null {
  // Candidatos: raíz del repo (cwd) y subcarpeta e2e/ (por si cwd = e2e/)
  const candidates = [
    resolve(process.cwd(), 'e2e', 'config', 'protected-resources.json'),
    resolve(process.cwd(), 'config', 'protected-resources.json'),
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as ProtectedResourcesFile;
      if (!Array.isArray(parsed.protectedStores) || !Array.isArray(parsed.protectedUsers)) continue;
      return parsed;
    } catch { /* siguiente candidato */ }
  }
  return null;
}

const file = loadProtectedFile();

/** UUIDs protegidos (config de gobernanza; fallback mínimo si no hay JSON). */
export const PROTECTED_STORE_IDS: readonly string[] = file
  ? file.protectedStores.map((s) => s.id)
  : FALLBACK_STORE_IDS;

/** Nombres exactos protegidos (defensa en profundidad por si el UUID rota). */
export const PROTECTED_STORE_NAMES: readonly string[] = file
  ? Array.from(new Set([
      ...file.protectedStores.map((s) => s.name),
      ...(file.protectedStoreNamesExact || []),
    ]))
  : FALLBACK_STORE_NAMES;

/** Emails protegidos — NUNCA hard-deletable por higiene E2E. */
export const PROTECTED_USER_EMAILS: readonly string[] = file
  ? file.protectedUsers.map((u) => u.email.toLowerCase())
  : FALLBACK_USER_EMAILS;

/** ¿La tienda (por id o por nombre exacto) está protegida? */
export function isProtectedStore(id?: string | null, name?: string | null): boolean {
  if (id && PROTECTED_STORE_IDS.includes(id)) return true;
  if (name && PROTECTED_STORE_NAMES.includes(name.trim())) return true;
  return false;
}

/** ¿El email pertenece a un usuario protegido? */
export function isProtectedUserEmail(email?: string | null): boolean {
  if (!email) return false;
  return PROTECTED_USER_EMAILS.includes(email.toLowerCase().trim());
}

/** Diagnóstico para logs de guard: lista compacta de lo protegido. */
export function describeProtected(): string {
  return `stores=${PROTECTED_STORE_IDS.length} storeNames=${PROTECTED_STORE_NAMES.length} users=${PROTECTED_USER_EMAILS.length} (source=${file ? 'config' : 'fallback'})`;
}
