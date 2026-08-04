import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const year = parseInt(url.searchParams.get('year') || '0', 10);
  const month = parseInt(url.searchParams.get('month') || '0', 10);

  if (!storeId || !year || !month) {
    return NextResponse.json({ error: 'store_id, year, month required' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config' }, { status: 500 });

  const { data, error } = await supabaseAdmin.rpc('get_sales_book', {
    p_store_id: storeId, p_year: year, p_month: month,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, entries: data || [] });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/fiscal/sales-book'
);
