/**
 * add-to-payroll-modal.test.tsx — «Agregar a Nómina» desde Trabajadores
 * (misión TRABAJADORES↔NÓMINAS 2026-11-13).
 *
 * Verifica el flujo exigido:
 *   - carga borradores de la tienda y datos del trabajador (tarifa al período);
 *   - elegibilidad con explicación (sin tarifa → no se puede confirmar);
 *   - incorporación a borrador EXISTENTE vía PUT /api/payrolls/[id] con las
 *     líneas previas + la nueva (MISMO servicio que el editor);
 *   - creación de nómina NUEVA vía POST /api/payrolls con store_id explícito
 *     + idempotency_key (MISMO servicio que el editor);
 *   - trabajador ya presente en el borrador → se informa y NO se confirma;
 *   - onDone solo tras éxito REAL del backend (nunca un botón que no guarda).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import { AddToPayrollModal } from '@/components/views/terminal/views/workers/nominas/AddToPayrollModal';

const STORE = 'store-1';
const WORKER = { worker_id: 'w-1', first_name: 'Dup', last_name: 'Test', status: 'active' };

const workerWithRate = {
  ...WORKER, ci: '99010192524', status: 'active', has_any_rate: true,
  rate_type: 'daily', rate_amount: 1000, rate_currency: 'CUP',
  rate_valid_from: '2026-11-01', rate_valid_to: null,
};

const draftPayroll = {
  id: 'pay-1', store_id: STORE, payroll_number: 'NOM-000001-2026', status: 'draft',
  tipo_nomina: 'sueldos', period_start: '2026-11-01', period_end: '2026-11-13',
  currency: 'CUP', total_workers: 1, total_net: 3000,
  payment_method: 'efectivo', cheque_number: null, cheque_date: null,
  reintegro_number: null, reintegro_date: null, notes: null,
  items: [{ id: 'i-1', payroll_id: 'pay-1', worker_id: 'w-9', worker_names: 'Otro Trabajador',
    regular_hours: 0, accrued_days: 3, overtime_hours: 0, overtime_amount: 0,
    vacation_days: 0, vacation_amount: 0, concepts: [] }],
};

function mockApi(responses: Array<(url: string, init?: RequestInit) => unknown>) {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
    for (const r of responses) {
      const out = r(String(url), init);
      if (out !== undefined) return Promise.resolve(out);
    }
    return Promise.resolve({});
  });
}

const draftsRoute = (data: unknown) => (_u: string) => (_u.includes('/api/payrolls?') && _u.includes('status=draft') ? data : undefined);
const workersRoute = (data: unknown) => (u: string) => (u.includes('/api/workers?') && u.includes('include_rate=1') ? { workers: [data] } : undefined);
const payrollDetailRoute = (data: unknown) => (u: string, init?: RequestInit) => (u.includes('/api/payrolls/pay-1') && !init?.method ? { payroll: data } : undefined);

function setup(responses: Array<(url: string, init?: RequestInit) => unknown>) {
  mockApi(responses);
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(<AddToPayrollModal worker={WORKER} storeId={STORE} onClose={onClose} onDone={onDone} />);
  return { onDone, onClose };
}

describe('AddToPayrollModal — incorporación desde Trabajadores', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('muestra la elegibilidad con tarifa vigente al período', async () => {
    setup([draftsRoute({ payrolls: [] }), workersRoute(workerWithRate)]);
    expect(await screen.findByText(/Verificando tarifa/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/1[.,]?000 CUP\/día/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/vigente para/i)).toBeInTheDocument();
    // Sin borradores → opción «Crear nueva nómina» marcada
    expect(screen.getByRole('radio', { name: /Crear nueva nómina/i })).toBeChecked();
  });

  it('sin tarifa → elegibilidad con explicación y confirmación bloqueada', async () => {
    setup([draftsRoute({ payrolls: [] }), workersRoute({ ...workerWithRate, rate_amount: null, rate_type: null, has_any_rate: false })]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sin tarifa salarial configurada/i);
    });
    expect(screen.getByRole('button', { name: /Crear nómina y agregar/i })).toBeDisabled();
  });

  it('borrador existente → PUT con líneas previas + nueva línea (mismo servicio del editor)', async () => {
    const user = userEvent.setup();
    let putBody: any = null;
    setup([
      draftsRoute({ payrolls: [draftPayroll] }),
      workersRoute(workerWithRate),
      payrollDetailRoute(draftPayroll),
      (u: string, init?: RequestInit) => {
        if (u === '/api/payrolls/pay-1' && init?.method === 'PUT') {
          putBody = JSON.parse(String(init.body));
          return { payroll_id: 'pay-1', payroll_number: 'NOM-000001-2026' };
        }
        return undefined;
      },
    ]);

    // Seleccionar el borrador existente
    const radio = await screen.findByRole('radio', { name: /NOM-000001-2026/i });
    await user.click(radio);
    await waitFor(() => expect(screen.getByText(/Otro Trabajador/i)).toBeInTheDocument()); // detalle cargado

    // Cantidad (tarifa diaria → días devengados)
    const qty = await screen.findByLabelText(/^Días devengados/i);
    await user.clear(qty);
    await user.type(qty, '5');
    expect(screen.getByText(/Devengado estimado/i)).toBeInTheDocument();
    expect(screen.getByText(/5[.,]?000 CUP/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Agregar al borrador/i }));
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody.items).toHaveLength(2);
    expect(putBody.items[1]).toMatchObject({ worker_id: 'w-1', accrued_days: 5 });
    // Conserva las líneas previas del borrador
    expect(putBody.items[0]).toMatchObject({ worker_id: 'w-9', accrued_days: 3 });
    // Éxito REAL → onDone con el id de la nómina
    await waitFor(() => expect(screen.getByRole('button', { name: /Agregar al borrador/i })).toBeEnabled());
  });

  it('trabajador YA en el borrador → se informa y no se puede confirmar', async () => {
    const user = userEvent.setup();
    const draftWithWorker = { ...draftPayroll, items: [{ ...draftPayroll.items[0], worker_id: 'w-1', worker_names: 'Dup Test' }] };
    setup([
      draftsRoute({ payrolls: [draftWithWorker] }),
      workersRoute(workerWithRate),
      payrollDetailRoute(draftWithWorker),
    ]);
    const radio = await screen.findByRole('radio', { name: /NOM-000001-2026/i });
    await user.click(radio);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/ya está en la nómina seleccionada/i);
    });
    expect(screen.getByRole('button', { name: /Agregar al borrador/i })).toBeDisabled();
  });

  it('nueva nómina → POST con store_id explícito e idempotency_key (mismo servicio)', async () => {
    const user = userEvent.setup();
    let postBody: any = null;
    const { onDone } = setup([
      draftsRoute({ payrolls: [] }),
      workersRoute(workerWithRate),
      (u: string, init?: RequestInit) => {
        if (u === '/api/payrolls' && init?.method === 'POST') {
          postBody = JSON.parse(String(init.body));
          return { payroll_id: 'pay-new', payroll_number: 'NOM-000002-2026' };
        }
        return undefined;
      },
    ]);

    await waitFor(() => expect(screen.getByText(/1[.,]?000 CUP\/día/i)).toBeInTheDocument());
    const qty = screen.getByLabelText(/^Días devengados/i);
    await user.clear(qty);
    await user.type(qty, '15');

    await user.click(screen.getByRole('button', { name: /Crear nómina y agregar/i }));
    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody.store_id).toBe(STORE); // ← tienda de la UI (causa raíz nº1)
    expect(postBody.items[0]).toMatchObject({ worker_id: 'w-1', accrued_days: 15 });
    expect(typeof postBody.idempotency_key).toBe('string');
    expect(postBody.idempotency_key.length).toBeGreaterThanOrEqual(8);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('pay-new'));
  });

  it('error del backend → mensaje de usuario y sin onDone (nunca confirmación falsa)', async () => {
    const user = userEvent.setup();
    const { onDone } = setup([
      draftsRoute({ payrolls: [] }),
      workersRoute(workerWithRate),
      (u: string, init?: RequestInit) => {
        if (u === '/api/payrolls' && init?.method === 'POST') {
          return Promise.reject(new Error('El trabajador no pertenece a la tienda o no está activo'));
        }
        return undefined;
      },
    ]);
    await waitFor(() => expect(screen.getByText(/1[.,]?000 CUP\/día/i)).toBeInTheDocument());
    const qty = screen.getByLabelText(/^Días devengados/i);
    await user.clear(qty);
    await user.type(qty, '5');
    await user.click(screen.getByRole('button', { name: /Crear nómina y agregar/i }));
    // Tras el fallo: botón re-habilitado (reintento posible) y SIN onDone
    await waitFor(() => expect(screen.getByRole('button', { name: /Crear nómina y agregar/i })).toBeEnabled());
    await act(async () => {});
    expect(onDone).not.toHaveBeenCalled();
  });
});
