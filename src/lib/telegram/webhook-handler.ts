/**
 * Telegram Webhook Handler — Fase T2
 *
 * Recibe el `Update` object de Telegram (POST a /api/telegram/webhook) y lo
 * despacha al handler adecuado según el tipo de update.
 *
 * Tipos de Update soportados (definidos en allowed_updates del setWebhook):
 *   - message: mensaje entrante (texto, comando, etc.)
 *   - edited_message: mensaje editado (ignoramos, solo logging)
 *   - callback_query: botón inline presionado (para invitations "Sí/No")
 *   - my_chat_member: cambios en membresía del bot (añadido/expulsado de grupo)
 *
 * Identificación de la tienda:
 *   - Cada bot tiene un token único → 1 bot por tienda.
 *   - El webhook recibe `bot_user_id` en el path o query param, busca en
 *     `telegram_configs.bot_user_id` para encontrar el `store_id`.
 *   - Alternativa: query param `?store_id=` en la URL del webhook (más simple
 *     para deploy pero menos seguro). Usamos `bot_user_id` porque Telegram no
 *     permite query params personalizados en la URL del webhook (sí permite,
 *     pero el secret_token ya es nuestro factor de auth).
 *
 * Resilencia:
 *   - Telegram reintenta si respondemos != 200. Debemos responder 200 rápido
 *     y procesar async (usando waitUntil de Vercel).
 *   - Si el handler falla, logueamos pero respondemos 200 para evitar reintentos
 *     infinitos (Telegram reintenta hasta 12 veces en 24h).
 */

import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import type { TelegramUpdate, TelegramConfig } from '@/types/telegram';

/**
 * Busca la configuración del bot (incluyendo store_id y bot_token) a partir
 * del bot_user_id. Se invoca en cada webhook para identificar a qué tienda
 * pertenece el update.
 */
export async function findConfigByBotUserId(botUserId: number): Promise<TelegramConfig | null> {
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    logger.error('DATABASE', 'TELEGRAM_WEBHOOK_NO_ADMIN', {});
    return null;
  }

  const { data, error } = await admin
    .from('telegram_configs')
    .select('*')
    .eq('bot_user_id', botUserId)
    .maybeSingle();

  if (error) {
    logger.error('DATABASE', 'TELEGRAM_CONFIG_LOOKUP_ERROR', {
      botUserId, error: error.message,
    });
    return null;
  }

  return data as TelegramConfig | null;
}

/**
 * Busca la configuración del bot por el bot_token (para validación inicial
 * en setup, antes de tener bot_user_id cacheado).
 */
export async function findConfigByBotToken(botToken: string): Promise<TelegramConfig | null> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return null;

  const { data } = await admin
    .from('telegram_configs')
    .select('*')
    .eq('bot_token', botToken)
    .maybeSingle();

  return data as TelegramConfig | null;
}

/**
 * Punto de entrada del webhook. Despacha el Update al handler adecuado.
 *
 * @param update El Update object de Telegram
 * @param config La config del bot ya resuelta por el webhook route (incluye
 *               store_id, bot_token, bot_user_id, etc.)
 *
 * Retorna void — el caller (route.ts) responde 200 a Telegram inmediatamente
 * y procesa async via waitUntil.
 *
 * Errores: se loguean pero NO se propagan (Telegram reintenta si respondemos
 * != 200, lo que puede causar procesamiento duplicado).
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  config: TelegramConfig
): Promise<void> {
  if (!update) {
    logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_EMPTY_UPDATE', {});
    return;
  }

  try {
    // DEBUG T9: log detallado del tipo de update recibido
    const updateType = update.message ? 'message'
      : update.callback_query ? 'callback_query'
      : update.my_chat_member ? 'my_chat_member'
      : update.edited_message ? 'edited_message'
      : 'unknown';
    logger.info('DATABASE', 'TELEGRAM_UPDATE_DEBUG', {
      update_id: update.update_id,
      type: updateType,
      has_text: !!update.message?.text,
      has_caption: !!update.message?.caption,
      has_photo: !!update.message?.photo,
      has_document: !!update.message?.document,
      chat_type: update.message?.chat?.type,
      chat_id: update.message?.chat?.id,
      from_id: update.message?.from?.id,
      is_bot: update.message?.from?.is_bot,
      text_preview: update.message?.text?.substring(0, 80),
    });

    if (update.message) {
      await handleMessageUpdate(update, config);
    } else if (update.callback_query) {
      await handleCallbackQueryUpdate(update, config);
    } else if (update.my_chat_member) {
      await handleMyChatMemberUpdate(update, config);
    } else if (update.edited_message) {
      logger.info('DATABASE', 'TELEGRAM_EDITED_MESSAGE_IGNORED', {
        update_id: update.update_id,
      });
    } else {
      logger.warn('DATABASE', 'TELEGRAM_UNKNOWN_UPDATE_TYPE', {
        update_id: update.update_id,
      });
    }
  } catch (error: any) {
    logger.error('DATABASE', 'TELEGRAM_WEBHOOK_HANDLER_ERROR', {
      update_id: update.update_id,
      error: error.message,
    });
  }
}

// ── Dispatchers (delegan a handlers.ts con config) ─────────────────────

async function handleMessageUpdate(update: TelegramUpdate, config: TelegramConfig): Promise<void> {
  const { handleMessageIncoming } = await import('./handlers');
  await handleMessageIncoming(update, config);
}

async function handleCallbackQueryUpdate(update: TelegramUpdate, config: TelegramConfig): Promise<void> {
  const { handleCallbackQuery } = await import('./handlers');
  await handleCallbackQuery(update, config);
}

async function handleMyChatMemberUpdate(update: TelegramUpdate, config: TelegramConfig): Promise<void> {
  const { handleMyChatMember } = await import('./handlers');
  await handleMyChatMember(update, config);
}
