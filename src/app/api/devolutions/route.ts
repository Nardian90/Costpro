/**
 * GET /api/devolutions?store_id=X&limit=20&page=1
 * POST /api/devolutions — crear devolución vía RPC create_devolution_v2
 * (FINALIZE-V2: único camino soportado; el fallback V1 create_devolution y el
 * flag USE_V2_REVERSE fueron eliminados).
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
// MISIÓN POLÍTICA TEMPORAL (2026-10-18): tope HOY (Habana) para la fecha
// operativa de la devolución — paridad con /api/pos/checkout y /api/vale-salida.
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';

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
  // MISIÓN CAJA v2.24.0: moneda REAL por la que sale el dinero del reembolso
  // (v2.24 añade p_refund_currency al RPC; el reembolso en USD registra la
  // fila PT en USD con tasa servidor — ya no hardcodeada CUP×1.0).
  refund_currency: z.enum(['CUP', 'USD']).default('CUP'),
  customer_id: z.string().min(1).optional(),
  customer_name: z.string().optional(),
  notes: z.string().optional(),
  // ENERVIDA import (2026-10-05): fecha de operación opcional (retro-compatible).
  // El RPC create_devolution_v2 ya la soporta (migración 20261004120001,
  // p_operation_date DEFAULT NULL) — paridad con /api/pos/checkout.
  operation_date: z.string().datetime().optional(),
  // REVISIÓN FINAL v2.24.1: idempotencia cooperativa — el cliente envía una
  // clave estable por intento de envío (UI). Si falta, se mintea (retro-compat);
  // el RPC v2.24.1 compara hash del payload ante claves repetidas.
  idempotency_key: z.string().min(8).max(128).optional(),
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

  // MISIÓN POLÍTICA TEMPORAL (2026-10-18): revalidación server-side del tope
  // superior — la devolución no puede llevar fecha operativa futura (día de
  // negocio America/Havana). El RPC create_devolution_v2 ya aplica el gate BD
  // (piso 6 meses / hoy+1); aquí el tope estricto HOY → 422 accionable
  // (paridad con /api/pos/checkout y /api/vale-salida).
  if (parsed.data.operation_date) {
    const dateCheck = checkNotFutureOperationDate(parsed.data.operation_date);
    if (!dateCheck.ok) {
      return NextResponse.json({ error: dateCheck.error, code: 'ERR_FUTURE_OPERATION_DATE' }, { status: 422 });
    }
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // FINALIZE-V2: create_devolution_v2 es el ÚNICO camino de devolución (el
  // fallback al RPC V1 create_devolution y el feature flag USE_V2_REVERSE
  // fueron eliminados — migración 20261005140000_drop_v1_sale_devolution).
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
    // REVISIÓN FINAL v2.24.1: respetar la clave del cliente cuando llega
    // (reintentos del mismo envío reutilizan clave → el RPC devuelve la
    // devolución original o conflicto explícito, nunca duplica reembolso).
    p_idempotency_key: parsed.data.idempotency_key || `dev-${crypto.randomUUID()}`,
    p_operation_date: parsed.data.operation_date ?? null, // ENERVIDA import: paridad con checkout
    // MISIÓN CAJA v2.24.0: moneda real del reembolso (CUP por defecto —
    // paridad total con las llamadas previas de 11 args).
    p_refund_currency: parsed.data.refund_currency || 'CUP',
  };

  const { data, error } = await supabase.rpc('create_devolution_v2', rpcParams);

  if (error) {
    const msg = error.message || '';
    // MISIÓN POLÍTICA TEMPORAL: rechazos del gate de fechas → 422 accionable.
    if (msg.includes('ERR_FUTURE_DATED_DOCUMENT') || msg.includes('ERR_BACKDATED_DOCUMENT')) {
      return NextResponse.json({ error: msg, code: msg.includes('ERR_FUTURE') ? 'ERR_FUTURE_DATED_DOCUMENT' : 'ERR_BACKDATED_DOCUMENT' }, { status: 422 });
    }
    logger.error('DATABASE', 'CREATE_DEVOLUTION_FAILED', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('DATABASE', 'DEVOLUTION_CREATED', { storeId: parsed.data.store_id, userId: session.user.id, devId: data?.devolution_id });
  return NextResponse.json(data);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/devolutions');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/devolutions');
