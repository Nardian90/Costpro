/**
 * Realtime Server (Socket.io) — Fase 5
 *
 * Singleton que mantiene la instancia de Socket.io attachada al HTTP server
 * principal de Next.js. Los eventos se emiten desde los handlers de WhatsApp
 * (handlers.ts, glm-orchestrator.ts, messages/send/route.ts) hacia los
 * clientes conectados (suscripción por storeId).
 *
 * ─────────────────────────────────────────────────────────────────────
 * ARQUITECTURA:
 * ─────────────────────────────────────────────────────────────────────
 * 1. Server-side: este módulo se importa desde server.ts (custom server) que
 *    envuelve next().getRequestHandler(). Socket.io se attacha al HTTP server
 *    antes de empezar a escuchar.
 *
 * 2. Cliente: src/hooks/whatsapp/useWhatsAppSocket.ts — usa socket.io-client
 *    para conectarse, autenticarse con JWT, y unirse a rooms por storeId.
 *
 * 3. Auth: cada socket debe enviar { token, storeId } en el handshake. El
 *    servidor valida el token contra Supabase y la membership del usuario
 *    contra la tienda antes de unirlo al room `store:{storeId}`.
 *
 * 4. Eventos emitidos (server → cliente):
 *    - message_incoming    — mensaje entrante de WhatsApp
 *    - message_outgoing    — mensaje saliente (bot o manual)
 *    - typing              — GLM está procesando respuesta
 *    - group_participant   — alguien entró/salió del grupo
 *    - connection_status   — cambio en estado de conexión de la sesión
 *    - risk_level          — cambio en nivel de riesgo anti-ban
 *    - metrics_update      — métricas del dashboard actualizadas
 *
 * 5. Rooms: cada tienda tiene su propio room. Solo miembros con access
 *    pueden unirse. Esto garantiza aislamiento cross-tenant a nivel de
 *    realtime (además del RLS a nivel de DB).
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEPLOY (FIX-AUDIT-WA-5):
 *   Socket.io requiere HTTP server persistente. NO funciona en Vercel
 *   serverless. Asumimos Docker persistente (ver baileys-client.ts).
 * ─────────────────────────────────────────────────────────────────────
 */

import type { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

// ── Singleton ──────────────────────────────────────────────────────────

let io: SocketIOServer | null = null;

/**
 * Attach Socket.io al HTTP server principal. Idempotente: si ya está
 * attachado, retorna la instancia existente.
 *
 * Se invoca desde server.ts (custom server en producción) o desde
 * src/lib/whatsapp/dev-realtime-init.ts (en dev, mediante instrumentation).
 */
export function attachRealtimeServer(httpServer: HTTPServer): SocketIOServer {
  if (io) {
    logger.info('DATABASE', 'REALTIME_ALREADY_ATTACHED', {});
    return io;
  }

  io = new SocketIOServer(httpServer, {
    path: '/api/whatsapp/socket.io',
    cors: {
      origin: process.env.NEXTAUTH_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // No serve client — usamos socket.io-client desde el bundle del frontend
    serveClient: false,
    // Ping cada 25s para mantener conexiones NAT/firewall vivas
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  // ── Auth middleware (corre en cada conexión nueva) ─────────────────

  io.use(async (socket: Socket, next) => {
    try {
      const { token, storeId } = socket.handshake.auth as {
        token?: string;
        storeId?: string;
      };

      if (!token || !storeId) {
        return next(new Error('Falta token o storeId en handshake'));
      }

      // Validar token contra Supabase (verifica firma + exp + revocación)
      const isSupabaseConfigured = !!(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      if (!isSupabaseConfigured) {
        return next(new Error('Supabase no configurado'));
      }

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        logger.warn('DATABASE', 'REALTIME_AUTH_FAILED', {
          storeId, error: error?.message,
        });
        return next(new Error('Token inválido o expirado'));
      }

      // Validar membership del usuario en la tienda
      const admin = (await import('@/lib/supabase-admin')).getSupabaseAdminSafe();
      if (!admin) {
        return next(new Error('Servidor mal configurado'));
      }

      const [profileResult, membershipsResult] = await Promise.all([
        admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
        admin.from('user_store_memberships')
          .select('store_id,role,status')
          .eq('user_id', user.id)
          .eq('status', 'active'),
      ]);

      const profile = profileResult.data as { role: string } | null;
      const memberships = (membershipsResult.data || []) as Array<{
        store_id: string; role: string; status: string;
      }>;

      const isAdmin = profile?.role === 'admin';
      const hasMembership = memberships.some(m => m.store_id === storeId);

      if (!isAdmin && !hasMembership) {
        logger.warn('DATABASE', 'REALTIME_NO_MEMBERSHIP', {
          userId: user.id, storeId,
        });
        return next(new Error('Sin acceso a esta tienda'));
      }

      // Adjuntar info al socket para usarla en disconnect, etc.
      (socket as any).userId = user.id;
      (socket as any).storeId = storeId;
      (socket as any).userRole = profile?.role || 'authenticated';

      next();
    } catch (err: any) {
      logger.error('DATABASE', 'REALTIME_AUTH_ERROR', { error: err.message });
      next(new Error('Error de autenticación'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────

  io.on('connection', (socket: Socket) => {
    const storeId = (socket as any).storeId as string;
    const userId = (socket as any).userId as string;

    // Unir al room de la tienda — todos los eventos se emiten a este room
    socket.join(`store:${storeId}`);

    logger.info('DATABASE', 'REALTIME_CLIENT_CONNECTED', {
      storeId, userId, socketId: socket.id,
    });

    socket.on('disconnect', (reason) => {
      logger.info('DATABASE', 'REALTIME_CLIENT_DISCONNECTED', {
        storeId, userId, reason,
      });
    });

    // Evento de ping/health (opcional — el cliente puede enviarlo para
    // verificar conectividad)
    socket.on('ping', () => {
      socket.emit('pong', { ts: Date.now() });
    });
  });

  logger.info('DATABASE', 'REALTIME_SERVER_ATTACHED', {
    path: '/api/whatsapp/socket.io',
  });

  return io;
}

/**
 * Obtiene la instancia singleton de Socket.io. Retorna null si no se ha
 * inicializado aún (p.ej. en contextos sin HTTP server como Vercel).
 *
 * Los emisores (handlers.ts, etc.) deben usar esta función y manejar null
 * graciosamente — la ausencia de realtime no debe romper el flujo principal.
 */
export function getRealtimeServer(): SocketIOServer | null {
  return io;
}

/**
 * Emite un evento a todos los clientes conectados al room de una tienda.
 * Función helper — todos los emisores usan esto para no tener que importar
 * SocketIOServer ni manejar null en cada call site.
 *
 * Si realtime no está inicializado (Vercel, tests), es no-op.
 *
 * @example
 * emitToStore(storeId, 'message_incoming', { contact_id, content, ... });
 */
export function emitToStore(
  storeId: string,
  event: string,
  payload: unknown
): void {
  if (!io) {
    // Realtime no inicializado — no-op. El flujo principal (BD, etc.)
    // sigue funcionando sin tiempo real.
    return;
  }
  io.to(`store:${storeId}`).emit(event, payload);
}

/**
 * Emite un evento de typing a una tienda y contacto específico.
 * Helper para el indicador "escribiendo..." en el frontend.
 */
export function emitTyping(
  storeId: string,
  contactId: string | null,
  phoneNumber: string
): void {
  emitToStore(storeId, 'typing', {
    contact_id: contactId,
    phone_number: phoneNumber,
    ts: Date.now(),
  });
}

/**
 * Emite un evento de mensaje (incoming o outgoing) a una tienda.
 */
export function emitMessage(
  storeId: string,
  direction: 'incoming' | 'outgoing',
  data: {
    contact_id: string | null;
    phone_number: string;
    content: string;
    sender_name?: string;
    tokens_used?: number;
    response_time_ms?: number;
  }
): void {
  emitToStore(storeId, `message_${direction}`, {
    ...data,
    ts: Date.now(),
  });
}
