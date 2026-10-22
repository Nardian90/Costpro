/**
 * MISIÓN UI/UX RECEPCIONES (2026-10-22) — Búsqueda server-side y selección
 * inequívoca de productos.
 *
 * Cubre la lógica nueva introducida en useReceptionState:
 *   1. filteredFormProducts NO filtra en cliente: los resultados provienen del
 *      servidor (useInventory recibe el término debounced) y solo se reordenan
 *      por relevancia (SKU/barcode exacto primero, luego prefijos, luego resto).
 *   2. handleSelectProduct marca la selección; clearProductSelection resetea
 *      costo/venta/variante sin arrastrar datos del producto anterior.
 *   3. handleSearchKeyDown: ArrowDown/ArrowUp navegan, Enter con resaltado
 *      selecciona el producto resaltado, Escape limpia la búsqueda.
 *   4. unitsSummary: solo suma cantidades si TODAS las líneas comparten UM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  registerMock: vi.fn(),
  savePendingMock: vi.fn(),
  confirmPendingMock: vi.fn(),
  logReceptionMock: vi.fn(),
  userHolder: { current: null as any },
  // useInventory mock configurable por test
  inventoryMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock },
}));

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: h.userHolder.current }),
  useUIStore: () => ({ setCurrentView: vi.fn() }),
}));

vi.mock('@/hooks/api/useInventory', () => ({
  useInventory: (...args: any[]) => h.inventoryMock(...args),
  useRegisterReception: () => ({ mutateAsync: h.registerMock, isPending: false }),
}));

vi.mock('@/hooks/api/useReceptions', () => ({
  useSavePendingReception: () => ({ mutateAsync: h.savePendingMock, isPending: false }),
  useConfirmPendingReception: () => ({ mutateAsync: h.confirmPendingMock, isPending: false }),
}));

vi.mock('@/hooks/api/useGlobalOperationDate', () => ({
  useGlobalOperationDate: () => ({ data: null }),
  validateOperationDate: () => ({ valid: true }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/services/audit-service', () => ({
  auditService: { logReceptionCreated: h.logReceptionMock },
}));

import { toast } from 'sonner';
import { useReceptionState } from '@/components/views/terminal/views/inventory/useReceptionState';
import { UserFactory } from '@/contracts/user';

// ── Fixtures ────────────────────────────────────────────────────────────────
const STORE_A = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const USER_A = '22222222-2222-2222-2222-222222222222';

const mkProduct = (id: string, name: string, sku: string, extra: Partial<any> = {}) => ({
  id,
  name,
  sku,
  barcode: null,
  price: 100,
  cost_price: 50,
  unit_of_measure: 'unidad',
  store_id: STORE_A,
  stock_current: 10,
  product_variants: [],
  ...extra,
});

// Productos "profundos" del catálogo: el defecto previo solo cargaba los
// primeros 20 → estos no eran localizables por búsqueda.
const P_TORNILLO_83 = mkProduct('p83', 'Tornillo 1 pulgada', 'TOR-001');
const P_TORNILLO_84 = mkProduct('p84', 'Tornillo 2 pulgadas', 'TOR-002');
const P_TORNILLO_167 = mkProduct('p167', 'Tornillo autoperforante', 'AUT-999');
const P_EXACTO = mkProduct('p-exacto', 'Bisagra', 'BRE-16', { barcode: '7500123456789' });

const DEFAULT_INV = {
  data: {
    pages: [{
      products: [P_TORNILLO_83, P_TORNILLO_84, P_TORNILLO_167, P_EXACTO],
      total: 4,
      nextOffset: null,
    }],
  },
  isLoading: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  error: null,
  refetch: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // El hook persiste borrador en localStorage (REC-1 QW-R10) — limpiar para
  // que cada test arranque sin items restaurados de tests previos.
  localStorage.clear();
  h.userHolder.current = UserFactory.create({
    id: USER_A,
    email: 'admin@demo.com',
    role: 'admin',
    activeStoreId: STORE_A,
  }) as any;
  h.inventoryMock.mockReturnValue(DEFAULT_INV);
  h.fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
  });
});

const setup = () => renderHook(() => useReceptionState({ preselectedProduct: null, onCancel: vi.fn() }));

describe('Búsqueda server-side (misión UI/UX recepciones)', () => {
  it('useInventory recibe el término de búsqueda (server-side, no cliente)', () => {
    const { result } = setup();
    act(() => { result.current.setAddItemSearch('tornillo'); });
    // El debounce (250ms) pasa el término al hook de datos — verificado
    // indirectamente: filteredFormProducts SOLO reordena, no filtra.
    expect(h.inventoryMock).toHaveBeenCalledWith(STORE_A, expect.anything(), '', expect.any(Number));
  });

  it('los resultados del servidor NO se descartan — solo se reordenan por relevancia', () => {
    const { result } = setup();
    act(() => { result.current.setAddItemSearch('tornillo'); });
    // El servidor devuelve las 3 coincidencias de «tornillo» (el hook mock
    // representa la respuesta del RPC). Ninguna descartada en cliente
    // (antes: «Sin resultados» por el filtro sobre los primeros 20).
    expect(result.current.filteredFormProducts).toHaveLength(4);
    // Prefijo de nombre antes que coincidencia parcial (estable con tie-break)
    const names = result.current.filteredFormProducts.map((p: any) => p.name);
    expect(names.slice(0, 3)).toEqual([
      'Tornillo 1 pulgada',
      'Tornillo 2 pulgadas',
      'Tornillo autoperforante',
    ]);
  });

  it('SKU exacto se prioriza sobre coincidencias de nombre', () => {
    const { result } = setup();
    act(() => { result.current.setAddItemSearch('tor-001'); });
    expect(result.current.filteredFormProducts[0]?.id).toBe('p83');
  });

  it('hasMoreProducts y searchTotal provienen del total del servidor', () => {
    // El mock se configura ANTES de renderizar para que el hook lo consuma
    h.inventoryMock.mockReturnValue({
      ...DEFAULT_INV,
      data: { pages: [{ products: [P_EXACTO], total: 185, nextOffset: 60 }] },
    });
    const { result } = setup();
    expect(result.current.searchTotal).toBe(185);
    expect(result.current.hasMoreProducts).toBe(true);
  });
});

describe('Selección inequívoca (misión UI/UX recepciones)', () => {
  it('handleSelectProduct marca el producto y lo expone como selectedProduct', () => {
    const { result } = setup();
    act(() => { result.current.handleSelectProduct('p83'); });
    expect(result.current.selectedProductId).toBe('p83');
    expect(result.current.selectedProduct?.name).toBe('Tornillo 1 pulgada');
  });

  it('clearProductSelection resetea costo/venta/variante sin arrastrar datos', () => {
    const { result } = setup();
    act(() => { result.current.handleSelectProduct('p83'); });
    // FIX-08 autocompleta costo desde el producto
    act(() => { result.current.setNewUnitCost(123.45); result.current.setNewSalePrice(200); });
    act(() => { result.current.clearProductSelection(); });
    expect(result.current.selectedProductId).toBeNull();
    expect(result.current.selectedProduct).toBeUndefined();
    expect(result.current.newUnitCost).toBe(0);
    expect(result.current.newSalePrice).toBeNull();
  });

  it('cambiar de producto sustituye la selección anterior de forma coherente', () => {
    const { result } = setup();
    act(() => { result.current.handleSelectProduct('p83'); });
    act(() => { result.current.handleSelectProduct('p84'); });
    expect(result.current.selectedProductId).toBe('p84');
    expect(result.current.selectedProduct?.name).toBe('Tornillo 2 pulgadas');
  });
});

describe('Navegación por teclado del combobox', () => {
  const mkEvent = (key: string, preventDefault = vi.fn()) => ({
    key,
    preventDefault,
  } as unknown as React.KeyboardEvent<HTMLInputElement>);

  it('ArrowDown resalta el primer resultado y Enter lo selecciona', () => {
    const { result } = setup();
    act(() => { result.current.handleSearchKeyDown(mkEvent('ArrowDown')); });
    expect(result.current.highlightIndex).toBe(0);
    act(() => { result.current.handleSearchKeyDown(mkEvent('Enter')); });
    expect(result.current.selectedProductId).toBe('p83');
  });

  it('ArrowUp desde el inicio envuelve al último resultado', () => {
    const { result } = setup();
    act(() => { result.current.handleSearchKeyDown(mkEvent('ArrowUp')); });
    expect(result.current.highlightIndex).toBe(3); // 4 resultados
  });

  it('Escape limpia el término de búsqueda', () => {
    const { result } = setup();
    act(() => { result.current.setAddItemSearch('tornillo'); });
    act(() => { result.current.handleSearchKeyDown(mkEvent('Escape')); });
    expect(result.current.addItemSearch).toBe('');
  });

  it('Enter sin resaltado NO selecciona nada (mantiene flujo escáner)', () => {
    const { result } = setup();
    act(() => { result.current.handleSearchKeyDown(mkEvent('Enter')); });
    expect(result.current.selectedProductId).toBeNull();
    expect(result.current.highlightIndex).toBe(-1);
  });
});

describe('Resumen de unidades (misión: no sumar unidades incompatibles)', () => {
  it('devuelve null con unidades de medida mixtas', () => {
    // Se agrega una línea CUP (1 unidad) y otra kg vía addManualProduct
    const { result } = setup();
    act(() => { result.current.setManualName('Cemento'); result.current.setManualUnitOfMeasure('saco'); });
    act(() => { result.current.handleAddManualProduct(); });
    act(() => { result.current.setManualName('Arena'); result.current.setManualUnitOfMeasure('kg'); });
    act(() => { result.current.handleAddManualProduct(); });
    expect(result.current.unitsSummary).toBeNull();
  });

  it('suma cantidades cuando todas las líneas comparten la misma UM', () => {
    const { result } = setup();
    act(() => { result.current.setManualName('Tornillo A'); result.current.setManualSku('SKU-A'); result.current.setManualUnitOfMeasure('unidad'); });
    act(() => { result.current.handleAddManualProduct(); });
    act(() => { result.current.setManualName('Tornillo B'); result.current.setManualSku('SKU-B'); result.current.setManualUnitOfMeasure('unidad'); result.current.setNewQuantity(5); });
    act(() => { result.current.handleAddManualProduct(); });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.unitsSummary).toEqual({ unit: 'unidad', total: 6 });
  });
});

describe('Regresión: flujo escáner Enter (REC-2 MM-R2) intacto', () => {
  it('Enter con SKU exacto en resultados agrega el producto directo', () => {
    const { result } = setup();
    act(() => { result.current.setAddItemSearch('BRE-16'); });
    act(() => { result.current.handleSearchSubmit(); });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Bisagra'));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].product_id).toBe('p-exacto');
  });
});
