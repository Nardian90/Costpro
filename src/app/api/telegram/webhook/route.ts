import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { handleTelegramUpdate, findConfigByBotUserId } from '@/lib/telegram/webhook-handler';
import {
  validateWebhookSecret,
  isTelegramIp,
  getRealClientIp,
} from '@/lib/telegram/security';
import type { TelegramUpdate } from '@/types/telegram';

/**
 * POST /api/telegram/webhook?bot_id={bot_user_id}
 *
 * Telegram envía un POST a esta URL por cada Update (mensaje, callback, etc.).
 *
 * Autenticación (doble factor):
 *   1. Header `X-Telegram-Bot-Api-Secret-Token` debe coincidir con el
 *      `webhook_secret` almacenado en `telegram_configs.webhook_secret`.
 *   2. El `bot_id` en query param debe corresponder a un bot configurado
 *      en alguna tienda. Esto nos permite identificar a qué tienda pertenece
 *      el update (1 bot = 1 tienda).
 *
 * IP Allowlist (Fase T7): en producción, validar que la IP del request
 * esté en los rangos oficiales de Telegram:
 *   - 149.154.160.0/20
 *   - 91.108.4.0/22
 *
 * Resilencia:
 *   - Respondemos 200 inmediatamente y procesamos async con waitUntilCompat.
 *   - Telegram reintenta si respondemos != 200 (hasta 12 veces en 24h).
 *   - Si fallamos, logueamos pero respondemos 200 para evitar duplicados.
 *
 * Rate limiting:
 *   - Telegram no documenta límites explícitos para webhooks, pero se
 *     recomienda responder en <60s. Con waitUntilCompat procesamos en background.
 */

// ── waitUntil compatible Docker + Vercel ──────────────────────────────
// FIX TELEGRAM-SEC-4: @vercel/functions:waitUntil es específico de Vercel
// serverless. En Docker persistente no hace nada útil (no hay lifetime que
// extender). Usamos un wrapper que:
//   - En Vercel: usa waitUntil real de @vercel/functions (si está disponible)
//   - En Docker: ejecuta la promise sin await (fire-and-forget en proceso persistente)
// La decisión de runtime está documentada en src/lib/whatsapp/realtime-server.ts.
declare global {
  var __waitUntilFallback: ((promise: Promise<unknown>) => void) | undefined;
}

function waitUntilCompat(promise: Promise<unknown>): void {
  // Si hay waitUntil real de Vercel, usarlo
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require('@vercel/functions');
    if (typeof waitUntil === 'function') {
      waitUntil(promise);
      return;
    }
  } catch {
    // @vercel/functions no disponible (Docker) — usar fallback
  }
  // Fallback: fire-and-forget en proceso persistente
  promise.catch(err => {
    logger.error('DATABASE', 'TELEGRAM_WEBHOOK_ASYNC_ERROR', { error: err?.message || String(err) });
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const startTime = Date.now();

  try {
    // ── 1. IP Allowlist (Fase T7) ────────────────────────────────────
    // FIX TELEGRAM-SEC-5: usar getRealClientIp que prioriza req.socket.remoteAddress
    // (no spoofable) cuando no hay proxy delante. Ver JSDoc en security.ts.
    const clientIp = getRealClientIp(req);

    if (!isTelegramIp(clientIp)) {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_IP_BLOCKED', { ip: clientIp });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── 2. Extraer bot_id del query param ────────────────────────────
    const url = new URL(req.url);
    const botUserIdStr = url.searchParams.get('bot_id');
    if (!botUserIdStr) {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_NO_BOT_ID', {});
      return NextResponse.json({ error: 'bot_id requerido' }, { status: 400 });
    }
    const botUserId = parseInt(botUserIdStr, 10);
    if (isNaN(botUserId)) {
      return NextResponse.json({ error: 'bot_id inválido' }, { status: 400 });
    }

    // ── 3. Buscar config del bot (incluyendo webhook_secret) ─────────
    const config = await findConfigByBotUserId(botUserId);
    if (!config) {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_BOT_NOT_FOUND', { botUserId });
      return NextResponse.json({ error: 'Bot no configurado' }, { status: 404 });
    }

    // ── 4. Validar secret token (fail-closed) ──────────────────────────
    // FIX TELEGRAM-SEC-1: antes era fail-open (si faltaba el header se aceptaba).
    // Ahora: si config.webhook_secret está seteado, el header DEBE estar presente
    // Y coincidir (timing-safe comparison vía validateWebhookSecret).
    // Si config.webhook_secret NO está seteado (bot sin secret configurado),
    // aceptamos sin header (comportamiento legado, pero logueamos warning).
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    if (config.webhook_secret) {
      if (!validateWebhookSecret(secretHeader, config.webhook_secret)) {
        logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_SECRET_INVALID', {
          botUserId,
          hasSecret: !!config.webhook_secret,
          hasHeader: !!secretHeader,
        });
        return NextResponse.json({ error: 'Secret inválido' }, { status: 403 });
      }
    } else {
      // Bot sin secret configurado — aceptamos pero advertimos
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_NO_SECRET_CONFIGURED', {
        botUserId,
        message: 'Bot sin webhook_secret configurado — cualquiera puede enviar updates falsos',
      });
    }

    // ── 5. Parsear el Update ─────────────────────────────────────────
    const update = (await req.json()) as TelegramUpdate;
    if (!update || typeof update.update_id !== 'number') {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_INVALID_PAYLOAD', { botUserId });
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    // ── 6. Responder 200 inmediatamente y procesar async ─────────────
    // Telegram espera respuesta en <60s. Procesamos en background con waitUntilCompat.
    // Pasamos la config ya resuelta al handler para evitar re-buscarla.
    waitUntilCompat(
      (async () => {
        try {
          await handleTelegramUpdate(update, config);
          logger.info('DATABASE', 'TELEGRAM_WEBHOOK_PROCESSED', {
            update_id: update.update_id,
            durationMs: Date.now() - startTime,
          });
        } catch (err: any) {
          logger.error('DATABASE', 'TELEGRAM_WEBHOOK_PROCESSING_ERROR', {
            update_id: update.update_id,
            error: err.message,
          });
        }
      })()
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    logger.error('DATABASE', 'TELEGRAM_WEBHOOK_FATAL', { error: error.message });
    // Respondemos 200 para que Telegram no reintente — el error es nuestro,
    // no de Telegram. Si fuera un error de Telegram (payload inválido),
    // ya habríamos respondido 400 arriba.
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

/**
 * GET /api/telegram/webhook
 * Endpoint de health check — Telegram no lo usa pero útil para debugging.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json({
    service: 'telegram-webhook',
    status: 'active',
    timestamp: new Date().toISOString(),
  });
}
