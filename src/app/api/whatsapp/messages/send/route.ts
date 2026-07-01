import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { saveMessage } from '@/lib/whatsapp/glm-orchestrator';
import { getSocket } from '@/lib/whatsapp/baileys-client';

const sendSchema = z.object({
  store_id: z.string().uuid(),
  phone_number: z.string().min(5),
  message: z.string().min(1).max(4096),
  contact_id: z.string().uuid().optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:send:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = sendSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
  }

  const { store_id, phone_number, message, contact_id } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // Guardar mensaje en BD
  await saveMessage(store_id, contact_id || null, phone_number, 'outgoing', message);

  // Enviar por WhatsApp si hay sesión activa
  const sock = getSocket(store_id);
  if (sock) {
    const jid = phone_number.includes('@') ? phone_number : `${phone_number}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, { text: message });
      return NextResponse.json({ success: true, sent: true });
    } catch (error: any) {
      return NextResponse.json({ success: false, sent: false, error: error.message }, { status: 500 });
    }
  }

  // Sin sesión activa — solo se guardó en BD
  return NextResponse.json({ success: true, sent: false, message: 'Mensaje guardado pero WhatsApp no conectado' });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/messages/send');
