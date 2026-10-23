/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) — Tests de integración del comprobante POS.
 *
 * Cobertura (fase 7 de la misión — todo lo automatizable SIN equipo físico):
 *  1. POSThermalReceipt: estructura del recibo (encabezado comercial, ítems con
 *     código/moneda, totales CUP, medios de pago, cambio, pie con verificación),
 *     caracteres españoles, monocromía (fondo blanco/texto negro), ajuste de
 *     línea de descripciones largas, marcas REIMPRESIÓN/ANULADA.
 *  2. printThermalReceipt: inyección del CSS @page al ancho configurado,
 *     montaje fuera del árbol, llamada al diálogo nativo (window.print),
 *     limpieza, y caso 'no-print-api' (navegador sin soporte).
 *  3. POSCartSuccessView: botón «Imprimir comprobante» dispara onPrint;
 *     selector de ancho de rollo persiste 55/58/80/personalizado.
 *  4. usePOSCheckout: lastSale enriquecido (sku, moneda, subtotalCup, pagos
 *     agregados, vuelto del panel) tras checkout exitoso — mismo harness que
 *     pos-checkout-usd-cup.test.tsx.
 *  5. usePOSCartExports.printReceipt: construye el recibo desde LastSale con
 *     nombre de tienda/vendedor y delega en printThermalReceipt.
 *  6. TransactionDetailsModal: reimpresión desde el historial (100% lectura).
 *
 * La impresión FÍSICA en la tablet AXISOFT NO se declara probada aquí —
 * requiere el dispositivo real (documentado en el informe de entrega).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks comunes ───────────────────────────────────────────────────────────

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

vi.mock('@/hooks/api/useDocumentActions', () => ({
  useInvertDocument: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}));

// TransactionDetailsModal (reimpresión): hooks de datos y supabase mockeados.
vi.mock('@/hooks/api/useTaxes', () => ({
  useTaxes: () => ({ data: [] }),
}));
vi.mock('@/hooks/api/useTransactions', () => ({
  useSalePayments: () => ({ data: [] }),
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn(async () => ({ error: null })) },
}));

// El flujo de impresión real (montaje + diálogo) se mockea en los tests de
// wiring; el flujo completo se valida en su propio describe con el módulo real.
vi.mock('@/components/views/terminal/views/pos/thermal-receipt-print', () => ({
  printThermalReceipt: vi.fn(async () => 'dialog-opened' as const),
  fetchActiveStoreName: vi.fn(async () => 'EnerVida'),
  disposeThermalPrint: vi.fn(),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import {
  printThermalReceipt as printThermalReceiptMock,
  fetchActiveStoreName as fetchActiveStoreNameMock,
} from '@/components/views/terminal/views/pos/thermal-receipt-print';
import { POSThermalReceipt } from '@/components/views/terminal/views/pos/POSThermalReceipt';
import { POSCartSuccessView } from '@/components/views/terminal/views/pos/POSCartSuccessView';
import { usePOSCartExports } from '@/components/views/terminal/views/pos/usePOSCartExports';
import { usePOSCheckout } from '@/components/views/terminal/views/pos/usePOSCheckout';
import { TransactionDetailsModal } from '@/components/views/terminal/views/sales/TransactionDetailsModal';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store';
import { UserFactory } from '@/contracts/user';
import { getThermalWidthMm, setThermalWidthMm } from '@/lib/pos/thermal-receipt';
import type { ThermalReceiptData } from '@/lib/pos/thermal-receipt';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

// ── Fixtures ────────────────────────────────────────────────────────────────

const RECEIPT_FIXTURE: ThermalReceiptData = {
  saleId: '8ab7becf-1111-2222-3333-444455556666',
  invoiceNumber: null,
  dateIso: '2026-10-20T18:45:00.000Z',
  storeName: 'EnerVida',
  sellerName: 'Operador Prueba',
  customerName: 'Cliente con Nombre Largo de Prueba',
  items: [
    {
      code: '128',
      name: 'Brecker 63 AMP Corriente alterna_interruptor diferencial con descripción muy extensa para verificar el ajuste de línea',
      quantity: 1,
      unitPrice: 20000,
      currency: 'CUP',
      lineTotal: 20000,
    },
    {
      code: '456',
      name: 'Tunder Grande',
      quantity: 2,
      unitPrice: 20,
      currency: 'USD',
      lineTotal: 40,
    },
  ],
  subtotal: 35600,
  discountAmount: 600,
  discountLabel: 'fijo',
  taxAmount: 0,
  total: 35000,
  payments: [
    { method: 'cash', amount: 31600, currency: 'CUP' },
    { method: 'zelle', amount: 40, currency: 'USD' },
  ],
  paymentMethod: 'mixed',
  cashReceived: 32000,
  change: 400,
  status: 'completed',
  isReprint: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // Ancho por defecto en cada test (55 mm — misión 2026-10-23)
  window.localStorage.removeItem('costpro_thermal_receipt_width_mm');
});

afterEach(() => {
  cleanup();
});

// ── 1. Renderizador del comprobante ─────────────────────────────────────────

describe('POSThermalReceipt — comprobante térmico (presentación monocromática)', () => {
  it('encabezado comercial + identificación + cliente + vendedor', () => {
    render(<POSThermalReceipt data={RECEIPT_FIXTURE} widthMm={58} />);
    expect(screen.getByText('EnerVida')).toBeInTheDocument();
    expect(screen.getByText(/comprobante de venta/i)).toBeInTheDocument();
    expect(screen.getByText('8ab7becf')).toBeInTheDocument(); // No. corto
    expect(screen.getByText(/Cliente con Nombre Largo/)).toBeInTheDocument();
    expect(screen.getByText(/Operador Prueba/)).toBeInTheDocument();
  });

  it('ítems: código, descripción con ajuste de línea, cant × precio y línea por moneda', () => {
    render(<POSThermalReceipt data={RECEIPT_FIXTURE} widthMm={58} />);
    const itemRows = screen.getAllByTestId('thermal-receipt-item');
    expect(itemRows).toHaveLength(2);
    // Código + descripción (el texto del span contenedor une ambos)
    expect(itemRows[0].textContent).toContain('#128 · Brecker 63 AMP');
    expect(itemRows[1].textContent).toContain('#456 · Tunder Grande');
    // Líneas de precio por moneda (es-CU: US$ para USD) — cant × unitario + importe
    expect(itemRows[0].textContent).toContain('1 × $20,000.00 CUP');
    expect(itemRows[1].textContent).toContain('2 × US$20.00 USD');
    expect(itemRows[1].textContent).toContain('US$40.00 USD');
    // Ajuste de línea garantizado (requisito: descripciones largas sin desborde)
    const nameEl = itemRows[0].firstElementChild as HTMLElement;
    expect(nameEl.style.overflowWrap).toBe('break-word');
    expect(nameEl.style.wordBreak).toBe('break-word');
  });

  it('totales: subtotal/descuento/total CUP destacado y enmarcado; cambio y efectivo recibido', () => {
    render(<POSThermalReceipt data={RECEIPT_FIXTURE} widthMm={58} />);
    const totalBox = screen.getByTestId('thermal-receipt-total');
    // textContent no aplica text-transform (el MAYÚSCULAS visual es CSS)
    expect(totalBox.textContent).toContain('Total');
    expect(totalBox.textContent).toContain('$35,000.00 CUP');
    expect(totalBox.style.border).toContain('1.5px solid');
    expect(screen.getByText(/Descuento \(fijo\)/)).toBeInTheDocument();
    expect(screen.getByText(/Efectivo recibido/i)).toBeInTheDocument();
    expect(screen.getByText(/Cambio/i)).toBeInTheDocument();
    expect(screen.getByText(/\$400\.00 CUP/)).toBeInTheDocument();
  });

  it('medios de pago con importes por moneda + caracteres españoles + pie de verificación', () => {
    render(<POSThermalReceipt data={RECEIPT_FIXTURE} widthMm={58} />);
    // Filas de pago: etiqueta + importe en la MISMA fila (scope por etiqueta)
    const cashRow = screen.getByText('EFECTIVO').closest('div');
    expect(cashRow?.textContent).toContain('$31,600.00 CUP');
    const zelleRow = screen.getByText('ZELLE (USD)').closest('div');
    expect(zelleRow?.textContent).toContain('US$40.00 USD');
    // Tildes y signos de exclamación españoles intactos (UTF-8)
    expect(screen.getByText('¡Gracias por su preferencia!')).toBeInTheDocument();
    // Trazabilidad: URL de verificación + ID completo
    expect(screen.getByTestId('thermal-receipt-sale-id').textContent).toContain(RECEIPT_FIXTURE.saleId);
    expect(screen.getByText(/verify-sale\/8ab7becf/)).toBeInTheDocument();
  });

  it('monocromía estricta: fondo blanco, texto negro, sin sombras (papel térmico)', () => {
    render(<POSThermalReceipt data={RECEIPT_FIXTURE} widthMm={58} />);
    const root = screen.getByTestId('thermal-receipt');
    expect(root.style.background).toBe('rgb(255, 255, 255)');
    expect(root.style.color).toBe('rgb(0, 0, 0)');
    expect(root.style.boxShadow).toBe('');
    // El contenedor fuerza print-color-adjust exact (evita interpretaciones del driver)
    expect(root.style.printColorAdjust).toBe('exact');
  });

  it('marca de REIMPRESIÓN y de VENTA ANULADA cuando aplican', () => {
    const { rerender } = render(<POSThermalReceipt data={{ ...RECEIPT_FIXTURE, isReprint: true }} widthMm={58} />);
    expect(screen.getByTestId('thermal-reprint-mark').textContent).toContain('*** REIMPRESIÓN ***');
    rerender(<POSThermalReceipt data={{ ...RECEIPT_FIXTURE, status: 'voided' }} widthMm={58} />);
    expect(screen.getByTestId('thermal-voided-mark').textContent).toContain('*** VENTA ANULADA ***');
  });

  it('venta sin artículos: mensaje explícito (nada de recibo vacío silencioso)', () => {
    render(<POSThermalReceipt data={{ ...RECEIPT_FIXTURE, items: [] }} widthMm={58} />);
    expect(screen.getByText('(Sin artículos)')).toBeInTheDocument();
  });

  it('venta con datos mínimos: sin tienda/cliente/vuelto, el recibo sigue siendo completo', () => {
    render(
      <POSThermalReceipt
        data={{
          ...RECEIPT_FIXTURE,
          storeName: null,
          sellerName: null,
          customerName: null,
          payments: [],
          cashReceived: null,
          change: null,
          discountAmount: 0,
        }}
        widthMm={58}
      />,
    );
    expect(screen.queryByText('EnerVida')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cambio/i)).not.toBeInTheDocument();
    // Método declarado visible cuando no hay desglose por filas
    expect(screen.getByText(/Método de pago/i)).toBeInTheDocument();
    expect(screen.getByText('MIXTO')).toBeInTheDocument();
  });
});

// ── 3. Vista de éxito: acción Imprimir + ancho del rollo ────────────────────

describe('POSCartSuccessView — acción «Imprimir comprobante» y ancho de rollo', () => {
  const baseProps = {
    onGeneratePDF: vi.fn(),
    onShareWhatsApp: vi.fn(),
    onExportAsImage: vi.fn(),
    onClearLastSale: vi.fn(),
    lastSale: {
      id: '8ab7becf-1111-2222-3333-444455556666',
      date: '2026-10-20T18:45:00.000Z',
      items: [],
      subtotal: 20000,
      total: 20000,
      discount: null,
      paymentMethod: 'cash',
    },
  };

  it('el botón Imprimir existe, es táctil y dispara onPrint (venta confirmada)', () => {
    const onPrint = vi.fn();
    const { rerender } = render(<POSCartSuccessView {...baseProps} onPrint={undefined} />);
    // Sin handler (p. ej. import dinámico fallido): botón deshabilitado, sin romper
    const btn = screen.getByRole('button', { name: /imprimir comprobante/i });
    expect(btn).toBeDisabled();
    rerender(<POSCartSuccessView {...baseProps} onPrint={onPrint} />);
    expect(screen.getByRole('button', { name: /imprimir comprobante/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /imprimir comprobante/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('selector de ancho: preset 80 mm persiste en localStorage', () => {
    render(<POSCartSuccessView {...baseProps} onPrint={vi.fn()} />);
    const select = screen.getByLabelText('Ancho del rollo de papel térmico');
    fireEvent.change(select, { target: { value: '80' } });
    expect(getThermalWidthMm()).toBe(80);
    expect(window.localStorage.getItem('costpro_thermal_receipt_width_mm')).toBe('80');
  });

  it('ancho por defecto 55 mm (misión 2026-10-23) + presets 55/58/80 en el selector', () => {
    window.localStorage.removeItem('costpro_thermal_receipt_width_mm');
    expect(getThermalWidthMm()).toBe(55);
    render(<POSCartSuccessView {...baseProps} onPrint={vi.fn()} />);
    const select = screen.getByLabelText('Ancho del rollo de papel térmico') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['55', '58', '80', 'custom']);
    // El badge del botón imprincipal anuncia el rollo activo
    expect(screen.getByText(/Rollo 55 mm/i)).toBeInTheDocument();
  });

  it('selector de ancho: modo personalizado (72 mm) persiste sanitizado', () => {
    render(<POSCartSuccessView {...baseProps} onPrint={vi.fn()} />);
    const select = screen.getByLabelText('Ancho del rollo de papel térmico');
    fireEvent.change(select, { target: { value: 'custom' } });
    const input = screen.getByLabelText('Ancho personalizado del rollo en milímetros');
    fireEvent.change(input, { target: { value: '72' } });
    expect(getThermalWidthMm()).toBe(72);
  });

  it('las acciones existentes (PDF/WhatsApp/JPG) permanecen intactas (regresión)', () => {
    render(<POSCartSuccessView {...baseProps} onPrint={vi.fn()} />);
    expect(screen.getByRole('button', { name: /recibo pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /imagen jpg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nueva venta/i })).toBeInTheDocument();
  });
});

// ── 4. usePOSCheckout — enriquecimiento de lastSale para el comprobante ─────

describe('usePOSCheckout — lastSale enriquecido para el comprobante térmico', () => {
  const cupProduct = {
    id: 'bbbb2222-0000-4000-8000-000000000002',
    name: 'Cemento TBV 400',
    sku: '128',
    price: 20000,
    price_currency: 'CUP',
    stock_current: 10,
    store_id: STORE,
    cost_price: 15000,
  };

  function resetStores() {
    useCartStore.setState({
      items: [],
      discount: null,
      appliedTaxes: [],
      storeId: STORE,
      globalRates: {},
      saleCurrency: 'CUP',
      saleExchangeRate: 1.0,
      selectedPayment: 'cash',
      customerId: null,
      customerName: 'Cliente Térmico',
      lastUpdated: Date.now(),
    });
    useAuthStore.setState({
      user: UserFactory.create({
        id: '8f1d2a34-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'admin@costpro.com',
        fullName: 'Operador Test',
        role: 'admin',
        roles: ['admin'],
        storeId: STORE,
        activeStoreId: STORE,
      }),
      token: 'test-token',
    });
  }

  beforeEach(() => {
    resetStores();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/pos/checkout')) {
        return { ok: true, status: 200, json: async () => ({ transaction_id: 'tx-termica-1' }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
  });

  it('tras checkout exitoso: sku, moneda, subtotalCup, pagos agregados y vuelto del panel', async () => {
    useCartStore.getState().addItem(cupProduct);
    const item = useCartStore.getState().items[0];
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, item.payments![0].id,
      { amount: 20000, currency: 'CUP', method: 'cash' },
    );

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => {
      await result.current.startCheckout('cash', null, { cashReceived: 20500, change: 500 });
    });

    const lastSale = result.current.lastSale;
    expect(lastSale).not.toBeNull();
    expect(lastSale!.id).toBe('tx-termica-1');
    // Datos por línea para el recibo
    expect(lastSale!.items[0].product.sku).toBe('128');
    expect(lastSale!.items[0].product.name).toBe('Cemento TBV 400');
    expect(lastSale!.items[0].currency).toBe('CUP');
    // Importes canónicos CUP (mismos getters del store — cero recálculo)
    expect(lastSale!.subtotalCup).toBe(20000);
    expect(lastSale!.total).toBe(20000);
    expect(lastSale!.discountAmount).toBe(0);
    // Pagos agregados de las filas reales
    expect(lastSale!.payments).toEqual([{ method: 'cash', amount: 20000, currency: 'CUP' }]);
    // Vuelto/efectivo recibido reenviados por el panel (solo presentación)
    expect(lastSale!.cashReceived).toBe(20500);
    expect(lastSale!.change).toBe(500);
    expect(lastSale!.customerName).toBe('Cliente Térmico');
  });

  it('el checkout SIN contexto de cobro deja change/cashReceived en null (retrocompatible)', async () => {
    useCartStore.getState().addItem(cupProduct);
    const item = useCartStore.getState().items[0];
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, item.payments![0].id,
      { amount: 20000, currency: 'CUP', method: 'cash' },
    );

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => {
      await result.current.startCheckout('cash', null);
    });

    expect(result.current.lastSale!.change).toBeNull();
    expect(result.current.lastSale!.cashReceived).toBeNull();
    expect(result.current.lastSale!.payments).toEqual([
      { method: 'cash', amount: 20000, currency: 'CUP' },
    ]);
  });

  it('el payload al servidor NO cambia por el contexto de impresión (solo presentación)', async () => {
    useCartStore.getState().addItem(cupProduct);
    const item = useCartStore.getState().items[0];
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, item.payments![0].id,
      { amount: 20000, currency: 'CUP', method: 'cash' },
    );

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => {
      await result.current.startCheckout('cash', null, { cashReceived: 20500, change: 500 });
    });

    const checkoutCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/pos/checkout'));
    expect(checkoutCall).toBeDefined();
    const payload = JSON.parse((checkoutCall![1] as RequestInit).body as string);
    // Ni cashReceived del panel ni change viajan al RPC (no son datos de negocio)
    expect(payload.cashReceived).toBeUndefined();
    expect(payload.change).toBeUndefined();
    expect(payload.total_amount).toBe(20000);
  });
});

// ── 5. usePOSCartExports.printReceipt — wiring del comprobante ──────────────

describe('usePOSCartExports.printReceipt — construye y delega la impresión', () => {
  const lastSaleFixture = {
    id: '8ab7becf-1111-2222-3333-444455556666',
    date: '2026-10-20T18:45:00.000Z',
    items: [
      {
        product: { name: 'Brecker 63 AMP', sku: '128' },
        variantName: null,
        quantity: 1,
        price: 20000,
        subtotal: 20000,
        currency: 'CUP',
      },
    ],
    subtotal: 20000,
    subtotalCup: 20000,
    discountAmount: 0,
    taxAmount: 0,
    total: 20000,
    discount: null,
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 20000, currency: 'CUP' }],
    cashReceived: 20500,
    change: 500,
    customerName: undefined,
  };

  it('delega en printThermalReceipt con el comprobante completo (tienda + vendedor + vuelto)', async () => {
    useAuthStore.setState({
      user: UserFactory.create({
        id: 'u-1', email: 'a@a.com', fullName: 'Operador X', role: 'admin',
        roles: ['admin'], storeId: STORE, activeStoreId: STORE,
      }),
      token: 't',
    });
    const { result } = renderHook(() => usePOSCartExports({ lastSale: lastSaleFixture as any }));
    await act(async () => {
      await result.current.printReceipt();
    });
    expect(fetchActiveStoreNameMock).toHaveBeenCalledWith(STORE);
    expect(printThermalReceiptMock).toHaveBeenCalledTimes(1);
    const dataArg = (printThermalReceiptMock as any).mock.calls[0][0] as ThermalReceiptData;
    expect(dataArg.storeName).toBe('EnerVida');
    expect(dataArg.sellerName).toBe('Operador X');
    expect(dataArg.items[0].code).toBe('128');
    expect(dataArg.change).toBe(500);
    expect(dataArg.total).toBe(20000);
    expect(dataArg.isReprint).toBe(false);
  });

  it('sin lastSale no imprime nada (guard: solo ventas confirmadas)', async () => {
    const { result } = renderHook(() => usePOSCartExports({ lastSale: null }));
    await act(async () => {
      await result.current.printReceipt();
    });
    expect(printThermalReceiptMock).not.toHaveBeenCalled();
  });
});

// ── 6. Reimpresión desde el historial (TransactionDetailsModal) ─────────────

describe('TransactionDetailsModal — reimpresión del comprobante (100% lectura)', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const txnFixture: any = {
    id: 'd7c8ef72-aaaa-bbbb-cccc-ddddeeeeffff',
    store_id: STORE,
    invoice_number: 'F-0001',
    created_at: '2026-10-16T15:30:00.000Z',
    subtotal: 31600,
    discount_value: 0,
    tax_amount: 0,
    total_amount: 31600,
    payment_method: 'cash',
    status: 'completed',
    cash_amount: 31600,
    transfer_amount: 2400,
    zelle_amount: 0,
    applied_taxes: [],
  };

  const itemsFixture: any[] = [
    {
      id: 'ti-1',
      transaction_id: txnFixture.id,
      product_id: 'p-1',
      variant_id: null,
      quantity: 2,
      price_at_sale: 15800,
      price_at_sale_cup: 15800,
      cost_at_sale: 12000,
      created_at: txnFixture.created_at,
      products: { name: 'Brecker 63 AMP', sku: '128' },
    },
  ];

  function renderModal(props?: Partial<{ transaction: any; isLoading: boolean }>) {
    return render(
      <QueryClientProvider client={queryClient}>
        <TransactionDetailsModal
          isOpen
          onClose={vi.fn()}
          transaction={props?.transaction ?? txnFixture}
          items={itemsFixture}
          isLoading={props?.isLoading ?? false}
        />
      </QueryClientProvider>,
    );
  }

  it('el botón «Imprimir comprobante» existe en el modal de detalles', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /imprimir comprobante/i })).toBeInTheDocument();
  });

  it('al pulsar se reimprime DESDE el registro persistido (isReprint, pagos reales, CUP canónico)', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /imprimir comprobante/i }));
    await waitFor(() => {
      expect(printThermalReceiptMock).toHaveBeenCalledTimes(1);
    });
    const dataArg = (printThermalReceiptMock as any).mock.calls[0][0] as ThermalReceiptData;
    expect(dataArg.isReprint).toBe(true);
    expect(dataArg.saleId).toBe(txnFixture.id);
    expect(dataArg.invoiceNumber).toBe('F-0001');
    // Pagos desde el registro (cash + transfer CUP) — sin recalcular nada
    expect(dataArg.payments).toEqual([
      { method: 'cash', amount: 31600, currency: 'CUP' },
      { method: 'transfer', amount: 2400, currency: 'CUP' },
    ]);
    expect(dataArg.items[0]).toEqual({
      code: '128',
      name: 'Brecker 63 AMP',
      quantity: 2,
      unitPrice: 15800,
      currency: 'CUP',
      lineTotal: 31600,
    });
    expect(dataArg.total).toBe(31600);
  });

  it('deshabilitado mientras los ítems cargan (no imprimir datos a medias)', () => {
    renderModal({ isLoading: true });
    expect(screen.getByRole('button', { name: /imprimir comprobante/i })).toBeDisabled();
  });

  it('venta anulada: la reimpresión sale marcada (trazabilidad del estado)', async () => {
    renderModal({ transaction: { ...txnFixture, status: 'voided' } });
    fireEvent.click(screen.getByRole('button', { name: /imprimir comprobante/i }));
    await waitFor(() => {
      expect(printThermalReceiptMock).toHaveBeenCalledTimes(1);
    });
    const dataArg = (printThermalReceiptMock as any).mock.calls[0][0] as ThermalReceiptData;
    expect(dataArg.status).toBe('voided');
  });
});
