/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportConfigPanel } from '../ReportConfigPanel';

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-1', activeStoreId: 'store-1', role: 'admin' }
  })),
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  })),
}));

const defaultConfig = {
  name: 'Reporte de Prueba',
  type: 'sales' as any,
  filters: {},
  date_range: { from: '2025-01-01', to: '2025-12-31' },
  columns: ['id', 'created_at'],
  layout: {},
};

describe('ReportConfigPanel', () => {
  it('renders the report name input', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByDisplayValue('Reporte de Prueba')).toBeInTheDocument();
  });

  it('renders "Todas" button', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByText('Todas')).toBeInTheDocument();
  });
});
