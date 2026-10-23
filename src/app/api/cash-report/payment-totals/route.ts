/**
 * @file GET /api/cash-report/payment-totals
 * @description Devuelve los totales de cobros por MONEDA REAL DE COBRO,
 * reconstruyendo desde transaction_items + transactions (fuente única:
 * src/lib/cash-report/collection-currency.ts).
 *
 * Esto es necesario porque:
 *   - /api/cash-report agrupa por payment_method y no desglosa 'mixed'
 *   - /api/cash-report/items-summary tiene cash_paid=0 cuando el RPC create_sale
 *     no propaga los montos a transaction_items
 *
 * INCIDENTE 2026-10-16 (ENERVIDA): los pools de transactions están en CUP
 * canónico; clasificar por sale_currency escondía los cobros en USD. La
 * reconstrucción identifica la moneda real de cada cobro (filas de pago por
 * ítem V2 + regla legado de conversión exacta) y separa CUP/USD.
 *
 * Respuesta:
 *   {
 *     "totals": {
 *       "CUP": { "cash": 153350, "transfer": 2400, "zelle": 0, "total": 155750 },
 *       "USD": { "cash": 40,     "transfer": 0,    "zelle": 0, "total": 40 }
 *     }
 *   }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { reconstructTxCollections, accumulateSalesSplit, normCur, type CollectionItem, type CollectionTx, type SalesSplitAccum } from '@/lib/cash-report/collection-currency';
import { fetchSalePaymentsByTx } from '@/lib/cash-report/fetch-sale-payments';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();

    // Use admin client (consistent with other cash-report endpoints)
    const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
    const supabase = getSupabaseAdminSafe();
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // Get user's active store
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    // Query transactions for the period (ventana original: fin EXCLUSIVO — se conserva)
    const { data, error } = await supabase
      .from('transactions')
      .select('id, sale_currency, cash_amount, transfer_amount, zelle_amount, total_amount')
      .eq('store_id', userData.active_store_id)
      .eq('status', 'completed')
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    if (error) {
      console.error('[payment-totals] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const txIds = (data || []).map((t: { id: string }) => t.id);
    const itemsByTx = new Map<string, Array<Record<string, unknown>>>();
    const CHUNK = 150;
    for (let i = 0; i < txIds.length; i += CHUNK) {
      const chunk = txIds.slice(i, i + CHUNK);
      const { data: itemRows, error: itemErr } = await supabase
        .from('transaction_items')
        .select('transaction_id, quantity, price_at_sale, price_at_sale_cup, currency, exchange_rate, cash_paid, cash_currency, transfer_paid, transfer_currency, zelle_paid, zelle_currency')
        .in('transaction_id', chunk);
      if (itemErr) {
        console.error('[payment-totals] items error:', itemErr);
        break; // degradación limpia: cae al pool por sale_currency
      }
      for (const it of itemRows || []) {
        const k = (it as { transaction_id: string }).transaction_id;
        if (!itemsByTx.has(k)) itemsByTx.set(k, []);
        itemsByTx.get(k)!.push(it as Record<string, unknown>);
      }
    }

    // MISIÓN PAGOS MIXTOS (2026-10-24): filas de payment_transactions
    // (ref_type='sale') por venta — moneda REAL por componente con la tasa de
    // la operación persistida. Ventas con componentes (v2.25.0) se clasifican
    // por LEDGER directo; históricas conservan la heurística.
    const paymentsByTx = await fetchSalePaymentsByTx(
      ids => supabase
        .from('payment_transactions')
        .select('transaction_id, payment_method, currency, amount, exchange_rate')
        .eq('ref_type', 'sale')
        .in('transaction_id', ids),
      txIds,
    );

    const acc: SalesSplitAccum = {};
    const txWithoutItems: Array<Record<string, unknown>> = [];
    for (const tx of (data || []) as Array<Record<string, unknown>>) {
      const items = itemsByTx.get(tx.id as string) || [];
      const payments = paymentsByTx.get(tx.id as string);
      if (items.length === 0) {
        if (payments && payments.length > 0) {
          accumulateSalesSplit(acc, reconstructTxCollections(tx as unknown as CollectionTx, [], payments));
        } else {
          txWithoutItems.push(tx);
        }
        continue;
      }
      const result = reconstructTxCollections(tx as unknown as CollectionTx, items as unknown as CollectionItem[], payments);
      accumulateSalesSplit(acc, result);
    }
    // Transacciones sin ítems: comportamiento previo (pool → sale_currency).
    for (const tx of txWithoutItems) {
      const cur = normCur(tx.sale_currency as string);
      if (cur === 'MIXED') continue;
      if (!acc[cur]) acc[cur] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
      const cash = Number(tx.cash_amount || 0), tr = Number(tx.transfer_amount || 0), ze = Number(tx.zelle_amount || 0);
      acc[cur].cash += cash;
      acc[cur].transfer += tr;
      acc[cur].zelle += ze;
      acc[cur].total += cash + tr + ze;
    }

    return NextResponse.json({ totals: acc });
  } catch (err: any) {
    console.error('[payment-totals] Exception:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export const GET = withTracing(
  withAuth(getHandler) as Parameters<typeof withTracing>[0],
  'GET /api/cash-report/payment-totals',
);
