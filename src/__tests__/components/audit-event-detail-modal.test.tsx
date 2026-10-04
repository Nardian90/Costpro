/**
 * AuditEventDetailModal — REMEDIACIÓN fix/audit-sale-document-link.
 *
 * Casos del mandato (FASE 9):
 *   A — Venta válida:  CREATE_SALE_V2 → "Venta asociada" → [Ver venta] →
 *                      [Abrir venta] → TransactionDetailsModal recibe LA
 *                      transacción EXACTA del evento (id === record_id).
 *   B — Otro evento:   UPDATE_STORE_CONFIG → sin sección documental.
 *   C — Referencia sin transacción → mensaje honesto, sin navegación falsa.
 *   D — Permiso insuficiente (error RLS) → mensaje honesto, sin bypass.
 *   + Venta anulada (sale_voided) conserva "Ver documento" certificado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── MOCK: supabase — la cadena exacta que usa el modal ────────────────────
const maybeSingleMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  },
}));

// ─── MOCK: items de la venta (hook existente) ───────────────────────────────
vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactionDetails: () => ({ data: [], isLoading: false }),
}));

// ─── MOCK: visor canónico — expone la transacción recibida ─────────────────
vi.mock('@/components/views/terminal/views/sales/TransactionDetailsModal', () => ({
  TransactionDetailsModal: ({ isOpen, transaction }: any) =>
    isOpen ? (
      <div data-testid="canonical-sale-viewer" data-tx-id={transaction?.id ?? ''}>
        visor canónico
      </div>
    ) : null,
}));

import { AuditEventDetailModal } from '@/components/views/terminal/views/audit/AuditEventDetailModal';
import type { AuditLogEntry } from '@/hooks/api/useAuditLogs';

const SALE_TX_ID = 'f3d176a6-3151-48fb-bb70-0914d2b9626d';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'evt-1',
    created_at: '2026-10-03T23:16:15Z',
    user_id: 'u1',
    action: 'CREATE_SALE_V2',
    table_name: 'transactions',
    record_id: SALE_TX_ID,
    store_id: 'store-1',
    metadata: { total_amount: 300, item_count: 1, payment_method: 'cash' },
    ...overrides,
  };
}

function renderModal(entry: AuditLogEntry | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuditEventDetailModal entry={entry} storeName="ENERVIDA" isOpen onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  maybeSingleMock.mockReset();
});

describe('AuditEventDetailModal — REMEDIACIÓN Ver venta', () => {
  it('CASO A: CREATE_SALE_V2 → [Ver venta] → [Abrir venta] → el visor recibe la venta EXACTA del evento', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: SALE_TX_ID, store_id: 'store-1', total_amount: 300, status: 'completed' },
      error: null,
    });

    renderModal(makeEntry());

    // Sección de negocio con datos reales del evento (sin fetch previo)
    expect(screen.getByText('Venta realizada')).toBeTruthy();
    expect(screen.getByText('Venta asociada')).toBeTruthy();
    expect(screen.getByText('Ref: f3d176a6')).toBeTruthy();
    expect(screen.getByText(/1 artículo\(s\) · Efectivo · Total:/)).toBeTruthy();

    // Paso 1: pedir la venta (fetch diferido por record_id)
    fireEvent.click(screen.getByRole('button', { name: /Ver venta del/ }));

    // Paso 2: abrir la venta correspondiente
    await waitFor(() => screen.getByRole('button', { name: /Abrir venta del/ }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir venta del/ }));

    const viewer = await waitFor(() => screen.getByTestId('canonical-sale-viewer'));
    // La venta abierta es EXACTAMENTE la asociada al evento — no "cualquier venta reciente"
    expect(viewer.getAttribute('data-tx-id')).toBe(SALE_TX_ID);
  });

  it('CASO B: evento sin venta (UPDATE_STORE_CONFIG) → sin sección documental ni botones falsos', () => {
    renderModal(makeEntry({ action: 'UPDATE_STORE_CONFIG', table_name: 'stores', record_id: 'bd247564-0000' }));

    expect(screen.getByText('Configuración de tienda actualizada')).toBeTruthy();
    expect(screen.queryByText('Venta asociada')).toBeNull();
    expect(screen.queryByText('Documento asociado')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ver venta/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ver documento/ })).toBeNull();
  });

  it('CASO C: transacción inexistente → mensaje honesto, jamás navegación fabricada', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    renderModal(makeEntry());
    fireEvent.click(screen.getByRole('button', { name: /Ver venta del/ }));

    await waitFor(() =>
      expect(screen.getByText(/La venta ya no existe o no es accesible con tu rol/)).toBeTruthy()
    );
    // No existe "Abrir venta" — no se fabrica documento
    expect(screen.queryByRole('button', { name: /Abrir venta/ })).toBeNull();
    expect(screen.queryByTestId('canonical-sale-viewer')).toBeNull();
  });

  it('CASO D: error de permisos (RLS) → mensaje honesto, sin bypass', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'row-level security' } });

    renderModal(makeEntry());
    fireEvent.click(screen.getByRole('button', { name: /Ver venta del/ }));

    await waitFor(() =>
      expect(screen.getByText(/La venta ya no existe o no es accesible con tu rol/)).toBeTruthy()
    );
    expect(screen.queryByTestId('canonical-sale-viewer')).toBeNull();
  });

  it('Venta anulada (sale_voided) conserva el flujo certificado "Ver documento"', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'tx-void-1', store_id: 'store-1', total_amount: 50, status: 'voided' },
      error: null,
    });

    renderModal(makeEntry({ action: 'sale_voided', metadata: { reason: 'error de caja' } }));

    expect(screen.getByText('Venta anulada')).toBeTruthy();
    expect(screen.getByText('Documento asociado')).toBeTruthy();
    expect(screen.queryByText('Venta asociada')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ver documento de la venta anulada/ }));
    await waitFor(() => screen.getByRole('button', { name: /Abrir documento de la venta anulada/ }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir documento de la venta anulada/ }));

    const viewer = await waitFor(() => screen.getByTestId('canonical-sale-viewer'));
    expect(viewer.getAttribute('data-tx-id')).toBe('tx-void-1');
  });

  it('El botón descriptivo es desechable tras usarse: sin duplicados de sección', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: SALE_TX_ID, store_id: 'store-1', total_amount: 300, status: 'completed' },
      error: null,
    });
    renderModal(makeEntry());
    fireEvent.click(screen.getByRole('button', { name: /Ver venta del/ }));
    await waitFor(() => screen.getByRole('button', { name: /Abrir venta del/ }));
    expect(screen.queryByRole('button', { name: /Ver venta del/ })).toBeNull();
  });
});
