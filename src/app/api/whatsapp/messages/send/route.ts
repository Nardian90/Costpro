import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { saveMessage, validateContactBelongsToStore } from '@/lib/whatsapp/glm-orchestrator';
import { getSocket } from '@/lib/whatsapp/baileys-client';
import { canInviteNow, getRiskState } from '@/lib/whatsapp/anti-ban';
import { emitMessage } from '@/lib/whatsapp/realtime-server';

const sendSchema = z.object({
  store_id: z.string().uuid(),
  phone_number: z.string().min(5),
  message: z.string().min(1).max(4096),
  contact_id: z.string().uuid().optional(),
});

/**
 * POST /api/whatsapp/messages/send
 *
 * Envía un mensaje saliente manual (no bot-initiated) a un contacto de WhatsApp.
 *
 * AUTORIZACIÓN Y ANTI-BAN (FIX-AUDIT-WA-2 + WA-4):
 *
 *  - canManageStore(session.user, store_id) valida membership (ya estaba).
 *  - FIX-AUDIT-WA-2: Si se pasa contact_id, validar que pertenece a store_id
 *    antes de aceptarlo. Esto cierra el hueco cross-tenant por el que un
 *    manager de la Tienda A podía inyectar mensajes en el historial del
 *    contacto de la Tienda B simplemente enviando su UUID.
 *
 *  - FIX-AUDIT-WA-4: Invocar canInviteNow() del sistema anti-ban antes de
 *    sock.sendMessage(). Antes, esta ruta solo tenía rate-limit de 20 req/min
 *    por usuario (28,800/día), lo que permitía tumbar el número baneado
 *    usando el bot manualmente sin tocar los límites (20/día, intervalo+jitter,
 *    horario laboral) que se construyeron específicamente para evitar eso en
 *    invitation-queue.ts. Ahora se aplica el mismo guard a todo envío saliente.
 *    El guard se aplica solo cuando hay socket activo (envío real a WhatsApp);
 *    el guardado en BD no está sujeto al anti-ban para no bloquear el logging
 *    de operaciones internas.
 */
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

  // FIX-AUDIT-WA-2: validar contact_id↔store_id antes de pasar a saveMessage.
  // saveMessage también tiene el check defensivo, pero validarlo aquí permite
  // rechazar la operación con 403 explícito (en vez de silenciosamente descartar
  // el contact_id y crear/reusar uno por phone_number).
  if (contact_id) {
    const belongs = await validateContactBelongsToStore(store_id, contact_id);
    if (!belongs) {
      return NextResponse.json(
        { ...createApiError('FORBIDDEN'), message: 'contact_id no pertenece a esta tienda' },
        { status: 403 }
      );
    }
  }

  // Guardar mensaje en BD (no sujeto a anti-ban — es solo logging)
  await saveMessage(store_id, contact_id || null, phone_number, 'outgoing', message);

  // FASE 5: Emitir evento realtime 'message_outgoing' para que el dashboard
  // y la vista de conversaciones actualicen la UI sin polling.
  emitMessage(store_id, 'outgoing', {
    contact_id: contact_id || null,
    phone_number,
    content: message,
  });

  // Enviar por WhatsApp si hay sesión activa
  const sock = getSocket(store_id);
  if (sock) {
    // FIX-AUDIT-WA-4: aplicar anti-ban antes de enviar. El sistema anti-ban
    // (canInviteNow) se construyó en Fase 3 para proteger el número de WhatsApp
    // de bloqueos por uso automatizado. Antes solo se invocaba desde
    // invitation-queue.ts; el envío manual por esta ruta lo bypassa, lo que
    // permite exceder los límites (20/día, intervalo, horario laboral) y
    // tumbar el número. Ahora cualquier envío saliente pasa por el mismo guard.
    const riskState = await getRiskState(store_id);
    const guard = canInviteNow(
      riskState.dailyInvitationCount,
      riskState.lastInvitationAt,
      riskState
    );
    if (!guard.allowed) {
      return NextResponse.json({
        success: false,
        sent: false,
        blocked_by_anti_ban: true,
        reason: guard.reason,
        next_allowed_at: guard.nextAllowedAt?.toISOString() || null,
      }, { status: 429 });
    }

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
