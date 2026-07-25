/**
 * GET /api/quotations?store_id=X&status=draft&limit=20&page=1
 * POST /api/quotations — crear cotización vía RPC create_quotation
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

const createSchema = z.object({
  store_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
    notes: z.string().optional(),
  })).min(1),
  customer_id: z.string().min(1).optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  discount_type: z.enum(['fixed', 'percentage']).default('fixed'),
  discount_value: z.number().min(0).default(0),
  notes: z.string().optional(),
  valid_until: z.string().optional(),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('BAD_REQUEST'), { status: 400 });
  if (!canManageStore(session.user, storeId)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const page = Number(url.searchParams.get('page') || 1);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
  const status = url.searchParams.get('status');
  const from = (page - 1) * limit;

  let query = supabase.from('quotations').select('*, items:quotation_items(*)', { count: 'exact' })
    .eq('store_id', storeId).order('created_at', { ascending: false }).range(from, from + limit - 1);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, pagination: { page, limit, total: count ?? 0 } });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`quotations:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase.rpc('create_quotation', {
    p_store_id: parsed.data.store_id,
    p_user_id: session.user.id,
    p_items: parsed.data.items,
    p_customer_id: parsed.data.customer_id || null,
    p_customer_name: parsed.data.customer_name || null,
    p_customer_phone: parsed.data.customer_phone || null,
    p_discount_type: parsed.data.discount_type,
    p_discount_value: parsed.data.discount_value,
    p_notes: parsed.data.notes || null,
    p_valid_until: parsed.data.valid_until || null,
  });

  if (error) {
    logger.error('DATABASE', 'CREATE_QUOTATION_FAILED', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('DATABASE', 'QUOTATION_CREATED', { storeId: parsed.data.store_id, userId: session.user.id, quoteId: data?.quotation_id });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/quotations');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/quotations');
