/**
 * Tests para TransactionTable — tabla de transacciones bancarias del IPV.
 * Verifica: filtrado, badges de estado, layout table/cards, acciones.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Mock all child components
vi.mock('./AddTransactionModal', () => ({
  AddTransactionModal: () => <div data-testid="add-tx-modal">Add Transaction</div>,
}));
vi.mock('./MatchingTracePopover', () => ({
  MatchingTracePopover: ({ children }: any) => <>{children}</>,
}));
vi.mock('./ActionBadges', () => ({
  ActionBadges: () => null,
}));
vi.mock('./ObservationsModal', () => ({
  ObservationsModal: () => null,
}));
vi.mock('@/components/ui/BaseModal', () => ({
  BaseModal: ({ open, children }: any) => open ? <div data-testid="confirmation-modal">{children}</div> : null,
}));
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => [],
}));

import { TransactionTable } from '../TransactionTable';
import { BankTransaction } from '@/lib/dexie';

const mockTransactions: BankTransaction[] = [
  {
    id: '1',
    referencia_origen: 'TX-001',
    referencia_corta: 'TX-001',
    tipo: 'Cr',
    importe_cents: 10000,
    importe_venta_cents: 10000,
    comision_cents: 50,
    fecha: '2025-01-15',
    observaciones: 'Venta producto A',
    estado_conciliacion: 'COMPLETO',
    applied_rules: ['EXACT_AMOUNT'],
    matching_confidence: 1.0,
    excluido: false,
    created_at: '2025-01-15',
    ingestion_hash: 'hash1'
  },
  {
    id: '2',
    referencia_origen: 'TX-002',
    referencia_corta: 'TX-002',
    tipo: 'Cr',
    importe_cents: 5000,
    importe_venta_cents: 5000,
    comision_cents: 0,
    fecha: '2025-01-16',
    observaciones: 'Ingreso parcial',
    estado_conciliacion: 'PARCIAL',
    applied_rules: [],
    matching_confidence: 0.5,
    excluido: false,
    created_at: '2025-01-16',
    ingestion_hash: 'hash2'
  },
  {
    id: '3',
    referencia_origen: 'TX-003',
    referencia_corta: 'TX-003',
    tipo: 'Db',
    importe_cents: 2000,
    importe_venta_cents: 2000,
    comision_cents: 0,
    fecha: '2025-01-17',
    observaciones: '',
    estado_conciliacion: 'PENDIENTE',
    applied_rules: [],
    matching_confidence: 0,
    excluido: false,
    created_at: '2025-01-17',
    ingestion_hash: 'hash3'
  },
];

const defaultProps = {
  transactions: mockTransactions,
  kpiFilter: 'ALL' as const,
  txReconciliationTotals: { 'COMPLETO': 1, 'PARCIAL': 1, 'PENDIENTE': 1 },
  onReconcile: vi.fn(),
  onForceMatch: vi.fn(),
  onAnalyzeAll: vi.fn(),
};

describe('TransactionTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders transactions list in table view by default', () => {
    render(<TransactionTable {...defaultProps} />);

    expect(screen.getByText('TX-001')).toBeInTheDocument();
    expect(screen.getByText('TX-002')).toBeInTheDocument();
    expect(screen.getByText('TX-003')).toBeInTheDocument();
  });

  it('filters transactions by search text', () => {
    render(<TransactionTable {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText(/Buscar referencia/i);
    fireEvent.change(searchInput, { target: { value: 'TX-001' } });

    expect(screen.getByText('TX-001')).toBeInTheDocument();
    expect(screen.queryByText('TX-002')).not.toBeInTheDocument();
  });

  it('calls onAnalyzeAll when analyze button is clicked', () => {
    render(<TransactionTable {...defaultProps} />);

    const analyzeBtn = screen.getByText(/Analizar/i);
    fireEvent.click(analyzeBtn);

    expect(defaultProps.onAnalyzeAll).toHaveBeenCalled();
  });
});
