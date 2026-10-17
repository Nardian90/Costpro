/**
 * MISIÓN-FLEX (2026-10-17) — Tests de integración del checkout POS con
 * incidencias de pago (flexibilización temporal).
 *
 * Cubre la matriz de pruebas A de la misión a nivel de flujo del carrito:
 *   - Pago insuficiente/desglose descuadrado → NO bloquea; informa y envía
 *     `payment_incidents` al servidor (nota + Auditoría server-side).
 *   - Venta exacta → payload canónico SIN payment_incidents (sin falsos
 *     positivos y compatible con RPC sin migrar).
 *   - Modal "Descuadre de tasa" confirmado → diferencia documentada como
 *     incidencia `rate_difference`.
 *   - Total 0 → sigue bloqueando (mensaje canónico).
 *   - Total NEGATIVO → REGLA INNEGOCIABLE: se rechaza y se registra el
 *     intento en Auditoría (sale_negative_rejected, fuente cliente).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => {
  const toastFn: any = Object.assign(() => 'toast-id', {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    info: vi.fn(),
  });
  return { toast: toastFn };
});

vi.mock('@/hooks/api/useDocumentActions', () => ({
  useInvertDocument: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/services/audit-service', () => ({
  auditService: {
    logNegativeSaleAttempt: vi.fn(),
    logRatesConfirmed: vi.fn(),
    logSaleBelowCost: vi.fn(),
    logInvoiceWithoutPrice: vi.fn(),
  },
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { toast } from 'sonner';
import { auditService } from '@/services/audit-service';
import { usePOSCheckout } from '@/components/views/terminal/views/pos/usePOSCheckout';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store';
import { UserFactory } from '@/contracts/user';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const RATE_TEST = 790;

const usdProduct = {
  id: 'aaaa1111-0000-4000-8000-000000000001',
  name: 'MPPT Solar 120W',
  price: 120,
  price_currency: 'USD',
  stock_current: 10,
  store_id: STORE,
  cost_price: 50,
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
    customerName: null,
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

/** Carrito MPPT 120 USD (tasa 790 → total 94 800 CUP) con una fila de pago CUP. */
function buildCart(paidCup: number, withStoreRates = true) {
  if (withStoreRates) useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST });
  useCartStore.getState().addItem(usdProduct);
  const item = useCartStore.getState().items[0];
  useCartStore.getState().updateItemPaymentRow(
    item.product_id, null, item.payments![0].id,
    { amount: paidCup, currency: 'CUP', method: 'cash' },
  );
}

function mockCheckoutOk() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/pos/checkout')) {
      return { ok: true, status: 200, json: async () => ({ transaction_id: 'tx-flex-1' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

function checkoutBodies(): any[] {
  return fetchMock.mock.calls
    .filter(c => String(c[0]).includes('/api/pos/checkout'))
    .map(c => JSON.parse(c[1].body));
}

describe('usePOSCheckout — flexibilización de diferencias de pago (MISIÓN-FLEX)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    fetchMock.mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('A.2 faltante pequeño (≤2%): NO bloquea, informa y envía payment_incidents con lo REALMENTE recibido', async () => {
    buildCart(94000); // esperado 94800 → faltante 800 CUP (0.84% < 2%: sin modal de tasa)
    mockCheckoutOk();

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => { await result.current.startCheckout('mixed'); });

    // No bloquea: sin toast.error de descuadre y la venta SÍ se envía
    expect((toast.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('descuadrado'))).toBe(false);
    const bodies = checkoutBodies();
    expect(bodies).toHaveLength(1);

    const body = bodies[0];
    // El total de la venta sigue siendo el canónico (no se "cuadra" con el pago)
    expect(body.total_amount).toBe(94800);
    // Lo recibido se registra tal cual (no se infla al total)
    expect(body.cash_amount).toBe(94000);
    // Incidencias estructuradas: faltante global + desglose por línea
    expect(Array.isArray(body.payment_incidents)).toBe(true);
    const types = body.payment_incidents.map((i: any) => i.type);
    expect(types).toContain('insufficient_payment');
    expect(types).toContain('mixed_breakdown_mismatch');
    const global = body.payment_incidents.find((i: any) => i.type === 'insufficient_payment');
    expect(global.expected_cup).toBe(94800);
    expect(global.received_cup).toBe(94000);
    expect(global.difference_cup).toBe(-800);

    // El cajero fue INFORMADO (toast no bloqueante) y la venta NO se presenta como pagada
    expect((toast.warning as any).mock.calls.some((c: any[]) => String(c[0]).includes('diferencia de pago'))).toBe(true);
    expect((toast.warning as any).mock.calls.some((c: any[]) => String(c[0]).includes('INCIDENCIA DE PAGO'))).toBe(true);
  });

  it('A.1 venta exacta: payload canónico SIN payment_incidents y sin avisos', async () => {
    buildCart(94800);
    mockCheckoutOk();

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => { await result.current.startCheckout('mixed'); });

    expect(toast.warning).not.toHaveBeenCalled();
    const body = checkoutBodies()[0];
    expect(body.total_amount).toBe(94800);
    expect(body.cash_amount).toBe(94800);
    expect(body.payment_incidents).toBeUndefined();
  });

  it('A.2b faltante grande (>2%): el modal de tasa informa; al confirmar se registra con incidencia', async () => {
    buildCart(80000); // 14800/94800 = 15.6% > 2% → modal
    mockCheckoutOk();

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => { await result.current.startCheckout('mixed'); });

    // Pausó en el modal de descuadre (no envió aún)
    expect(result.current.showRateWarning).toBe(true);
    expect(checkoutBodies()).toHaveLength(0);

    // El cajero confirma continuar → la venta se registra CON incidencias
    await act(async () => { await result.current.confirmRateWarning(); });

    const body = checkoutBodies()[0];
    expect(body.cash_amount).toBe(80000);
    const types = body.payment_incidents.map((i: any) => i.type);
    expect(types).toContain('insufficient_payment');
    expect(types).toContain('rate_difference');
    expect(body.total_amount).toBe(94800);
  });

  it('A.5 venta con total NEGATIVO: rechazada, sin fetch y con intento registrado en Auditoría', async () => {
    buildCart(94800);
    mockCheckoutOk();
    // Fuerza un total esperado negativo (descuento corrupto / bug de UI) —
    // simula la anomalía que el guard debe interceptar.
    const st = useCartStore.getState();
    const spy = vi.spyOn(st, 'getExpectedTotalCup').mockReturnValue(-1500);

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => { await result.current.startCheckout('mixed'); });

    spy.mockRestore();
    // REGLA INNEGOCIABLE: no se aprueba ni se envía al servidor
    expect(checkoutBodies()).toHaveLength(0);
    expect((toast.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('total negativo'))).toBe(true);
    // Traza del intento en Auditoría (fuente cliente)
    expect(auditService.logNegativeSaleAttempt).toHaveBeenCalledTimes(1);
    const call = (auditService.logNegativeSaleAttempt as any).mock.calls[0][0];
    expect(call.total).toBe(-1500);
    expect(call.source).toBe('client');
    expect(call.storeId).toBe(STORE);
  });

  it('A.5b total 0: bloqueo canónico se conserva (venta de total cero ≠ venta negativa)', async () => {
    useCartStore.getState().addItem({ ...usdProduct, price_currency: 'CUP', price: 100 });
    useCartStore.getState().setDiscount({ type: 'fixed', value: 100000 });
    mockCheckoutOk();

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => { await result.current.startCheckout('mixed'); });

    expect((toast.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('total de 0'))).toBe(true);
    expect(checkoutBodies()).toHaveLength(0);
    expect(auditService.logNegativeSaleAttempt).not.toHaveBeenCalled();
  });
});
