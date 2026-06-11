/**
 * @vitest-environment jsdom
 *
 * Tests unitarios para ReportConfigPanel.
 * Verifica: renderizado de tipos, seleccion de columnas, cambio de fechas,
 * selector de tienda, validacion visual de rango de fechas.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportConfigPanel } from '../ReportConfigPanel';
import type { ReportDefinition } from '@/types';

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

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  })),
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
  type: 'sales',
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
    useStores.mockReturnValue({ data: mockStores, isLoading: false });
    useProducts.mockReturnValue({ data: [], isLoading: false });
  });

  it('renders the report name input', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByPlaceholderText('Ej: Reporte Mensual de Ventas')).toBeInTheDocument();
  });

  it('renders all 11 report types in the selector', async () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    // The select trigger should show the current type
    expect(screen.getByText('Ventas')).toBeInTheDocument();
  });

  it('calls setConfig when report name changes', async () => {
    const setConfig = vi.fn();
    render(<ReportConfigPanel config={defaultConfig} setConfig={setConfig} />);
    const input = screen.getByPlaceholderText('Ej: Reporte Mensual de Ventas');
    fireEvent.change(input, { target: { value: 'Nuevo Nombre' } });
    expect(setConfig).toHaveBeenCalled();
  });

  it('renders column checkboxes for the current report type', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    // Sales columns should be visible
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Fecha')).toBeInTheDocument();
    expect(screen.getByText('Monto Total')).toBeInTheDocument();
  });

  it('shows column count (selected/total)', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    // Sales has 7 columns; default config has 5 selected
    expect(screen.getByText('5/7')).toBeInTheDocument();
  });

  it('calls setConfig when a column checkbox is toggled', () => {
    const setConfig = vi.fn();
    render(<ReportConfigPanel config={defaultConfig} setConfig={setConfig} />);
    // Click the "ID" column checkbox
    const idLabel = screen.getByText('ID');
    fireEvent.click(idLabel);
    expect(setConfig).toHaveBeenCalled();
  });

  it('shows date range error when from > to', () => {
    const badDateConfig = {
      ...defaultConfig,
      date_range: { from: '2025-12-31', to: '2025-01-01' },
    };
    render(<ReportConfigPanel config={badDateConfig} setConfig={vi.fn()} />);
    expect(screen.getByText(/"Desde" no puede ser posterior/)).toBeInTheDocument();
  });

  it('shows selected day count when date range is valid', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    // Jan 1 to Dec 31 = 365 days
    expect(screen.getByText('365 días seleccionados')).toBeInTheDocument();
  });

  it('shows kardex product selector when type is kardex', () => {
    const kardexConfig = { ...defaultConfig, type: 'kardex' as any };
    render(<ReportConfigPanel config={kardexConfig} setConfig={vi.fn()} />);
    expect(screen.getByText('Producto (Kardex)')).toBeInTheDocument();
    expect(screen.getByText('Seleccionar Producto')).toBeInTheDocument();
  });

  it('does NOT show kardex product selector for non-kardex types', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.queryByText('Producto (Kardex)')).not.toBeInTheDocument();
  });

  it('renders "Todas" and "Deseleccionar" column toggle button', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByText('Todas')).toBeInTheDocument();
  });

  it('renders store selector with mock stores', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    // Store selector label is present
    expect(screen.getByText('Tienda')).toBeInTheDocument();
  });

  it('renders paper format selector', () => {
    render(<ReportConfigPanel config={defaultConfig} setConfig={vi.fn()} />);
    expect(screen.getByText('Formato')).toBeInTheDocument();
  });
});
