import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';

const configSchema = z.object({
  store_id: z.string().uuid(),
  phone_number: z.string().optional(),
  group_jid: z.string().optional(),
  group_name: z.string().optional(),
  welcome_enabled: z.boolean().optional(),
  welcome_message: z.string().optional(),
  system_prompt: z.string().optional(),
  model_name: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(256).max(4096).optional(),
  context_window: z.number().min(1).max(50).optional(),
  is_active: z.boolean().optional(),
  trigger_mode: z.enum(['mention', 'always', 'keyword']).optional(),
  trigger_keywords: z.string().optional(),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await admin.from('whatsapp_configs').select('*').eq('store_id', storeId).single();
  if (error && error.code !== 'PGRST116') {
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }

  return NextResponse.json({ data: data || null });
}

async function putHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:config:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = configSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
  }

  const { store_id, ...updates } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // Upsert: si no existe, crear; si existe, actualizar
  const { data, error } = await admin
    .from('whatsapp_configs')
    .upsert({ store_id, ...updates }, { onConflict: 'store_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }

  return NextResponse.json({ data });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/whatsapp/config');
export const PUT = withTracing(withAuth(putHandler) as any, 'PUT /api/whatsapp/config');
