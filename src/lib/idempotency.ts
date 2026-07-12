/**
 * Idempotency Layer
 *
 * FIX-AUDIT-MSTORE-04 (P2): evita que un retry de red o doble-tap del usuario
 * dispare dos veces una mutación destructiva (archive/restore/reset/bulk).
 *
 * Patrón dual (igual que rate-limit.ts):
 *   - Upstash Redis en producción (distribuido, persiste entre invocaciones serverless)
 *   - Map en memoria como fallback en dev (no apto para producción)
 *
 * API:
 *   const { status, body, replayed } = await withIdempotency(
 *     idemKey,         // string | null — si null, se ejecuta el handler directo
 *     ttlSec,          // tiempo de vida del cache
 *     async () => {    // handler que produce la respuesta
 *       // ... mutación destructiva ...
 *       return { status: 200, body: { success: true } };
 *     }
 *   );
 *   // Si idemKey ya tenía respuesta cacheada → se devuelve esa, replayed=true
 *   // Si es primera vez → se ejecuta handler, se cachea, replayed=false
 *
 * El header HTTP `X-Idempotent-Replay: true` lo añade la ruta llamadora,
 * este módulo solo expone el flag `replayed` para que la ruta decida.
 */

const isUpstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// ── Fallback en memoria (solo para desarrollo local sin Upstash) ──
interface MemEntry {
  status: number;
  body: unknown;
  expiresAt: number;
}
const memStore = new Map<string, MemEntry>();

// LRU-style cleanup at 10K entries prevents OOM; for production use Upstash Redis
function cleanupMemStore() {
  if (memStore.size < 10000) return;
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now > entry.expiresAt) memStore.delete(key);
  }
}

export interface IdempotencyResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

/**
 * Envuelve un handler con lógica de idempotencia.
 *
 * - Si `key` es null → ejecuta el handler normal, replayed=false (retrocompatible).
 * - Si `key` existe y ya hay una respuesta cacheada → la devuelve, replayed=true,
 *   SIN re-ejecutar el handler.
 * - Si `key` existe y es la primera vez → ejecuta el handler, cachea {status, body}
 *   por ttlSec, devuelve replayed=false.
 *
 * IMPORTANTE: el handler debe ser idempotente en sí mismo SI la mutación ya se aplicó
 * pero el cache se perdió (ej: expiró). Para mutaciones muy destructivas como reset,
 * se recomienda validar el estado actual antes de reaplicar.
 *
 * Nota de tipos: T se infiere del handler. Si el handler retorna diferentes shapes
 * (éxito vs error), T será una union — el caller debe hacer narrowing con `status`
 * o con `as` si conoce el contexto.
 */
export async function withIdempotency<T = unknown>(
  key: string | null,
  ttlSec: number,
  handler: () => Promise<{ status: number; body: T }>
): Promise<IdempotencyResult<T>> {
  // Sin key → comportamiento original, no rompe clientes que no envían el header
  if (!key) {
    const result = await handler();
    return { ...result, replayed: false };
  }

  // ── Producción: Upstash Redis (distribuido) ──
  if (isUpstashConfigured) {
    try {
      const cached = await getUpstashCached<T>(key);
      if (cached) {
        return { ...cached, replayed: true };
      }
      const result = await handler();
      await setUpstashCached(key, result, ttlSec);
      return { ...result, replayed: false };
    } catch (err) {
      // Si Upstash falla, no bloqueamos la operación — fallback a memoria
      console.warn('[idempotency] Upstash error, falling back to memory:', err);
    }
  }

  // ── Fallback en memoria ──
  cleanupMemStore();
  const now = Date.now();
  const existing = memStore.get(key);
  if (existing && now < existing.expiresAt) {
    return { status: existing.status, body: existing.body as T, replayed: true };
  }

  const result = await handler();
  memStore.set(key, {
    status: result.status,
    body: result.body,
    expiresAt: now + ttlSec * 1000,
  });
  return { ...result, replayed: false };
}

// ── Upstash helpers (lazy import para evitar dependencia hardcodeada) ──
async function getUpstashCached<T>(key: string): Promise<{ status: number; body: T } | null> {
  try {
    const redis = await getUpstashRedis();
    if (!redis) return null;
    const raw = await redis.get(`costpro_idem:${key}`);
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed.status === 'number' && 'body' in parsed) {
      return { status: parsed.status, body: parsed.body as T };
    }
    return null;
  } catch {
    return null;
  }
}

async function setUpstashCached<T>(
  key: string,
  value: { status: number; body: T },
  ttlSec: number
): Promise<void> {
  try {
    const redis = await getUpstashRedis();
    if (!redis) return;
    await redis.set(`costpro_idem:${key}`, JSON.stringify(value), { ex: ttlSec });
  } catch (err) {
    console.warn('[idempotency] Failed to cache in Upstash:', err);
  }
}

let upstashRedis: any = null;
async function getUpstashRedis(): Promise<any> {
  if (upstashRedis) return upstashRedis;
  try {
    // Use Function constructor to prevent webpack from statically analyzing this import
    const mod: any = await new Function('return import("@upstash/redis")')();
    upstashRedis = mod.Redis.fromEnv();
    return upstashRedis;
  } catch {
    return null;
  }
}
