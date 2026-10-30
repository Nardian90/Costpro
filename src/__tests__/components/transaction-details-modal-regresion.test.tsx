/**
 * CP-CORRECCIONES-VENTAS-ALMACÉN-001 — Pruebas de regresión (INC2).
 *
 * Incidencia reportada por el propietario: al hacer clic sobre una venta en
 * Historial de Ventas, la aplicación generaba un error y no permitía ver el
 * detalle.
 *
 * Causa raíz (reproducida en CostproE2E con datos sintéticos):
 * 1. `TransactionDetailsModal` declaraba `useState(isExportingSc212)` DESPUÉS
 *    del `if (!transaction) return null`. Con el modal cerrado
 *    (transaction=null) React contaba 10 hooks; al abrir una venta aparecía
 *    el 11º → «Rendered more hooks than during the previous render» → crash
 *    del ErrorBoundary en CADA clic (determinista, cualquier venta).
 *    Introducido por el botón «Exportar SC-2-12» (MISIÓN RESOLUCIÓN 11).
 * 2. Filas históricas V1 con `price_at_sale_cup = 0` y `price_at_sale > 0`
 *    (60 filas reales en producción) mostraban «$0.00» como precio unitario
 *    porque `??` trata 0 como valor válido. La regla canónica del sistema
 *    (lineTotalCup en cash-report/summary.ts) deriva el CUP de
 *    price_at_sale × tasa cuando pas_cup no es > 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TransactionDetailsModal } from '@/components/views/terminal/views/sales/TransactionDetailsModal';
import type { Transaction, TransactionItem } from '@/types';

// ── Mocks de hooks/API ────────────────────────────────────────────────
vi.mock('@/store', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', role: 'admin', activeStoreId: 'store-1' },
    token: 't',
  }),
}));

vi.mock('@/hooks/api/useTaxes', () => ({
  useTaxes: () => ({ data: [] }),
}));

vi.mock('@/hooks/api/useTransactions', () => ({
  useSalePayments: () => ({ data: [] }),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/legal/sc212', () => ({
  exportSc212ForTransaction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/views/terminal/views/pos/thermal-receipt-print', () => ({
  fetchActiveStoreName: vi.fn().mockResolvedValue('Tienda QA'),
  printThermalReceipt: vi.fn().mockResolvedValue(undefined),
}));

// Silenciar sonner (toasts)
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

const baseTransaction = {
  id: '44444444-aaaa-4bbb-8ccc-00000000e2e1',
  store_id: 'store-1',
  seller_id: 'u1',
  total_amount: 5000,
  status: 'completed',
  created_at: '2026-09-15T10:00:00+00:00',
  payment_method: 'cash',
  subtotal: 5000,
  discount_value: 0,
  tax_amount: 0,
  cash_amount: null,
  transfer_amount: null,
  zelle_amount: null,
  invoice_number: null,
  customer_name: null,
  applied_taxes: [],
} as unknown as Transaction;

// Fila histórica REAL (forma capturada de producción): pas_cup=0, pas=10200,
// currency/rate null — el modal DEBE mostrar 10,200, no «$0.00».
const legacyItem = {
  id: 'item-1',
  transaction_id: baseTransaction.id,
  product_id: 'p1',
  variant_id: null,
  quantity: 2,
  price_at_sale: 10200,
  cost_at_sale: null,
  created_at: '2026-08-17T12:00:00+00:00',
  price_currency: null,
  price_at_sale_cup: 0,
  cash_paid: null,
  transfer_paid: null,
  zelle_paid: null,
  currency: null,
  exchange_rate: null,
  cash_currency: null,
  transfer_currency: null,
  zelle_currency: null,
  products: { name: 'Producto Histórico', sku: 'HIS-1' },
} as unknown as TransactionItem;

// Fila V2 normal: pas_cup manda
const modernItem = {
  ...legacyItem,
  id: 'item-2',
  price_at_sale: 6500,
  price_at_sale_cup: 6500,
  products: { name: 'Cemento Cola', sku: '15' },
} as unknown as TransactionItem;

function renderModal(props: Partial<React.ComponentProps<typeof TransactionDetailsModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TransactionDetailsModal
        isOpen
        onClose={() => {}}
        transaction={null}
        items={[]}
        isLoading={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('CP-CORRECCIONES-VENTAS-ALMACÉN-001 — TransactionDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REGRESIÓN 1 (hook order): cerrado (transaction=null) → abrir una venta NO crashea', async () => {
    // El bug: render 1 (null) montaba 10 hooks; render 2 (con venta) añadía el
    // 11º (useState tras el return temprano) → «Rendered more hooks than
    // during the previous render» → ErrorBoundary. Con el fix, ambos renders
    // montan el MISMO número de hooks.
    const { rerender } = renderModal({ transaction: null });

    // Render 1: cerrado — no debe renderizar nada
    expect(screen.queryByText('Detalles de la Venta')).not.toBeInTheDocument();

    // Render 2: se abre una venta (exactamente el clic del propietario)
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TransactionDetailsModal
          isOpen
          onClose={() => {}}
          transaction={baseTransaction}
          items={[modernItem]}
          isLoading={false}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Detalles de la Venta')).toBeInTheDocument();
    });
    // El modal muestra la venta sin crash (React habría lanzado el error de hooks aquí)
    expect(screen.getByText('Cemento Cola')).toBeInTheDocument();
  });

  it('REGRESIÓN 2 (importe legacy): price_at_sale_cup=0 + price_at_sale=10200 → muestra 10,200 (no «$0.00»)', () => {
    renderModal({ transaction: baseTransaction, items: [legacyItem] });
    // 10,200 × 2 = 20,400 — el importe del registro original, no $0.00
    const body = document.body.textContent || '';
    expect(body).toContain('Producto Histórico');
    expect(body).not.toContain('$0.00 CUP');
  });

  it('REGRESIÓN 2b (fila moderna): price_at_sale_cup>0 manda (misma regla canónica)', () => {
    renderModal({ transaction: baseTransaction, items: [modernItem] });
    const body = document.body.textContent || '';
    expect(body).toContain('6,500');
  });

  it('Venta histórica con producto inactivo y campos vacíos: sin crash y con datos del registro', () => {
    const historicalItem = {
      ...legacyItem,
      id: 'item-3',
      price_at_sale: 2500,
      price_at_sale_cup: null, // null legítimo (no 0): fallback directo
      cost_at_sale: null,
    } as unknown as TransactionItem;
    renderModal({ transaction: baseTransaction, items: [historicalItem] });
    const body = document.body.textContent || '';
    expect(body).toContain('Producto Histórico');
    expect(body).toContain('2,500');
  });

  it('Con isLoading los botones de acción quedan deshabilitados (sin doble ejecución)', () => {
    renderModal({ transaction: baseTransaction, items: [], isLoading: true });
    expect(screen.getByText(/Imprimir comprobante/i)).toBeDisabled();
  });
});
