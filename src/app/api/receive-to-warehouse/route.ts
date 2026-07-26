/** POST /api/receive-to-warehouse — recibir producto a almacén + lote */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const schema = z.object({
  store_id: z.string().min(1),
  product_id: z.string().min(1),
  quantity: z.number().positive(),
  unit_cost: z.number().min(0).default(0),
  warehouse_id: z.string().optional(),
  lot_number: z.string().optional(),
  expiration_date: z.string().optional(),
  reason: z.string().optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`receive-wh:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  if (!canManageStore(session.user, parsed.data.store_id)) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await supabase.rpc('receive_to_warehouse', {
    p_store_id: parsed.data.store_id,
    p_product_id: parsed.data.product_id,
    p_quantity: parsed.data.quantity,
    p_unit_cost: parsed.data.unit_cost,
    p_warehouse_id: parsed.data.warehouse_id || null,
    p_lot_number: parsed.data.lot_number || null,
    p_expiration_date: parsed.data.expiration_date || null,
    p_user_id: session.user.id,
    p_reason: parsed.data.reason || 'Recepción a almacén',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logger.info('DATABASE', 'RECEIVE_TO_WAREHOUSE', { storeId: parsed.data.store_id, userId: session.user.id, result: data });
  return NextResponse.json(data);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/receive-to-warehouse');
