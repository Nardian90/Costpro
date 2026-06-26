import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * POST /api/received-services/distribute
 * Recalcula la distribución de un servicio entre las líneas de sus recepciones.
 * Llama al RPC calculate_service_distribution y guarda resultados.
 */

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { service_id } = await req.json();
    if (!service_id) return NextResponse.json({ error: 'service_id required' }, { status: 400 });

    // 1. Eliminar distribuciones anteriores
    await admin.from('service_cost_distributions').delete().eq('service_id', service_id);

    // 2. Calcular nueva distribución via RPC
    const { data: distributions, error: rpcError } = await admin.rpc('calculate_service_distribution', { p_service_id: service_id });

    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

    // 3. Guardar distribuciones
    if (distributions && distributions.length > 0) {
      // Obtener receipt_id para cada receipt_item_id
      const itemIds = distributions.map((d: any) => d.receipt_item_id);
      const { data: items } = await admin.from('receipt_items').select('id, receipt_id').in('id', itemIds);
      const itemMap = new Map((items || []).map((i: any) => [i.id, i.receipt_id]));

      const rows = distributions.map((d: any) => ({
        service_id,
        receipt_id: itemMap.get(d.receipt_item_id),
        receipt_item_id: d.receipt_item_id,
        product_id: d.product_id,
        distribution_amount: Math.round(d.distribution_amount * 100) / 100,
        distribution_percentage: Math.round(d.distribution_percentage * 100) / 100,
      }));

      const { error: insertError } = await admin.from('service_cost_distributions').insert(rows);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 4. Audit
    await admin.from('service_audit_log').insert({
      service_id, user_id: session.user.id,
      action: 'recalculated', details: { rows: distributions?.length || 0 }
    });

    return NextResponse.json({ success: true, distributed_rows: distributions?.length || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);
