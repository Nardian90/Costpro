/**
 * Tests para CustomerCatalog — catálogo de clientes del IPV.
 * Verifica: renderizado, badges de estado, acciones principales.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

const liveQueryQueue: any[][] = [];
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_fn: any, _deps?: any, fallback?: any) => {
    return liveQueryQueue.shift() ?? fallback ?? [];
  },
}));

vi.mock('@/lib/ipv/identity/registry', () => ({
  propagateIdentity: vi.fn().mockResolvedValue(5),
  getAllCustomerStats: vi.fn().mockResolvedValue({
    '12345': { totalTransactions: 10, totalAmountCents: 50000 },
    '67890': { totalTransactions: 3, totalAmountCents: 15000 },
  }),
  deleteCustomer: vi.fn().mockResolvedValue(undefined),
  syncCatalogFromTransactions: vi.fn().mockResolvedValue(2),
}));

vi.mock('../CustomerFormDialog', () => ({
  CustomerFormDialog: ({ open }: any) => open ? <div data-testid="form-dialog">Form</div> : null,
}));

vi.mock('../CustomerDetailsModal', () => ({
  CustomerDetailsModal: ({ open }: any) => open ? <div data-testid="details-modal">Details</div> : null,
}));

vi.mock('../IdentityConflictPanel', () => ({
  IdentityConflictPanel: () => <div data-testid="conflict-panel">Conflicts</div>,
}));

import { CustomerCatalog } from '../CustomerCatalog';

const mockCustomers = [
  { ci: '12345', nombre: 'Juan Pérez', phone: '5551234', card_number: '4242XXXX1234', status: 'COMPLETO', source: 'MANUAL', created_at: '2025-01-01' },
  { ci: '67890', nombre: 'María García', phone: '5555678', card_number: null, status: 'PARCIAL', source: 'AUTO', created_at: '2025-01-15' },
  { ci: '11111', nombre: 'Pedro López', phone: null, card_number: null, status: 'PENDIENTE', source: 'MANUAL', created_at: '2025-02-01' },
];

describe('CustomerCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveQueryQueue.length = 0;
    liveQueryQueue.push(mockCustomers);
  });

  it('renderiza el título "CLIENTES"', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('CLIENTES')).toBeInTheDocument();
  });

  it('muestra el total de clientes', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renderiza los nombres de clientes', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('María García')).toBeInTheDocument();
    expect(screen.getByText('Pedro López')).toBeInTheDocument();
  });

  it('muestra badge "OK" para cliente COMPLETO', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('muestra badge "PARCIAL" para cliente PARCIAL', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('PARCIAL')).toBeInTheDocument();
  });

  it('muestra badge "PEND" para cliente PENDIENTE', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('PEND')).toBeInTheDocument();
  });

  it('muestra los botones de acción', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText(/Nuevo Cliente/i)).toBeInTheDocument();
  });

  it('muestra teléfono y tarjeta del cliente', () => {
    render(<CustomerCatalog />);
    expect(screen.getByText('5551234')).toBeInTheDocument();
    expect(screen.getByText('4242XXXX1234')).toBeInTheDocument();
  });

  it('muestra "—" cuando no hay teléfono o tarjeta', () => {
    render(<CustomerCatalog />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('muestra tabs Catálogo y Conflictos', () => {
    render(<CustomerCatalog />);
    // Tab triggers rendered by radix
    const tabElements = screen.getAllByRole('tab');
    expect(tabElements.length).toBeGreaterThanOrEqual(2);
  });

  it('muestra "Sin resultados" cuando la búsqueda no encuentra nada', () => {
    render(<CustomerCatalog />);
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/);
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } });
    expect(screen.getByText('No se encontraron clientes')).toBeInTheDocument();
  });
});
