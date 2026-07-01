import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getChat, getChatMember, getChatMemberCount } from '@/lib/telegram/bot-client';

/**
 * GET /api/telegram/group?store_id=UUID
 * Info del grupo de ventas: título, member count, si el bot es admin.
 * No podemos enumerar miembros de un grupo via Bot API (Telegram no lo permite
 * por privacidad), así que devolvemos count + bot status.
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

  const { data: config } = await admin
    .from('telegram_configs')
    .select('bot_token, bot_user_id, group_chat_id, group_title, bot_is_admin, welcome_enabled, welcome_message')
    .eq('store_id', storeId)
    .maybeSingle();

  if (!config || !config.bot_token) {
    return NextResponse.json({ error: 'Bot no configurado' }, { status: 404 });
  }

  if (!config.group_chat_id) {
    return NextResponse.json({
      data: {
        configured: false,
        group_chat_id: null,
        group_title: null,
        member_count: 0,
        bot_is_admin: false,
        welcome_enabled: config.welcome_enabled,
        welcome_message: config.welcome_message,
      },
    });
  }

  let groupInfo = null;
  let memberCount = 0;
  let botIsAdmin = false;

  try {
    groupInfo = await getChat(config.bot_token, config.group_chat_id);
    memberCount = await getChatMemberCount(config.bot_token, config.group_chat_id);
    if (config.bot_user_id) {
      const member = await getChatMember(config.bot_token, config.group_chat_id, config.bot_user_id);
      botIsAdmin = member.status === 'administrator' || member.status === 'creator';
    }
  } catch (err: any) {
    return NextResponse.json({
      data: {
        configured: true,
        group_chat_id: config.group_chat_id,
        group_title: config.group_title,
        member_count: 0,
        bot_is_admin: false,
        error: err.message,
        welcome_enabled: config.welcome_enabled,
        welcome_message: config.welcome_message,
      },
    });
  }

  return NextResponse.json({
    data: {
      configured: true,
      group_chat_id: config.group_chat_id,
      group_title: groupInfo?.title || config.group_title,
      member_count: memberCount,
      bot_is_admin: botIsAdmin,
      welcome_enabled: config.welcome_enabled,
      welcome_message: config.welcome_message,
    },
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/telegram/group');
