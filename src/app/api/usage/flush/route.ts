import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX R1: withUsageTracking eliminado — withAuth ya aplica withAutoTracking internamente
import { flushUsage, getBufferStatus } from '@/lib/usage-tracker';

/**
 * POST /api/usage/flush
 *
 * Fuerza el flush del buffer en memoria a Supabase.
 * Útil para:
 *   - Ver datos inmediatamente en el dashboard sin esperar 60s
 *   - Testing
 *   - Antes de un deploy para no perder datos en frío
 *
 * Solo admin puede ejecutarlo.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  const beforeStatus = getBufferStatus();
  const result = await flushUsage();
  const afterStatus = getBufferStatus();

  return NextResponse.json({
    success: true,
    before: beforeStatus,
    after: afterStatus,
    flushed_entries: beforeStatus.buffered_entries - afterStatus.buffered_entries,
    flushed_count: result.flushed,
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}

export const POST = withAuth(postHandler);
