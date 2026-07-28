/**
 * PATCH /api/transactions/[id]/adjust
 *
 * Ajusta metadatos financieros de una venta ya registrada (V2.12.17).
 * Cumple NIIF 15 (modificaciones de contrato) + NIC 2 (inmutabilidad del costo).
 *
 * AJUSTABLE:
 *   - payment_method, cash_amount, transfer_amount, zelle_amount
 *   - sale_currency, sale_exchange_rate
 *   - price_at_sale (precio de venta por item) → recalcula subtotal/total
 *   - discount_type, discount_value
 *
 * NO AJUSTABLE (inmutable post-venta):
 *   - quantity, cost_at_sale, product_id, seller_id, completed_at
 *
 * Body:
 *   {
 *     "payment_method": "cash" | "transfer" | "zelle" | "mixed" | "card" | "other",
 *     "cash_amount": 1000,
 *     "transfer_amount": 0,
 *     "zelle_amount": 0,
 *     "sale_currency": "CUP" | "USD" | "EUR" | "MLC",
 *     "sale_exchange_rate": 450,
 *     "items_price_adjustments": [
 *       { "product_id": "uuid", "price_at_sale": 150 }
 *     ],
 *     "discount_type": "fixed" | "percentage",
 *     "discount_value": 0,
 *     "reason": "Corrección de tasa de cambio aplicada"
 *   }
 *
 * Todos los campos son opcionales — solo se actualizan los que se envían.
 *
 * Respuesta:
 *   200 OK → { status: "success", old_total, new_total, changes, audit_logged }
 *   403 → no autorizado
 *   404 → transacción no encontrada
 *   400 → campo inmutable intentado cambiar (ERR_IMMUTABLE_FIELD)
 *   500 → error interno
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const adjustSchema = z.object({
  payment_method: z.enum(['cash', 'transfer', 'zelle', 'mixed', 'card', 'other']).optional(),
  cash_amount: z.number().min(0).optional(),
  transfer_amount: z.number().min(0).optional(),
  zelle_amount: z.number().min(0).optional(),
  sale_currency: z.enum(['CUP', 'USD', 'EUR', 'MLC']).optional(),
  sale_exchange_rate: z.number().positive().optional(),
  items_price_adjustments: z.array(z.object({
    product_id: z.string().uuid(),
    price_at_sale: z.number().min(0),
  })).optional(),
  discount_type: z.enum(['fixed', 'percentage']).optional(),
  discount_value: z.number().min(0).optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (data) => Object.keys(data).some(k => k !== 'reason' && data[k as keyof typeof data] !== undefined),
  { message: 'Debe proporcionar al menos un campo ajustable' }
);

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const txId = req.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
    if (!txId) {
      return NextResponse.json({ error: 'Transaction ID requerido' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Llamar RPC adjust_sale_payment via Supabase
    const supabase = getSupabaseForSession(session);
    const { data: result, error } = await supabase.rpc('adjust_sale_payment', {
      p_transaction_id: txId,
      p_user_id: session.user.id,
      p_payment_method: data.payment_method || null,
      p_cash_amount: data.cash_amount ?? null,
      p_transfer_amount: data.transfer_amount ?? null,
      p_zelle_amount: data.zelle_amount ?? null,
      p_sale_currency: data.sale_currency || null,
      p_sale_exchange_rate: data.sale_exchange_rate ?? null,
      p_items_price_adjustments: data.items_price_adjustments || null,
      p_discount_type: data.discount_type || null,
      p_discount_value: data.discount_value ?? null,
      p_reason: data.reason || null,
    });

    if (error) {
      logger.error('POS', 'SALE_ADJUST_FAILED', { txId, error: error.message, userId: session.user.id });

      // Traducir códigos de error de la RPC a HTTP status
      if (error.message.includes('ERR_UNAUTHORIZED')) {
        return NextResponse.json({ error: 'No autorizado para ajustar esta venta' }, { status: 403 });
      }
      if (error.message.includes('ERR_TRANSACTION_NOT_FOUND')) {
        return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
      }
      if (error.message.includes('ERR_TRANSACTION_NOT_ADJUSTABLE')) {
        return NextResponse.json(
          { error: 'La venta no se puede ajustar (estado: ' + error.message.split(':')[1] + ')' },
          { status: 409 }
        );
      }
      if (error.message.includes('ERR_IMMUTABLE_FIELD')) {
        return NextResponse.json(
          { error: 'No se puede cambiar quantity o cost_at_sale (NIC 2 - inmutable post-venta)' },
          { status: 400 }
        );
      }
      if (error.message.includes('ERR_ITEM_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'Item no encontrado en la transacción: ' + error.message },
          { status: 404 }
        );
      }
      if (error.message.includes('ERR_INVALID_PRICE')) {
        return NextResponse.json(
          { error: 'Precio inválido: no puede ser negativo' },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.info('POS', 'SALE_ADJUSTED', {
      txId,
      userId: session.user.id,
      oldTotal: result?.old_total,
      newTotal: result?.new_total,
      changes: result?.changes,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error('POS', 'SALE_ADJUST_EXCEPTION', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}

export const PATCH = withAuth(withSecurity(patchHandler, {
  rateLimitKey: 'transactions:adjust',
  maxRequests: 10,  // 10 ajustes por minuto por usuario (escritura sensible)
}));
