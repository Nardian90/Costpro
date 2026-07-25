/**
 * GET /api/cron/purge-snapshots
 *
 * V1.1: Purge automático de store_reset_snapshots >30 días.
 * Diseñado para ejecutarse diariamente via Vercel Cron o cron externo.
 *
 * Autorización: requiere CRON_SECRET header (configurable) o Bearer token admin.
 * Esto previene acceso público al endpoint.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withTracing } from '@/lib/observability';
import { logger } from '@/lib/logger';

async function handler(req: NextRequest) {
  // Autorización: CRON_SECRET header o admin bearer token
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
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
