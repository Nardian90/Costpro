import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/inventory/estructura-costo?store_id=X&date_from=Y&date_to=Z
 *
 * Devuelve la estructura de costo de cada producto:
 *   - Costo unitario (de recepciones en el rango de fecha)
 *   - Transportación (de servicios recibidos distribuidos)
 *   - Manipulación (de servicios recibidos distribuidos)
 *   - Subtotal = costo real (base + transport + manip)
 *   - Comisiones (de commission_reception_links)
 *   - Otros servicios (de servicios recibidos, otros tipos)
 *   - Variación cambiaria (diferencia entre reposición y histórico)
 *   - Costo y gasto total = subtotal + comisiones + otros + variación
 *   - Costo por unidad = total / cantidad
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const dateFrom = searchParams.get('date_from') || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const dateTo = searchParams.get('date_to') || new Date().toISOString().slice(0, 10);

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // 1. Productos con existencia
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, stock_current, cost_average, price, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!products || products.length === 0) {
    return NextResponse.json({ data: [], date_from: dateFrom, date_to: dateTo, store_id: storeId });
  }

  const productIds = products.map(p => p.id);

  // 2. Receipt items en rango de fecha con moneda/tasa
  const { data: receiptItems } = await supabase
    .from('receipt_items')
    .select(`
      product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion,
      receipts!inner(reception_date, store_id)
    `)
    .in('product_id', productIds)
    .eq('receipts.store_id', storeId)
    .gte('receipts.reception_date', `${dateFrom}T00:00:00`)
    .lte('receipts.reception_date', `${dateTo}T23:59:59`);

  // 3. Servicios distribuidos
  const { data: serviceDist } = await supabase
    .from('service_cost_distributions')
    .select(`
      product_id, distribution_amount,
      received_services!inner(service_type_name, total_amount, currency, exchange_rate, created_at)
    `)
    .in('product_id', productIds)
    .gte('received_services.created_at', `${dateFrom}T00:00:00`)
    .lte('received_services.created_at', `${dateTo}T23:59:59`);

  // 4. Comisiones vinculadas
  const receiptIds = (receiptItems || []).map(r => (r as any).receipts?.id).filter(Boolean);
  const { data: commissionLinks } = await supabase
    .from('commission_reception_links')
    .select('product_id, allocated_amount')
    .in('receipt_id', receiptIds.length > 0 ? receiptIds : ['00000000-0000-0000-0000-000000000000']);

  // 5. Tasa actual para variación cambiaria
  const { data: rateData } = await supabase
    .from('exchange_rates')
    .select('rate, currency')
    .eq('currency', 'USD')
    .eq('source', 'BCC')
    .eq('segment', '3')
    .order('rate_date', { ascending: false })
    .limit(1);
  const currentRate = rateData?.[0]?.rate || 1;

  // 6. Calcular estructura por producto
  const rows = products.map(product => {
    const prodReceipts = (receiptItems || []).filter(r => r.product_id === product.id);
    const prodServices = (serviceDist || []).filter(s => s.product_id === product.id);
    const prodCommissions = (commissionLinks || []).filter(c => c.product_id === product.id);

    // Costo unitario promedio (de recepciones en rango)
    let totalCost = 0;
    let totalQty = 0;
    let exchangeVariation = 0;

    for (const r of prodReceipts) {
      const cost = r.unit_cost * r.quantity;
      totalCost += cost;
      totalQty += r.quantity;

      // Variación cambiaria: si moneda ≠ CUP
      const moneda = r.moneda_recepcion || 'CUP';
      const tasa = r.tasa_cambio_recepcion || 1.0;
      if (moneda !== 'CUP' && tasa > 0) {
        const historicalCup = (r.unit_cost * r.quantity) * tasa;
        const replacementCup = (r.unit_cost * r.quantity) * currentRate;
        exchangeVariation += (replacementCup - historicalCup);
      }
    }
    const unitCost = totalQty > 0 ? totalCost / totalQty : (product.cost_average || 0);

    // Transportación y manipulación
    let transport = 0;
    let manipulation = 0;
    let otherServices = 0;
    for (const s of prodServices) {
      const amount = s.distribution_amount || 0;
      const typeName = ((s as any).received_services?.service_type_name || '').toLowerCase();
      if (typeName.includes('transport') || typeName.includes('flete') || typeName.includes('transp')) {
        transport += amount;
      } else if (typeName.includes('manip') || typeName.includes('estiba') || typeName.includes('descarga')) {
        manipulation += amount;
      } else {
        otherServices += amount;
      }
    }

    // Comisiones
    let commissions = 0;
    for (const c of prodCommissions) {
      commissions += c.allocated_amount || 0;
    }

    const subtotalReal = unitCost + transport + manipulation;
    const totalCostExpense = subtotalReal + commissions + otherServices + exchangeVariation;
    const totalPerUnit = totalQty > 0 ? totalCostExpense / totalQty : totalCostExpense;

    return {
      product_id: product.id,
      product_name: product.name,
      stock_current: product.stock_current || 0,
      unit_cost: Math.round(unitCost * 100) / 100,
      transport: Math.round(transport * 100) / 100,
      manipulation: Math.round(manipulation * 100) / 100,
      subtotal_real: Math.round(subtotalReal * 100) / 100,
      commissions: Math.round(commissions * 100) / 100,
      other_services: Math.round(otherServices * 100) / 100,
      exchange_variation: Math.round(exchangeVariation * 100) / 100,
      total_cost_expense: Math.round(totalCostExpense * 100) / 100,
      total_per_unit: Math.round(totalPerUnit * 100) / 100,
    };
  });

  logger.info('AI', 'ESTRUCTURA_COSTO_CALCULATED', { storeId, productsCount: rows.length, dateFrom, dateTo });

  return NextResponse.json({
    data: rows,
    date_from: dateFrom,
    date_to: dateTo,
    store_id: storeId,
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/inventory/estructura-costo');
