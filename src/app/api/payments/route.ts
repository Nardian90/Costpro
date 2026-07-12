import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseClient';
import { z } from 'zod';

// ── Schema de validación ──
const registerPaymentSchema = z.object({
  ref_type: z.enum(['receipt', 'service']),
  ref_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'transfer', 'zelle']),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ── POST: Registrar pago a proveedor ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Obtener store_id del usuario
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    // Llamar al RPC register_supplier_payment
    const { data, error } = await supabase.rpc('register_supplier_payment', {
      p_store_id: userData.active_store_id,
      p_ref_type: parsed.data.ref_type,
      p_ref_id: parsed.data.ref_id,
      p_amount: parsed.data.amount,
      p_payment_method: parsed.data.payment_method,
      p_currency: parsed.data.currency,
      p_exchange_rate: parsed.data.exchange_rate,
      p_reference: parsed.data.reference || null,
      p_notes: parsed.data.notes || null,
      p_paid_by: user.id,
    });

    if (error) {
      console.error('[payments] Error RPC:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data, ...parsed.data }, { status: 201 });
  } catch (error: any) {
    console.error('[payments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── GET: Listar pagos de un documento ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ref_type = searchParams.get('ref_type');
    const ref_id = searchParams.get('ref_id');
    const store_id = searchParams.get('store_id');

    if (!ref_type || !ref_id) {
      return NextResponse.json({ error: 'ref_type y ref_id son requeridos' }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

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
