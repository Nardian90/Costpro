/**
 * CashFlowReverseModal — anulación de documento confirmado (MISIÓN
 * INGRESOS/EGRESOS 2026-10-20, requisitos §9).
 *
 * Contrato: confirmación inequívoca (documento + importe + efecto inverso),
 * motivo OBLIGATORIO ≥ 3 caracteres, POST /api/cash-flow/reverse con actor
 * de la sesión, error visible sin cerrar, cierre limpio tras éxito.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CashFlowReverseModal } from '@/components/views/terminal/views/cash_flow/CashFlowReverseModal';
import type { CashFlowDocument } from '@/types';

beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const DOC: CashFlowDocument = {
  id: '44444444-4444-4444-4444-444444444444',
  store_id: 'store-1',
  document_number: 'IE-000009-2026',
  doc_type: 'ingreso',
  concept: 'constitucion_fondo',
  amount: 5000,
  currency: 'CUP',
  exchange_rate: 1,
  amount_cup: 5000,
  payment_method: 'cash',
  operation_date: '2026-10-20T15:00:00Z',
  status: 'confirmado',
  closure_id: 'c-1',
  responsible_user_id: 'u-2',
  counterparty: 'Encargado',
  justification: 'Fondo de cambio',
  notes: null,
  related_document_id: null,
  payment_transaction_id: 'pt-9',
  annulment_payment_transaction_id: null,
  idempotency_key: null,
  created_at: '2026-10-20T15:00:00Z',
  created_by: 'u-2',
  confirmed_at: '2026-10-20T15:00:00Z',
  confirmed_by: 'u-2',
  annulled_at: null,
  annulled_by: null,
  annulment_reason: null,
  responsible: { full_name: 'Ana Torres' },
  annulled_by_profile: null,
  related_document: null,
};

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

function renderModal(doc: CashFlowDocument | null = DOC) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <CashFlowReverseModal isOpen={!!doc} onClose={onClose} doc={doc} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  cleanup();
  apiFetchMock.mockReset();
});

describe('CashFlowReverseModal — confirmación y motivo obligatorio', () => {
  it('1 · muestra documento, importe y EFECTO INVERSO inequívoco', async () => {
    renderModal();
    expect(await screen.findByText('IE-000009-2026')).toBeTruthy();
    expect(screen.getByText(/Constitución del fondo de cambio/)).toBeTruthy();
    expect(screen.getByText('$5,000.00')).toBeTruthy();
    // Ingreso anulado ⇒ el dinero SALE del efectivo esperado
    expect(screen.getByText(/Sale del efectivo esperado/)).toBeTruthy();
    expect(screen.getByText('−$5,000.00 CUP')).toBeTruthy();
    // Historia intacta: aviso de fila contraria y cierres congelados
    expect(screen.getByText(/cierre histórico NO se modifica/i)).toBeTruthy();
    expect(screen.getByText(/No es posible anular dos veces/i)).toBeTruthy();
  });

  it('2 · motivo < 3 caracteres → botón Anular deshabilitado', async () => {
    renderModal();
    const btn = await screen.findByRole('button', { name: /Confirmar anulación del documento/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo de la anulación/), { target: { value: 'no' } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo de la anulación/), { target: { value: 'Importe registrado por error' } });
    await waitFor(() => expect(btn).toBeEnabled());
  });

  it('3 · POST /api/cash-flow/reverse con document_id y reason; cierra tras éxito', async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, document_number: 'IE-000009-2026', status_doc: 'anulado' });
    const { onClose } = renderModal();
    fireEvent.change(await screen.findByLabelText(/Motivo de la anulación/), { target: { value: 'Importe registrado por error' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar anulación del documento/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/cash-flow/reverse');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      document_id: '44444444-4444-4444-4444-444444444444',
      reason: 'Importe registrado por error',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('4 · error del backend (doble anulación 409) → visible, modal NO se cierra', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('El documento ya está anulado'));
    const { onClose } = renderModal();
    fireEvent.change(await screen.findByLabelText(/Motivo de la anulación/), { target: { value: 'Reintento de anulación' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar anulación del documento/i }));
    expect(await screen.findByText(/ya está anulado/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('5 · egreso: la anulación REGRESA el dinero al efectivo esperado', async () => {
    renderModal({ ...DOC, doc_type: 'egreso', concept: 'devolucion_parcial_fondo', amount: 2000, amount_cup: 2000 });
    expect(await screen.findByText(/Regresa al efectivo esperado/)).toBeTruthy();
    expect(screen.getByText('+$2,000.00 CUP')).toBeTruthy();
  });
});
