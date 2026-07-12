import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';

// ── Schema para actualizar estado de comisión ──
const updateCommissionSchema = z.object({
  action: z.enum(['approve', 'pay', 'cancel']),
  payment_method: z.enum(['cash', 'transfer', 'zelle']).optional(),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
});

// ── PATCH: Aprobar / Pagar / Cancelar comisión ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { action, payment_method, currency, exchange_rate } = parsed.data;
    const commissionId = params.id;

    // Verificar que existe y obtener estado actual
    const { data: commission, error: fetchError } = await supabase
      .from('commission_payments')
      .select('id, status, final_amount')
      .eq('id', commissionId)
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
      updateData.approved_by = user.id;
      updateData.approved_at = new Date().toISOString();
    } else if (action === 'pay') {
      if (currentStatus !== 'approved' && currentStatus !== 'draft') {
        return NextResponse.json({ error: 'Solo se pueden pagar comisiones aprobadas o en borrador' }, { status: 400 });
      }
      if (!payment_method) {
        return NextResponse.json({ error: 'payment_method es requerido para pagar' }, { status: 400 });
      }
      updateData.status = 'paid';
      updateData.paid_by = user.id;
      updateData.paid_at = new Date().toISOString();
      updateData.payment_method = payment_method;
      updateData.currency = currency;
      updateData.exchange_rate = exchange_rate;
      // amount_cup se calcula automáticamente via trigger
    } else if (action === 'cancel') {
      updateData.status = 'cancelled';
    }

    const { data, error } = await supabase
      .from('commission_payments')
      .update(updateData)
      .eq('id', commissionId)
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
