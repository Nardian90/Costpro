import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { useCostSheetStore } from '@/store/cost-sheet-store';

vi.mock('@/store/cost-sheet-store', () => ({ useCostSheetStore: vi.fn() }));

describe('useAutoSave', () => {
  it('should create a snapshot manually', () => {
    const setSheet = vi.fn();
    (useCostSheetStore as any).mockReturnValue({ data: { id: '1' }, setSheet });
    const { result } = renderHook(() => useAutoSave());
    act(() => { result.current.saveManualSnapshot(); });
    expect(result.current.versions.length).toBe(1);
  });
});
