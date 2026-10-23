/**
 * CP-INFRA-002 — Desconexión reversible de WhatsApp y Telegram (2026-10-23).
 *
 * Motivo operativo: que ambas integraciones dejen de ejecutar procesos y
 * consumir recursos activamente, manteniendo la implementación intacta para
 * una reactivación futura. No se eliminan tokens, variables de entorno,
 * sesiones ni historial.
 *
 * Bandera (todas false por defecto = desconectado):
 *   - WHATSAPP_SESSIONS_ENABLED   → /api/whatsapp/connect. CP-INFRA-002b: el
 *                                   cliente Baileys fue retirado del runtime;
 *                                   con la bandera en true la ruta responde
 *                                   503 RUNTIME_UNAVAILABLE indicando el
 *                                   procedimiento de reinstalación (la bandera
 *                                   por sí sola ya NO reactiva WhatsApp).
 *   - WHATSAPP_AUTOPUBLISH_ENABLED→ /api/cron/whatsapp-auto-publish ejecuta la
 *                                   publicación programada (degrada a
 *                                   reason 'no_session' sin socket).
 *   - TELEGRAM_AUTOPUBLISH_ENABLED → /api/cron/telegram-auto-publish ejecuta la
 *                                   publicación programada.
 *   - MESSAGING_REALTIME_ENABLED  → server.ts adjunta el Socket.IO de WhatsApp
 *                                   (solo despliegues con servidor custom/pm2).
 *
 * Mecanismo: valor por defecto `false` (desconectado). Se reactiva poniendo la
 * variable de entorno homónima en "true" (sin cambios de código ni de este
 * archivo) o cambiando el literal aquí. Los cron jobs de vercel.json y los
 * pollers de ecosystem.config.js fueron retirados/comentados en el mismo
 * commit; su restauración se documenta en docs/CP-INFRA-002-REACTIVACION.md.
 */

function readFlag(name: string): boolean {
  try {
    return process.env[name] === 'true';
  } catch {
    return false;
  }
}

export const WHATSAPP_SESSIONS_ENABLED: boolean = readFlag('WHATSAPP_SESSIONS_ENABLED');
export const WHATSAPP_AUTOPUBLISH_ENABLED: boolean = readFlag('WHATSAPP_AUTOPUBLISH_ENABLED');
export const TELEGRAM_AUTOPUBLISH_ENABLED: boolean = readFlag('TELEGRAM_AUTOPUBLISH_ENABLED');
export const MESSAGING_REALTIME_ENABLED: boolean = readFlag('MESSAGING_REALTIME_ENABLED');
