/**
 * GET /api/devolutions?store_id=X&limit=20&page=1
 * POST /api/devolutions — crear devolución vía RPC create_devolution
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
    reason: z.string().optional(),
  })).min(1),
  reason: z.string().min(1),
  original_transaction_id: z.string().min(1).optional(),
  payment_method: z.enum(['cash', 'transfer', 'zelle', 'store_credit']).default('cash'),
  customer_id: z.string().min(1).optional(),
  customer_name: z.string().optional(),
  notes: z.string().optional(),
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
  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('devolutions')
    .select('*, items:devolution_items(*)', { count: 'exact' })
    .eq('store_id', storeId)
    .order('processed_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, pagination: { page, limit, total: count ?? 0 } });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`devolutions:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });

  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // Iteración 11.3: usar create_devolution_v2 si feature flag activo
  const { FEATURES } = await import('@/config/features');
  const rpcName = FEATURES.USE_V2_REVERSE ? 'create_devolution_v2' : 'create_devolution';

  const rpcParams: Record<string, unknown> = {
    p_store_id: parsed.data.store_id,
    p_user_id: session.user.id,
    p_items: parsed.data.items,
    p_reason: parsed.data.reason,
    p_original_transaction_id: parsed.data.original_transaction_id || null,
    p_payment_method: parsed.data.payment_method,
    p_customer_id: parsed.data.customer_id || null,
    p_customer_name: parsed.data.customer_name || null,
    p_notes: parsed.data.notes || null,
  };

  // v2: añadir idempotency_key
  if (FEATURES.USE_V2_REVERSE) {
    rpcParams.p_idempotency_key = `dev-${crypto.randomUUID()}`;
  }

  const { data, error } = await supabase.rpc(rpcName, rpcParams);

  if (error) {
    logger.error('DATABASE', 'CREATE_DEVOLUTION_FAILED', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('DATABASE', 'DEVOLUTION_CREATED', { storeId: parsed.data.store_id, userId: session.user.id, devId: data?.devolution_id });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/devolutions');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/devolutions');
