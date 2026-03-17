import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import SystemHealthView from '../views/terminal/views/health/SystemHealthView';

// Mock ResizeObserver for Recharts
beforeAll(() => {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserver;
});

// Mock the hooks
vi.mock('./hooks/useHealthIndex', () => ({
  useHealthIndex: () => ({
    data: {
      shi: {
        score: 90,
        status: 'HEALTHY',
        metrics: { uptime: 99.99, cpu_usage: 18, active_threats: 0, failed_logins_1h: 0, throughput: 15, reconciliation_health: 99.8 },
        alerts: [],
        trends: []
      },
      mri: {
        score: 8.8,
        status: 'PRODUCTION_READY',
        architectureHealth: 9.0,
        documentationCoverage: 8.5,
        testCoverage: 8.0,
        securityCompliance: 9.5,
        hardStops: [{ id: '1', name: 'VULNERABILIDADES CRÍTICAS', passed: true }]
      },
      lastAudit: '2026-03-16',
      version: '8.0'
    },
    loading: false,
    refetch: vi.fn()
  })
}));

vi.mock('./hooks/useComponentHealth', () => ({
  useComponentHealth: () => ({
    components: [{ id: 'comp1', name: 'TestComp', type: 'COMPONENT', health: 10, couplingScore: 0, openQuestions: [], hasLogic: true }],
    loading: false,
    refetch: vi.fn()
  })
}));

vi.mock('./hooks/useLiveScan', () => ({
  useLiveScan: () => new Date('2026-03-16T15:49:08')
}));

describe('SystemHealthView Integration', () => {
  it('renders the full dashboard correctly', async () => {
    const { getByText } = render(<SystemHealthView />);

    expect(getByText('Observability')).toBeDefined();
    expect(getByText('90')).toBeDefined();
    expect(getByText('9.0')).toBeDefined(); // Global Arch Health
    expect(getByText('TestComp')).toBeDefined();
    expect(getByText('MRI 8.8/10')).toBeDefined();
    expect(getByText('VULNERABILIDADES CRÍTICAS')).toBeDefined();
  });
});
