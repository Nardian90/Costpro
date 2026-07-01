import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { saveMessage, validateContactBelongsToStore } from '@/lib/telegram/glm-orchestrator';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { sendMessage as tgSendMessage } from '@/lib/telegram/bot-client';
import { emitMessage } from '@/lib/telegram/realtime';

/**
 * POST /api/telegram/messages/send
 * Envío manual de mensaje a un contacto de Telegram.
 *
 * Aplica los mismos fixes que whatsapp/messages/send:
 *   - FIX-AUDIT-WA-2: valida contact_id↔store_id antes de usarlo
 *   - Rate-limit 20 req/min por usuario (no por bot — el límite de Telegram
 *     es 30 msg/seg global, suficiente)
 */
const sendSchema = z.object({
  store_id: z.string().uuid(),
  telegram_user_id: z.number().int(),
  message: z.string().min(1).max(4096),
  contact_id: z.string().uuid().optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`telegram:send:${session.user.id}`, {
    windowMs: 60_000, maxRequests: 20,
  });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = sendSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { store_id, telegram_user_id, message, contact_id } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // FIX-AUDIT-WA-2: validar contact_id↔store_id
  if (contact_id) {
    const belongs = await validateContactBelongsToStore(store_id, contact_id);
    if (!belongs) {
      return NextResponse.json(
        { ...createApiError('FORBIDDEN'), message: 'contact_id no pertenece a esta tienda' },
        { status: 403 }
      );
    }
  }

  // Guardar mensaje en BD
  await saveMessage(store_id, contact_id || null, telegram_user_id, 'outgoing', message);

  // Fase T6: Emitir evento realtime 'message_outgoing'
  await emitMessage(store_id, 'outgoing', {
    contact_id: contact_id || null,
    telegram_user_id,
    chat_id: null,
    content: message,
  });

  // Cargar bot_token para enviar via Telegram
  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data: config } = await admin
    .from('telegram_configs')
    .select('bot_token')
    .eq('store_id', store_id)
    .maybeSingle();

  if (!config?.bot_token) {
    return NextResponse.json({
      success: true, sent: false,
      message: 'Mensaje guardado pero bot no configurado',
    });
  }

  try {
    await tgSendMessage(config.bot_token, telegram_user_id, message);
    return NextResponse.json({ success: true, sent: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, sent: false, error: error.message },
      { status: 500 }
    );
  }
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/telegram/messages/send');
