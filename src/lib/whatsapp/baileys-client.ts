/**
 * Baileys Client — Multi-session manager para WhatsApp por tienda.
 *
 * Cada tienda tiene su propia sesión de WhatsApp con auth state persistente.
 * Las sesiones se guardan en ./baileys-sessions/{storeId}/
 */

import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { handleIncomingMessage, handleGroupParticipantUpdate } from './handlers';

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
      }
    } else if (connection === 'open') {
      connectionStatus.set(storeId, 'connected');
      qrCodes.delete(storeId); // limpiar QR ya conectado
      const phoneNumber = sock.user?.id?.split(':')[0];
      logger.info('DATABASE', 'SESSION_CONNECTED', { storeId, phoneNumber });

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
