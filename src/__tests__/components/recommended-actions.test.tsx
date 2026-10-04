/**
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — tests de
 * RecommendedActions + integración con RecentActivityPanel (FASE 12-15).
 *
 * Cobertura:
 *   - Perfiles por rol: admin / manager-encargado / ventas (usuario, clerk) /
 *     almacén (warehouse) / costo (FASE 13).
 *   - Permisos: nunca se muestra una acción que el rol no puede ejecutar
 *     (guard canónico isViewAllowedForRole + listas de roles canónicas).
 *   - Contexto real: stock bajo, carrito pendiente, turno de caja (FASE 14).
 *   - RecentActivityPanel: sin entradas → recomendaciones; con entradas →
 *     recientes reales intactas (FASE 15).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { create } from 'zustand';

// ─── MOCK: store de autenticación/UI (zustand real con selectores) ──────────
const setCurrentViewMock = vi.fn();
type MockUser = {
  id: string;
  role: string;
  roles?: string[];
  activeStoreId: string;
  memberships?: { role: string; status: string }[];
};

let mockUser: MockUser = {
  id: 'user-a',
  role: 'admin',
  activeStoreId: 'store-1',
};

vi.mock('@/store', () => {
  const useUIStore = create(() => ({
    currentView: 'dashboard',
    setCurrentView: (...args: unknown[]) => setCurrentViewMock(...(args as [unknown])),
  }));
  const useAuthStore = create(() => ({
    get user() {
      return mockUser;
    },
  }));
  return { useUIStore, useAuthStore };
});

// ─── MOCK: carrito (Zustand — sin consultas) ─────────────────────────────────
vi.mock('@/store/cart', () => {
  const useCartStore = create(() => ({
    items: [] as unknown[],
    storeId: 'store-1' as string | null,
  }));
  return { useCartStore };
});

// ─── MOCK: hooks de datos ────────────────────────────────────────────────────
let mockProducts: any[] | undefined = [];
vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: mockProducts, isLoading: false }),
}));

let mockActiveShift: unknown = null;
let mockActiveShiftEnabled = true;
vi.mock('@/hooks/api/useActiveShift', () => ({
  useActiveShift: (_storeId: unknown, options?: { enabled?: boolean }) => {
    mockActiveShiftEnabled = options?.enabled ?? true;
    return { data: mockActiveShift, isLoading: false };
  },
}));

import RecommendedActions from '@/components/views/terminal/views/dashboard/RecommendedActions';
import RecentActivityPanel from '@/components/views/terminal/views/dashboard/RecentActivityPanel';
import { useCartStore } from '@/store/cart';
import { recordDarianAction } from '@/lib/darian/recent-actions';

const PRODUCT_OK = { id: 'p1', stock_current: 10, min_stock: 2 };

beforeEach(() => {
  localStorage.clear();
  setCurrentViewMock.mockClear();
  mockUser = { id: 'user-a', role: 'admin', activeStoreId: 'store-1' };
  mockProducts = [PRODUCT_OK];
  mockActiveShift = null;
  mockActiveShiftEnabled = true;
});

afterEach(() => {
  cleanup();
});

describe('RecommendedActions — perfiles por rol (FASE 13)', () => {
  it('admin: reportes, cuentas por cobrar, inventario y usuarios', () => {
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-sales-report')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-receivables')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-inventory')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-users')).toBeInTheDocument();
    // El admin no ve acciones de punto de venta como recomendación base
    expect(screen.queryByTestId('recommended-action-new-sale')).not.toBeInTheDocument();
  });

  it('manager (rol encargado): inventario, ventas, entrada y caja — SIN gestión de usuarios', () => {
    mockUser = { id: 'u2', role: 'encargado', activeStoreId: 'store-1' };
    mockActiveShift = { id: 'shift-1', status: 'pendiente' }; // turno abierto ⇒ acción base de caja
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-inventory')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-sales')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-reception')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-cash')).toBeInTheDocument();
    // Guard canónico: users pertenece a SISTEMA (roles: ['admin'])
    expect(screen.queryByTestId('recommended-action-users')).not.toBeInTheDocument();
  });

  it('manager (rol global manager): mismo perfil', () => {
    mockUser = { id: 'u3', role: 'manager', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-sales')).toBeInTheDocument();
    expect(screen.queryByTestId('recommended-action-users')).not.toBeInTheDocument();
  });

  it('usuario de ventas (usuario): nueva venta, historial, devoluciones, caja', () => {
    mockUser = { id: 'u4', role: 'usuario', activeStoreId: 'store-1' };
    mockActiveShift = { id: 'shift-1', status: 'pendiente' }; // turno abierto ⇒ acción base de caja
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-new-sale')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-sales-history')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-devolutions')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-cash')).toBeInTheDocument();
    // Permisos: el vendedor no gestiona usuarios ni reportes de admin
    expect(screen.queryByTestId('recommended-action-users')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommended-action-sales-report')).not.toBeInTheDocument();
  });

  it('clerk comparte el perfil de ventas', () => {
    mockUser = { id: 'u5', role: 'clerk', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-new-sale')).toBeInTheDocument();
  });

  it('almacén (warehouse): stock, conteo y entrada — sin acciones de venta', () => {
    mockUser = { id: 'u6', role: 'warehouse', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-stock-current')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-count')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-reception')).toBeInTheDocument();
    expect(screen.queryByTestId('recommended-action-new-sale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommended-action-users')).not.toBeInTheDocument();
  });

  it('rol costo: hojas de costo y estructura', () => {
    mockUser = { id: 'u7', role: 'costo', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(screen.getByTestId('recommended-action-cost-sheets')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-action-cost-structure')).toBeInTheDocument();
    // Permisos: reports requiere admin/manager
    expect(screen.queryByTestId('recommended-action-sales-report')).not.toBeInTheDocument();
  });

  it('máximo 4 recomendaciones visibles', () => {
    mockUser = { id: 'u8', role: 'admin', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(screen.getAllByTestId(/^recommended-action-/)).toHaveLength(4);
  });
});

describe('RecommendedActions — contexto real (FASE 14)', () => {
  it('productos bajo mínimo → "Revisar stock bajo" con conteo, prioridad máxima', () => {
    mockUser = { id: 'u9', role: 'admin', activeStoreId: 'store-1' };
    mockProducts = [
      PRODUCT_OK,
      { id: 'p2', stock_current: 0, min_stock: 5 },
      { id: 'p3', stock_current: 2, min_stock: 2 },
    ];
    render(<RecommendedActions />);
    const low = screen.getByTestId('recommended-action-low-stock');
    expect(low).toBeInTheDocument();
    expect(low.textContent).toContain('2 productos requieren atención');
    // Dedupe: el destino inventory no se repite
    expect(screen.queryByTestId('recommended-action-inventory')).not.toBeInTheDocument();
  });

  it('turno de caja cerrado (ventas) → "Revisar caja" con razón, y SOLO consulta para roles con caja', () => {
    mockUser = { id: 'u10', role: 'usuario', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(mockActiveShiftEnabled).toBe(true);
    const shift = screen.getByTestId('recommended-action-open-shift');
    expect(shift.textContent).toContain('No hay turno de caja abierto');
  });

  it('turno abierto (ventas) → no aparece la recomendación de abrir turno', () => {
    mockUser = { id: 'u11', role: 'usuario', activeStoreId: 'store-1' };
    mockActiveShift = { id: 'shift-1', status: 'pendiente' };
    render(<RecommendedActions />);
    expect(screen.queryByTestId('recommended-action-open-shift')).not.toBeInTheDocument();
    // Caja sigue disponible como acción base del perfil ventas
    expect(screen.getByTestId('recommended-action-cash')).toBeInTheDocument();
  });

  it('almacén no consulta el turno de caja (FASE 20 — consultas justificadas)', () => {
    mockUser = { id: 'u12', role: 'warehouse', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    expect(mockActiveShiftEnabled).toBe(false);
  });

  it('carrito pendiente → "Retomar venta en curso"', () => {
    mockUser = { id: 'u13', role: 'usuario', activeStoreId: 'store-1' };
    useCartStore.setState({ items: [{ id: 'i1' }, { id: 'i2' }], storeId: 'store-1' } as any);
    render(<RecommendedActions />);
    const cart = screen.getByTestId('recommended-action-cart-pending');
    expect(cart.textContent).toContain('2 artículos en el carrito');
    // Dedupe: nueva venta no se duplica (mismo destino pos)
    expect(screen.queryByTestId('recommended-action-new-sale')).not.toBeInTheDocument();
  });

  it('carrito de OTRA tienda activa no dispara la recomendación', () => {
    mockUser = { id: 'u14', role: 'usuario', activeStoreId: 'store-1' };
    useCartStore.setState({ items: [{ id: 'i1' }], storeId: 'store-otra' } as any);
    render(<RecommendedActions />);
    expect(screen.queryByTestId('recommended-action-cart-pending')).not.toBeInTheDocument();
  });

  it('cada recomendación navega a su vista canónica', () => {
    mockUser = { id: 'u15', role: 'admin', activeStoreId: 'store-1' };
    render(<RecommendedActions />);
    fireEvent.click(screen.getByTestId('recommended-action-sales-report'));
    expect(setCurrentViewMock).toHaveBeenCalledWith('reports');
  });
});

describe('RecentActivityPanel ↔ RecommendedActions (FASE 12/15)', () => {
  it('sin acciones recientes → Acciones recomendadas (nunca espacio vacío)', () => {
    render(<RecentActivityPanel />);
    expect(screen.getByTestId('recent-activity-empty')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-actions-list')).toBeInTheDocument();
  });

  it('con acciones recientes → se muestran las reales, NO recomendaciones', () => {
    recordDarianAction(
      {
        kind: 'navigation',
        title: 'Abrió inventario',
        viewId: 'inventory',
        storeId: 'store-1',
      } as any,
      'user-a'
    );
    render(<RecentActivityPanel />);
    expect(screen.getByTestId('recent-activity-list')).toBeInTheDocument();
    expect(screen.queryByTestId('recent-activity-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommended-actions-list')).not.toBeInTheDocument();
    expect(screen.getByText('Abrió inventario')).toBeInTheDocument();
  });
});
