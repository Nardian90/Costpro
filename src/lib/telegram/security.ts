/**
 * Telegram Security — Fase T7
 *
 * Capa de seguridad específica para Telegram:
 *   - Anti-spam: rate-limit por telegram_user_id (no por store) para evitar
 *     que un usuario sature el bot.
 *   - IP allowlist: rangos oficiales de Telegram (ya implementado en webhook/route.ts).
 *   - HMAC webhook: validación de X-Telegram-Bot-Api-Secret-Token (ya en webhook).
 *
 * Diferencias con WhatsApp:
 *   - WhatsApp necesitaba anti-ban (proteger el número de bloqueos).
 *   - Telegram no banea bots oficiales, así que NO hay anti-ban.
 *   - En su lugar, hay anti-spam (proteger al bot de abuso de usuarios).
 *
 * Persistencia:
 *   - En Vercel serverless, la memoria del proceso no se comparte entre
 *     invocaciones. Para rate-limit persistente, usar Upstash Redis (ya
 *     integrado en el proyecto para otros rate-limits).
 *   - Si Upstash no está configurado, usa memoria local (mejor esfuerzo).
 */

import { logger } from '@/lib/logger';

// ── Rate limit en memoria (fallback si no hay Upstash) ─────────────────
// NOTA: En Vercel serverless, esto solo funciona dentro de la misma
// invocación. Para rate-limit real, usar Upstash (ver rate-limit.ts).

interface RateBucket {
  count: number;
  resetAt: number;
}

const userRateBuckets = new Map<string, RateBucket>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Rate-limit por telegram_user_id.
 * Default: 20 mensajes/minuto por usuario (suficiente para uso legítimo,
 * bloquea spam automatizado).
 *
 * @param telegramUserId ID numérico del usuario de Telegram
 * @param maxPerMinute Máximo de mensajes por minuto (default: 20)
 */
export function rateLimitByTelegramUser(
  telegramUserId: number,
  maxPerMinute: number = 20
): RateLimitResult {
  const key = `tg:user:${telegramUserId}`;
  const now = Date.now();
  const windowMs = 60_000;

  let bucket = userRateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    userRateBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, maxPerMinute - bucket.count);

  if (bucket.count > maxPerMinute) {
    logger.warn('DATABASE', 'TELEGRAM_RATE_LIMITED', {
      telegramUserId, count: bucket.count, max: maxPerMinute,
    });
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt: bucket.resetAt,
  };
}

/**
 * Detección de flood: mismo usuario >50 mensajes en 5 minutos.
 * Retorna true si el usuario está haciendo flood.
 */
export function isFlooding(telegramUserId: number): boolean {
  const key = `tg:flood:${telegramUserId}`;
  const now = Date.now();
  const windowMs = 5 * 60_000; // 5 minutos
  const threshold = 50;

  let bucket = userRateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    userRateBuckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > threshold) {
    logger.warn('DATABASE', 'TELEGRAM_FLOOD_DETECTED', {
      telegramUserId, count: bucket.count, threshold,
    });
    return true;
  }

  return false;
}

/**
 * Limpia buckets expirados para evitar memory leak.
 * Se invoca periódicamente (no en cada request — overhead innecesario).
 */
export function cleanupRateBuckets(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, bucket] of userRateBuckets) {
    if (bucket.resetAt < now) {
      userRateBuckets.delete(key);
      cleaned += 1;
    }
  }
  if (cleaned > 0) {
    logger.info('DATABASE', 'TELEGRAM_RATE_BUCKETS_CLEANED', { count: cleaned });
  }
}

// ── Telegram IP Allowlist (rangos oficiales) ───────────────────────────
// https://core.telegram.org/bots/webhooks#the-short-version
export const TELEGRAM_IP_RANGES = [
  '149.154.160.0/20',
  '91.108.4.0/22',
  '95.161.64.0/20',
  '185.76.151.0/24',
];

/**
 * Valida si una IP está en un rango CIDR (IPv4).
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
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

/**
 * Valida si una IP es de Telegram (en producción).
 * En dev/localhost, siempre retorna true.
 */
export function isTelegramIp(ip: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return true;
  return TELEGRAM_IP_RANGES.some(cidr => isIpInCidr(ip, cidr));
}

// ── Validación de webhook secret ───────────────────────────────────────

/**
 * Compara el secret token del header con el esperado.
 * Usa timing-safe comparison para evitar timing attacks.
 */
export function validateWebhookSecret(
  headerSecret: string | null,
  expectedSecret: string | null
): boolean {
  if (!headerSecret || !expectedSecret) return false;
  if (headerSecret.length !== expectedSecret.length) return false;
  // timing-safe comparison
  let result = 0;
  for (let i = 0; i < headerSecret.length; i++) {
    result |= headerSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
  }
  return result === 0;
}
