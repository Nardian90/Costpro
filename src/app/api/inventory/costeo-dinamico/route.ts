import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { calculateProductCost, calculateDashboard } from '@/lib/costeo-dinamico/engine';
import type { ProductCostInput, CostEngineConfig, CurrentRate } from '@/lib/costeo-dinamico/types';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

// F4.4: In-memory cache with TTL (30 seconds).
// Key: store_id + rate_source + rate_value.
// Invalidated automatically after 30s or when rate changes.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 50) {
    const sorted = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10; i++) cache.delete(sorted[i][0]);
  }
}

// F4-GAP1: Invalidate all cache entries for a store (called after commit or tasa update)
export function invalidateCacheForStore(storeId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${storeId}:`)) cache.delete(key);
  }
}

/**
 * GET /api/inventory/costeo-dinamico?store_id=X
 *
 * Devuelve la tabla completa de costeo dinámico para una tienda.
 * Calcula el costo real total de cada producto absorbiendo:
 *   - Costo base de recepciones (con moneda/tasa)
 *   - Servicios vinculados (transportación, manipulación, otros)
 *   - Comisiones vinculadas
 *   - Impacto cambiario (reposición vs histórico)
 *
 * Query params:
 *   store_id (required) — Tienda a analizar
 *   source (optional) — Fuente de tasa: BCC_seg1, BCC_seg2, BCC_seg3, elToque, Manual
 *   rate (optional) — Tasa manual override (ej: 600)
 *   min_margin (optional) — Margen mínimo (default 0.15)
 *   target_margin (optional) — Margen objetivo (default 0.30)
 *   rounding (optional) — Regla de redondeo (default multiple_10)
 *   product_id (optional) — F4-GAP2: Filtrar un solo producto (para modal)
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const productId = searchParams.get('product_id'); // F4-GAP2

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  // F4.4: Check cache first (skip cache for single-product queries)
  const rateSource = searchParams.get('source') || 'BCC_seg3';
  const manualRate = searchParams.get('rate');
  const cacheKey = `${storeId}:${rateSource}:${manualRate || 'auto'}:${productId || 'all'}`;
  if (!productId) { // Only cache full-store queries
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // 1. Obtener tasa actual (rateSource y manualRate ya declarados arriba para cache)
  // const rateSource = searchParams.get('source') || 'BCC_seg3';
  // const manualRate = searchParams.get('rate');

  let currentRate: CurrentRate | null = null;
  if (manualRate) {
    currentRate = {
      currency: 'USD',
      rate: parseFloat(manualRate),
      source: 'Manual',
      date: new Date().toISOString(),
    };
  } else {
    // Mapear source a la tabla exchange_rates
    let erSource = 'BCC';
    let erSegment = '3';
    if (rateSource === 'BCC_seg1') { erSource = 'BCC'; erSegment = '1'; }
    else if (rateSource === 'BCC_seg2') { erSource = 'BCC'; erSegment = '2'; }
    else if (rateSource === 'elToque') { erSource = 'elToque'; erSegment = '3'; }

    const { data: rateData } = await supabase
      .from('exchange_rates')
      .select('rate, rate_date, currency')
      .eq('currency', 'USD')
      .eq('source', erSource)
      .eq('segment', erSegment)
      .order('rate_date', { ascending: false })
      .limit(1);

    if (rateData && rateData.length > 0) {
      currentRate = {
        currency: 'USD',
        rate: rateData[0].rate,
        source: rateSource as CurrentRate['source'],
        date: rateData[0].rate_date,
      };
    }
  }

  // 2. Configuración del motor
  const config: CostEngineConfig = {
    min_margin: parseFloat(searchParams.get('min_margin') || '0.15'),
    target_margin: parseFloat(searchParams.get('target_margin') || '0.30'),
    rounding_rule: (searchParams.get('rounding') || 'multiple_10') as CostEngineConfig['rounding_rule'],
    rounding_direction: 'nearest',
    rate_source: rateSource as CostEngineConfig['rate_source'],
    manual_rate: currentRate,
  };

  // 3. Obtener productos de la tienda (F4-GAP2: filtrar por product_id si se proporciona)
  let productsQuery = supabase
    .from('products')
    .select('id, name, stock_current, cost_average, price, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true);
  if (productId) {
    productsQuery = productsQuery.eq('id', productId);
  }
  const { data: products, error: productsError } = await productsQuery;

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  if (!products || products.length === 0) {
    return NextResponse.json({ data: [], dashboard: calculateDashboard([]), currentRate, config });
  }

  // 4. Obtener receipt_items con moneda/tasa para estos productos
  const productIds = products.map(p => p.id);
  const { data: receiptItems } = await supabase
    .from('receipt_items')
    .select(`
      id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion,
      receipt_id
    `)
    .in('product_id', productIds);

  // 5. Obtener servicios vinculados (service_cost_distributions)
  const { data: serviceDistributions } = await supabase
    .from('service_cost_distributions')
    .select(`
      product_id, distribution_amount,
      received_services(service_type_name, total_amount, currency, exchange_rate)
    `)
    .in('product_id', productIds);

  // 6. Obtener comisiones vinculadas
  const { data: commissionLinks } = await supabase
    .from('commission_reception_links')
    .select('product_id, allocated_amount, distribution_method, receipt_id')
    .in('receipt_id', (receiptItems || []).map(r => r.receipt_id));

  // 7. Agrupar datos por producto
  const results = products.map(product => {
    const prodReceipts = (receiptItems || []).filter(r => r.product_id === product.id);
    const prodServices = (serviceDistributions || [])
      .filter(s => s.product_id === product.id)
      .map(s => {
        const rs = (s as any).received_services;
        const receivedService = Array.isArray(rs) ? rs[0] : rs;
        return {
          service_id: receivedService?.id || '',
          total_amount: s.distribution_amount || 0,
          distribution_method: 'cost_value' as const,
          service_type_name: receivedService?.service_type_name || 'Otros',
        };
      });
    const prodCommissions = (commissionLinks || [])
      .filter(c => c.product_id === product.id)
      .map(c => ({
        payment_id: c.receipt_id,
        amount: c.allocated_amount,
        distribution_method: c.distribution_method as 'cost_value',
      }));

    const input: ProductCostInput = {
      product_id: product.id,
      product_name: product.name,
      store_id: storeId,
      stock_current: product.stock_current || 0,
      cost_average: product.cost_average || 0,
      current_price: product.price || 0,
      receipts: prodReceipts.map(r => ({
        product_id: r.product_id,
        quantity: r.quantity,
        unit_cost: r.unit_cost,
        moneda_recepcion: r.moneda_recepcion || 'CUP',
        tasa_cambio_recepcion: r.tasa_cambio_recepcion || 1.0,
      })),
      services: prodServices,
      commissions: prodCommissions,
    };

    return calculateProductCost(input, config, currentRate);
  });

  // 8. Calcular dashboard
  const dashboard = calculateDashboard(results);

  logger.info('AI', 'COSTEO_DINAMICO_CALCULATED', {
    storeId, productsCount: results.length, currentRate: currentRate?.rate,
  });

  const response = { data: results, dashboard, currentRate, config };

  // F4.4: Cache the response
  setCached(cacheKey, response);

  return NextResponse.json(response);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/inventory/costeo-dinamico');
