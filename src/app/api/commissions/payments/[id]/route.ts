import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

/**
 * GET / PATCH /api/commissions/payments/[id]
 *
 * FIX-AUD4-1 (2026-07-13): usar extractIdFromUrl en vez de params
 * destructuring (withAuth no pasa el context object).
 * FIX-AUD2-1: withAuth + getSupabaseForSession.
 * FIX-AUD2-3: valida store_id.
 * FIX-AUD2-4: idempotente.
 * FIX-AUD3-2: GET endpoint añadido.
 * FIX-AUD3-4: payment_reference en body.
 */

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/commissions\/payments\/([^/]+)/);
  return match?.[1] || null;
}

const updateCommissionSchema = z.object({
  action: z.enum(['approve', 'pay', 'cancel']),
  payment_method: z.enum(['cash', 'transfer', 'zelle', 'mixed']).optional(),
  payment_reference: z.string().optional().nullable(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
});

// ── GET: Obtener comisión por ID ──
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const commissionId = extractIdFromUrl(req);
    if (!commissionId) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
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
      .eq('store_id', userData.active_store_id)
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

// ── PATCH: Aprobar / Pagar / Cancelar ──
async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // FIX-C3 (2026-07-14): validar rol admin/manager (defense in depth)
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
    }

    const commissionId = extractIdFromUrl(req);
    if (!commissionId) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updateCommissionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, payment_method, payment_reference, currency, exchange_rate } = parsed.data;

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

    const { data: commission, error: fetchError } = await supabase
      .from('commission_payments')
      .select('id, status, final_amount, store_id')
      .eq('id', commissionId)
      .eq('store_id', storeId)
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
      if (currentStatus === 'paid') {
        return NextResponse.json({ ...commission, message: 'La comisión ya estaba pagada' });
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

    const { data, error } = await supabase
      .from('commission_payments')
      .update(updateData)
      .eq('id', commissionId)
      .eq('store_id', storeId)
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

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
