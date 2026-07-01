'use client';

/**
 * useWhatsAppSocket — Fase 5
 *
 * Hook que mantiene una conexión Socket.io activa al módulo de WhatsApp
 * para una tienda específica. Expone callbacks tipados para cada evento
 * realtime y reconexión automática con backoff exponencial.
 *
 * ─────────────────────────────────────────────────────────────────────
 * USO:
 * ─────────────────────────────────────────────────────────────────────
 * const { connected, on, off, emit } = useWhatsAppSocket({ storeId });
 *
 * useEffect(() => {
 *   const off1 = on('message_incoming', (msg) => {
 *     setMessages(prev => [...prev, msg]);
 *   });
 *   const off2 = on('typing', (data) => {
 *     setTypingFrom(data.phone_number);
 *   });
 *   return () => { off1(); off2(); };
 * }, [on]);
 *
 * ─────────────────────────────────────────────────────────────────────
 * SEGURIDAD:
 * ─────────────────────────────────────────────────────────────────────
 * - El token JWT se envía en el handshake. El servidor lo valida contra
 *   Supabase y verifica membership antes de unir al room.
 * - Si el token expira, el servidor desconecta. El hook reconecta
 *   automáticamente (hasta 5 intentos) y refresca el token.
 * - Si no hay storeId o token, el hook es no-op (retorna connected: false).
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io as createSocket, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store';
import { logger } from '@/lib/logger';

// ── Tipos de eventos ──────────────────────────────────────────────────

export interface WhatsAppMessageEvent {
  contact_id: string | null;
  phone_number: string;
  content: string;
  sender_name?: string;
  tokens_used?: number;
  response_time_ms?: number;
  ts: number;
}

export interface WhatsAppTypingEvent {
  contact_id: string | null;
  phone_number: string;
  ts: number;
}

export interface WhatsAppGroupParticipantEvent {
  jid: string;
  participants: string[];
  action: 'add' | 'remove' | 'promote' | 'demote';
  ts: number;
}

export interface WhatsAppConnectionStatusEvent {
  status: 'disconnected' | 'connecting' | 'connected';
  phone_number?: string;
  ts: number;
}

export interface WhatsAppRiskLevelEvent {
  level: 'safe' | 'warning' | 'danger' | 'blocked';
  cooldown_until: string | null;
  ts: number;
}

export interface WhatsAppMetricsUpdateEvent {
  messages_today: number;
  incoming_today: number;
  outgoing_today: number;
  active_conversations: number;
  invitations_today: number;
  ts: number;
}

export type WhatsAppEvent =
  | 'message_incoming'
  | 'message_outgoing'
  | 'typing'
  | 'typing_stop'
  | 'group_participant'
  | 'connection_status'
  | 'risk_level'
  | 'metrics_update'
  | 'pong';

type EventPayload = WhatsAppMessageEvent | WhatsAppTypingEvent | WhatsAppGroupParticipantEvent | WhatsAppConnectionStatusEvent | WhatsAppRiskLevelEvent | WhatsAppMetricsUpdateEvent | { ts: number };

interface UseWhatsAppSocketOptions {
  storeId: string | null | undefined;
  /** Auto-conectar al montar. Default: true. */
  autoConnect?: boolean;
  /** Reintentos máximos. Default: 5. */
  maxRetries?: number;
}

interface UseWhatsAppSocketReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  /** Suscribe a un evento. Retorna función para desuscribir. */
  on: (event: WhatsAppEvent, handler: (payload: any) => void) => () => void;
  /** Emite un evento al servidor (raramente necesario — el server emite). */
  emit: (event: string, payload?: unknown) => void;
  /** Desconecta manualmente. */
  disconnect: () => void;
  /** Reconecta manualmente. */
  reconnect: () => void;
}

// ── Singleton a nivel de módulo para evitar múltiples conexiones ──────
// Si dos componentes usan el hook con el mismo storeId, comparten socket.
interface SocketEntry {
  socket: Socket;
  refCount: number;
  connected: boolean;
  error: string | null;
  listeners: Map<WhatsAppEvent, Set<(payload: any) => void>>;
}

const socketCache = new Map<string, SocketEntry>();

function getOrCreateSocket(
  storeId: string,
  token: string,
  listeners: Map<WhatsAppEvent, Set<(payload: any) => void>>
): SocketEntry {
  let entry = socketCache.get(storeId);
  if (entry) {
    entry.refCount += 1;
    return entry;
  }

  const socket = createSocket({
    path: '/api/whatsapp/socket.io',
    auth: { token, storeId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    autoConnect: true,
  });

  const newEntry: SocketEntry = {
    socket,
    refCount: 1,
    connected: false,
    error: null,
    listeners,
  };

  socket.on('connect', () => {
    newEntry.connected = true;
    newEntry.error = null;
    // Notificar a todos los listeners del cambio de estado
    newEntry.listeners.get('connection_status' as WhatsAppEvent)?.forEach(h =>
      h({ status: 'connected', ts: Date.now() })
    );
  });

  socket.on('disconnect', (reason) => {
    newEntry.connected = false;
    if (reason === 'io server disconnect') {
      // El servidor nos desconectó (auth fallido, etc.)
      newEntry.error = 'Desconectado por el servidor';
    }
    newEntry.listeners.get('connection_status' as WhatsAppEvent)?.forEach(h =>
      h({ status: 'disconnected', ts: Date.now() })
    );
  });

  socket.on('connect_error', (err) => {
    newEntry.error = err.message;
    newEntry.listeners.get('connection_status' as WhatsAppEvent)?.forEach(h =>
      h({ status: 'disconnected', ts: Date.now() })
    );
  });

  // Registrar todos los eventos de WhatsApp conocidos
  const events: WhatsAppEvent[] = [
    'message_incoming',
    'message_outgoing',
    'typing',
    'typing_stop',
    'group_participant',
    'connection_status',
    'risk_level',
    'metrics_update',
    'pong',
  ];
  for (const ev of events) {
    socket.on(ev, (payload: any) => {
      newEntry.listeners.get(ev)?.forEach(handler => handler(payload));
    });
  }

  socketCache.set(storeId, newEntry);
  return newEntry;
}

function releaseSocket(storeId: string): void {
  const entry = socketCache.get(storeId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.socket.removeAllListeners();
    entry.socket.disconnect();
    socketCache.delete(storeId);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useWhatsAppSocket({
  storeId,
  autoConnect = true,
}: UseWhatsAppSocketOptions): UseWhatsAppSocketReturn {
  const { token } = useAuthStore();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryRef = useRef<SocketEntry | null>(null);
  const listenersRef = useRef<Map<WhatsAppEvent, Set<(payload: any) => void>>>(
    new Map()
  );

  // Conectar / desconectar cuando cambia storeId o token
  useEffect(() => {
    if (!storeId || !token || !autoConnect) {
      setConnected(false);
      setConnecting(false);
      return;
    }

    setConnecting(true);

    try {
      const entry = getOrCreateSocket(storeId, token, listenersRef.current);
      entryRef.current = entry;

      // Sync estado inicial
      setConnected(entry.connected);
      setError(entry.error);
      setConnecting(!entry.connected);

      // Listener para sync de estado conectado
      const onConn = (payload: any) => {
        if (payload?.status === 'connected') {
          setConnected(true);
          setConnecting(false);
          setError(null);
        } else {
          setConnected(false);
          setConnecting(entry.socket.active);
          setError(payload?.error || entry.error);
        }
      };
      listenersRef.current.set('connection_status', new Set([onConn]));

      return () => {
        listenersRef.current.delete('connection_status');
        releaseSocket(storeId);
        entryRef.current = null;
      };
    } catch (err: any) {
      setError(err.message);
      setConnecting(false);
    }
  }, [storeId, token, autoConnect]);

  // on: suscribirse a un evento
  const on = useCallback(
    (event: WhatsAppEvent, handler: (payload: any) => void): (() => void) => {
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

  // emit: raramente necesario, el server emite
  const emit = useCallback((event: string, payload?: unknown) => {
    entryRef.current?.socket.emit(event, payload);
  }, []);

  const disconnect = useCallback(() => {
    if (storeId) {
      releaseSocket(storeId);
      entryRef.current = null;
      setConnected(false);
    }
  }, [storeId]);

  const reconnect = useCallback(() => {
    if (entryRef.current) {
      entryRef.current.socket.connect();
      setConnecting(true);
    }
  }, []);

  return useMemo(
    () => ({ connected, connecting, error, on, emit, disconnect, reconnect }),
    [connected, connecting, error, on, emit, disconnect, reconnect]
  );
}
