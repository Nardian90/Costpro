/**
 * INC-20261030 — Resiliencia de sesión ante caída del backend de auth (GoTrue/Postgres).
 *
 * Incidente: el 2026-10-30 la instancia Postgres del proyecto Supabase dejó de
 * aceptar conexiones (Cloudflare 522 en /auth/v1/*, "Connection terminated due
 * to connection timeout" en la Management API). GoTrue quedó inalcanzable y
 * TODOS los clientes con sesión activa fueron expulsados al landing: el check
 * de sesión (getUser) colgaba → timeouts → logout()/unauthenticated, aunque la
 * sesión local (localStorage sb-*-auth-token) seguía presente y el fallo era
 * de infraestructura, no de credenciales.
 *
 * Contrato:
 *  · Un error TRANSITORIO de red/5xx/timeout durante la verificación de sesión
 *    NO es un logout válido: se conserva la sesión local y se programa un
 *    reintento con escalado (5s → 15s → 30s). Máx. 3 reintentos; agotados,
 *    se aplica el comportamiento previo (logout/unauthenticated acotado).
 *  · Un error DEFINITIVO de credenciales (400/401/403, invalid_credentials,
 *    bad_jwt, token expirado) SÍ es logout inmediato, como siempre.
 */

/** Escalado de reintentos ante caída del backend de auth (ms). */
export const AUTH_OUTAGE_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000];

const RETRYABLE_PATTERNS = [
  'session check timeout', // Promise.race de useSessionManager (GoTrue colgado)
  'profile fetch timeout', // Promise.race del perfil
  'fetch failed', // undici / supabase-js AuthRetryableFetchError
  'failed to fetch', // navegador
  'networkerror',
  'network error',
  'network request failed',
  'load failed', // fetch en runtimes webkit/undici
  'authretryablefetcherror', // clase del SDK de supabase-js
  'econnreset',
  'econnrefused',
  'etimedout',
  'ehostunreach',
  'enotfound',
  'socket hang up',
  'connection terminated',
  'connection timed out',
  'connection refused',
  'timeout',
] as const;

const DEFINITIVE_PATTERNS = [
  'invalid login credentials',
  'invalid credentials',
  'email not confirmed',
  'bad jwt',
  'invalid claim',
  'jwt expired',
  'refresh_token_not_found',
  'invalid refresh token',
  'user banned',
  'user not found',
] as const;

/**
 * true si el error durante la verificación de sesión es transitorio
 * (infraestructura de auth caída o red) → reintentar conserva la sesión.
 * false si es un fallo definitivo de credenciales → logout legítimo.
 */
export function isRetryableAuthOutage(err: unknown): boolean {
  if (!err) return false;

  // Errores tipados del SDK (AuthApiError/AuthRetryableFetchError exponen status)
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number') {
    if (status >= 400 && status < 500) return false; // 4xx → credenciales/protocolo: definitivo
    if (status >= 500) return true; // 5xx → backend caído: transitorio
  }

  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? `${err.name}: ${err.message}`
        : (() => {
            try {
              return JSON.stringify(err) ?? '';
            } catch {
              return String(err);
            }
          })();

  const norm = raw.toLowerCase();

  // Fallos definitivos de credenciales: nunca reintentar (evita bucles con
  // token revocado/expirado que ya no puede validarse).
  if (DEFINITIVE_PATTERNS.some((p) => norm.includes(p))) return false;

  return (
    RETRYABLE_PATTERNS.some((p) => norm.includes(p)) ||
    // Códigos HTTP 5xx embebidos en el mensaje/JSON del error
    /(^|[^0-9])5[0-9]{2}([^0-9]|$)/.test(norm)
  );
}
