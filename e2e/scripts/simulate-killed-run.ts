/**
 * FASE E — SIMULACIÓN DE RUN INTERRUMPIDO
 * ============================================================================
 * Provisiona un entorno de run real (provisionRunEnv) y ABORTA el proceso
 * SIN ejecutar teardown — deja el context file y los recursos huérfanos,
 * exactamente como un runner muerto por SIGKILL/OOM/cancel de CI.
 *
 * Uso:  npx tsx e2e/scripts/simulate-killed-run.ts          (provisiona y muere)
 *       npx tsx e2e/scripts/simulate-killed-run.ts --uuid   (solo imprime UUIDs)
 *
 * Tras ejecutarlo, la reconciliación (CLI --run-id o automática) debe limpiar
 * TODO lo provisionado. Este script es la mitad "víctima" de la prueba
 * anti-huérfanos; la otra mitad es reconcile-orphan-runs.ts.
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';
import { provisionRunEnv, runContextPath } from '../fixtures/run-env';
import { writeFileSync } from 'fs';

loadEnv({ path: './.env' });

async function main(): Promise<void> {
  const context = await provisionRunEnv();
  const manifest = {
    runId: context.runId,
    tenantId: context.tenantId,
    pilotA: context.pilotStoreA.id,
    pilotB: context.pilotStoreB.id,
    users: [
      context.users.admin.id,
      context.users.cajero.id,
      context.users.almacen.id,
      context.users.encargado.id,
    ],
    contextPath: runContextPath(),
  };
  writeFileSync('test-results/killed-run-manifest.json', JSON.stringify(manifest, null, 2));
  console.log('[simulate] Run provisionado y ABANDONADO sin teardown (simulación de muerte abrupta):');
  console.log(JSON.stringify(manifest, null, 2));
  console.log('[simulate] El context file queda en .e2e-run-contexts/ — ejecutar la reconciliación ahora.');
  // exit sin teardown — como un SIGKILL después del provision
  process.exit(0);
}

main().catch((e: Error) => {
  console.error('[simulate] ERROR:', e.message);
  process.exit(1);
});
