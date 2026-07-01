import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getBotInfo, getWebhookInfo, getChat, getChatMember } from '@/lib/telegram/bot-client';

/**
 * GET /api/telegram/status?store_id=UUID
 * Devuelve el estado del bot: configurado, activo, webhook info, grupo info.
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
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();

  if (!config || !config.bot_token) {
    return NextResponse.json({
      data: { configured: false, is_active: false, bot_username: null },
    });
  }

  // Webhook info en vivo
  let webhookInfo = null;
  try {
    webhookInfo = await getWebhookInfo(config.bot_token);
  } catch {}

  // Grupo info en vivo (si hay group_chat_id)
  let groupInfo = null;
  let botIsAdmin = false;
  if (config.group_chat_id && config.bot_user_id) {
    try {
      groupInfo = await getChat(config.bot_token, config.group_chat_id);
      const member = await getChatMember(config.bot_token, config.group_chat_id, config.bot_user_id);
      botIsAdmin = member.status === 'administrator' || member.status === 'creator';
    } catch {}
  }

  return NextResponse.json({
    data: {
      configured: true,
      is_active: config.is_active,
      bot_username: config.bot_username,
      bot_user_id: config.bot_user_id,
      webhook_url: config.webhook_url,
      webhook_registered_at: config.webhook_registered_at,
      webhook_pending_updates: webhookInfo?.pending_update_count || 0,
      webhook_last_error: webhookInfo?.last_error_message || null,
      group_chat_id: config.group_chat_id,
      group_title: groupInfo?.title || config.group_title,
      bot_is_admin: botIsAdmin,
    },
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/telegram/status');
