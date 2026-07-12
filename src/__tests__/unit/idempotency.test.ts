import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * FIX-AUDIT-MSTORE-04 (P2): Tests unitarios del módulo de idempotencia.
 *
 * Verifica el comportamiento clave:
 *   - Sin key → ejecuta handler directo, replayed=false
 *   - Primera llamada con key → ejecuta handler, cachea, replayed=false
 *   - Segunda llamada con misma key → devuelve cache, replayed=true, NO ejecuta handler
 *   - Keys diferentes → ejecutan independientemente
 *   - Respeta el status code cacheado (incluyendo errores)
 */

import { withIdempotency } from '@/lib/idempotency';

describe('FIX-AUDIT-MSTORE-04: withIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin key (null) ejecuta el handler directo y devuelve replayed=false', async () => {
    const handler = vi.fn(async () => ({ status: 200, body: { success: true } }));
    const result = await withIdempotency(null, 60, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(result.replayed).toBe(false);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
  });

  it('primera llamada con key ejecuta el handler y devuelve replayed=false', async () => {
    const handler = vi.fn(async () => ({ status: 200, body: { ok: 1 } }));
    const result = await withIdempotency('test-key-1', 60, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(result.replayed).toBe(false);
    expect(result.body).toEqual({ ok: 1 });
  });

  it('segunda llamada con la MISMA key NO ejecuta el handler y devuelve replayed=true', async () => {
    const handler = vi.fn(async () => ({ status: 200, body: { ok: 2 } }));
    // Primera llamada
    const r1 = await withIdempotency('test-key-2', 60, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(r1.replayed).toBe(false);
    expect(r1.body).toEqual({ ok: 2 });

    // Segunda llamada con misma key
    const r2 = await withIdempotency('test-key-2', 60, handler);
    expect(handler).toHaveBeenCalledOnce(); // NO se llama de nuevo
    expect(r2.replayed).toBe(true);
    expect(r2.body).toEqual({ ok: 2 }); // respuesta cacheada
    expect(r2.status).toBe(200);
  });

  it('keys diferentes ejecutan el handler independientemente', async () => {
    const handler = vi.fn(async () => ({ status: 200, body: { n: Math.random() } }));
    await withIdempotency('key-a-different', 60, handler);
    await withIdempotency('key-b-different', 60, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('respeta el status code cacheado (incluyendo errores)', async () => {
    const handler = vi.fn(async () => ({ status: 500, body: { error: 'fail' } }));
    const r1 = await withIdempotency('test-key-err-unique', 60, handler);
    expect(r1.status).toBe(500);
    expect(r1.replayed).toBe(false);

    // Segunda llamada: debe devolver el mismo 500 cacheado, no re-ejecutar
    const r2 = await withIdempotency('test-key-err-unique', 60, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(r2.status).toBe(500);
    expect(r2.replayed).toBe(true);
  });
});
