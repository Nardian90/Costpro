/**
 * ValeSalidaCreateModal-fecha.test.tsx — MISIÓN POLÍTICA TEMPORAL (2026-10-18).
 *
 * Smoke tests del selector de fecha operativa del flujo DEDICADO
 * «Almacén → Vales de Salida»:
 *   - El modal renderiza «Fecha del vale» (antes: «Se registrará con la fecha
 *     actual», sin opción) con min per-store y max = HOY (Habana).
 *   - Default HOY → al emitir NO se envía operation_date (NOW() canónico).
 *   - Fecha ≠ hoy → al emitir se envía operation_date al MEDIODÍA local
 *     (misma convención de Vender/Catálogo, resolvePosOperationDate).
 *   - Fecha futura → validación inline visible y botón de confirmación
 *     deshabilitado (no se puede avanzar con una fecha inválida).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';

const MIN_ISO = '2026-10-14T16:00:00+00:00'; // 12:00 Habana 10-14 (doc previo de la tienda)

vi.mock('@/hooks/api/useGlobalOperationDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/api/useGlobalOperationDate')>();
  return {
    ...actual,
    useGlobalOperationDate: () => ({
      data: { maxDate: MIN_ISO, maxDateFormatted: '14/10/2026 12:00', minAllowedDate: MIN_ISO },
      isLoading: false,
    }),
  };
});

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { id: 'u1', fullName: 'Tester', activeStoreId: 'store-1' } }),
}));

// Sin debounce real: el término de búsqueda pasa directo al hook de productos.
vi.mock('@/hooks/ui/useDebounce', () => ({
  useDebounce: (v: string) => v,
}));

const PRODUCTO = {
  id: 'p1',
  name: 'Arroz_grano_largo',
  sku: 'SKU-1',
  unit_of_measure: 'lb',
  stock_current: 50,
  cost_average: 10,
};

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: [PRODUCTO], isLoading: false }),
}));

// supabase.from('production_orders')… → sin OTs (modal sin líneas de OT).
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

const emitirValeMock = vi.fn();
let emitirResult: { slip_id: string; slip_number: string } | null = null;
vi.mock('@/components/views/terminal/views/inventory/useCrearValeSalida', () => ({
  useCrearValeSalida: () => ({
    isSubmitting: false,
    submitError: null,
    emitirVale: emitirValeMock,
    regenerarClave: () => {},
    limpiarError: () => {},
  }),
}));

vi.mock('@/components/ui/BaseModal', () => ({
  BaseModal: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      <div>{children}</div>
      <div data-testid="modal-footer">{footer}</div>
    </div>
  ),
}));

import { ValeSalidaCreateModal } from '@/components/views/terminal/views/inventory/ValeSalidaCreateModal';

function renderModal() {
  render(
    <ValeSalidaCreateModal
      open
      onClose={() => {}}
      storeId="store-1"
      storeName="Almacén Central"
      onEmitido={() => {}}
    />,
  );
}

/** Completa el flujo mínimo para habilitar «Revisar y confirmar»: 1 línea + notas. */
async function llenarValeMinimo() {
  const search = document.getElementById('vale-create-search') as HTMLInputElement;
  fireEvent.change(search, { target: { value: 'arroz' } });
  const opcion = await screen.findByRole('option', { name: /Arroz_grano_largo/i });
  fireEvent.click(opcion);
  const notas = screen.getByLabelText(/Concepto \/ notas/i) as HTMLTextAreaElement;
  fireEvent.change(notas, { target: { value: 'Consumo interno de prueba' } });
}

describe('ValeSalidaCreateModal — fecha operativa (misión política temporal)', () => {
  beforeEach(() => {
    cleanup();
    emitirValeMock.mockReset();
    emitirResult = { slip_id: 'slip-1', slip_number: 'VS-000001-2026' };
    emitirValeMock.mockImplementation(async () => emitirResult);
  });

  it('renderiza «Fecha del vale» con default HOY, min per-store y max = HOY Habana', () => {
    renderModal();
    const input = document.getElementById('vale-create-fecha') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe(todayBusinessDay());
    expect(input.getAttribute('max')).toBe(todayBusinessDay());
    expect(input.getAttribute('min')).toBe('2026-10-14');
    expect(screen.getByText(/Fecha del vale/i)).toBeTruthy();
  });

  it('fecha futura → error inline y «Revisar y confirmar» deshabilitado', async () => {
    renderModal();
    await llenarValeMinimo();
    const input = document.getElementById('vale-create-fecha') as HTMLInputElement;
    // El input se marca touched al cambiar → el error inline aparece
    fireEvent.change(input, { target: { value: '2030-01-01' } });
    await waitFor(() => {
      expect(screen.getByText(/no puede ser futura/i)).toBeTruthy();
    });
    const btn = screen.getByRole('button', { name: /Revisar y confirmar/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('HOY → al emitir NO se envía operation_date (NOW() canónico)', async () => {
    renderModal();
    await llenarValeMinimo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    // El resumen muestra la fecha elegida
    expect(await screen.findByText(/Hoy · se estampará al emitir/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Emitir Vale/i }));
    await waitFor(() => expect(emitirValeMock).toHaveBeenCalledTimes(1));
    const payload = emitirValeMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.operation_date).toBeUndefined();
  });

  it('fecha ≠ hoy (válida) → al emitir se envía operation_date al mediodía local', async () => {
    renderModal();
    const input = document.getElementById('vale-create-fecha') as HTMLInputElement;
    const ayer = new Date(Date.now() - 86_400_000);
    const ayerStr = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    // Asegurar un día ≠ hoy pero ≥ mínimo (el mínimo es fijo 2026-10-14 en el mock;
    // si HOY real es 2026-10-15..17, ayer cae dentro del rango; si no, usar 2026-10-15 fijo)
    const fechaElegida = ayerStr >= '2026-10-14' && ayerStr < todayBusinessDay() ? ayerStr : '2026-10-15';
    fireEvent.change(input, { target: { value: fechaElegida } });
    await llenarValeMinimo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar y confirmar/i }));
    // El resumen muestra la fecha elegida en DD/MM/YYYY
    expect(await screen.findByText(fechaElegida.split('-').reverse().join('/'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Emitir Vale/i }));
    await waitFor(() => expect(emitirValeMock).toHaveBeenCalledTimes(1));
    const payload = emitirValeMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.operation_date).toBe(new Date(`${fechaElegida}T12:00:00`).toISOString());
    expect(payload.notes).toBe('Consumo interno de prueba');
    expect(payload.items).toEqual([
      expect.objectContaining({ product_id: 'p1', quantity: 1 }),
    ]);
  });
});
