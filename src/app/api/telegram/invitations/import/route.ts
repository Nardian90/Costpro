import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * POST /api/telegram/invitations/import
 * Importa múltiples invitaciones desde un CSV/JSON.
 *
 * Body: { store_id: UUID, invitations: [{ telegram_user_id, username?, first_name? }] }
 *
 * Espejo de whatsapp/invitations/import pero con telegram_user_id (number)
 * en vez de phone_number (string).
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`telegram:inv:import:${session.user.id}`, {
    windowMs: 60_000, maxRequests: 5,
  });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const { store_id, invitations } = body;

  if (!store_id || !Array.isArray(invitations) || invitations.length === 0) {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }
  if (invitations.length > 100) {
    return NextResponse.json(
      { error: 'Máximo 100 invitaciones por import' },
      { status: 400 }
    );
  }
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // Validar cada invitación
  for (const inv of invitations) {
    if (typeof inv.telegram_user_id !== 'number' || !Number.isInteger(inv.telegram_user_id)) {
      return NextResponse.json(
        { error: `telegram_user_id inválido: ${inv.telegram_user_id}` },
        { status: 400 }
      );
    }
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const rows = invitations.map((inv: any) => ({
    store_id,
    telegram_user_id: inv.telegram_user_id,
    username: inv.username || null,
    first_name: inv.first_name || null,
    status: 'pending',
  }));

  const { data, error } = await admin
    .from('telegram_invitations')
    .insert(rows)
    .select('id, telegram_user_id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    imported: data?.length || 0,
    data,
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/telegram/invitations/import');
