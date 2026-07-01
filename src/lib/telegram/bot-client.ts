/**
 * Telegram Bot Client — Fase T2
 *
 * Wrapper HTTP a la Telegram Bot API. Cada método es una petición POST/GET
 * a `https://api.telegram.org/bot{token}/{method}`. Sin estado, sin conexión
 * persistente — 100% serverless-compatible (Vercel).
 *
 * Diferencia fundamental con WhatsApp/Baileys:
 *   - WhatsApp mantiene un WebSocket largo a los servidores de WhatsApp.
 *   - Telegram es webhook-based: Telegram nos llama cuando hay un Update.
 *   - Para enviar mensajes, hacemos una petición HTTP y listo.
 *
 * Límites de Telegram Bot API:
 *   - 30 mensajes/segundo a chats distintos
 *   - 1 mensaje/segundo al mismo chat
 *   - 20 mensajes/minuto al mismo grupo
 *   - Sin límite diario
 */

import { logger } from '@/lib/logger';
import type {
  TelegramBotInfo,
  TelegramChatInfo,
  TelegramChatMember,
  TelegramMessageUpdate,
} from '@/types/telegram';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    migrate_to_chat_id?: number;
    retry_after?: number;
  };
}

/**
 * Ejecuta una llamada a la Telegram Bot API.
 * Lanza Error con el description de Telegram si `ok: false`.
 */
async function callTelegramApi<T>(
  botToken: string,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

  const hasParams = params && Object.keys(params).length > 0;
  const init: RequestInit = hasParams
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }
    : { method: 'GET' };

  try {
    const res = await fetch(url, init);
    const json = (await res.json()) as TelegramApiResponse<T>;

    if (!json.ok) {
      const errMsg = `Telegram API error ${json.error_code || '?'}: ${json.description || 'Unknown'}`;
      logger.error('DATABASE', 'TELEGRAM_API_ERROR', {
        method, error_code: json.error_code, description: json.description,
      });
      throw new Error(errMsg);
    }

    return json.result as T;
  } catch (error: any) {
    if (error instanceof Error && error.message.startsWith('Telegram API error')) {
      throw error;
    }
    logger.error('DATABASE', 'TELEGRAM_API_NETWORK_ERROR', {
      method, error: error.message,
    });
    throw new Error(`Network error calling Telegram ${method}: ${error.message}`);
  }
}

// ── Métodos del Bot Client ─────────────────────────────────────────────

/**
 * Valida el bot token y obtiene info del bot.
 * Se invoca al configurar el bot en TelegramConfigView.
 */
export async function getBotInfo(botToken: string): Promise<TelegramBotInfo> {
  return callTelegramApi<TelegramBotInfo>(botToken, 'getMe');
}

/**
 * Registra el webhook en Telegram.
 * Telegram empezará a mandar POST a `webhookUrl` cuando lleguen updates.
 *
 * @param botToken Token del bot
 * @param webhookUrl URL pública (https) que recibirá los webhooks
 * @param secret Token secreto que Telegram enviará en header X-Telegram-Bot-Api-Secret-Token
 */
export async function setWebhook(
  botToken: string,
  webhookUrl: string,
  secret: string
): Promise<{ url: string; has_custom_certificate: boolean; pending_update_count: number }> {
  return callTelegramApi(botToken, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: JSON.stringify([
      'message',
      'edited_message',
      'callback_query',
      'my_chat_member',
    ]),
    drop_pending_updates: true,
  });
}

/**
 * Elimina el webhook. Telegram deja de mandar updates.
 */
export async function deleteWebhook(botToken: string): Promise<boolean> {
  return callTelegramApi<boolean>(botToken, 'deleteWebhook', {
    drop_pending_updates: true,
  });
}

/**
 * Obtiene info del webhook registrado.
 */
export async function getWebhookInfo(botToken: string): Promise<{
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
}> {
  return callTelegramApi(botToken, 'getWebhookInfo');
}

/**
 * Envía un mensaje de texto a un chat.
 */
export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'MarkdownV2';
    reply_markup?: Record<string, unknown>;
    reply_to_message_id?: number;
    disable_web_page_preview?: boolean;
  }
): Promise<TelegramMessageUpdate> {
  return callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    ...options,
  });
}

/**
 * Edita el texto de un mensaje enviado por el bot.
 * Útil para actualizar el mensaje de invitación tras callback_query.
 */
export async function editMessageText(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'MarkdownV2';
    reply_markup?: Record<string, unknown>;
  }
): Promise<boolean> {
  return callTelegramApi(botToken, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...options,
  });
}

/**
 * Responde a un callback_query (botón inline).
 * Obligatorio para que Telegram deje el "loading" spinner.
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert?: boolean
): Promise<boolean> {
  return callTelegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

/**
 * Obtiene info de un chat (grupo, canal, o privado).
 */
export async function getChat(botToken: string, chatId: number): Promise<TelegramChatInfo> {
  return callTelegramApi(botToken, 'getChat', { chat_id: chatId });
}

/**
 * Obtiene info de un miembro de un chat.
 */
export async function getChatMember(
  botToken: string,
  chatId: number,
  userId: number
): Promise<TelegramChatMember> {
  return callTelegramApi(botToken, 'getChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
}

/**
 * Obtiene el número de miembros de un chat (grupo).
 */
export async function getChatMemberCount(botToken: string, chatId: number): Promise<number> {
  return callTelegramApi<number>(botToken, 'getChatMemberCount', { chat_id: chatId });
}

/**
 * Añade un usuario a un grupo (si el bot es admin con permiso can_invite_users).
 */
export async function addChatMember(
  botToken: string,
  chatId: number,
  userId: number
): Promise<boolean> {
  return callTelegramApi(botToken, 'addChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
}

/**
 * Envía un "chat action" (typing, upload_photo, etc).
 * Muestra "escribiendo..." en el chat del destinatario.
 * Dura 5 segundos o hasta que se envíe un mensaje.
 */
export async function sendChatAction(
  botToken: string,
  chatId: number,
  action: 'typing' | 'upload_photo' | 'record_video' | 'upload_video' | 'record_voice' | 'upload_voice' | 'upload_document' | 'find_location'
): Promise<boolean> {
  return callTelegramApi(botToken, 'sendChatAction', {
    chat_id: chatId,
    action,
  });
}

/**
 * Crea un invite link para un grupo.
 */
export async function createChatInviteLink(
  botToken: string,
  chatId: number,
  options?: {
    expire_date?: number;
    member_limit?: number;
    name?: string;
  }
): Promise<{ invite_link: string; creator: unknown; creates_join_request: boolean; is_primary: boolean; is_revoked: boolean }> {
  return callTelegramApi(botToken, 'createChatInviteLink', {
    chat_id: chatId,
    ...options,
  });
}
