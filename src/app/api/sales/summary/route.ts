/**
 * GET /api/sales/summary?store_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * PR-4.4I v2.2.2-R7.2.1: Resumen consolidado de ventas.
 *
 * USD = SUM(payment_transactions.amount WHERE currency='USD') — venta por venta.
 * NO usa /680 global. Si una venta no tiene payment_transactions, se marca como
 * venta_sin_tasa y el CUP equivalente se suma a usd_sin_tasa_cup_equiv.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!storeId) {
      return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    // PR-4.4I: LEFT JOIN con payment_transactions (sin !inner para conservar históricos)
    let query = supabase
      .from('transactions')
      .select(`
        id,
        completed_at,
        sale_currency,
        payment_method,
        cash_amount,
        transfer_amount,
        zelle_amount,
        total_amount,
        status,
        payment_transactions(amount, currency, exchange_rate, amount_cup, payment_method)
      `)
      .eq('store_id', storeId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true });

    if (from) query = query.gte('completed_at', `${from}T00:00:00Z`);
    if (to) query = query.lte('completed_at', `${to}T23:59:59Z`);

    const { data: transactions, error: txError } = await query;

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 });
    }

    const dayMap = new Map<string, DaySummary>();

    for (const tx of transactions || []) {
      if (!tx.completed_at) continue;
      const dateStr = tx.completed_at.split('T')[0];

      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, {
          fecha: dateStr,
          efectivo_cup: 0,
          transf_cup: 0,
          usd: 0,
          comision: 0,
          total_ventas: 0,
          ventas_sin_tasa: 0,
          usd_sin_tasa_cup_equiv: 0,
        });
      }
      const day = dayMap.get(dateStr)!;
      day.total_ventas++;

      const payments = (tx as any).payment_transactions || [];

      if (payments.length === 0) {
        // Venta histórica sin payment_transactions — fallback legacy
        day.efectivo_cup += Number(tx.cash_amount) || 0;
        day.transf_cup += Number(tx.transfer_amount) || 0;
        if (Number(tx.zelle_amount) > 0) {
          day.ventas_sin_tasa++;
          day.usd_sin_tasa_cup_equiv += Number(tx.zelle_amount);
        }
      } else {
        // Venta con payment_transactions — fuente autoritativa
        for (const p of payments) {
          if (p.payment_method === 'cash') {
            day.efectivo_cup += Number(p.amount_cup) || 0;
          } else if (p.payment_method === 'transfer') {
            day.transf_cup += Number(p.amount_cup) || 0;
          }
          // USD original = amount WHERE currency='USD'
          if (p.currency === 'USD') {
            day.usd += Number(p.amount) || 0;
          }
        }
      }
    }

    // Comisiones
    let comQuery = supabase
      .from('payment_transactions')
      .select('amount, payment_date')
      .eq('store_id', storeId)
      .eq('ref_type', 'commission')
      .order('payment_date', { ascending: true });

    if (from) comQuery = comQuery.gte('payment_date', `${from}T00:00:00Z`);
    if (to) comQuery = comQuery.lte('payment_date', `${to}T23:59:59Z`);

    const { data: commissions } = await comQuery;

    for (const com of commissions || []) {
      if (!com.payment_date) continue;
      const dateStr = com.payment_date.split('T')[0];
      if (dayMap.has(dateStr)) {
        dayMap.get(dateStr)!.comision += Number(com.amount || 0);
      }
    }

    const days = Array.from(dayMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    return NextResponse.json({ days });
  } catch (error: any) {
    console.error('[sales/summary] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

interface DaySummary {
  fecha: string;
  efectivo_cup: number;
  transf_cup: number;
  usd: number;
  comision: number;
  total_ventas: number;
  ventas_sin_tasa: number;
  usd_sin_tasa_cup_equiv: number;
}

export const GET = withAuth(getHandler);
