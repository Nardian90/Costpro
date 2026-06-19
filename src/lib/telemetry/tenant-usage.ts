/**
 * F6-T06: Telemetry y analytics de uso por tenant.
 *
 * ⚠️ DESACTIVADO POR DEFECTO — el usuario tiene telemetry desactivado para
 * no hacer pesada la web en preview. Para activar, setear ENABLE_TELEMETRY=true
 *
 * Cuando está desactivado, todas las funciones son no-ops (cero overhead).
 */

import { logger } from '@/lib/logger';

const TELEMETRY_ENABLED = process.env.ENABLE_TELEMETRY === 'true';

export type TelemetryEvent =
  | 'store_switch'
  | 'fc_generate'
  | 'bulk_op'
  | 'config_change'
  | 'page_view';

export async function trackEvent(
  event: TelemetryEvent,
  properties: { storeId?: string; userId?: string; [key: string]: unknown }
): Promise<void> {
  if (!TELEMETRY_ENABLED) return; // cero overhead cuando desactivado
  try {
    logger.info('TELEMETRY', event.toUpperCase(), {
      ...properties, timestamp: new Date().toISOString(),
    });
  } catch { /* telemetry nunca debe romper la app */ }
}

export function isTelemetryEnabled(): boolean {
  return TELEMETRY_ENABLED;
}

export async function getTenantUsageMetrics(_tenantId: string): Promise<null | {
  dau: number; mau: number; topFeatures: Array<{ feature: string; count: number }>;
}> {
  if (!TELEMETRY_ENABLED) return null;
  return null;
}
