import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { withSecurity } from '@/lib/with-security';
import { canManageStore } from '@/lib/roles';

/**
 * CP-OPS-ENERVIDA §5 — Reversión de pago de proveedor.
 *
 * POST /api/payments/[id] { reason?: string }
 *   Anula el PAGO sin anular el documento (misión §5: no confundir
 *   «anular un pago» con «anular la recepción»). Implementación contable:
 *   RPC reverse_supplier_payment → fila contraria (direction='reversal',
 *   reverses_payment_id) + asiento compensatorio ('anulacion', reversal_of)
 *   + obligación restablecida por neteo del trigger. Transaccional e
 *   idempotente (un doble clic no genera dos devoluciones).
 *
 * DELETE /api/payments/[id]
 *   Borrado físico PROHIBIDO por diseño (trigger PT007
 *   ERR_PAYMENT_DELETE_FORBIDDEN: «Use reversal/void flow»). Se responde 409
 *   accionable apuntando al flujo de reversión — el histórico nunca se
 *   borra ni se edita.
 */

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/payments\/([^/]+)/);
  return match?.[1] || null;
}

async function reverseHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const paymentId = extractIdFromUrl(req);
    if (!paymentId) {
      return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
    }

    // CP-SEC: validación Zod del cuerpo (check 4 del ci-gate-ts-checks).
    const reverseBodySchema = z.object({
      reason: z.string().max(300).optional().nullable(),
    });
    let reason: string | null = null;
    try {
      const raw = await req.json();
      const parsed = reverseBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Cuerpo inválido: reason debe ser un texto de hasta 300 caracteres' }, { status: 400 });
      }
      reason = parsed.data.reason && parsed.data.reason.trim() ? parsed.data.reason.trim().slice(0, 300) : null;
    } catch {
      // cuerpo vacío es válido (motivo opcional)
    }

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

    // Pertenencia del pago a la tienda activa (el RPC revalida la autorización
    // del actor con has_store_access_as; aquí el gate de gestión del canal).
    const { data: payment, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('id, ref_type, ref_id, amount, amount_cup, currency, payment_method, direction, reverses_payment_id, store_id')
      .eq('id', paymentId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }
    if (!['receipt', 'service'].includes(payment.ref_type)) {
      return NextResponse.json({ error: 'Solo se pueden revertir pagos de recepciones y servicios' }, { status: 400 });
    }
    if (payment.reverses_payment_id) {
      return NextResponse.json({ error: 'La fila indicada ya es una reversión; revierta el pago original' }, { status: 400 });
    }

    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }

    const { data: result, error: rpcError } = await admin.rpc('reverse_supplier_payment', {
      p_payment_id: paymentId,
      p_reason: reason,
      // Actor validado de la sesión server-side — nunca un parámetro del cliente.
      p_user_id: session.user.id,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('ERR_PAYMENT_NOT_FOUND')) {
        return NextResponse.json({ error: 'Pago no encontrado', code: 'ERR_PAYMENT_NOT_FOUND' }, { status: 404 });
      }
      if (msg.includes('ERR_PAYMENT_NOT_REVERSIBLE') || msg.includes('ERR_REVERSAL_NOT_SUPPORTED')) {
        return NextResponse.json({ error: msg, code: 'ERR_PAYMENT_NOT_REVERSIBLE' }, { status: 409 });
      }
      if (msg.includes('ERR_UNAUTHORIZED')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (msg.includes('ERR_FUTURE_DATED_DOCUMENT') || msg.includes('ERR_BACKDATED_DOCUMENT')) {
        return NextResponse.json({ error: 'Fecha de la reversión no admisible', message: msg, code: 'ERR_OPERATION_DATE' }, { status: 422 });
      }
      console.error('[payments/reverse] Error RPC:', rpcError);
      return NextResponse.json({ error: msg || 'Error al revertir el pago' }, { status: 500 });
    }

    const idempotent = result?.status === 'idempotent';
    return NextResponse.json({
      success: true,
      idempotent,
      status: result?.status,
      reversal_payment_id: result?.reversal_payment_id,
      original_payment_id: paymentId,
      message: idempotent
        ? 'El pago ya estaba revertido (operación idempotente).'
        : 'Pago revertido: se registró el movimiento compensatorio y la obligación quedará restablecida.',
    }, { status: idempotent ? 200 : 201 });
  } catch (error: any) {
    console.error('[payments/reverse] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function deleteHandler(_req: NextRequest, _session: AuthenticatedSession) {
  // PT007 (trigger trg_validate_payment_invariants): los pagos confirmados no
  // se borran — la rectificación contable es la REVERSIÓN (POST /api/payments/[id]).
  return NextResponse.json(
    {
      error: 'Los pagos no se pueden borrar (PT007): use la reversión contable',
      code: 'ERR_PAYMENT_DELETE_FORBIDDEN',
      hint: 'POST /api/payments/[id] con { "reason": "..." } registra la contra-fila y el asiento compensatorio.',
    },
    { status: 409 }
  );
}

export const POST = withAuth(withSecurity(reverseHandler, {
  rateLimitKey: 'payments:reverse',
  maxRequests: 20,
}));

export const DELETE = withAuth(withSecurity(deleteHandler, {
  rateLimitKey: 'payments:delete',
  maxRequests: 10,
}));
