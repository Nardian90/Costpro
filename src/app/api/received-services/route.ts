import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';

/**
 * GET /api/received-services?store_id=...&status=...&type=...
 * POST /api/received-services — Crear nuevo servicio
 * PATCH /api/received-services — Editar/anular servicio
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id') || session.user.id;
    const status = searchParams.get('status');

    let query = admin.from('received_services').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR', error.message), { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const rl = await rateLimit(`services:post:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
    if (!rl.allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json();
    const storeId = body.store_id || session.user.id;

    // Generar número de servicio
    const { count } = await admin.from('received_services').select('*', { count: 'exact', head: true }).eq('store_id', storeId);
    const serviceNumber = `SRV-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await admin.from('received_services').insert({
      store_id: storeId,
      service_number: serviceNumber,
      service_date: body.service_date || new Date().toISOString().split('T')[0],
      service_type_id: body.service_type_id || null,
      service_type_name: body.service_type_name || 'Otro',
      supplier: body.supplier || null,
      reference_doc: body.reference_doc || null,
      currency: body.currency || 'CUP',
      exchange_rate: body.exchange_rate || 1,
      total_amount: body.total_amount,
      observations: body.observations || null,
      status: 'active',
      distribution_method: body.distribution_method || 'amount',
      created_by: session.user.id,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    await admin.from('service_audit_log').insert({
      service_id: data.id, user_id: session.user.id,
      action: 'created', details: { service_number: serviceNumber, total_amount: body.total_amount }
    });

    // Si hay recepciones vinculadas, crear links
    if (body.receipt_ids && Array.isArray(body.receipt_ids) && body.receipt_ids.length > 0) {
      const totalReceipts = body.receipt_ids.length;
      const allocatedPerReceipt = body.total_amount / totalReceipts;
      const links = body.receipt_ids.map((rid: string) => ({
        service_id: data.id, receipt_id: rid,
        allocation_percentage: 100 / totalReceipts,
        allocated_amount: allocatedPerReceipt,
      }));
      await admin.from('service_reception_links').insert(links);

      await admin.from('service_audit_log').insert({
        service_id: data.id, user_id: session.user.id,
        action: 'linked', details: { receipt_ids: body.receipt_ids }
      });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json();
    const { service_id, ...updates } = body;

    if (body.action === 'void') {
      // Anular servicio
      const { error } = await admin.from('received_services').update({ status: 'voided', updated_at: new Date().toISOString() }).eq('id', service_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Eliminar distribuciones
      await admin.from('service_cost_distributions').delete().eq('service_id', service_id);

      await admin.from('service_audit_log').insert({ service_id, user_id: session.user.id, action: 'voided', details: {} });
      return NextResponse.json({ success: true });
    }

    // Editar
    const { data, error } = await admin.from('received_services').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', service_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('service_audit_log').insert({ service_id, user_id: session.user.id, action: 'edited', details: updates });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
