/**
 * Tests para MatchingAuditView — vista de auditoría del motor de matching.
 * Verifica: tabs y encabezado renderizan correctamente.
 */
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_fn: any, _deps?: any, fallback?: any) => {
    return fallback ?? [];
  },
}));

vi.mock('./AccountingIntegrityReport', () => ({
  AccountingIntegrityReport: () => <div data-testid="integrity-report">Integrity</div>,
}));

vi.mock('@/components/ui/SafePieChart', () => ({
  SafePieChart: () => <div data-testid="pie-chart">Chart</div>,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

vi.mock('@/services/matching-log-service', () => ({
  MatchingLogService: {},
}));

import MatchingAuditView from '../MatchingAuditView';

describe('MatchingAuditView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza el título "Auditoría del Motor"', () => {
    render(<MatchingAuditView />);
    expect(screen.getByText('Auditoría del Motor')).toBeInTheDocument();
  });

  it('muestra los tabs Integridad Contable y Auditoría del Motor', () => {
    render(<MatchingAuditView />);
    expect(screen.getByText('Integridad Contable')).toBeInTheDocument();
    expect(screen.getByText('Auditoría del Motor')).toBeInTheDocument();
  });

  it('renderiza sin crash con datos vacíos', () => {
    render(<MatchingAuditView />);
    expect(screen.getByText('Auditoría del Motor')).toBeInTheDocument();
  });
});
