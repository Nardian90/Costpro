import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { canManageStore } from '@/lib/roles';

const viewSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  module: z.string().max(50).default('costs'),
  store_id: z.string().uuid().optional(),
  config: z.record(z.string(), z.any()),
  is_default: z.boolean().optional(),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const { allowed } = await rateLimit(`analytics:get:${session.user.id}:${clientIp}`, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    const url = new URL(req.url);
    const moduleFilter = url.searchParams.get('module') || 'costs';
    const storeId = url.searchParams.get('store_id');

    const admin = getSupabaseAdminSafe();
    if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

    let query = admin.from('saved_analytics_views').select('*').eq('user_id', session.user.id).eq('module', moduleFilter);
    if (storeId) query = query.eq('store_id', storeId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      logger.error('DATABASE', 'ANALYTICS_VIEW_LIST_FAILED', { error: error.message });
      return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (e) {
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const { allowed } = await rateLimit(`analytics:post:${session.user.id}:${clientIp}`, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    const body = await req.json();
    const validated = viewSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const { name, description, module: moduleName, store_id, config, is_default } = validated.data;

    // Verify store access if store_id provided
    if (store_id && !canManageStore(session.user, store_id)) {
      return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    }

    const admin = getSupabaseAdminSafe();
    if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

    const { data, error } = await admin.from('saved_analytics_views').insert({
      user_id: session.user.id,
      store_id: store_id || null,
      name, description, module: moduleName, config, is_default: is_default || false,
    }).select().single();

    if (error) {
      logger.error('DATABASE', 'ANALYTICS_VIEW_SAVE_FAILED', { error: error.message });
      return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const url = new URL(req.url);
    const viewId = url.searchParams.get('id');
    if (!viewId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });

    const admin = getSupabaseAdminSafe();
    if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

    const { error } = await admin.from('saved_analytics_views').delete().eq('id', viewId).eq('user_id', session.user.id);
    if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/analytics-views');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/analytics-views');
export const DELETE = withTracing(withAuth(deleteHandler) as any, 'DELETE /api/analytics-views');
