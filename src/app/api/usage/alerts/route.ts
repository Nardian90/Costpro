import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX R1: withUsageTracking eliminado — withAuth ya aplica withAutoTracking internamente

/**
 * GET /api/usage/alerts?acknowledged=false&limit=20
 *
 * Devuelve alertas históricas (warning/risk/critical).
 * Filtros:
 *   ?acknowledged=false → solo no reconocidas
 *   ?limit=20           → últimas N (default 20)
 *
 * POST /api/usage/alerts
 *   Body: { id: string } → marca alerta como reconocida
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const acknowledged = searchParams.get('acknowledged');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    let query = admin.from('usage_alerts').select('*').order('detected_at', { ascending: false }).limit(limit);

    if (acknowledged === 'false') {
      query = query.eq('acknowledged', false);
    } else if (acknowledged === 'true') {
      query = query.eq('acknowledged', true);
    }

    const { data, error } = await query;

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('Could not find')) {
        return NextResponse.json({ alerts: [], warning: 'Tabla usage_alerts no existe aún — aplica la migración SQL.' });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data || [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { error } = await admin
      .from('usage_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: session.user.id,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
