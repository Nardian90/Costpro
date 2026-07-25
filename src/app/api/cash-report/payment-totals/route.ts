/**
 * @file GET /api/cash-report/payment-totals
 * @description Devuelve los totales de pagos por moneda, consultando directamente
 * la tabla transactions (cash_amount, transfer_amount, zelle_amount).
 *
 * Esto es necesario porque:
 *   - /api/cash-report agrupa por payment_method y no desglosa 'mixed'
 *   - /api/cash-report/items-summary tiene cash_paid=0 cuando el RPC create_sale
 *     no propaga los montos a transaction_items
 *
 * Respuesta:
 *   {
 *     "totals": {
 *       "CUP": { "cash": 55205, "transfer": 45000, "zelle": 0, "total": 100205 },
 *       "USD": { "cash": 5237,  "transfer": 0,     "zelle": 0, "total": 5237  }
 *     }
 *   }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';

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

    // Query transactions for the period
    const { data, error } = await supabase
      .from('transactions')
      .select('sale_currency, cash_amount, transfer_amount, zelle_amount, total_amount')
      .eq('store_id', userData.active_store_id)
      .eq('status', 'completed')
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    if (error) {
      console.error('[payment-totals] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate by currency
    const totals: Record<string, { cash: number; transfer: number; zelle: number; total: number }> = {};
    for (const tx of (data || [])) {
      const cur = tx.sale_currency || 'CUP';
      // 'MIXED' is used when multi-currency transaction; skip (rare)
      if (cur === 'MIXED') continue;
      if (!totals[cur]) totals[cur] = { cash: 0, transfer: 0, zelle: 0, total: 0 };
      totals[cur].cash += Number(tx.cash_amount || 0);
      totals[cur].transfer += Number(tx.transfer_amount || 0);
      totals[cur].zelle += Number(tx.zelle_amount || 0);
      totals[cur].total += Number(tx.total_amount || 0);
    }

    return NextResponse.json({ totals });
  } catch (err: any) {
    console.error('[payment-totals] Exception:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export const GET = withTracing(
  withAuth(getHandler) as Parameters<typeof withTracing>[0],
  'GET /api/cash-report/payment-totals',
);
