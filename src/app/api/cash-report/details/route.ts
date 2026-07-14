import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/cash-report/details
 *
 * Devuelve los documentos individuales que componen un grupo del reporte de caja.
 * Query: type=sale|payment, method=cash|transfer|zelle, currency=CUP|USD|MLC,
 *        start_date, end_date, ref_type? (para payments)
 *
 * FIX-C1+FIX-METHOD (2026-07-14): el frontend enviaba "efectivo" en vez de "cash".
 * Ahora acepta ambos (traduce español→inglés).
 */

const METHOD_MAP: Record<string, string> = {
  'efectivo': 'cash', 'cash': 'cash',
  'transferencia': 'transfer', 'transfer': 'transfer',
  'zelle': 'zelle',
};

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'sale';
    const rawMethod = (searchParams.get('method') || 'cash').toLowerCase();
    const method = METHOD_MAP[rawMethod] || rawMethod;
    const currency = searchParams.get('currency') || 'CUP';
    const refType = searchParams.get('ref_type');
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();

    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase
      .from('profiles').select('active_store_id').eq('id', session.user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    const storeId = userData.active_store_id;

    if (type === 'sale') {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, created_at, total_amount, payment_method, sale_currency, reference, status')
        .eq('store_id', storeId)
        .eq('payment_method', method)
        .eq('sale_currency', currency)
        .neq('status', 'voided')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    } else {
      let query = supabase
        .from('payment_transactions')
        .select('id, payment_date, amount, amount_cup, payment_method, currency, reference, notes, ref_type, ref_id')
        .eq('store_id', storeId)
        .eq('payment_method', method)
        .eq('currency', currency)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate)
        .order('payment_date', { ascending: false })
        .limit(100);

      if (refType) query = query.eq('ref_type', refType);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }
  } catch (error: any) {
    console.error('[cash-report/details] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
