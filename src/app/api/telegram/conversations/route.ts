import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * GET /api/telegram/conversations?store_id=UUID
 * Devuelve lista de contactos con último mensaje + unread count.
 * Espejo de whatsapp/conversations.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data: contacts, error } = await admin
    .from('telegram_contacts')
    .select('id, telegram_user_id, username, first_name, last_name, last_contact, is_banned, tags')
    .eq('store_id', storeId)
    .order('last_contact', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Para cada contacto, obtener último mensaje + unread count
  const conversations = await Promise.all(
    (contacts || []).map(async (c) => {
      const { data: lastMsg } = await admin
        .from('telegram_messages')
        .select('content, direction, created_at')
        .eq('contact_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count } = await admin
        .from('telegram_messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', c.id)
        .eq('direction', 'incoming')
        .eq('read_receipt', false);

      return {
        ...c,
        last_message: lastMsg?.content || '',
        last_message_direction: lastMsg?.direction || 'incoming',
        last_message_at: lastMsg?.created_at || c.last_contact,
        unread_count: count || 0,
      };
    })
  );

  return NextResponse.json({ data: conversations });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/telegram/conversations');
