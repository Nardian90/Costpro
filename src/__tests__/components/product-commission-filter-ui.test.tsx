/**
 * product-commission-filter-ui.test.tsx — CP-PRODUCT-COMMISSION-001 TAREA 3.
 *
 * Prueba de UI del filtro «Comisión» en Reglas de comisión → Por producto
 * (ProductCommissionCatalog, WorkersView): opciones Todos / >0 / =0 / Sin
 * configurar, contadores en vivo sobre el conjunto COMPLETO (el catálogo
 * carga todos los productos de la tienda), combinación con búsqueda/categoría
 * sin reseteo, y botón «Limpiar filtros».
 *
 * La fuente del valor es la MISMA que edita el catálogo y que consume el
 * motor: `/api/commissions/rules` (product_specific + product_configs con
 * fallback a product_commission_amount) — mock de apiFetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ProductCommissionCatalog } from '@/components/views/terminal/views/workers/WorkersView';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/lib/api-fetch', () => ({ apiFetch: mocks.apiFetch }));

vi.mock('@/store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/store')>();
  return {
    ...mod,
    useUIStore: (sel?: (s: unknown) => unknown) =>
      sel ? sel({ activeStoreId: 'st-1' }) : { activeStoreId: 'st-1' },
    useAuthStore: (sel?: (s: unknown) => unknown) =>
      sel ? sel({ user: { id: 'u-1', activeStoreId: 'st-1' } }) : { user: { id: 'u-1', activeStoreId: 'st-1' } },
  };
});

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PRODUCTS = [
  { id: 'p-pos', name: 'Detergente', sku: 'DET-1', price: 100, price_currency: 'CUP', category: 'Limpieza', stock_current: 5, is_active: true },
  { id: 'p-cero', name: 'Servicio corte', sku: 'COR-1', price: 80, price_currency: 'CUP', category: 'Servicios', stock_current: 0, is_active: true },
  { id: 'p-sin', name: 'Repuesto', sku: 'REP-1', price: 300, price_currency: 'CUP', category: 'Repuestos', stock_current: 2, is_active: true },
];

const RULES = {
  rules: [
    {
      id: 'r-1', store_id: 'st-1', worker_id: null, type: 'product_specific',
      product_commission_amount: null, product_commission_mode: 'per_sale',
      products: [{ id: 'p-pos' }, { id: 'p-cero' }],
      product_configs: { 'p-pos': { amount: 5, mode: 'per_sale' }, 'p-cero': { amount: 0, mode: 'per_sale' } },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path.includes('/api/inventory/products')) return { products: PRODUCTS };
    if (path.includes('/api/store-rates')) return { rates: {} };
    if (path.includes('/api/commissions/rules')) return RULES;
    return {};
  });
});

const counter = () => screen.getByText(/producto\(s\)/).textContent;

describe('TAREA 3 · UI del filtro «Comisión» en Reglas por producto', () => {

  it('§6.C.19 · «Todas» presenta la totalidad del ámbito (contadores en vivo)', async () => {
    const user = userEvent.setup();
    render(<ProductCommissionCatalog storeId="st-1" onRefresh={() => {}} />);
    await vi.waitFor(() => expect(counter()).toContain('3'));
    expect((screen.getByLabelText('Filtro por comisión') as HTMLSelectElement).value).toBe('all');
    await user.selectOptions(screen.getByLabelText('Filtro por comisión'), 'all');
    expect(counter()).toContain('3');
  });

  it('§6.C.20 · >0 muestra exclusivamente comisiones positivas (excluye cero y sin regla)', async () => {
    const user = userEvent.setup();
    render(<ProductCommissionCatalog storeId="st-1" onRefresh={() => {}} />);
    await vi.waitFor(() => expect(counter()).toContain('3'));
    await user.selectOptions(screen.getByLabelText('Filtro por comisión'), 'gt0');
    expect(counter()).toContain('1');
    expect(screen.getAllByText('Detergente').length).toBeGreaterThan(0);
    expect(screen.queryByText('Servicio corte')).toBeNull();
    expect(screen.queryByText('Repuesto')).toBeNull();
  });

  it('§6.C.21 · =0 muestra solo la comisión CERO configurada (no las sin regla)', async () => {
    const user = userEvent.setup();
    render(<ProductCommissionCatalog storeId="st-1" onRefresh={() => {}} />);
    await vi.waitFor(() => expect(counter()).toContain('3'));
    await user.selectOptions(screen.getByLabelText('Filtro por comisión'), 'eq0');
    expect(counter()).toContain('1');
    expect(screen.getAllByText('Servicio corte').length).toBeGreaterThan(0);
  });

  it('§6.C.22 · «Sin comisión configurada» identifica los productos sin regla (NULL ≠ cero)', async () => {
    const user = userEvent.setup();
    render(<ProductCommissionCatalog storeId="st-1" onRefresh={() => {}} />);
    await vi.waitFor(() => expect(counter()).toContain('3'));
    await user.selectOptions(screen.getByLabelText('Filtro por comisión'), 'unset');
    expect(counter()).toContain('1');
    expect(screen.getAllByText('Repuesto').length).toBeGreaterThan(0);
  });

  it('§6.C.23 · se combina con la búsqueda SIN resetearla; §6.C.26 · limpiar recupera todo', async () => {
    const user = userEvent.setup();
    render(<ProductCommissionCatalog storeId="st-1" onRefresh={() => {}} />);
    await vi.waitFor(() => expect(counter()).toContain('3'));
    // Combinación: búsqueda «de» (Detergente, Repuesto) + comisión >0
    await user.type(screen.getByPlaceholderText('Buscar por nombre o SKU...'), 'de');
    expect(counter()).toContain('1'); // solo Detergente matchea «de»
    await user.selectOptions(screen.getByLabelText('Filtro por comisión'), 'gt0');
    expect(counter()).toContain('1'); // solo Detergente (comisión 5)
    expect(screen.getAllByText('Detergente').length).toBeGreaterThan(0);
    expect(screen.queryByText('Repuesto')).toBeNull();
    // La búsqueda sigue aplicada (no se reseteó al cambiar el filtro):
    expect((screen.getByPlaceholderText('Buscar por nombre o SKU...') as HTMLInputElement).value).toBe('de');
    // §6.C.26: limpiar filtros recupera el listado general
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(counter()).toContain('3');
    expect((screen.getByPlaceholderText('Buscar por nombre o SKU...') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Filtro por comisión') as HTMLSelectElement).value).toBe('all');
  });

  it('el valor del filtro proviene de la MISMA fuente que edita el catálogo (product_configs con fallback)', async () => {
    const user = userEvent.setup();
    // Regla SIN overrides (fallback al product_commission_amount de la regla)
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path.includes('/api/inventory/products')) return { products: PRODUCTS };
      if (path.includes('/api/store-rates')) return { rates: {} };
      if (path.includes('/api/commissions/rules')) return {
        rules: [{
          id: 'r-2', store_id: 'st-1', worker_id: null, type: 'product_specific',
          product_commission_amount: 7, product_commission_mode: 'per_sale',
          products: [{ id: 'p-pos' }],
        }],
      };
      return {};
    });
    render(<ProductCommissionCatalog storeId="st-1" onRefresh={() => {}} />);
    await vi.waitFor(() => expect(counter()).toContain('3'));
    await user.selectOptions(screen.getByLabelText('Filtro por comisión'), 'gt0');
    // p-pos hereda 7 (fallback) → >0; p-cero/p-sin sin regla → fuera
    expect(counter()).toContain('1');
    expect(screen.getAllByText('Detergente').length).toBeGreaterThan(0);
  });
});
