/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) + MISIÓN 55 MM (2026-10-23) — Tests
 * del flujo REAL de impresión (thermal-receipt-print.tsx, SIN mock del módulo).
 *
 * Valida lo automatizable en jsdom:
 *  - El CSS @page se inyecta con el ancho configurado (55 mm default) ANTES
 *    de window.print(), AL NIVEL SUPERIOR (no anidado en @media print).
 *  - ESTRATEGIA 2026-10-23 (fix del comprobante en blanco):
 *    · `body > *:not([data-thermal-print-overlay]) { display: none }` — la
 *      app se oculta SIN conservar altura (antes `visibility: hidden` dejaba
 *      3 páginas vacías y el recibo se posicionaba fuera de página).
 *    · El overlay contenedor se NEUTRALIZA a `position: static` (antes vivía
 *      fijo en left:-10000px y arrastraba al recibo fuera del papel).
 *    · El canvas de impresión se fuerza claro (color-scheme: light + fondos
 *      blancos) — la app es dark por defecto y pintaba páginas 100% negras.
 *    · Las clases dark/theme-dark/mode-performance del <html> se RETIRAN
 *      durante la ventana de impresión y se RESTAURAN verbatim al cerrarla
 *      (las reglas `!important` de la app con especificidad ~(1,2,1) son
 *      imposibles de superar solo con CSS).
 *  - Guardia de suficiencia de datos: venta sin artículos/sin ID → NADA se
 *    monta, NO se abre el diálogo y hay un error comprensible (misión §7.4).
 *  - Tras cerrar el diálogo (window.print retorna), el DOM se limpia por
 *    completo (style + contenedor + clases restauradas) — sin residuos.
 *  - 'no-print-api' cuando el navegador no expone window.print (bloqueo) —
 *    con toast de error honesto y SIN montar nada.
 *  - fetchActiveStoreName: caché por tienda + degradación suave ante error.
 *
 * La impresión FÍSICA en papel térmico NO es verificable aquí (requiere el
 * equipo real) — estos tests cubren el flujo hasta el diálogo nativo. La
 * verificación del DOCUMENTO de impresión (PDF al ancho del rollo) se hace
 * con Playwright + page.pdf en la verificación de la misión (ver worklog).
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
  // Restaurar clases de tema que un test pudo dejar retiradas
  document.documentElement.classList.add('dark', 'mode-performance');
});

describe('printThermalReceipt — flujo real hasta el diálogo nativo', () => {
  it('inyecta el CSS @page (55 mm default, nivel superior) + monta el recibo + llama window.print + limpia', async () => {
    let during: {
      style: HTMLElement | null;
      receipt: HTMLElement | null;
      htmlClass: string | null;
    } = { style: null, receipt: null, htmlClass: null };
    printSpy.mockImplementation(() => {
      // Inspección SÍNCRONA del DOM mientras el diálogo está "abierto"
      during.style = document.getElementById('thermal-print-style');
      during.receipt = document.getElementById('thermal-receipt-root');
      during.htmlClass = document.documentElement.getAttribute('class');
    });

    const outcome = await printThermalReceipt(FIXTURE);

    expect(outcome).toBe('dialog-opened');
    expect(printSpy).toHaveBeenCalledTimes(1);
    // DURANTE la impresión: CSS @page al ancho por defecto + recibo presente
    expect(during.style?.getAttribute('id')).toBe('thermal-print-style');
    expect(during.style?.textContent).toContain('@page { size: 55mm auto; margin: 2mm; }');
    // Estrategia 2026-10-23: display:none (no visibility) + overlay static
    expect(during.style?.textContent).toContain(
      'body > *:not([data-thermal-print-overlay]) { display: none !important; }',
    );
    expect(during.style?.textContent).toContain('[data-thermal-print-overlay] {');
    expect(during.style?.textContent).toContain('position: static !important;');
    expect(during.style?.textContent).toContain('color-scheme: light !important;');
    // La vieja estrategia del comprobante en blanco YA NO está
    expect(during.style?.textContent).not.toContain('visibility: hidden');
    expect(during.receipt).not.toBeNull();
    expect(during.receipt?.textContent).toContain('EnerVida');
    expect(during.receipt?.textContent).toContain('Brecker 63 AMP');
    // DURANTE: clases oscuras del <html> retiradas (canvas claro)
    expect(during.htmlClass ?? '').not.toContain('dark');
    expect(during.htmlClass ?? '').not.toContain('mode-performance');
    // DESPUÉS del diálogo: DOM completamente limpio (sin residuos)
    expect(document.getElementById('thermal-print-style')).toBeNull();
    expect(document.querySelector('[data-thermal-print-overlay]')).toBeNull();
  });

  it('retira dark/theme-dark/mode-performance del <html> durante la impresión y los RESTAURA verbatim al cerrar', async () => {
    document.documentElement.setAttribute('class', 'h-full dark mode-performance extra-clase');
    document.documentElement.setAttribute('data-theme', 'dark');
    await printThermalReceipt(FIXTURE);
    // Restauración exacta (incluye clases ajenas como h-full/extra-clase)
    expect(document.documentElement.getAttribute('class')).toBe(
      'h-full dark mode-performance extra-clase',
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restaura las clases también vía afterprint (diálogo cerrado por evento)', async () => {
    document.documentElement.setAttribute('class', 'h-full dark');
    // Holder por referencia: evita el narrowing de TS a través de closures
    // (la asignación ocurre dentro del mock; con variable suelta tsc puede
    // estrechar a never y fallar en CI con caché limpia).
    const afterPrintRef: { fn: (() => void) | null } = { fn: null };
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation(
      ((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'afterprint') afterPrintRef.fn = listener as () => void;
        return window;
      }) as typeof window.addEventListener,
    );
    try {
      // window.print que NO dispara la limpieza por retorno de llamada:
      // simulamos el cierre del diálogo vía afterprint únicamente.
      printSpy.mockImplementation(() => {});
      const promise = printThermalReceipt(FIXTURE);
      // El flujo aún no retornó (el diálogo está "abierto") — clases fuera
      expect(document.documentElement.getAttribute('class') ?? '').not.toContain('dark');
      afterPrintRef.fn?.();
      await promise;
      expect(document.documentElement.getAttribute('class')).toBe('h-full dark');
      expect(document.querySelector('[data-thermal-print-overlay]')).toBeNull();
    } finally {
      addSpy.mockRestore();
    }
  });

  it('guardia de suficiencia (misión §7.4): sin artículos → NADA montado, sin diálogo, error comprensible', async () => {
    const outcome = await printThermalReceipt({ ...FIXTURE, items: [] });
    expect(outcome).toBe('insufficient-data');
    expect(printSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('no tiene datos suficientes'),
      expect.anything(),
    );
    expect(document.querySelector('[data-thermal-print-overlay]')).toBeNull();
    expect(document.getElementById('thermal-print-style')).toBeNull();
    // Sin saleId tampoco hay comprobante
    const outcome2 = await printThermalReceipt({ ...FIXTURE, saleId: '' });
    expect(outcome2).toBe('insufficient-data');
    expect(printSpy).not.toHaveBeenCalled();
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
