import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * GET /api/received-services/analysis?product_id=...&store_id=...
 * Devuelve el análisis de costos por producto (costo base + servicios asociados).
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('product_id');
    const storeId = searchParams.get('store_id') || session.user.id;

    if (!productId) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

    const { data, error } = await admin.rpc('get_product_cost_analysis', {
      p_product_id: productId,
      p_store_id: storeId,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Agrupar por receipt_item para mostrar desglose
    const analysis: Record<string, any> = {};
    for (const row of data || []) {
      const key = row.receipt_item_id || `${row.receipt_id}-${row.quantity}`;
      if (!analysis[key]) {
        analysis[key] = {
          receipt_id: row.receipt_id,
          receipt_date: row.receipt_date,
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          base_cost: row.unit_cost * row.quantity,
          services: [],
          total_services: 0,
          total_cost: row.unit_cost * row.quantity,
          unit_cost_final: row.unit_cost,
        };
      }
      if (row.service_type && row.service_amount > 0) {
        analysis[key].services.push({
          type: row.service_type,
          amount: row.service_amount,
        });
        analysis[key].total_services += row.service_amount;
        analysis[key].total_cost = analysis[key].base_cost + analysis[key].total_services;
        analysis[key].unit_cost_final = analysis[key].quantity > 0 ? analysis[key].total_cost / analysis[key].quantity : 0;
      }
    }

    return NextResponse.json({ data: Object.values(analysis) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
