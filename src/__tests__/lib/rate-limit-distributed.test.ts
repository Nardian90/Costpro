/**
 * CP-SEC-RATELIMIT — pruebas unitarias del limiter distribuido.
 *
 * Cubre (misión §6):
 *   · Cadena de almacenamiento: sin Upstash → almacén PostgreSQL (RPC
 *     rate_limit_take) — el Map en memoria NO se usa mientras la BD responda.
 *   · Política de fallo EXPLÍCITA:
 *       failMode 'open' (por defecto): BD caída → permite + contador local.
 *       failMode 'closed': BD caída → deniega (rutas de autenticación).
 *   · Upstash sigue siendo el nivel 1 si está configurado (aquí se fuerza su
 *     ausencia para ejercitar el almacén compartido).
 *
 * La prueba de CONCURRENCIA REAL entre procesos (límite compartido) vive en
 * scripts/rate-limit-concurrency-proof.mjs (contra la BD aislada E2E) porque
 * requiere procesos independientes y base de datos real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    rpc: (name: string, params: Record<string, unknown>) => rpcMock(name, params),
  }),
}));

// Importar DESPUÉS de mockear supabase-admin
import { rateLimit } from '@/lib/rate-limit';

describe('CP-SEC-RATELIMIT — limiter distribuido (almacén PostgreSQL + política de fallo)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    // Forzar la ausencia de Upstash para ejercitar el almacén compartido
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('1. sin Upstash usa el RPC rate_limit_take (almacén COMPARTIDO, no memoria)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { allowed: true, count: 1, limit: 5, reset_at: '2026-11-14T12:00:01Z' },
      error: null,
    });
    const r = await rateLimit('prueba:clave', { windowMs: 60_000, maxRequests: 5 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.resetAt).toEqual(new Date('2026-11-14T12:00:01Z'));
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(rpcMock.mock.calls[0][0]).toBe('rate_limit_take');
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_bucket_key: 'prueba:clave',
      p_limit: 5,
      p_window_seconds: 60,
    });
  });

  it('2. respeta el veredicto del almacén compartido (denegado al superar el límite)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { allowed: false, count: 6, limit: 5, reset_at: '2026-11-14T12:00:01Z' },
      error: null,
    });
    const r = await rateLimit('prueba:clave', { windowMs: 60_000, maxRequests: 5 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('3. fail-open (default): si la BD falla, PERMITE y usa memoria local como mejor esfuerzo', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    const r1 = await rateLimit('prueba:fail-open', { windowMs: 60_000, maxRequests: 2 });
    expect(r1.allowed).toBe(true);

    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    const r2 = await rateLimit('prueba:fail-open', { windowMs: 60_000, maxRequests: 2 });
    expect(r2.allowed).toBe(true);

    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    const r3 = await rateLimit('prueba:fail-open', { windowMs: 60_000, maxRequests: 2 });
    expect(r3.allowed).toBe(false); // memoria local: 3.ª llamada supera el límite de 2
  });

  it('4. fail-closed: si la BD falla, DENIEGA (protección de autenticación/seguridad)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    const r = await rateLimit('supervisor-check:u1', {
      windowMs: 60_000,
      maxRequests: 5,
      failMode: 'closed',
    });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('5. fail-closed también ante respuesta inválida del RPC (fail-closed total)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // respuesta sin data
    const r = await rateLimit('x', { windowMs: 60_000, maxRequests: 5, failMode: 'closed' });
    expect(r.allowed).toBe(false);
  });

  it('6. excepción de red en el RPC → respeta la política de fallo', async () => {
    rpcMock.mockRejectedValueOnce(new Error('fetch failed'));
    const open = await rateLimit('y', { windowMs: 60_000, maxRequests: 5 });
    expect(open.allowed).toBe(true); // fail-open por defecto

    rpcMock.mockRejectedValueOnce(new Error('fetch failed'));
    const closed = await rateLimit('y', { windowMs: 60_000, maxRequests: 5, failMode: 'closed' });
    expect(closed.allowed).toBe(false); // fail-closed explícito
  });

  it('7. clave truncada a 300 caracteres (contrato del RPC)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { allowed: true, count: 1, limit: 5, reset_at: '2026-11-14T12:00:01Z' },
      error: null,
    });
    await rateLimit('k'.repeat(500), { windowMs: 60_000, maxRequests: 5 });
    expect(rpcMock.mock.calls[0][1].p_bucket_key).toHaveLength(300);
  });
});
