import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// ── DELETE: Anular un pago registrado por error ──
// FIX-PAYMENT-TRACKING (2026-07-12): permite eliminar un pago.
// El trigger trg_update_payment_status recalcula automáticamente
// paid_amount y payment_status del documento asociado.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;
    if (!paymentId) {
      return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Obtener store_id del usuario para validación
    const { data: userData } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', user.id)
      .single();

    if (!userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    // FIX-B6: Verificar que el pago existe Y pertenece a la store_id del usuario
    const { data: payment, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('id, ref_type, ref_id, amount, payment_method, store_id')
      .eq('id', paymentId)
      .eq('store_id', userData.active_store_id)  // FIX-B6: scope por store_id
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
