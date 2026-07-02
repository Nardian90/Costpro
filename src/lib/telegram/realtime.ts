/**
 * Telegram Realtime — Fase T6
 *
 * Reemplaza Socket.io (no funciona en Vercel serverless) con Supabase
 * Realtime channels. Usa el mismo cliente Supabase que ya está integrado.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ARQUITECTURA:
 * ─────────────────────────────────────────────────────────────────────
 * 1. Server-side (handlers.ts, route.ts): publica eventos a un channel
 *    de Supabase Realtime. Usa el cliente admin (service-role) para bypass
 *    de RLS en la publicación.
 *
 * 2. Client-side (useTelegramRealtime hook): se suscribe al channel
 *    `telegram:store:{storeId}` y recibe los eventos broadcast.
 *    Supabase valida la auth del cliente (JWT en supabase client) y la
 *    membership en la tienda via RLS en Realtime subscriptions.
 *
 * 3. Eventos: mismo contrato que WhatsApp Socket.io (message_incoming,
 *    message_outgoing, typing, typing_stop, group_participant, bot_status,
 *    metrics_update).
 *
 * ─────────────────────────────────────────────────────────────────────
 * DIFERENCIAS vs Socket.io:
 *   - No necesita custom server (funciona en Vercel)
 *   - No necesita auth middleware separado (Supabase auth ya está integrado)
 *   - No necesita rooms manuales (cada channel es un room)
 *   - Latencia ~50ms mayor (irrelevante para UX)
 *   - RLS automático: el cliente solo recibe eventos si tiene acceso a la tienda
 * ─────────────────────────────────────────────────────────────────────
 */

import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import type { TelegramEventName } from '@/types/telegram';

/**
 * Publica un evento a un channel de Supabase Realtime.
 *
 * Server-side only — usa el cliente admin (service-role) para bypass de
 * RLS en la publicación. Los clientes se suscriben con su propio JWT
 * y Supabase valida la membership antes de entregar el evento.
 *
 * Si Supabase no está configurado o falla, es no-op (no rompe el flujo principal).
 */
export async function emitToStore(
  storeId: string,
  event: TelegramEventName,
  payload: unknown
): Promise<void> {
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return;
  }

  try {
    const channel = admin.channel(`telegram:store:${storeId}`);
    await channel.send({
      type: 'broadcast',
      event,
      payload: { ...payload as object, store_id: storeId, ts: Date.now() },
    });
  } catch (err: any) {
    logger.warn('DATABASE', 'TELEGRAM_REALTIME_EMIT_FAILED', {
      storeId, event, error: err.message,
    });
  }
}

/**
 * Helpers para eventos comunes — mismo contrato que WhatsApp Socket.io.
 */

export async function emitMessage(
  storeId: string,
  direction: 'incoming' | 'outgoing',
  data: {
    contact_id: string | null;
    telegram_user_id: number;
    chat_id: number | null;
    content: string;
    sender_name?: string;
    tokens_used?: number;
    response_time_ms?: number;
  }
): Promise<void> {
  await emitToStore(storeId, `message_${direction}` as TelegramEventName, data);
}

export async function emitTyping(
  storeId: string,
  contactId: string | null,
  telegramUserId: number
): Promise<void> {
  await emitToStore(storeId, 'typing', {
    contact_id: contactId,
    telegram_user_id: telegramUserId,
  });
}

export async function emitTypingStop(
  storeId: string,
  contactId: string | null,
  telegramUserId: number
): Promise<void> {
  await emitToStore(storeId, 'typing_stop', {
    contact_id: contactId,
    telegram_user_id: telegramUserId,
  });
}

export async function emitGroupParticipant(
  storeId: string,
  data: {
    chat_id: number;
    user_id: number;
    username: string | null;
    action: 'join' | 'leave' | 'promote' | 'demote';
  }
): Promise<void> {
  await emitToStore(storeId, 'group_participant', data);
}

export async function emitBotStatus(
  storeId: string,
  status: 'active' | 'inactive' | 'webhook_registered' | 'webhook_removed',
  botUsername?: string
): Promise<void> {
  await emitToStore(storeId, 'bot_status', { status, bot_username: botUsername });
}
