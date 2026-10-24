/**
 * MISIÓN DE CIERRE (2026-10-24) — ReverseDocumentModal: formulario de
 * RECUPERACIÓN para devoluciones con reembolso liquidado (§4).
 *
 * Contrato:
 *  - type='devolution' con filas refund → panel de recuperación con el
 *    importe FIJO por moneda y selector de riel (cash/transfer/zelle;
 *    zelle no aparece para CUP);
 *  - devolución sin reembolsos → reversión documental pura (sin panel);
 *  - type≠devolution → sin panel (comportamiento previo intacto);
 *  - el submit envía { type, id, reason, recovery } con los componentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const sessionState = { value: null as any };
const reverseArgs = { value: null as any };
const reverseImpl = { value: async () => {} };

vi.mock('@/hooks/api/useReverseDocument', () => ({
  useReverseDocument: () => ({
    mutateAsync: async (args: any) => {
      reverseArgs.value = args;
      return reverseImpl.value();
    },
    reset: () => {},
    isPending: false,
    isError: false,
    error: null,
  }),
}));
vi.mock('@/hooks/ui/useFocusTrap', () => ({
  useFocusTrap: (_open: boolean, _onEsc: any) => null,
}));

// payment_transactions vía cliente RLS del navegador
const ptRows = { value: [] as any[] };
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'payment_transactions') throw new Error('tabla inesperada: ' + table);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: ptRows.value, error: null }),
            }),
          }),
        }),
      };
    },
  },
}));

import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';

const DOC_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  ptRows.value = [];
  reverseArgs.value = null;
  reverseImpl.value = async () => {};
});

describe('ReverseDocumentModal — recuperación del dinero (§4)', () => {
  it('devolución CON reembolso CUP: panel con importe fijo y riel por defecto', async () => {
    ptRows.value = [{ currency: 'CUP', amount: 60, payment_method: 'cash' }];
    render(<ReverseDocumentModal isOpen onClose={() => {}} type="devolution" docId={DOC_ID} docLabel="Devolución NC-1" />);
    await waitFor(() => expect(screen.getByTestId('recovery-panel')).toBeInTheDocument());
    // importe FIJO (60 CUP) mostrado — no editable
    expect(screen.getByText(/60[.,]00 CUP/)).toBeInTheDocument();
    // riel por defecto = el del reembolso (cash)
    const sel = screen.getByLabelText('Riel por el que volvió el dinero reembolsado en CUP') as HTMLSelectElement;
    expect(sel.value).toBe('cash');
  });

  it('reembolso USD: zelle disponible; reembolso CUP: zelle NO listado (PT005)', async () => {
    ptRows.value = [{ currency: 'USD', amount: 5, payment_method: 'cash' }];
    render(<ReverseDocumentModal isOpen onClose={() => {}} type="devolution" docId={DOC_ID} />);
    await waitFor(() => expect(screen.getByTestId('recovery-panel')).toBeInTheDocument());
    const sel = screen.getByLabelText(/USD/) as HTMLSelectElement;
    const options = Array.from(sel.options).map(o => o.value);
    expect(options).toContain('zelle');

    ptRows.value = [{ currency: 'CUP', amount: 60, payment_method: 'cash' }];
    render(<ReverseDocumentModal isOpen onClose={() => {}} type="devolution" docId="22222222-2222-4222-8222-222222222222" />);
    await waitFor(() => expect(screen.getByTestId('recovery-panel')).toBeInTheDocument());
    const selCup = screen.getByLabelText(/en CUP/) as HTMLSelectElement;
    expect(Array.from(selCup.options).map(o => o.value)).not.toContain('zelle');
  });

  it('devolución SIN reembolsos: reversión documental pura (sin panel)', async () => {
    ptRows.value = [];
    render(<ReverseDocumentModal isOpen onClose={() => {}} type="devolution" docId={DOC_ID} />);
    await waitFor(() => expect(screen.getByText(/reversión es documental/i)).toBeInTheDocument());
    expect(screen.queryByTestId('recovery-panel')).not.toBeInTheDocument();
  });

  it('type=transaction: sin panel de recuperación (comportamiento previo)', async () => {
    render(<ReverseDocumentModal isOpen onClose={() => {}} type="transaction" docId={DOC_ID} />);
    await waitFor(() => expect(screen.getByText(/Revertir esta venta/i)).toBeInTheDocument());
    expect(screen.queryByTestId('recovery-panel')).not.toBeInTheDocument();
  });

  it('submit envía recovery con moneda+riel; sin seleccionar riel no envía', async () => {
    ptRows.value = [{ currency: 'CUP', amount: 60, payment_method: 'cash' }];
    const { rerender } = render(<ReverseDocumentModal isOpen onClose={() => {}} type="devolution" docId={DOC_ID} />);
    await waitFor(() => expect(screen.getByTestId('recovery-panel')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Motivo de la reversión/), { target: { value: 'cliente devolvió el dinero' } });
    fireEvent.click(screen.getByRole('button', { name: /revertir/i }));
    await waitFor(() => expect(reverseArgs.value).toBeTruthy());
    expect(reverseArgs.value.recovery).toEqual([{ currency: 'CUP', method: 'cash' }]);

    // sin riel seleccionado → botón deshabilitado (no submit)
    reverseArgs.value = null;
    rerender(<ReverseDocumentModal isOpen onClose={() => {}} type="devolution" docId={DOC_ID} />);
    await waitFor(() => expect(screen.getByTestId('recovery-panel')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/en CUP/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Motivo de la reversión/), { target: { value: 'cliente devolvió el dinero' } });
    expect((screen.getByRole('button', { name: /revertir/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(reverseArgs.value).toBeNull();
  });
});
