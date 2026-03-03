import { describe, it, expect } from 'vitest';
import { calculateSHI, SystemHealthMetrics } from '../health-engine';

describe('Health Engine', () => {
  const healthyMetrics: SystemHealthMetrics = {
    uptime: 100,
    latency_p95: 100,
    cpu_usage: 10,
    memory_usage: 10,
    error_rate_4xx: 0,
    error_rate_5xx: 0,
    transactions_per_minute: 10,
    sync_status: 'ok',
    active_critical_errors: 0,
    reconciliation_health: 100,
    db_integrity_check: 'passed',
    failed_logins_last_hour: 0,
    rbac_alerts: 0,
    rls_violations: 0,
    active_threats: 0,
    mri_score: 10,
    hard_stops_active: 0,
  };

  it('should return score 100 and HEALTHY status for perfect metrics', () => {
    const result = calculateSHI(healthyMetrics);
    expect(result.score).toBe(100);
    expect(result.status).toBe('HEALTHY');
  });

  it('should penalize RLS violations heavily', () => {
    const badMetrics = { ...healthyMetrics, rls_violations: 1 };
    const result = calculateSHI(badMetrics);
    expect(result.score).toBeLessThan(70);
    expect(result.status).toBe('CRITICAL');
  });
});
