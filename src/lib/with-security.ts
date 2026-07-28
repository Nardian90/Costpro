/**
 * withSecurity — HOF que aplica CSRF + rate limiting a un handler de escritura.
 *
 * Resuelve la deuda técnica de la auto-auditoría V2.12.9 (debilidad #6):
 * muchos endpoints POST/PUT/DELETE no tienen validateOrigin ni rateLimit.
 * En vez de duplicar ~10 líneas en cada uno, este helper lo hace en 1 línea.
 *
 * Uso:
 *   import { withSecurity } from '@/lib/with-security';
 *
 *   async function postHandler(req: NextRequest, session: AuthenticatedSession) {
 *     // ... lógica de negocio
 *   }
 *
 *   export const POST = withAuth(withSecurity(postHandler, {
 *     rateLimitKey: 'purchase-orders:post',
 *     maxRequests: 10,  // 10/min por usuario
 *   }));
 *
 * Si el endpoint YA tiene withAuth aplicado, withSecurity se inserta ENTRE
 * withAuth y el handler, así recibe el session.user.id para el rate limit key.
 *
 * Orden de checks:
 *   1. CSRF (validateOrigin) — antes que rate limit (no gasta quota en CSRF fails)
 *   2. Rate limit — antes que el handler (no ejecuta lógica de negocio si excedido)
 *   3. Handler — solo si ambos pasan
 *
 * Si NO se pasa `rateLimitKey`, se asume que el handler ya tiene su propio rateLimit
 * (caso de endpoints que necesitan keys más específicos). En ese caso solo se aplica CSRF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import type { AuthenticatedSession } from '@/lib/auth-middleware';

export interface SecurityOptions {
  /**
   * Prefijo del rate limit key. Se le concatena el userId y clientIp.
   * Si se omite, no se aplica rate limit (solo CSRF).
   * Ej: 'purchase-orders:post', 'workers:delete'
   */
  rateLimitKey?: string;
  /**
   * Máximo de requests por ventana. Default: 10 (escritura típica).
   * Para endpoints intensivos como AI: 5. Para lecturas pesadas: 30.
   */
  maxRequests?: number;
  /**
   * Ventana en ms. Default: 60_000 (1 minuto).
   */
  windowMs?: number;
}

/**
 * Aplica CSRF + rate limit antes del handler.
 * El handler debe aceptar (req, session) — se asume que withAuth ya extrajo la sesión.
 */
export function withSecurity<T extends (req: NextRequest, session: AuthenticatedSession) => any>(
  handler: T,
  options: SecurityOptions = {},
): T {
  const { rateLimitKey, maxRequests = 10, windowMs = 60_000 } = options;

  return (async (req: NextRequest, session: AuthenticatedSession) => {
    // 1. CSRF validation (before rate limit — no gasta quota en CSRF fails)
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    // 2. Rate limit (si se configuró key)
    if (rateLimitKey) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
      const userId = session?.user?.id || 'anonymous';
      const rlKey = `${rateLimitKey}:${userId}:${clientIp}`;
      const { allowed, remaining, resetAt } = await rateLimit(rlKey, { windowMs, maxRequests });
      if (!allowed) {
        return NextResponse.json(createApiError('RATE_LIMITED'), {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetAt.toISOString(),
            'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
          },
        });
      }
      // Attach remaining info to response headers (opcional, info para el cliente)
      const response = await handler(req, session);
      if (response instanceof NextResponse) {
        response.headers.set('X-RateLimit-Remaining', String(remaining));
        response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
      }
      return response;
    }

    // 3. Handler (sin rate limit, solo CSRF aplicado)
    return handler(req, session);
  }) as T;
}

/**
 * Variante para handlers que NO usan withAuth (p.ej. webhooks públicos).
 * Solo aplica CSRF si el handler lo requiere explícitamente.
 */
export function withSecurityNoAuth<T extends (req: NextRequest) => any>(
  handler: T,
  options: SecurityOptions = {},
): T {
  const { rateLimitKey, maxRequests = 10, windowMs = 60_000 } = options;

  return (async (req: NextRequest) => {
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    if (rateLimitKey) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
      const rlKey = `${rateLimitKey}:anon:${clientIp}`;
      const { allowed, remaining, resetAt } = await rateLimit(rlKey, { windowMs, maxRequests });
      if (!allowed) {
        return NextResponse.json(createApiError('RATE_LIMITED'), {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetAt.toISOString(),
            'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
          },
        });
      }
    }

    return handler(req);
  }) as T;
}
