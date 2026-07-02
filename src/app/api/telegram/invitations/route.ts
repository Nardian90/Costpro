import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * GET /api/telegram/invitations?store_id=UUID&status=pending
 * Lista invitaciones con filtro opcional por estado.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const status = url.searchParams.get('status');

  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  let query = admin
    .from('telegram_invitations')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data || [] });
}

const postSchema = z.object({
  store_id: z.string().uuid(),
  telegram_user_id: z.number().int(),
  username: z.string().optional(),
  first_name: z.string().optional(),
});

/**
 * POST /api/telegram/invitations
 * Crea una nueva invitación (estado 'pending').
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`telegram:inv:${session.user.id}`, {
    windowMs: 60_000, maxRequests: 20,
  });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = postSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { store_id, telegram_user_id, username, first_name } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data, error } = await admin
    .from('telegram_invitations')
    .insert({
      store_id,
      telegram_user_id,
      username,
      first_name,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, success: true });
}

/**
 * DELETE /api/telegram/invitations?id=UUID&store_id=UUID
 * Elimina una invitación.
 */
async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const storeId = url.searchParams.get('store_id');

  if (!id || !storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { error } = await admin
    .from('telegram_invitations')
    .delete()
    .eq('id', id)
    .eq('store_id', storeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/telegram/invitations');
export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/telegram/invitations');
export const DELETE = withTracing(withAuth(deleteHandler) as any, 'DELETE /api/telegram/invitations');
