import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Detecta si Upstash está configurado
const isUpstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Rate limiter distribuido (producción)
let upstashLimiter: Ratelimit | null = null;
if (isUpstashConfigured) {
  upstashLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(30, '60 s'),
    analytics: false,
    prefix: 'costpro_rl',
  });
}

// Fallback en memoria (solo para desarrollo local sin Upstash)
interface MemEntry {
  count: number;
  resetTime: number;
}
const memStore = new Map<string, MemEntry>();
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memStore) {
      if (now > entry.resetTime) memStore.delete(key);
    }
  }, 60_000);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Rate limiter que usa Upstash Redis en producción y un Map en memoria en desarrollo.
 * La firma es async para soportar Upstash, aunque el fallback es síncrono internamente.
 */
export async function rateLimit(
  identifier: string,
  options: { windowMs?: number; maxRequests?: number } = {}
): Promise<RateLimitResult> {
  const { windowMs = 60_000, maxRequests = 30 } = options;

  // Producción: Upstash Redis (distribuido, persiste entre invocaciones serverless)
  if (upstashLimiter) {
    const { success, remaining, reset } = await upstashLimiter.limit(identifier);
    return {
      allowed: success,
      remaining,
      resetAt: new Date(reset),
    };
  }

  // Desarrollo: fallback en memoria (no apto para producción)
  const now = Date.now();
  const entry = memStore.get(identifier);
  if (!entry || now > entry.resetTime) {
    memStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetTime) };
  }
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: new Date(entry.resetTime) };
}