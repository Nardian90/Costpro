/**
 * worker-search-select.test.tsx — Selector de trabajadores para nóminas
 * (misión TRABAJADORES↔NÓMINAS 2026-11-13).
 *
 * Verifica la experiencia exigida (misma que el selector de productos):
 *   - búsqueda dinámica mientras se escribe (debounce) por nombre completo,
 *     apellido parcial, CI y expediente;
 *   - insensibilidad a mayúsculas y ACENTOS (normalización NFD);
 *   - identidad completa en cada resultado (nombre, CI, expediente, tarifa);
 *   - los no elegibles aparecen DESHABILITADOS con su causa (no ocultos);
 *   - selección → callback con el trabajador + campo limpio y enfocado para
 *     agregar otro;
 *   - navegación por teclado (↑/↓/Enter);
 *   - estados: sin resultados, sin trabajadores, sin elegibles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import {
  WorkerSearchSelect,
  type SelectableWorker,
} from '@/components/views/terminal/views/workers/nominas/WorkerSearchSelect';

const workers: SelectableWorker[] = [
  {
    worker_id: 'w-1', first_name: 'Dup', last_name: 'Test', ci: '99010192524',
    status: 'active', expediente_laboral: 'EXP-0042', cargo: 'Cajero',
    categoria_ocupacional: 'Administrativo', area_trabajo: 'Ventas',
    rate_type: 'daily', rate_amount: 1000, rate_currency: 'CUP',
    rate_valid_from: '2026-11-01', rate_valid_to: null, has_any_rate: true,
  },
  {
    worker_id: 'w-2', first_name: 'Dup', last_name: 'Test', ci: '99010188342',
    status: 'active', expediente_laboral: null, cargo: null,
    rate_amount: null, rate_type: null, has_any_rate: false,
  },
  {
    worker_id: 'w-3', first_name: 'José', last_name: 'Pérez', ci: '99100112345',
    status: 'active', expediente_laboral: 'EXP-0007',
    rate_type: 'hourly', rate_amount: 120, rate_currency: 'CUP',
    rate_valid_from: '2026-11-01', rate_valid_to: null, has_any_rate: true,
  },
  {
    worker_id: 'w-4', first_name: 'María', last_name: 'Iñiguez', ci: '99120267890',
    status: 'inactive', rate_amount: null, rate_type: null, has_any_rate: false,
  },
];

const PERIOD = { start: '2026-11-01', end: '2026-11-13' };

function setup(overrides?: Partial<Parameters<typeof WorkerSearchSelect>[0]>) {
  const onSelect = vi.fn();
  render(
    <WorkerSearchSelect
      workers={workers}
      addedWorkerIds={new Set<string>()}
      periodStart={PERIOD.start}
      periodEnd={PERIOD.end}
      onSelect={onSelect}
      inputId="test-worker-search"
      {...overrides}
    />,
  );
  const input = screen.getByPlaceholderText(/Buscar trabajador por nombre, apellido o expediente/i);
  return { input, onSelect };
}

async function typeAndSettle(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.clear(input as HTMLInputElement);
  if (text) await user.type(input, text);
  // useDebounce(200ms)
  await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
}

describe('WorkerSearchSelect — búsqueda dinámica (experiencia tipo selector de productos)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('muestra guía inicial con el total de trabajadores de la tienda', () => {
    setup();
    expect(screen.getByText(/Escribe para buscar entre 4 trabajadores/i)).toBeInTheDocument();
  });

  it('busca por nombre completo mientras se escribe', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'José Pérez');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText(/José Pérez/)).toBeInTheDocument();
    expect(screen.queryByText(/^Dup Test/)).not.toBeInTheDocument();
  });

  it('busca por apellido parcial y por fragmento', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'íñ'); // fragmento con acentos → Iñiguez
    expect(screen.getByText(/María Iñiguez/)).toBeInTheDocument();
    await typeAndSettle(user, input, 'rez'); // fragmento de apellido
    expect(screen.getByText(/José Pérez/)).toBeInTheDocument();
  });

  it('busca por número de expediente', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'EXP-0042');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/Dup Test/);
    expect(options[0]).toHaveTextContent(/Exp\. EXP-0042/);
  });

  it('busca por CI (desambiguación de duplicados de nombre)', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, '99010192524');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/CI 99010192524/);
  });

  it('insensible a mayúsculas y acentos: «DÚP TÉST» encuentra «Dup Test»', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'DÚP TÉST');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2); // los 2 Dup Test (el tercero es José)
  });

  it('sin resultados → mensaje con la consulta', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'zzz-inexistente');
    expect(screen.getByText(/Sin resultados para «zzz-inexistente»/i)).toBeInTheDocument();
  });

  it('resultados con identidad completa: cargo, categoría, área y tarifa con unidad', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'Dup Test 0042');
    const opt = screen.getByRole('option');
    expect(opt).toHaveTextContent(/Cajero/);
    expect(opt).toHaveTextContent(/Administrativo/);
    expect(opt).toHaveTextContent(/Ventas/);
    // El separador de miles depende del ICU del entorno ("1000" | "1.000")
    expect(opt).toHaveTextContent(/1[.,]?000 CUP\/día/);
  });

  it('trabajador SIN tarifa → deshabilitado con explicación (no oculto)', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, '99010188342'); // el Dup Test sin tarifa
    const opt = screen.getByRole('option');
    expect(opt).toBeDisabled();
    expect(opt).toHaveTextContent(/Trabajador sin tarifa salarial configurada/i);
  });

  it('trabajador inactivo → deshabilitado con explicación (no oculto)', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'Iñiguez');
    const opt = screen.getByRole('option');
    expect(opt).toBeDisabled();
    expect(opt).toHaveTextContent(/Trabajador inactivo/i);
  });

  it('ya agregado a la nómina → deshabilitado con explicación', async () => {
    const user = userEvent.setup();
    render(
      <WorkerSearchSelect
        workers={workers}
        addedWorkerIds={new Set(['w-3'])}
        periodStart={PERIOD.start}
        periodEnd={PERIOD.end}
        onSelect={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(/Buscar trabajador/i);
    await typeAndSettle(user, input, 'Pérez');
    const opt = screen.getByRole('option');
    expect(opt).toBeDisabled();
    expect(opt).toHaveTextContent(/Ya agregado a esta nómina/i);
  });

  it('selección con clic → callback con el trabajador, campo limpio y enfocado', async () => {
    const user = userEvent.setup();
    const { input, onSelect } = setup();
    await typeAndSettle(user, input, 'José');
    await user.click(screen.getByRole('option'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      worker_id: 'w-3',
      rate_type: 'hourly',
      rate_amount: 120,
    }));
    // requestAnimationFrame del select() → esperar el foco
    await waitFor(() => expect(input).toHaveFocus());
    expect((input as HTMLInputElement).value).toBe(''); // limpio para agregar otro
  });

  it('no dispara callback al clicar un resultado deshabilitado', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    const input = screen.getByPlaceholderText(/Buscar trabajador/i);
    await typeAndSettle(user, input, '99010188342');
    await user.click(screen.getByRole('option'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('teclado: ↓ selecciona el segundo resultado, Enter incorpora', async () => {
    const { input, onSelect } = setup();
    fireEvent.change(input, { target: { value: 'Dup Test' } });
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
    // Elegibles primero: José no matchea «Dup Test»; los 2 Dup Test: w-1
    // (elegible) primero, w-2 (sin tarifa, deshabilitado) después.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' }); // focusedIndex=1 → w-2 deshabilitado → NO callback
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // vuelve a 0 → w-1 elegible
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ worker_id: 'w-1' }));
  });

  it('Escape limpia la búsqueda (vuelve a la guía tras el debounce)', async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'José' } });
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
    expect(screen.getByText(/Escribe para buscar entre 4 trabajadores/i)).toBeInTheDocument();
  });

  it('sin trabajadores en la tienda → estado explícito', () => {
    render(
      <WorkerSearchSelect workers={[]} addedWorkerIds={new Set()} periodStart="" periodEnd="" onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/Sin trabajadores en la tienda activa/i)).toBeInTheDocument();
  });

  it('todos los resultados inelegibles → guía para corregir (no silencio)', async () => {
    const user = userEvent.setup();
    render(
      <WorkerSearchSelect
        workers={[workers[1]]} // solo el Dup Test sin tarifa
        addedWorkerIds={new Set()}
        periodStart={PERIOD.start}
        periodEnd={PERIOD.end}
        onSelect={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(/Buscar trabajador/i);
    await typeAndSettle(user, input, 'Dup');
    expect(screen.getByText(/Ningún resultado es elegible/i)).toBeInTheDocument();
  });

  it('nota de elegibilidad evaluada al período cuando hay uno definido', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await typeAndSettle(user, input, 'José');
    expect(screen.getByText(new RegExp(`Elegibilidad evaluada para el período ${PERIOD.start} → ${PERIOD.end}`))).toBeInTheDocument();
  });
});
