import { NextResponse, type NextRequest } from 'next/server';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore } from '@/lib/roles';

/**
 * GET /api/stores/health-batch?store_ids=id1,id2,id3
 *
 * Batch health: 2 queries total (products + transactions) en vez de 2N.
 *
 * FIX-AUDIT-SEC (#3): antes no validaba UUID ni membership de los storeIds
 * recibidos. Cualquier usuario autenticado podía pasar store_ids de tiendas
 * ajenas y obtener {has_products, has_sales} de ellas (cross-tenant).
 * Ahora:
 *   1. Valida formato UUID de cada storeId
 *   2. Filtra por canManageStore() — solo tiendas donde el usuario tiene acceso
 *   3. Los storeIds no autorizados se ignoran silenciosamente (no se reportan)
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeIdsParam = searchParams.get('store_ids');

  if (!storeIdsParam) {
    return NextResponse.json({ error: 'store_ids es requerido' }, { status: 400 });
  }

  // FIX-AUDIT-SEC (#3a): validar formato UUID de cada storeId
  const rawIds = storeIdsParam.split(',').filter(Boolean).filter(id => UUID_REGEX.test(id));
  if (rawIds.length === 0) {
    return NextResponse.json({ error: 'store_ids debe contener UUIDs válidos' }, { status: 400 });
  }

  // FIX-AUDIT-SEC (#3b): filtrar por membership — solo tiendas donde el usuario tiene acceso
  const allowedIds = rawIds.filter(id => canManageStore(session.user as any, id));
  if (allowedIds.length === 0) {
    // El usuario no tiene acceso a NINGUNA de las tiendas solicitadas
    return NextResponse.json({}, { status: 200 });
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString();

  // Query 1: productos activos (solo de tiendas autorizadas)
  const { data: productsData } = await supabase
    .from('products')
    .select('store_id')
    .in('store_id', allowedIds)
    .eq('is_active', true);

  // Query 2: ventas recientes (solo de tiendas autorizadas)
  const { data: salesData } = await supabase
    .from('transactions')
    .select('store_id')
    .in('store_id', allowedIds)
    .eq('status', 'completed')
    .gte('created_at', cutoffIso);

  const storesWithProducts = new Set<string>();
  if (productsData) {
    for (const p of productsData) storesWithProducts.add(p.store_id);
  }

  const storesWithSales = new Set<string>();
  if (salesData) {
    for (const s of salesData) storesWithSales.add(s.store_id);
  }

  // FIX-AUDIT-SEC (#3c): solo reportar tiendas autorizadas (no las denegadas)
  const result: Record<string, { has_products: boolean; has_sales: boolean }> = {};
  for (const id of allowedIds) {
    result[id] = {
      has_products: storesWithProducts.has(id),
      has_sales: storesWithSales.has(id),
    };
  }

  return NextResponse.json(result);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/stores/health-batch');
