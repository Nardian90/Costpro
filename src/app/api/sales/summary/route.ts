/**
 * GET /api/sales/summary?store_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve un resumen consolidado de ventas agrupado por día con:
 *   - efectivo_cup: total de cash_amount en CUP
 *   - transf_cup: total de transfer_amount en CUP
 *   - usd: total de ventas en USD (sale_currency='USD')
 *   - comision: total de comisiones pagadas (payment_transactions)
 *   - total_ventas: número de transacciones completadas ese día
 *
 * Respuesta: { days: [{ fecha, efectivo_cup, transf_cup, usd, comision, total_ventas }] }
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

    // Construir query de transacciones completadas
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
        status
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

    // Agrupar por día
    const dayMap = new Map<string, DaySummary>();

    for (const tx of transactions || []) {
      if (!tx.completed_at) continue;
      const dateStr = tx.completed_at.split('T')[0]; // YYYY-MM-DD

      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, {
          fecha: dateStr,
          efectivo_cup: 0,
          transf_cup: 0,
          usd: 0,
          comision: 0,
          total_ventas: 0,
        });
      }
      const day = dayMap.get(dateStr)!;
      day.total_ventas++;

      // Separar por moneda y método de pago
      if (tx.sale_currency === 'USD') {
        // USD: usar zelle_amount si existe, sino total_amount
        day.usd += Number(tx.zelle_amount || tx.total_amount || 0);
      } else {
        // CUP: si cash_amount o transfer_amount son 0 pero total_amount > 0,
        // usar payment_method para decidir dónde poner el monto
        const cashAmt = Number(tx.cash_amount || 0);
        const transfAmt = Number(tx.transfer_amount || 0);
        const totalAmt = Number(tx.total_amount || 0);

        if (cashAmt > 0) {
          day.efectivo_cup += cashAmt;
        } else if (transfAmt > 0) {
          day.transf_cup += transfAmt;
        } else if (totalAmt > 0) {
          // Fallback: si no hay desglose, usar payment_method para clasificar
          const method = (tx as any).payment_method || 'cash';
          if (method === 'transfer') {
            day.transf_cup += totalAmt;
          } else {
            day.efectivo_cup += totalAmt;
          }
        }
      }
    }

    // Cargar comisiones del período (payment_transactions con ref_type='commission')
    let comQuery = supabase
      .from('payment_transactions')
      .select('amount, payment_date')
      .eq('store_id', storeId)
      .eq('ref_type', 'commission')
      .order('payment_date', { ascending: true });

    if (from) comQuery = comQuery.gte('payment_date', `${from}T00:00:00Z`);
    if (to) comQuery = comQuery.lte('payment_date', `${to}T23:59:59Z`);

    const { data: commissions } = await comQuery;

    // Sumar comisiones por día
    for (const com of commissions || []) {
      if (!com.payment_date) continue;
      const dateStr = com.payment_date.split('T')[0];
      if (dayMap.has(dateStr)) {
        dayMap.get(dateStr)!.comision += Number(com.amount || 0);
      }
    }

    // Convertir a array ordenado por fecha
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
}

export const GET = withAuth(getHandler);
