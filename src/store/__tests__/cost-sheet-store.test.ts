
import { describe, it, expect, vi } from 'vitest';
import { useCostSheetStore } from '../cost-sheet-store';
import { renderHook, act } from '@testing-library/react';

// Mock persist middleware to avoid localStorage issues in tests
vi.mock('zustand/middleware', () => ({
  persist: (config: any) => config,
}));

describe('cost-sheet-store', () => {
  it('should initialize with the default template data', () => {
    const { result } = renderHook(() => useCostSheetStore());
    // The current reinicioTemplate has 4 rows in the first annex (I)
    expect(result.current.data.annexes[0].data.length).toBe(4);
  });

  it('should add a row to an annex correctly', () => {
    const { result } = renderHook(() => useCostSheetStore());

    act(() => {
      result.current.addRow('I');
    });

    const annexI = result.current.data.annexes.find(a => a.id === 'I');
    expect(annexI?.data.length).toBe(5); // 4 (default) + 1 (added)
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
