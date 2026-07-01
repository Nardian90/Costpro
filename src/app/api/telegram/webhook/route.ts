import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { logger } from '@/lib/logger';
import { handleTelegramUpdate, findConfigByBotUserId } from '@/lib/telegram/webhook-handler';
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
 *   - Respondemos 200 inmediatamente y procesamos async con waitUntil.
 *   - Telegram reintenta si respondemos != 200 (hasta 12 veces en 24h).
 *   - Si fallamos, logueamos pero respondemos 200 para evitar duplicados.
 *
 * Rate limiting:
 *   - Telegram no documenta límites explícitos para webhooks, pero se
 *     recomienda responder en <60s. Con waitUntil procesamos en background.
 */

// ── Telegram IP Allowlist (rangos oficiales) ──────────────────────────
// https://core.telegram.org/bots/webhooks#the-short-version
const TELEGRAM_IP_RANGES = [
  '149.154.160.0/20',
  '91.108.4.0/22',
  '95.161.64.0/20',
  '185.76.151.0/24',
];

/**
 * Valida si una IP está en un rango CIDR.
 * Soporta IPv4. Telegram usa IPv4 para webhooks.
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);
  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  if (ipParts.some(isNaN) || rangeParts.some(isNaN)) return false;

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const maskNum = mask === 0 ? 0 : (0xFFFFFFFF << (32 - mask)) >>> 0;

  return (ipNum & maskNum) === (rangeNum & maskNum);
}

function isTelegramIp(ip: string): boolean {
  // En dev/localhost, saltar validación
  if (process.env.NODE_ENV !== 'production') return true;
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return true;
  return TELEGRAM_IP_RANGES.some(cidr => isIpInCidr(ip, cidr));
}

export async function POST(req: NextRequest): Promise<Response> {
  const startTime = Date.now();

  try {
    // ── 1. IP Allowlist (Fase T7) ────────────────────────────────────
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

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

    // ── 4. Validar secret token (HMAC-like) ──────────────────────────
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    if (!config.webhook_secret || secretHeader !== config.webhook_secret) {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_SECRET_MISMATCH', {
        botUserId,
        hasSecret: !!config.webhook_secret,
        hasHeader: !!secretHeader,
      });
      return NextResponse.json({ error: 'Secret inválido' }, { status: 403 });
    }

    // ── 5. Parsear el Update ─────────────────────────────────────────
    const update = (await req.json()) as TelegramUpdate;
    if (!update || typeof update.update_id !== 'number') {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_INVALID_PAYLOAD', { botUserId });
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    // ── 6. Responder 200 inmediatamente y procesar async ─────────────
    // Telegram espera respuesta en <60s. Procesamos en background con waitUntil.
    // Pasamos la config ya resuelta al handler para evitar re-buscarla.
    waitUntil(
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
