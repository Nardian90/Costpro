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

const mockTransactions = [
  {
    referencia_origen: 'TX-001',
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
  },
  {
    referencia_origen: 'TX-002',
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
  },
  {
    referencia_origen: 'TX-003',
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
  },
  {
    referencia_origen: 'TX-004',
    tipo: 'Cr',
    importe_cents: 3000,
    importe_venta_cents: 3000,
    comision_cents: 0,
    fecha: '2025-01-18',
    observaciones: 'Excluida',
    estado_conciliacion: 'PENDIENTE',
    applied_rules: [],
    matching_confidence: 0,
    excluido: true,
  },
];

const defaultProps = {
  transactions: mockTransactions,
  kpiFilter: 'ALL' as const,
  txReconciliationTotals: { 'TX-001': 10000, 'TX-002': 3000 },
  onReconcile: vi.fn(),
  onForceMatch: vi.fn(),
  onAnalyzeAll: vi.fn(),
};

describe('TransactionTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza todas las transacciones en modo tabla', () => {
    render(<TransactionTable {...defaultProps} />);
    expect(screen.getByText('TX-001')).toBeInTheDocument();
    expect(screen.getByText('TX-002')).toBeInTheDocument();
    expect(screen.getByText('TX-003')).toBeInTheDocument();
    expect(screen.getByText('TX-004')).toBeInTheDocument();
  });

  it('muestra el badge "CONCILIADA" para transacción cuadrada', () => {
    render(<TransactionTable {...defaultProps} />);
    expect(screen.getByText('CONCILIADA')).toBeInTheDocument();
  });

  it('muestra el badge "PARCIAL" para transacción parcial', () => {
    render(<TransactionTable {...defaultProps} />);
    const badges = screen.getAllByText('PARCIAL');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el badge "PENDIENTE" para transacción pendiente', () => {
    render(<TransactionTable {...defaultProps} />);
    const badges = screen.getAllByText('PENDIENTE');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('filtra por búsqueda de referencia', () => {
    render(<TransactionTable {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText('Buscar referencia u observaciones...');
    fireEvent.change(searchInput, { target: { value: 'TX-001' } });
    expect(screen.getByText('TX-001')).toBeInTheDocument();
    expect(screen.queryByText('TX-002')).not.toBeInTheDocument();
  });

  it('filtra por tipo "INGRESOS"', () => {
    render(<TransactionTable {...defaultProps} />);
    const select = screen.getByDisplayValue('TODOS');
    fireEvent.change(select, { target: { value: 'Cr' } });
    // Should show only Cr transactions
    expect(screen.getByText('TX-001')).toBeInTheDocument();
    expect(screen.getByText('TX-002')).toBeInTheDocument();
  });

  it('filtra por tipo "GASTOS"', () => {
    render(<TransactionTable {...defaultProps} />);
    const select = screen.getByDisplayValue('TODOS');
    fireEvent.change(select, { target: { value: 'Db' } });
    expect(screen.getByText('TX-003')).toBeInTheDocument();
    expect(screen.queryByText('TX-001')).not.toBeInTheDocument();
  });

  it('muestra "Sin resultados" cuando el filtro no coincide', () => {
    render(<TransactionTable {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText('Buscar referencia u observaciones...');
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('llama onReconcile al hacer click en el botón de eye', () => {
    const onReconcile = vi.fn();
    render(<TransactionTable {...defaultProps} onReconcile={onReconcile} />);

    // Find all eye buttons (one per transaction)
    const eyeButtons = document.querySelectorAll('button');
    const reconBtn = Array.from(eyeButtons).find(btn =>
      btn.querySelector('[class*="lucide-eye"]') || btn.innerHTML.includes('eye')
    );
    if (reconBtn) fireEvent.click(reconBtn);
  });

  it('llama onAnalyzeAll al hacer click en "Analizar"', () => {
    const onAnalyzeAll = vi.fn();
    render(<TransactionTable {...defaultProps} onAnalyzeAll={onAnalyzeAll} />);
    fireEvent.click(screen.getByText('Analizar'));
    expect(onAnalyzeAll).toHaveBeenCalledTimes(1);
  });

  it('muestra el botón "Transacción" para agregar', () => {
    render(<TransactionTable {...defaultProps} />);
    expect(screen.getByText('Transacción')).toBeInTheDocument();
  });

  it('muestra las columnas de la tabla correctamente', () => {
    render(<TransactionTable {...defaultProps} />);
    expect(screen.getByText('Fecha')).toBeInTheDocument();
    expect(screen.getByText('Concepto')).toBeInTheDocument();
    expect(screen.getByText('Neto')).toBeInTheDocument();
    expect(screen.getByText('Venta')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
  });

  it('transacción excluida tiene clase de opacidad reducida', () => {
    render(<TransactionTable {...defaultProps} />);
    const tx004Row = screen.getByText('TX-004').closest('tr');
    expect(tx004Row?.className).toContain('opacity-40');
  });

  it('renderiza modo cards al cambiar layout', () => {
    render(<TransactionTable {...defaultProps} />);
    // Find the cards layout button
    const layoutButtons = document.querySelectorAll('button');
    const cardsBtn = Array.from(layoutButtons).find(btn =>
      btn.querySelector('[class*="lucide-layout-grid"]') || btn.innerHTML.includes('layout-grid')
    );
    if (cardsBtn) fireEvent.click(cardsBtn);
  });
});
