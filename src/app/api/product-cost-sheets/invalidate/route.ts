import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getAdminClient } from '@/lib/supabase-admin';

const invalidateSchema = z.object({
  storeId: z.string().uuid(),
});

async function invalidateHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `fc-invalidate:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 20 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const body = await req.json();
    const validated = invalidateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { storeId } = validated.data;

    if (session.user.role !== 'admin') {
      const memberships = session.user.memberships || [];
      const hasAccess = memberships.some(
        m => m.store_id === storeId && m.status === 'active' &&
        ['admin', 'manager', 'encargado', 'costo'].includes(m.role)
      );
      if (!hasAccess) {
        return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });
      }
    }

    const admin = await getAdminClient();

    const { data, error } = await admin
      .from('product_cost_sheets')
      .update({
        sync_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .neq('sync_status', 'pending')
      .select('id');

    if (error) {
      logger.error('FC', 'FC_INVALIDATE_ENDPOINT_FAILED', { storeId, error: error.message });
      return NextResponse.json(
        createApiError('FC_INVALIDATE_FAILED', error.message),
        { status: 500 }
      );
    }

    const affected = data?.length ?? 0;
    logger.info('FC', 'FC_INVALIDATE_ENDPOINT_SUCCESS', {
      storeId, affected, invalidatedBy: session.user.id,
    });

    return NextResponse.json({ success: true, affected, storeId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const POST = withTracing(
  withRole('encargado', invalidateHandler as any) as any,
  'POST /api/product-cost-sheets/invalidate'
);
