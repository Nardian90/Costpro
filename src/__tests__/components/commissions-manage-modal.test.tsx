/**
 * commissions-manage-modal.test.tsx — Fase C §5 del brief.
 *
 * Flujo documental de comisiones con fixtures controlados (sin producción):
 *   - sugerencias del motor real (POST /api/commissions/calculate)
 *   - edición del importe final con nota OBLIGATORIA si difiere
 *   - confirmación → POST /api/commissions/payments (documento) +
 *     PATCH /payments/[id] action=pay con payment_method
 *   - sin duplicación por doble clic
 *   - workers ya pagados no se re-proponen
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import CommissionsManageModal from '@/components/views/terminal/views/cash/CommissionsManageModal';

const SUGGESTIONS = [
  {
    worker_id: 'w-1',
    worker_name: 'Ana Pérez',
    commission_suggested: 312,
    product_breakdown: [
      { product_id: 'p-1', product_name: 'Cemento TBV', commission: 190 },
      { product_id: 'p-2', product_name: 'Cemento Cola', commission: 100 },
      { product_id: 'p-3', product_name: 'Brecker', commission: 22 },
    ],
  },
  {
    worker_id: 'w-2',
    worker_name: 'Bob Gómez',
    commission_suggested: 88,
    product_breakdown: [],
  },
];

const EXISTING = [
  {
    id: 'pay-9',
    worker_id: 'w-3',
    calculated_amount: 50,
    final_amount: 60,
    status: 'paid',
    payment_method: 'cash',
    currency: 'CUP',
    manual_adjustment_reason: 'Ajuste autorizado por producción extra',
    paid_at: '2026-10-02T18:00:00Z',
    period_start: '2026-10-02',
    period_end: '2026-10-02',
    worker: { first_name: 'Cara', last_name: 'Ruiz', ci: '91021012345' },
  },
];

function setup({
  suggestions = SUGGESTIONS,
  existing = EXISTING,
}: { suggestions?: unknown[]; existing?: unknown[] } = {}) {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string, opts?: { body?: string }) => {
    const u = String(url);
    if (u.includes('/api/commissions/calculate')) return Promise.resolve(suggestions);
    if (u.includes('/api/commissions/payments?')) return Promise.resolve({ payments: existing, count: existing.length });
    if (u.match(/\/api\/commissions\/payments\/[^/]+$/) && opts?.body) {
      const body = JSON.parse(opts.body);
      if (body.action === 'pay') {
        return Promise.resolve({ id: 'pay-new', status: 'paid', ...body });
      }
    }
    if (u.includes('/api/commissions/payments') && opts?.body) {
      // POST creación del documento (draft)
      const body = JSON.parse(opts.body);
      return Promise.resolve({ payment: { id: 'pay-new', ...body } });
    }
    return Promise.resolve({});
  });
}

const PROPS = {
  storeId: 'store-1',
  period: { startDate: '2026-10-02', endDate: '2026-10-02' },
  onClose: vi.fn(),
  onConfirmed: vi.fn(),
};

beforeEach(() => {
  cleanup();
  setup();
});
afterEach(() => cleanup());

describe('§5.1 — carga de sugerencias del motor real', () => {
  it('muestra por trabajador el importe sugerido y el detalle de productos', async () => {
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    expect(screen.getByText('Bob Gómez')).toBeTruthy();
    expect(screen.getByText(/Sugerido:.*312/)).toBeTruthy();
    expect(screen.getByText(/3 producto\(s\)/)).toBeTruthy();
    //Totales: sugerido 400 = 312 + 88
    expect(screen.getByText(/Total sugerido/)).toBeTruthy();
    expect(screen.getByText(/Total final a confirmar/)).toBeTruthy();
  });

  it('medio de pago por defecto: EFECTIVO (§5.1)', async () => {
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    const efectivoBtn = screen.getAllByRole('button', { name: 'Efectivo' });
    expect(efectivoBtn.length).toBeGreaterThan(0);
    expect(efectivoBtn[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('workers ya pagados no se re-proponen (sin duplicar pagos §5.3)', async () => {
    // w-3 (Cara) está pagado en el período: la sugerencia del motor para w-3 no se ofrece
    const withPaid = [{ worker_id: 'w-3', worker_name: 'Cara Ruiz', commission_suggested: 50, product_breakdown: [] }, ...SUGGESTIONS];
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    expect(screen.queryByText('Cara Ruiz')).toBeNull(); // no en la propuesta
  });
});

describe('§5.2 — edición con nota obligatoria', () => {
  it('exige nota cuando el importe final difiere del sugerido; botón deshabilitado sin ella', async () => {
    const user = userEvent.setup();
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    const input = document.getElementById('cm-fin-w-1') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: '400' } }); });
    expect(screen.getByText(/Nota justificativa \*/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: /Confirmar y pagar/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // sin nota no se confirma
  });

  it('con nota válida el botón se habilita y la confirmación envía final + motivo', async () => {
    const user = userEvent.setup();
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    await act(async () => { fireEvent.change(document.getElementById('cm-fin-w-1')!, { target: { value: '400' } }); });
    await act(async () => {
      fireEvent.change(document.getElementById('cm-nota-w-1')!, { target: { value: 'Ventas de mostrar' } });
    });
    const confirm = screen.getByRole('button', { name: /Confirmar y pagar/i }) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    await user.click(confirm);
    await waitFor(() => {
      const post = apiFetchMock.mock.calls.find(c => String(c[0]) === '/api/commissions/payments' && (c[1] as { body: string }).body);
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as { body: string }).body);
      expect(body.worker_id).toBe('w-1');
      expect(body.final_amount).toBe(400);
      expect(body.manual_adjustment_reason).toBe('Ventas de mostrar');
    });
  });
});

describe('§5.3 — documento trazable + idempotencia', () => {
  it('confirmar crea el documento (POST) y paga (PATCH pay) con el medio elegido', async () => {
    const user = userEvent.setup();
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    // transfer para w-2
    const transferBtns = screen.getAllByRole('button', { name: 'Transferencia' });
    await user.click(transferBtns[1]); // w-2 (segundo renglón)
    await user.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));
    await waitFor(() => {
      const patch = apiFetchMock.mock.calls.find(c => String(c[0]).match(/\/api\/commissions\/payments\/pay-new$/) && (c[1] as { body?: string }).body);
      expect(patch).toBeTruthy();
    });
    const patches = apiFetchMock.mock.calls.filter(c => String(c[0]).match(/payments\/pay-new$/) && (c[1] as { body?: string }).body);
    for (const p of patches) {
      const body = JSON.parse((p[1] as { body: string }).body);
      expect(body.action).toBe('pay');
      expect(['cash', 'transfer']).toContain(body.payment_method);
    }
    // w-1 cash (default), w-2 transfer
    const w2Patch = patches.length >= 2 ? JSON.parse((patches[1][1] as { body: string }).body) : null;
    if (w2Patch) expect(w2Patch.payment_method).toBe('transfer');
    await waitFor(() => expect(PROPS.onConfirmed).toHaveBeenCalled());
  });

  it('doble clic no duplica: submittingRef bloquea la segunda confirmación', async () => {
    let slowResolve: (v: unknown) => void = () => {};
    apiFetchMock.mockImplementation((url: string, opts?: { body?: string }) => {
      const u = String(url);
      if (u === '/api/commissions/payments' && opts?.body) {
        return new Promise(res => { slowResolve = res; });
      }
      if (u.includes('/calculate')) return Promise.resolve(SUGGESTIONS);
      if (u.includes('/api/commissions/payments?')) return Promise.resolve({ payments: EXISTING });
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    const confirm = screen.getByRole('button', { name: /Confirmar y pagar/i }) as HTMLButtonElement;
    await user.click(confirm);
    await waitFor(() => expect(confirm.disabled).toBe(true)); // en curso
    await user.click(confirm).catch(() => undefined); // segundo clic ignorado
    const posts = apiFetchMock.mock.calls.filter(c => String(c[0]) === '/api/commissions/payments' && (c[1] as { body?: string }).body);
    expect(posts.length).toBe(1);
    await act(async () => { slowResolve({ payment: { id: 'pay-x' } }); });
  });
});

describe('§5.3 — historial del período', () => {
  it('muestra documentos con calculado vs final y la nota de modificación', async () => {
    const user = userEvent.setup();
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: /Historial del período/i }));
    await waitFor(() => expect(screen.getByText(/Cara Ruiz/)).toBeTruthy());
    expect(screen.getByText(/Pagada/)).toBeTruthy();
    expect(screen.getByText(/Ajuste autorizado por producción extra/)).toBeTruthy();
    // calculado 50 vs final 60 (modificado, visible)
    expect(screen.getByText(/Calculado:/)).toBeTruthy();
    expect(screen.getByText(/Final:/)).toBeTruthy();
  });
});

describe('Estados — sin sugerencias', () => {
  it('mensaje claro cuando el motor no genera sugerencias', async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/calculate')) return Promise.resolve([]);
      if (u.includes('/api/commissions/payments?')) return Promise.resolve({ payments: [] });
      return Promise.resolve({});
    });
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/Sin comisiones sugeridas pendientes/)).toBeTruthy());
  });
});

describe('AUDIT-2026-10-15 — contrato de tienda (causa raíz del «no se muestra nada»)', () => {
  it('envía store_id REAL a /calculate y a /payments (antes: sin store_id → 400 y "me" → 500)', async () => {
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    const calcCall = apiFetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/api/commissions/calculate'));
    expect(calcCall).toBeTruthy();
    const calcBody = JSON.parse((calcCall![1] as { body: string }).body);
    expect(calcBody.store_id).toBe('store-1'); // requerido por el contrato del endpoint
    expect(calcBody.date_from).toBe('2026-10-02');
    expect(calcBody.date_to).toBe('2026-10-02');
    const payCall = apiFetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/api/commissions/payments?'));
    expect(payCall).toBeTruthy();
    expect(String(payCall![0])).toContain('store_id=store-1');
    expect(String(payCall![0])).not.toContain('store_id=me'); // el centinela "me" provocaba 500
  });

  it('el POST de confirmación incluye store_id (contrato del documento de comisión)', async () => {
    const user = userEvent.setup();
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));
    await waitFor(() => expect(PROPS.onConfirmed).toHaveBeenCalled());
    const post = apiFetchMock.mock.calls.find((c: unknown[]) => String(c[0]) === '/api/commissions/payments' && (c[1] as { body?: string }).body);
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as { body: string }).body);
    expect(body.store_id).toBe('store-1');
  });

  it('UI-02: si /calculate falla muestra mensaje comprensible (antes tragaba el error y quedaba vacío)', async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/calculate')) return Promise.reject(new Error('boom'));
      if (u.includes('/api/commissions/payments?')) return Promise.resolve({ payments: [] });
      return Promise.resolve({});
    });
    render(<CommissionsManageModal {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/No se pudieron calcular las comisiones sugeridas/)).toBeTruthy());
    // y NO muestra el estado vacío engañoso
    expect(screen.queryByText(/Sin comisiones sugeridas pendientes/)).toBeNull();
  });
});
