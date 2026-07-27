/**
 * GET /api/transfers?store_id=X&limit=20&page=1
 * POST /api/transfers — crear transferencia vía RPC create_transfer
 *
 * V2.4: Necesario para useDuplicateDocumentV2 (duplicación de transferencias).
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
// V2.4.4: usar uuidRegex del proyecto (permisivo)
import { uuidRegex } from '@/validation/schemas';

const createSchema = z.object({
  origin_store_id: z.string().regex(uuidRegex, 'origin_store_id inválido'),
  destination_store_id: z.string().regex(uuidRegex, 'destination_store_id inválido'),
  notes: z.string().max(500).optional(),
  items: z.array(z.object({
    product_id: z.string().regex(uuidRegex, 'product_id inválido'),
    quantity: z.number().positive(),
    unit_cost: z.number().nonnegative(),
  })).min(1),
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
    .from('transfers')
    .select('*, items:transfer_items(*)', { count: 'exact' })
    .or(`origin_store_id.eq.${storeId},destination_store_id.eq.${storeId}`)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, pagination: { page, limit, total: count ?? 0 } });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`transfers:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  // V2.4.4: try/catch para body inválido
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });

  // V2.4.4: canManageStore para AMBAS tiendas (origin + destination) — debt T3
  if (!canManageStore(session.user, parsed.data.origin_store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }
  // V2.4.4: el usuario debe tener acceso también al destino para evitar transferencias
  // cross-tenant no autorizadas
  if (!canManageStore(session.user, parsed.data.destination_store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }
  if (parsed.data.origin_store_id === parsed.data.destination_store_id) {
    return NextResponse.json({ error: 'Origin y destino deben ser diferentes' }, { status: 400 });
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // H3 FIX: usar create_transfer RPC (no INSERT directo) — garantiza BOLA + audit + validation
  const { data: transferId, error: rpcError } = await supabase.rpc('create_transfer', {
    p_origin_store_id: parsed.data.origin_store_id,
    p_destination_store_id: parsed.data.destination_store_id,
    p_items: parsed.data.items.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost, // la RPC ignora esto y usa cost_average server-side
    })),
    p_notes: parsed.data.notes || null,
    p_user_id: session.user.id,
  });

  if (rpcError) {
    logger.error('DATABASE', 'CREATE_TRANSFER_FAILED', { error: rpcError.message });
    const msg = rpcError.message || '';
    let status = 500;
    if (msg.includes('ERR_UNAUTHORIZED')) status = 403;
    else if (msg.includes('ERR_PRODUCT_NOT_IN_STORE')) status = 400;
    return NextResponse.json({ error: msg }, { status });
  }

  logger.info('DATABASE', 'TRANSFER_CREATED', {
    originStoreId: parsed.data.origin_store_id,
    destStoreId: parsed.data.destination_store_id,
    userId: session.user.id,
    transferId,
  });
  return NextResponse.json({
    id: transferId,
    transfer_id: transferId,
    status: 'PENDIENTE',
    transfer_number: (transferId as string)?.slice(0, 8) || '',
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/transfers');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/transfers');
