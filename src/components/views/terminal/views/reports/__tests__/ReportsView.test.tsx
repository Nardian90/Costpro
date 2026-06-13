/**
 * @vitest-environment jsdom
 *
 * Tests de integracion del flujo completo del Generador de Reportes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportsView from '../ReportsView';
import type { ReportType } from '@/types';

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

vi.mock('@/hooks/api/useAuditLogs', () => ({
  useAuditLogs: vi.fn(),
}));

vi.mock('@/services/report-service', () => ({
  reportService: {
    fetchReportData: vi.fn(),
    fetchReportDataPaginated: vi.fn(),
    saveDefinition: vi.fn(),
    generateReport: vi.fn(),
    getStoreRuns: vi.fn().mockResolvedValue([]),
    getDefinitions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/services/export-service', () => ({
  exportToExcel: vi.fn(),
}));

vi.mock('@/config/app', () => ({
  APP_VERSION_SHORT: '1.0.0',
}));

// Mock framer-motion passthrough
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

const { useAuthStore } = vi.mocked(await import('@/store')) as any;
const { reportService } = vi.mocked(await import('@/services/report-service')) as any;
const { useAuditLogs } = vi.mocked(await import('@/hooks/api/useAuditLogs')) as any;
const { useProducts } = vi.mocked(await import('@/hooks/api/useProducts')) as any;
const { useStores } = vi.mocked(await import('@/hooks/api/useStores')) as any;

const mockUser = {
  id: 'user-1',
  activeStoreId: 'store-1',
  role: 'admin',
  token: 'test-token-123',
};

describe('ReportsView - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.mockReturnValue({ user: mockUser } as any);
    useAuditLogs.mockReturnValue({ data: { pages: [] }, isLoading: false, error: null });
    useProducts.mockReturnValue({ data: [], isLoading: false });
    useStores.mockReturnValue({ data: [], isLoading: false });
    reportService.fetchReportData.mockResolvedValue([]);
    reportService.saveDefinition.mockResolvedValue({});
    reportService.generateReport.mockResolvedValue({ url: 'http://example.com/report.pdf' });
  });

  it('renders the main page with title', () => {
    render(<ReportsView />);
    expect(screen.getByText('Configuracion de Reportes')).toBeInTheDocument();
  });

  it('renders the action buttons', () => {
    render(<ReportsView />);
    expect(screen.getByText('Guardar Plantilla')).toBeInTheDocument();
    expect(screen.getByText('Exportar Excel')).toBeInTheDocument();
    expect(screen.getByText('Generar Reporte')).toBeInTheDocument();
  });
});
