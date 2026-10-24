import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * MISIÓN «SISTEMA → SALUD» (2026-10-24) — Semántica de «Refrescar núcleo» (FASE D).
 *
 * Contrato verificado:
 *   1. Carga inicial ejecuta UNA consulta real (fetch /api/intelligence, no-store).
 *   2. Guardia in-flight: pulsaciones repetidas NO generan solicitudes redundantes.
 *   3. Éxito total → refreshState 'ok' (Actualizado); parcial → 'partial'.
 *   4. Fallo del refresco CON datos previos → se conservan los últimos resultados
 *      válidos (dataStale, «Datos anteriores») y el error queda visible.
 *   5. Fallo inicial SIN datos → error y sin datos (nada que exhibir como vivo).
 *   6. Reintentos automáticos solo en la carga inicial; el refresco manual es de
 *      un intento (la latencia/fallo no se oculta tras reintentos silenciosos).
 *   7. Sin auto-refresh por intervalo: la consulta ocurre al montar y al pulsar.
 */

vi.mock('@/store', () => ({
  useAuthStore: {
    getState: () => ({ token: 'test-token' }),
  },
}));

import { useHealthData, type HealthData } from '@/components/views/health/hooks/useHealthData';

function fixture(overrides: Partial<HealthData> = {}): HealthData {
  return {
    app: { version: '0.2.0', environment: 'development' },
    generatedAt: '2026-10-24T12:00:00.000Z',
    checks: {
      api: { name: 'API', status: 'ok', latencyMs: 5, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Endpoint operativo' },
      database: { name: 'Base de datos', status: 'ok', latencyMs: 120, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Consulta de solo lectura completada' },
      auth: { name: 'Sesión', status: 'ok', latencyMs: null, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Sesión de administrador validada' },
    },
    checkSummary: { total: 3, passed: 3, failed: 0, status: 'ok' },
    knowledgeSources: [],
    sourcesSummary: { total: 5, ok: 5, failed: 0 },
    contentSummary: { components: 725, layers: 8, workflows: 12, graphNodes: 462, graphLinks: 2369, appViews: 40 },
    docsList: ['docs/guide.md'],
    docsSummary: { count: 1 },
    ...overrides,
  };
}

function okResponse(payload: HealthData) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useHealthData — Refrescar núcleo', () => {
  it('1. La carga inicial ejecuta exactamente una consulta al endpoint (no-store)', async () => {
    fetchMock.mockResolvedValue(okResponse(fixture()));
    const { result } = renderHook(() => useHealthData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/intelligence');
    expect(init.cache).toBe('no-store');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    expect(result.current.data?.app.version).toBe('0.2.0');
    expect(result.current.refreshState).toBe('ok');
    expect(result.current.dataStale).toBe(false);
    expect(result.current.lastRefresh).toBeInstanceOf(Date);
    expect(result.current.error).toBeNull();
  });

  it('2. Pulsaciones repetidas NO generan solicitudes paralelas redundantes (guardia in-flight)', async () => {
    // Carga inicial resuelta.
    fetchMock.mockResolvedValueOnce(okResponse(fixture()));
    const { result } = renderHook(() => useHealthData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segunda consulta en curso (pendiente controlada)…
    let resolveSecond: (v: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((res) => { resolveSecond = res; }));

    act(() => result.current.refetch());
    // …dos pulsaciones extra mientras está en curso: se ignoran.
    act(() => result.current.refetch());
    act(() => result.current.refetch());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.refreshState).toBe('refreshing');

    await act(async () => {
      resolveSecond(okResponse(fixture()));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    // Sigue habiendo solo DOS consultas en total: la inicial + una manual.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('3. Respuesta con comprobación degradada → refreshState «partial» (Actualizado parcialmente)', async () => {
    const degraded = fixture({
      checks: {
        api: { name: 'API', status: 'ok', latencyMs: 5, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Endpoint operativo' },
        database: { name: 'Base de datos', status: 'error', latencyMs: null, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'No se pudo conectar con la base de datos (categoría: conectividad)' },
        auth: { name: 'Sesión', status: 'ok', latencyMs: null, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Sesión de administrador validada' },
      },
      checkSummary: { total: 3, passed: 2, failed: 1, status: 'degraded' },
    });
    fetchMock.mockResolvedValue(okResponse(degraded));

    const { result } = renderHook(() => useHealthData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.refreshState).toBe('partial');
    expect(result.current.dataStale).toBe(false);
  });

  it('4. Fallo del refresco con datos previos: se conservan («Datos anteriores») y el error queda visible', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(fixture()));
    const { result } = renderHook(() => useHealthData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstData = result.current.data;
    expect(firstData).not.toBeNull();

    // El refresco manual falla (red caída)…
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.refreshState).toBe('failed'));

    // …pero los datos de la última lectura válida SE CONSERVAN y se marcan como anteriores.
    expect(result.current.data).toBe(firstData);
    expect(result.current.dataStale).toBe(true);
    expect(result.current.error).toContain('Failed to fetch');
  });

  it('5. Fallo inicial sin datos: error visible y NADA presentado como actualizado', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useHealthData());

      // Agota los reintentos de la carga inicial (backoff 2s+4s+6s) y asienta
      // los microtasks con advanceTimersByTimeAsync (compatible fake timers).
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_000);
        });
      }

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toContain('Failed to fetch');
      expect(result.current.refreshState).toBe('failed');
      expect(result.current.dataStale).toBe(false);
      expect(fetchMock.mock.calls.length).toBe(4); // 1 inicial + 3 reintentos.
    } finally {
      vi.useRealTimers();
    }
  });

  it('6. El refresco manual NO reintenta automáticamente: un intento, un resultado', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(fixture()));
    const { result } = renderHook(() => useHealthData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRejectedValueOnce(new Error('Error 500: Internal Server Error'));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.refreshState).toBe('failed'));

    // Sin temporizadores avanzados: no se programó ningún reintento del manual.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toContain('500');
  });

  it('7. Sin auto-refresh por intervalo: los datos no cambian solos', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(okResponse(fixture()));
      const { result } = renderHook(() => useHealthData());

      // Asienta la carga inicial (microtasks) sin waitFor de timers reales.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(result.current.loading).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 90 s de «tiempo real» sin interacción del usuario: ninguna consulta extra.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(90_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.lastRefresh).toBeInstanceOf(Date);
      expect(result.current.refreshState).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('8. Carga del grafo bajo demanda (?include=graph) con guardia in-flight propia', async () => {
    fetchMock.mockResolvedValue(okResponse(fixture()));
    const { result } = renderHook(() => useHealthData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const graphPayload = fixture({ knowledgeGraph: { nodes: [{ id: 'n1' }], links: [] } });
    fetchMock.mockResolvedValueOnce(okResponse(graphPayload));

    await act(async () => {
      await result.current.loadGraph();
    });

    const [url] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/intelligence?include=graph');
    expect(result.current.graphData?.nodes.length).toBe(1);
    expect(result.current.graphError).toBeNull();

    // Segunda llamada: ya hay grafo en memoria → sin solicitud redundante.
    await act(async () => {
      await result.current.loadGraph();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
