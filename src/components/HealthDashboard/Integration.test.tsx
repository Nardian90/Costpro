import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import HealthView from '../views/health/HealthView';

// Mock ResizeObserver for Recharts
beforeAll(() => {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserver;
});

// Mock the hook
vi.mock('../views/health/hooks/useHealthData', () => ({
  useHealthData: () => ({
    data: {
      audit: {
        healthMetrics: { integrityScore: 90, cyclicDependencies: 0, orphanComponents: 0 }
      },
      metrics: {
        summary: { avg_instability: 0.3, layer_distribution: { UI: 10 } }
      },
      pipelineState: { cycle: 1, currentPhase: 18, schedulerMode: 'NORMAL' },
      reviewQueue: { queue: [] },
      integrityReport: '# Integrity Report',
      knowledgeGraph: { nodes: [], links: [] },
      userHelp: [],
      views: [],
      workflows: [],
      components: [],
      docsList: []
    },
    loading: false,
    error: null,
    refetch: vi.fn()
  })
}));

describe('HealthView Integration', () => {
  it('renders the system health correctly', async () => {
    const { getByText } = render(<HealthView />);

    expect(getByText('Salud del Sistema')).toBeDefined();
    expect(getByText('90%')).toBeDefined();
    expect(getByText(/PANORAMA/i)).toBeDefined();
  });
});
