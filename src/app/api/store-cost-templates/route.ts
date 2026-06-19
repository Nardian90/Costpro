import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { upsertStoreCostTemplateSchema, getStoreCostTemplateSchema } from '@/validation/api-schemas';
import { mapStoreCostTemplateToContract } from '@/contracts/store-cost-template';
import { getAdminClient } from '@/lib/supabase-admin';
import { auditService } from '@/services/audit-service';

/**
 * GET /api/store-cost-templates?store_id=xxx
 * Returns the default FC template for a specific store.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `store-cost-templates:get:${session.user.id}:${clientIp}`;
    const { allowed, remaining, resetAt } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429, headers: { 'X-RateLimit-Remaining': '0' } });
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const validated = getStoreCostTemplateSchema.safeParse({ store_id: storeId });
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    // Validate store access
    const isAdmin = session.user.role === 'admin';
    const memberships = session.user.memberships || [];
    const hasAccess = isAdmin || memberships.some(m => m.store_id === validated.data.store_id && m.status === 'active');
    if (!hasAccess) {
      return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });
    }

    const admin = await getAdminClient();

    const { data, error } = await admin
      .from('store_cost_templates')
      .select('*')
      .eq('store_id', validated.data.store_id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[store-cost-templates] Fetch error:', error.message);
      return NextResponse.json(createApiError('STORE_COST_TEMPLATE_FETCH_FAILED'), { status: 500 });
    }

    const contract = data ? mapStoreCostTemplateToContract(data) : null;
    const response = NextResponse.json({ data: contract });
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[store-cost-templates] GET unexpected error:', message);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

/**
 * PUT /api/store-cost-templates
 * Upserts (creates or updates) the default FC template for a store.
 */
async function putHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `store-cost-templates:put:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });

    const body = await req.json();
    const validated = upsertStoreCostTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    // Validate store access (admin/manager/encargado)
    const isAdmin = session.user.role === 'admin';
    const memberships = session.user.memberships || [];
    const hasAccess = isAdmin || memberships.some(
      m => m.store_id === validated.data.store_id && m.status === 'active' && ['admin', 'manager', 'encargado'].includes(m.role)
    );
    if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

    const admin = await getAdminClient();

    // FIX-FC-PERSIST-V3: Use direct upsert instead of RPC.
    // The RPC (upsert_store_cost_template) has its own auth check using
    // is_global_admin()/has_store_role() which rely on auth.uid(). When called
    // from the server-side API route using the service role key, auth.uid() is
    // NULL, so the RPC always rejects with "Sin permisos...". The service role
    // key bypasses RLS, so a direct upsert is safe here. Authorization is
    // already validated above (lines 84-90).
    const { data, error } = await admin
      .from('store_cost_templates')
      .upsert({
        store_id: validated.data.store_id,
        template_id: validated.data.template_id,
        template_data: validated.data.template_data ?? null,
        modalidad: validated.data.modalidad,
        pdf_format: validated.data.pdf_format,
        is_active: true,
        created_by: session.user.id,
      }, { onConflict: 'store_id' })
      .select()
      .single();

    if (error) {
      console.error('[store-cost-templates] Upsert error:', error.message);
      return NextResponse.json(createApiError('STORE_COST_TEMPLATE_UPSERT_FAILED'), { status: 500 });
    }

    // Audit log
    await auditService.logFCTemplateUpdated({
      userId: session.user.id,
      storeId: validated.data.store_id,
      templateId: validated.data.template_id,
      modalidad: validated.data.modalidad,
      isActive: true,
    });

    const contract = mapStoreCostTemplateToContract(data);
    return NextResponse.json({ data: contract }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[store-cost-templates] PUT unexpected error:', message);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

/**
 * DELETE /api/store-cost-templates?store_id=xxx
 * Deletes the FC template for a specific store. Admin-only.
 */
async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `store-cost-templates:delete:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 3 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const validated = getStoreCostTemplateSchema.safeParse({ store_id: storeId });
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const admin = await getAdminClient();

    // Check if template exists before deleting
    const { data: existing, error: fetchError } = await admin
      .from('store_cost_templates')
      .select('store_id, template_id, modalidad')
      .eq('store_id', validated.data.store_id)
      .maybeSingle();

    if (fetchError) {
      console.error('[store-cost-templates] Delete fetch error:', fetchError.message);
      return NextResponse.json(createApiError('STORE_COST_TEMPLATE_FETCH_FAILED'), { status: 500 });
    }

    if (!existing) {
      return NextResponse.json(createApiError('STORE_NOT_FOUND'), { status: 404 });
    }

    const { error: deleteError } = await admin
      .from('store_cost_templates')
      .delete()
      .eq('store_id', validated.data.store_id);

    if (deleteError) {
      console.error('[store-cost-templates] Delete error:', deleteError.message);
      return NextResponse.json(createApiError('STORE_DELETE_FAILED'), { status: 500 });
    }

    // Audit log
    await auditService.logFCTemplateUpdated({
      userId: session.user.id,
      storeId: validated.data.store_id,
      templateId: existing.template_id || '',
      modalidad: 'delete',
      isActive: false,
    });

    return NextResponse.json({ data: { deleted: true, store_id: validated.data.store_id } }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[store-cost-templates] DELETE unexpected error:', message);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

export const GET = withTracing(withAuth(getHandler) as Parameters<typeof withTracing>[0], 'GET /api/store-cost-templates');
export const PUT = withTracing(withRole('encargado', putHandler as Parameters<typeof withRole>[1]), 'PUT /api/store-cost-templates');
export const DELETE = withTracing(withRole('admin', deleteHandler as Parameters<typeof withRole>[1]), 'DELETE /api/store-cost-templates');
