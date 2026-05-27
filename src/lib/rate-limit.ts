// Detecta si Upstash está configurado
const isUpstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// FIX-BUG-SEC-007: Cache of Upstash limiters keyed by `${maxRequests}_${windowSec}`
// so that caller-supplied params are honored instead of using a single fixed limiter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const upstashLimiterCache = new Map<string, any>();

async function getUpstashLimiter(maxRequests: number, windowSec: number) {
  if (!isUpstashConfigured) return null;

  const key = `${maxRequests}_${windowSec}`;
  let limiter = upstashLimiterCache.get(key);
  if (!limiter) {
    try {
      const { Ratelimit } = await import('@upstash/ratelimit');
      const { Redis } = await import('@upstash/redis');

      limiter = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
        analytics: false,
        prefix: 'costpro_rl',
      });
      upstashLimiterCache.set(key, limiter);
    } catch {
      // Paquetes no instalados — fallback a memoria
      return null;
    }
  }
  return limiter;
}

// Fallback en memoria (solo para desarrollo local sin Upstash)
interface MemEntry {
  count: number;
  resetTime: number;
}
const memStore = new Map<string, MemEntry>();
// FIX-RCT-106: Removed global setInterval leak — cleanup is now lazy inside rateLimit()

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
  const windowSec = Math.ceil(windowMs / 1000);

  // FIX-RCT-106: Lazy cleanup — remove expired entries on each call
  // FIX-SEC-016: LRU-style cleanup at 10K entries prevents OOM; for production use Upstash Redis
  if (memStore.size > 10000) {
    const now = Date.now();
    for (const [key, entry] of memStore) {
      if (now > entry.resetTime) memStore.delete(key);
    }
  }

  // Producción: Upstash Redis (distribuido, persiste entre invocaciones serverless)
  // FIX-BUG-SEC-007: Look up/create limiter based on caller params instead of using a single fixed instance
  const upstashLimiter = await getUpstashLimiter(maxRequests, windowSec);
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
