/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportPreview } from '../ReportPreview';
import type { ReportDefinition } from '@/types';

// Properly mock the store
vi.mock('@/store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-1', activeStoreId: 's1' }
  })),
}));

vi.mock('@/services/report-service', () => ({
  reportService: {
    fetchReportData: vi.fn().mockResolvedValue([])
  },
}));

vi.mock('@/config/app', () => ({
  APP_VERSION_SHORT: '1.0.0'
}));

const baseConfig: Partial<ReportDefinition> = {
  name: 'Reporte Mensual',
  type: 'sales',
  filters: {},
  date_range: { from: '2025-01-01', to: '2025-12-31' },
  columns: ['id', 'created_at', 'total_amount', 'status', 'payment_method'],
  layout: { orientation: 'portrait', format: 'a4' },
};

describe('ReportPreview', () => {
  it('renders report name uppercase', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText(/REPORTE MENSUAL/i)).toBeInTheDocument();
  });

  it('renders CostPro version', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText(/CostPro Enterprise Reporting v1.0.0/)).toBeInTheDocument();
  });
});
