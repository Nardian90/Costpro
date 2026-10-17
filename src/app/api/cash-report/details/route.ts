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
      // INCIDENTE 2026-10-16: la pertenencia al grupo (método, moneda) se
      // decide por la MONEDA REAL DE COBRO (reconstrucción única en
      // collection-currency.ts), no por sale_currency — que clasificaba los
      // cobros USD como CUP. Se devuelve `total` = importe del cobro en ESA
      // moneda (el acordeón lo muestra como Monto).
      const { reconstructTxCollections, normCur } = await import('@/lib/cash-report/collection-currency');
      const { data, error } = await supabase
        .from('transactions')
        .select('id, created_at, total_amount, payment_method, sale_currency, customer_name, status, cash_amount, transfer_amount, zelle_amount, notes')
        .eq('store_id', storeId)
        .eq('payment_method', method)
        .neq('status', 'voided')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const wantedCur = normCur(currency);
      const ids = (data || []).map((t: { id: string }) => t.id);
      const itemsByTx = new Map<string, Array<Record<string, unknown>>>();
      const CHUNK = 150;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data: itemRows, error: itemErr } = await supabase
          .from('transaction_items')
          .select('transaction_id, quantity, price_at_sale, price_at_sale_cup, currency, exchange_rate, cash_paid, cash_currency, transfer_paid, transfer_currency, zelle_paid, zelle_currency')
          .in('transaction_id', chunk);
        if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
        for (const it of itemRows || []) {
          const k = (it as { transaction_id: string }).transaction_id;
          if (!itemsByTx.has(k)) itemsByTx.set(k, []);
          itemsByTx.get(k)!.push(it as Record<string, unknown>);
        }
      }

      const rows: Array<Record<string, unknown>> = [];
      for (const tx of (data || []) as Array<Record<string, unknown>>) {
        const items = itemsByTx.get(tx.id as string) || [];
        const result = reconstructTxCollections(tx as never, items as never);
        const bucket = result.buckets.find(b => b.method === method && b.currency === wantedCur);
        if (!bucket) continue;
        rows.push({
          ...tx,
          // Monto del cobro en la moneda del grupo (40 USD, 12 000 CUP…).
          total: bucket.amount,
        });
        if (rows.length >= 100) break;
      }
      return NextResponse.json(rows);
    } else if (refType === 'commission') {
      // FIX (2026-07-20): bug "column commission_payments.paid_ataspayment_date does not exist"
      // PostgREST usa sintaxis `column:alias` (sin espacios) para renombrar columnas.
      // El SQL `paid_at as payment_date` se concatenaba sin espacio → falla.
      // Solución: NO usar alias en select, mapear manualmente después.
      // FIX-RE-1510 v2 (2026-10-16, adenda del negocio): atribución por FECHA DEL PAGO
      // confirmado (paid_at) en ventana de negocio determinista (Habana) — criterio
      // canónico: «el reporte siempre muestra la fecha en que se confirmó el pago». El
      // periodo (period_start/period_end) queda como metadata informativa del renglón.
      const { commissionPaidAtFilter } = await import('@/lib/cash-report/period-attribution');
      const { data, error } = await supabase
        .from('commission_payments')
        .select(`
          id, paid_at, final_amount, amount_cup,
          payment_method, currency, status,
          worker:workers (first_name, last_name, ci ),
          period_start, period_end
        `)
        .eq('store_id', storeId)
        .eq('payment_method', method)
        .eq('currency', currency)
        .eq('status', 'paid')
        .or(commissionPaidAtFilter(startDate, endDate))
        .order('paid_at', { ascending: false })
        .limit(100);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Aplanar para que coincida con el formato que espera el frontend
      const flattened = (data || []).map((c: any) => ({
        id: c.id,
        payment_date: c.paid_at,
        amount: c.final_amount,
        amount_cup: c.amount_cup,
        payment_method: c.payment_method,
        currency: c.currency,
        reference: `Periodo ${c.period_start?.slice(0,10)} → ${c.period_end?.slice(0,10)}`,
        notes: c.worker ? `${c.worker.first_name} ${c.worker.last_name} (CI: ${c.worker.ci})` : '',
        ref_type: 'commission',
        customer_name: c.worker ? `${c.worker.first_name} ${c.worker.last_name}` : '',
      }));
      return NextResponse.json(flattened);
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
