import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import { randomUUID } from 'crypto';

// ── Schema de validación para un pago individual ──
const paymentRowSchema = z.object({
  payment_method: z.enum(['cash', 'transfer', 'zelle']),
  amount: z.number().positive(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ── Schema para registro de pago (soporta 1 o múltiples filas) ──
// FIX-FASE-0.4 (2026-07-13): soporta payments[] para pago mixto multi-moneda
// (mismo patrón que el POS). Backward compatible: si envías `amount` + `payment_method`
// en el root, funciona como antes (pago simple).
const registerPaymentSchema = z.object({
  ref_type: z.enum(['receipt', 'service', 'production_order', 'work']),
  ref_id: z.string().uuid(),
  // Opción A: pago simple (1 fila)
  payment_method: z.enum(['cash', 'transfer', 'zelle']).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Opción B: pago mixto (múltiples filas, como el POS)
  payments: z.array(paymentRowSchema).optional(),
  // Idempotencia: si se envía, previene doble-click
  idempotency_key: z.string().optional(),
}).refine(
  (data) => data.payments || (data.amount !== undefined && data.payment_method !== undefined),
  { message: 'Debe enviar `payments` (array) o `amount` + `payment_method` en el root' }
);

// ── POST: Registrar pago(s) a proveedor ──
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const parsed = registerPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ref_type, ref_id, idempotency_key } = parsed.data;

    // Normalizar a array de pagos
    const payments = parsed.data.payments || [{
      payment_method: parsed.data.payment_method!,
      amount: parsed.data.amount!,
      currency: parsed.data.currency,
      exchange_rate: parsed.data.exchange_rate,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
    }];

    if (payments.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos un pago' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    // Obtener store_id del usuario
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    const storeId = userData.active_store_id;

    // Registrar cada pago dentro de la misma idempotency key (con sufijo por índice)
    // Esto permite que un pago mixto de 3 filas sea idempotente como bloque.
    const results: { id: string; method: string; amount: number; currency: string }[] = [];

    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      const idemKey = idempotency_key
        ? `${idempotency_key}:${i}`
        : null;

      const { data, error } = await supabase.rpc('register_supplier_payment', {
        p_store_id: storeId,
        p_ref_type: ref_type,
        p_ref_id: ref_id,
        p_amount: p.amount,
        p_payment_method: p.payment_method,
        p_currency: p.currency,
        p_exchange_rate: p.exchange_rate,
        p_reference: p.reference || null,
        p_notes: p.notes || null,
        p_paid_by: session.user.id,
        p_idempotency_key: idemKey,
      });

      if (error) {
        // Si ya existe (idempotency replay), el RPC devuelve el ID existente
        // pero Supabase puede reportar error. Verificamos el código.
        if (error.code === 'P0001' && error.message.includes('excede el saldo')) {
          return NextResponse.json(
            { error: `Pago ${i + 1}: excede el saldo pendiente. Overpay no permitido.`, payment_index: i },
            { status: 400 }
          );
        }
        console.error('[payments] Error RPC:', error);
        return NextResponse.json(
          { error: error.message, payment_index: i },
          { status: 500 }
        );
      }

      results.push({
        id: data,
        method: p.payment_method,
        amount: p.amount,
        currency: p.currency,
      });
    }

    return NextResponse.json({
      success: true,
      payments: results,
      count: results.length,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[payments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── GET: Listar pagos de un documento ──
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const ref_type = searchParams.get('ref_type');
    const ref_id = searchParams.get('ref_id');
    const store_id = searchParams.get('store_id');

    if (!ref_type || !ref_id) {
      return NextResponse.json({ error: 'ref_type y ref_id son requeridos' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    let query = supabase
      .from('payment_transactions')
      .select('*')
      .eq('ref_type', ref_type)
      .eq('ref_id', ref_id)
      .order('payment_date', { ascending: false });

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[payments] Error fetching:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('[payments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);
export const GET = withAuth(getHandler);
