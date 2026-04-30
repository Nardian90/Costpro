import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredNavigation } from '../useFilteredNavigation';
import { useAuthStore } from '@/store';

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

describe('useFilteredNavigation', () => {
  it('admin ve todos los módulos', () => {
    (useAuthStore as any).mockReturnValue({ user: { role: 'admin' } });
    const { result } = renderHook(() => useFilteredNavigation());
    expect(result.current.find(m => m.id === 'costos')).toBeDefined();
    expect(result.current.find(m => m.id === 'tienda')).toBeDefined();
  });

  it('warehouse ve gestión de almacén pero no POS ni costos', () => {
    (useAuthStore as any).mockReturnValue({ user: { role: 'warehouse' } });
    const { result } = renderHook(() => useFilteredNavigation());
    const storeModule = result.current.find(m => m.id === 'tienda');
    expect(storeModule).toBeDefined();
    expect(result.current.find(m => m.id === 'costos')).toBeUndefined();
  });

  it('rol costo ve el módulo de fichas de costo', () => {
    (useAuthStore as any).mockReturnValue({ user: { role: 'costo' } });
    const { result } = renderHook(() => useFilteredNavigation());
    expect(result.current.find(m => m.id === 'costos')).toBeDefined();
    expect(result.current.find(m => m.id === 'tienda')).toBeUndefined();
  });

  it('rol clerk ve el POS', () => {
    (useAuthStore as any).mockReturnValue({ user: { role: 'clerk' } });
    const { result } = renderHook(() => useFilteredNavigation());
    const storeModule = result.current.find(m => m.id === 'tienda');
    expect(storeModule).toBeDefined();
    const posGroup = storeModule?.children?.find(c => c.id === 'punto_venta');
    expect(posGroup).toBeDefined();
  });
});
