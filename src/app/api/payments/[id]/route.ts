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
 * FIX-AUDIT-C1 (2026-07-13): reescrito con withAuth + getSupabaseForSession.
 * Antes usaba supabase.auth.getUser() sin sesión SSR → 401 siempre.
 */

async function deleteHandler(
  request: NextRequest,
  session: AuthenticatedSession,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;
    if (!paymentId) {
      return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
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

    // FIX-B6: Verificar que el pago existe Y pertenece a la store_id del usuario
    const { data: payment, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('id, ref_type, ref_id, amount, payment_method, store_id')
      .eq('id', paymentId)
      .eq('store_id', userData.active_store_id)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    // Eliminar el pago — el trigger recalcula el estado automáticamente
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
