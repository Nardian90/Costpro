/**
 * Telegram Handlers — Fase T3
 *
 * Procesa los Updates de Telegram despachados por webhook-handler.ts.
 *
 * Handlers:
 *   - handleMessageIncoming: mensaje entrante → guardar → GLM → responder
 *   - handleCallbackQuery: botón inline presionado (invitations accept/reject)
 *   - handleMyChatMember: bot añadido/expulsado de grupo
 *
 * Diferencias con WhatsApp/handlers.ts:
 *   - En grupos, Telegram usa entities (mentions) en vez de contextInfo
 *   - Invitations usan callback_query (botones) en vez de detección de texto
 *   - sendChatAction('typing') para el indicador "escribiendo..." (server-side)
 *   - Sin sistema anti-ban (Telegram no banea bots oficiales)
 */

import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { generateResponse, saveMessage } from './glm-orchestrator';
import { sendMessage, sendChatAction, answerCallbackQuery, editMessageText, addChatMember } from './bot-client';
import { emitMessage, emitTyping, emitTypingStop, emitGroupParticipant } from './realtime';
import { rateLimitByTelegramUser, isFlooding } from './security';
import type { TelegramUpdate, TelegramConfig, TelegramMediaType } from '@/types/telegram';
import { extractMediaFromMessage } from '@/types/telegram';

/**
 * Procesa un mensaje entrante de Telegram.
 *
 * Flujo:
 *   1. Extraer texto del update
 *   2. Buscar config del bot (incluyendo store_id y bot_token)
 *   3. Buscar/crear contacto por telegram_user_id
 *   4. Guardar mensaje entrante
 *   5. Verificar is_active
 *   6. Evaluar trigger_mode (mention/keyword/always)
 *   7. Enviar chat action 'typing'
 *   8. Generar respuesta con GLM
 *   9. Guardar mensaje saliente
 *  10. Enviar respuesta via sendMessage
 */
export async function handleMessageIncoming(
  update: TelegramUpdate,
  config: TelegramConfig
): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  // 1. Extraer info
  const fromUser = msg.from;
  const chat = msg.chat;
  if (!fromUser || !chat) return;

  // Ignorar mensajes del propio bot
  if (fromUser.is_bot) return;

  // Fase T9: extraer texto Y multimedia
  // - msg.text: mensaje de texto plano
  // - msg.caption: caption de fotos/documentos/videos
  // - msg.photo/document/voice/etc: multimedia
  const text = msg.text || '';
  const media = extractMediaFromMessage(msg);

  // Si no hay texto ni multimedia, ignorar (mensajes del sistema, etc.)
  if (!text.trim() && !media) return;

  const storeId = config.store_id;
  const botToken = config.bot_token;
  const botUserId = config.bot_user_id;
  const isGroup = chat.type === 'group' || chat.type === 'supergroup';
  const telegramUserId = fromUser.id;
  const senderName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || fromUser.username || String(telegramUserId);

  logger.info('DATABASE', 'TELEGRAM_MESSAGE_INCOMING', {
    storeId, telegramUserId, isGroup,
    textPreview: text.substring(0, 50),
    mediaType: media?.type || null,
    hasCaption: !!media?.caption,
  });

  // 3. Buscar/crear contacto
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  let contactId: string | null = null;
  const { data: contact } = await admin
    .from('telegram_contacts')
    .select('id, is_banned')
    .eq('store_id', storeId)
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  if (contact) {
    contactId = contact.id;
    if (contact.is_banned) {
      logger.info('DATABASE', 'TELEGRAM_MESSAGE_SKIPPED_BANNED', { storeId, telegramUserId });
      return;
    }
  } else {
    const { data: newContact } = await admin
      .from('telegram_contacts')
      .insert({
        store_id: storeId,
        telegram_user_id: telegramUserId,
        username: fromUser.username || null,
        first_name: fromUser.first_name || null,
        last_name: fromUser.last_name || null,
      })
      .select()
      .single();
    contactId = newContact?.id || null;
  }

  // 4. Guardar mensaje entrante
  // Fase T9: si hay multimedia, guardar media_type + file_id + caption
  // El "content" del mensaje es: texto si existe, sino caption, sino descripción del tipo
  const messageContent = text || media?.caption || (media ? `[${media.type}]` : '');
  await saveMessage(storeId, contactId, telegramUserId, 'incoming', messageContent, {
    telegramMessageId: msg.message_id,
    telegramChatId: chat.id,
    raw: update as unknown as Record<string, unknown>,
    // Fase T9: campos multimedia
    mediaType: media?.type,
    fileId: media?.info.file_id || undefined,
    fileSize: media?.info.file_size,
    mimeType: media?.info.mime_type,
    caption: media?.caption || undefined,
  });

  // Fase T6: Emitir evento realtime 'message_incoming'
  await emitMessage(storeId, 'incoming', {
    contact_id: contactId,
    telegram_user_id: telegramUserId,
    chat_id: chat.id,
    content: messageContent,
    sender_name: senderName,
  });

  // 5. Verificar is_active
  if (!config.is_active) return;

  // Fase T7: Anti-spam — rate-limit por usuario + flood detection
  const rl = rateLimitByTelegramUser(telegramUserId);
  if (!rl.allowed) {
    logger.info('DATABASE', 'TELEGRAM_USER_RATE_LIMITED', {
      storeId, telegramUserId, remaining: rl.remaining,
    });
    // No respondemos — Telegram cuenta respuestas como mensajes del bot
    // y podríamos exceder el límite de 30 msg/seg. Silencio es mejor.
    return;
  }
  if (isFlooding(telegramUserId)) {
    // Flood detectado — ban automático temporal (no responde por 5 min)
    logger.warn('DATABASE', 'TELEGRAM_FLOOD_AUTO_BAN', { storeId, telegramUserId });
    try {
      await sendMessage(
        botToken, chat.id,
        '⚠️ Estás enviando demasiados mensajes. Espera unos minutos antes de continuar.'
      );
    } catch {}
    return;
  }

  // 6. Evaluar trigger_mode en grupos
  if (isGroup) {
    if (config.trigger_mode === 'mention') {
      // Verificar si el bot fue mencionado
      const mentioned = msg.entities?.some(
        e => e.type === 'mention' && e.user?.id === botUserId
      ) || msg.text?.includes(`@${config.bot_username}`);
      if (!mentioned) return;
    } else if (config.trigger_mode === 'keyword') {
      const keywords: string[] = config.trigger_keywords || [];
      if (keywords.length === 0 || !keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) return;
    }
    // trigger_mode === 'always' → responder siempre
  }

  // 7. Enviar chat action 'typing'
  try {
    await sendChatAction(botToken, chat.id, 'typing');
  } catch (err: any) {
    logger.warn('DATABASE', 'TELEGRAM_CHAT_ACTION_FAILED', { error: err.message });
  }

  // Fase T6: Emitir 'typing' para que el frontend muestre "escribiendo..."
  await emitTyping(storeId, contactId, telegramUserId);

  // 8. Generar respuesta con GLM
  // Fase T9: pasar contexto multimedia para enriquecer system prompt
  const response = await generateResponse(
    storeId,
    contactId,
    telegramUserId,
    text || media?.caption || '',
    senderName,
    media ? {
      type: media.type,
      caption: media.caption,
      fileName: media.info.file_name,
      duration: media.info.duration,
    } : undefined
  );

  // Fase T6: Emitir 'typing_stop' cuando GLM terminó
  await emitTypingStop(storeId, contactId, telegramUserId);

  // 9. Guardar mensaje saliente
  await saveMessage(storeId, contactId, telegramUserId, 'outgoing', response.text, {
    telegramChatId: chat.id,
    tokensUsed: response.tokensUsed,
    responseTimeMs: response.responseTimeMs,
  });

  // Fase T6: Emitir evento realtime 'message_outgoing'
  await emitMessage(storeId, 'outgoing', {
    contact_id: contactId,
    telegram_user_id: telegramUserId,
    chat_id: chat.id,
    content: response.text,
    tokens_used: response.tokensUsed,
    response_time_ms: response.responseTimeMs,
  });

  // 10. Enviar respuesta via Telegram
  try {
    await sendMessage(botToken, chat.id, response.text);
    logger.info('DATABASE', 'TELEGRAM_MESSAGE_OUTGOING', {
      storeId, telegramUserId, tokensUsed: response.tokensUsed,
    });
  } catch (error: any) {
    logger.error('DATABASE', 'TELEGRAM_SEND_FAILED', {
      storeId, telegramUserId, error: error.message,
    });
  }
}

/**
 * Procesa un callback_query (botón inline presionado).
 *
 * Para invitations:
 *   - data='accept' → añadir al grupo, marcar como 'invited'
 *   - data='reject' → marcar como 'rejected'
 *   - data='cancel' → eliminar mensaje
 *
 * Para otros callbacks (Fase T9): menús personalizados, etc.
 */
export async function handleCallbackQuery(
  update: TelegramUpdate,
  config: TelegramConfig
): Promise<void> {
  const cq = update.callback_query;
  if (!cq || !cq.message) return;

  const fromUser = cq.from;
  const chat = cq.message.chat;
  const data = cq.data;
  const messageId = cq.message.message_id;

  const storeId = config.store_id;
  const botToken = config.bot_token;
  const telegramUserId = fromUser.id;

  logger.info('DATABASE', 'TELEGRAM_CALLBACK_QUERY', {
    storeId, telegramUserId, data, messageId,
  });

  // Buscar invitation activa para este usuario
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    await answerCallbackQuery(botToken, cq.id, 'Error interno');
    return;
  }

  const { data: invitation } = await admin
    .from('telegram_invitations')
    .select('id, status')
    .eq('store_id', storeId)
    .eq('telegram_user_id', telegramUserId)
    .in('status', ['pre_message_sent', 'waiting_response'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invitation) {
    await answerCallbackQuery(botToken, cq.id, 'No hay invitación activa');
    return;
  }

  if (data === 'accept') {
    // Añadir al grupo
    if (!config.group_chat_id) {
      await answerCallbackQuery(botToken, cq.id, '⚠️ Grupo no configurado', true);
      return;
    }

    try {
      await addChatMember(botToken, config.group_chat_id, telegramUserId);

      await admin
        .from('telegram_invitations')
        .update({
          status: 'invited',
          response_at: new Date().toISOString(),
        })
        .eq('id', invitation.id);

      // Editar el mensaje para quitar los botones
      await editMessageText(
        botToken,
        chat.id,
        messageId,
        '✅ ¡Te has unido al grupo de ventas! Ya puedes ver los productos y ofertas.'
      );

      await answerCallbackQuery(botToken, cq.id, '¡Bienvenido al grupo!');
      logger.info('DATABASE', 'TELEGRAM_INVITATION_ACCEPTED', { storeId, telegramUserId });
    } catch (err: any) {
      // Si addChatMember falla (requiere join request), enviar invite link
      logger.warn('DATABASE', 'TELEGRAM_ADD_MEMBER_FAILED', {
        storeId, telegramUserId, error: err.message,
      });

      await admin
        .from('telegram_invitations')
        .update({
          status: 'failed',
          response_at: new Date().toISOString(),
        })
        .eq('id', invitation.id);

      await editMessageText(
        botToken,
        chat.id,
        messageId,
        '⚠️ No pude añadirte directamente. Pídele al admin del grupo que te envíe un link de invitación.'
      );
      await answerCallbackQuery(botToken, cq.id, 'Error al añadirte', true);
    }
  } else if (data === 'reject') {
    await admin
      .from('telegram_invitations')
      .update({
        status: 'rejected',
        response_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    await editMessageText(
      botToken,
      chat.id,
      messageId,
      '✅ Entendido, no te invitaré al grupo. Si cambias de opinión, puedes decírmelo cuando quieras.'
    );

    await answerCallbackQuery(botToken, cq.id, 'Invitación rechazada');
    logger.info('DATABASE', 'TELEGRAM_INVITATION_REJECTED', { storeId, telegramUserId });
  } else {
    await answerCallbackQuery(botToken, cq.id, 'Acción no reconocida');
  }
}

/**
 * Procesa cambios en membresía del bot (añadido/expulsado de grupo).
 * Actualiza bot_is_admin, group_chat_id, group_title en config.
 */
export async function handleMyChatMember(
  update: TelegramUpdate,
  config: TelegramConfig
): Promise<void> {
  const mcm = update.my_chat_member;
  if (!mcm) return;

  const newStatus = mcm.new_chat_member.status;
  const chatId = mcm.chat.id;
  const chatTitle = mcm.chat.title || null;

  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  // Si el bot fue añadido como admin, actualizar config
  if (newStatus === 'administrator' || newStatus === 'member') {
    const isAdmin = newStatus === 'administrator';
    await admin
      .from('telegram_configs')
      .update({
        group_chat_id: chatId,
        group_title: chatTitle,
        bot_is_admin: isAdmin,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', config.store_id);

    // Fase T6: Emitir evento group_participant (bot joined)
    await emitGroupParticipant(config.store_id, {
      chat_id: chatId,
      user_id: config.bot_user_id || 0,
      username: config.bot_username,
      action: 'join',
    });

    logger.info('DATABASE', 'TELEGRAM_BOT_ADDED_TO_GROUP', {
      storeId: config.store_id, chatId, isAdmin,
    });
  } else if (newStatus === 'left' || newStatus === 'kicked') {
    // Bot fue expulsado, limpiar group_chat_id
    await admin
      .from('telegram_configs')
      .update({
        group_chat_id: null,
        group_title: null,
        bot_is_admin: false,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', config.store_id);

    logger.info('DATABASE', 'TELEGRAM_BOT_REMOVED_FROM_GROUP', {
      storeId: config.store_id, chatId,
    });
  }
}


