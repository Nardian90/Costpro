/**
 * MISIÓN COSTPRO-WAREHOUSE-REQUEST-001 — Estabilidad de foco del formulario
 * SC-2-07 «Solicitud de Entrega» (MaterialRequestFormModal).
 * ============================================================================
 * Defecto: al escribir en cualquier campo distinto de «Área solicitante», el
 * foco volvía continuamente a #sm-area. Causa raíz: el subcomponente `Seccion`
 * se definía DENTRO del componente (identidad nueva por render) → remontaje de
 * todas las secciones en cada pulsación → el autoFocus de #sm-area se
 * re-aplicaba en cada remontaje.
 *
 * Este fichero ejerce la regresión a nivel de integración (RTL + jsdom):
 *   1. Escribir en un campo conserva el foco EN ese campo.
 *   2. Los nodos del formulario NO se remontan al actualizar el estado
 *      (sonda de identidad de DOM vía dataset).
 *   3. Los valores introducidos se conservan al editar campos en secuencia.
 *   4. La validación en vivo no desplaza el foco mientras se escribe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock, rpc: vi.fn() },
}));

// Cadena PostgREST thenable configurable por tabla (el modal encadena
// select/eq/order/... y hace await sobre el resultado).
const DATOS: Record<string, unknown[]> = {
  warehouses: [{ id: 'w-1', name: 'Almacén Central', code: 'AC-1' }],
  production_orders: [],
  products: [],
};

function cadena(tabla: string) {
  const c: Record<string, unknown> = {};
  const promesa = Promise.resolve({ data: DATOS[tabla] ?? [], error: null });
  for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'limit', 'single']) {
    c[m] = () => c;
  }
  c.then = promesa.then.bind(promesa);
  c.catch = promesa.catch.bind(promesa);
  c.finally = promesa.finally.bind(promesa);
  return c;
}

import { MaterialRequestFormModal } from '@/components/views/terminal/views/inventory/MaterialRequestFormModal';

function renderForm() {
  return render(
    <MaterialRequestFormModal
      open
      onClose={vi.fn()}
      storeId="store-1"
      storeName="Puertopadre E2E"
      onSaved={vi.fn()}
    />,
  );
}

describe('MaterialRequestFormModal — estabilidad de foco (SC-2-07)', () => {
  beforeEach(() => {
    h.fromMock.mockReset();
    h.fromMock.mockImplementation((tabla: string) => cadena(tabla));
  });
  afterEach(() => {
    cleanup();
  });

  it('R1 — escribir en «Código del área» mantiene el foco en ese campo', async () => {
    renderForm();
    const codigo = (await screen.findByLabelText('Código del área')) as HTMLInputElement;
    // Dejar estabilizar el foco inicial (focus-trap del BaseModal: timer de 50 ms).
    await act(() => new Promise((r) => setTimeout(r, 90)));
    codigo.focus();

    fireEvent.change(codigo, { target: { value: 'A' } });
    await act(async () => {});
    expect(document.activeElement?.id, 'el foco fue robado tras la 1.ª pulsación').toBe('sm-area-codigo');

    fireEvent.change(codigo, { target: { value: 'A-01' } });
    await act(async () => {});
    expect(document.activeElement?.id, 'el foco fue robado tras la 2.ª pulsación').toBe('sm-area-codigo');
    expect(codigo.value).toBe('A-01');
  });

  it('R2 — los nodos del formulario no se remontan al actualizar el estado', async () => {
    renderForm();
    const area = (await screen.findByLabelText(/Área solicitante/)) as HTMLInputElement;
    const centro = (await screen.findByLabelText('Centro de costo')) as HTMLInputElement;
    await act(() => new Promise((r) => setTimeout(r, 90)));

    // Sonda de identidad: si el input se remonta, el nodo nuevo pierde el dataset.
    centro.dataset.probe = 'vivo';
    fireEvent.change(area, { target: { value: 'Taller' } });
    await act(async () => {});

    const centroDespues = screen.getByLabelText('Centro de costo') as HTMLInputElement;
    expect(centroDespues.dataset.probe, 'el campo se REMONTÓ al escribir en otro campo').toBe('vivo');
    expect(document.activeElement?.id).toBe('sm-area');
  });

  it('R3 — los valores introducidos se conservan al editar campos en secuencia', async () => {
    renderForm();
    const entidad = (await screen.findByLabelText('Código de entidad')) as HTMLInputElement;
    const area = (await screen.findByLabelText(/Área solicitante/)) as HTMLInputElement;
    const centro = (await screen.findByLabelText('Centro de costo')) as HTMLInputElement;
    const notas = (await screen.findByLabelText('Notas')) as HTMLTextAreaElement;
    await act(() => new Promise((r) => setTimeout(r, 90)));

    fireEvent.change(entidad, { target: { value: 'REEUP-0401' } });
    fireEvent.change(area, { target: { value: 'Taller de montaje' } });
    fireEvent.change(centro, { target: { value: 'CC-100' } });
    fireEvent.change(notas, { target: { value: 'Nota de prueba' } });
    await act(async () => {});

    expect((screen.getByLabelText('Código de entidad') as HTMLInputElement).value).toBe('REEUP-0401');
    expect((screen.getByLabelText(/Área solicitante/) as HTMLInputElement).value).toBe('Taller de montaje');
    expect((screen.getByLabelText('Centro de costo') as HTMLInputElement).value).toBe('CC-100');
    expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toBe('Nota de prueba');
  });

  it('R4 — la validación en vivo no desplaza el foco mientras se escribe', async () => {
    renderForm();
    const entidad = (await screen.findByLabelText('Código de entidad')) as HTMLInputElement;
    await act(() => new Promise((r) => setTimeout(r, 90)));
    entidad.focus();

    // Formulario vacío: la alerta de requeridos es visible en vivo.
    expect(screen.getByRole('alert')).toHaveTextContent(/área solicitante es obligatoria/i);

    fireEvent.change(entidad, { target: { value: 'REEUP-0401' } });
    await act(async () => {});
    // La validación (recomputo de errores + render) NO roba el foco.
    expect(document.activeElement?.id).toBe('sm-entidad-codigo');
    expect(screen.getByRole('alert')).toHaveTextContent(/área solicitante es obligatoria/i);
  });
});
