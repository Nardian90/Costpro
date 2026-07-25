/** GET /api/lots?store_id=X&product_id=Y&status=active
 *  POST /api/lots — crear lote
 *  PATCH /api/lots — actualizar lote */
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
  product_id: z.string().min(1),
  lot_number: z.string().min(1),
  serial_number: z.string().optional(),
  manufacture_date: z.string().optional(),
  expiration_date: z.string().optional(),
  quantity_received: z.number().positive(),
  unit_cost: z.number().min(0).default(0),
  supplier: z.string().optional(),
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

  let query = supabase.from('product_lots').select('*, products(name, sku)').eq('store_id', storeId)
    .order('created_at', { ascending: false });
  const productId = url.searchParams.get('product_id');
  const status = url.searchParams.get('status');
  const expiringDays = url.searchParams.get('expiring_days');
  if (productId) query = query.eq('product_id', productId);
  if (status) query = query.eq('status', status);
  if (expiringDays) {
    const future = new Date(); future.setDate(future.getDate() + Number(expiringDays));
    query = query.lte('expiration_date', future.toISOString()).eq('status', 'active');
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`lots:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase.from('product_lots').insert({
    ...parsed.data,
    quantity_remaining: parsed.data.quantity_received,
    created_by: session.user.id,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logger.info('DATABASE', 'LOT_CREATED', { storeId: parsed.data.store_id, userId: session.user.id });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/lots');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/lots');
