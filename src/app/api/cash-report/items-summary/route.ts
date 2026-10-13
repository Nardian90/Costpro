import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { lineTotalCup, splitItemPortion, type TxSplit } from '@/lib/cash-report/summary';

/**
 * GET /api/cash-report/items-summary
 *
 * Devuelve los items vendidos en el periodo, consolidados por producto:
 *   - product_id, product_name, sku
 *   - total_quantity (sum quantity)
 *   - unit_price (precio promedio ponderado)
 *   - total_cup (importe en CUP de la línea — FIX D1: precio × cantidad)
 *   - cash_paid (importe cobrado en efectivo — reparto por transacción)
 *   - transfer_paid (importe cobrado en transferencia — reparto)
 *   - zelle_paid (importe cobrado en Zelle — reparto)
 *
 * AUDITORÍA 2026-10 (FIX D1): total_cup usaba price_at_sale_cup (precio
 * UNITARIO) sin multiplicar por cantidad — la tabla del reporte sumaba
 * 31.200 cuando el día real era 60.600. Además, el split del medio de cobro
 * se reparte ahora a partir del split REAL de cada transacción
 * (cash_amount/transfer_amount/zelle_amount), no de una cuota global.
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
        transactions!inner ( id, store_id, status, created_at, payment_method, sale_currency, sale_exchange_rate, zelle_amount, cash_amount, transfer_amount, total_amount )
      `)
      .eq('transactions.store_id', storeId)
      .neq('transactions.status', 'voided')
      .gte('transactions.created_at', startDate)
      .lte('transactions.created_at', endDate);

    if (error) {
      console.error('[cash-report/items-summary] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Split real por transacción (FIX D1): el medio de cobro vive a nivel de
    // transacción; los ítems reparten proporcionalmente a su valor de línea.
    // Primera pasada: valor total de líneas por transacción.
    const txLineTotals: Record<string, number> = {};
    const itemRows: Array<{
      key: string; pid: string; pname: string; sku: string; cur: string;
      qty: number; lineTotal: number; txId: string;
      storedCash: number; storedTransfer: number; txSplit: TxSplit;
    }> = [];

    for (const item of (data || [])) {
      const p = item.products as any;
      const t = item.transactions as any;
      const pid = item.product_id;
      const cur = item.price_currency || t.sale_currency || 'CUP';
      const qty = Number(item.quantity) || 0;
      // FIX D1: total de línea = precio unitario CUP × cantidad (antes: solo el unitario).
      const lineTotal = lineTotalCup(item.price_at_sale_cup, item.price_at_sale, t.sale_exchange_rate, qty);
      txLineTotals[item.transaction_id] = (txLineTotals[item.transaction_id] || 0) + lineTotal;
      itemRows.push({
        key: `${pid}__${cur}`, pid, pname: p?.name || 'Producto', sku: p?.sku || '—', cur,
        qty, lineTotal, txId: item.transaction_id,
        storedCash: Number(item.cash_paid) || 0, storedTransfer: Number(item.transfer_paid) || 0,
        txSplit: {
          cash: Number(t.cash_amount) || 0,
          transfer: Number(t.transfer_amount) || 0,
          zelle: Number(t.zelle_amount) || 0,
        },
      });
    }

    // Consolidar por producto + moneda
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

    for (const row of itemRows) {
      if (!byProduct[row.key]) {
        byProduct[row.key] = {
          product_id: row.pid,
          product_name: row.pname,
          sku: row.sku,
          currency: row.cur,
          total_quantity: 0,
          total_cup: 0,
          cash_paid: 0,
          transfer_paid: 0,
          zelle_paid: 0,
          transactions_count: new Set(),
        };
      }
      byProduct[row.key].total_quantity += row.qty;
      byProduct[row.key].total_cup += row.lineTotal;
      // Split por ítem: si el ítem registró cash_paid/transfer_paid se usan;
      // si no, reparto proporcional al valor de línea dentro de su transacción.
      const stored = row.storedCash + row.storedTransfer;
      let portion = { cash: 0, transfer: 0, zelle: 0 };
      if (stored > 0) {
        portion = { cash: row.storedCash, transfer: row.storedTransfer, zelle: 0 };
      } else {
        portion = splitItemPortion(row.lineTotal, txLineTotals[row.txId] || 0, row.txSplit);
      }
      byProduct[row.key].cash_paid += portion.cash;
      byProduct[row.key].transfer_paid += portion.transfer;
      // Zelle: porción no cubierta por cash/transfer cuando la venta es zelle
      const zellePortion = Math.max(0, row.lineTotal - portion.cash - portion.transfer);
      if (portion.zelle > 0 || (row.txSplit.zelle > 0 && row.txSplit.cash === 0 && row.txSplit.transfer === 0)) {
        byProduct[row.key].zelle_paid += zellePortion;
      }
      byProduct[row.key].transactions_count.add(row.txId);
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
