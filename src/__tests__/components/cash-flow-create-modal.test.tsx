/**
 * CashFlowCreateModal — flujo de registro del documento Ingreso/Egreso
 * (MISIÓN INGRESOS/EGRESOS 2026-10-20, requisitos §6).
 *
 * Contrato verificado:
 *   1. Dos pasos: EDICIÓN (validaciones junto al campo) → CONFIRMACIÓN
 *      (resumen inequívoco con efecto esperado sobre el saldo) → REGISTRADO.
 *   2. Campos dinámicos por tipo: egreso muestra conceptos de egreso y la
 *      devolución de fondo el vínculo al documento origen.
 *   3. Reglas espejo del backend: importe > 0 con 2 decimales, justificación
 *      obligatoria, egreso ≤ efectivo disponible, devolución ≤ fondo vigente,
 *      sin turno abierto → bloqueado con explicación.
 *   4. Payload a /api/cash-flow con idempotency_key (anti doble envío) y
 *      operation_date undefined cuando es HOY (NOW() del servidor).
 *   5. Éxito → número IE real + efecto final; error → visible sin cerrar.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CashFlowCreateModal } from '@/components/views/terminal/views/cash_flow/CashFlowCreateModal';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import type { CashFlowSummary } from '@/types';

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

const TURNO = {
  id: 'c-1',
  store_id: 'store-1',
  status: 'pendiente',
  opening_balance: 5000,
  created_at: '2026-10-20T14:00:00Z',
};

const SUMMARY: CashFlowSummary = {
  window_start: '2026-10-20T14:00:00Z',
  has_pending_shift: true,
  opening_balance: 5000,
  total_sales: 169000,
  cash_sales: 169000,
  cash_outflows: 0,
  cash_production: 0,
  cash_commissions: 0,
  cash_flow_in: 0,
  cash_flow_out: 0,
  cash_refunds: 0,
  voucher_refunds: 0,
  expected_cash: 174000, // fondo 5.000 + ventas 169.000
  transfer_sales: 0,
  zelle_sales: 0,
  expected_total: 174000,
  fondo_vigente: 5000,
  fondo_ingresado: 0,
  fondo_devuelto: 0,
  period: {
    from: '2026-10-20T00:00:00Z',
    to: '2026-10-20T23:59:59Z',
    in_cup: 0,
    out_cup: 0,
    in_usd: 0,
    out_usd: 0,
    ingresos_count: 0,
    egresos_count: 0,
    annulled_count: 0,
  },
};

// ── MOCK: supabase (turno + fecha global + fuentes de fondo) ──
const fromMock = vi.fn();
const rpcMock = vi.fn();

function chain(result: { data: unknown; error: unknown | null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'order', 'limit']) {
    c[m] = vi.fn(() => c);
  }
  for (const m of ['range', 'single', 'maybeSingle']) {
    c[m] = vi.fn(() => terminal());
  }
  c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      user: {
        id: 'u-1',
        fullName: 'Ana Torres',
        activeStoreId: 'store-1',
        // MISIÓN CAJA v2.24.0: la entrega de efectivo exige rol de autoridad
        // (admin/manager/encargado) — espejo de ERR_DELIVERY_ROLE del RPC.
        roles: ['admin'],
        memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }],
      },
    };
    return sel ? sel(state) : state;
  },
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

function renderModal(summary: CashFlowSummary | null = SUMMARY) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CashFlowCreateModal
        open
        onClose={vi.fn()}
        storeId="store-1"
        storeName="Tienda Central"
        summary={summary}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'cash_closures') return chain({ data: TURNO, error: null });
    return chain({ data: [], error: null });
  });
  // La fecha máxima operativa de la tienda = HOY dinámico (día de negocio
  // Habana del entorno): el picker por defecto usa hoy y debe validar.
  rpcMock.mockReset().mockImplementation(async (name: string) => {
    if (name === 'get_global_max_operation_date') {
      return { data: todayBusinessDay(), error: null };
    }
    return { data: null, error: null };
  });
  apiFetchMock.mockReset();
});

describe('CashFlowCreateModal — paso 1 EDICIÓN (validaciones junto al campo)', () => {
  it('1 · puerta de entrada: «Revisar y confirmar» deshabilitado sin importe ni justificación', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Motivo *')).toBeTruthy());
    const btn = screen.getByRole('button', { name: /Revisar y confirmar/i });
    expect(btn).toBeDisabled();
    // Validaciones visibles
    expect(screen.getByText('Introduce el importe.')).toBeTruthy();
    expect(screen.getByText('La justificación es obligatoria.')).toBeTruthy();
    // Estado de caja visible (requisito: caja, saldo y fondo identificados)
    expect(screen.getByText(/Saldo físico CUP:/)).toBeTruthy();
    expect(screen.getByText(/Fondo de cambio:/)).toBeTruthy();
  });

  it('2 · importe con 3 decimales o ≤ 0 → error de precisión/importe (validación monetaria)', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByLabelText(/Importe/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '10.001' } });
    fireEvent.change(screen.getByLabelText(/Justificación \*/), { target: { value: 'Fondo de cambio' } });
    expect(await screen.findByText(/máximo 2 decimales/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '0' } });
    expect(await screen.findByText('El importe debe ser mayor que cero.')).toBeTruthy();
  });

  it('3 · concepto dinámico por tipo: egreso → devoluciones y vínculo al fondo de origen', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Egreso/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Egreso/ }));
    const conceptSelect = screen.getByLabelText(/Motivo \*/);
    // Matriz: solo conceptos de egreso (v2.24 añade entrega_efectivo — con
    // turno abierto sigue siendo egreso autorizable dentro de la ventana)
    const options = Array.from(conceptSelect.querySelectorAll('option')).map(o => o.value);
    expect(options).toEqual(['devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso', 'entrega_efectivo']);
    // Devolución parcial → aparece el vínculo opcional al documento origen
    fireEvent.change(conceptSelect, { target: { value: 'devolucion_parcial_fondo' } });
    expect(await screen.findByLabelText(/Fondo de origen/)).toBeTruthy();
    // Ingreso → sin vínculo
    fireEvent.click(screen.getByRole('radio', { name: /Ingreso/ }));
    await waitFor(() => expect(screen.queryByLabelText(/Fondo de origen/)).toBeNull());
  });

  it('4 · devolución que supera el fondo vigente → bloqueada con explicación (escenario 5)', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Egreso/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Egreso/ }));
    fireEvent.change(screen.getByLabelText(/Motivo \*/), { target: { value: 'devolucion_parcial_fondo' } });
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '8000' } }); // fondo = 5.000
    fireEvent.change(screen.getByLabelText(/Justificación \*/), { target: { value: 'Devolver parte del fondo' } });
    expect(await screen.findByText(/supera el fondo de cambio vigente/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeDisabled();
    // 2.000 sí es válido (5.000 − 2.000 ⇒ quedan 3.000)
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '2000' } });
    await waitFor(() => expect(screen.queryByText(/supera el fondo de cambio vigente/)).toBeNull());
    expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeEnabled();
  });

  it('5 · egreso mayor que el efectivo disponible → bloqueado (no egresar más del disponible)', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Egreso/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Egreso/ }));
    fireEvent.change(screen.getByLabelText(/Motivo \*/), { target: { value: 'otro_egreso' } });
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '999999' } });
    fireEvent.change(screen.getByLabelText(/Justificación \*/), { target: { value: 'Salida autorizada' } });
    expect(await screen.findByText(/supera el efectivo disponible/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeDisabled();
  });

  it('6 · USD: advertencia de tasa del servidor (moneda admitida, equivalencia diferida)', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByLabelText(/Importe \*/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/Moneda \*/), { target: { value: 'USD' } });
    expect(await screen.findByText(/tasa del servidor/i)).toBeTruthy();
    // La equivalencia NO se inventa en el cliente (jerarquía server-side)
    expect(screen.getByText(/jerarquía tienda → BCC → elToque/i)).toBeTruthy();
  });

  it('7 · sin turno abierto: modo ENTREGA de efectivo (única operación autorizada — misión v2.24 §6)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'cash_closures') return chain({ data: null, error: null });
      return chain({ data: [], error: null });
    });
    renderModal({ ...SUMMARY, has_pending_shift: false, expected_cash: 0, fondo_vigente: 0 });
    // El concepto se fuerza a entrega_efectivo (egreso sin turno, closure_id nulo)
    const concepto = await screen.findByLabelText(/Motivo \*/) as HTMLSelectElement;
    await waitFor(() => expect(concepto.value).toBe('entrega_efectivo'));
    // Contraparte OBLIGATORIA (quien recibe el dinero) — sin ella no se confirma
    expect(await screen.findByText(/contraparte obligatoria/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeDisabled();
  });

  it('7b · entrega sin turno completa: receptor + importe ≤ saldo físico → confirmable (prueba 3 de la misión)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'cash_closures') return chain({ data: null, error: null });
      return chain({ data: [], error: null });
    });
    renderModal({ ...SUMMARY, has_pending_shift: false, expected_cash: 0, fondo_vigente: 0 });
    const concepto = (await screen.findByLabelText(/Motivo \*/)) as HTMLSelectElement;
    await waitFor(() => expect(concepto.value).toBe('entrega_efectivo'));
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/Justificación \*/), { target: { value: 'Entrega del efectivo acumulado CUP' } });
    fireEvent.change(screen.getByLabelText(/Quien RECIBE el dinero/), { target: { value: 'Receptor autorizado' } });
    // Aviso de operación FUERA DE TURNO visible (trazabilidad §6)
    expect(await screen.findByText(/FUERA DE TURNO/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /Revisar y confirmar/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    await waitFor(() => expect(screen.getByText('Resumen de la operación')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Documento/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const postCall = apiFetchMock.mock.calls.find(
      (c: unknown[]) => (c[1] as { method?: string } | undefined)?.method === 'POST',
    ) as [string, { body: string }] | undefined;
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall![1].body);
    expect(body.doc_type).toBe('egreso');
    expect(body.concept).toBe('entrega_efectivo');
    expect(body.counterparty).toBe('Receptor autorizado');
    // REVISIÓN FINAL v2.24.1: idempotencia cooperativa — el modal envía la
    // clave estable por apertura (el RPC v2.24.1 la usa contra el registry).
    expect(typeof body.idempotency_key).toBe('string');
    expect(body.idempotency_key).toMatch(/^cf-/);
  });
});

describe('CashFlowCreateModal — paso 2 CONFIRMACIÓN y registro', () => {
  async function llenarYRevisar() {
    renderModal();
    await waitFor(() => expect(screen.getByLabelText(/Importe \*/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Importe \*/), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/Justificación \*/), { target: { value: 'Fondo de cambio entregado por el encargado' } });
    fireEvent.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    await waitFor(() => expect(screen.getByText('Resumen de la operación')).toBeTruthy());
  }

  it('8 · resumen inequívoco: importe, motivo y EFECTO ESPERADO sobre saldo y fondo', async () => {
    await llenarYRevisar();
    expect(screen.getByText('Constitución del fondo de cambio')).toBeTruthy();
    // Efecto esperado: 174.000 → 179.000 (saldo) y 5.000 → 10.000 (fondo)
    expect(screen.getByText('$179,000.00')).toBeTruthy();
    expect(screen.getByText('$10,000.00')).toBeTruthy();
    expect(screen.getByText(/Fondo de cambio:/)).toBeTruthy();
  });

  it('9 · confirmar → POST /api/cash-flow con payload completo e idempotencia; éxito con número IE', async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      document_id: 'd1',
      document_number: 'IE-000001-2026',
      doc_type: 'ingreso',
      concept: 'constitucion_fondo',
      amount: 5000,
      currency: 'CUP',
      exchange_rate: 1,
      amount_cup: 5000,
      operation_date: '2026-10-20T15:00:00Z',
      status_doc: 'confirmado',
      payment_transaction_id: 'pt-1',
      cash_before: 174000,
      cash_after: 179000,
      fondo_before: 5000,
      fondo_after: 10000,
    });
    await llenarYRevisar();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Documento/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/cash-flow');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.doc_type).toBe('ingreso');
    expect(body.concept).toBe('constitucion_fondo');
    expect(body.amount).toBe(5000);
    expect(body.currency).toBe('CUP');
    expect(body.justification).toBe('Fondo de cambio entregado por el encargado');
    // HOY → operation_date undefined (NOW() del servidor: dentro del turno)
    expect(body.operation_date).toBeUndefined();
    // Idempotencia anti doble envío (clave generada con prefijo cf-)
    expect(body.idempotency_key).toMatch(/^cf-/);
    // Paso registrado con el número real y el efecto final
    expect(await screen.findByText('Documento registrado')).toBeTruthy();
    expect(screen.getByText('IE-000001-2026')).toBeTruthy();
    expect(screen.getByText('$179,000.00')).toBeTruthy();
  });

  it('10 · error del backend → visible en el paso de confirmación (sin cerrar el modal)', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('La caja no tiene un turno abierto'));
    await llenarYRevisar();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Documento/i }));
    expect(await screen.findByText(/turno abierto/i)).toBeTruthy();
    // El modal permanece en el paso de confirmación con Volver a editar
    expect(screen.getByRole('button', { name: /Volver a editar/i })).toBeTruthy();
  });

  it('11 · anti doble envío: botón deshabilitado mientras registra (isPending)', async () => {
    let resolveApi: (v: unknown) => void = () => {};
    apiFetchMock.mockImplementationOnce(() => new Promise(res => { resolveApi = res; }));
    await llenarYRevisar();
    const btn = screen.getByRole('button', { name: /Confirmar Documento/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: /Registrando/i })).toBeDisabled());
    resolveApi({ success: true, document_number: 'IE-000002-2026', cash_after: 1, fondo_after: 1, amount: 1, currency: 'CUP' });
    await waitFor(() => expect(screen.getByText('Documento registrado')).toBeTruthy());
  });
});
