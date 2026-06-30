import { useAuthStore } from '@/store';
import { useState, useEffect, useCallback, useRef } from 'react';

export interface SystemMetricsData {
  platform: string;
  arch: string;
  nodeVersion: string;
  cpuCount: number;
  cpuModel: string;
  totalMemoryMB: number;
  freeMemoryMB: number;
  memoryUsagePercent: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  uptimeSeconds: number;
  uptimeHuman: string;
  processMemoryMB: number;
}

export interface HealthSummary {
  timestamp: string;
  integrityScore: number;
  status: string;
  systemMetrics?: {
    memoryPercent: number;
    processMemoryMB: number;
    cpuLoad: number;
    cpuCount: number;
    uptime: string;
  };
  platform?: {
    node: string;
    os: string;
  };
}

export interface HealthData {
  audit: any;
  metrics: any;
  graph: any;
  system: any;
  manifest: any;
  changes: any;
  reviewQueue: any;
  integrityReport: string | null;
  pipelineState: any;
  knowledgeGraph: any;
  userHelp: any;
  views: any;
  workflows: any;
  components: any;
  layerSummary?: any[];
  docsList: string[];
  healthSummary: HealthSummary;
  systemMetrics?: SystemMetricsData;
  projectMetrics?: {
    integrityScore: number;
    couplingScore: number;
    totalComponents: number;
    layerCount: number;
    viewsCount: number;
    abstractness: number;
    instability: number;
  };
}

const REFRESH_INTERVAL = 30_000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2_000;

export function useHealthData() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const retryCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const fetchData = useCallback(async (isRetry = false) => {
    const { token } = useAuthStore.getState();
    try {
      if (!isRetry) {
        setIsRefreshing(true);
      }
      const response = await fetch('/api/intelligence', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || `Error ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();

      if (mountedRef.current) {
        setData(json);
        setError(null);
        setLastRefresh(new Date());
        retryCount.current = 0;
      }
    } catch (err: any) {
      console.error('Intelligence Hub Sync Error:', err.message);

      if (mountedRef.current) {
        // Auto-retry with backoff
        if (retryCount.current < MAX_RETRIES && !isRetry) {
          retryCount.current++;
          const delay = RETRY_DELAY * retryCount.current;
          setTimeout(() => fetchData(true), delay);
          return;
        }

        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);
  const refetch = useCallback(() => {
    retryCount.current = 0;
    setLoading(true);
    fetchData();
  }, [fetchData]);


  // Manual refresh (resets retry counter)

  // Initial fetch + auto-refresh interval
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    intervalRef.current = setInterval(() => {
      fetchData();
    }, REFRESH_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  return { data, loading, error, refetch, lastRefresh, isRefreshing };
}
