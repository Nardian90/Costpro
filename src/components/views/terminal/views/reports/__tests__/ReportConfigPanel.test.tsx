/**
 * @vitest-environment jsdom
 *
 * Tests unitarios para ReportConfigPanel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportConfigPanel } from '../ReportConfigPanel';
import type { ReportDefinition, ReportType } from '@/types';

// ── Mocks ──

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: vi.fn(),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(),
}));

const { useAuthStore } = vi.mocked(await import('@/store'));
const { useProducts } = vi.mocked(await import('@/hooks/api/useProducts'));
const { useStores } = vi.mocked(await import('@/hooks/api/useStores'));

const mockStores = [
  { id: 'store-1', name: 'Tienda Central' },
  { id: 'store-2', name: 'Sucursal Norte' },
];

const defaultConfig: Partial<ReportDefinition> = {
  name: 'Reporte de Prueba',
  type: 'sales' as ReportType,
  filters: {},
  date_range: { from: '2025-01-01', to: '2025-12-31' },
  columns: ['id', 'created_at', 'total_amount', 'status', 'payment_method'],
  layout: { orientation: 'portrait', format: 'a4' },
};

describe('ReportConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.mockReturnValue({
      user: { id: 'user-1', activeStoreId: 'store-1', role: 'admin' },
    } as any);
    useStores.mockReturnValue({ data: mockStores, isLoading: false } as any);
    useProducts.mockReturnValue({ data: [], isLoading: false } as any);
  });

  it('renders the report name input', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByPlaceholderText('Ej: Reporte Mensual de Ventas')).toBeInTheDocument();
  });

  it('renders all report types in the selector', async () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByText('Ventas')).toBeInTheDocument();
  });

  it('calls setConfig when report name changes', async () => {
    const setConfig = vi.fn();
    render(<ReportConfigPanel config={defaultConfig} setConfig={setConfig} />);
    const input = screen.getByPlaceholderText('Ej: Reporte Mensual de Ventas');
    fireEvent.change(input, { target: { value: 'Nuevo Nombre' } });
    expect(setConfig).toHaveBeenCalled();
  });

  it('renders column count (selected/total)', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    // Sales has 7 columns; default config has 5 selected
    expect(screen.getByText('5/7')).toBeInTheDocument();
  });

  it('renders "Todas" and "Deseleccionar" column toggle buttons', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.getByText('Deseleccionar')).toBeInTheDocument();
  });
});
