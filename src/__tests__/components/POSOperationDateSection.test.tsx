/**
 * POSOperationDateSection.test.tsx — MISIÓN FECHA OPERATIVA EN VENDER (2026-10-17).
 *
 * Smoke tests de la sección "Fecha de venta" del POS:
 *   - Renderiza el selector con min (fecha MAX de la tienda) y max (hoy Habana).
 *   - Muestra el estado del turno (activo / sin turno) — solo informativo.
 *   - Aviso no bloqueante cuando la fecha elegida es anterior a la apertura
 *     del turno activo (queda fuera del arqueo del turno).
 *   - Error inline cuando la fecha elegida viola el mínimo per-store.
 *   - Cambiar la fecha escribe en el cart store (setSaleDate).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import { useCartStore } from '@/store/cart';

const MIN_ISO = '2026-10-14T16:00:00+00:00'; // 12:00 Habana 10-14 (venta previa)

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

const shiftRef = { current: null as null | { created_at: string } };
vi.mock('@/hooks/api/useActiveShift', () => ({
  useActiveShift: () => ({ data: shiftRef.current, isLoading: false }),
}));

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { id: 'u1', activeStoreId: 'store-1' } }),
}));

import { POSOperationDateSection } from '@/components/views/terminal/views/pos/POSOperationDateSection';

describe('POSOperationDateSection — misión fecha operativa', () => {
  beforeEach(() => {
    cleanup();
    shiftRef.current = null;
    useCartStore.setState({ saleDate: null, items: [] });
  });

  it('renderiza el selector con max = hoy (Habana) y min = fecha MAX de la tienda', () => {
    render(<POSOperationDateSection inputId="pos-date-test" />);
    const input = document.getElementById('pos-date-test') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('max')).toBe(todayBusinessDay());
    expect(input.getAttribute('min')).toBe('2026-10-14');
    expect(screen.getByText(/Fecha de venta/i)).toBeTruthy();
    // Sin carrito modificado → hoy implícito
    expect(input.value).toBe(todayBusinessDay());
  });

  it('muestra "Sin turno abierto" (la venta no requiere turno — misión §2)', () => {
    render(<POSOperationDateSection inputId="pos-date-test" />);
    expect(screen.getByText(/Sin turno abierto/i)).toBeTruthy();
  });

  it('con turno activo y fecha anterior a la apertura: aviso de arqueo, no bloqueo', () => {
    shiftRef.current = { created_at: '2026-10-17T16:00:00+00:00' }; // hoy 12:00 HV
    useCartStore.setState({ saleDate: '2026-10-15' });
    render(<POSOperationDateSection inputId="pos-date-test" />);
    expect(screen.getByText(/Turno activo desde/i)).toBeTruthy();
    expect(screen.getByText(/anterior a la apertura del turno activo/i)).toBeTruthy();
    expect(screen.getByText(/NO entrará en el arqueo/i)).toBeTruthy();
    // El input sigue habilitado (aviso no bloqueante)
    expect((document.getElementById('pos-date-test') as HTMLInputElement).disabled).toBe(false);
  });

  it('con turno activo y fecha posterior a la apertura: sin aviso', () => {
    shiftRef.current = { created_at: '2026-10-15T16:00:00+00:00' }; // apertura 10-15
    useCartStore.setState({ saleDate: '2026-10-17' });
    render(<POSOperationDateSection inputId="pos-date-test" />);
    expect(screen.queryByText(/anterior a la apertura del turno activo/i)).toBeNull();
  });

  it('fecha anterior al mínimo per-store → error inline y onChange escribe en el store', () => {
    useCartStore.setState({ saleDate: '2026-10-12' });
    render(<POSOperationDateSection inputId="pos-date-test" />);
    expect(screen.getByText(/No se puede retroceder en el tiempo operativo/i)).toBeTruthy();
    fireEvent.change(document.getElementById('pos-date-test') as HTMLInputElement, {
      target: { value: '2026-10-16' },
    });
    expect(useCartStore.getState().saleDate).toBe('2026-10-16');
  });

  it('volver a elegir HOY guarda null (hoy implícito → NOW() del servidor)', () => {
    useCartStore.setState({ saleDate: '2026-10-15' });
    render(<POSOperationDateSection inputId="pos-date-test" />);
    fireEvent.change(document.getElementById('pos-date-test') as HTMLInputElement, {
      target: { value: todayBusinessDay() },
    });
    expect(useCartStore.getState().saleDate).toBeNull();
  });
});
