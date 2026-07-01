import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';
import { getRiskState } from '@/lib/whatsapp/anti-ban';
import { getSessionInfo } from '@/lib/whatsapp/baileys-client';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:metrics:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // Mensajes hoy
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: messagesToday } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', today.toISOString());

  // Mensajes entrantes hoy
  const { count: incomingToday } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('direction', 'incoming')
    .gte('created_at', today.toISOString());

  // Conversaciones activas (contactos con last_contact en las últimas 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count: activeConversations } = await supabase
    .from('whatsapp_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('last_contact', yesterday.toISOString());

  // Invitaciones hoy
  const risk = await getRiskState(storeId);
  const invitationsToday = risk.dailyInvitationCount;

  // Invitaciones por estado
  const { data: invByStatus } = await supabase
    .from('whatsapp_invitations')
    .select('status')
    .eq('store_id', storeId);

  const invitationsByStatus: Record<string, number> = {};
  (invByStatus || []).forEach(i => {
    invitationsByStatus[i.status] = (invitationsByStatus[i.status] || 0) + 1;
  });

  // Total contactos
  const { count: totalContacts } = await supabase
    .from('whatsapp_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);

  // Mensajes últimos 7 días (para gráfico)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { data: lastWeekMessages } = await supabase
    .from('whatsapp_messages')
    .select('direction, created_at')
    .eq('store_id', storeId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  // Agrupar por día
  const dailyStats: Array<{ date: string; incoming: number; outgoing: number }> = [];
  const dayMap: Record<string, { incoming: number; outgoing: number }> = {};
  (lastWeekMessages || []).forEach(m => {
    const day = m.created_at.split('T')[0];
    if (!dayMap[day]) dayMap[day] = { incoming: 0, outgoing: 0 };
    dayMap[day][m.direction as 'incoming' | 'outgoing']++;
  });
  Object.entries(dayMap).forEach(([date, counts]) => {
    dailyStats.push({ date, ...counts });
  });

  // Estado de conexión
  const sessionInfo = getSessionInfo(storeId);

  return NextResponse.json({
    data: {
      messagesToday: messagesToday || 0,
      incomingToday: incomingToday || 0,
      outgoingToday: (messagesToday || 0) - (incomingToday || 0),
      activeConversations: activeConversations || 0,
      invitationsToday,
      totalContacts: totalContacts || 0,
      riskLevel: risk.level,
      cooldownUntil: risk.cooldownUntil,
      connectionStatus: sessionInfo.status,
      phoneNumber: sessionInfo.phoneNumber,
      invitationsByStatus,
      dailyStats,
    }
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/whatsapp/metrics');
