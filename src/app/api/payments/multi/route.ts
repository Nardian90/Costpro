import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { randomUUID } from 'crypto';
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';

/**
 * CP-OPS-ENERVIDA §6 — Liquidación múltiple en Cuentas por Pagar.
 *
 * POST /api/payments/multi
 *   { items: [{ ref_type: 'receipt'|'service', ref_id, amount }],
 *     payment_method, currency?, exchange_rate?, payment_date?,
 *     reference?, notes?, idempotency_key? }
 *
 * RPC register_supplier_payment_multi: lote ATÓMICO (una transacción: o se
 * liquidan todos los documentos o ninguno) con asignación explícita por
 * documento (total o parcial), UN medio y UNA moneda por lote, overpay
 * validado bajo bloqueo, replay idempotente por bloque. El flujo individual
 * (POST /api/payments) permanece intacto.
 */

const multiItemSchema = z.object({
  ref_type: z.enum(['receipt', 'service']),
  ref_id: uuidLoose,
  amount: z.number().positive(),
});

const multiSettlementSchema = z.object({
  items: z.array(multiItemSchema).min(1).max(50),
  payment_method: z.enum(['cash', 'transfer', 'external_transfer', 'zelle']),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  payment_date: z.string().optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  idempotency_key: z.string().optional().nullable(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const raw = await req.json();
    const parsed = multiSettlementSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cuerpo inválido', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const supabase = getSupabaseForSession(session);
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }
    const storeId = userData.active_store_id;

    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // La fecha financiera del lote es dato de cliente NO confiable: nunca
    // futuro (misma convención que /api/payments).
    if (body.payment_date) {
      const dateCheck = checkNotFutureOperationDate(body.payment_date);
      if (!dateCheck.ok) {
        return NextResponse.json({ error: dateCheck.error, code: 'ERR_FUTURE_DATED_DOCUMENT' }, { status: 422 });
      }
    }

    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }

    const { data: result, error: rpcError } = await admin.rpc('register_supplier_payment_multi', {
      p_store_id: storeId,
      p_items: body.items.map((it) => ({
        ref_type: it.ref_type,
        ref_id: it.ref_id,
        amount: it.amount,
      })),
      p_payment_method: body.payment_method,
      p_currency: body.currency,
      p_exchange_rate: body.exchange_rate,
      // Actor validado de la sesión server-side — nunca un parámetro del cliente.
      p_paid_by: session.user.id,
      ...(body.payment_date ? { p_payment_date: body.payment_date } : {}),
      p_reference: body.reference || null,
      p_notes: body.notes || null,
      p_idempotency_key: body.idempotency_key || `multi:${randomUUID()}`,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (rpcError.code === 'P0001' && (msg.includes('ERR_FUTURE_DATED_DOCUMENT') || msg.includes('ERR_BACKDATED_DOCUMENT'))) {
        return NextResponse.json(
          { error: 'Fecha del pago no admisible', message: msg, code: msg.includes('ERR_FUTURE') ? 'ERR_FUTURE_DATED_DOCUMENT' : 'ERR_BACKDATED_DOCUMENT' },
          { status: 422 }
        );
      }
      if (msg.includes('ERR_TASA_NO_DISPONIBLE')) {
        return NextResponse.json({ error: msg, code: 'ERR_TASA_NO_DISPONIBLE' }, { status: 422 });
      }
      if (msg.includes('ERR_MULTI_OVERPAY') || msg.includes('excede el saldo')) {
        return NextResponse.json({ error: msg, code: 'ERR_MULTI_OVERPAY' }, { status: 400 });
      }
      if (msg.includes('ERR_MULTI_SIZE') || msg.includes('ERR_ITEM_INVALID') || msg.includes('ERR_METHOD_INVALID') || msg.includes('ERR_CURRENCY_INVALID')) {
        return NextResponse.json({ error: msg, code: 'ERR_MULTI_INVALID' }, { status: 400 });
      }
      if (msg.includes('ERR_COMBINACION_NO_SOPORTADA')) {
        return NextResponse.json({ error: msg, code: 'ERR_COMBINACION_NO_SOPORTADA' }, { status: 400 });
      }
      if (msg.includes('ERR_DOC_NOT_PAYABLE')) {
        return NextResponse.json({ error: msg, code: 'ERR_DOC_NOT_PAYABLE' }, { status: 409 });
      }
      if (msg.includes('ERR_SERVICE_NOT_ACTIVE')) {
        return NextResponse.json({ error: msg, code: 'ERR_SERVICE_NOT_ACTIVE' }, { status: 409 });
      }
      if (msg.includes('ERR_RECEIPT_NOT_PAYABLE')) {
        return NextResponse.json({ error: msg, code: 'ERR_RECEIPT_NOT_PAYABLE' }, { status: 409 });
      }
      console.error('[payments/multi] Error RPC:', rpcError);
      return NextResponse.json({ error: msg || 'Error al registrar la liquidación múltiple' }, { status: 500 });
    }

    const rows = (result?.payments ?? []) as { id: string; index: number; ref_type: string; ref_id: string; amount: number; amount_cup: number; replayed?: boolean }[];
    return NextResponse.json({
      success: true,
      payments: rows,
      count: result?.count ?? rows.length,
      total_amount: result?.total_amount,
      total_cup: result?.total_cup,
      replayed: result?.replayed === true,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[payments/multi] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'payments:multi',
  maxRequests: 10,
}));
