/**
 * System Health Index (SHI) Engine v2 - 10/10 Enterprise Level
 * Aggregates infrastructure, application, security, and release-gate metrics.
 */

export interface SystemHealthMetrics {
  // Infrastructure
  uptime: number; // %
  latency_p95: number; // ms
  cpu_usage: number; // %
  memory_usage: number; // %
  error_rate_4xx: number; // % per minute
  error_rate_5xx: number; // % per minute

  // Application
  transactions_per_minute: number;
  sync_status: 'ok' | 'degraded' | 'offline' | 'syncing';
  active_critical_errors: number;
  reconciliation_health: number; // %
  db_integrity_check: 'passed' | 'failed' | 'warning';

  // Security
  failed_logins_last_hour: number;
  rbac_alerts: number;
  rls_violations: number;
  active_threats: number;

  // Release Gate
  mri_score: number;
  hard_stops_active: number;
}

export interface SHIResult {
  score: number; // 0-100
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  metrics: SystemHealthMetrics;
  alerts: {
    id: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
  }[];
  trends: {
    timestamp: string;
    score: number;
    latency: number;
    errors: number;
  }[];
  timestamp: string;
}

export const HEALTH_THRESHOLDS = {
  LATENCY_P95: 350, // ms (Tightened for 10/10)
  ERROR_RATE_5XX: 0.5, // % (Enterprise standard)
  ERROR_RATE_4XX: 2.0, // %
  UPTIME: 99.9, // % (Three nines)
  MRI: 9.0, // (Elevated for Enterprise Ready)
};

export function calculateSHI(metrics: SystemHealthMetrics): SHIResult {
  let score = 100;
  const alerts: SHIResult['alerts'] = [];
  const now = new Date().toISOString();

  const addAlert = (level: 'info' | 'warn' | 'error', message: string) => {
    alerts.push({ id: Math.random().toString(36).substr(2, 9), level, message, timestamp: now });
  };

  // 1. Infrastructure (35%)
  if (metrics.uptime < HEALTH_THRESHOLDS.UPTIME) {
    const penalty = (HEALTH_THRESHOLDS.UPTIME - metrics.uptime) * 15;
    score -= penalty;
    addAlert(metrics.uptime < 99 ? 'error' : 'warn', `Uptime por debajo de SLA: ${metrics.uptime}%`);
  }
  if (metrics.latency_p95 > HEALTH_THRESHOLDS.LATENCY_P95) {
    score -= 10;
    addAlert('warn', `Latencia p95 elevada: ${metrics.latency_p95}ms`);
  }
  if (metrics.error_rate_5xx > HEALTH_THRESHOLDS.ERROR_RATE_5XX) {
    score -= 25;
    addAlert('error', `Tasa de errores 5xx crítica: ${metrics.error_rate_5xx}%`);
  }
  if (metrics.error_rate_4xx > HEALTH_THRESHOLDS.ERROR_RATE_4XX) {
    score -= 5;
    addAlert('warn', `Anomalía en errores 4xx: ${metrics.error_rate_4xx}%`);
  }

  // 2. Application (25%)
  if (metrics.active_critical_errors > 0) {
    score -= Math.min(metrics.active_critical_errors * 20, 40);
    addAlert('error', `Errores de aplicación activos: ${metrics.active_critical_errors}`);
  }
  if (metrics.db_integrity_check !== 'passed') {
    score -= 15;
    addAlert(metrics.db_integrity_check === 'failed' ? 'error' : 'warn', `Fallo en verificación de integridad de DB`);
  }
  if (metrics.sync_status === 'degraded' || metrics.sync_status === 'offline') {
    score -= 10;
    addAlert('warn', `Sincronización Dexie-Supabase degradada`);
  }

  // 3. Security (25%)
  if (metrics.rls_violations > 0) {
    score -= 60;
    addAlert('error', `VIOLACIÓN DE SEGURIDAD RLS DETECTADA`);
  }
  if (metrics.active_threats > 0) {
    score -= 30;
    addAlert('error', `Amenazas activas detectadas en el perímetro`);
  }
  if (metrics.failed_logins_last_hour > 50) {
    score -= 10;
    addAlert('warn', `Posible ataque de fuerza bruta: ${metrics.failed_logins_last_hour} fallos/h`);
  }

  // 4. Release Gate (15%)
  if (metrics.mri_score < HEALTH_THRESHOLDS.MRI) {
    score -= 10;
    addAlert('info', `MRI (${metrics.mri_score}) por debajo del objetivo Enterprise (9.0)`);
  }
  if (metrics.hard_stops_active > 0) {
    score -= 20;
    addAlert('error', `Hard Stops activos bloqueando liberación`);
  }

  score = Math.max(0, Math.min(100, score));

  let status: SHIResult['status'] = 'HEALTHY';
  if (score < 70) status = 'CRITICAL';
  else if (score < 90) status = 'DEGRADED';

  // Generate trend data (mocked for last 24h)
  const trends = Array.from({ length: 24 }).map((_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
    score: Math.min(100, Math.max(score - 5 + Math.random() * 10, 0)),
    latency: metrics.latency_p95 - 20 + Math.random() * 40,
    errors: metrics.error_rate_5xx + Math.random() * 0.1
  }));

  return {
    score: Math.round(score),
    status,
    metrics,
    alerts: alerts.sort((a, b) => (levelWeight(b.level) - levelWeight(a.level))),
    trends,
    timestamp: now,
  };
}

function levelWeight(level: string): number {
  if (level === 'error') return 3;
  if (level === 'warn') return 2;
  return 1;
}

export const MOCK_SYSTEM_HEALTH_V2: SystemHealthMetrics = {
  uptime: 99.99,
  latency_p95: 112,
  cpu_usage: 18,
  memory_usage: 38,
  error_rate_4xx: 0.12,
  error_rate_5xx: 0.01,
  transactions_per_minute: 15,
  sync_status: 'ok',
  active_critical_errors: 0,
  reconciliation_health: 99.8,
  db_integrity_check: 'passed',
  failed_logins_last_hour: 1,
  rbac_alerts: 0,
  rls_violations: 0,
  active_threats: 0,
  mri_score: 8.8,
  hard_stops_active: 0,
};
