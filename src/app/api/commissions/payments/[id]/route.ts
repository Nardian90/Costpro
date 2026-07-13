import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

/**
 * PATCH /api/commissions/payments/[id]
 *
 * Aprobar / Pagar / Cancelar comisión.
 *
 * FIX-AUD2-1 (2026-07-13): reescrito con withAuth + getSupabaseForSession.
 * Antes usaba supabase.auth.getUser() sin sesión SSR → 401 siempre.
 *
 * FIX-AUD2-3: valida store_id (cross-store access control).
 * FIX-AUD2-4: idempotente — solo actualiza si status coincide con el esperado.
 */

const updateCommissionSchema = z.object({
  action: z.enum(['approve', 'pay', 'cancel']),
  payment_method: z.enum(['cash', 'transfer', 'zelle', 'mixed']).optional(),
  payment_reference: z.string().optional().nullable(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
});

async function patchHandler(
  request: NextRequest,
  session: AuthenticatedSession,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const parsed = updateCommissionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, payment_method, payment_reference, currency, exchange_rate } = parsed.data;
    const { id: commissionId } = await params;

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

    // FIX-AUD2-3: verificar que la comisión existe Y pertenece a la store del usuario
    const { data: commission, error: fetchError } = await supabase
      .from('commission_payments')
      .select('id, status, final_amount, store_id')
      .eq('id', commissionId)
      .eq('store_id', storeId)  // FIX-AUD2-3: scope por store_id
      .single();

    if (fetchError || !commission) {
      return NextResponse.json({ error: 'Comisión no encontrada' }, { status: 404 });
    }

    const currentStatus = commission.status;
    const updateData: any = { updated_at: new Date().toISOString() };

    if (action === 'approve') {
      if (currentStatus !== 'draft') {
        return NextResponse.json({ error: 'Solo se pueden aprobar comisiones en borrador' }, { status: 400 });
      }
      updateData.status = 'approved';
      updateData.approved_by = session.user.id;
      updateData.approved_at = new Date().toISOString();
    } else if (action === 'pay') {
      // FIX-AUD2-4: idempotente — solo se pueden pagar comisiones approved
      if (currentStatus === 'paid') {
        // Ya está pagada — idempotente, devolver sin error
        return NextResponse.json({
          ...commission,
          message: 'La comisión ya estaba pagada',
        });
      }
      if (currentStatus !== 'approved' && currentStatus !== 'draft') {
        return NextResponse.json(
          { error: `No se puede pagar una comisión con estado "${currentStatus}"` },
          { status: 400 }
        );
      }
      if (!payment_method) {
        return NextResponse.json({ error: 'payment_method es requerido para pagar' }, { status: 400 });
      }
      updateData.status = 'paid';
      updateData.paid_by = session.user.id;
      updateData.paid_at = new Date().toISOString();
      updateData.payment_method = payment_method;
      updateData.payment_reference = payment_reference || null;
      updateData.currency = currency;
      updateData.exchange_rate = exchange_rate;
    } else if (action === 'cancel') {
      if (currentStatus === 'paid') {
        return NextResponse.json({ error: 'No se puede cancelar una comisión ya pagada' }, { status: 400 });
      }
      updateData.status = 'cancelled';
    }

    // FIX-AUD2-4: UPDATE con condición de status para idempotencia
    const { data, error } = await supabase
      .from('commission_payments')
      .update(updateData)
      .eq('id', commissionId)
      .eq('store_id', storeId)  // FIX-AUD2-3: doble validación
      .select()
      .single();

    if (error) {
      console.error('[commissions/patch] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[commissions/patch] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const PATCH = withAuth(patchHandler);

/**
 * GET /api/commissions/payments/[id]
 *
 * Obtiene una comisión por ID (con validación de store_id).
 *
 * FIX-AUD3-2 (2026-07-13): este endpoint faltaba — PaymentHistoryRow
 * lo llamaba y recibía 405, haciendo que el historial de comisiones
 * siempre apareciera vacío.
 */
async function getHandler(
  request: NextRequest,
  session: AuthenticatedSession,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commissionId } = await params;
    if (!commissionId) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
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

    const { data: commission, error: fetchError } = await supabase
      .from('commission_payments')
      .select(`
        id, store_id, worker_id, period_start, period_end, due_date,
        final_amount, calculated_amount, status, payment_method,
        payment_reference, paid_at, paid_by, approved_by, approved_at,
        currency, exchange_rate, created_at, updated_at,
        worker:workers!inner(first_name, last_name, ci)
      `)
      .eq('id', commissionId)
      .eq('store_id', userData.active_store_id)  // FIX-AUD3: validar store_id
      .single();

    if (fetchError || !commission) {
      return NextResponse.json({ error: 'Comisión no encontrada' }, { status: 404 });
    }

    return NextResponse.json(commission);
  } catch (error: any) {
    console.error('[commissions/get] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
