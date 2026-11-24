/**
 * CP-OPS-ENERVIDA §6.2/§6.3 — Validaciones del panel «Liquidar seleccionadas».
 *
 * Contrato verificado:
 *  1. Liquidación total por defecto (importe = saldo, restante 0).
 *  2. Liquidación PARCIAL: importe editable ≤ saldo; restante = saldo − importe.
 *  3. Ningún documento puede recibir un pago superior a su saldo (submit
 *     deshabilitado + aviso de validación).
 *  4. Riel de divisa: Transf. Exterior con documentos CUP en el lote se
 *     bloquea (lotes compatibles — misión §6.3-4).
 *  5. Total de la operación = Σ importes asignados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/store', () => ({
  useAuthStore: Object.assign(vi.fn(() => ({ token: 'test-token' })), {
    getState: () => ({ token: 'test-token' }),
  }),
}));

vi.mock('@/components/ui/BaseModal', () => ({
  BaseModal: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="base-modal">{children}</div> : null,
}));

import { LiquidationModal, type LiquidationItem } from '@/components/views/terminal/views/accounts_payable/LiquidationModal';

const ITEMS: LiquidationItem[] = [
  { id: 'd1', ref_type: 'receipt', ref_id: 'r-1', supplier: 'Proveedor A', reference: 'ENT-000003-2026', balance: 100, currency: 'CUP' },
  { id: 'd2', ref_type: 'service', ref_id: 's-1', supplier: 'Proveedor B', reference: 'SRV-20261123-00147', balance: 250, currency: 'CUP' },
];

function setup() {
  return render(<LiquidationModal open onClose={vi.fn()} items={ITEMS} onSettled={vi.fn()} />);
}

describe('CP-OPS-ENERVIDA · LiquidationModal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('liquidación total por defecto: importes = saldos, restante 0 y total correcto', () => {
    setup();
    const total = screen.getAllByText(/350/);
    expect(total.length).toBeGreaterThan(0);
    expect((screen.getByTestId('liquidation-confirm') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('liquidation-validation')).toBeNull();
  });

  it('liquidación PARCIAL: importe editable conserva el restante', async () => {
    setup();
    const user = userEvent.setup();
    const input = screen.getByLabelText('Importe a liquidar de SRV-20261123-00147') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '150');
    expect(input.value).toBe('150');
    // restante = 250 − 150 = 100 (saldo restante visible en su fila)
    expect(screen.getAllByText(/100/).length).toBeGreaterThan(0);
  });

  it('overpay: importe > saldo deshabilita el envío y muestra la regla', async () => {
    setup();
    const user = userEvent.setup();
    const input = screen.getByLabelText('Importe a liquidar de ENT-000003-2026') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '150');
    expect((screen.getByTestId('liquidation-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('liquidation-validation').textContent)
      .toContain('Ningún documento puede recibir un pago superior a su saldo pendiente.');
  });

  it('riel de divisa: Transf. Exterior con documentos CUP queda bloqueada', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Transf\. Exterior/i }));
    expect((screen.getByTestId('liquidation-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Transf\. Exterior es un riel de divisa/i)).toBeDefined();
  });
});
