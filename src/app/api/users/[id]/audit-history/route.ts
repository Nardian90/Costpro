import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';

async function getHandler(req: NextRequest, _session: { user: { id: string } }) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 3];

  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const { data, error } = await supabaseAdmin.rpc('get_user_audit_history', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    history: data || [],
    count: Array.isArray(data) ? data.length : 0,
  });
}

export const GET = withTracing(
  withRole('admin', getHandler) as Parameters<typeof withTracing>[0],
  'GET /api/users/[id]/audit-history'
);
