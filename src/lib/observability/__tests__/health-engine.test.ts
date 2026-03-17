import { describe, it, expect } from 'vitest';
import { calculateSHI, SystemHealthMetrics } from '../health-engine';

describe('Health Engine v8.0', () => {
  const perfectMetrics: SystemHealthMetrics = {
    infrastructureSHI: 100,
    operationsSHI: 100,
    securityGRC: 100,
    marketReadinessMRI: 10.0,
    uptime: 100,
    latency_p95: 100,
    cpu_usage: 10,
    memory_usage: 10,
    throughput: 10,
    db_integrity: true,
    sync_status: true,
    active_threats: 0,
    failed_logins_1h: 0
  };

  it('should return score 100 and HEALTHY status for perfect metrics', () => {
    const result = calculateSHI(perfectMetrics);
    expect(result.score).toBe(100);
    expect(result.status).toBe('HEALTHY');
  });

  it('should calculate weighted score correctly', () => {
    // 50*0.35 + 50*0.25 + 50*0.25 + (5*10)*0.15 = 17.5 + 12.5 + 12.5 + 7.5 = 50
    const midMetrics: SystemHealthMetrics = {
      ...perfectMetrics,
      infrastructureSHI: 50,
      operationsSHI: 50,
      securityGRC: 50,
      marketReadinessMRI: 5.0
    };
    const result = calculateSHI(midMetrics);
    expect(result.score).toBe(50);
    expect(result.status).toBe('CRITICAL');
  });

  it('should add an alert if MRI is below 9.0', () => {
    const lowMriMetrics: SystemHealthMetrics = {
      ...perfectMetrics,
      marketReadinessMRI: 8.8
    };
    const result = calculateSHI(lowMriMetrics);
    expect(result.alerts.some(a => a.id === 'mri-alert')).toBe(true);
  });
});
