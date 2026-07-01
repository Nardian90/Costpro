'use client';

/**
 * useTelegramRealtime — Fase T6
 *
 * Hook que se suscribe a eventos realtime de Telegram via Supabase Realtime.
 * Reemplaza a useWhatsAppSocket (Socket.io) — funciona en Vercel sin
 * custom server.
 *
 * ─────────────────────────────────────────────────────────────────────
 * USO:
 * ─────────────────────────────────────────────────────────────────────
 * const { connected, on } = useTelegramRealtime({ storeId });
 *
 * useEffect(() => {
 *   const off1 = on('message_incoming', (msg) => {
 *     setMessages(prev => [...prev, msg]);
 *   });
 *   const off2 = on('typing', (data) => {
 *     setTypingFrom(data.telegram_user_id);
 *   });
 *   return () => { off1(); off2(); };
 * }, [on]);
 *
 * ─────────────────────────────────────────────────────────────────────
 * SEGURIDAD:
 * ─────────────────────────────────────────────────────────────────────
 * - Supabase valida el JWT del cliente antes de permitir la suscripción.
 * - RLS en Realtime: el cliente solo recibe eventos del channel si tiene
 *   membership activa en la tienda.
 * - Si el token expira, la suscripción se cae y se reconecta automáticamente.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type {
  TelegramEventName,
  TelegramMessageEvent,
  TelegramTypingEvent,
  TelegramGroupParticipantEvent,
  TelegramBotStatusEvent,
} from '@/types/telegram';

interface UseTelegramRealtimeOptions {
  storeId: string | null | undefined;
  autoSubscribe?: boolean;
}

interface UseTelegramRealtimeReturn {
  connected: boolean;
  error: string | null;
  on: (event: TelegramEventName, handler: (payload: any) => void) => () => void;
}

export function useTelegramRealtime({
  storeId,
  autoSubscribe = true,
}: UseTelegramRealtimeOptions): UseTelegramRealtimeReturn {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenersRef = useRef<Map<TelegramEventName, Set<(payload: any) => void>>>(
    new Map()
  );

  useEffect(() => {
    if (!storeId || !autoSubscribe) {
      setConnected(false);
      return;
    }

    const channelName = `telegram:store:${storeId}`;
    const channel = supabase.channel(channelName);

    // Registrar todos los eventos conocidos
    const events: TelegramEventName[] = [
      'message_incoming',
      'message_outgoing',
      'typing',
      'typing_stop',
      'group_participant',
      'bot_status',
      'metrics_update',
    ];

    for (const ev of events) {
      channel.on('broadcast', { event: ev }, (msg: any) => {
        const payload = msg?.payload || msg;
        listenersRef.current.get(ev)?.forEach(handler => handler(payload));
      });
    }

    channel
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
          setError(status);
        } else if (status === 'CLOSED') {
          setConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, autoSubscribe]);

  const on = useCallback(
    (event: TelegramEventName, handler: (payload: any) => void): (() => void) => {
      if (!listenersRef.current.has(event)) {
        listenersRef.current.set(event, new Set());
      }
      listenersRef.current.get(event)!.add(handler);

      return () => {
        listenersRef.current.get(event)?.delete(handler);
      };
    },
    []
  );

  return useMemo(() => ({ connected, error, on }), [connected, error, on]);
}
