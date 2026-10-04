/**
 * GLOBAL TEARDOWN E2E — CostPro (E2E-RUNNER-ISOLATION)
 * ============================================================================
 * Limpia EXCLUSIVAMENTE los recursos de la ejecución actual (identidad por
 * id exacto desde el context file escrito por el global-setup — nunca por
 * patrones globales de nombre, nunca por edad). Corre en el MISMO proceso
 * del runner que el global-setup (los workers son los bifurcados), por lo
 * que el context se descubre por PID del propio proceso.
 *
 * Qué limpia (ver run-env.ts → teardownRunEnv):
 *   - datos de negocio de los pilotos del run (products, inventory,
 *     stock_movements, transactions, received_services, templates, ...);
 *   - las tiendas del run vía DELETE /api/stores (API REAL) con fallback de
 *     archivado — SOLO las dos tiendas piloto del run (por id);
 *   - memberships de los usuarios del run en esas tiendas;
 *   - usuarios del run: signOut + ban + desactivar perfil (misma semántica
 *     que el soft delete de la app, /api/users/delete — sin romper FKs).
 *
 * Qué NUNCA toca:
 *   - tiendas de otro runner concurrente (incluye sus E2E80-*);
 *   - pilotos persistentes legacy ni tiendas operativas (TIENDA CENTRAL,
 *     Puerto Padre, ENERVIDA);
 *   - usuarios reales del sistema.
 *
 * En modo legacy (E2E_ISOLATION=0) no hay context file y el teardown es
 * no-op: el comportamiento original se conserva íntegro.
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';
import { isIsolatedRun, teardownRunEnv } from './fixtures/run-env';

loadEnv({ path: './.env' });

export default async function globalTeardown(): Promise<void> {
  if (!isIsolatedRun()) {
    console.log('[global-teardown] Modo legacy (E2E_ISOLATION=0) — sin teardown de run.');
    return;
  }
  await teardownRunEnv();
}
