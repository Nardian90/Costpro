/**
 * POST /api/inventory/adjustments/duplicate — duplicar un ajuste existente
 *
 * V2.4: Crea un nuevo inventory_adjustment con los mismos items del original,
 * copia los items (expected/counted/difference) y aplica el difference al stock.
 *
 * Body: { original_id: UUID }
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const schema = z.object({
  original_id: z.string().min(1),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`adj-dup:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // 1. Cargar ajuste original
  const { data: orig, error: e1 } = await supabase
    .from('inventory_adjustments')
    .select('*')
    .eq('id', parsed.data.original_id)
    .single();
  if (e1 || !orig) {
    return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 });
  }

  if (!canManageStore(session.user, orig.store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // 2. Cargar items originales
  const { data: origItems, error: e2 } = await supabase
    .from('inventory_adjustment_items')
    .select('product_id, expected_quantity, counted_quantity')
    .eq('adjustment_id', parsed.data.original_id);
  if (e2 || !origItems || origItems.length === 0) {
    return NextResponse.json({ error: 'Sin items en el ajuste original' }, { status: 400 });
  }

  // 3. Crear nuevo ajuste
  const { data: newAdj, error: e3 } = await supabase.from('inventory_adjustments').insert({
    store_id: orig.store_id,
    created_by: session.user.id,
    status: 'confirmed',
    reason: orig.reason || 'OTHER',
    notes: `Duplicada de ${parsed.data.original_id.slice(0, 8)} — ${orig.notes || ''}`.slice(0, 500),
  }).select().single();
  if (e3) {
    logger.error('DATABASE', 'DUPLICATE_ADJ_FAILED', { error: e3.message });
    return NextResponse.json({ error: e3.message }, { status: 500 });
  }

  // 4. Copiar items
  const itemsToInsert = origItems.map(i => ({
    adjustment_id: newAdj.id,
    product_id: i.product_id,
    expected_quantity: i.expected_quantity,
    counted_quantity: i.counted_quantity,
    // difference es GENERATED, no se inserta
  }));
  const { error: e4 } = await supabase.from('inventory_adjustment_items').insert(itemsToInsert);
  if (e4) {
    logger.error('DATABASE', 'DUPLICATE_ADJ_ITEMS_FAILED', { error: e4.message });
    return NextResponse.json({ error: e4.message }, { status: 500 });
  }

  // 5. Aplicar el difference al stock (sumar (counted - expected) por cada item)
  for (const item of origItems) {
    const diff = Number(item.counted_quantity) - Number(item.expected_quantity);
    if (diff === 0) continue;

    const { data: prod } = await supabase
      .from('products')
      .select('stock_current, cost_average')
      .eq('id', item.product_id)
      .eq('store_id', orig.store_id)
      .single();
    if (!prod) continue;

    const newStock = prod.stock_current + diff;
    await supabase
      .from('products')
      .update({ stock_current: newStock, updated_at: new Date().toISOString() })
      .eq('id', item.product_id)
      .eq('store_id', orig.store_id);

    // Kardex entry
    await supabase.from('kardex_entries').insert({
      store_id: orig.store_id,
      product_id: item.product_id,
      movement_type: 'adjustment',
      quantity: Math.abs(diff),
      unit_cost: prod.cost_average || 0,
      total_value: Math.abs(diff) * (prod.cost_average || 0),
      balance_quantity: newStock,
      balance_unit_cost: prod.cost_average || 0,
      balance_total_value: newStock * (prod.cost_average || 0),
      reference_type: 'adjustment',
      reference_id: newAdj.id,
      reference_description: `Ajuste duplicado de ${parsed.data.original_id.slice(0, 8)}`,
      created_by: session.user.id,
    });
  }

  logger.info('DATABASE', 'ADJUSTMENT_DUPLICATED', {
    originalId: parsed.data.original_id,
    newId: newAdj.id,
    userId: session.user.id,
  });

  return NextResponse.json({
    id: newAdj.id,
    status: newAdj.status,
    adjustment_number: newAdj.id.slice(0, 8),
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/inventory/adjustments/duplicate');
