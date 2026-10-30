/**
 * INC-20261030 — Clasificación de errores de auth: transitorio vs definitivo.
 *
 * El 2026-10-30 una caída de Postgres/GoTrue en Supabase (Cloudflare 522 en
 * /auth/v1/*) expulsó al landing a todos los usuarios con sesión válida: los
 * errores transitorios de infraestructura se trataban como logout legítimo.
 * isRetryableAuthOutage es la frontera que separa ambos mundos.
 */
import { describe, it, expect } from 'vitest';
import { isRetryableAuthOutage, AUTH_OUTAGE_RETRY_DELAYS_MS } from '@/lib/auth-outage';

describe('INC-20261030 — isRetryableAuthOutage (transitorio → reintentar)', () => {
  it('timeout del Promise.race de useSessionManager es reintentable', () => {
    expect(isRetryableAuthOutage(new Error('Session check timeout'))).toBe(true);
  });

  it('fallos de red del navegador/undici son reintentables', () => {
    expect(isRetryableAuthOutage(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableAuthOutage(new Error('TypeError: fetch failed'))).toBe(true);
    expect(isRetryableAuthOutage(new Error('load failed'))).toBe(true);
    expect(isRetryableAuthOutage('network request failed')).toBe(true);
  });

  it('AuthRetryableFetchError del SDK es reintentable', () => {
    const err = Object.assign(new Error('AuthRetryableFetchError: fetch failed'), { name: 'AuthRetryableFetchError' });
    expect(isRetryableAuthOutage(err)).toBe(true);
  });

  it('errores 5xx (con status tipado o embebido) son reintentables', () => {
    expect(isRetryableAuthOutage(Object.assign(new Error('GoTrue down'), { status: 503 }))).toBe(true);
    expect(isRetryableAuthOutage({ status: 500, message: 'Internal Server Error' })).toBe(true);
    expect(isRetryableAuthOutage({ message: 'HTTP 522 Connection timed out' })).toBe(true);
    expect(isRetryableAuthOutage('Connection terminated due to connection timeout')).toBe(true);
    expect(isRetryableAuthOutage('socket hang up')).toBe(true);
  });
});

describe('INC-20261030 — isRetryableAuthOutage (definitivo → logout legítimo)', () => {
  it('4xx tipado (token revocado/inválido) NO es reintentable', () => {
    expect(isRetryableAuthOutage(Object.assign(new Error('Invalid JWT'), { status: 401 }))).toBe(false);
    expect(isRetryableAuthOutage(Object.assign(new Error('Forbidden'), { status: 403 }))).toBe(false);
    expect(isRetryableAuthOutage({ status: 400, message: 'Invalid request' })).toBe(false);
  });

  it('fallos de credenciales/protocolo NO son reintentables (evita bucles)', () => {
    expect(isRetryableAuthOutage('Invalid login credentials')).toBe(false);
    expect(isRetryableAuthOutage(new Error('bad_jwt: malformed claim'))).toBe(false);
    expect(isRetryableAuthOutage(new Error('JWT expired'))).toBe(false);
    expect(isRetryableAuthOutage({ code: 'refresh_token_not_found' })).toBe(false);
  });

  it('valores nulos/vacíos no son reintentables', () => {
    expect(isRetryableAuthOutage(null)).toBe(false);
    expect(isRetryableAuthOutage(undefined)).toBe(false);
    expect(isRetryableAuthOutage('')).toBe(false);
  });
});

describe('INC-20261030 — escalera de reintentos acotada', () => {
  it('exactamente 3 reintentos: 5s → 15s → 30s', () => {
    expect(AUTH_OUTAGE_RETRY_DELAYS_MS).toEqual([5_000, 15_000, 30_000]);
    expect(AUTH_OUTAGE_RETRY_DELAYS_MS).toHaveLength(3);
  });
});
