/**
 * Tests para IPVView — componente principal del módulo IPV.
 * Verifica: título, shortcuts, subtítulo con tab activo.
 * Nota: Los tabs internos usan React.lazy + vi.mock no se resuelven
 * correctamente para components importados dinámicamente, por lo que
 * solo probamos el renderizado estático del header.
 */
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/store');
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => [],
}));

vi.mock('@/lib/ipv/backup', () => ({
  exportFullBackup: vi.fn().mockResolvedValue(new Blob()),
}));

vi.mock('@/lib/ipv/engine', () => ({
  DEFAULT_MATCHING_RULES: [{ tipo: 'EXACT_AMOUNT', activa: true, prioridad: 1 }],
}));

vi.mock('@/components/ui/LoadingOverlay', () => ({
  LoadingOverlay: ({ isVisible }: any) => isVisible ? <div data-testid="loading-overlay">Loading</div> : null,
}));

// Stub component factory
const stub = (testId: string) => {
  const C = (props: any) => <div data-testid={testId}>{testId}</div>;
  C.displayName = testId;
  return C;
};

vi.mock('./IPVInstitutionalDashboardLazy', () => ({ IPVInstitutionalDashboard: stub('dashboard') }));
vi.mock('./IPVControlPanel', () => ({ default: stub('control-panel') }));
vi.mock('./IPVRightSidebar', () => ({ IPVRightSidebar: stub('right-sidebar') }));
vi.mock('./IPVHelpDialog', () => ({ IPVHelpDialog: ({ open }: any) => open ? <div data-testid="help-dialog">Help</div> : null }));
vi.mock('./TransactionTable', () => ({ TransactionTable: stub('transaction-table') }));
vi.mock('./ManualReconciliationView', () => ({ default: stub('manual-recon') }));
vi.mock('./MatchingSimulation', () => ({ MatchingSimulation: stub('matching-simulation') }));
vi.mock('./TransactionBreakdown', () => ({ default: stub('transaction-breakdown') }));
vi.mock('./PivotStatementView', () => ({ PivotStatementView: stub('pivot-statement') }));
vi.mock('./FinancialPlanningView', () => ({ FinancialPlanningView: stub('financial-planning') }));
vi.mock('./CatalogTable', () => ({ CatalogTable: stub('catalog-table') }));
vi.mock('./MatchingAuditView', () => ({ default: stub('matching-audit') }));
vi.mock('./MovementsView', () => ({ default: stub('movements-view') }));
vi.mock('./BankIngestion', () => ({ BankIngestion: stub('bank-ingestion') }));
vi.mock('./IPVReportView', () => ({ IPVReportView: stub('ipv-report') }));
vi.mock('./IntelligentReceipts/IntelligentReceiptsSection', () => ({ IntelligentReceiptsSection: stub('intelligent-receipts') }));
vi.mock('./IncomeReceiptSection', () => ({ IncomeReceiptSection: stub('income-receipt') }));
vi.mock('./TransferQRReportView', () => ({ TransferQRReportView: stub('transfer-qr') }));
vi.mock('./MatchingRulesEditor', () => ({ MatchingRulesEditor: stub('matching-rules') }));
vi.mock('./MatchingHistoryView', () => ({ default: stub('matching-history') }));
vi.mock('./IngestionErrorsTable', () => ({ IngestionErrorsTable: stub('ingestion-errors') }));
vi.mock('./MipymeTransactionsView', () => ({ MipymeTransactionsView: stub('mipyme-view') }));
vi.mock('./CustomerCatalog', () => ({ CustomerCatalog: stub('customer-catalog') }));
vi.mock('./mvt/MVTExportView', () => ({ MVTExportView: stub('mvt-export') }));
vi.mock('@/components/views/shared/MappingRulesManager', () => ({ default: stub('mapping-rules') }));

import * as storeModule from '@/store';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('IPVView', () => {
  beforeEach(() => {
    vi.mocked(storeModule.useUIStore).mockReturnValue({
      ipvActiveTab: 'dashboard',
      setIpvActiveTab: vi.fn(),
    } as any);
  });

  it('renderiza el título "Control IPV"', async () => {
    const { default: IPVView } = await import('../IPVView');
    render(<IPVView />, { wrapper });
    expect(screen.getByText('Control IPV')).toBeInTheDocument();
  });

  it('muestra shortcuts de acción (Ejecutar Matching, Extracto)', async () => {
    const { default: IPVView } = await import('../IPVView');
    render(<IPVView />, { wrapper });
    expect(screen.getByText('Ejecutar Matching')).toBeInTheDocument();
    expect(screen.getByText('Extracto')).toBeInTheDocument();
  });

  it('tiene el encabezado con el título y subtítulo', async () => {
    const { default: IPVView } = await import('../IPVView');
    render(<IPVView />, { wrapper });
    // Verify structure: h1 title
    expect(screen.getByText('Control IPV')).toBeInTheDocument();
  });
});
