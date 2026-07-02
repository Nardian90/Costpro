import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';
import { getSocket } from '@/lib/whatsapp/baileys-client';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:group:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // Cargar config del grupo
  const { data: config } = await supabase
    .from('whatsapp_configs')
    .select('group_jid, group_name, bot_is_admin, welcome_enabled, welcome_message')
    .eq('store_id', storeId)
    .single();

  if (!config?.group_jid) {
    return NextResponse.json({ data: { config: config || null, participants: [] } });
  }

  // Obtener participantes del grupo via Baileys si está conectado
  let participants: Array<{ id: string; name?: string; isAdmin: boolean }> = [];
  const sock = getSocket(storeId);
  if (sock) {
    try {
      const groupMetadata = await sock.groupMetadata(config.group_jid);
      participants = groupMetadata.participants.map(p => ({
        id: p.id,
        name: p.name || p.id.split('@')[0],
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
      }));
    } catch {
      // Sin conexión o grupo no encontrado
    }
  }

  return NextResponse.json({
    data: {
      config,
      participants,
    }
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/whatsapp/group');
