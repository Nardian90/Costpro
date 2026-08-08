/**
 * GET /api/production-orders?status=X&order_type=Y
 * POST /api/production-orders — crear orden de producción/servicio/trabajo
 *
 * V2.4.5: Migración a patrones canónicos de CostPro (T4 de auditoría).
 *   - withTracing en exports
 *   - validateOrigin en POST
 *   - rateLimit (10/min POST, 30/min GET)
 *   - canManageStore(session.user, store_id)
 *   - getSupabaseAdminSafe en vez de getSupabaseForSession (writes service-role)
 *   - createApiError para errores
 *   - logger en vez de console.error
 *   - uuidRegex del proyecto en vez de z.string().uuid() estricto
 *   - try/catch en body parsing
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
import crypto from 'crypto';
import { uuidRegex } from '@/validation/schemas';

const createOrderSchema = z.object({
  order_type: z.enum(['production', 'service', 'work']).default('service'),
  customer_name: z.string().max(200).optional(),
  customer_ci: z.string().max(50).optional(),
  customer_phone: z.string().max(50).optional(),
  customer_address: z.string().max(500).optional(),
  budget_total: z.number().positive().default(0),
  budget_currency: z.string().max(10).default('CUP'),
  advance_amount: z.number().min(0).default(0),
  advance_method: z.enum(['cash', 'transfer', 'zelle']).optional(),
  advance_currency: z.string().max(10).default('CUP'),
  description: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    product_id: z.string().regex(uuidRegex, 'product_id inválido'),
    variant_id: z.string().regex(uuidRegex).optional().nullable(),
    budgeted_qty: z.number().positive(),
    budgeted_unit_cost: z.number().positive(),
  })).default([]),
});

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  // CSRF
  if (!validateOrigin(request)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }
  // Rate limit
  const { allowed } = await rateLimit(`po-create:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  // Body parsing con try/catch
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // V2.4.5: getSupabaseAdminSafe (canónico, service-role)
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // Obtener active_store_id del perfil del usuario
  const { data: userData, error: profileErr } = await supabase
    .from('profiles')
    .select('active_store_id')
    .eq('id', session.user.id)
    .single();
  if (profileErr || !userData?.active_store_id) {
    return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
  }

  const storeId = userData.active_store_id;

  // V2.4.5: canManageStore defense-in-depth
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const { items, ...orderData } = parsed.data;

  // v2.26.0 G9: Usar RPC transaccional create_production_order_v2 (atómico)
  const idempotencyKey = `po-create-${crypto.randomUUID()}`;
  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_production_order_v2', {
    p_store_id: storeId,
    p_order_type: orderData.order_type,
    p_customer_name: orderData.customer_name || null,
    p_customer_ci: orderData.customer_ci || null,
    p_customer_phone: orderData.customer_phone || null,
    p_customer_address: orderData.customer_address || null,
    p_budget_total: orderData.budget_total,
    p_budget_currency: orderData.budget_currency,
    p_description: orderData.description || null,
    p_notes: orderData.notes || null,
    p_items: items.map(item => ({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      budgeted_qty: item.budgeted_qty,
      budgeted_unit_cost: item.budgeted_unit_cost,
    })),
    p_advance_amount: orderData.advance_amount || 0,
    p_advance_method: orderData.advance_method || null,
    p_advance_currency: orderData.advance_currency,
    p_created_by: session.user.id,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error('DATABASE', 'CREATE_PO_FAILED', { error: rpcError.message, userId: session.user.id });
    const msg = rpcError.message;
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    if (msg.includes('ERR_PRODUCT_NOT_IN_STORE')) return NextResponse.json({ error: 'Producto no encontrado en esta tienda' }, { status: 400 });
    if (msg.includes('ERR_IDEMPOTENCY_KEY_REUSE')) return NextResponse.json({ error: 'Idempotency key reutilizada con parámetros diferentes' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch the created order for response
  const { data: order, error: orderFetchError } = await supabase
    .from('production_orders')
    .select('*')
    .eq('id', rpcResult.order_id)
    .single();

  if (orderFetchError) {
    logger.error('DATABASE', 'CREATE_PO_FETCH_FAILED', { error: orderFetchError.message, orderId: rpcResult.order_id });
    return NextResponse.json(rpcResult, { status: 201 });
  }

  logger.info('DATABASE', 'PRODUCTION_ORDER_CREATED', {
    orderId: order.id,
    storeId,
    userId: session.user.id,
    orderType: order.order_type,
  });

  return NextResponse.json(order, { status: 201 });
}

async function getHandler(request: NextRequest, session: AuthenticatedSession) {
  // Rate limit (lectura más permisiva)
  const { allowed } = await rateLimit(`po-list:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const order_type = searchParams.get('order_type');

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data: userData, error: profileErr } = await supabase
    .from('profiles')
    .select('active_store_id')
    .eq('id', session.user.id)
    .single();
  if (profileErr || !userData?.active_store_id) {
    return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
  }

  // V2.4.5: canManageStore
  if (!canManageStore(session.user, userData.active_store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  let query = supabase.from('production_orders')
    .select('*')
    .eq('store_id', userData.active_store_id)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (order_type) query = query.eq('order_type', order_type);

  const { data, error } = await query.limit(200); // H5: paginación
  if (error) {
    logger.error('DATABASE', 'LIST_PO_FAILED', { error: error.message, userId: session.user.id });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

// V2.4.5: withTracing en exports (canónico)
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/production-orders');
export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/production-orders');
