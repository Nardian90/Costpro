import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { captureDateRange } from '@/lib/exchange-capture';
// FIX R1: withUsageTracking eliminado — withAuth ya aplica withAutoTracking internamente

/**
 * POST /api/exchange-rates/refresh?days=7
 *
 * FIX C1+C2: Endpoint proxy server-side que el frontend puede llamar
 * sin tocar CRON_SECRET ni SUPABASE_SERVICE_ROLE_KEY.
 *
 * Auth: requiere sesión admin (withAuth + role check).
 * Internamente llama a captureDateRange() (lib compartida con el cron).
 *
 * Query params:
 *   ?days=7  → captura los últimos 7 días (default 7, max 30)
 *
 * Vercel config: maxDuration = 60s (Pro) — suficiente para 30 días
 * con concurrencia 3 (~12s para 30 días).
 */
export const maxDuration = 60;

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // Solo admin puede disparar captura manual
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Config missing — requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  // Parse ?days=N (default 7, max 30 — limitado para respetar timeout)
  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 30);

  const startTime = Date.now();

  try {
    const result = await captureDateRange(days, supabaseUrl, serviceKey, 3);
    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      mode: days === 1 ? 'today' : `backfill-${days}d`,
      dates_processed: result.datesProcessed,
      captured_count: result.captured.length,
      details: result.captured,
      errors: result.errors.length > 0 ? result.errors : undefined,
      elapsed_ms: elapsedMs,
      triggered_by: session.user.id,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export const POST = withAuth(postHandler);
