/**
 * System Health Index (SHI) Engine v8.0
 * Aggregates infrastructure, operations, security, and market readiness.
 */

export interface SystemHealthMetrics {
  infrastructureSHI: number; // 0-100
  operationsSHI: number; // 0-100
  securityGRC: number; // 0-100
  marketReadinessMRI: number; // 0-100

  // Raw metrics for detailed panels
  uptime: number;
  latency_p95: number;
  cpu_usage: number;
  memory_usage: number;
  throughput: number;
  db_integrity: boolean;
  sync_status: boolean;
  active_threats: number;
  failed_logins_1h: number;
}

export interface SHIResult {
  score: number; // 0-100
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  metrics: SystemHealthMetrics;
  alerts: {
    id: string;
    level: 'info' | 'warn' | 'error' | 'blue';
    message: string;
    timestamp: string;
  }[];
  trends: {
    timestamp: string;
    score: number;
    latency: number;
  }[];
  timestamp: string;
}

export function calculateSHI(metrics: SystemHealthMetrics): SHIResult {
  const score = (
    metrics.infrastructureSHI * 0.35 +
    metrics.operationsSHI * 0.25 +
    metrics.securityGRC * 0.25 +
    (metrics.marketReadinessMRI * 10) * 0.15 // MRI is 0-10, needs to be 0-100
  );

  const roundedScore = Math.round(score);
  let status: SHIResult['status'] = 'HEALTHY';
  if (roundedScore < 80) status = 'DEGRADED';
  if (roundedScore < 60) status = 'CRITICAL';

  const alerts: SHIResult['alerts'] = [];
  if (metrics.marketReadinessMRI < 9.0) {
    alerts.push({
      id: 'mri-alert',
      level: 'blue',
      message: `MRI (${metrics.marketReadinessMRI}) POR DEBAJO DEL OBJETIVO ENTERPRISE (9.0)`,
      timestamp: new Date().toISOString()
    });
  }

  // Generate trend data (mocked)
  const trends = Array.from({ length: 24 }).map((_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
    score: Math.min(100, Math.max(roundedScore - 5 + Math.random() * 10, 0)),
    latency: metrics.latency_p95 - 10 + Math.random() * 20
  }));

  return {
    score: roundedScore,
    status,
    metrics,
    alerts,
    trends,
    timestamp: new Date().toISOString()
  };
}
