import { describe, it, expect, vi } from 'vitest';
import { useCostSheetStore } from '../cost-sheet-store';
import { renderHook, act } from '@testing-library/react';

vi.mock('zustand/middleware', () => ({
  persist: (config: any) => config,
  createJSONStorage: () => ({}),
}));

describe('cost-sheet-store', () => {
  it('should initialize with the default template data', () => {
    const { result } = renderHook(() => useCostSheetStore());
    // Current template starts with 0 rows in Annex I
    expect(result.current.data.annexes[0].data.length).toBe(0);
  });

  it('should add a row to an annex correctly', () => {
    const { result } = renderHook(() => useCostSheetStore());
    act(() => {
      result.current.addRow('I');
    });
    const annexI = result.current.data.annexes.find(a => a.id === 'I');
    expect(annexI?.data.length).toBe(1);
  });

  it('should update values correctly', () => {
    const { result } = renderHook(() => useCostSheetStore());
    act(() => {
      result.current.addRow('I');
      result.current.updateValue(['annexes', 0, 'data', 0, 'description'], 'Test Product');
    });
    expect(result.current.data.annexes[0].data[0].description).toBe('Test Product');
  });
});
