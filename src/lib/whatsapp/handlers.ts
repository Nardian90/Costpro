/**
 * Message Handlers — Procesa eventos de Baileys y genera respuestas con GLM.
 *
 * Eventos manejados:
 * - messages.upsert: mensaje entrante → guardar → GLM → responder
 * - group-participants.update: alguien entró/salió del grupo → bienvenida
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { generateResponse, saveMessage } from './glm-orchestrator';
import { emitMessage, emitTyping, emitToStore } from '@/lib/whatsapp/realtime-server';

interface StoreContext {
  storeId: string;
  sock: WASocket;
}

/**
 * Procesa un mensaje entrante de WhatsApp.
 */
export async function handleIncomingMessage(ctx: StoreContext, message: WAMessage): Promise<void> {
  const { storeId, sock } = ctx;
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  // Extraer info del mensaje
  const remoteJid = message.key.remoteJid;
  if (!remoteJid) return;

  // Ignorar mensajes propios
  if (message.key.fromMe) return;

  // Extraer texto del mensaje
  const messageContent = message.message;
  const text =
    messageContent?.conversation ||
    messageContent?.extendedTextMessage?.text ||
    messageContent?.imageMessage?.caption ||
    '';

  if (!text.trim()) return; // Ignorar mensajes sin texto (imágenes, stickers, etc.)

  const isGroup = remoteJid.endsWith('@g.us');
  const phoneNumber = remoteJid.split('@')[0];
  const senderName = message.pushName || phoneNumber;

  logger.info('DATABASE', 'WHATSAPP_MESSAGE_INCOMING', {
    storeId, phoneNumber, isGroup, textPreview: text.substring(0, 50),
  });

  // Buscar o crear contacto
  let contactId: string | null = null;
  const { data: contact } = await admin
    .from('whatsapp_contacts')
    .select('id, is_banned')
    .eq('store_id', storeId)
    .eq('phone_number', phoneNumber)
    .single();

  if (contact) {
    contactId = contact.id;
    if (contact.is_banned) {
      logger.info('DATABASE', 'WHATSAPP_MESSAGE_SKIPPED_BANNED', { storeId, phoneNumber });
      return; // No responder a contactos baneados
    }
  } else {
    const { data: newContact } = await admin
      .from('whatsapp_contacts')
      .insert({ store_id: storeId, phone_number: phoneNumber, push_name: senderName })
      .select()
      .single();
    contactId = newContact?.id || null;
  }

  // Guardar mensaje entrante
  await saveMessage(storeId, contactId, phoneNumber, 'incoming', text);

  // FASE 5: Emitir evento realtime 'message_incoming' a todos los clientes
  // conectados al room de esta tienda. El dashboard y la vista de conversaciones
  // lo reciben y actualizan la UI sin polling.
  emitMessage(storeId, 'incoming', {
    contact_id: contactId,
    phone_number: phoneNumber,
    content: text,
    sender_name: senderName,
  });

  // Cargar config para verificar si el bot está activo
  const { data: config } = await admin
    .from('whatsapp_configs')
    .select('is_active, trigger_mode, trigger_keywords, group_jid')
    .eq('store_id', storeId)
    .single();

  if (!config?.is_active) return; // Bot inactivo

  // Verificar trigger mode
  if (isGroup) {
    // En grupos, verificar si el bot fue mencionado o si hay keyword
    if (config.trigger_mode === 'mention') {
      const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      const botJid = sock.user?.id;
      if (!mentioned || !botJid || !mentioned.includes(botJid)) return;
    } else if (config.trigger_mode === 'keyword') {
      const keywords: string[] = config.trigger_keywords
        ? JSON.parse(config.trigger_keywords)
        : [];
      if (!keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) return;
    }
    // trigger_mode === 'always' → responder siempre
  }
  // En chats privados, siempre responder (si is_active)

  // Generar respuesta con GLM
  // FASE 5: Emitir evento 'typing' para que el frontend muestre el indicador
  // 'escribiendo...' mientras GLM procesa la respuesta.
  emitTyping(storeId, contactId, phoneNumber);

  const response = await generateResponse(
    storeId,
    contactId,
    phoneNumber,
    text,
    senderName
  );

  // FASE 5: Emitir 'typing_stop' cuando GLM terminó de procesar.
  emitToStore(storeId, 'typing_stop', {
    contact_id: contactId,
    phone_number: phoneNumber,
    ts: Date.now(),
  });

  // Guardar respuesta saliente
  await saveMessage(
    storeId,
    contactId,
    phoneNumber,
    'outgoing',
    response.text,
    response.tokensUsed,
    response.responseTimeMs
  );

  // FASE 5: Emitir evento realtime 'message_outgoing' para que el dashboard
  // y la vista de conversaciones actualicen la UI sin polling.
  emitMessage(storeId, 'outgoing', {
    contact_id: contactId,
    phone_number: phoneNumber,
    content: response.text,
    tokens_used: response.tokensUsed,
    response_time_ms: response.responseTimeMs,
  });

  // Enviar respuesta por WhatsApp
  try {
    await sock.sendMessage(remoteJid, { text: response.text });
    logger.info('DATABASE', 'WHATSAPP_MESSAGE_OUTGOING', {
      storeId, phoneNumber, tokensUsed: response.tokensUsed,
    });
  } catch (error: any) {
    logger.error('DATABASE', 'WHATSAPP_SEND_FAILED', {
      storeId, phoneNumber, error: error.message,
    });
  }
}

/**
 * Maneja cuando alguien entra o sale del grupo.
 */
export async function handleGroupParticipantUpdate(
  ctx: StoreContext,
  event: { jid: string; participants: string[]; action: 'add' | 'remove' | 'promote' | 'demote' }
): Promise<void> {
  const { storeId, sock } = ctx;
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  if (event.action !== 'add') return; // Solo manejar entradas

  const { data: config } = await admin
    .from('whatsapp_configs')
    .select('welcome_enabled, welcome_message, group_jid')
    .eq('store_id', storeId)
    .single();

  if (!config?.welcome_enabled) return;
  if (config.group_jid !== event.jid) return; // No es el grupo configurado

  const welcomeMsg = config.welcome_message || '¡Bienvenido al grupo de ventas!';

  for (const participant of event.participants) {
    try {
      await sock.sendMessage(event.jid, {
        text: `${welcomeMsg}\n\nHola @${participant.split('@')[0]}, soy el asistente de la tienda. ¿En qué puedo ayudarte?`,
        mentions: [participant],
      });
      logger.info('DATABASE', 'WHATSAPP_WELCOME_SENT', { storeId, participant });

      // FASE 5: Emitir evento 'group_participant' para que la vista de grupo
      // actualice la lista de miembros en tiempo real.
      emitToStore(storeId, 'group_participant', {
        jid: event.jid,
        participants: event.participants,
        action: event.action,
        ts: Date.now(),
      });
    } catch (error: any) {
      logger.error('DATABASE', 'WHATSAPP_WELCOME_FAILED', { storeId, participant, error: error.message });
    }
  }
}
