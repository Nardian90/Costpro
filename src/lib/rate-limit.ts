// ═══════════════════════════════════════════════════════════════════════════
// CP-SEC-RATELIMIT — rate limit DISTRIBUIDO (misión CP-SECURITY-AND-BACKLOG-
// CLOSURE-001, 2026-11-14)
//
// Cadenas de almacenamiento (en orden):
//   1) Upstash Redis — SOLO si UPSTASH_REDIS_REST_URL/TOKEN están
//      configurados (opcional; no forma parte de la infra del proyecto).
//   2) PostgreSQL (Supabase) — ALMACÉN COMPARTIDO por defecto: tabla
//      rate_limit_buckets + RPC rate_limit_take (incremento atómico por
//      UPSERT). Todos los procesos/instancias serverless comparten el MISMO
//      contador (infraestructura EXISTENTE del proyecto; sin Redis ni
//      servicios externos nuevos).
//   3) Memoria local — último recurso (por instancia; NO es una solución
//      distribuida): se usa solo si la BD tampoco responde, según la
//      política de fallo.
//
// POLÍTICA DE FALLO EXPLÍCITA (misión §6.10):
//   · failMode 'open' (por defecto): si Upstash y Postgres fallan, se
//     PERMITE la petición (disponibilidad prioritaria) con aviso en logs y
//     contador de memoria como mejor esfuerzo.
//   · failMode 'closed': para operaciones de AUTENTICACIÓN y SEGURIDAD
//     (p. ej. supervisor-check): si el almacén compartido no puede
//     verificar el límite, se DENIEGA (429) — la protección no se diluye
//     por una degradación de la infraestructura. Coherente con el hecho de
//     que esas rutas dependen de la misma BD: si ella está caída, la
//     operación de todos modos no puede completarse.
//
// V1.1 (FIX-BUG-SEC-007): cache de limiters Upstash por parámetros.
// FIX-RCT-106: limpieza lazy del Map (sin setInterval).
// FIX-SEC-016: limpieza LRU a 10K entradas.
// ═══════════════════════════════════════════════════════════════════════════

import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

// Detecta si Upstash está configurado
// V1.1: En producción (Vercel/serverless), Upstash Redis hace que el rate
// limit sea distribuido. Si no está configurado, el almacén compartido es
// PostgreSQL (Supabase) — ver takePostgres().
const isUpstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

if (!isUpstashConfigured && process.env.NODE_ENV === 'production') {
  console.info('[RATE-LIMIT] Upstash no configurado — usando el almacén compartido PostgreSQL (rate_limit_buckets).');
}

// FIX-BUG-SEC-007: Cache of Upstash limiters keyed by `${maxRequests}_${windowSec}`
// so that caller-supplied params are honored instead of using a single fixed limiter.
const upstashLimiterCache = new Map<string, any>();

async function getUpstashLimiter(maxRequests: number, windowSec: number) {
  if (!isUpstashConfigured) return null;

  const key = `${maxRequests}_${windowSec}`;
  let limiter = upstashLimiterCache.get(key);
  if (!limiter) {
    try {
      // Use Function constructor to prevent webpack from statically analyzing this import.
      // When @upstash/ratelimit and @upstash/redis are not installed, this will throw
      // at runtime and fall back to the Postgres store.
      const upstashModules: { Ratelimit: any; Redis: any } = await new Function(
        'return Promise.all([import("@upstash/ratelimit"), import("@upstash/redis")]).then(([r, d]) => ({ Ratelimit: r.Ratelimit, Redis: d.Redis }))'
      )();

      limiter = new upstashModules.Ratelimit({
        redis: upstashModules.Redis.fromEnv(),
        limiter: upstashModules.Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
        analytics: false,
        prefix: 'costpro_rl',
      });
      upstashLimiterCache.set(key, limiter);
    } catch {
      // Paquetes no instalados — continuar con el almacén PostgreSQL
      return null;
    }
  }
  return limiter;
}

// ── Almacén PostgreSQL (Supabase): RPC atómico rate_limit_take ──
// CP-SEC-RATELIMIT: único punto de acceso al almacén compartido. El RPC
// incrementa de forma atómica (UPSERT) y devuelve {allowed, count, limit,
// reset_at}. Idempotente respecto a reintentos de red: cada llamada consume
// un golpe (conservador — preferible contar de más que de menos).
async function takePostgres(
  identifier: string,
  maxRequests: number,
  windowSec: number
): Promise<{ ok: true; result: RateLimitResult } | { ok: false; error: string }> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return { ok: false, error: 'supabase-admin-no-configurado' };
  try {
    const { data, error } = await admin.rpc('rate_limit_take', {
      p_bucket_key: identifier.slice(0, 300),
      p_limit: maxRequests,
      p_window_seconds: windowSec,
    });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data.allowed !== 'boolean' || !data.reset_at) {
      return { ok: false, error: 'respuesta-invalida-del-rpc' };
    }
    const count = Number(data.count ?? 0);
    return {
      ok: true,
      result: {
        allowed: data.allowed,
        remaining: Math.max(0, maxRequests - count),
        resetAt: new Date(data.reset_at),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Fallback en memoria (SOLO último recurso por instancia — no distribuido)
interface MemEntry {
  count: number;
  resetTime: number;
}
const memStore = new Map<string, MemEntry>();

function takeMemory(identifier: string, windowMs: number, maxRequests: number): RateLimitResult {
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

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  /**
   * Política de fallo cuando NINGÚN almacén compartido responde:
   * - 'open' (default): permitir (disponibilidad; aviso en logs + memoria local).
   * - 'closed': denegar (429) — para rutas de autenticación/seguridad donde
   *   la protección no debe diluirse por degradación de infraestructura.
   */
  failMode?: 'open' | 'closed';
}

/**
 * Rate limiter distribuido:
 *   1) Upstash Redis (si está configurado)
 *   2) PostgreSQL compartido (Supabase — rate_limit_take)
 *   3) Memoria local (último recurso, sujeto a failMode)
 */
export async function rateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const { windowMs = 60_000, maxRequests = 30, failMode = 'open' } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  // FIX-RCT-106: Lazy cleanup — remove expired entries on each call
  // FIX-SEC-016: LRU-style cleanup at 10K entries prevents OOM
  if (memStore.size > 10000) {
    const now = Date.now();
    for (const [key, entry] of memStore) {
      if (now > entry.resetTime) memStore.delete(key);
    }
  }

  // 1) Upstash Redis (si está configurado)
  const upstashLimiter = await getUpstashLimiter(maxRequests, windowSec);
  if (upstashLimiter) {
    try {
      const { success, remaining, reset } = await upstashLimiter.limit(identifier);
      return {
        allowed: success,
        remaining,
        resetAt: new Date(reset),
      };
    } catch (upstashErr) {
      // Upstash falló (WRONGPASS, red, etc.) — invalidar cache y caer al
      // almacén PostgreSQL (también distribuido)
      console.warn('[RATE-LIMIT] Upstash error, cayendo a PostgreSQL:', upstashErr instanceof Error ? upstashErr.message : String(upstashErr));
      upstashLimiterCache.delete(`${maxRequests}_${windowSec}`);
    }
  }

  // 2) Almacén PostgreSQL compartido (distribuido)
  const pg = await takePostgres(identifier, maxRequests, windowSec);
  if (pg.ok) {
    return pg.result;
  }

  // 3) Ningún almacén compartido disponible → política de fallo explícita
  if (failMode === 'closed') {
    console.warn('[RATE-LIMIT] FAIL-CLOSED: almacén compartido no disponible (%s) — denegando %s', pg.error, identifier);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + windowMs),
    };
  }
  console.warn('[RATE-LIMIT] FAIL-OPEN: almacén compartido no disponible (%s) — permitiendo %s con contador local (no distribuido)', pg.error, identifier);
  return takeMemory(identifier, windowMs, maxRequests);
}
