import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/commissions/worker-products?store_id=...&worker_id=...&date_from=...&date_to=...
 *
 * Devuelve los productos vendidos por un worker en un periodo, con detalle por línea.
 * Usado por el modal de pago en modo MANUAL para mostrar la tabla editable.
 *
 * v2 (2026-07-15)
 *
 * ESTRATEGIA DE BÚSQUEDA:
 *   1. sales_transactions del worker (atribución manual worker → venta).
 *      Si existen, se usan sus transaction_items.
 *   2. Si no hay sales_transactions, busca TODAS las transactions POS de la tienda
 *      en el rango (independientes del worker) y sus transaction_items.
 *      Esto permite al admin asignar comisiones manualmente sobre ventas del POS
 *      que aún no están atribuidas a un worker.
 *   3. Las ventas manuales (sin transaction_id) se incluyen como filas "Venta manual".
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const workerId = searchParams.get('worker_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  if (!storeId || !workerId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: 'Parámetros requeridos: store_id, worker_id, date_from, date_to' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseForSession(session);

  // 1. Obtener sales_transactions del worker en el periodo
  const nextDay = (() => {
    const [y, m, d] = dateTo.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().split('T')[0];
  })();

  const { data: sales, error: sErr } = await supabase
    .from('sales_transactions')
    .select('id, transaction_id, amount_total, payment_cash, payment_transfer, sale_date')
    .eq('store_id', storeId)
    .eq('worker_id', workerId)
    .gte('sale_date', dateFrom)
    .lt('sale_date', nextDay)
    .order('sale_date', { ascending: false });

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // 2. transaction_ids vinculados a sales_transactions del worker
  const linkedTxIds = (sales || [])
    .map((s: any) => s.transaction_id)
    .filter((id: any) => id !== null && id !== undefined);

  // 3. Si no hay sales_transactions vinculadas, buscar transactions POS de la tienda en el rango
  // Esto permite al admin ver todas las ventas del periodo para asignar comisiones manualmente.
  let posTxIds: string[] = [];
  let posTxMap: Record<string, { created_at: string; total_amount: number; sale_currency: string }> = {};

  if (linkedTxIds.length === 0) {
    const { data: posTxs, error: txErr } = await supabase
      .from('transactions')
      .select('id, created_at, total_amount, sale_currency, status')
      .eq('store_id', storeId)
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lt('created_at', `${nextDay}T00:00:00`)
      .order('created_at', { ascending: false });

    if (txErr) {
      // silencioso — no bloquear si la tabla no existe o hay error RLS
      console.warn('worker-products: error leyendo transactions:', txErr.message);
    } else if (posTxs && posTxs.length > 0) {
      // Filtrar solo ventas completadas (no cancelled/voided)
      const valid = posTxs.filter((t: any) => t.status !== 'cancelled' && t.status !== 'voided');
      posTxIds = valid.map((t: any) => t.id);
      posTxMap = valid.reduce((acc: any, t: any) => {
        acc[t.id] = {
          created_at: t.created_at,
          total_amount: Number(t.total_amount) || 0,
          sale_currency: t.sale_currency || 'CUP',
        };
        return acc;
      }, {});
    }
  }

  // 4. Cargar transaction_items para los ids disponibles
  // FIX (2026-07-15): transaction_items NO tiene columna unit_price.
  // Columnas reales: price_at_sale (moneda original), price_at_sale_cup (CUP),
  // cost_at_sale, quantity, cash_paid, transfer_paid, price_currency.
  const allTxIds = [...new Set([...linkedTxIds, ...posTxIds])];
  let lineItems: any[] = [];
  if (allTxIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from('transaction_items')
      .select(`
        id,
        transaction_id,
        product_id,
        quantity,
        price_at_sale,
        price_at_sale_cup,
        cost_at_sale,
        cash_paid,
        transfer_paid,
        price_currency,
        products:product_id (id, name, sku, price),
        transactions:transaction_id (created_at, sale_currency, sale_exchange_rate)
      `)
      .in('transaction_id', allTxIds)
      .order('transaction_id', { ascending: false });

    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
    lineItems = items || [];
  }

  // Mapear transaction_id → sale_date para preservar la fecha efectiva
  const txToSale: Record<string, { sale_date: string; amount: number; cash: number; transfer: number }> = {};
  for (const s of (sales || [])) {
    if (s.transaction_id) {
      txToSale[s.transaction_id] = {
        sale_date: s.sale_date,
        amount: Number(s.amount_total) || 0,
        cash: Number(s.payment_cash) || 0,
        transfer: Number(s.payment_transfer) || 0,
      };
    }
  }

  // Construir respuesta: una fila por line item
  const items = lineItems.map((li: any) => {
    const txInfo = txToSale[li.transaction_id];
    const posInfo = posTxMap[li.transaction_id];
    const createdAt = txInfo?.sale_date
      || (posInfo?.created_at
          ? new Date(posInfo.created_at).toISOString().split('T')[0]
          : (li.transactions?.created_at
              ? new Date(li.transactions.created_at).toISOString().split('T')[0]
              : dateFrom));
    // FIX (2026-07-15): transaction_items no tiene unit_price.
    // Usar price_at_sale_cup (preferido, en CUP) o price_at_sale como fallback.
    const unitPrice = Number(li.price_at_sale_cup || li.price_at_sale) || 0;
    const qty = Number(li.quantity) || 0;
    return {
      line_item_id: li.id,
      transaction_id: li.transaction_id,
      sale_date: createdAt,
      product_id: li.product_id,
      product_name: li.products?.name || 'Producto',
      product_sku: li.products?.sku || null,
      quantity: qty,
      unit_price: unitPrice,
      line_total: unitPrice * qty,
      cash_paid: Number(li.cash_paid) || 0,
      transfer_paid: Number(li.transfer_paid) || 0,
      currency: li.transactions?.sale_currency || li.price_currency || posInfo?.sale_currency || 'CUP',
    };
  });

  // Agregar también las ventas manuales (sin transaction_id) como filas "genéricas"
  const manualSales = (sales || []).filter((s: any) => !s.transaction_id);
  const manualItems = manualSales.map((s: any) => ({
    line_item_id: `manual-${s.id}`,
    transaction_id: null,
    sale_date: s.sale_date,
    product_id: null,
    product_name: 'Venta manual (sin POS)',
    product_sku: null,
    quantity: 1,
    unit_price: Number(s.amount_total) || 0,
    line_total: Number(s.amount_total) || 0,
    cash_paid: Number(s.payment_cash) || 0,
    transfer_paid: Number(s.payment_transfer) || 0,
    currency: 'CUP',
  }));

  // Calcular totales agregados
  const itemsCash = items.reduce((sum, it) => sum + (Number(it.cash_paid) || 0), 0);
  const itemsTransfer = items.reduce((sum, it) => sum + (Number(it.transfer_paid) || 0), 0);
  const itemsTotal = items.reduce((sum, it) => sum + (Number(it.line_total) || 0), 0);
  const salesCash = (sales || []).reduce((sum, s) => sum + (Number(s.payment_cash) || 0), 0);
  const salesTransfer = (sales || []).reduce((sum, s) => sum + (Number(s.payment_transfer) || 0), 0);
  const salesTotal = (sales || []).reduce((sum, s) => sum + (Number(s.amount_total) || 0), 0);

  // Source description for UI feedback
  const source = linkedTxIds.length > 0
    ? 'sales_transactions (atribución directa al worker)'
    : posTxIds.length > 0
      ? 'transactions POS de la tienda (sin atribuir al worker — el admin decide)'
      : 'sin ventas en el periodo';

  return NextResponse.json({
    store_id: storeId,
    worker_id: workerId,
    period: { from: dateFrom, to: dateTo },
    items: [...items, ...manualItems],
    source,
    totals: {
      cash: Math.max(itemsCash, salesCash),
      transfer: Math.max(itemsTransfer, salesTransfer),
      total: Math.max(itemsTotal, salesTotal),
      line_items_count: items.length,
      manual_sales_count: manualItems.length,
      pos_transactions_count: posTxIds.length,
      linked_transactions_count: linkedTxIds.length,
    },
  });
}

export const GET = withAuth(getHandler);
