/**
 * GET /api/cron/purge-snapshots
 *
 * V1.1: Purge automático de store_reset_snapshots >30 días.
 * Diseñado para ejecutarse diariamente via Vercel Cron o cron externo.
 *
 * Autorización (SEC-TS-05 · fail-closed): helper canónico cron-auth —
 * JWT x-vercel-signature (Vercel Cron automático, requiere
 * VERCEL_PROJECT_ID) o Authorization: Bearer CRON_SECRET (manual/local;
 * Vercel lo envía automáticamente cuando CRON_SECRET está configurado en
 * el proyecto). Sin ninguno de los dos, el endpoint rechaza con 401 —
 * NUNCA autoriza por omisión.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withTracing } from '@/lib/observability';
import { logger } from '@/lib/logger';
import { verifyCronAuthorization } from '@/lib/cron-auth';

async function handler(req: NextRequest) {
  // SEC-TS-05: el chequeo condicional x-cron-secret (fail-open — CRON_SECRET
  // ausente dejaba el endpoint sin autenticación, y Vercel nunca envía ese
  // header) se reemplaza por el helper estándar del repo (cron-auth, patrón
  // FIX C5+C6 de cron/usage-sync, cron/exchange-rates y
  // {telegram,whatsapp}-auto-publish). CRON_SECRET ausente → 401.
  const auth = await verifyCronAuthorization(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
    const supabase = getSupabaseAdminSafe();
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // Llamar a la RPC purge_old_reset_snapshots(30)
    const { data, error } = await supabase.rpc('purge_old_reset_snapshots', { p_days: 30 });

    if (error) {
      logger.error('DATABASE', 'PURGE_SNAPSHOTS_FAILED', { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const purged = typeof data === 'number' ? data : 0;
    logger.info('DATABASE', 'SNAPSHOTS_PURGED', { count: purged });

    return NextResponse.json({
      success: true,
      purged,
      message: `Purged ${purged} snapshots older than 30 days`,
    });
  } catch (err: any) {
    logger.error('DATABASE', 'PURGE_EXCEPTION', { error: err?.message });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const GET = withTracing(handler, 'GET /api/cron/purge-snapshots');
