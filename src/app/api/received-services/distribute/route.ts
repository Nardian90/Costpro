import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';

/**
 * POST /api/received-services/distribute
 * v2.25.0 — Feature flag USE_V2_RECEIVED_SERVICES:
 *   true  → RPC distribute_service_cost_v2 (atomica, SELECT FOR UPDATE, recalcula WAC)
 *   false → codigo TypeScript viejo (DELETE + RPC + INSERT no-atomico)
 */

const USE_V2 = process.env.USE_V2_RECEIVED_SERVICES === 'true';

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { service_id } = await req.json();
    if (!service_id) return NextResponse.json({ error: 'service_id required' }, { status: 400 });

    const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

    if (USE_V2) {
      // ─── v2.25.0: RPC transaccional ───
      const { data: rpcResult, error: rpcErr } = await admin.rpc('distribute_service_cost_v2', {
        p_service_id: service_id,
        p_user_id: userId,
      });

      if (rpcErr) {
        const msg = rpcErr.message;
        if (msg.includes('ERR_SERVICE_NOT_FOUND')) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
        if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        if (msg.includes('ERR_SERVICE_NOT_ACTIVE')) return NextResponse.json({ error: 'Servicio no activo' }, { status: 400 });
        if (msg.includes('ERR_MANUAL_METHOD')) return NextResponse.json({ error: 'Metodo manual requiere link_receipts_to_service' }, { status: 400 });
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      return NextResponse.json({ success: true, distributed_rows: rpcResult.distributed_rows });
    }

    // ─── v2.24.x: codigo TypeScript viejo ───
    await admin.from('service_cost_distributions').delete().eq('service_id', service_id);

    const { data: distributions, error: rpcError } = await admin.rpc('calculate_service_distribution', { p_service_id: service_id });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

    if (distributions && distributions.length > 0) {
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

    await admin.from('service_audit_log').insert({
      service_id, user_id: session.user.id,
      action: 'recalculated', details: { rows: distributions?.length || 0 }
    });

    return NextResponse.json({ success: true, distributed_rows: distributions?.length || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'received-services-distribute:post',
  maxRequests: 5,
}));
