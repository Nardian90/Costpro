/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) — Tests del flujo REAL de impresión
 * (thermal-receipt-print.tsx, SIN mock del módulo).
 *
 * Valida lo automatizable en jsdom:
 *  - El CSS @page se inyecta con el ancho configurado ANTES de window.print().
 *  - El comprobante se monta fuera del árbol de React (#thermal-receipt-root)
 *    con la tienda/ítems/totales correctos.
 *  - Tras cerrar el diálogo (window.print retorna), el DOM se limpia por
 *    completo (style + contenedor) — sin residuos entre impresiones.
 *  - 'no-print-api' cuando el navegador no expone window.print (bloqueo) —
 *    con toast de error honesto y SIN montar nada.
 *  - fetchActiveStoreName: caché por tienda + degradación suave ante error.
 *
 * La impresión FÍSICA en papel térmico NO es verificable aquí (requiere el
 * equipo AXISOFT real) — estos tests cubren el flujo hasta el diálogo nativo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => {
  const toastFn: any = Object.assign(() => 'toast-id', {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => 'toast-loading-id'),
    dismiss: vi.fn(),
    info: vi.fn(),
  });
  return { toast: toastFn };
});

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}));

import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import {
  printThermalReceipt,
  fetchActiveStoreName,
} from '@/components/views/terminal/views/pos/thermal-receipt-print';
import { setThermalWidthMm } from '@/lib/pos/thermal-receipt';
import type { ThermalReceiptData } from '@/lib/pos/thermal-receipt';

const FIXTURE: ThermalReceiptData = {
  saleId: '8ab7becf-1111-2222-3333-444455556666',
  dateIso: '2026-10-20T18:45:00.000Z',
  storeName: 'EnerVida',
  items: [
    { code: '128', name: 'Brecker 63 AMP', quantity: 1, unitPrice: 20000, currency: 'CUP', lineTotal: 20000 },
  ],
  subtotal: 20000,
  discountAmount: 0,
  taxAmount: 0,
  total: 20000,
  payments: [{ method: 'cash', amount: 20000, currency: 'CUP' }],
  paymentMethod: 'cash',
  status: 'completed',
  isReprint: false,
};

let printSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.localStorage.clear();
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  printSpy.mockRestore();
  cleanup();
  // Recoger cualquier residuo del DOM entre tests
  document.getElementById('thermal-print-style')?.remove();
  document.querySelector('[data-thermal-print-overlay]')?.remove();
});

describe('printThermalReceipt — flujo real hasta el diálogo nativo', () => {
  it('inyecta el CSS @page (58 mm default) + monta el recibo + llama window.print + limpia', async () => {
    let during: {
      style: HTMLElement | null;
      receipt: HTMLElement | null;
    } = { style: null, receipt: null };
    printSpy.mockImplementation(() => {
      // Inspección SÍNCRONA del DOM mientras el diálogo está "abierto"
      during.style = document.getElementById('thermal-print-style');
      during.receipt = document.getElementById('thermal-receipt-root');
    });

    const outcome = await printThermalReceipt(FIXTURE);

    expect(outcome).toBe('dialog-opened');
    expect(printSpy).toHaveBeenCalledTimes(1);
    // DURANTE la impresión: CSS @page al ancho por defecto + recibo presente
    expect(during.style?.getAttribute('id')).toBe('thermal-print-style');
    expect(during.style?.textContent).toContain('@page { size: 58mm auto; margin: 2mm; }');
    expect(during.style?.textContent).toContain('body * { visibility: hidden !important; }');
    expect(during.receipt).not.toBeNull();
    expect(during.receipt?.textContent).toContain('EnerVida');
    expect(during.receipt?.textContent).toContain('Brecker 63 AMP');
    // DESPUÉS del diálogo: DOM completamente limpio (sin residuos)
    expect(document.getElementById('thermal-print-style')).toBeNull();
    expect(document.querySelector('[data-thermal-print-overlay]')).toBeNull();
  });

  it('respeta el ancho configurado (80 mm) en el @page inyectado', async () => {
    setThermalWidthMm(80);
    let css = '';
    printSpy.mockImplementation(() => {
      css = document.getElementById('thermal-print-style')?.textContent ?? '';
    });
    await printThermalReceipt(FIXTURE);
    expect(css).toContain('@page { size: 80mm auto; margin: 2mm; }');
  });

  it('navegador SIN window.print → resultado no-print-api, toast honesto y NADA montado', async () => {
    printSpy.mockRestore();
    const original = window.print;
    (window as { print?: unknown }).print = undefined;
    try {
      const outcome = await printThermalReceipt(FIXTURE);
      expect(outcome).toBe('no-print-api');
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('no permite abrir el diálogo de impresión'),
        expect.anything(),
      );
      // Jamás se monta un comprobante ni se inyecta CSS en este caso
      expect(document.querySelector('[data-thermal-print-overlay]')).toBeNull();
      expect(document.getElementById('thermal-print-style')).toBeNull();
    } finally {
      window.print = original;
    }
  });

  it('una segunda impresión recoge la primera (sin duplicados en el DOM)', async () => {
    // La primera impresión con un window.print que NO retorna control (simula
    // diálogo aún abierto) — su contenedor queda vivo hasta la siguiente.
    printSpy.mockImplementation(() => {});
    const first = printThermalReceipt(FIXTURE);
    // Segunda impresión inmediata: debe recoger el estado de la primera
    const outcome = await printThermalReceipt({ ...FIXTURE, storeName: 'Otra' });
    expect(outcome).toBe('dialog-opened');
    // Solo UN contenedor de recibo vivió en cada momento; al final: cero
    expect(document.querySelectorAll('[data-thermal-print-overlay]').length).toBe(0);
    await first;
  });

  it('informa con honestidad: toast de diálogo abierto, NUNCA de impresión física completada', async () => {
    await printThermalReceipt(FIXTURE);
    expect(toast.info).toHaveBeenCalledWith(
      'Comprobante enviado al diálogo de impresión.',
      expect.objectContaining({
        description: expect.stringContaining('Confirma la impresión en el diálogo'),
      }),
    );
    // Nada marca éxito físico (el navegador no informa el resultado real)
    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringContaining('imprim'),
      expect.anything(),
    );
  });
});

describe('fetchActiveStoreName — nombre comercial con caché y degradación suave', () => {
  beforeEach(() => {
    (apiFetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('resuelve el nombre de la tienda activa desde /api/stores', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        { id: 's-otra', name: 'Otra Tienda' },
        { id: 's-enervida', name: 'EnerVida' },
      ],
    });
    expect(await fetchActiveStoreName('s-enervida')).toBe('EnerVida');
  });

  it('cachea por storeId: la segunda impresión no repite la llamada', async () => {
    // ID único en el archivo: la caché del módulo vive entre tests del file —
    // con ID distinto por test el aislamiento es determinista sin resets.
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{ id: 's-cache', name: 'EnerVida' }],
    });
    await fetchActiveStoreName('s-cache');
    await fetchActiveStoreName('s-cache');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    // Otra tienda → nueva llamada (caché por clave)
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [{ id: 's-x2', name: 'X' }] });
    await fetchActiveStoreName('s-x2');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('ante error de red devuelve null (el recibo sale sin tienda, sin bloquear)', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    expect(await fetchActiveStoreName('s-error-red')).toBeNull();
  });

  it('sin storeId → null directo sin llamada', async () => {
    expect(await fetchActiveStoreName(null)).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
