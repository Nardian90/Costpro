import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';

/**
 * Iteración 11.2 — POST /api/pos/checkout
 *
 * Server-side checkout endpoint that wraps create_sale_v2 RPC.
 * Activated only when USE_V2_CHECKOUT feature flag is true.
 *
 * Security:
 * - withAuth (validates session)
 * - CSRF (validateOrigin)
 * - Rate limit: 30 req/min per user
 * - Zod validation of full payload
 * - Supervisor auth server-side (if discount >= 15%)
 * - All financial calculations done server-side in RPC
 */

const itemSchema = z.object({
  product_id: z.string().regex(uuidRegex),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  cost: z.number().min(0),
  cash_paid: z.number().optional(),
  transfer_paid: z.number().optional(),
  zelle_paid: z.number().optional(),
  currency: z.string().optional(),
  exchange_rate: z.number().optional(),
  cash_currency: z.string().optional(),
  transfer_currency: z.string().optional(),
  zelle_currency: z.string().optional(),
  cash_discount_type: z.string().nullable().optional(),
  cash_discount_value: z.number().optional(),
  cash_discount_currency: z.string().optional(),
  transfer_discount_type: z.string().nullable().optional(),
  transfer_discount_value: z.number().optional(),
  transfer_discount_currency: z.string().optional(),
  zelle_discount_type: z.string().nullable().optional(),
  zelle_discount_value: z.number().optional(),
  zelle_discount_currency: z.string().optional(),
});

const checkoutSchema = z.object({
  store_id: z.string().regex(uuidRegex),
  seller_id: z.string().regex(uuidRegex),
  payment_method: z.enum(['cash', 'transfer', 'zelle', 'mixed']),
  discount_type: z.enum(['fixed', 'percentage']).default('fixed'),
  discount_value: z.number().min(0).default(0),
  applied_taxes: z.array(z.any()).default([]),
  tax_amount: z.number().min(0).default(0),
  total_amount: z.number().min(0),
  subtotal: z.number().min(0).default(0),
  cash_amount: z.number().min(0).default(0),
  transfer_amount: z.number().min(0).default(0),
  zelle_amount: z.number().min(0).default(0),
  sale_currency: z.string().default('CUP'),
  sale_exchange_rate: z.number().default(1),
  customer_id: z.string().regex(uuidRegex).nullable().optional(),
  customer_name: z.string().optional(),
  supervisor_user_id: z.string().regex(uuidRegex).nullable().optional(),
  idempotency_key: z.string().min(1),
  operation_date: z.string().datetime().optional(),
  items: z.array(itemSchema).min(1),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await rateLimit(`pos-checkout:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const d = parsed.data;

  // Map items to JSONB for RPC (rename price→price_at_sale, cost→cost_at_sale)
  const itemsJsonb = d.items.map(i => ({
    product_id: i.product_id,
    variant_id: i.variant_id ?? null,
    quantity: i.quantity,
    price_at_sale: i.price,
    cost_at_sale: i.cost,
    cash_paid: i.cash_paid,
    transfer_paid: i.transfer_paid,
    zelle_paid: i.zelle_paid,
    currency: i.currency,
    exchange_rate: i.exchange_rate,
    cash_currency: i.cash_currency,
    transfer_currency: i.transfer_currency,
    zelle_currency: i.zelle_currency,
    cash_discount_type: i.cash_discount_type,
    cash_discount_value: i.cash_discount_value,
    cash_discount_currency: i.cash_discount_currency,
    transfer_discount_type: i.transfer_discount_type,
    transfer_discount_value: i.transfer_discount_value,
    transfer_discount_currency: i.transfer_discount_currency,
    zelle_discount_type: i.zelle_discount_type,
    zelle_discount_value: i.zelle_discount_value,
    zelle_discount_currency: i.zelle_discount_currency,
  }));

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('create_sale_v2', {
    p_store_id: d.store_id,
    p_seller_id: d.seller_id,
    p_items: itemsJsonb,
    p_payment_method: d.payment_method,
    p_discount_type: d.discount_type,
    p_discount_value: d.discount_value,
    p_applied_taxes: d.applied_taxes,
    p_tax_amount: d.tax_amount,
    p_total_amount: d.total_amount,
    p_subtotal: d.subtotal,
    p_cash_amount: d.cash_amount,
    p_transfer_amount: d.transfer_amount,
    p_zelle_amount: d.zelle_amount,
    p_sale_currency: d.sale_currency,
    p_sale_exchange_rate: d.sale_exchange_rate,
    p_customer_id: d.customer_id ?? null,
    p_customer_name: d.customer_name ?? null,
    p_supervisor_user_id: d.supervisor_user_id ?? null,
    p_idempotency_key: d.idempotency_key,
    p_operation_date: d.operation_date ?? null,
    p_user_id: session.user.id,
  });

  if (rpcError) {
    const msg = rpcError.message || '';
    logger.error('POS', 'CREATE_SALE_V2_FAILED', { error: msg, storeId: d.store_id });

    if (msg.includes('ERR_INSUFFICIENT_STOCK')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes('ERR_TOTAL_MISMATCH')) {
      return NextResponse.json({ error: 'Descuadre detectado. Recarga la página e intenta de nuevo.' }, { status: 422 });
    }
    if (msg.includes('ERR_SUPERVISOR_REQUIRED')) {
      return NextResponse.json({ error: 'Se requiere autorización de supervisor para este descuento.' }, { status: 403 });
    }
    if (msg.includes('ERR_SUPERVISOR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Supervisor no autorizado en esta tienda.' }, { status: 403 });
    }
    if (msg.includes('ERR_PAYMENT_MISMATCH')) {
      return NextResponse.json({ error: 'Los pagos no cuadran con el total.' }, { status: 422 });
    }
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'No autorizado para vender en esta tienda.' }, { status: 403 });
    }
    if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
      return NextResponse.json({ error: 'La fecha de operación es anterior a la última venta.' }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  logger.info('POS', 'CREATE_SALE_V2_SUCCESS', {
    transactionId: (rpcData as any)?.transaction_id,
    storeId: d.store_id,
  });

  return NextResponse.json({
    success: true,
    ...(rpcData as object || {}),
  });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/pos/checkout'
);
