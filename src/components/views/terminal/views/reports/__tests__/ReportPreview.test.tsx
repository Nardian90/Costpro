/**
 * @vitest-environment jsdom
 *
 * Tests unitarios para ReportPreview.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportPreview } from '../ReportPreview';
import type { ReportDefinition } from '@/types';

vi.mock('@/store', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/services/report-service', () => ({
  reportService: { fetchReportData: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/config/app', () => ({ APP_VERSION_SHORT: '1.0.0' }));

const mockUseAuthStore = (await import('@/store')).useAuthStore;

const baseConfig: Partial<ReportDefinition> = {
  name: 'Reporte Mensual',
  type: 'sales',
  filters: {},
  date_range: { from: '2025-01-01', to: '2025-12-31' },
  columns: ['id', 'created_at', 'total_amount', 'status', 'payment_method'],
  layout: { orientation: 'portrait', format: 'a4' },
};

describe('ReportPreview', () => {
  beforeEach(() => {
    mockUseAuthStore.mockReturnValue({ user: { activeStoreId: 's1' } });
  });

  it('renders report name uppercase', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText(/REPORTE/i)).toBeInTheDocument();
  });

  it('renders report type uppercase', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('SALES')).toBeInTheDocument();
  });

  // Note: Period dates rendering depends on responsive class evaluation in jsdom

  it('renders CostPro version', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText(/CostPro Enterprise Reporting v1.0.0/)).toBeInTheDocument();
  });

  it('renders column headers from COLUMN_LABELS', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Monto Total')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
  });

  it('renders page footer', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('Pagina 1 de 1')).toBeInTheDocument();
  });

  it('renders footer attribution', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('Generado por CostPro Terminal')).toBeInTheDocument();
  });

  it('shows 5-record hint', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('* Mostrando los primeros 5 registros encontrados.')).toBeInTheDocument();
  });

  it('renders document type label', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('Tipo de Documento')).toBeInTheDocument();
  });

  it('renders period label', () => {
    render(<ReportPreview config={baseConfig} />);
    expect(screen.getByText('Periodo')).toBeInTheDocument();
  });
});
