import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/cash-report/items-summary
 *
 * Devuelve los items vendidos en el periodo, consolidados por producto:
 *   - product_id, product_name, sku
 *   - total_quantity (sum quantity)
 *   - unit_price (precio promedio ponderado)
 *   - total_cup (importe en CUP)
 *   - cash_paid (importe cobrado en efectivo)
 *   - transfer_paid (importe cobrado en transferencia)
 *   - zelle_paid (importe cobrado en Zelle)
 *
 * Útil para el PDF de Reporte de Caja — tabla de productos vendidos.
 *
 * Query: start_date, end_date (ISO)
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();

    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase
      .from('profiles').select('active_store_id').eq('id', session.user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    const storeId = userData.active_store_id;

    // Joinear transaction_items con transactions (para excluir voided y filtrar por store_id + fechas)
    // y con products (para nombre y sku).
    // Nota: transaction_items NO tiene zelle_paid. Zelle se calcula: total - cash - transfer.
    const { data, error } = await supabase
      .from('transaction_items')
      .select(`
        id,
        quantity,
        price_at_sale,
        cost_at_sale,
        price_at_sale_cup,
        cash_paid,
        transfer_paid,
        price_currency,
        transaction_id,
        product_id,
        products!inner ( id, name, sku ),
        transactions!inner ( id, store_id, status, created_at, payment_method, sale_currency, sale_exchange_rate, zelle_amount )
      `)
      .eq('transactions.store_id', storeId)
      .neq('transactions.status', 'voided')
      .gte('transactions.created_at', startDate)
      .lte('transactions.created_at', endDate);

    if (error) {
      console.error('[cash-report/items-summary] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Consolidar por producto + currency
    const byProduct: Record<string, {
      product_id: string;
      product_name: string;
      sku: string;
      currency: string;
      total_quantity: number;
      total_cup: number;
      cash_paid: number;
      transfer_paid: number;
      zelle_paid: number;
      transactions_count: Set<string>;
    }> = {};

    for (const item of (data || [])) {
      const p = item.products as any;
      const t = item.transactions as any;
      const pid = item.product_id;
      const cur = item.price_currency || t.sale_currency || 'CUP';
      const key = `${pid}__${cur}`;
      if (!byProduct[key]) {
        byProduct[key] = {
          product_id: pid,
          product_name: p?.name || 'Producto',
          sku: p?.sku || '—',
          currency: cur,
          total_quantity: 0,
          total_cup: 0,
          cash_paid: 0,
          transfer_paid: 0,
          zelle_paid: 0,
          transactions_count: new Set(),
        };
      }
      const qty = Number(item.quantity) || 0;
      const itemTotalCup = Number(item.price_at_sale_cup) || (Number(item.price_at_sale) * Number(t.sale_exchange_rate || 1));
      byProduct[key].total_quantity += qty;
      byProduct[key].total_cup += itemTotalCup;
      byProduct[key].cash_paid += Number(item.cash_paid) || 0;
      byProduct[key].transfer_paid += Number(item.transfer_paid) || 0;
      // Zelle = total_item - cash - transfer (cuando la venta es mixed/zelle)
      const zellePortion = Math.max(0, itemTotalCup - (Number(item.cash_paid) || 0) - (Number(item.transfer_paid) || 0));
      if (t.payment_method === 'zelle' || (t.zelle_amount && Number(t.zelle_amount) > 0)) {
        byProduct[key].zelle_paid += zellePortion;
      }
      byProduct[key].transactions_count.add(item.transaction_id);
    }

    // Convertir a array y agregar unit_price (promedio)
    const result = Object.values(byProduct).map(p => ({
      product_id: p.product_id,
      product_name: p.product_name,
      sku: p.sku,
      currency: p.currency,
      total_quantity: p.total_quantity,
      unit_price: p.total_quantity > 0 ? p.total_cup / p.total_quantity : 0,
      total_cup: p.total_cup,
      cash_paid: p.cash_paid,
      transfer_paid: p.transfer_paid,
      zelle_paid: p.zelle_paid,
      transactions_count: p.transactions_count.size,
    }));

    // Ordenar por total_cup descendente
    result.sort((a, b) => b.total_cup - a.total_cup);

    return NextResponse.json({
      items: result,
      total_cup: result.reduce((s, i) => s + i.total_cup, 0),
      total_cash: result.reduce((s, i) => s + i.cash_paid, 0),
      total_transfer: result.reduce((s, i) => s + i.transfer_paid, 0),
      total_zelle: result.reduce((s, i) => s + i.zelle_paid, 0),
      count: result.length,
    });
  } catch (error: any) {
    console.error('[cash-report/items-summary] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
