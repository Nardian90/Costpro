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

// ── FIX-IDEMPOTENCY-LOCK (2026-07-13): Tests de race condition ───────────
//
// Estos tests verifican que el lock atómico funciona correctamente cuando
// dos requests con la misma Idempotency-Key llegan verdaderamente en paralelo
// (no un retry secuencial, sino dos al mismo tiempo — ej: doble-tap que dispara
// dos conexiones simultáneas).
//
// Antes del lock, ambas podían pasar el chequeo "¿existe cache?" antes de que
// la primera terminara de escribir, y las dos ejecutaban el handler.
// Ahora, el primer request adquiere el lock; el segundo espera y devuelve cache.
describe('FIX-IDEMPOTENCY-LOCK: race condition doble-clic paralelo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dos requests simultáneos con la misma key → solo uno ejecuta el handler', async () => {
    // Handler con delay simulado (200ms) para reproducir el race condition
    let callCount = 0;
    const handler = vi.fn(async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 200));
      return { status: 200, body: { callCount, timestamp: Date.now() } };
    });

    // Disparar dos requests en paralelo con la misma key
    const results = await Promise.all([
      withIdempotency('race-key-1', 60, handler),
      withIdempotency('race-key-1', 60, handler),
    ]);

    // Solo uno debe haber ejecutado el handler
    expect(handler).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(1);

    // El primer resultado no es replay
    const [r1, r2] = results;
    const firstResult = r1.replayed ? r2 : r1;
    const secondResult = r1.replayed ? r1 : r2;

    expect(firstResult.replayed).toBe(false);
    expect(secondResult.replayed).toBe(true);

    // Ambos devuelven el mismo body (el del primer ejecutor)
    expect(firstResult.body).toEqual(secondResult.body);
  });

  it('tres requests simultáneos con la misma key → solo uno ejecuta el handler', async () => {
    let callCount = 0;
    const handler = vi.fn(async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 150));
      return { status: 200, body: { callCount } };
    });

    const results = await Promise.all([
      withIdempotency('race-key-2', 60, handler),
      withIdempotency('race-key-2', 60, handler),
      withIdempotency('race-key-2', 60, handler),
    ]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(1);

    // Exactamente uno no es replay, los demás sí
    const nonReplayed = results.filter(r => !r.replayed);
    const replayed = results.filter(r => r.replayed);
    expect(nonReplayed).toHaveLength(1);
    expect(replayed).toHaveLength(2);

    // Todos devuelven el mismo body
    const body = nonReplayed[0].body;
    for (const r of results) {
      expect(r.body).toEqual(body);
    }
  });

  it('si el handler falla, el lock se libera y permite retry', async () => {
    let callCount = 0;
    const handler = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('first call fails');
      }
      return { status: 200, body: { success: true, callCount } };
    });

    // Primera llamada falla
    try {
      await withIdempotency('race-key-fail', 60, handler);
    } catch {
      // esperado
    }
    expect(callCount).toBe(1);

    // Segunda llamada (después de que el lock se liberó) debe ejecutar el handler
    const result = await withIdempotency('race-key-fail', 60, handler);
    expect(callCount).toBe(2);
    expect(result.replayed).toBe(false);
    expect(result.body).toEqual({ success: true, callCount: 2 });
  });

  it('keys diferentes en paralelo → ambos ejecutan independientemente', async () => {
    const handler1 = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { status: 200, body: { key: 'a' } };
    });
    const handler2 = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { status: 200, body: { key: 'b' } };
    });

    const [r1, r2] = await Promise.all([
      withIdempotency('parallel-key-a', 60, handler1),
      withIdempotency('parallel-key-b', 60, handler2),
    ]);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(false);
    expect(r1.body).toEqual({ key: 'a' });
    expect(r2.body).toEqual({ key: 'b' });
  });
});
