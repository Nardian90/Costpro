import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { buildItemsSummary, type CollectionItem, type CollectionTx } from '@/lib/cash-report/collection-currency';

/**
 * GET /api/cash-report/items-summary
 *
 * Devuelve los items vendidos en el periodo, consolidados por producto
 * (UNA fila por producto) con los COBROS en su moneda real:
 *   - total_quantity, unit_price (promedio CUP), total_cup (total histórico CUP)
 *   - cash_cup / transfer_cup / zelle_cup  → cobros en CUP por método
 *   - cash_usd / transfer_usd / zelle_usd / usd_total → cobros en USD (original)
 *   - has_payment_incident → el cobro difiere del total histórico (incidencia)
 * Compatibilidad: cash_paid/transfer_paid/zelle_paid siguen expuestos con los
 * importes CUP (columnas CUP del reporte).
 *
 * INCIDENTE 2026-10-16 (ENERVIDA): la clasificación por `sale_currency`
 * escondía los cobros en USD (los pools están en CUP canónico) y el reparto
 * proporcional ponía en cero las líneas con precio histórico 0 y cobro real
 * (SKU 108: 12 000 CUP). La reconstrucción vive en
 * src/lib/cash-report/collection-currency.ts (fuente única).
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

    // Ítems ⨝ transacción (para excluir voided, filtrar tienda/fechas y leer el
    // split real del cobro) ⨝ producto (nombre y sku).
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
        zelle_paid,
        currency,
        cash_currency,
        transfer_currency,
        zelle_currency,
        price_currency,
        exchange_rate,
        transaction_id,
        product_id,
        products!inner ( id, name, sku ),
        transactions!inner ( id, store_id, status, created_at, payment_method, sale_currency, sale_exchange_rate, cash_amount, transfer_amount, zelle_amount )
      `)
      .eq('transactions.store_id', storeId)
      .neq('transactions.status', 'voided')
      .gte('transactions.created_at', startDate)
      .lte('transactions.created_at', endDate);

    if (error) {
      console.error('[cash-report/items-summary] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []).map((row: Record<string, unknown>) => {
      const p = row.products as Record<string, unknown> | null;
      const t = row.transactions as Record<string, unknown> | null;
      const item: CollectionItem = {
        id: String(row.id || ''),
        transaction_id: String(row.transaction_id || t?.id || ''),
        product_id: String(row.product_id || ''),
        product_name: (p?.name as string) || 'Producto',
        sku: (p?.sku as string) || '—',
        quantity: row.quantity as number,
        price_at_sale: row.price_at_sale as number,
        price_at_sale_cup: row.price_at_sale_cup as number,
        // Moneda ORIGINAL de la línea; fallback legado: price_currency → sale_currency.
        currency: (row.currency as string) || (row.price_currency as string) || (t?.sale_currency as string) || 'CUP',
        exchange_rate: row.exchange_rate as number,
        cash_paid: row.cash_paid as number,
        cash_currency: row.cash_currency as string,
        transfer_paid: row.transfer_paid as number,
        transfer_currency: row.transfer_currency as string,
        zelle_paid: row.zelle_paid as number,
        zelle_currency: row.zelle_currency as string,
      };
      const tx: CollectionTx = {
        id: String(t?.id || row.transaction_id || ''),
        cash_amount: t?.cash_amount as number,
        transfer_amount: t?.transfer_amount as number,
        zelle_amount: t?.zelle_amount as number,
        sale_currency: t?.sale_currency as string,
        sale_exchange_rate: t?.sale_exchange_rate as number,
      };
      return { item, tx, txId: String(t?.id || row.transaction_id || '') };
    });

    const { items, totals } = buildItemsSummary(rows);

    // unit_price legacy = promedio ponderado CUP de la línea (se mantiene).
    const result = items.map(p => ({
      ...p,
      unit_price: p.total_quantity > 0 ? p.total_cup / p.total_quantity : 0,
      // Compatibilidad con consumidores existentes: columnas CUP del reporte.
      currency: 'CUP',
      cash_paid: p.cash_cup,
      transfer_paid: p.transfer_cup,
      zelle_paid: p.zelle_cup,
    }));

    return NextResponse.json({
      items: result,
      // Totales legacy (CUP) + totales por moneda de cobro.
      total_cup: totals.total_cup,
      total_cash: totals.cash_cup,
      total_transfer: totals.transfer_cup,
      total_zelle: totals.zelle_cup,
      total_quantity: totals.total_quantity,
      cash_cup: totals.cash_cup,
      transfer_cup: totals.transfer_cup,
      zelle_cup: totals.zelle_cup,
      cash_usd: totals.cash_usd,
      transfer_usd: totals.transfer_usd,
      zelle_usd: totals.zelle_usd,
      usd_total: totals.usd_total,
      count: result.length,
    });
  } catch (error: any) {
    console.error('[cash-report/items-summary] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
