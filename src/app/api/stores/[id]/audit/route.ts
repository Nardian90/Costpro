import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabaseClient';

/**
 * F6-T03: Endpoint para obtener logs de auditoría de una tienda específica.
 * GET /api/stores/[id]/audit?page=1&limit=20&action=CREATE&userId=xxx
 * RLS filtra automáticamente por membership del caller.
 */

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

async function auditHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await context.params;
    const { searchParams } = new URL(req.url);
    const validated = querySchema.safeParse({
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
      action: searchParams.get('action') || undefined,
      userId: searchParams.get('userId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { page, limit, action, userId, from, to } = validated.data;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: logs, count, error } = await query;

    if (error) {
      logger.error('AUDIT', 'STORE_AUDIT_QUERY_FAILED', { storeId, error: error.message });
      return NextResponse.json(createApiError('AUDIT_QUERY_FAILED', error.message), { status: 500 });
    }

    return NextResponse.json({
      data: logs || [],
      pagination: {
        page, limit, total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
      storeId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const GET = withTracing(
  withRole('encargado', auditHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'GET /api/stores/[id]/audit'
);
