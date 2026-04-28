import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredNavigation } from '../useFilteredNavigation';
import { useAuthStore } from '@/store';

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

describe('useFilteredNavigation', () => {
  it('should filter navigation based on user role', () => {
    (useAuthStore as any).mockReturnValue({ user: { role: 'warehouse' } });

    const { result } = renderHook(() => useFilteredNavigation());

    // Warehouse should have access to 'tienda' but not 'estrategico' (Costos)
    const storeModule = result.current.find(m => m.id === 'tienda');
    const costModule = result.current.find(m => m.id === 'estrategico');

    expect(storeModule).toBeDefined();
    expect(costModule).toBeUndefined();

    // Check specific children
    const pos = storeModule?.children?.find(c => c.id === 'punto_venta')?.children?.find(c => c.id === 'pos');
    expect(pos).toBeUndefined(); // warehouse cannot see POS

    const inventory = storeModule?.children?.find(c => c.id === 'almacen_gestion')?.children?.find(c => c.id === 'inventory');
    expect(inventory).toBeDefined();
  });

  it('should show all for admin', () => {
    (useAuthStore as any).mockReturnValue({ user: { role: 'admin' } });

    const { result } = renderHook(() => useFilteredNavigation());

    expect(result.current.find(m => m.id === 'estrategico')).toBeDefined();
    expect(result.current.find(m => m.id === 'tienda')).toBeDefined();
  });
});
