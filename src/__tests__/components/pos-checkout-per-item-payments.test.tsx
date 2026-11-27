/**
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 — FASE 4: el payload del checkout
 * transporta la distribución de pago REAL por línea (items[].payments) y el
 * CI del cliente (customer_ci), sin alterar los espejos legacy por método
 * (compatibilidad total con create_sale_v2 y los lectores financieros).
 *
 * Escenarios de la misión cubiertos aquí (nivel payload):
 *  · A: un producto, pago completo en efectivo → payments[] con la fila completa.
 *  · C: un producto, mixto efectivo + transferencia → 2 filas con SU referencia.
 *  · D: tres productos con métodos diferentes → cada línea su distribución.
 *  · F: venta con transferencia + datos del cliente → customer_ci viaja al RPC.
 *  · M: monedas diferentes por línea (CUP + USD) → filas conservan SU moneda
 *    con la tasa informativa (misma resolución que getItemPaidCup).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => {
  const toastFn: any = Object.assign(() => 'toast-id', {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), info: vi.fn(),
  });
  return { toast: toastFn };
});
vi.mock('@/hooks/api/useDocumentActions', () => ({
  useInvertDocument: () => ({ mutateAsync: vi.fn() }),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { usePOSCheckout } from '@/components/views/terminal/views/pos/usePOSCheckout';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store';
import { UserFactory } from '@/contracts/user';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const pA = { id: 'aaaa1111-0000-4000-8000-000000000001', name: 'Producto A', price: 500, price_currency: 'CUP', stock_current: 20, store_id: STORE, cost_price: 300 };
const pB = { id: 'bbbb2222-0000-4000-8000-000000000002', name: 'Producto B', price: 700, price_currency: 'CUP', stock_current: 20, store_id: STORE, cost_price: 400 };
const pC = { id: 'cccc3333-0000-4000-8000-000000000003', name: 'Producto C', price: 700, price_currency: 'CUP', stock_current: 20, store_id: STORE, cost_price: 400 };
const pD = { id: 'dddd4444-0000-4000-8000-000000000004', name: 'Producto D (USD)', price: 2, price_currency: 'USD', stock_current: 20, store_id: STORE, cost_price: 1 };

function resetStores() {
  useCartStore.setState({
    items: [], discount: null, appliedTaxes: [], storeId: STORE, globalRates: {},
    saleCurrency: 'CUP', saleExchangeRate: 1.0, selectedPayment: 'cash',
    customerId: null, customerName: null, customerCi: null, customerPhone: null, customerAddress: null, customerCode: null,
    operationType: 'sale', lastUpdated: Date.now(),
  });
  useAuthStore.setState({
    user: UserFactory.create({
      id: '8f1d2a34-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin@costpro.com',
      fullName: 'Operador Test', role: 'admin', roles: ['admin'],
      storeId: STORE, activeStoreId: STORE,
    }),
    token: 'test-token',
  });
}

function transferRow(itemIndex: number, amount: number, reference: string) {
  const st0 = useCartStore.getState();
  const item = st0.items[itemIndex];
  st0.addItemPayment(item.product_id, item.variant_id, 'transfer');
  // Estado FRESCO tras addItemPayment (produce crea arrays nuevos — el
  // snapshot anterior queda stale).
  const fresh = useCartStore.getState();
  const row = fresh.items[itemIndex].payments!.at(-1)!;
  fresh.updateItemPaymentRow(item.product_id, item.variant_id, row.id, { amount, currency: 'CUP', reference });
}

async function checkout() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/pos/checkout')) {
      return { ok: true, status: 200, json: async () => ({ transaction_id: 'tx-peritem-1' }) };
    }
    if (url.includes('/api/exchange-rates')) {
      return { ok: true, status: 200, json: async () => ({ informal_latest: { rate: '450' } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  const { result } = renderHook(() => usePOSCheckout());
  await act(async () => {
    await result.current.startCheckout('mixed');
  });
  const checkoutCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/pos/checkout'));
  expect(checkoutCalls.length).toBeGreaterThanOrEqual(1);
  const [, init] = checkoutCalls[checkoutCalls.length - 1];
  return JSON.parse(init.body);
}

describe('usePOSCheckout — pagos independientes por producto (CP-POS-PER-ITEM-PAYMENTS)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    fetchMock.mockReset();
  });

  it('A · un producto, pago completo en efectivo: payments[] con la fila completa y espejos intactos', async () => {
    useCartStore.getState().addItem(pA); // 1 fila cash por defecto = subtotal (500)
    const body = await checkout();

    expect(body.items).toHaveLength(1);
    expect(body.items[0].payments).toEqual([
      expect.objectContaining({ method: 'cash', currency: 'CUP', amount: 500 }),
    ]);
    // Espejos legacy SIN cambios (lectores financieros intactos)
    expect(body.items[0].cash_paid).toBe(500);
    expect(body.items[0].transfer_paid).toBe(0);
    expect(body.items[0].external_transfer_paid).toBe(0);
    expect(body.payment_method).toBe('mixed'); // param de entrada
    expect(body.idempotency_key).toMatch(/^sale-/);
  });

  it('C · un producto mixto efectivo + transferencia: dos filas y SU referencia (§5.1)', async () => {
    useCartStore.getState().addItem(pB); // cash 700 por defecto
    // Ajustar la fila default a cash 300 y agregar transferencia 400 con referencia
    const st = useCartStore.getState();
    const first = st.items[0].payments![0];
    st.updateItemPaymentRow(pB.id, null, first.id, { amount: 300 });
    transferRow(0, 400, 'TR-888');
    // Marcar override manual (el panel clásico lo hace al editar; Express al configurar)
    useCartStore.setState((s) => ({
      items: s.items.map((i) => ({ ...i, payment_manual_override: true })),
    }));

    const body = await checkout();
    const rows = body.items[0].payments;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      expect.objectContaining({ method: 'cash', currency: 'CUP', amount: 300 }),
      expect.objectContaining({ method: 'transfer', currency: 'CUP', amount: 400, reference: 'TR-888' }),
    ]);
    // La referencia NO viaja en filas de efectivo (§5.1: solo transferencias)
    expect(rows[0].reference).toBeUndefined();
    // Espejos legacy canónicos
    expect(body.items[0].cash_paid).toBe(300);
    expect(body.items[0].transfer_paid).toBe(400);
    // Pools derivados de las filas reales (método mixed)
    expect(body.cash_amount).toBe(300);
    expect(body.transfer_amount).toBe(400);
    expect(body.total_amount).toBe(700);
  });

  it('D · tres productos con métodos diferentes: cada línea conserva SU distribución', async () => {
    useCartStore.getState().addItem(pA);  // cash completo (500)
    useCartStore.getState().addItem(pB);  // transferencia completa (700)
    useCartStore.getState().addItem(pC);  // cash 400 + transfer 300
    const st = useCartStore.getState();
    // Línea B → transferencia completa CON su número de operación (§5.1)
    st.updateItemPaymentRow(pB.id, null, st.items[1].payments![0].id, { method: 'transfer', currency: 'CUP', reference: 'TR-B' });
    // Línea C → cash 400 (fila default) + transferencia 300
    st.updateItemPaymentRow(pC.id, null, st.items[2].payments![0].id, { amount: 400 });
    transferRow(2, 300, 'TR-999');
    useCartStore.setState((s) => ({
      items: s.items.map((i) => ({ ...i, payment_manual_override: true })),
    }));

    const body = await checkout();
    expect(body.items[0].payments).toEqual([expect.objectContaining({ method: 'cash', amount: 500 })]);
    expect(body.items[1].payments).toEqual([expect.objectContaining({ method: 'transfer', amount: 700, reference: 'TR-B' })]);
    expect(body.items[2].payments).toEqual([
      expect.objectContaining({ method: 'cash', amount: 400 }),
      expect.objectContaining({ method: 'transfer', amount: 300, reference: 'TR-999' }),
    ]);
    // Conciliación payload: Σ distribuciones (CUP) = total de la venta
    const totalDistribuido = body.items.reduce(
      (s: number, i: { payments?: Array<{ amount: number }> }) =>
        s + (i.payments || []).reduce((ps, p) => ps + p.amount, 0), 0,
    );
    expect(totalDistribuido).toBe(body.total_amount);
  });

  it('F · venta con transferencia y datos del cliente: nombre + CI + teléfono viajan al RPC', async () => {
    useCartStore.getState().addItem(pB);
    // La fila cash por defecto pasa a 0 (la línea se paga SOLO por transferencia)
    const stF = useCartStore.getState();
    stF.updateItemPaymentRow(pB.id, null, stF.items[0].payments![0].id, { amount: 0 });
    transferRow(0, 700, 'TR-777');
    useCartStore.setState((s) => ({
      items: s.items.map((i) => ({ ...i, payment_manual_override: true })),
    }));
    useCartStore.getState().setCustomer(null, 'Cliente QA Transferencia');
    useCartStore.getState().setCustomerCi('92031112345');
    // MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001 (FASE 2):
    // el teléfono del pagador viaja junto al nombre y al CI.
    useCartStore.getState().setCustomerPhone('+53 51234567');

    const body = await checkout();
    expect(body.customer_name).toBe('Cliente QA Transferencia');
    expect(body.customer_ci).toBe('92031112345');
    expect(body.customer_phone).toBe('+53 51234567');
    // La referencia viaja SOLO en la fila de transferencia (§5.1)
    const transferFila = body.items[0].payments.find((p: { method: string }) => p.method === 'transfer');
    expect(transferFila.reference).toBe('TR-777');
    expect(body.items[0].payments.find((p: { method: string }) => p.method === 'cash').reference).toBeUndefined();
    expect(body.transfer_amount).toBe(700);
  });

  it('sin transferencia NI cliente: customer_ci/customer_phone van null y no se exige nada personal', async () => {
    useCartStore.getState().addItem(pA);
    const body = await checkout();
    expect(body.customer_ci).toBeNull();
    expect(body.customer_phone).toBeNull();
    expect(body.customer_name).toBeNull();
  });

  it('M · monedas diferentes por línea (CUP + USD): filas con SU moneda y tasa informativa', async () => {
    useCartStore.getState().hydrateStoreRates({ USD: 450 });
    useCartStore.getState().addItem(pD); // USD 2 → con tasa 450 = 900 CUP
    const body = await checkout();

    expect(body.items[0].currency).toBe('USD');
    expect(body.items[0].exchange_rate).toBe(450);
    expect(body.items[0].payments).toEqual([
      expect.objectContaining({ method: 'cash', currency: 'USD', amount: 2, exchange_rate: 450 }),
    ]);
    // El desglose real por moneda viaja como componentes (regla de envío vigente)
    expect(body.payment_components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'cash', currency: 'USD', amount: 2 }),
      ]),
    );
  });
});
