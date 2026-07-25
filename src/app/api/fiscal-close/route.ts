/**
 * GET /api/fiscal-close?store_id=X&year=2026&month=7
 * POST /api/fiscal-close — cerrar/consultar periodo fiscal
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const closeSchema = z.object({
  store_id: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  action: z.enum(['close', 'lock', 'status']).default('status'),
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
    .from('fiscal_closings')
    .select('*')
    .eq('store_id', storeId)
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If no closing exists, the period is open
  return NextResponse.json({
    store_id: storeId,
    year, month,
    status: data?.status || 'open',
    closing: data || null,
  });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`fiscal-close:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  let rpcName = 'close_fiscal_period';
  if (parsed.data.action === 'lock') {
    // Only admin can lock
    if (session.user.role !== 'admin') return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    rpcName = 'lock_fiscal_period';
  }

  const { data, error } = await supabase.rpc(rpcName, {
    p_store_id: parsed.data.store_id,
    p_user_id: session.user.id,
    p_year: parsed.data.year,
    p_month: parsed.data.month,
  });

  if (error) {
    logger.error('DATABASE', 'FISCAL_CLOSE_FAILED', { error: error.message, action: parsed.data.action });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('DATABASE', 'FISCAL_PERIOD_ACTION', {
    storeId: parsed.data.store_id, action: parsed.data.action,
    year: parsed.data.year, month: parsed.data.month, userId: session.user.id,
  });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/fiscal-close');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/fiscal-close');
