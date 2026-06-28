import { NextResponse, type NextRequest } from 'next/server';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * GET /api/stores/health-batch?store_ids=id1,id2,id3
 *
 * Batch health: 2 queries total (products + transactions) en vez de 2N.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeIdsParam = searchParams.get('store_ids');

  if (!storeIdsParam) {
    return NextResponse.json({ error: 'store_ids es requerido' }, { status: 400 });
  }

  const storeIds = storeIdsParam.split(',').filter(Boolean);
  if (storeIds.length === 0) {
    return NextResponse.json({});
  }

  // FIX-AUDIT-NEW-3: Use service-role client instead of getSupabaseAuthClient(session.token).
  // When an admin requests health for 10 stores, the query with their personal JWT
  // may be filtered by RLS to only stores where they have active membership.
  // Stores owned by other managers wouldn't appear in the result — the MultiStoreDashboard
  // health score would be incomplete with NO visible error.
  // Service-role client bypasses RLS so the admin sees ALL stores they requested.
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString();

  // Query 1: productos activos
  const { data: productsData } = await supabase
    .from('products')
    .select('store_id')
    .in('store_id', storeIds)
    .eq('is_active', true);

  // Query 2: ventas recientes
  const { data: salesData } = await supabase
    .from('transactions')
    .select('store_id')
    .in('store_id', storeIds)
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

  const result: Record<string, { has_products: boolean; has_sales: boolean }> = {};
  for (const id of storeIds) {
    result[id] = {
      has_products: storesWithProducts.has(id),
      has_sales: storesWithSales.has(id),
    };
  }

  return NextResponse.json(result);
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/stores/health-batch');
