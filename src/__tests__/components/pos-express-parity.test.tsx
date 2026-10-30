/**
 * MISIÓN VENDER-EXPRESS (2026-10-30) — Pruebas funcionales comparativas.
 *
 * Casos de la Fase 6 cubiertos aquí (el carrito es la referencia):
 *  · Caso A: producto existente localizable por SKU / nombre / fragmento /
 *    código de barras (reproduce el bug reportado: «el producto no aparece»).
 *  · Caso B: mismos resultados que el carrito — autocompletado en vivo con
 *    el MISMO POSAutocomplete del carrito.
 *  · Caso C: cantidades (± en Express; decimales vía POSCartItemEditModal).
 *  · Caso E: existencias (guard del store + badge «Sin stock»).
 *  · Caso G: confirmación delega en startCheckout (mismo flujo del carrito).
 *  · Caso H: catálogo maestro — el fallback server-side usa el MISMO RPC
 *    autorizado (get_products_for_pos) que resuelve el barcode canónico.
 *  · Delegación: Express NUNCA agrega por su cuenta — usa las rutas del
 *    carrito (onAddToCart / handleAddItem); sin props, el fallback mantiene
 *    los guards del store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

const STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1'; // Puerto Padre (sandbox de pruebas)

// Catálogo espejo del real de Puerto Padre (36 SKU; fragmento representativo)
const P_CEMENTO_BLANCO = {
  id: '11111111-0000-4000-8000-000000000012', name: 'Cemento Blanco (5kg)', sku: 'PROD-012',
  barcode: '7509251381393', price: 120, cost_price: 90, stock_current: 0, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true,
};
const P_CEMENTO_COLA = {
  id: '11111111-0000-4000-8000-000000000013', name: 'Cemento cola de 25kg', sku: 'PROD-013',
  barcode: '7509251381409', price: 950, cost_price: 700, stock_current: 320, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true,
};
const P_CEMENTO_TUDELA = {
  id: '11111111-0000-4000-8000-000000000036', name: 'Cemento Tudela 25kg P-425', sku: 'PROD-036',
  barcode: null, price: 1100, cost_price: 800, stock_current: 190, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true,
};
const P_ESCOBAS = {
  id: '11111111-0000-4000-8000-000000000030', name: 'Escobas', sku: 'PROD-030',
  barcode: '7509251381997', price: 250, cost_price: 150, stock_current: 75, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true,
};
const P_VARIANTES = {
  id: '11111111-0000-4000-8000-000000000040', name: 'Producto con Caja', sku: 'PROD-040',
  barcode: null, price: 15, cost_price: 10, stock_current: 50, min_stock: 1, store_id: STORE,
  product_variants: [{ id: 'v1', name: 'Caja x10', sku: 'PROD-040-C', price: 140, conversion_factor: 10 }],
  is_service: false, is_active: true,
};
const PRODUCTS = [P_CEMENTO_BLANCO, P_CEMENTO_COLA, P_CEMENTO_TUDELA, P_ESCOBAS, P_VARIANTES];

// Producto «del servidor» (fuera del universo local — p. ej. >500 o barcode maestro)
const P_SERVER = {
  id: '22222222-0000-4000-8000-000000000001', name: 'Producto Remoto Maestro', sku: 'PROD-900',
  barcode: '7509999900000', price: 500, cost_price: 350, stock_current: 10, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true,
};

// Mock hoisted de usePOSCheckout (permite mockReturnValueOnce por test)
const { usePOSCheckoutMock } = vi.hoisted(() => ({ usePOSCheckoutMock: vi.fn() }));

// ── Mocks de borde (documentados) ───────────────────────────────────────────
vi.mock('@/hooks/api/useActiveShift', () => ({
  useActiveShift: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/api/useFrequentProducts', () => ({
  useFrequentProducts: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCheckout', () => ({
  usePOSCheckout: usePOSCheckoutMock,
}));
vi.mock('@/components/views/terminal/views/pos/POSOperationDateSection', () => ({
  POSOperationDateSection: () => null,
  usePosSaleDate: () => ({ validation: { valid: true, error: null } }),
}));
vi.mock('@/components/views/terminal/views/pos/PaymentMethodSelector', () => ({
  PaymentMethodSelector: () => <div data-testid="payment-selector-mock" />,
}));
// Edición de línea: el MISMO modal del carrito — se verifica el wiring (item
// correcto); sus reglas internas (decimales/gate supervisor) se prueban en el
// carrito que es su dueño.
vi.mock('@/components/views/terminal/views/pos/POSCartItemEditModal', () => ({
  POSCartItemEditModal: ({ item }: { item: { product?: { name?: string } } }) => (
    <div data-testid="express-item-edit-modal">editando:{item?.product?.name}</div>
  ),
}));
vi.mock('@/components/views/terminal/views/pos/POSCartSuccessView', () => ({
  POSCartSuccessView: ({
    lastSale,
    onClearLastSale,
  }: {
    lastSale?: { id: string } | null;
    onClearLastSale?: () => void;
  }) => (
    <div data-testid="express-success-view">
      venta:{lastSale?.id}
      <button type="button" onClick={() => onClearLastSale?.()}>nueva-venta</button>
    </div>
  ),
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCartExports', () => ({
  usePOSCartExports: () => ({
    generatePDF: vi.fn(), shareWhatsApp: vi.fn(), exportAsImage: vi.fn(), printReceipt: vi.fn(),
  }),
}));
// PriceSelectorModal del carrito: mock mínimo que dispara la selección de variante
vi.mock('@/components/views/terminal/views/pos/PriceSelectorModal', () => ({
  default: ({
    isOpen,
    product,
    onSelect,
  }: {
    isOpen: boolean;
    product: { name: string } | null;
    onSelect: (variant: { id: string; name: string } | null) => void;
  }) =>
    isOpen && product ? (
      <button type="button" data-testid="express-variant-modal" onClick={() => onSelect({ id: 'v1', name: 'Caja x10' })}>
        variante-de:{product.name}
      </button>
    ) : null,
}));
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, k) => (p: Record<string, unknown>) => React.createElement(String(k), p, p?.children as never) }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  useReducedMotion: () => false,
}));
vi.mock('@/components/ui/ProductImage', () => ({
  default: ({ name }: { name?: string }) => <div data-testid={`img-${name ?? 'sin-nombre'}`} />,
}));

import { useAuthStore } from '@/store';
import { useCartStore } from '@/store/cart';
import { supabase } from '@/lib/supabaseClient';
import { POSExpressMode } from '@/components/views/terminal/views/pos/POSExpressMode';

function renderExpress(props: Partial<Parameters<typeof POSExpressMode>[0]> = {}) {
  const onAddToCart = vi.fn();
  const onAddItemWithVariant = vi.fn();
  const utils = render(
    <POSExpressMode
      products={PRODUCTS}
      onExit={() => {}}
      onAddToCart={props.onAddToCart ?? onAddToCart}
      onAddItemWithVariant={props.onAddItemWithVariant ?? onAddItemWithVariant}
      hideOutOfStock={props.hideOutOfStock ?? false}
      {...props}
    />,
  );
  // Express usa createPortal(document.body): el DOM real está FUERA del
  // container de RTL — se consulta document.body.
  const input = document.body.querySelector('#pos-express-search-input') as HTMLInputElement;
  const submit = () => fireEvent.submit(input.closest('form')!);
  return { ...utils, input, submit, onAddToCart, onAddItemWithVariant };
}

async function clearStoreState() {
  useCartStore.setState({ items: [], storeId: STORE, lastUpdated: Date.now() });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  usePOSCheckoutMock.mockReturnValue(
    {
      startCheckout: vi.fn(), confirmUnpricedCheckout: vi.fn(), processCheckout: vi.fn(),
      isProcessingSale: false, showPriceWarning: false, setShowPriceWarning: vi.fn(),
      showRateWarning: false, rateWarningData: null, confirmRateWarning: vi.fn(),
      cancelRateWarning: vi.fn(), updateRateFromModal: vi.fn(), lastSale: null, setLastSale: vi.fn(),
    } as never,
  );
  useAuthStore.setState({
    user: { id: 'u1', email: 'express@test.local', role: 'admin', activeStoreId: STORE } as never,
    status: 'authenticated_valid',
    loading: false,
  });
  return clearStoreState();
});
describe('MISIÓN VENDER-EXPRESS — Caso A: producto existente (bug reportado)', () => {
  it('SKU exacto + Enter agrega el producto (delega en la ruta del carrito)', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'PROD-013' } });
    submit();
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_CEMENTO_COLA.id);
    expect(input.value).toBe(''); // se limpia tras agregar
  });

  it('SKU es case-insensitive', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'prod-030' } });
    submit();
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_ESCOBAS.id);
  });

  it('código de barras + Enter agrega el producto', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: '7509251381997' } });
    submit();
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_ESCOBAS.id);
  });

  it('nombre completo + Enter agrega el producto', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'Cemento cola de 25kg' } });
    submit();
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_CEMENTO_COLA.id);
  });

  it('FRAGMENTO único de nombre + Enter agrega (causa raíz del bug: antes «no coincide exactamente»)', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'cola de' } });
    submit();
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_CEMENTO_COLA.id);
  });

  it('mayúsculas y minúsculas no afectan la búsqueda por nombre', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'ESCOBAS' } });
    submit();
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_ESCOBAS.id);
  });

  it('espacios adicionales se recortan', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: '  PROD-030  ' } });
    submit();
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_ESCOBAS.id);
  });

  it('FRAGMENTO ambiguo + Enter muestra la lista de resultados (antes: error «no coincide exactamente»)', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'Cemento' } });
    submit();
    // No agrega nada solo — presenta las 3 coincidencias para elegir
    expect(onAddToCart).not.toHaveBeenCalled();
    const manualList = screen.getByRole('listbox', { name: /resultados de búsqueda express/i });
    expect(within(manualList).getByText('Cemento Blanco (5kg)')).toBeInTheDocument();
    expect(within(manualList).getByText('Cemento cola de 25kg')).toBeInTheDocument();
    expect(within(manualList).getByText('Cemento Tudela 25kg P-425')).toBeInTheDocument();
    // Elegir de la lista agrega
    fireEvent.click(within(manualList).getByText('Cemento cola de 25kg'));
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_CEMENTO_COLA.id);
  });

  it('SKU prefix «PROD-0*» agrega el primer SKU que empiece con el prefijo', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'PROD-0*' } });
    submit();
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].sku).toBe('PROD-012');
  });

  it('FRAGMENTO de código de barras único agrega (mismo criterio includes que el carrito)', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: '750925138140' } }); // fragmento del barcode de Cemento cola
    submit();
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_CEMENTO_COLA.id);
  });

  it('FRAGMENTO de SKU con múltiples coincidencias muestra la lista (mismo criterio includes que el carrito)', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'PROD-0' } }); // 5 SKUs contienen PROD-0
    submit();
    expect(onAddToCart).not.toHaveBeenCalled();
    const manualList = screen.getByRole('listbox', { name: /resultados de búsqueda express/i });
    expect(within(manualList).getAllByRole('option').length).toBeGreaterThan(1);
  });
});

describe('MISIÓN VENDER-EXPRESS — Caso B: resultados comparables con el carrito', () => {
  it('autocompletado EN VIVO (mismo POSAutocomplete del carrito) muestra sugerencias al escribir', () => {
    renderExpress();
    const input = screen.getByLabelText('Búsqueda Express') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cola' } });
    const dropdown = screen.getByRole('listbox', { name: /sugerencias de productos/i });
    expect(dropdown).toBeInTheDocument();
    expect(within(dropdown).getByRole('option')).toHaveTextContent('Cemento cola de 25kg');
  });

  it('seleccionar del autocompletado agrega y limpia el texto (mismo comportamiento que el carrito)', () => {
    const onAddToCart = vi.fn();
    renderExpress({ onAddToCart });
    const input = screen.getByLabelText('Búsqueda Express') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cola' } });
    const dropdown = screen.getByRole('listbox', { name: /sugerencias de productos/i });
    fireEvent.click(within(dropdown).getByRole('option'));
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_CEMENTO_COLA.id);
    expect(input.value).toBe('');
  });

  it('producto con SKU que no existe muestra error y no agrega nada', () => {
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: 'PROD-999' } });
    submit();
    expect(onAddToCart).not.toHaveBeenCalled();
  });
});

describe('MISIÓN VENDER-EXPRESS — Caso C: cantidades', () => {
  it('botón + incrementa la cantidad vía el store del carrito (fallback real)', () => {
    const { input, submit } = renderExpress({ onAddToCart: undefined });
    fireEvent.change(input, { target: { value: 'PROD-013' } });
    submit();
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('clic en la cantidad abre el MISMO editor de línea del carrito (decimales/precio/descuento)', () => {
    const { input, submit } = renderExpress({ onAddToCart: undefined });
    fireEvent.change(input, { target: { value: 'PROD-030' } });
    submit();
    fireEvent.click(screen.getByRole('button', { name: /editar cantidad decimal/i }));
    expect(screen.getByTestId('express-item-edit-modal')).toHaveTextContent('editando:Escobas');
  });
});

describe('MISIÓN VENDER-EXPRESS — Caso E: existencias', () => {
  it('producto agotado se rechaza por el store en la ruta fallback (mismo guard que el carrito)', () => {
    const { input, submit } = renderExpress({ onAddToCart: undefined });
    fireEvent.change(input, { target: { value: 'PROD-012' } }); // stock 0
    submit();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('producto agotado muestra badge «Sin stock» en los resultados de la lista', () => {
    const { input, submit } = renderExpress();
    fireEvent.change(input, { target: { value: 'Cemento' } });
    submit();
    expect(screen.getAllByText('Sin stock').length).toBeGreaterThan(0);
  });
});

describe('MISIÓN VENDER-EXPRESS — Caso G: confirmación de venta', () => {
  it('Cobrar → Confirmar delega en startCheckout (mismo flujo autorizado del carrito)', async () => {
    // mockReturnValue ESTABLE (no Once): el hook se llama en cada render y la
    // closure de handleConfirmSale debe capturar SIEMPRE el mismo spy.
    const startCheckout = vi.fn();
    usePOSCheckoutMock.mockReturnValue({ startCheckout, isProcessingSale: false } as never);
    const { input, submit } = renderExpress({ onAddToCart: undefined });
    fireEvent.change(input, { target: { value: 'PROD-030' } });
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar venta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(startCheckout).toHaveBeenCalledTimes(1);
  });
});

describe('MISIÓN VENDER-EXPRESS — Caso H: catálogo maestro / fallback server-side', () => {
  it('sin coincidencias locales consulta el MISMO RPC autorizado y muestra el producto del servidor', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [P_SERVER], error: null } as never);
    const { input, submit, onAddToCart } = renderExpress();
    fireEvent.change(input, { target: { value: '7509999900000' } }); // barcode solo en el servidor
    submit();
    await waitFor(() => {
      const manualList = screen.getByRole('listbox', { name: /resultados de búsqueda express/i });
      expect(within(manualList).getByText('Producto Remoto Maestro')).toBeInTheDocument();
    });
    expect(supabase.rpc).toHaveBeenCalledWith('get_products_for_pos', {
      p_store_id: STORE,
      p_search_term: '7509999900000',
    });
    const manualList2 = screen.getByRole('listbox', { name: /resultados de búsqueda express/i });
    fireEvent.click(within(manualList2).getByText('Producto Remoto Maestro'));
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart.mock.calls[0][0].id).toBe(P_SERVER.id);
  });

  it('los resultados obsoletos se descartan: cambiar el texto invalida la búsqueda en vuelo', async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    vi.mocked(supabase.rpc).mockImplementationOnce(
      () => new Promise((res) => { resolveRpc = res; }) as never,
    );
    const { input, submit } = renderExpress();
    fireEvent.change(input, { target: { value: '7509999900000' } });
    submit();
    // El usuario sigue escribiendo antes de que responda el servidor
    fireEvent.change(input, { target: { value: '75099999000000' } });
    resolveRpc({ data: [P_SERVER], error: null });
    await waitFor(() =>
      expect(screen.queryByRole('listbox', { name: /resultados de búsqueda express/i })).not.toBeInTheDocument(),
    );
  });
});

describe('MISIÓN VENDER-EXPRESS — variantes, descuento y éxito (paridad con el carrito)', () => {
  it('producto con variantes abre el PriceSelectorModal y delega en handleAddItem', () => {
    const { input, submit, onAddToCart, onAddItemWithVariant } = renderExpress();
    fireEvent.change(input, { target: { value: 'PROD-040' } });
    submit();
    expect(onAddToCart).not.toHaveBeenCalled(); // intercepta antes de la ruta simple
    fireEvent.click(screen.getByTestId('express-variant-modal'));
    expect(onAddItemWithVariant).toHaveBeenCalledTimes(1);
    expect(onAddItemWithVariant.mock.calls[0][0].id).toBe(P_VARIANTES.id);
    expect(onAddItemWithVariant.mock.calls[0][1]).toEqual({ id: 'v1', name: 'Caja x10' });
  });

  it('descuento global: abre el MISMO POSCartDiscountModal del carrito', () => {
    const { input, submit } = renderExpress({ onAddToCart: undefined });
    fireEvent.change(input, { target: { value: 'PROD-030' } });
    submit();
    fireEvent.click(screen.getByRole('button', { name: /descuento de la venta/i }));
    expect(screen.getByLabelText('Valor del descuento')).toBeInTheDocument();
  });

  it('lastSale renderiza la MISMA vista de éxito del carrito con su handler', () => {
    renderExpress({
      lastSale: {
        id: 'sale-123', date: new Date().toISOString(), items: [], subtotal: 100,
        discount: null, total: 100, paymentMethod: 'cash',
      } as never,
      onClearLastSale: () => {},
    });
    expect(screen.getByTestId('express-success-view')).toHaveTextContent('venta:sale-123');
    fireEvent.click(screen.getByText('nueva-venta')); // no explota con handler
  });
});
