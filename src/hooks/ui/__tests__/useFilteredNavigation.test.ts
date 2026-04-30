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
});
