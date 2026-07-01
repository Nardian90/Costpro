/**
 * Invitation Queue — Worker que procesa invitaciones con anti-ban.
 *
 * Flujo de 5 estados:
 *   pending → pre_message_sent → waiting_response
 *     ├─ respuesta positiva → invited → accepted
 *     ├─ respuesta negativa → rejected
 *     ├─ sin respuesta 24h → expired
 *     └─ WhatsApp bloquea → blocked (trigger anti-ban)
 *
 * Se ejecuta cada 60s via setInterval.
 */

import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSocket } from './baileys-client';
import {
  canInviteNow, handleInvitationBlock, resetRiskIfStale,
  getRiskState, saveRiskState, LIMITS, type RiskState,
} from './anti-ban';
import { saveMessage } from './glm-orchestrator';

const PRE_MESSAGE_TEMPLATE = (name: string) =>
  `Hola ${name}! 👋 Vi que te interesa nuestro catálogo de productos. ¿Te gustaría que te añada a nuestro grupo de ventas de WhatsApp? Responde "sí" para unirte.`;

const ACTIVE_STORES = new Set<string>();
let queueInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Registra una tienda para que el worker procese sus invitaciones.
 */
export function registerStore(storeId: string): void {
  ACTIVE_STORES.add(storeId);
  if (!queueInterval) startQueue();
  logger.info('DATABASE', 'INVITATION_QUEUE_REGISTERED', { storeId });
}

/**
 * Desregistra una tienda.
 */
export function unregisterStore(storeId: string): void {
  ACTIVE_STORES.delete(storeId);
  logger.info('DATABASE', 'INVITATION_QUEUE_UNREGISTERED', { storeId });
}

/**
 * Inicia el worker de cola. Procesa cada 60s.
 */
function startQueue(): void {
  queueInterval = setInterval(async () => {
    for (const storeId of ACTIVE_STORES) {
      await processStoreQueue(storeId).catch(err =>
        logger.error('DATABASE', 'INVITATION_QUEUE_ERROR', { storeId, error: err.message })
      );
    }
  }, 60_000);
  logger.info('DATABASE', 'INVITATION_QUEUE_STARTED', { intervalMs: 60_000 });
}

/**
 * Procesa la cola de invitaciones de una tienda.
 */
async function processStoreQueue(storeId: string): Promise<void> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  // 1. Cargar y resetear risk state
  let riskState = await getRiskState(storeId);
  riskState = resetRiskIfStale(riskState);

  // 2. Procesar invitaciones expiradas (waiting_response > 24h)
  const expiryThreshold = new Date(Date.now() - LIMITS.preMessageTimeoutHours * 60 * 60 * 1000);
  await admin
    .from('whatsapp_invitations')
    .update({ status: 'expired', expires_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('status', 'waiting_response')
    .lt('sent_at', expiryThreshold.toISOString());

  // 3. Si hay cooldown activo, no procesar
  const check = canInviteNow(riskState.dailyInvitationCount, riskState.lastInvitationAt, riskState);
  if (!check.allowed) return;

  // 4. Buscar siguiente invitación pendiente
  const { data: pending } = await admin
    .from('whatsapp_invitations')
    .select('id, phone_number, name, contact_id, status')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!pending || pending.length === 0) return;

  const invitation = pending[0];

  // 5. Enviar pre-mensaje
  const sock = getSocket(storeId);
  if (!sock) {
    logger.warn('DATABASE', 'INVITATION_NO_SOCKET', { storeId, invitationId: invitation.id });
    return;
  }

  const jid = `${invitation.phone_number}@s.whatsapp.net`;
  const preMessage = PRE_MESSAGE_TEMPLATE(invitation.name || invitation.phone_number);

  try {
    await sock.sendMessage(jid, { text: preMessage });

    // Guardar pre-mensaje en BD
    await saveMessage(storeId, invitation.contact_id, invitation.phone_number, 'outgoing', preMessage);

    // Actualizar invitación a pre_message_sent
    await admin
      .from('whatsapp_invitations')
      .update({
        status: 'pre_message_sent',
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + LIMITS.preMessageTimeoutHours * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', invitation.id);

    // Actualizar risk state
    riskState.dailyInvitationCount += 1;
    riskState.lastInvitationAt = new Date();
    await saveRiskState(storeId, riskState);

    logger.info('DATABASE', 'INVITATION_PRE_MESSAGE_SENT', {
      storeId, invitationId: invitation.id, phone: invitation.phone_number,
    });
  } catch (error: any) {
    // Detectar si es un bloqueo
    const isBlock = error.message?.includes('blocked') ||
                    error.message?.includes('eligibility') ||
                    error.message?.includes('forbidden');

    if (isBlock) {
      // Marcar como blocked y activar anti-ban
      riskState = handleInvitationBlock(riskState);
      await saveRiskState(storeId, riskState);

      await admin
        .from('whatsapp_invitations')
        .update({ status: 'blocked', response_at: new Date().toISOString() })
        .eq('id', invitation.id);

      logger.error('DATABASE', 'INVITATION_BLOCKED', {
        storeId, invitationId: invitation.id, riskLevel: riskState.level,
      });
    } else {
      // Error transitorio — dejar en pending para reintentar
      logger.error('DATABASE', 'INVITATION_SEND_ERROR', {
        storeId, invitationId: invitation.id, error: error.message,
      });
    }
  }
}

/**
 * Verifica respuestas a pre-mensajes y procesa invitaciones confirmadas.
 * Se llama desde handlers.ts cuando llega un mensaje de un contacto con
 * invitación en estado 'pre_message_sent' o 'waiting_response'.
 */
export async function checkInvitationResponse(
  storeId: string,
  phoneNumber: string,
  responseText: string
): Promise<void> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  // Buscar invitación activa para este contacto
  const { data: invitation } = await admin
    .from('whatsapp_invitations')
    .select('id, status, name')
    .eq('store_id', storeId)
    .eq('phone_number', phoneNumber)
    .in('status', ['pre_message_sent', 'waiting_response'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invitation) return;

  const text = responseText.toLowerCase().trim();
  const isPositive = ['si', 'sí', 'claro', 'por supuesto', 'dale', 'ok', 'acepto', 'quiero'].some(
    w => text.includes(w)
  );
  const isNegative = ['no', 'nunca', 'gracias no', 'no gracias', 'rechazo'].some(
    w => text === w || text.startsWith(w)
  );

  if (isPositive) {
    // Invitar al grupo
    const { data: config } = await admin
      .from('whatsapp_configs')
      .select('group_jid')
      .eq('store_id', storeId)
      .single();

    if (!config?.group_jid) {
      logger.warn('DATABASE', 'INVITATION_NO_GROUP', { storeId });
      return;
    }

    const sock = getSocket(storeId);
    if (!sock) return;

    try {
      await sock.groupParticipantsUpdate(config.group_jid, [`${phoneNumber}@s.whatsapp.net`], 'add');
      await admin
        .from('whatsapp_invitations')
        .update({ status: 'invited', response_at: new Date().toISOString() })
        .eq('id', invitation.id);

      logger.info('DATABASE', 'INVITATION_USER_INVITED', { storeId, phone: phoneNumber });
    } catch (error: any) {
      // Si WhatsApp bloquea la invitación al grupo
      if (error.message?.includes('blocked') || error.message?.includes('403')) {
        let riskState = await getRiskState(storeId);
        riskState = handleInvitationBlock(riskState);
        await saveRiskState(storeId, riskState);

        await admin
          .from('whatsapp_invitations')
          .update({ status: 'blocked', response_at: new Date().toISOString() })
          .eq('id', invitation.id);
      }
    }
  } else if (isNegative) {
    await admin
      .from('whatsapp_invitations')
      .update({ status: 'rejected', response_at: new Date().toISOString() })
      .eq('id', invitation.id);

    logger.info('DATABASE', 'INVITATION_REJECTED', { storeId, phone: phoneNumber });
  }
  // Si no es ni positivo ni negativo, dejar en waiting_response (timeout expirará)
}
