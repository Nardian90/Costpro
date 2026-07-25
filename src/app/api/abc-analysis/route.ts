/** POST /api/abc-analysis — calcular clasificación ABC
 *  GET /api/abc-analysis?store_id=X&year=2026&month=7 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const calcSchema = z.object({
  store_id: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());
  const month = Number(url.searchParams.get('month') || new Date().getMonth() + 1);
  if (!storeId) return NextResponse.json(createApiError('BAD_REQUEST'), { status: 400 });
  if (!canManageStore(session.user, storeId)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase
    .from('abc_classifications').select('*, products(name, sku, price)').eq('store_id', storeId)
    .eq('period_year', year).eq('period_month', month).order('total_revenue', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary by class
  const summary = { A: 0, B: 0, C: 0, totalRevenue: 0 };
  for (const item of (data || [])) {
    summary[item.classification as 'A' | 'B' | 'C']++;
    summary.totalRevenue += Number(item.total_revenue || 0);
  }
  return NextResponse.json({ data, summary });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`abc:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = calcSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase.rpc('calculate_abc', {
    p_store_id: parsed.data.store_id, p_year: parsed.data.year, p_month: parsed.data.month, p_user_id: session.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logger.info('DATABASE', 'ABC_CALCULATED', { storeId: parsed.data.store_id, userId: session.user.id, result: data });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/abc-analysis');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/abc-analysis');
