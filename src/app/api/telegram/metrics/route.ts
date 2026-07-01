import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * GET /api/telegram/metrics?store_id=UUID
 * Métricas para el dashboard: mensajes hoy, conversaciones, invitations, etc.
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Mensajes hoy
  const { count: messagesToday } = await admin
    .from('telegram_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', todayIso);

  const { count: incomingToday } = await admin
    .from('telegram_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('direction', 'incoming')
    .gte('created_at', todayIso);

  const { count: outgoingToday } = await admin
    .from('telegram_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('direction', 'outgoing')
    .gte('created_at', todayIso);

  // Contactos con last_contact hoy = conversaciones activas
  const { count: activeConversations } = await admin
    .from('telegram_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('last_contact', todayIso);

  const { count: totalContacts } = await admin
    .from('telegram_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);

  // Invitaciones hoy
  const { count: invitationsToday } = await admin
    .from('telegram_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', todayIso);

  // Invitaciones por estado
  const { data: invByStatus } = await admin
    .from('telegram_invitations')
    .select('status')
    .eq('store_id', storeId);

  const invitationsByStatus: Record<string, number> = {};
  for (const inv of invByStatus || []) {
    invitationsByStatus[inv.status] = (invitationsByStatus[inv.status] || 0) + 1;
  }

  // Bot status
  const { data: config } = await admin
    .from('telegram_configs')
    .select('is_active, bot_token')
    .eq('store_id', storeId)
    .maybeSingle();

  const botStatus = !config?.bot_token
    ? 'not_configured'
    : config.is_active
      ? 'active'
      : 'inactive';

  // Daily stats (últimos 7 días)
  const { data: dailyMessages } = await admin
    .from('telegram_messages')
    .select('direction, created_at')
    .eq('store_id', storeId)
    .gte('created_at', sevenDaysAgo);

  const dailyStats: Array<{ date: string; incoming: number; outgoing: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStr = day.toISOString().split('T')[0];
    const dayIncoming = (dailyMessages || []).filter(
      m => m.direction === 'incoming' && m.created_at.startsWith(dayStr)
    ).length;
    const dayOutgoing = (dailyMessages || []).filter(
      m => m.direction === 'outgoing' && m.created_at.startsWith(dayStr)
    ).length;
    dailyStats.push({ date: dayStr, incoming: dayIncoming, outgoing: dayOutgoing });
  }

  return NextResponse.json({
    data: {
      messagesToday: messagesToday || 0,
      incomingToday: incomingToday || 0,
      outgoingToday: outgoingToday || 0,
      activeConversations: activeConversations || 0,
      totalContacts: totalContacts || 0,
      invitationsToday: invitationsToday || 0,
      invitationsByStatus,
      botStatus,
      dailyStats,
    },
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/telegram/metrics');
