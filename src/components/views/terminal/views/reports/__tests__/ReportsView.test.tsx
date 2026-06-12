/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportsView from '../ReportsView';

// ── Mocks ──
vi.mock('@/store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-1', activeStoreId: 'store-1', role: 'admin' },
    token: 'test-token'
  })),
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/hooks/api/useAuditLogs', () => ({
  useAuditLogs: vi.fn(() => ({
    data: { pages: [{ logs: [] }] },
    isLoading: false,
    error: null
  })),
}));

vi.mock('@/services/report-service', () => ({
  reportService: {
    fetchReportData: vi.fn().mockResolvedValue([]),
    fetchReportDataPaginated: vi.fn().mockResolvedValue([]),
    saveDefinition: vi.fn().mockResolvedValue({}),
    generateReport: vi.fn().mockResolvedValue({ url: 'http://example.com' }),
    logRun: vi.fn().mockResolvedValue({}),
    getDefinitions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/services/export-service', () => ({
  exportToExcel: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  })),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

describe('ReportsView - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main page with title', () => {
    render(<ReportsView />);
    expect(screen.getByText('Configuracion de Reportes')).toBeInTheDocument();
  });
});
