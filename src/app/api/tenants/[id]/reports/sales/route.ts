import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '30', 10);

  const { data, error } = await supabaseAdmin.rpc('get_tenant_sales_summary', {
    p_tenant_id: profile.tenant_id,
    p_days: days,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true, summary: data });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/tenants/[id]/reports/sales'
);
