import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * DELETE /api/payments/[id]
 *
 * Anula un pago registrado por error.
 * El trigger trg_update_payment_status recalcula automáticamente
 * paid_amount y payment_status del documento asociado.
 *
 * FIX-AUD4-1 (2026-07-13): usar extractIdFromUrl en vez de params
 * destructuring (withAuth no pasa el context object).
 */

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/payments\/([^/]+)/);
  return match?.[1] || null;
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const paymentId = extractIdFromUrl(req);
    if (!paymentId) {
      return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
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

    const { data: payment, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('id, ref_type, ref_id, amount, payment_method, store_id')
      .eq('id', paymentId)
      .eq('store_id', userData.active_store_id)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('payment_transactions')
      .delete()
      .eq('id', paymentId);

    if (deleteError) {
      console.error('[payments/delete] Error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Pago anulado. El estado del documento se recalculó automáticamente.',
      deleted_payment: payment,
    });
  } catch (error: any) {
    console.error('[payments/delete] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const DELETE = withAuth(deleteHandler);
