import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';

// Iteración 12 (Q4): GET /api/users/orphans
// Lista huérfanos (auth.users sin profile) detectados por detect_orphan_users() RPC.

async function getHandler(_req: NextRequest, _session: { user: { id: string } }) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin.rpc('detect_orphan_users');

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orphans: data || [],
    count: Array.isArray(data) ? data.length : 0,
  });
}

export const GET = withTracing(
  withRole('admin', getHandler) as Parameters<typeof withTracing>[0],
  'GET /api/users/orphans'
);
