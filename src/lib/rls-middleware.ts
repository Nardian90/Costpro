/**
 * Iteración RLS Multi-Tenant (v2.21.0) — Feature flag middleware
 *
 * Activa el flag app.use_tenant_rls en la sesión de Supabase para que las
 * policies RLS nuevas (sufijo _tenant) reemplacen las viejas.
 *
 * Estrategia de rollout (controlada por env vars):
 * - USE_TENANT_RLS=false (default): flag desactivado, policies viejas aplican
 * - USE_TENANT_RLS=true + RLS_GLOBAL=true: flag activo para todos los requests
 * - USE_TENANT_RLS=true + RLS_GLOBAL=false + RLS_PILOT_STORES=uuid1,uuid2:
 *   flag activo solo para requests de stores en la lista piloto
 *
 * Llamar esta función DESPUÉS de validar el JWT y ANTES de ejecutar el handler.
 * Se invoca desde withAuth/withRole/withStoreAccess (middleware de auth).
 */

import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

/**
 * Activa el feature flag RLS para la sesión actual del usuario.
 *
 * @param userId - ID del usuario autenticado (para logging)
 * @param currentStoreId - Store activa del usuario (para piloto)
 * @returns true si el flag fue activado, false si no
 */
export async function activateTenantRLS(
  userId: string,
  currentStoreId?: string
): Promise<boolean> {
  const useTenantRls = process.env.USE_TENANT_RLS === 'true';
  if (!useTenantRls) {
    return false;
  }

  const rlsGlobal = process.env.RLS_GLOBAL === 'true';
  const pilotStores = (process.env.RLS_PILOT_STORES || '')
    .split(',')
    .filter(Boolean);

  // Si RLS_GLOBAL=true, activar para todos
  if (rlsGlobal) {
    await setRlsFlag(userId, 'global');
    return true;
  }

  // Si hay pilot stores, activar solo para esas
  if (pilotStores.length > 0 && currentStoreId && pilotStores.includes(currentStoreId)) {
    await setRlsFlag(userId, `pilot:${currentStoreId}`);
    return true;
  }

  // Si no hay RLS_GLOBAL ni pilot stores match, no activar
  return false;
}

/**
 * Ejecuta SELECT set_config('app.use_tenant_rls', 'true', false) en Supabase.
 * El tercer parámetro `false` = session-level (persiste durante la conexión).
 *
 * NOTA: set_config es una función SQL estándar de PostgreSQL. La llamamos
 * vía rpc() para que se ejecute en la misma sesión que las queries del request.
 */
async function setRlsFlag(userId: string, mode: string): Promise<void> {
  try {
    const admin = getSupabaseAdminSafe();
    if (!admin) return;

    // set_config(setting_name, new_value, is_local)
    // is_local=false → aplica a la sesión actual (no solo al transaction block)
    await admin.rpc('set_config', {
      setting_name: 'app.use_tenant_rls',
      new_value: 'true',
      is_local: false,
    });

    logger.info('DATABASE', 'TENANT_RLS_ACTIVATED', {
      userId,
      mode,
      flag: 'app.use_tenant_rls=true',
    });
  } catch (err) {
    // No bloquear el request si falla la activación del flag — las policies
    // viejas seguirán funcionando (CASE WHEN retorna el branch viejo).
    logger.warn('DATABASE', 'TENANT_RLS_ACTIVATION_FAILED', {
      userId,
      mode,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Verifica si el feature flag RLS está activado globalmente (env var).
 * Útil para tests y debugging.
 */
export function isTenantRlsEnabled(): boolean {
  return process.env.USE_TENANT_RLS === 'true';
}

/**
 * Verifica si el flag RLS está activado en modo global (todos los requests).
 */
export function isTenantRlsGlobal(): boolean {
  return isTenantRlsEnabled() && process.env.RLS_GLOBAL === 'true';
}

/**
 * Verifica si un store específico está en la lista piloto.
 */
export function isPilotStore(storeId: string): boolean {
  const pilotStores = (process.env.RLS_PILOT_STORES || '')
    .split(',')
    .filter(Boolean);
  return pilotStores.includes(storeId);
}
