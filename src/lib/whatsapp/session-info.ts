/**
 * CP-INFRA-002b (2026-10-23) — Estado de sesión de WhatsApp SIN Baileys.
 *
 * Retirada efectiva del runtime de mensajería WhatsApp: la dependencia
 * @whiskeysockets/baileys fue eliminada de package.json y los módulos
 * baileys-client.ts / handlers.ts (que la importaban) fueron retirados del
 * árbol de código runtime. Este módulo conserva la MISMA interfaz de lectura
 * de estado que consumían las rutas /api/whatsapp/* (getSessionInfo /
 * getSocket / disconnectStore), con una semántica honesta: con la integración
 * desconectada NUNCA hay sesión, QR ni socket — las respuestas de las rutas
 * reflejan «disconnected», exactamente el estado real del sistema.
 *
 * El flujo de publicación/invitaciones degrada con elegancia (sus manejos de
 * «no session» ya existían): publishProductToWhatsApp devuelve reason
 * 'no_session' y la cola de invitaciones deja los registros pendientes en BD.
 *
 * Reactivación de WhatsApp (documentada en docs/CP-INFRA-002-REACTIVACION.md):
 *   1. bun add @whiskeysockets/baileys @hapi/boom
 *   2. git checkout <commit-previo-a-esta-misión> -- src/lib/whatsapp/baileys-client.ts src/lib/whatsapp/handlers.ts
 *   3. Restaurar los imports de baileys-client en publish.ts, invitation-queue.ts
 *      y las rutas /api/whatsapp/* (git diff de esta misión como guía).
 *   4. Poner WHATSAPP_SESSIONS_ENABLED=true y (si se desea) los crons de
 *      vercel.json. Tokens, sesiones y configuración NO se tocan en esta misión.
 */

export interface WhatsAppSessionInfo {
  status: 'disconnected' | 'connecting' | 'connected';
  qrCode: string | null;
  phoneNumber?: string;
  lastConnectedAt?: string;
  reconnectAttempts?: number;
}

/**
 * Stub estructural del socket de WhatsApp. Conserva los métodos que las
 * rutas activas invocan SOLO cuando hay sesión (sendMessage, groupMetadata,
 * groupParticipantsUpdate) con firma amplia ([key: string]: any) para no
 * obligar a tocar la lógica de las rutas. Con Baileys retirado, getSocket()
 * devuelve SIEMPRE null — este tipo existe únicamente para que el código
 * degradado (razas «no session») siga compilando sin cambios de lógica.
 */
export interface WhatsAppSocketStub {
  user?: { id: string };
  sendMessage(...args: any[]): Promise<any>;
  groupMetadata(jid: string): Promise<{ participants: Array<{ id: string; name?: string; admin?: string }> }>;
  groupParticipantsUpdate(jid: string, users: string[], action: string): Promise<unknown>;
  [key: string]: any;
}

export function getSessionInfo(_storeId: string): WhatsAppSessionInfo {
  return {
    status: 'disconnected',
    qrCode: null,
    phoneNumber: undefined,
    lastConnectedAt: undefined,
    reconnectAttempts: 0,
  };
}

/** Con Baileys retirado no existe socket en memoria — siempre null. */
export function getSocket(_storeId: string): WhatsAppSocketStub | null {
  return null;
}

/** Idempotente: no hay sesiones que cerrar. */
export function disconnectStore(_storeId: string): void {
  // CP-INFRA-002b: no-op — el cliente de Baileys ya no forma parte del runtime.
}
