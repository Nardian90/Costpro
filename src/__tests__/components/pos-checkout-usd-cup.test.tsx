/**
 * FIX-USD-CUP-RATE — Test de integración del checkout POS (usePOSCheckout).
 *
 * Reproduce el caso EXACTO de ENERVIDA-VITALLCONS:
 *   - Producto "MPPT Solar 120W" de 120 USD (price_currency USD).
 *   - Cliente paga 94 800 CUP (tasa de tienda 790, configurada en TASAS).
 *   - ANTES: toast "Sobrepago: $94,680.00 CUP" + "Pago mixto descuadrado en
 *     \"MPPT Solar 120W\"" al pulsar Cobrar → venta bloqueada.
 *   - DESPUÉS: checkout cuadrado, payload coherente para create_sale_v2
 *     (total 94 800 CUP, precio nativo 120 USD, tasa 790 como trazabilidad).
 *
 * Rojo/verde: el test rojo corre SIN tasas hidratadas (estado del entorno
 * anterior) y debe fallar exactamente como lo hacía en producción.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => {
  // sonner exporta toast callable + métodos (toast("...", {...}) en el flujo
  // de éxito del checkout para la ventana "Deshacer" de 30s).
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

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { toast } from 'sonner';
import { usePOSCheckout } from '@/components/views/terminal/views/pos/usePOSCheckout';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store';
import { UserFactory } from '@/contracts/user';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const RATE_TEST = 790; // Tasa SOLO de prueba (la real viene de la configuración de la tienda)

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

/** Monta el carrito EXACTO de la incidencia: producto USD + fila de pago CUP 94 800. */
function buildIncidentCart(withStoreRates: boolean) {
  if (withStoreRates) {
    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST });
  }
  useCartStore.getState().addItem(usdProduct);
  const item = useCartStore.getState().items[0];
  useCartStore.getState().updateItemPaymentRow(
    item.product_id, null, item.payments![0].id,
    { amount: 94800, currency: 'CUP', method: 'cash' },
  );
}

describe('usePOSCheckout — venta 120 USD cobrada en 94 800 CUP (tasa de tienda 790)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    fetchMock.mockReset();
  });

  it('VERDE · con tasa de tienda hidratada: sin falso sobrepago, sin descuadre MPPT, payload CUP coherente', async () => {
    buildIncidentCart(true);

    // El badge del panel ya no muestra falso sobrepago (matemática del panel)
    const st = useCartStore.getState();
    const totalPaidCup = st.items.reduce((s, i) => s + st.getItemPaidCup(i), 0);
    expect(st.getExpectedTotalCup()).toBe(94800);
    expect(totalPaidCup).toBe(94800);
    expect(toast.error).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/pos/checkout')) {
        return { ok: true, status: 200, json: async () => ({ transaction_id: 'tx-rls-1' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => {
      await result.current.startCheckout('mixed');
    });

    // El checkout NO fue bloqueado por la validación de pago mixto
    expect(toast.error).not.toHaveBeenCalled();
    expect((toast.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('descuadrado'))).toBe(false);

    // El payload enviado al RPC create_sale_v2 es coherente:
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/pos/checkout');
    const body = JSON.parse(init.body);
    expect(body.payment_method).toBe('mixed');
    expect(body.total_amount).toBe(94800);        // CUP = 120 USD × 790
    expect(body.subtotal).toBe(94800);
    expect(body.cash_amount).toBe(94800);         // la fila CUP completa
    expect(body.transfer_amount).toBe(0);
    expect(body.zelle_amount).toBe(0);
    // El item conserva su precio NATIVO + tasa como trazabilidad
    expect(body.items[0].price).toBe(120);        // USD (sin conversión duplicada)
    expect(body.items[0].currency).toBe('USD');
    expect(body.items[0].exchange_rate).toBe(790);
    expect(body.items[0].cash_paid).toBe(94800);
    expect(body.items[0].cash_currency).toBe('CUP');
    // Idempotencia presente (no duplicación en reintento server-side)
    expect(body.idempotency_key).toMatch(/^sale-/);
  });

  it('ROJO · sin tasas hidratadas (estado anterior): reproduce el falso descuadre y NO llama al checkout', async () => {
    buildIncidentCart(false); // globalRates vacío → item USD con tasa 1.0

    const st = useCartStore.getState();
    expect(st.items[0].exchange_rate).toBe(1.0);
    expect(st.getExpectedTotalCup()).toBe(120); // el bug: 120 "CUP" en vez de 94 800

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => {
      await result.current.startCheckout('mixed');
    });

    // El gate de pago mixto bloquea con el EXACTO mensaje reportado por el usuario
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Pago mixto descuadrado en "MPPT Solar 120W"'),
      expect.anything(),
    );
    // Y jamás se envía la venta al servidor
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/pos/checkout'))).toHaveLength(0);
  });

  it('VERDE · pago nativo en USD (120) para producto de 120 USD: gate por-item NO lo rechaza', async () => {
    // Regresión del defecto inverso: la fórmula inline anterior trataba el pago
    // en la moneda del item como ×1 (120) contra subtotal convertido (94 800)
    // → habría bloqueado todo pago en USD tras activar la tasa de tienda.
    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST });
    useCartStore.getState().addItem(usdProduct); // fila por defecto: cash USD 120

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/pos/checkout')) {
        return { ok: true, status: 200, json: async () => ({ transaction_id: 'tx-usd-1' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { result } = renderHook(() => usePOSCheckout());
    await act(async () => {
      await result.current.startCheckout('cash');
    });

    expect(toast.error).not.toHaveBeenCalled();
    expect((toast.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('descuadrado'))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.total_amount).toBe(94800);
    // Método cash puro: el servidor normaliza cash al total (94800 CUP recibidos)
    expect(body.cash_amount).toBe(94800);
  });
});
