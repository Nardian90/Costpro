import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:conv:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const contactId = url.searchParams.get('contact_id');

  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  if (contactId) {
    // GET mensajes de un contacto específico
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('store_id', storeId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
    return NextResponse.json({ data: data || [] });
  }

  // GET lista de contactos con último mensaje (lista de conversaciones)
  const { data: contacts, error } = await supabase
    .from('whatsapp_contacts')
    .select('id, phone_number, name, push_name, last_contact, is_banned, is_group')
    .eq('store_id', storeId)
    .order('last_contact', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });

  // Para cada contacto, obtener último mensaje y count no leídos
  const conversations = await Promise.all(
    (contacts || []).map(async (c) => {
      const { data: lastMsg } = await supabase
        .from('whatsapp_messages')
        .select('content, direction, created_at')
        .eq('contact_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { count: unreadCount } = await supabase
        .from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', c.id)
        .eq('direction', 'incoming')
        .eq('read_receipt', false);

      return {
        ...c,
        last_message: lastMsg?.content || '',
        last_message_direction: lastMsg?.direction || 'incoming',
        last_message_at: lastMsg?.created_at || c.last_contact,
        unread_count: unreadCount || 0,
      };
    })
  );

  return NextResponse.json({ data: conversations });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/whatsapp/conversations');
