import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX R1: withUsageTracking eliminado — withAuth ya aplica withAutoTracking internamente
import { getBufferStatus } from '@/lib/usage-tracker';

/**
 * GET /api/usage/summary?hours=24
 *
 * Devuelve agregados de uso de las últimas N horas (default 24).
 * Llama al RPC get_usage_summary de Supabase + estado del buffer en memoria.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const hours = Math.min(Math.max(parseInt(searchParams.get('hours') || '24', 10) || 24, 1), 720); // 1h - 30d

  // Buffer status (en memoria, instantáneo)
  const bufferStatus = getBufferStatus();

  // Llamar al RPC get_usage_summary
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data, error } = await admin.rpc('get_usage_summary', { p_hours: hours });

    if (error) {
      // Si la tabla no existe, devolver respuesta graceful
      if (error.message.includes('Could not find the function') || error.message.includes('does not exist')) {
        return NextResponse.json({
          hours,
          summary: [],
          buffer: bufferStatus,
          warning: 'Las tablas de usage no existen aún. Aplica la migración SQL: supabase/migrations/20260626000001_usage_tracking.sql',
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      hours,
      summary: data || [],
      buffer: bufferStatus,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(getHandler);
