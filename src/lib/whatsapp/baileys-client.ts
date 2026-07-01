/**
 * Baileys Client — Multi-session manager para WhatsApp por tienda.
 *
 * Cada tienda tiene su propia sesión de WhatsApp con auth state persistente.
 * Las sesiones se guardan en ./baileys-sessions/{storeId}/
 *
 * ─────────────────────────────────────────────────────────────────────
 * TARGET DEPLOY (FIX-AUDIT-WA-5 — documentar para futuros agentes):
 * ─────────────────────────────────────────────────────────────────────
 * Este módulo SOLO funciona en deploy persistente (single long-running
 * container). Está confirmado por:
 *   - Dockerfile: `bun server.js` (single container, no serverless)
 *   - docker-compose.yml: `restart: unless-stopped` (long-running)
 *   - next.config.ts: `serverExternalPackages` incluye `@whiskeysockets/baileys`
 *     y `@hapi/boom` para evitar bundling en serverless chunks
 *   - vercel.json: NO lista ninguna ruta `/api/whatsapp/*` en `functions`
 *     (las únicas que tienen config serverless son bot/chat, cost-sheets/ai,
 *      ai/chat — ninguna es de WhatsApp)
 *
 * RAZONES TÉCNICAS por las que serverless no aplica:
 *   1. `sessions = new Map<string, WASocket>()` vive en memoria del proceso.
 *      Serverless = procesos efímeros → cada invocación empieza sin sesiones.
 *   2. `connectionStatus` y `qrCodes` también son Maps en memoria. Si la
 *      función se reinicia entre invocaciones, el QR generado en req #1
 *      se pierde y req #2 no lo ve.
 *   3. Baileys mantiene un WebSocket largo a los servidores de WhatsApp.
 *      Serverless mata el proceso al finalizar la request → socket cerrado.
 *   4. `creds.update` callback escribe a disco (`./baileys-sessions/`).
 *      En Vercel el filesystem es read-only (excepto /tmp efímero).
 *
 * Si en algún momento se quiere migrar a serverless, se requiere:
 *   - Mover auth state a Redis/S3 (useMultiFileAuthState → useRedisAuthState)
 *   - Mover sessions/qrCodes/connectionStatus a un store distribuido
 *   - Migrar el worker de invitation-queue a un cron job separado
 *   - Evaluar Baileys en modo "stateless" o usar un provider alternativo
 *
 * Por ahora, asumimos Docker persistente. Si se detecta NODE_ENV=production
 * sin container (p.ej. accidental deploy a Vercel), log warning.
 * ─────────────────────────────────────────────────────────────────────
 */

import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { handleIncomingMessage, handleGroupParticipantUpdate } from './handlers';
import { emitToStore } from '@/lib/whatsapp/realtime-server';

// Map<storeId, WASocket> — una conexión activa por tienda
const sessions = new Map<string, WASocket>();

// Map<storeId, QR data URL> — último QR generado
const qrCodes = new Map<string, string>();

// Map<storeId, connection status>
const connectionStatus = new Map<string, 'disconnected' | 'connecting' | 'connected'>();

export interface WhatsAppSessionInfo {
  status: 'disconnected' | 'connecting' | 'connected';
  qrCode: string | null;
  phoneNumber?: string;
  lastConnectedAt?: string;
}

export function getSessionInfo(storeId: string): WhatsAppSessionInfo {
  return {
    status: connectionStatus.get(storeId) || 'disconnected',
    qrCode: qrCodes.get(storeId) || null,
  };
}

export async function connectStore(storeId: string): Promise<void> {
  if (sessions.has(storeId)) {
    logger.info('DATABASE', 'SESSION_ALREADY_ACTIVE', { storeId });
    return;
  }

  connectionStatus.set(storeId, 'connecting');
  logger.info('DATABASE', 'SESSION_CONNECTING', { storeId });

  // eslint-disable-next-line react-hooks/rules-of-hooks -- useMultiFileAuthState is a Baileys API, not a React hook
  const { state, saveCreds } = await useMultiFileAuthState(`./baileys-sessions/${storeId}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['CostPro', 'Chrome', '1.0.0'],
    defaultQueryTimeoutMs: 30000,
  });

  sessions.set(storeId, sock);

  // Guardar credenciales cuando se actualizan
  sock.ev.on('creds.update', saveCreds);

  // Manejar cambios de conexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Generar QR como data URL para mostrar en el panel
      const qrDataUrl = `data:image/png;base64,${qr}`;
      qrCodes.set(storeId, qrDataUrl);
      logger.info('DATABASE', 'QR_GENERATED', { storeId });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        logger.info('DATABASE', 'SESSION_RECONNECTING', { storeId });
        sessions.delete(storeId);
        connectionStatus.set(storeId, 'connecting');
        await connectStore(storeId);
      } else {
        logger.info('DATABASE', 'SESSION_LOGGED_OUT', { storeId });
        sessions.delete(storeId);
        connectionStatus.set(storeId, 'disconnected');
        qrCodes.delete(storeId);
        // FASE 5: Notificar desconexión a los clientes conectados.
        emitToStore(storeId, 'connection_status', {
          status: 'disconnected',
          ts: Date.now(),
        });
      }
    } else if (connection === 'open') {
      connectionStatus.set(storeId, 'connected');
      qrCodes.delete(storeId); // limpiar QR ya conectado
      const phoneNumber = sock.user?.id?.split(':')[0];
      logger.info('DATABASE', 'SESSION_CONNECTED', { storeId, phoneNumber });

      // FASE 5: Emitir evento realtime 'connection_status' para que el
      // dashboard actualice el badge sin polling.
      emitToStore(storeId, 'connection_status', {
        status: 'connected',
        phone_number: phoneNumber,
        ts: Date.now(),
      });

      // Actualizar estado en BD
      const admin = getSupabaseAdminSafe();
      if (admin) {
        await admin
          .from('whatsapp_configs')
          .update({
            connection_status: 'connected',
            last_connected_at: new Date().toISOString(),
          })
          .eq('store_id', storeId);
      }
    }
  });

  // Manejar mensajes entrantes — Fase 2: handlers reales con GLM
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return; // Solo procesar mensajes nuevos
    for (const message of m.messages) {
      await handleIncomingMessage({ storeId, sock }, message).catch(err =>
        logger.error('DATABASE', 'WHATSAPP_HANDLER_ERROR', { storeId, error: err.message })
      );
    }
  });

  // Manejar entradas/salidas del grupo
  sock.ev.on('group-participants.update', async (event) => {
    await handleGroupParticipantUpdate({ storeId, sock }, {
      jid: event.id,
      participants: event.participants.map((p: any) => typeof p === 'string' ? p : p.id),
      action: event.action as 'add' | 'remove' | 'promote' | 'demote',
    }).catch(err =>
      logger.error('DATABASE', 'WHATSAPP_GROUP_HANDLER_ERROR', { storeId, error: err.message })
    );
  });
}

export function disconnectStore(storeId: string): void {
  const sock = sessions.get(storeId);
  if (sock) {
    sock.logout();
    sessions.delete(storeId);
  }
  connectionStatus.set(storeId, 'disconnected');
  qrCodes.delete(storeId);
  logger.info('DATABASE', 'SESSION_DISCONNECTED', { storeId });

  // FASE 5: Notificar desconexión a los clientes conectados.
  emitToStore(storeId, 'connection_status', {
    status: 'disconnected',
    ts: Date.now(),
  });

  // Actualizar estado en BD
  const admin = getSupabaseAdminSafe();
  if (admin) {
    admin
      .from('whatsapp_configs')
      .update({ connection_status: 'disconnected' })
      .eq('store_id', storeId)
      .then(() => {});
  }
}

export function getSocket(storeId: string): WASocket | undefined {
  return sessions.get(storeId);
}
