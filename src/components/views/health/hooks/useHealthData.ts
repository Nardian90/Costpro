import { useAuthStore } from '@/store';
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * SALUD — Datos de la vista (rediseño 2026-10-24).
 *
 * Semántica de actualización (FASE D, misión «Sistema → Salud»):
 * - La vista NO se actualiza en tiempo real: se consulta al montar y con el
 *   botón «Refrescar núcleo». No hay auto-intervalo ni caché de cliente
 *   (cache: 'no-store'): cada actualización ejecuta las comprobaciones reales.
 * - Guardia in-flight: pulsaciones repetidas (o refresco durante una carga)
 *   NO generan solicitudes paralelas redundantes.
 * - Estados expuestos al UI:
 *   - refreshState 'ok'         → Actualizado: todas las comprobaciones críticas respondieron.
 *   - refreshState 'partial'    → Actualizado parcialmente: alguna comprobación falló.
 *   - refreshState 'failed'     → Sin actualizar: la comprobación no pudo completarse.
 *   - dataStale true            → Datos anteriores: se exhibe la última lectura válida
 *                                 junto con el error de la actualización fallida.
 *   - Un indicador concreto 'No disponible' se resuelve en cada pestaña cuando
 *     la fuente no existe o no está implementada.
 * - Reintentos SOLO en la carga inicial (cuando no hay datos previos); el
 *   refresco manual es de un solo intento para no ocultar la latencia real.
 * - El grafo de conocimiento (404 KB) se obtiene bajo demanda con loadGraph()
 *   (?include=graph), también con guardia in-flight.
 */

// ─── Contrato con /api/intelligence ──────────────────────────────────────────

export interface CheckResult {
  name: string;
  status: 'ok' | 'error';
  latencyMs: number | null;
  checkedAt: string;
  detail: string;
}

export interface KnowledgeSourceInfo {
  name: string;
  path: string;
  kind: string;
  description: string;
  status: 'ok' | 'missing' | 'parse_error';
  sizeBytes: number | null;
  lastModified: string | null;
}

export interface ContentSummary {
  components: number;
  layers: number;
  workflows: number;
  graphNodes: number;
  graphLinks: number;
  appViews: number;
}

export interface HealthData {
  app: { version: string; environment: string };
  generatedAt: string;
  checks: {
    api: CheckResult;
    database: CheckResult;
    auth: CheckResult;
  };
  checkSummary: { total: number; passed: number; failed: number; status: 'ok' | 'degraded' | 'failed' };
  knowledgeSources: KnowledgeSourceInfo[];
  sourcesSummary: { total: number; ok: number; failed: number };
  contentSummary: ContentSummary | null;
  docsList: string[];
  docsSummary: { count: number };
  knowledgeGraph?: { nodes: any[]; links: any[] };
}

export type RefreshState = 'idle' | 'refreshing' | 'ok' | 'partial' | 'failed';

const MAX_INITIAL_RETRIES = 3;
const RETRY_DELAY = 2_000;

export function useHealthData() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const [dataStale, setDataStale] = useState(false);

  const [graphData, setGraphData] = useState<HealthData['knowledgeGraph'] | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const graphInFlightRef = useRef(false);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  useEffect(() => {
    hasDataRef.current = data !== null;
  }, [data]);

  const fetchData = useCallback(async (isInitialLoad: boolean) => {
    // Guardia in-flight: nunca dos comprobaciones en paralelo (FASE D §9).
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const { token } = useAuthStore.getState();
    try {
      const response = await fetch('/api/intelligence', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || `Error ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as HealthData;
      if (!mountedRef.current) return;

      setData(json);
      setError(null);
      setDataStale(false);
      setLastRefresh(new Date());
      setRefreshState(json.checkSummary?.status === 'ok' ? 'ok' : 'partial');
      retryCountRef.current = 0;
    } catch (err: any) {
      if (!mountedRef.current) return;

      // Reintentos solo en la carga inicial (sin datos previos que exhibir).
      if (isInitialLoad && retryCountRef.current < MAX_INITIAL_RETRIES) {
        retryCountRef.current += 1;
        setTimeout(() => {
          if (mountedRef.current) fetchData(true).catch(() => undefined);
        }, RETRY_DELAY * retryCountRef.current);
        return;
      }

      // Con datos previos: se conservan como «datos anteriores» + error visible (FASE D §10).
      setError(err.message || 'No se pudo completar la comprobación');
      setRefreshState('failed');
      if (hasDataRef.current) {
        setDataStale(true);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, []);

  /** Carga inicial (al montar la vista). */
  useEffect(() => {
    mountedRef.current = true;
    fetchData(true).catch(() => undefined);
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  /** Refrescar núcleo: un solo intento, sin reintentos automáticos. */
  const refetch = useCallback(() => {
    if (inFlightRef.current) return; // pulsación repetida → sin solicitud redundante
    retryCountRef.current = 0;
    setIsRefreshing(true);
    setRefreshState('refreshing');
    fetchData(false).catch(() => undefined);
  }, [fetchData]);

  /** Grafo de conocimiento bajo demanda (?include=graph). */
  const loadGraph = useCallback(async () => {
    if (graphInFlightRef.current || graphData) return;
    graphInFlightRef.current = true;
    setGraphLoading(true);
    setGraphError(null);
    const { token } = useAuthStore.getState();
    try {
      const response = await fetch('/api/intelligence?include=graph', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || `Error ${response.status}: ${response.statusText}`);
      }
      const json = (await response.json()) as HealthData;
      if (!mountedRef.current) return;
      if (!json.knowledgeGraph) throw new Error('El grafo de conocimiento no está disponible');
      setGraphData(json.knowledgeGraph);
    } catch (err: any) {
      if (mountedRef.current) {
        setGraphError(err.message || 'No se pudo cargar el grafo de conocimiento');
      }
    } finally {
      if (mountedRef.current) setGraphLoading(false);
      graphInFlightRef.current = false;
    }
  }, [graphData]);

  return {
    data,
    loading,
    error,
    refetch,
    lastRefresh,
    isRefreshing,
    refreshState,
    dataStale,
    loadGraph,
    graphData,
    graphLoading,
    graphError,
  };
}
