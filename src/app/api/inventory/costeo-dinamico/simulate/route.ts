import { NextRequest, NextResponse } from 'next/server';
import { withStoreAccess, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { calculateProductCost, calculateDashboard } from '@/lib/costeo-dinamico/engine';
import type { ProductCostInput, CostEngineConfig, CurrentRate, RateSource, RoundingRule } from '@/lib/costeo-dinamico/types';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/inventory/costeo-dinamico/simulate
 *
 * Simula el costeo dinámico con una tasa de cambio diferente.
 * No modifica datos — es puramente analítico.
 *
 * Body:
 *   store_id, currency, simulated_rate, source, min_margin, target_margin, rounding
 */

// FIX-F05: Validación zod de inputs. Antes `simulated_rate` podía ser
// NaN/negativo/cero porque solo se hacía `parseFloat(simulated_rate)` tras
// un truthy check. Ahora zod garantiza que sea un número positivo en [1, 10000].
const simulateSchema = z.object({
  store_id: z.string().uuid(),
  currency: z.string().optional(),
  simulated_rate: z.number().positive().min(1).max(10000),
  source: z.string().optional(),
  min_margin: z.number().optional(),
  target_margin: z.number().optional(),
  rounding: z.string().optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json().catch(() => ({}));

  const parsed = simulateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { store_id, currency, simulated_rate, source, min_margin, target_margin, rounding } = parsed.data;

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const currentRate: CurrentRate = {
    currency: currency || 'USD',
    rate: simulated_rate,
    source: (source || 'Manual') as RateSource,
    date: new Date().toISOString(),
  };

  const config: CostEngineConfig = {
    min_margin: min_margin ?? 0.15,
    target_margin: target_margin ?? 0.30,
    rounding_rule: (rounding || 'multiple_10') as RoundingRule,
    rounding_direction: 'nearest',
    rate_source: 'Manual',
    manual_rate: currentRate,
  };

  // Reuse same data fetching as GET route
  const { data: products } = await supabase
    .from('products')
    .select('id, name, stock_current, cost_average, price, is_active')
    .eq('store_id', store_id)
    .eq('is_active', true);

  if (!products || products.length === 0) {
    return NextResponse.json({ data: [], dashboard: calculateDashboard([]), currentRate, config });
  }

  const productIds = products.map(p => p.id);
  const { data: receiptItems } = await supabase
    .from('receipt_items')
    .select('id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion, receipt_id')
    .in('product_id', productIds);

  const { data: serviceDistributions } = await supabase
    .from('service_cost_distributions')
    .select('product_id, distribution_amount, received_services(service_type_name)')
    .in('product_id', productIds);

  const { data: commissionLinks } = await supabase
    .from('commission_reception_links')
    .select('product_id, allocated_amount, distribution_method, receipt_id')
    .in('receipt_id', (receiptItems || []).map(r => r.receipt_id));

  const results = products.map(product => {
    const prodReceipts = (receiptItems || []).filter(r => r.product_id === product.id);
    const prodServices = (serviceDistributions || [])
      .filter(s => s.product_id === product.id)
      .map(s => ({
        service_id: '',
        total_amount: s.distribution_amount || 0,
        distribution_method: 'cost_value' as const,
        service_type_name: (s as any).received_services?.service_type_name || 'Otros',
      }));
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
      store_id,
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

  const dashboard = calculateDashboard(results);

  return NextResponse.json({ data: results, dashboard, currentRate, config });
}

// IC-F04-STORE-ACCESS: withStoreAccess reads store_id from the JSON body and
// validates the user has an active membership to that store before running the
// handler. Prevents cross-store simulation leaks via getSupabaseAdminSafe().
export const POST = withTracing(withStoreAccess(postHandler) as any, 'POST /api/inventory/costeo-dinamico/simulate');
