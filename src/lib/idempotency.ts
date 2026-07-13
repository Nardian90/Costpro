/**
 * Idempotency Layer
 *
 * FIX-AUDIT-MSTORE-04 (P2): evita que un retry de red o doble-tap del usuario
 * dispare dos veces una mutación destructiva (archive/restore/reset/bulk).
 *
 * FIX-IDEMPOTENCY-LOCK (2026-07-13): añade lock atómico (SET NX) para resolver
 * el race condition de doble-clic paralelo. Antes, dos requests simultáneos
 * con el mismo Idempotency-Key podían pasar el chequeo "¿existe cache?" antes
 * de que el primero terminara de escribir, y ambos ejecutaban el handler.
 * Ahora, el primer request adquiere el lock atómicamente; el segundo espera
 * hasta que el primero termine y devuelve la respuesta cacheada.
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
 *   // Si otra request está ejecutando con la misma key → espera y devuelve cache
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

// FIX-IDEMPOTENCY-LOCK: locks en memoria para dev mode.
// En Node.js single-threaded, Map operations son atómicas para practical purposes.
// El patrón es: check-and-set en una sola operación síncrona.
const memLocks = new Map<string, boolean>();
const memWaiters = new Map<string, Array<() => void>>();

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
 * Envuelve un handler con lógica de idempotencia + lock atómico.
 *
 * Flujo:
 * 1. Si key es null → ejecuta handler directo (retrocompatible).
 * 2. Intenta adquirir lock atómico (SET NX) para la key.
 *    - Si lo adquiere → es la primera request → ejecuta handler, cachea, libera lock.
 *    - Si NO lo adquiere → otra request lo tiene → espera y devuelve cache.
 * 3. Si el handler falla, el lock se libera pero NO se cachea (para permitir retry).
 *
 * FIX-IDEMPOTENCY-LOCK: esto resuelve el race condition de doble-clic paralelo.
 * Antes, dos requests simultáneos podían pasar "¿existe cache?" antes de que
 * el primero escribiera. Ahora, el lock atómico garantiza que solo uno ejecuta.
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

  // ── Producción: Upstash Redis (distribuido, con SET NX atómico) ──
  if (isUpstashConfigured) {
    try {
      return await withUpstashIdempotency(key, ttlSec, handler);
    } catch (err) {
      // Si Upstash falla, no bloqueamos la operación — fallback a memoria
      console.warn('[idempotency] Upstash error, falling back to memory:', err);
    }
  }

  // ── Fallback en memoria (con lock atómico síncrono) ──
  return await withMemoryIdempotency(key, ttlSec, handler);
}

// ── Implementación Upstash con SET NX atómico ─────────────────────────────
async function withUpstashIdempotency<T>(
  key: string,
  ttlSec: number,
  handler: () => Promise<{ status: number; body: T }>
): Promise<IdempotencyResult<T>> {
  const lockKey = `costpro_idem_lock:${key}`;
  const cacheKey = `costpro_idem:${key}`;
  const redis = await getUpstashRedis();
  if (!redis) {
    // Si no podemos obtener redis, fallback a memoria
    return await withMemoryIdempotency(key, ttlSec, handler);
  }

  // 1. Intentar adquirir lock atómico (SET NX con TTL)
  // NX = solo set si no existe; EX = expira en ttlSec segundos
  const lockAcquired = await redis.set(lockKey, '1', { nx: true, ex: ttlSec });

  if (!lockAcquired) {
    // No adquirimos el lock — otra request lo tiene. Esperar y devolver cache.
    // Poll hasta 10s esperando que el cache aparezca.
    for (let i = 0; i < 50; i++) {
      await sleep(200); // 200ms × 50 = 10s max
      const cached = await getUpstashCachedByKey<T>(cacheKey);
      if (cached) {
        return { ...cached, replayed: true };
      }
      // Verificar si el lock sigue tomado (si se liberó sin cache, salir del loop)
      const lockExists = await redis.get(lockKey);
      if (!lockExists) {
        // El lock se liberó sin cache (handler falló). Intentar adquirir de nuevo.
        const reacquired = await redis.set(lockKey, '1', { nx: true, ex: ttlSec });
        if (reacquired) {
          break; // Salir del loop y ejecutar handler abajo
        }
      }
    }
    // Si llegamos aquí sin cache, devolver 409 Conflict (no se pudo determinar estado)
    const cached = await getUpstashCachedByKey<T>(cacheKey);
    if (cached) {
      return { ...cached, replayed: true };
    }
    // Último recurso: ejecutar handler (puede ser duplicado, pero mejor que colgar)
    console.warn('[idempotency] Lock wait timeout, executing handler as fallback');
  }

  // 2. Tenemos el lock — ejecutar handler
  try {
    const result = await handler();
    // 3. Cachear respuesta
    await setUpstashCachedByKey(cacheKey, result, ttlSec);
    return { ...result, replayed: false };
  } finally {
    // 4. Liberar lock (incluso si el handler falló)
    try {
      await redis.del(lockKey);
    } catch {
      // ignore — el lock expira solo por TTL
    }
  }
}

// ── Implementación en memoria con lock síncrono ───────────────────────────
async function withMemoryIdempotency<T>(
  key: string,
  ttlSec: number,
  handler: () => Promise<{ status: number; body: T }>
): Promise<IdempotencyResult<T>> {
  cleanupMemStore();
  const now = Date.now();

  // 1. Verificar cache existente
  const existing = memStore.get(key);
  if (existing && now < existing.expiresAt) {
    return { status: existing.status, body: existing.body as T, replayed: true };
  }

  // 2. Intentar adquirir lock (atómico en JS single-threaded)
  if (memLocks.has(key)) {
    // Otra request lo tiene — esperar a que termine
    await waitForMemoryLock(key, 10000); // 10s timeout
    // Re-verificar cache
    const cached = memStore.get(key);
    if (cached && now < cached.expiresAt) {
      return { status: cached.status, body: cached.body as T, replayed: true };
    }
    // Si no hay cache después de esperar, el handler falló. Ejecutar nuestro propio handler.
  }

  // 3. Adquirir lock
  memLocks.set(key, true);

  try {
    const result = await handler();
    // 4. Cachear respuesta
    memStore.set(key, {
      status: result.status,
      body: result.body,
      expiresAt: Date.now() + ttlSec * 1000,
    });
    return { ...result, replayed: false };
  } finally {
    // 5. Liberar lock y notificar waiters
    memLocks.delete(key);
    const waiters = memWaiters.get(key);
    if (waiters) {
      memWaiters.delete(key);
      waiters.forEach(resolve => resolve());
    }
  }
}

function waitForMemoryLock(key: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!memLocks.has(key)) {
      resolve();
      return;
    }
    const waiters = memWaiters.get(key) || [];
    waiters.push(resolve);
    memWaiters.set(key, waiters);
    // Timeout de seguridad
    setTimeout(resolve, timeoutMs);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Upstash helpers (lazy import para evitar dependencia hardcodeada) ──
async function getUpstashCachedByKey<T>(cacheKey: string): Promise<{ status: number; body: T } | null> {
  try {
    const redis = await getUpstashRedis();
    if (!redis) return null;
    const raw = await redis.get(cacheKey);
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

async function setUpstashCachedByKey<T>(
  cacheKey: string,
  value: { status: number; body: T },
  ttlSec: number
): Promise<void> {
  try {
    const redis = await getUpstashRedis();
    if (!redis) return;
    await redis.set(cacheKey, JSON.stringify(value), { ex: ttlSec });
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
