import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const reconcileSchema = z.object({
  action: z.enum(['create_profile', 'delete_auth_user', 'ignore']),
  reason: z.string().min(3).max(500),
});

async function postHandler(req: NextRequest, session: { user: { id: string } }) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await rateLimit(session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const authUserId = pathParts[pathParts.length - 2];

  if (!authUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId)) {
    return NextResponse.json({ error: 'Invalid auth_user_id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('reconcile_orphan_user', {
    p_auth_user_id: authUserId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_ALREADY_RESOLVED')) return NextResponse.json({ error: 'Huérfano ya resuelto' }, { status: 409 });
    if (msg.includes('ERR_ORPHAN_NOT_FOUND')) return NextResponse.json({ error: 'Huérfano no encontrado' }, { status: 404 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (parsed.data.action === 'delete_auth_user') {
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    } catch (delErr) {
      logger.warn('AUTH', 'DELETE_AUTH_USER_FAILED_AFTER_RECONCILE', {
        authUserId,
        error: delErr instanceof Error ? delErr.message : String(delErr),
      });
    }
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withRole('admin', postHandler) as Parameters<typeof withTracing>[0],
  'POST /api/users/[id]/reconcile'
);
